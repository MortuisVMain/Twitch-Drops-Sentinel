# 067. Clipped mini-window buttons and soft text over the backdrop

## Problems
1. The bottom row of the mini-window (Ctrl+M) was cut off by the window edge.
2. Text looked low-resolution across the app, most visibly on a 96 DPI monitor.

## Mini-window: the cause
The host opened it at 560x210 DIP, while the content needed more:
- `.pip-action-btn { height: 27px !important }` lost to `.tactile-btn { min-height: 31px }`. Real height was 31 px.
- The HUD ended at 222 px in a 210 px window, and `overflow: hidden` hid the rest.
- `.pip-led-cell` never had a CSS rule, so the 20-LED bar drew an empty strip.
- `ЭТАП 2/3` was a hardcoded string with nothing behind it.

Long game and channel names also pushed the chip and channel out of the HUD (right edge up to 919 px in a 560 px window).

## Mini-window: the fix
- The size lives in one place: `PipWidthDip` / `PipHeightDip` in `desktop/MainForm.cs`, 560x247 DIP. Entry, `WM_DPICHANGED` and `WM_EXITSIZEMOVE` all use `PipSize()`. 246 fails the check, 247 passes.
- Buttons are a real 48 px high. The reward title is static, two lines at most, with the full text in `title`.
- Maximized state is saved on entry and restored on exit. A repeated `SET_PIP_MODE` (reload, renderer recovery) is ignored, so it cannot overwrite the saved bounds; while in PiP the window state file keeps the pre-PiP bounds and maximized flag, never the PiP rectangle.
- On exit the minimum size is cleared before the saved bounds are applied and recomputed from the resulting DPI, so a restore onto a monitor with another DPI is not clamped. A saved rectangle on no connected screen falls back to the centred default (same visibility rule as `LoadWindowState`).
- `isTopMost` follows the host when entering and leaving, and the pin button now works: the host handles `SET_TOPMOST` (only while in PiP) and sets `TopMost`. Before, the host ignored the message, so the label said unpinned while the window stayed on top.
- The backdrop is not mounted in the mini-window: no GPU work, and text stays sharp.

Check: `tools/check_pip_layout.cjs` reads the size from `MainForm.cs`, so the test cannot drift from the host.

## Soft text: the cause
Not DPI, not `ZoomFactor`, not the backdrop buffer. The manifest is PerMonitorV2, `globe.webp` is 2560x1463 and the main canvas loads the full file, and the 1.5 DPR limit covers both monitors (96 and 144 DPI). At DPR 1 text is simply small: 12 px at 100 %, 10.8 px at the 90 % saved by the user.

The difference is antialiasing. A composited canvas under the UI puts text on non-opaque layers, and Chromium then drops ClearType for grayscale. Mean |R-B| on text edge pixels in headed Edge at DPR 1:

| Case | Mean abs(R-B) |
|---|---|
| Plain page (control) | 112 |
| App, unchanged | 4-6 |
| Canvas hidden, no `backdrop-filter`, no island `transform` | 94-98 |
| Canvas kept, recipe below | 92-98 |

The user's 1:1 screenshot of the live WebView scored the same grayscale range (6.4 on the reward title).

## Soft text: the recipe
A panel keeps ClearType over the canvas only if **all** of these hold:
- its own layer (`transform: translateZ(0)`);
- no `backdrop-filter`;
- a background whose base colour has alpha 1. Translucent gradients on top are fine, 0.97 alpha is not;
- a solid-colour border. `border: 0` with a gradient and a transparent border both stayed gray;
- no outer `box-shadow`. Inset shadows are fine.

The outer-shadow rule is wider than the panel: an outer shadow or glow on anything earlier in paint order on that layer (a button, a LED dot, the active tab underline) turns later text gray. A `::after` with its own `translateZ` for border and shadow also broke it.

Tokens: `--bg-island` now ends in a solid colour in every theme, plus `--border-island`, `--shadow-island-inset`, `--shadow-btn-inset`, `--shadow-well-inset`.

Trade-off: panels are opaque and have no outer drop shadow, so the backdrop shows only between panels.

Check: `tools/check_text_lcd.cjs` must run headed, because headless Edge never produces LCD text. It samples only neutral-coloured text, so mint text cannot fake a pass. Run it after any new shadow, blur or translucent surface. It also reports the pass share per surface (`.titanium-island`, `.cartridge-card`, `.store-pod`, `.console-header`, `.danger-zone`) and fails a panel whose samples are mostly gray, so one gray panel cannot hide inside the 90% allowance.

Found by the per-panel report: `.danger-zone` (translucent background and border) was entirely gray in apple-luna; it now follows the recipe. Shelf tile text on apple-luna scores 31-39: real LCD on dim small text, against 3-6 for grayscale. So `PASS_SCORE` is 25, inside that measured gap.

## Trap: the exclude button's hit area
`.cover-exclude-btn::before` is the shared `position: absolute` hit-area strip. If the button is not `position: relative`, the strip anchors to the tile and any click on the tile excludes the game (it also hid the tile text from the LCD check, because `elementFromPoint` returned the button). `tools/check_shelf_hit_areas.cjs` and `test_small_controls_have_a_larger_invisible_click_area` guard it.

## Not covered
- Dropdowns keep their blur as transient surfaces.
- The LCD check ran on titanium, apple-luna and light. The other themes got the same token changes.
- On high-DPI monitors grayscale matters much less; the check runs at DPR 1 on purpose.

## Build gotcha
A worktree that reaches `node_modules` in a parent folder builds without errors, but Inter is left as an unresolved `url(@fontsource...)` and the page silently falls back to Segoe UI. Layout and text measurements taken on such a build are wrong. Run `npm ci` in the worktree first; `test_built_page_embeds_its_font` catches the broken build.

## Live check of the new EXE (2026-11-05)
Run from a temporary folder beside the real `core/`, so it used the signed-in session and never started Twitch activation. The folder was deleted afterwards.
- PiP: 560x247 client at 96 DPI, 840x370 at 144 DPI, and back to 560x247 on the first monitor without a size jump. Moves were made with `SetWindowPos`, not a mouse drag.
- 10 cycles between window and PiP: position and size identical every time (108,71, 2321x1251).
- Maximized window returns maximized from PiP, then restores to its normal bounds.
- Mean |R-B| on the PiP reward title: 6.4 in v3.5.9, 88.8 in the new EXE.

This live check predates the host fixes listed above (repeated `SET_PIP_MODE`, window-state save in PiP, DPI-safe restore, `SET_TOPMOST`); those are proven by build only and still need a live pass.

## Second live check, after the host fixes (2026-11-05)
Build alone missed a real bug here: leaving PiP on a monitor with another DPI returned a 2321x1251 window as 1000x650, because Windows replaces the size during the move. `Bounds` is now applied a second time once the window is on the right monitor.
- Entered on 96 DPI, left on 144 DPI: back to 108,71, 2321x1251, 96 DPI.
- Entered on 144 DPI, left on 96 DPI: back to 2700,50, 2321x1251, 144 DPI.
- Pin button: `TopMost` went true, false, true on two clicks, and the label followed.
- Maximized, PiP, then exit the app: `window_state.json` kept normal bounds with `IsMaximized: true`, and the next launch opened maximized.
- Not exercised live: a repeated enter after a page reload, and a saved monitor that is no longer connected.

## Trap: stretched off-queue cards while idle
While the farm is idle the console collapses and the off-queue grid gets the free height. A CSS grid without `align-content: start` stretches its rows to fill it, so cards grew to 768 px for 74 px of content. `tools/check_override_cards.cjs` compares each card with what its children need.
