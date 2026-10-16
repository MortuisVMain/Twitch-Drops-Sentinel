# Solution 002: Headless Twitch Contract Hardening & Native Host Lifecycle Integration

## Context & Problem
During deep code audit and runtime tracing of Twitch Drops Sentinel v3.0, five critical silent failures were identified in the Python streamless core and host integration:
1. `Settings.dump` AttributeError: `Twitch.run()` accesses `self.settings.dump` on line 1, which raised an `AttributeError` when `Args` omitted `dump`, silently killing the Twitch mining loop on startup.
2. Missing GUI Interface Methods: Tkinter decoupling left `login_form`, `channels`, `inv`, and `websockets` without essential methods (`update`, `display`, `remove`, `add_campaign`), crashing cookie validation, campaign parsing, and channel stream state tracking.
3. Import resolution for `gui`: `inventory.py` imported `from gui import send_toast_msg`, which crashed due to the missing `gui.py` module alias.
4. Heavy folder scanning blocking asyncio: Synchronous globbing of directories on disk blocked the `aiohttp` event loop, causing HTTP timeouts.
5. Host process isolation: `TwitchDropsSentinel.exe` didn't auto-spawn `sentinel_service.py` if not running.

## Implemented Solutions
1. **Settings Namespace Completion (`sentinel_service.py`)**:
   - Explicitly defined `dump = False`, `debug_ws = 0`, and `debug_gql = 0` in `Args`.
2. **Headless Interface Contract (`gui_headless.py` & `gui.py`)**:
   - Implemented `HeadlessLoginForm` (`update`, `clear`, `ask_enter_code`, `config`).
   - Implemented `HeadlessInventory.add_campaign(campaign)` as an async coroutine populating `STATE_BRIDGE.games_with_drops`.
   - Implemented `HeadlessChannels.display(channel, add=True)` and `.remove(channel)`.
   - Implemented `HeadlessWebsockets` (`update`, `remove`, `clear`).
   - Created `core/gui.py` aliasing `gui_headless` to satisfy any legacy internal imports.
3. **Non-Blocking Background Auto-Scanner**:
   - Offloaded disk globbing of `E:\Games` and `E:\Games Cracked` into `asyncio.to_thread` with a startup grace delay, maintaining sub-millisecond REST API response times.
4. **Desktop Host Lifecycle Management (`MainForm.cs`)**:
   - `EnsurePythonBackendRunning()` checks `http://127.0.0.1:28492/api/state` upon startup and spawns a hidden background Python daemon if not running.
   - `ShutdownBackend()` terminates the child daemon process when the user closes the application.
5. **Apple Web Audio Chime & 1s Bento Grid Countdown**:
   - Web Audio API harmonic bell chime synthesized directly in `App.tsx` on drop claim.
   - 1-second interval timer provides smooth countdown precision down to the second in `LiveDashboard.tsx`.

## Verification
- Extended `test_sentinel_suite.py` with gate 8 (`test_streamless_engine_contract`), validating the entire streamless Twitch contract.
- All 8 verification gates pass cleanly with exit code 0.
- Monolithic standalone `TwitchDropsSentinel.exe` compiled and verified.
