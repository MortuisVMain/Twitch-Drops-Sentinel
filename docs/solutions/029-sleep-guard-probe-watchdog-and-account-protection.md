# Solution 029: Sleep Guard Watchdog, WebSocket Probe Watchdog & Account Protection

## Context & Symptoms
In Twitch Drops Sentinel v3.1 running on Windows 10/11 laptops and desktops:
1. **Sleep / Hibernation Timing Drift:** When laptops entered sleep/Modern Standby, upon waking up, the watch loop computed `step_elapsed = now - last_loop_timestamp` as thousands of seconds. This caused immediate false-positive 15-minute streamer cooldowns and 30-minute game bans.
2. **Half-Open TCP Sockets on Network Drift:** When users toggled VPNs or Wi-Fi networks dropped, the WebSocket connection entered a half-open TCP state. Without active probes, the OS socket would hang for up to 15 minutes before triggering an error.
3. **Unbounded Log Growth:** In `desktop/MainForm.cs`, stdout and stderr logs (`sentinel_stdout.log`, `sentinel_stderr.log`) appended continuously without rotation, causing disk bloat on long-running installations.
4. **Unlinked Campaign Farm Traps:** Campaigns requiring game account connection (`includesMWRequirement: true`) were being farmed ahead of linked games, resulting in wasted hours without drop progress.
5. **No 1-Click Twitch Account Switching:** Users had to manually locate and delete `cookies.jar` to change accounts.
6. **Windows SmartScreen Popups:** Downloaded ZIP releases retained the Windows Zone.Identifier (Mark-of-the-Web), causing SmartScreen warnings on first run.

## Root Cause Analysis
1. `step_elapsed` in `core/twitch.py` did not differentiate between wall-clock sleep gaps and active watch execution time.
2. Twitch PubSub ping intervals are several minutes; during network interface changes, TCP keepalive does not notice severed connections without active probes.
3. C# host lacked a file size threshold check when writing log lines.
4. Channel/campaign prioritization in `switch_priority` only checked `get_priority(ch)` without checking `active_camp.linked`.

## Key Implementations & Surgical Architecture
1. **Sleep Guard in `core/twitch.py`:**
   - Detects `raw_step_elapsed > 60.0s`.
   - Clamps `step_elapsed = 20.0s`.
   - Compensates `streamer_watch_start += sleep_gap` (`sleep_gap = raw_step_elapsed - 20.0`), preserving the real active watch time and preventing false-positive watchdog penalties.
2. **WebSocket Heartbeat Watchdog in `core/websocket.py`:**
   - Tracks `self._last_msg_time` and `self._probe_sent`.
   - When idle >45s (`now - self._last_msg_time > 45.0`): sends active probe PING and sets 10s PONG deadline, catching dead sockets within 10s instead of 15 minutes.
3. **Log Rotation in `desktop/MainForm.cs`:**
   - Implemented `writeRotatedLog`: checks if file size exceeds 5 MB (`fi.Length > 5 * 1024 * 1024`), archives to `.old`, and keeps logs bounded.
4. **Linked Campaign Prioritization & Warning Badge:**
   - In `switch_priority`: checks `is_linked = getattr(active_camp, "linked", True) if active_camp else True`, prioritizing linked games (`0 if is_linked else 1`).
   - Propagated `is_account_connected` and `account_link_url` to `all_catalog_games`.
   - In `src/components/GameShelf.tsx`: added amber warning badge `⚠️ Требуется привязка` with direct link to Twitch Connections.
5. **Twitch Account Switcher (Logout):**
   - Added `POST /api/auth/logout` endpoint in `core/sentinel_service.py`: invalidates auth, purges `cookies.jar`, resets state bridge, and triggers `State.RESTART` to launch fresh OAuth flow.
   - Added "Сменить аккаунт" button in `src/components/SettingsStudio.tsx` with confirmation modal.
6. **SmartScreen Suppression:**
   - Added PowerShell `Unblock-File` routine to `Запустить_Twitch_Drops_Sentinel.bat`.
   - Added SmartScreen FAQ to `ИНСТРУКЦИЯ.md`.

## Verification
- Verified by Gate 29 in `test_sentinel_suite.py`.
- All 29 verification gates passed with Exit Code 0.
