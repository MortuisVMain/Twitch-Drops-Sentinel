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
- **What the task runs:** `conhost.exe --headless "<node>" "<engine>\runner.js" --headless --claim ...`. Paths are resolved
  when the task is created, so they fit wherever this copy of the app lives. `conhost --headless` is there because
  `node.exe` is a console program: in an interactive session it would open a window for the whole run. S4U logon would
  avoid that, but stores that force a visible browser need the user's desktop.
- **An existing task keeps its action.** `Register-ScheduledTask` runs without `-Force`, and day changes only replace the
  trigger, so a user's own launcher survives.
- **`runner.js` installs the browser engine itself.** `start_claim` did this only for a manual run, so a first scheduled
  run on a clean machine would have failed on every store with a missing module.

## Known limits
- The task stores absolute paths. If the app folder moves or Node.js changes location, the task keeps the old ones until
  it is deleted and created again.
- The task claims the default store list, not the stores selected in the UI.
- A scheduled run writes no log file: the output of the hidden console goes nowhere.

## Tests
Gates `test_scheduler_task_is_created_on_a_clean_install` (fake `powershell.exe`, the real scheduler is never touched) and
`test_engine_installs_itself_for_a_scheduled_run` (fake `npm`/`npx`). The PowerShell itself was checked once by hand against
the real scheduler under a throwaway task name, from a folder with spaces, an apostrophe and Cyrillic in its path.
