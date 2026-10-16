# 025 — Campaign Shelf Hero Pin, Alphabetical Sorting & Multi-Source Box Art Engine

## 1. Context & Problem Statement
Prior to this solution, the Campaign Shelf on the Sentinel v3.0 dashboard suffered from three ergonomic limitations:
1. **Farming & Queued Blending:** The actively farming game was mixed into the long scrollable queue with only a subtle green border, forcing users to scroll through dozens of games to inspect farming progress.
2. **Fixed Manual Queue Order:** Users could only view games in priority order (#1, #2, #3...). There was no way to organize waiting games alphabetically (А-Я / A-Z) to quickly locate specific titles.
3. **Box Art & Name Uncertainty:** When users added new custom games, typos in informal/Russian names caused Twitch GQL search failures (since Twitch strictly requires IGDB canonical titles). Additionally, custom titles lacked original box art posters.

## 2. Root Cause Analysis
- **Twitch Canonical Name Contract:** Twitch categorizes streams strictly by IGDB canonical titles (`HITMAN World of Assassination`, `Hunt: Showdown 1896`). Entering informal or non-canonical titles prevents Twitch GQL queries from finding valid broadcaster streams.
- **Steam & Twitch Multi-Source Separation:** Steam provides high-resolution 600×900 library posters via `cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_600x900.jpg`, while Twitch provides 285×380 posters. Without a multi-source fallback resolver and disk cache, newly added games reverted to emoji monograms.

## 3. Engineering Solution

### 1. Active Farming Hero Card (Top Pin)
- Extracted `activeFarmingCampaign` into a prominent Hero Card pinned above the shelf list:
  - Ambient emerald glow (`border-[#3AD29F]/50`, radial backlight).
  - High-resolution vertical poster (44×62px) with `referrerPolicy="no-referrer"`.
  - Tabular progress minutes (`current / required` мин) and percentage.
  - Active broadcaster channel tag with live pulse indicator.
  - The farming game is excluded from the queued list below to eliminate duplicate visual noise.

### 2. Dual Sorting Engine (Priority vs Alphabetical)
- Added sort state `shelfSortMode: 'priority' | 'alphabetical'`.
- Interactive toggle button in the shelf controls:
  - `[ 🎯 ТОП ]`: Displays games in user-defined priority queue order (#1, #2...) with ▲ ▼ reorder buttons enabled.
  - `[ 🔤 А-Я ]`: Sorts queued games alphabetically using `localeCompare('ru-RU', { sensitivity: 'base' })`. Reorder buttons are automatically hidden in alphabetical mode to prevent order inconsistency.

### 3. Integrated Quick-Search & Add Popover
- Embedded a tactile search bar directly inside the Left Bento card header.
- Multi-tier suggestions popover:
  - Real-time instant local matching from `all_catalog_games`.
  - Debounced (250ms) query to `/api/search-games?q=...`.
  - Displays vertical poster (28×38px), canonical title, and status badges (`🔥 РАЗДАЧА`, `💾 ПК`, `🎮 STEAM`).
  - 1-click addition to priority queue with toast notification and canonical title locking.

### 4. Multi-Source Steam Store & IGDB Box Art Resolver
- Backend endpoint `/api/search-games` queries:
  1. Live Twitch drop campaigns (extracting 285×380 `gameBoxArtURL`).
  2. Local installed games catalog.
  3. Steam Store Search API (`https://store.steampowered.com/api/storesearch/?term=...`) to resolve Steam AppID and construct official 600×900 library posters.
- Discovered box arts are persisted to disk in `data/box_art_cache.json` and mirrored in client-side `DYNAMIC_BOX_ART_CACHE`.

## 4. Verification
- `npm run build`: Singlefile bundle compiled in 2.21s with **Exit Code 0** (`dist/index.html` 512 kB).
- `python test_sentinel_suite.py`: All 16 verification gates passed with **Exit Code 0** (including test #16 for search and cache).
- Verified live endpoint `/api/search-games?q=witcher` and `/api/search-games?q=cyberpunk` returning authentic 600×900 library posters.
