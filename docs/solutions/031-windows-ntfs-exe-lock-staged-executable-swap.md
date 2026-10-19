# Solution 031: Windows NTFS Executable Lock Bypass & Staged Executable Swap (v3.2.2)

## 1. Problem Description
When users on older versions (e.g. v3.1.x) attempted to update Twitch Drops Sentinel via the built-in GitHub Auto-Updater, the extraction failed with:
```
Ошибка установки: Ошибка установки обновления: [Errno 13] Permission denied: '...\Twitch Drops Sentinel v3.1\TwitchDropsSentinel.exe'
```

## 2. Root Cause Analysis
1. **Windows NTFS PE Loader File Locking**:
   - In Windows, when a process is running from an executable (`TwitchDropsSentinel.exe`), the OS kernel locks the executable file against `GENERIC_WRITE` access.
   - Any attempt to open the file in write mode (`open(target_file, "wb")`) immediately raises `PermissionError: [Errno 13] Permission denied`.
2. **Hot-Patch Archive Packaging in v3.2.1**:
   - In v3.2.1, `TwitchDropsSentinel.exe` was included in `Patch.zip` under the name `TwitchDropsSentinel.exe`.
   - Older clients (v3.1.0 – v3.2.0) running the previous `updater.py` in memory had no executable rotation logic during unzipping and tried to write directly to `TwitchDropsSentinel.exe`, hitting the kernel lock.

## 3. Engineering Solution: Staged Executable Swap

### A. Backward-Compatible Asset Packaging (`tools/create_clean_release.py`)
In `Patch.zip`, the desktop host executable is stored under the name:
```
TwitchDropsSentinel.update
```
Because the filename is `.update` (not `.exe`), older clients running v3.1.x extract it cleanly without any `Permission denied` errors.

### B. Windows NTFS Atomic Rename Mechanism
While Windows NTFS prohibits overwriting a running executable, it **explicitly permits renaming** a running executable if opened with `FILE_SHARE_DELETE`.
```python
old_exe = PROJECT_DIR / "TwitchDropsSentinel.exe.old"
target_exe.rename(old_exe)  # Succeeded even while TwitchDropsSentinel.exe was running!
update_file.rename(target_exe)
```

### C. Multi-Tier Application Lifecycle
1. **In-Flight Application in `updater.py`**:
   Immediately after unzipping the patch, `check_and_apply_pending_exe_update()` atomically renames `TwitchDropsSentinel.exe` -> `TwitchDropsSentinel.exe.old` and renames `TwitchDropsSentinel.update` -> `TwitchDropsSentinel.exe`.
2. **Startup Check in `sentinel_service.py`**:
   When the service supervisor boots, it checks for `TwitchDropsSentinel.update` and applies the swap before launching sub-threads.
3. **Pre-Launch Batch Script (`Запустить_Twitch_Drops_Sentinel.bat`)**:
   Before launching the desktop host, the batch file migrates any pending update:
   ```cmd
   if exist "%~dp0TwitchDropsSentinel.update" (
       move /y "%~dp0TwitchDropsSentinel.update" "%~dp0TwitchDropsSentinel.exe" >nul 2>&1
   )
   ```

## 4. Verification & Results
- Verified NTFS rename behavior empirically on a live running `TwitchDropsSentinel.exe` process (PID 88996) with zero errors.
- Verified test suite: all 32 verification gates passed with Exit Code 0.
- Released v3.2.2 on GitHub Releases with updated binaries.
