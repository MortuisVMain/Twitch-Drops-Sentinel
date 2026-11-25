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
