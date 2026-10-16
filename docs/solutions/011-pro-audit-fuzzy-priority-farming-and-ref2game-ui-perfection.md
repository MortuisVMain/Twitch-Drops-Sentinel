# Solution 011: Lead Architecture & Systems Pro Audit: Fuzzy Priority Farming, ref2game UI Perfection & Desktop Hardening

## 📌 Context & Problem Statement
Following user report of erratic drops farming ("собирает вообще не то что выставленно в приоритет"), UI discrepancies (hardcoded mock data, broken Settings tab switch), and desktop executable anomalies, a comprehensive audit was executed by the **Lead Architecture & Systems Auditor (Model: "pro")** alongside the primary agent.

Key root-cause findings:
1. **Farming Wrong Campaigns (e.g. World of Warships 'Week 4: 250 Community Tokens'):**
   - In `core/twitch.py` (`State.GAMES_UPDATE`), priority matching checked `c.game.name in priority` strictly. When Twitch API titles differed from user configurations (e.g., `"Hunt: Showdown 1896"` vs `"Hunt: Showdown"`, `"The Witcher 3: Wild Hunt"` vs `"The Witcher 3"`), the match failed and assigned `MAX_INT` priority.
   - Under `priority_mode=1` (`ENDING_SOONEST`), campaigns ending earliest were sorted to the top. Because user games were relegated to `MAX_INT`, random ending-soonest campaigns (like World of Warships ending in 20 minutes) took top priority over user favorites!
   - In `State.CHANNELS_FETCH`, channel stream lookups also used strict string comparison against `self.settings.priority`, bypassing early watching triggers.

2. **UI Data Binding & Tab Routing Discrepancies:**
   - In `src/components/LiveDashboard.tsx`, the campaign shelf was built from static `DEFAULT_CAMPAIGNS` (hardcoded 74% Witcher, 100% Rust, etc.) instead of dynamic bindings from `settings.priority_games` and live `activeDrop`.
   - The "Настройки" (Settings) button in `LiveDashboard.tsx` erroneously called `onGoToShelf()` instead of navigating to `SettingsStudio` (`'settings'`).
   - The header power switch ("Daemon Active/Paused") only toggled local React state without persisting pause state to the Python backend.

3. **Desktop Host (C#) & WebView2 Runtime Hardening:**
   - `desktop/MainForm.cs` spawned `python.exe` with redirected standard I/O streams but did not read them asynchronously, introducing potential pipe-buffer deadlock when child logs reached ~4KB.
   - Dual invocation of `EnsurePythonBackendRunning()` in `MainForm` constructor.
   - WebView2 user data cache caused UI refresh lagging; resolved with virtual host cache buster and single-file bundling.

---

## 🛠️ Implemented Architecture & Surgical Solutions

### 1. Fuzzy Priority Matching Engine (`core/twitch.py`)
- Implemented `_fuzzy_priority(name: str) -> int` supporting bidirectional case-insensitive substring search (e.g. `"hunt"` matching `"Hunt: Showdown 1896"`, `"witcher"` matching `"The Witcher 3: Wild Hunt"`).
- In `State.GAMES_UPDATE`, ensured Python's stable `list.sort()` places all user priority games at the very beginning of `sorted_campaigns` before evaluating `ends_at` tiebreakers.
- Updated `State.CHANNELS_FETCH` early exit check:
  ```python
  if any(ch.online and ch.game and any(p.lower() in ch.game.name.lower() or ch.game.name.lower() in p.lower() for p in self.settings.priority) for ch in new_channels):
      break
  ```

### 2. Live ref2game UI Dynamic Bindings (`src/components/LiveDashboard.tsx` & `src/App.tsx`)
- Dynamically build `campaigns` from `settings.priority_games` as the source of truth, enriched with domain emoji badges and gradients.
- Bound live `activeDrop` directly to matching priority campaign, displaying real-time progress percentages, watch channels, and time remaining.
- Connected the "Настройки" action button to `onGoToSettings()` (`handleTabChange('settings')`).
- Hooked up Luna Auto-Shutdown mode toggle ('shutdown', 'sleep', 'lock') directly in the telemetry card.
- Implemented `/api/toggle-daemon` in `core/sentinel_service.py` with `self.force_paused` so manual pause from UI controls backend farming state.

### 3. Desktop Single-File EXE & Async Pipe Logging (`desktop/MainForm.cs` & `.csproj`)
- Configured `<WebView2LoaderPreference>Static</WebView2LoaderPreference>` and `<PublishSingleFile>true</PublishSingleFile>`.
- Hooked up `OutputDataReceived` and `ErrorDataReceived` in `MainForm.cs`, piping stdout to `sentinel_stdout.log` and stderr to `sentinel_stderr.log` via `BeginOutputReadLine()`, eliminating pipe buffer deadlock.
- Implemented `ClearBrowsingDataAsync(CacheStorage | DiskCache)` on WebView2 initialization.

---

## 🧪 Verification & Acceptance Criteria
- `test_audit_fixes.py`: 100% PASS on fuzzy matching, priority ordering, and strict priority-only modes.
- `test_sentinel_suite.py`: ALL 8 verification gates passed with exit code 0 (Binary size 112.8 MB, 138 Games, Trophies Vault, Hardware Guard, Core REST API, PRD Structure, Brand Signature, Streamless Contract).
- `dotnet publish` & `npm run build`: Exit Code 0.
