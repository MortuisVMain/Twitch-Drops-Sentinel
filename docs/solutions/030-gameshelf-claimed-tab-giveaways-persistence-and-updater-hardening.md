# 030 — GameShelf Claimed Tab, Giveaways Store Persistence & Updater Hardening

**Date:** 2026-10-19  
**Version:** v3.1.8  
**Scope:** UI / GameShelf / Giveaways Hub / GitHub Auto-Updater / State Dynamic Versioning / Multi-User Release

---

## 1. Problem Statement & Root Cause

1. **Missing Overview for Claimed Games:**
   On the Game Shelf, users had tabs for «Все дропы», «В топе фарминга», and «Установленные», but no dedicated view for games whose campaigns had been completed and claimed. Once a campaign ended and disappeared from Twitch, users had no visual record of collected games outside the raw `Trophies.md` text file.

2. **Giveaways Hub Settings Resetting on Navigation:**
   In the Free Games Claimer section of the Dashboard, toggling store platforms (Epic, GOG, Steam, Fab, Unity) or Stealth mode worked in memory, but navigating to another tab (e.g. Game Shelf, Settings) and returning would reset the toggles because `dashboardTab` state unmounted the component and reloaded defaults.

3. **Inconsistent Version Display & Downgrade Glitch:**
   The version string was shown inconsistently in multiple locations (Topbar, SettingsStudio header, About card badge, Footer, and HelpModal). Furthermore, when updating via in-app patch, the backend cached the static startup version in `core/version.py`, occasionally showing the previous version until an entire service reboot.

4. **Hidden Runtime Updater Exceptions:**
   During Heavy-Triad pre-mortem audit, two defects were discovered:
   - In `core/sentinel_service.py` (`get_app_version`), an undefined variable `PROJECT_ROOT` was accessed instead of `PROJECT_DIR`.
   - In `core/updater.py`, `import re` was missing for dynamic version parsing, falling back to a hardcoded constant.

---

## 2. Key Architecture & Surgical Fixes

### A. GameShelf «🏆 Собрано» Tab & Trophies Synthesis
In `src/components/GameShelf.tsx` and `src/App.tsx`:
- Added a dedicated `🏆 Собрано` tab to the Game Shelf view.
- Evaluates claimed games using `trophies` prop (`sentinelState.trophies`) and checks `drop.is_claimed` in live campaigns.
- For games whose campaigns have ended and are no longer in Twitch's live catalog, the component synthesizes game cards directly from `Trophies.md` journal entries.
- Displays trophy counts (`N трофеев`), the most recent claimed item name, and a direct 1-click action to open `Trophies.md`.

### B. Two-Tier Giveaways Persistence
In `src/components/LiveDashboard.tsx`:
- Implemented dual persistence: `localStorage` for zero-latency instant UI restoration on component remount, combined with `POST /api/settings` for persistent backend storage in `config.json`.
- State is preserved seamlessly across navigation and app restarts.

### C. Single Source of Truth for App Version
- Standardized version display strictly to the bottom of the left sidebar (`Twitch Drops Sentinel` ... `v.3.1.8`).
- Cleaned up redundant version badges from the Topbar, SettingsStudio header, About card badge, Footer, and HelpModal.
- Updated `core/sentinel_service.py` to dynamically read `core/version.py` from disk on every `/api/state` poll so hot-patches reflect immediately without full restart.

### D. Updater Hardening & Cache Invalidation
- Fixed `PROJECT_DIR` in `core/sentinel_service.py`.
- Added missing `import re` and wired `live_current` into `updater.py`'s `result.update`.
- Integrated automatic cache invalidation upon archive extraction.

---

## 3. Verification & Acceptance Criteria
- [x] All 32 automated verification gates in `test_sentinel_suite.py` pass with Exit Code 0.
- [x] Clean release archives generated (`Twitch_Drops_Sentinel_v3.1.8_Public_Release.zip` and `Twitch_Drops_Sentinel_Patch_v3.1.8.zip`).
- [x] Security audit passes: 0 cookies.jar, 0 tokens, 0 personal logs.
- [x] Release tagged and published to GitHub Releases: `v3.1.8`.
