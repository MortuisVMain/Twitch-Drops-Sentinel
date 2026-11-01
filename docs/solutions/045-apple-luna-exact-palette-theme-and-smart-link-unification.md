# Solution 045: Exact Apple Luna 2.0 Theme Integration, Smart Game Link Matching & Collected Drops Unification

## Problem Summary
1. **Palette Misalignment**: The user explicitly required styling the new Field-Deck v3.3.4 interface in the exact Apple Luna 2.0 palette from `ui_redesign_bundle/src/index.css` (warm pine graphite `#171d1c`, surface `#202725`, elevated surface `#28322e`, border `#303a35`, and noble sage mint `#73bba5` / `#368873`), not cold blue-black `#08090B` or neon.
2. **False Negative Account Binding (Hunt: Showdown 1896)**: Hunt Showdown was displayed with `⚠️ Требуется привязка` even though the user's account was connected on Twitch. The root cause was rigid string equality (`'hunt: showdown 1896' === 'hunt: showdown'`) in both backend campaign matching and frontend link checks, failing to equate the game with the Twitch Drops campaign.
3. **Empty "Собрано" (Collected Drops) Tab**: When `Trophies.md` was empty on a fresh session, the "Собрано" tab showed 0 games even though the user had claimed drops in their Twitch inventory. Additionally, an redundant "Витрина 3D Трофеи" tab cluttered the toolbar.

## Architectural Changes & Surgical Fixes

### 1. Theme #7 `apple-luna` (100% Additive)
- **`src/types.ts`**: Added `'apple-luna'` to `ui_theme` and `ui_relief_mode`.
- **`src/index.css`**: Declared `[data-theme="apple-luna"]` with canonical tokens from `ui_redesign_bundle`:
  - `--bg: #171d1c;`
  - `--surface: #202725;`
  - `--surface-elevated: #28322e;`
  - `--line: #303a35;`
  - `--accent: #73bba5;`
  - `--primary: #368873;`
  - `--text-primary: #e9eeec;`
  - `--text-muted: #828f88;`
- **`src/components/LiquidCanvas.tsx`**: Added Apple Luna ambient orbs case: soft sage-mint radial gradients drifting over warm pine graphite (`#171d1c`) without heavy GPU shaders.
- **`src/App.tsx`**: Exposed Apple Luna as Option #7 in theme dropdown and ambient orbs in backdrop selection.

### 2. Smart Game Link Matching (Hunt: Showdown 1896)
- **`core/sentinel_service.py`**:
  - Replaced rigid string comparison with `smart_game_match` and `clean_title` across `camp_map`, `user_linked_games`, and `trophies`.
  - In `handle_toggle_game_linked`: Used `smart_game_match` to ensure toggling adds or removes all name variants without duplicates.
- **`src/components/GameShelf.tsx`**:
  - Implemented `isTitleMatch` helper to match normalized game titles (e.g. `huntshowdown1896` matches `huntshowdown`).
  - Added multi-source fallback: `game.is_account_connected === true || userLinkedGames.some(k => isTitleMatch(k, game.name)) || claimed_drops > 0 || is_finished || trophies.some(t => isTitleMatch(t.game, game.name))`.
- **`src/hooks/useSentinelState.ts`**:
  - Updated `handleToggleUserLinked` with fuzzy matching for immediate, optimistic UI state update.

### 3. "Собрано" Tab Repair & Redundant Tab Consolidation
- **`core/sentinel_service.py`**:
  - In `build_catalog`: Automatically synthesize any campaign from `twitch_client.inventory` that has `claimed_drops > 0` or `is_finished == true` into `catalog_games` under `category: 🏆 Собрано ({claimed})`.
- **`src/components/GameShelf.tsx`**:
  - Unified "Витрина 3D Трофеи" inside the `🏆 Собрано` tab (removed duplicate button from toolbar).
  - Calculated `claimedCount` across all games where `claimed_drops > 0 || is_finished || trophies exist`.
  - Filtered `activeFilter === 'claimed'` to show all collected drop games and the collapsible trophy showcase.

## Verification
- `npm run build`: Vite singlefile build succeeded with 0 errors (`dist/index.html` 595.48 kB).
- `dotnet build`: C# desktop build succeeded with 0 errors.
- `test_sentinel_suite.py`: All 36 verification gates passed with **Exit Code 0**.
