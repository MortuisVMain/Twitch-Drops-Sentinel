# Solution 018: Apple Luna 2.0 1:1 UI, Win32 DWM Titlebar Fix & Squircle Icon

## 📌 Context
User requested a complete visual transformation of `Twitch Drops Sentinel v3` to 1:1 match reference project `Luna 2.0` (`Apple Style Shutdown Utility v2`) and user screenshot (`media_1791777286006_b968af31.png`), solve the blue title bar strip in Windows 11, and generate a luxury Apple squircle application icon.

## 🛠️ Root Causes & Engineering Solutions

### 1. Windows 11 Blue Title Bar Elimination (DWM API)
- **Problem:** When Windows 11 has the setting *"Show accent color on title bars and borders"* enabled in Personalization, DWM automatically paints the active window caption with the system accent color (Windows Blue `#0078D7`), ignoring `DWMWA_USE_IMMERSIVE_DARK_MODE = 20`.
- **Solution:** Override caption, text, and border colors directly via Win32 DWM attributes:
  - `DWMWA_CAPTION_COLOR = 35` with COLORREF `0x001C1D17` (BGR for `#171d1c`).
  - `DWMWA_TEXT_COLOR = 36` with COLORREF `0x00ECEEE9` (BGR for `#e9eeec`).
  - `DWMWA_BORDER_COLOR = 34` with COLORREF `0x00353A30` (BGR for `#303a35`).
- **Hook point:** Applied in `protected override void OnHandleCreated(EventArgs e)` inside `desktop/MainForm.cs`, preventing premature handle creation and ensuring attributes persist across window states.

### 2. Apple Squircle Multi-Resolution Icon Generation
- **Script:** Created `scratch/generate_sentinel_apple_icon.py` using Pillow with 2x supersampling, Lamé superellipse curves ($n=4.5$), emerald/mint gradient (`#368873` -> `#1f362d`), glass specular highlight, center tactical crystal shield, and glowing corner indicator.
- **Layers:** Generated `app.png` (512x512) and Windows-compatible `app.ico` with 7 layers: `16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256`.
- **Placement:** Embedded into `desktop/app.ico`, `assets/app.ico`, `publish/app.ico`, and root `.\app.ico`.

### 3. Apple Luna 2.0 1:1 Sidebar & Main Shell Layout
- **Left Sidebar:** Fixed 216px layout (`background: #1b2220; border-right: 1px solid #303a35`).
  - Brand block with tilted squircle badge, white glyph, and glowing green dot.
  - Workspace label `ВАШ ТИХИЙ ПОМОЩНИК`.
  - Vertical navigation: Дашборд, Полка Игр, Трофеи, Настройки with active glowing dot and PRO tags.
  - Bottom `night-note` card with gradient, decorative ellipse line, help link, and version pill.
- **Main Shell:** Offset `margin-left: 216px` with 67px sticky Topbar (breadcrumbs, hardware telemetry pill, `● Windows Native` status, theme toggle, fullscreen toggle).
- **Functionality Preserved (100%):** Bento Grid, live streamer status, Hardware Guard auto-pause, **Live Command Console** with filters/logs, Twitch OAuth card, GameShelf, TrophyVault, and SettingsStudio.

## 🧪 Verification
- All 8 test suites in `test_sentinel_suite.py` passed with exit code 0.
- Vite build `npm run build` compiled cleanly.
- .NET 10 desktop single-file publish passed with exit code 0.
- App launched and confirmed running via PID with active responsive state.
