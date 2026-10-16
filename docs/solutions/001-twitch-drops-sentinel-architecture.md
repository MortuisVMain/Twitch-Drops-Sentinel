# Solution 001: Headless Decoupling of Twitch Streamless Core & WebView2 Native Host

## Context & Problem
The legacy Twitch Drops Miner application relied heavily on Tkinter running inside an asyncio event loop (`dooneevent(DONT_WAIT)`). When rewriting the application to match the modern Apple Liquid Glass / Luna design aesthetic (React 19 + Tailwind CSS v4 + WebView2 .NET 10), directly importing or embedding the old GUI caused Tkinter dependency crashes, window flashes, thread-blocking modal dialogs, and conflicting window hierarchies.

## Solution Architecture
1. **Headless Adapter (`gui_headless.py`)**:
   - Replaced Tkinter GUI manager with an event-driven `HeadlessGUIManager` implementing the exact interface contract (`progress`, `tray`, `status`, `channels`, `inv`, `close_requested`).
   - Telemetry from streamless GQL queries and WebSocket channels is captured into an in-memory thread-safe `STATE_BRIDGE` singleton.
2. **Local Async Microservice (`core/sentinel_service.py`)**:
   - Runs `aiohttp.web` on `127.0.0.1:28492` exposing `/api/state`, `/api/settings`, `/api/claim`, and `/ws`.
   - Concurrently executes the Hardware Guard sensor (monitoring 138 installed games via `psutil`) and the Luna Auto-Shutdown loop.
3. **C# .NET 10 / WebView2 Monolithic Executable (`desktop/TwitchDropsSentinel.csproj`)**:
   - Native Windows Forms WebView2 host compiled with `/p:PublishSingleFile=true`.
   - DWM immersive dark mode title bar (`DwmSetWindowAttribute`), system tray icon with minimize-to-tray and restore.
   - Virtual host mapping `SetVirtualHostNameToFolderMapping("app.sentinel", ...)` cleanly hosts the React 19 singlefile bundle with 60 FPS hardware acceleration.
4. **Trophy Vault & WinRT Toasts**:
   - Drops claims append directly to `Trophies.md` and trigger native Windows 10/11 toasts via WinRT PowerShell.

## Verification
- Verified by `test_sentinel_suite.py` with exit code 0 across all 7 verification gates.
- Monolithic binary `TwitchDropsSentinel.exe` (112.59 MB) runs with zero external dependencies.
