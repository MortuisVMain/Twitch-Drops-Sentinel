# 081. "Restart" closed the app, and exit killed Steam IDLE mid-unlock

## Symptom
- The Restart button (RESTART_APP / RESTART_SENTINEL) sometimes only closed the window: no new copy came up.
- On exit the host killed the Python service 2.5 s after asking it to stop, even when Steam IDLE was still releasing games and running its unlock (budget 19 s).

## Root cause
- `desktop/MainForm.cs` restart handler: `ShutdownBackend()`, `Process.Start(exe)`, `Environment.Exit(0)`. The single-instance mutex `Global\TwitchDropsSentinel_v3_Mutex` is released only in `Program.Main`'s `finally`, which `Environment.Exit` skips; the OS frees it only when the old process is gone.
- The child reaches the mutex check in `Program.cs` while the parent still lives, sees `isNewInstance=false`, goes through `TryReplaceOlderCopy` -> `StartConflict.Resolve`, which skips copies in its own folder and returns `WakeExisting`. It signals the dying window and exits. Whether the restart works depends on who wins the race.
- `ShutdownBackend()` waited a fixed `WaitForExit(2500)` and then `Kill(true)`, while `core/steam_idle/controller.py` `SHUTDOWN_BUDGET_SECONDS` is 2 x 3 + 12 + 1 = 19 s.

## Fix
- `desktop/RestartHandoff.cs`: the restart passes `--restarted`; a child started with it that does not own the mutex waits for it (12 s, `WaitOne`), and `AbandonedMutexException` counts as acquired (the parent exits without releasing). On timeout it logs and falls back to the old path.
- `BackendShutdownWait.For(accepted)`: 21 s when `/api/shutdown` returned success, 2.5 s otherwise. `WaitForExit` returns as soon as the service is gone, so a normal exit is still fast.
- `ShutdownBackend()` hides the window first, so a long graceful wait does not look like a frozen window.
- Check: `tools/restart_handoff_check` (marker parsing, wait decision, free / held / abandoned mutex, wait durations).

## Pitfalls
- `Environment.Exit` skips `finally` blocks: anything released there (mutexes, files) stays held until the process is really gone. A child you start right before it must not assume the lock is free.
- Keep the host's kill timeout in step with the service's own shutdown budget; when one changes, check the other.
