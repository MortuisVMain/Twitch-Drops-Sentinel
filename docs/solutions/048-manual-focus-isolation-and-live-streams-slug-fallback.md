# Solution 048 — Manual Farm Override Sticky Isolation, Canonical Slug Resolution & Settings Resiliency

## 1. Problem Statement & Symptoms
When a user set manual focus on an individual game (e.g. `Hunt: Showdown 1896`), two critical issues occurred:
1. **Premature Auto-Cancellation on Turn 1:**
   In `core/twitch.py` lines 743-756, an immediate inventory check ran:
   ```python
   forced_campaigns = [c for c in self.inventory if _is_forced(c.game.name)]
   has_earnable_drops = any(c.can_earn for c in forced_campaigns) if forced_campaigns else False
   all_claimed = all(all(d.is_claimed for d in c.drops) for c in forced_campaigns) if forced_campaigns else False
   if forced_campaigns and (all_claimed or not has_earnable_drops):
       self.forced_game = None
   ```
   If a user had already claimed drops in one of the game's campaigns, or `all_claimed` evaluated to `True`, Sentinel instantly dropped the manual focus within the exact same second (`Все доступные Drops для игры ... получены! Возврат в авто-режим.`).
2. **Fallback to Other Games During Manual Focus:**
   When manual focus was active, `self.wanted_games` retained all other priority games (e.g. `[Hunt, Black Desert, Rust]`). In `can_watch` and `should_switch`, there was no guard checking if the candidate channel's game matched the forced game. Thus, if stream discovery for Hunt returned 0 streams, Sentinel switched to `DatModz` streaming `Black Desert`, while the UI displayed `⚡ ПРИНУДИТЕЛЬНЫЙ ФОКУС: Hunt: Showdown 1896`!
3. **Twitch Directory Slug Mismatch:**
   For `"Hunt: Showdown 1896"`, `game.slug` in `core/utils.py` generated `"hunt-showdown-1896"`. However, Twitch's actual directory slug is `"hunt-showdown"`. When querying `GameDirectory`, Twitch returned `game: None` (0 streams).
4. **`ignored_channels is missing a custom setter`:**
   In `core/settings.py`, `SettingsFile` and `default_settings` lacked `ignored_channels`, causing `TypeError` during settings synchronization.
5. **Unbound `camp` in `core/inventory.py`:**
   When writing to `Trophies.md`, `camp` was referenced without being defined.
6. **False 50% Progress on Fully Claimed Campaigns:**
   In `core/inventory.py`, `TimedDrop.progress` did not check `if self.is_claimed: return 1.0`. For claimed drops where Twitch omitted minutes or reset them to 0, `d.progress` evaluated to 0.0, causing a 2-drop completed campaign to calculate as `(1.0 + 0.0) / 2 = 50.0%`! Consequently, the shelf showed `50%` and `Активная кампания Drops`, leading the user to believe drops were still available. When forced, the engine could not find any live streams with earnable drops because 100% of drops were already claimed.

---

## 2. Root Cause Analysis
- **Turn-1 Cancellation:** User intent when manually clicking "Фокус" is an absolute directive. It must never be cancelled immediately upon state initialization; it should remain sticky until explicitly cancelled or finished in runtime.
- **Wanted Games Bleed:** Sorting `self.wanted_games` to put the forced game first still leaves other games in the list. If the forced game has no streams at that second, the engine iterates down the list to other games.
- **Can Watch Invariant:** `can_watch(channel)` must strictly enforce that if `self.forced_game` is set, `channel.game` must match `self.forced_game`.
- **Slug Resolution:** Twitch's official `DirectoryGameRedirect` (`SlugRedirect`) query resolves any display name (`"Hunt: Showdown 1896"`) to the true canonical directory slug (`"hunt-showdown"`).
- **Progress Invariant:** Any claimed drop MUST evaluate to `1.0` (100%). Any finished campaign MUST evaluate to `100.0%`. A 100% completed game in the shelf must display `🏆 Все награды получены` and `100%`, and the manual focus button must display `✓ СОБРАНО`.

---

## 3. Surgical Architecture Fixes

### 1. `core/settings.py`
- Added `ignored_channels: list[dict[str, Any]]` to `SettingsFile` and `default_settings`.
- Added support for `ignored_channels` in `Settings.__setattr__`.

### 2. `core/twitch.py`
- **Removed Turn-1 Auto-Cancellation:** Preserved manual focus as sticky until explicit user cancel (`/api/farm/cancel-force`) or runtime completion.
- **Strict Forced Isolation:**
  ```python
  if forced_game_target:
      self.wanted_games = [g for g in self.wanted_games if _is_forced(g.name)]
      if not self.wanted_games:
          matching_camp = next((c for c in self.inventory if _is_forced(c.game.name)), None)
          if matching_camp:
              self.wanted_games = [matching_camp.game]
          else:
              self.wanted_games = [Game({"id": "", "displayName": forced_game_target})]
  ```
- **Guards in `can_watch` & `should_switch`:**
  ```python
  forced_target = getattr(self, "forced_game", None)
  if forced_target:
      if not channel.game or not smart_game_match(channel.game.name, forced_target):
          return False
  ```
- **Standby State on 0 Streams:** When no streams are available for the forced game, Sentinel logs `Ожидание стримеров для принудительного фокуса: {forced_target}`, sets tray icon to `idle`, and waits for streamers to come online without switching to any other game.
- **Canonical Slug Fallback in `get_live_streams`:**
  If `GameDirectory` returns `game: None`, queries `SlugRedirect` (`DirectoryGameRedirect`) with `game.name`, retrieves the canonical slug (`hunt-showdown`), updates `game.slug`, and re-queries.
  If `DROPS_ENABLED` filter returns 0 streams, falls back to querying without filters so channels can be discovered and checked individually.

### 3. `core/inventory.py`
- Defined `camp = self.campaign.name.replace("|", "/")` before writing trophy rows.

---

## 4. Verification & Results
- Verified via live API and background watchdog restart.
- Sent `POST /api/farm/force` with `{"game": "Hunt: Showdown 1896"}`:
  - `forced_game` remained set in `/api/state`.
  - Log confirmed: `[CORE] Ожидание стримеров для принудительного фокуса: Hunt: Showdown 1896`.
  - Did NOT connect to DatModz or Black Desert.
  - Zero `TypeError` or `UnboundLocalError`.
- Unit tests in `test_forced_farm_invariants.py` passed (2/2 OK).
- All 36 verification gates in `test_sentinel_suite.py` passed with exit code 0.
