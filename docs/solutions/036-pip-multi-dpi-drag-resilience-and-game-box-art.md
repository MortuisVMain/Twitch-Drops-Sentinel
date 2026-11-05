# Solution 036: PiP Mode Multi-DPI Drag Resilience & Game Box Art HUD Integration

## Context & Problem
In Twitch Drops Sentinel v7.0, two usability issues were identified in Picture-in-Picture (PiP) mode (`Ctrl+M`):
1. **Multi-DPI Scaling Glitch during Window Drag:**
   When dragging the PiP mini-cockpit across multiple monitors with different DPI scalings (e.g., 100% ↔ 125% ↔ 150% ↔ 200%), WinForms `base.WndProc` handling of `WM_DPICHANGED` executed internal `SetBoundsCore` calls that clashed with manual `SetWindowPos` resizes during Windows' modal drag loop (`WM_NCLBUTTONDOWN`). This caused jittery double-resizes, drifting aspect ratios, and squished button layouts.
2. **Missing Game Visual Context in PiP Cockpit:**
   PiP mode only displayed circular percentage progress, leaving out the game box art / cartridge thumbnail of the currently farming drop.

## Root Cause Analysis
1. In `desktop/MainForm.cs`, `WM_DPICHANGED` called `base.WndProc(ref m)` before attempting to enforce PiP boundaries. Calling `base.WndProc` in .NET 8 WinForms triggers internal DPI layout logic using Windows' suggested `rect`, which interfered with the drag state. Additionally, `WM_EXITSIZEMOVE` (0x0232) was not trapped to verify and snap the window dimensions once the user released the mouse on the target monitor.
2. In `src/App.tsx`, the PiP top row (`.pip-top-row`) was limited to a 2-column grid (`72px 1fr`) without a dedicated box art slot.

## Surgical Implementation
1. **Win32 `WM_DPICHANGED` & `WM_EXITSIZEMOVE` Hardening (`desktop/MainForm.cs`):**
   - Added P/Invoke for `GetDpiForWindow(IntPtr hWnd)` and `WM_EXITSIZEMOVE = 0x0232`.
   - When `_isPipMode` is active during `WM_DPICHANGED`, `base.WndProc` is bypassed; the window is sized directly via `SetWindowPos` to `560 * newDpiScale` by `275 * newDpiScale` without fighting the modal loop.
   - On `WM_EXITSIZEMOVE`, the native host queries `GetDpiForWindow`, verifies monitor DPI, and snaps to exact dimensions if any drift occurred during the drag.
   - Synchronized `WM_GETMINMAXINFO` `ptMinTrackSize.y` from 200 to `180 * dpiScale` to match `MinimumSize`.
2. **Game Box Art HUD & CSS Layout (`src/App.tsx` & `src/index.css`):**
   - Imported `resolveGameBoxArt` in `src/App.tsx` and computed `activeGameBoxArt` memo based on `activeDrop.game`, `activeDrop.game_box_art`, and `all_catalog_games`.
   - Updated `.pip-top-row` to a 3-column tactical grid: `grid-template-columns: 52px 72px 1fr; gap: 12px;`.
   - Created `.pip-cover-slot` (52px × 72px) matching the 72px circular progress ring height, featuring high-contrast box art, graceful gamepad fallback (`🎮`), and an anodized `● LIVE` badge with a pulsing mint indicator.

## Verification
- `test_auxiliary_systems.py`: 7/7 tests passed.
- `test_gameshelf_full_operational.py`: 8/8 tests passed.
- `test_sentinel_suite.py`: 36/36 verification gates passed with exit code 0.
- `smoke_test_exe.py`: Verified `TwitchDropsSentinel.exe` boots and runs cleanly.
- Release distribution archives rebuilt and verified clean.

> **Later change:** the 560×275 size above is out of date. The current mini-window size and its single definition are described in [067](067-pip-clipping-and-grayscale-text.md).
