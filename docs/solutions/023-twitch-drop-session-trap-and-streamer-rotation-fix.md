# 023. Twitch Drop Session Trap and Streamer Rotation Fix

## 1. Problem Overview
- **Symptoms:**
  1. The user noticed that drop progress appeared stalled across all games (including `HITMAN World of Assassination` and `AION 2`).
  2. The last drop claimed in the user's inventory was on 2026-10-07 (8 days ago).
  3. Despite over 10 active streamers in `HITMAN World of Assassination` (`shizov`, `ethenpov`, `theharryn`, etc.), Sentinel kept ping-ponging and triggering 30-minute game watchdog cooldowns without advancing drops past 14 minutes.
  4. Streamer rotation repeatedly failed with `[WATCHDOG] Игра не дает прогресса 31 мин`.
  5. The log was spammed with `[ERROR] TwitchDrops: Drop claim has potentially failed! Drop ID: 78d000e6-bc50-11f1-b230-0a58a9feac02`.

---

## 2. Root Cause Analysis
1. **Twitch Session Affinity Trap (`_active_session_channel_id`):**
   - In `core/twitch.py` (lines 856-859 and 943-946), Sentinel prioritized channels matching `_active_session_channel_id` at index 0.
   - Twitch's GraphQL `DropCurrentSessionContext` returns the channel where the session was originally initiated (`stides40oz866`).
   - When `stides40oz866` went offline, Twitch still reported `stides40oz866` as the session channel.
   - Sentinel prioritized this channel even when offline or in cooldown, preventing top live channels like `shizov` (50+ viewers) from staying selected.
2. **Offline Channel Leak in `bulk_check_online`:**
   - In `core/twitch.py` line 2075:
     ```python
     if channel_data["stream"] is None:
         continue
     ```
   - Skipping offline channels prevented `channel.external_update(channel_data, available_drops)` from being called, leaving `channel._stream` non-None and preventing `channel.online` from becoming `False`.
3. **Expired Campaign Claim Loop:**
   - `core/twitch.py` (line 717) contained:
     ```python
     if drop.can_claim or (drop.current_minutes >= drop.required_minutes and not drop.is_claimed and drop.required_minutes > 0):
     ```
   - For expired campaigns like `Dead by Daylight` (`DbD: October of Horror`, ended Oct 12), the drop had 60/60 minutes, but `drop.can_claim` was `False` (>24h past ends_at). The redundant OR clause caused Sentinel to retry claiming the expired drop on every single loop, generating false error logs.
4. **Cookie Loading Pickle vs JSON Crash:**
   - `core/twitch.py` tried to unpickle `cookies.jar` first via `cookie_jar.load(COOKIES_PATH)`.
   - When `cookies.jar` was stored as JSON, it raised `UnpicklingError` and fell back to `read_text(encoding="utf-8")`. If binary bytes were present, it failed with decode errors and cleared all cookies, causing unwanted device login prompts.

---

## 3. Implemented Surgical Fixes
1. **Session Affinity Guard:**
   - In `core/twitch.py` (`switch_priority` and `ordered_channels.sort`), `_active_session_channel_id` is ONLY prioritized if:
     `ch.id == self._active_session_channel_id and ch.online and (ch.id not in self.streamer_cooldowns or self.streamer_cooldowns[ch.id] <= now_ts)`
   - If offline or in cooldown, natural viewer-based sorting (`-ch.viewers`) takes priority, immediately picking `shizov`.
2. **Offline Channel Update Pass-through:**
   - Removed `if channel_data["stream"] is None: continue` in `bulk_check_online`, ensuring `channel.external_update()` cleanly resets `self._stream = None` for offline streamers.
3. **Strict `can_claim` Guard:**
   - Changed line 717 to `if drop.can_claim: await drop.claim()`, ensuring expired campaigns are cleanly ignored and never flood logs with claim errors.
4. **Binary/JSON Cookie Sniffing:**
   - In `core/twitch.py` line 517, inspect `data_bytes.startswith(b"{")` to parse JSON cleanly, avoiding pickle unpickling errors and preventing accidental session clearing.

---

## 4. Empirical Runtime Verification
- Live GQL query confirmed:
  - Account: `mortuis_v` (User ID `118872280`).
  - Active session on Twitch successfully migrated to `shizov` (User ID `55256242`).
  - `currentMinutesWatched` for `Purple Streak Crowbar` advanced from **14/60 min (23%) to 15/60 min (25%)**.
  - All 15 verification gates passed with exit code 0 (`test_sentinel_suite.py`).

---

## 5. Gemini 4 Argon Architectural Audit & Hardening
- **False-Positive `send_watch()` Fix:** `channel.py` previously returned `hls_ok or spade_ok or gql_ok`. HLS chunk HEAD does not credit minutes on Twitch's backend. Updated to strictly return `spade_ok or gql_ok` and invalidate `self._spade_url` on HTTP 400/403/404/410.
- **Unified 5-Tuple Deterministic Sort:** Harmonized `switch_priority` and `_channel_sort_key` to `(get_priority(ch), acl_based, drops_enabled, is_valid_session, -viewers)` so session affinity never trumps game priority or drops enablement.
- **Cascade Game Ban Elimination:** Reset `self.game_accumulated_stall[game_name] = 0.0` on streamer rotation and switch, giving each candidate streamer a clean 15-minute evaluation window instead of inheriting previous stalls.
- **Cookie Domain Leading Dot Sanitization:** Added `.lstrip('.').strip()` and `.lstrip(b"\xef\xbb\xbf \t\r\n")` to prevent `yarl.URL` host errors.
- **Failed Claim Circuit Breaker:** Tracked `_failed_claims[drop_id]` with a max retry limit of 3 to eliminate infinite GQL spamming.

