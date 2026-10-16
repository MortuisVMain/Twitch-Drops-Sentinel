---
id: "016"
title: "Live Command Console Restoration, Twitch OAuth Device Code Banner and Watchdog Recalibration"
date: "2026-10-12"
status: "solved"
tags: ["ui", "terminal", "oauth", "watchdog", "twitch-drops", "ref2game"]
---

# Solution 016: Live Command Console Restoration, Twitch OAuth Device Code Banner and Watchdog Recalibration

## Context & Problem Statement
1. **Missing Activity Console in UI:** The user reported not seeing the live commands and actions performed by Twitch Drops Sentinel ("поле где видны команды программы что он делает"). While `recentLogs` was passed as a prop from `App.tsx` down to `LiveDashboard.tsx`, the Bento terminal card rendering was absent from the UI hierarchy.
2. **Mystery Browser Activation Page (`twitch.tv/activate`):** The user noticed a browser window opened on Twitch asking to enter an activation code, without knowing what code to enter or where it came from.
3. **Zero Drops Progress (3-Day Stall):** The user had 0% progress on drops for days. Even after initial fixes, progress appeared frozen because:
   - The streamer watchdog was set too aggressively (120s vs Twitch's 1-3 minute batch reporting window), killing channels before the first minute could register.
   - GQL polling was previously gated behind `minute_almost_done()`, missing out-of-phase updates.
   - Unlinked accounts (Warhammer 40k: Darktide) were prioritized over eligible connected campaigns (Hitman, Aion 2).

## Root Causes & Implementations

### 1. Live Command Console Bento Card (`src/components/LiveDashboard.tsx`)
- Integrated a full-width terminal console below the 3-column stats grid.
- Features:
  - Timestamped monospace logging with color-coded level badges (`[WATCH]`, `[CLAIM]`, `[PROGRESS]`, `[WATCHDOG]`, `[AUTH]`, `[STATUS]`, `[ERROR]`).
  - Category filter pills: `Все`, `Стримы`, `Трофеи`, `Ядро`.
  - Auto-scroll lock toggle with `useRef` and smooth scroll-to-bottom.
  - One-click "Копировать логи" button.
  - Real-time telemetry strip above the console displaying current streamer, target game, progress, and live watchdog countdown.

### 2. Twitch OAuth Device Authorization Handling (`gui_headless.py`, `sentinel_service.py`, `LiveDashboard.tsx`)
- Root Cause: When Twitch cookies/tokens expire, `_oauth_login()` in `core/twitch.py` initiates the OAuth Device Flow via `login_form.ask_enter_code()`. In headless mode, the code was only printed to hidden stdout.
- Fix:
  - Added `oauth_code` and `oauth_uri` fields to `SentinelStateBridge` and exposed them in `/api/state`.
  - Upgraded `ask_enter_code()` in `core/gui_headless.py` to record the code in `STATE_BRIDGE` and emit an `[AUTH]` level log.
  - Added an emergency high-visibility OAuth Activation banner at the top of `LiveDashboard.tsx` featuring the 8-character device code in massive monospace font, a one-click copy button, and a direct link to `twitch.tv/activate`.

### 3. Watchdog Calibration & Connected Campaigns Priority
- Streamer watchdog extended to 360 seconds (6 minutes) and game stall watchdog extended to 720 seconds (12 minutes).
- Unconditional GQL querying of `dropCurrentSession` every minute.
- Prioritized linked campaigns with verified drops (`HITMAN World of Assassination`).

## Verification & Proof
- **Frontend Build:** `npm run build` completed with exit code 0 (`dist/index.html` 434.59 kB).
- **Desktop Host:** C# WebView2 host rebuilt and published to `publish/` and running with exit code 0.
- **Live Progress:** Progress verified on live account `mortuis_v`:
  - Streamer: `malevile`
  - Drop: `Purple Streak Crowbar` (HITMAN World of Assassination)
  - Minutes advancing steadily from 0 to 2/60 min (3%), verified via `/api/state`.
