# 061. The giveaways scheduler showed "Active" with no task behind it

## Symptom
On a fresh install the Giveaways screen showed `● Активен (Вт,Вс)`, but nothing ever ran. Windows Task Scheduler had no
`FreeGamesClaimerStudio` task, and clicking the toggle or the day chips changed nothing.

## Cause
Nothing created the task. It only existed on the developer's PC, registered by hand and pointing at a launcher outside
the repository (`StudioClaimLauncher.bat`), so the problem could not be seen there. Three things hid it elsewhere:
- `isSchedulerActive` was `state !== 'Disabled'`, and a missing task has the state `Unknown`.
- `toggle_scheduler` and `update_scheduler_days` ran their cmdlets with `-ErrorAction SilentlyContinue` or an `if ($t)`
  guard and dropped stderr and the exit code, so the API answered `ok` for a change that never happened.
- `actionError` in `GiveawaysView.tsx` was set but never rendered, so refusals from the backend were invisible too.

## Fix
`_create_task` registers the task when the scheduler is turned on or days are picked and no task exists. Writes check the
exit code and return a `detail` the UI shows. A failed query now returns `queryFailed: true` and blocks writes.

## Non-obvious decisions
- **What the task runs:** `conhost.exe --headless "<node>" "<engine>\runner.js" --scheduled --config ... --log ...`. Paths are resolved
  when the task is created, so they fit wherever this copy of the app lives. `conhost --headless` is there because
  `node.exe` is a console program: in an interactive session it would open a window for the whole run. S4U logon would
  avoid that, but stores that force a visible browser need the user's desktop.
- **An existing task keeps its action.** `Register-ScheduledTask` runs without `-Force`, and day changes only replace the
  trigger, so a user's own launcher survives.
- **`runner.js` installs the browser engine itself.** `start_claim` did this only for a manual run, so a first scheduled
  run on a clean machine would have failed on every store with a missing module.

- **The store choice is read when the task runs.** `runner.js --scheduled --config <config.json>` reads
  `giveaways_selected_stores`, so changing stores needs no scheduler write. The choice used to live only in the WebView's
  `localStorage`; `GiveawaysView` now also saves it to `config.json`. No file or no key means the defaults the UI shows. A
  damaged config cancels the run, because guessing could claim in a store the user turned off.
- **The run log is `<app folder>\giveaways_scheduled.log`**, UTF-8, started over at every run, so its size stays that of one
  run. `--log` gives children the file directly, so their output lands there too.
- **`conhost --headless` does not pass the exit code on:** a task of this app reports `LastTaskResult` 0 even when node exits
  with 1. `lastRunFailed` therefore also looks at the log: runner.js ends a failed run with a `[SENTINEL] ✕` line. A store
  that fails on its own is not a failed run, the runner moves on to the next one.
- **Paths are checked at service start** (`repair_task_paths`, skipped in `SENTINEL_TEST_MODE`, otherwise the suite's sandbox
  path could reach a real task). Only the action changes, so the days stay. A task whose action is not `conhost.exe` with
  `runner.js` is the user's own and is left alone. A failure is logged and shown as `repairError`.

## Node.js missing or below 20
- Turning the schedule on or picking days: refused with a message, no task is created.
- Scheduled run with an old Node.js: the log explains it and the UI shows that the last run failed.
- Node.js removed after the task was created: the task cannot start and writes no log. The next service start shows
  `repairError`.

## Known limits
- Paths are repaired only when the service starts, and the task stays broken until then.
- A run that was killed (time limit, shutdown) leaves a log without the `✕` line and is not reported as failed.
- A store that fails during a run is visible only in the log.
- Every run overwrites the log, so only the last run can be read.
- Running a non-test service from another checkout re-points a task created by this app to that checkout.

A store that exits with an error adds a last `[SENTINEL] ✕` line, because conhost hides the exit code. A run killed by the task's
time limit writes no such line and still looks fine. The startup repair leaves a task alone while the `runner.js` it names still
exists, since that is another live install and not a moved one.

## Tests
Gates `test_scheduler_task_is_created_on_a_clean_install` and `test_scheduler_refuses_an_old_node_and_task_paths_follow_the_install`
(fake `powershell.exe`, the real scheduler is never touched), `test_engine_installs_itself_for_a_scheduled_run` (fake `npm`/`npx`)
and `test_scheduled_run_collects_selected_stores_and_writes_a_log` (real `runner.js`, stub stores, a temporary config). The
fake never showed the conhost exit code problem: only a real task did. The PowerShell itself was checked by hand against
the real scheduler under a throwaway task name, from a folder with spaces, an apostrophe and Cyrillic in its path.
