# Solution 043: GameShelf Link Badges, Case-Insensitive Removed Games & Trophy Parsing

## Context & Problem
In Twitch Drops Sentinel v7.0:
1. The badge «⚠️ Требуется привязка» on poster cards was positioned without max-width constraints, causing it to touch the edge or overflow on compact window sizes. Furthermore, users had no indication when an account was already successfully linked.
2. The «🏆 Собрано (1)» tab displayed `(1)`, but clicking it showed «Игры не найдены» because the markdown table header row `| Дата и Время | Игра | Награда | ...` was mistakenly parsed as a trophy for an imaginary game called `"Игра"`.
3. The «🗑️ Удалённые (167)» tab showed `(167)`, but clicking it showed «Игры не найдены» because `ignored_games.json` stores lowercase strings (`'alien: isolation'`), while the catalog checks title-cased names (`'Alien: Isolation'`). Additionally, 125 of the 167 removed games were not active in the current drops catalog.

## Solution & Implementation

### 1. Dual Status Badges for Account Linking
- Evaluated Twitch GQL `is_account_connected`:
  - `is_account_connected === true`: renders `✓ Привязан` in emerald (`bg-emerald-950/92 text-emerald-400 border border-emerald-500/45`).
  - `is_account_connected === false` or `required_link`: renders `⚠️ Нужна привязка` in amber (`bg-amber-950/92 text-amber-300 border border-amber-500/45`).
- Positioned strictly with `top: 8px; right: 8px; maxWidth: calc(100% - 16px)` and `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap`.
- Clicking `⚠️ Нужна привязка` opens the developer's connection URL directly in the user's default browser.

### 2. Trophies Header Row Exclusion & Empty State
- In `core/sentinel_service.py` (`load_trophies`), added validation to skip header and separator rows (`дата`, `date`, `:---`, `игра`, `title`).
- In `src/components/GameShelf.tsx`, if no trophies have been recorded yet, displays an informative state explaining that trophies will be logged as soon as farming cycles complete, rather than a generic error.

### 3. Case-Insensitive Matching & Full Universe for Removed Games
- Normalized `allRemovedLower = new Set([...removedKeys, ...(ignoredGames || [])].map(k => k.toLowerCase().trim()))`.
- For any of the 167 games in `ignored_games.json` that are not in the current 234 active catalog items, synthesized a `GameItem` card.
- All 167 removed games now render properly in the «🗑️ Удалённые» tab with their individual «↩ Восстановить» action button.

## Verification
- `test_gameshelf_full_operational.py`: 8/8 PASS.
- `test_dashboard_full_operational.py`: 8/8 PASS.
- `test_screendimmer_full_operational.py`: 10/10 PASS.
- Frontend compiled cleanly via `npm run build` (590 kB).
- Single-file binary compiled via `dotnet publish` and staged to `TwitchDropsSentinel.update` and `dist_release/`.
