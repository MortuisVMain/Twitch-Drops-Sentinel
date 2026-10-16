# Solution 021: Portable Runtime Tkinter Fix, Apple Luna 2.0 Dashboard Rebuild & Icon Deployment

## Symptom
1. Running `TwitchDropsSentinel.exe` resulted in the UI hanging indefinitely on "Инициализация Sentinel & опрос Twitch API..." and empty console logs.
2. Dashboard cards retained outdated cyberpunk/neon purple styles, a radioactive neon green claim button (`#00f59b`), and `Uptime: NaNh NaNm NaNs`.
3. An obsolete debug HUD footer (`ref2game UI Contract`) was visible at the bottom of the dashboard, and lower feature strips had broken text and misaligned icons.
4. The project folder and application window icons were not universally set in Windows Explorer.

## Root Causes
1. **Tkinter in Headless Embedded Python:** `core/utils.py` contained an obsolete `import tkinter as tk` and `from PIL.ImageTk import PhotoImage` from the legacy upstream Tkinter GUI. The embedded Python runtime (`portable_runtime\python\python.exe`) used by `MainForm.cs` lacks Tkinter, causing `sentinel_service.py` to crash immediately on startup with `ModuleNotFoundError: No module named 'tkinter'` every 2 seconds.
2. **Missing `total_farm_hours` in Initial State:** `useSentinelState.ts` did not define `total_farm_hours` in `INITIAL_STATE`, causing `uptimeSeconds` to evaluate to `undefined * 3600 = NaN`.
3. **CSS Class Name Mismatch:** `App.tsx` referenced `features-strip` and `tip-strip`, while `index.css` defined `.apple-features-strip` and `.apple-tip-strip`.
4. **Missing Windows Explorer Folder Icon Setup:** The root directory lacked `icon.ico` and `desktop.ini` configured with `attrib +r` on the folder and `attrib +h +s` on `desktop.ini` as specified by Rule 28.

## Surgical Fixes
1. **Eliminated Tkinter & Hardened PIL:**
   - Removed `tkinter`, `PhotoImage`, `Image_module`, and `set_root_icon` from `core/utils.py`.
   - Guarded `PIL` and `PhotoImage` imports in `core/cache.py` with `try/except (ImportError, ModuleNotFoundError)`.
2. **Apple Luna 2.0 Dashboard Rebuild:**
   - Updated `.bento-card` to use `--surface` (`#202725`), `--line` (`#303a35`), and `15px` radius with noble mint hover accents.
   - Converted `.shelf-item` and `.shelf-badge` from neon purple (`rgba(145, 70, 255)`) and cyan to Apple Luna mint tokens.
   - Refactored `.progress-bar-fill` from neon gradient (`#772ce8 -> #00f2fe`) to noble mint (`#368873 -> #73bba5`).
   - Replaced radioactive green `.btn-claim` (`#00f59b`) with noble mint (`background: #368873; color: #ffffff`).
   - Fixed Uptime NaN with `Math.max(0, Math.floor((stats?.total_farm_hours || 0) * 3600))` and `isNaN` guards.
   - Removed `<footer className="qa-hud">` from `LiveDashboard.tsx`.
   - Unified `.features-strip` and `.tip-strip` styling in `src/index.css`.
3. **Universal Icon Deployment:**
   - Generated multi-resolution `icon.ico` (256, 128, 64, 48, 32, 24, 16 px) in Apple Luna squircle design.
   - Created `desktop.ini` and set `attrib +r` on the project root and `attrib +h +s` on `desktop.ini`.
   - Updated `desktop/MainForm.cs` `LoadAppIcon()` to search all candidate relative paths.
   - Rebuilt `TwitchDropsSentinel.exe` with embedded icon resources.

## Verification
- `npm run build` -> Singlefile bundle 456.73 KB generated cleanly.
- `dotnet publish` -> `TwitchDropsSentinel.exe` (112.47 MB) compiled with Exit Code 0.
- `portable_runtime\python\python.exe core\sentinel_service.py` -> Successfully binds to `http://127.0.0.1:28492/api/state`.
- `python test_sentinel_suite.py` -> All 10 verification gates passed with Exit Code 0.
