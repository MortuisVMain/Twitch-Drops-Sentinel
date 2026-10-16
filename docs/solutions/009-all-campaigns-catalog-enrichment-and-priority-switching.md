# Solution 009: Full Twitch Drops Universe Catalog Enrichment & Instant Priority Switching

## Context & Problem
User observed two issues:
1. Sentinel was only watching 4-5 games and went to IDLE instead of farming other available Twitch Drop campaigns ("должен был сначала избранный список забирать, а потом всё подряд").
2. Moving a newly added game to the top of the priority list did not trigger an immediate switch.

## Root Causes
1. **Twitch `ViewerDropsDashboard` Deprecation**:
   - DevilXD engine queried `currentUser.dropCampaigns` via GQL `ViewerDropsDashboard` (hash `c16bb890...`), which currently returns 0 campaigns from Twitch.
   - Sentinel was therefore only populating `inventory_data` with in-progress campaigns from `currentUser.inventory.dropCampaignsInProgress` (only games the user had already started watching on Twitch).
   - All other 80+ active campaigns available on Twitch were never added to `self.inventory`, making it impossible for Sentinel to fall back to other games when priority games were offline.
2. **Settings Handler State Transition**:
   - `handle_post_settings` in `sentinel_service.py` called `self.twitch_client.change_state(State.GAMES_UPDATE)`.
   - `GAMES_UPDATE` only re-sorted campaigns that were *already* in memory. If a new game was added to priority, it was not in `self.inventory`, so Sentinel never queried its channels and stayed in IDLE.
3. **Sequential Stream Search Bottleneck**:
   - When 80 games without ACL were in `no_acl`, `CHANNELS_FETCH` queried each game sequentially over GQL, taking up to 35-40 seconds.

## Solution Architecture & Actions
1. **Catalog Enrichment via `CampaignsFetcher` (`core/twitch.py`)**:
   - In `fetch_inventory()`, Sentinel now pulls all live drop campaigns from `CampaignsFetcher.fetch_sync()` (80+ games / 100+ campaigns).
   - Normalizes game data (`boxArtURL`, `allow`, `channels`) and cross-references `Trophies.md` to skip already completed campaigns.
   - Enriches `inventory_data` with all remaining active campaigns.
   - In `State.GAMES_UPDATE`, priority games are placed first (index 0, 1, 2...), followed by all other active Twitch games ("всё подряд").
2. **Instant Re-Evaluation on Priority Update (`core/sentinel_service.py`)**:
   - In `handle_post_settings` and `save_settings`, updated `change_state(State.GAMES_UPDATE)` to `change_state(State.INVENTORY_FETCH)`.
   - Adding or moving any game to the top immediately triggers inventory discovery and channel switching.
3. **Early Break & Prioritized Stream Search (`core/twitch.py`)**:
   - `no_acl` games are sorted by `wanted_games` priority.
   - As soon as live streams with drops are found for priority games, the search loop breaks early (`break`), achieving sub-second stream resolution.
4. **Console Encoding Hardening**:
   - Added UTF-8 reconfigure with `errors="replace"` to `sentinel_service.py` to prevent CP1251 `UnicodeEncodeError` when logging special characters or emoji in drop rewards.

## Verification
- Verified 87 active campaigns loaded into inventory.
- Auto-claim swept and claimed all ready rewards across newly discovered games (Witcher 3 Wolf Medallion, Elden Ring Bloody Finger, Space Marine II Ultramarine & Shield, etc.).
- Verified runtime stream connection: Sentinel immediately connected to `AfricaAlbion` and is incrementing watch minutes (`current_minutes: 3/180`).
- Verified `POST /api/settings` immediately notifies client and updates priority in real-time.
