# 080. The host watchdog restarted a slow service and looped the Twitch sign-in

## Symptom
On a fresh install on a friend's PC: a new Twitch device code and a new browser tab every few seconds, "Локальный сервис Hell Harvest недоступен" on the dashboard, the code visible only in a notification and never valid long enough to enter. A full reinstall did not help.

## Root cause (likely; not yet confirmed from that user's logs)
- The host (`desktop/MainForm.cs`) checks `GET /api/state` on a timer. Before 4.0.1 the check had an **800 ms** timeout and restarted the Python service after **one** failed check.
- On a slow PC the service answers slower than that while it starts (imports, first Twitch requests). The watchdog killed it and started a new one.
- Every service start begins the Twitch device-code sign-in again: `HeadlessLoginForm.ask_enter_code` (`core/gui_headless.py`) gets a new code, sends a toast and opens the browser. So each restart produced a new code and a new tab, and the restarts never let the service finish starting.
- Confirmation needs the user's `sentinel_stdout.log`: many "API running on" lines a few seconds apart.

## Fix (v4.0.1, PR #61)
`desktop/MainForm.cs`, watchdog tick:
- `BackendStartGrace = 60 s` after the host started the process: no restart while it is still starting.
- `BackendFailuresBeforeRestart = 4`: a running process is restarted only after four failed checks in a row; one success resets the count.
- The health request timeout is 3 s instead of 800 ms.
- `_watchdogBusy` skips a tick while the previous check is still running, so one slow check is not counted twice.
- A process that has exited is still restarted at once.

Later releases make the loop visible: the health check counts new Twitch codes in 10 minutes and fails at 3 (`core/health.py`, `OAUTH_CODES`), and the health center can collect sanitized logs into a ZIP.

## Pitfalls
- A restart of the service is never free: it restarts the Twitch sign-in, the farm and the giveaways. Treat "slow" and "dead" differently in any watchdog.
- When you change the start path of the service, check how long the first answer takes on a slow machine, not only on the dev PC.

## Correction (4.2.1)
The claim above that 4.0.1 fixed the loop was wrong: it hardened only the watchdog tick. A second, self-feeding path stayed in `desktop/MainForm.cs`:
- The process `Exited` handler ran `Task.Delay(2000).ContinueWith(_ => EnsurePythonBackendRunning())` on a thread-pool thread, with no lock, next to the UI-thread watchdog.
- `EnsurePythonBackendRunning()` did its own 400 ms `GET /api/state`; on a miss it killed the tracked process (`Kill(true)`), cleared port 28492 (`CleanupStalePort28492`, any python on it) and started a new one.
- So any exit led, 2 s later, to a 400 ms check against the new, still-starting service: it was killed and replaced, its `Exited` fired, and the cycle repeated forever. Races on `_pythonBackendProcess` also orphaned processes, so several services were alive at once.

Numbers from a user's logs (a version before 4.0.1), 8 minutes: the Python service started **489 times** (every 1.5-2 s), **37** new Twitch device codes and browser tabs, **134** "port 28492 already in use" bind failures, and **37** crashes at import from concurrent writes of `core/lang/English.json`.

Fix (4.2.1):
- `desktop/BackendRestartPolicy.cs` is the only owner of "start or restart": a pure class (no WinForms, no `Process`) fed with events (health check, started, start failed, exited) that returns a decision (none, start, kill and start, backoff). `MainForm` only executes decisions on the UI thread.
- The `Exited` handler only posts the pid to the UI thread; it never restarts. Exits of processes the host killed itself (marked before the `Kill`) and of any process that is not the tracked one are ignored. A genuine exit of the current process starts one new service.
- A failing check never kills a running process: only the watchdog rule does, after the 60 s start grace and 4 failed 3 s checks in a row. The startup probe (400 ms) only starts a service when nothing is tracked and nothing answers.
- Starts are single-flight (one in flight at a time). The stale-python cleanup of the port runs only on a cold start or after a crash pause, never right after the host started its own process.
- Crash backoff: 3 exits within 30 s of the start in a row pause the restarts for 60 s (the Service restarts row of the diagnostics says "the service crashes at start"), then one retry; a run that lives over 30 s resets the counter.
- Defence in depth: `HeadlessLoginForm.ask_enter_code` opens the activation tab at most once per 10 minutes; the toast and the state still update for every code.
- Checks: `tools/service_diagnostics_check` replays the storm (start A, A crashes, B starts, B must not be killed 2 s later), the single-flight rule, the 4-failure rule, the backoff and its reset; `core/test_headless_login_browser.py` covers the tab throttle.
- Side finding: installs lacked `config.default.json` ("config.default.json is not readable" on every start). The release script generated a `config.json` but never copied the template, and the hot patch carried only the exe, `core/`, `dist/` and similar folders. Both archives now ship it.

Pitfall: never let a process-exit callback call back into the code that starts processes; route it to one owner and let that owner decide, with a memory of recent crashes.
