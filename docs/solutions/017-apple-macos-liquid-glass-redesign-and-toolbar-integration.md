---
id: "017"
title: "Apple macOS Liquid Glass Redesign, Segmented Toolbar Architecture and Zero-Regression Refactoring"
date: "2026-10-12"
status: "solved"
tags: ["ui", "apple-hig", "luna-2.0", "macos-toolbar", "ref2game", "webview2"]
---

# Solution 017: Apple macOS Liquid Glass Redesign, Segmented Toolbar Architecture and Zero-Regression Refactoring

## Context & User Request
The user requested an interface redesign modeled after **Apple Style Shutdown Utility v2 (Luna 2.0)** (`C:\AI Local Projects\Ideas\Apple Style Shutdown Utility v2`).

## Architectural Audit & Critic Council Verdict
Before executing the redesign, two specialized subagents were dispatched:
1. **`design_craftsman`**: Mapped out the design tokens, typography, and component styling of Luna 2.0 (Alpine/Obsidian palette, eyebrow badges with live pulsing indicators, tabular numbers, features strips, and tip strips).
2. **`critic_council` (Supreme Critic Council)**: Identified a critical pitfall:
   - In `desktop/MainForm.cs`, the Windows native host has `MinimumSize = 1024×700` and `ClientSize = 1340×880`.
   - Blindly adding a fixed 216px left sidebar would reduce the available horizontal width to 808px at minimum size, collapsing the 3-column Bento grid into an unusable 2500px vertical stack.
   - **Council Verdict:** Approved a **macOS Segmented Toolbar Architecture** located at the top of the interface. This keeps 100% of the horizontal width available for the Bento grid while delivering the authentic Apple Human Interface Guidelines look and feel.

## Implementation Details

### 1. Apple Frost Glass & Obsidian Design Tokens (`src/index.css`)
- Replaced dark neon glows with Apple Liquid Glass tokens:
  - Surface: `rgba(22, 27, 34, 0.82)` with `backdrop-filter: blur(20px) saturate(180%)`.
  - Borders: Specular hairline borders `rgba(255, 255, 255, 0.08)`.
  - Accent: Apple mint `--apple-accent: #73bba5` combined with platform Twitch Violet `#a970ff`.
- Enforced `font-variant-numeric: tabular-nums` across timers, percentages, minutes, and telemetry values to prevent Cumulative Layout Shift (CLS).
- Styled native Windows WebView2 scrollbars into sleek semi-transparent Apple pill scrollbars (`::-webkit-scrollbar`).
- Added `.apple-features-strip` and `.apple-tip-strip` component styling.

### 2. Apple macOS Segmented Toolbar (`src/components/Header.tsx`)
- Left: Luna 2.0 tilted squircle brand mark with glowing indicator, `sentinel.` typography with accent point, and breadcrumbs (`Рабочее пространство › [Раздел] [PRO]`).
- Center: Tactile macOS segmented control with pills for:
  - Дашборд (`LayoutGrid`, live badge)
  - Полка Игр (`Gamepad2`, installed count)
  - Трофеи (`Trophy`, trophies count)
  - Настройки (`SlidersHorizontal`)
- Right: `Windows Native` live status badge with pulsing dot, GPU / ping telemetry pills, manual refresh button, and daemon power toggle.

### 3. Apple Page Heading & Luna 2.0 Strips (`src/App.tsx`)
- Added Apple Page Heading:
  - Eyebrow with pulsing green dot: `SENTINEL PRO · ТИХИЙ АВТОНОМНЫЙ ФАРМ ДРОПОВ 24/7`.
  - Large crisp H1 header with negative tracking (`letter-spacing: -1.2px`).
  - Right pill: `[Локально и приватно · 0% CPU · 28.4 GB сэкономлено]`.
- Integrated 3-column `features-strip` (Streamless protocol, Hardware Guard, Zero-Leak).
- Integrated `tip-strip` with auto-shutdown suggestion and one-click action.
- Added Apple footer: `● Всё спокойно. Sentinel рядом.`.
- Retired floating bottom navigation bar, unlocking unobstructed viewing of the Live Command Console.

## Verification & Proof
- **Frontend Build:** `npm run build` completed with Exit Code 0 (`dist/index.html` 448.53 kB).
- **Desktop Host:** C# app republished via `dotnet publish` to `publish/` and synchronized to `.\TwitchDropsSentinel.exe`.
- **Process Verification:** `TwitchDropsSentinel.exe` running (PID 48760, `Responding: True`).
- **Feature Preservation:** 100% of Sentinel functionality preserved: Live Command Console, OAuth Device Code card, Hardware Guard, daemon toggle, GameShelf, TrophyVault, and SettingsStudio.
