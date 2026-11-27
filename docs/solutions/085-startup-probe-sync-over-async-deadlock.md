# 085. 4.4.0 froze at start: an async probe awaited on a blocked UI thread

## Symptom
After the update to 4.4.0 the window stayed black with a spinner. No Python service process, nothing listening on 28492, no line in `sentinel_stdout.log` after the update's shutdown, no `crash.log` or `desktop_errors.log`. The host process was alive and frozen.

## Root cause
4.4.0 moved the liveness checks to a light `GET /api/ping` through a new `async` helper (`ProbeServiceAsync`). The startup check in `desktop/MainForm.cs` runs on the UI thread and blocked on it synchronously: `ProbeServiceAsync(ct).GetAwaiter().GetResult()`. The `await` inside the helper had no `ConfigureAwait(false)`, so its continuation was posted to the WinForms `SynchronizationContext`, that is to the very thread that was blocked waiting for it. Classic sync-over-async deadlock: the startup check never returned, so the service was never started and no timer (watchdog, updater) ever ran.

Before 4.4.0 the startup check called `HttpClient.GetAsync(...).GetAwaiter().GetResult()` directly; HttpClient's own awaits do not capture the context, so it worked. Wrapping that call in our own `async` method is what broke it. A pre-merge review even judged the sync wait safe for that reason.

Not caught because no test ran the host: Python/node/C# checks all passed, and the app was not started before the release.

## Fix (4.4.1)
- `desktop/ServiceProbe.cs`: the probe as a small static class, every `await` with `.ConfigureAwait(false)`.
- `tools/service_probe_check`: runs the probe blocked on a thread whose `SynchronizationContext` never pumps (like a blocked UI thread), against a live listener and a closed port; fails if it does not return within 5 s. It failed on the 4.4.0 code and passes now.
- Suite gate: every await in `ServiceProbe.cs` is `ConfigureAwait(false)`.
- 4.4.0 cannot update itself (the service with the updater never starts): users install 4.4.1 with the setup over it.

## Pitfalls
- Never block the UI thread (`.Result`, `.Wait()`, `.GetAwaiter().GetResult()`) on your own `async` method unless every await in it is `ConfigureAwait(false)`; better, make the caller async.
- Before a release that touches the host's start path, start the built app once and see the dashboard, not only the tests.
