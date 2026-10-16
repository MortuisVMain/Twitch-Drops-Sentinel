# Solution 007: Legacy v2 Autostart Cleanup and Migration to v3.0

## Context & Problem
User noticed that an older legacy version (`Twitch Drops Sentinel v2.0.0 [Mortuis_V_Studio]` based on Tkinter/DevilXD) was automatically launching on Windows startup, appearing in the system tray and throwing websocket/GQL conflict errors (`GQLException: notification not found: deleteNotification`). Meanwhile, the new version `Twitch Drops Sentinel v3.0 [Apple Liquid Glass Edition]` was also running, leading to dual-instance conflicts for Twitch Drops session tokens and socket events.

## Root Cause
- Windows Startup directory (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`) contained a shortcut `TwitchDropsSentinel.lnk` targeting:
  `C:\AI Local Projects\Scripts\TwitchDropsMiner\start_sentinel_silent.bat`
- `start_sentinel_silent.bat` launched `pythonw sentinel.py` (v2 daemon), which spawned `core/main.py --tray --log` (the v2 GUI).
- Every Windows boot triggered this legacy shortcut in the background.

## Solution Architecture & Actions
1. **Audited Process Hierarchy**:
   - Identified PID 38388 (`pythonw sentinel.py`) and child PID 76732 (`pythonw core/main.py --tray --log`).
   - Confirmed both were spawned by legacy scripts in `Scripts\TwitchDropsMiner\`.
2. **Surgical Process Termination**:
   - Forcibly terminated PID 76732 and PID 38388 using PowerShell `Stop-Process -Force`.
   - Verified 0 remaining processes tied to `TwitchDropsMiner`.
3. **Autostart Migration to v3.0**:
   - Removed the legacy `TwitchDropsSentinel.lnk` from `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`.
   - Created a clean, native shortcut pointing to:
     - Target: `C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3\TwitchDropsSentinel.exe`
     - Working Directory: `C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3`
     - Icon: `TwitchDropsSentinel.exe,0`
4. **Verification**:
   - Confirmed shortcut properties via `WScript.Shell`.
   - Verified `Twitch Drops Sentinel v3.0` API (`127.0.0.1:28492/api/state`) is live and operational with 0 socket clashes.
