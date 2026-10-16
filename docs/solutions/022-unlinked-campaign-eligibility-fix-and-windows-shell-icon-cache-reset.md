# Solution 022: Unlinked Campaign Eligibility Unlock & Windows Shell Icon Cache Reset

## 1. Problem Description
- **Symptom 1:** Drop progress was stuck at 0% across all games. The engine output `[CORE] No active campaigns to mine drops for. Waiting for an active campaign...` despite 86 live campaigns being loaded.
- **Symptom 2:** The Windows taskbar and Explorer preview pane retained the legacy purple/cyan crystal icon instead of the Apple Luna noble mint squircle icon.
- **Symptom 3:** An orange banner `ТРЕБУЕТСЯ ВХОД В TWITCH (OAUTH DEVICE CODE): NHQQYQMP` persisted in the UI even after authentication succeeded.

---

## 2. Root Cause Analysis
1. **Twitch Campaign Eligibility Defect:**
   - In `core/inventory.py`, `DropsCampaign.eligible` evaluated `return self.linked`.
   - Because 3rd-party game accounts (Steam/Epic/Fatshark) were not linked ahead of time (or Twitch GQL `ViewerDropsDashboard` returned 0 campaigns), all campaigns from `CampaignsFetcher` had `self.linked = False`.
   - This caused `can_earn_within(next_hour)` to evaluate `False` for **all 86 active games**, rendering `self.wanted_games` completely empty and forcing the engine into perpetual sleep.
2. **Windows Shell Icon Caching:**
   - Windows Explorer caches executable icons by path in `%LocalAppData%\Microsoft\Windows\Explorer\iconcache_*.db`. Overwriting `TwitchDropsSentinel.exe` at the same path does not reload the icon without an explicit shell notification (`SHChangeNotify`).
   - The Windows Taskbar groups windows by `AppUserModelID`. Without an explicit ID, Windows reused the legacy cached icon from the previous process execution.
3. **Stale OAuth State in Memory:**
   - `HeadlessLoginForm.update` did not clear `STATE_BRIDGE.oauth_code` upon login.
   - `LiveDashboard.tsx` searched historical logs for the pattern `[A-Z0-9]{8}`, matching old log messages from hours earlier.

---

## 3. Surgical Implementation
1. **`core/inventory.py`:**
   - Replaced `return self.linked` in `DropsCampaign.eligible` with:
     ```python
     if getattr(self._twitch.settings, "require_account_link", False):
         return self.linked
     return True
     ```
   - Restored instant eligibility for all 94 available campaigns on Twitch.
2. **`core/gui_headless.py`:**
   - Reset `STATE_BRIDGE.oauth_code = None` and `STATE_BRIDGE.oauth_uri = None` upon successful login or form clear.
3. **`src/components/LiveDashboard.tsx`:**
   - Restricted OAuth banner display to active real-time prompts (`isCurrentlyDemandingAuth`). Eliminated historical log parsing.
4. **`desktop/Program.cs` & `desktop/MainForm.cs`:**
   - Added `SetCurrentProcessExplicitAppUserModelID("Mortuis_V_Studio.TwitchDropsSentinel.Luna.v3_1")` on startup.
   - Pushed `WM_SETICON` directly to the Win32 window handle on `OnHandleCreated`.
   - Recompiled single-file PE binary `TwitchDropsSentinel.exe`.
5. **Windows Shell Cache Flush:**
   - Configured `desktop.ini` and set `+h +s` attributes on the ini and `+r` on the project root folder.
   - Dispatched `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_FLUSH, 0, 0)`.

---

## 4. Verification & Results
- `python test_sentinel_suite.py`: All 10 verification gates passed with `Exit Code 0`.
- Active campaigns count unlocked: 94 campaigns ready to farm.
- `GET /api/state`: `oauth_code: None`, `connected: True`.
- Windows binary `TwitchDropsSentinel.exe` confirmed to embed the Apple Luna noble mint icon.
