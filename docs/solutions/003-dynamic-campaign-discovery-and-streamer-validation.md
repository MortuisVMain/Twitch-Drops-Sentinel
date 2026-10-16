# Solution 003: Dynamic Campaign Discovery & Streamer Drop Validation

## Problem
1. **Smartbox Null DropCampaigns:** The DevilXD Twitch streamless core utilizes `ClientType.SMARTBOX` to bypass Twitch Web JavaScript client-integrity tokens. However, Twitch returns `"dropCampaigns": null` on Smartbox for the `ViewerDropsDashboard` query. As a result, campaigns not previously watched in a browser (such as newly launched events like *The Witcher 3: Wild Hunt* "Remastered Release") are absent from `self.inventory`, keeping Sentinel in `State.IDLE`.
2. **Sub-Badge Streamer Traps:** In game categories with active drops, many high-viewer channels possess the Twitch `DROPS_ENABLED` system filter tag but only offer paid subscription badge drops (`requiredSubs: 1, requiredMinutesWatched: 0`). Without active validation, stream selection algorithms select the highest-viewed channel, yielding 0 minutes of watched progress.

## Solution Architecture
1. **Directory-Based Dynamic Campaign Discovery:**
   - In `core/twitch.py` (`fetch_inventory`), Sentinel checks for priority games not present in `inventory_data`.
   - Sentinel queries `GameDirectory` (`DirectoryPage_Game`) with `slug` and `systemFilters: ["DROPS_ENABLED"]`.
   - It queries `AvailableDrops` (`DropsHighlightService_AvailableDrops`) on broadcaster candidates.
   - Upon encountering a campaign with `timeBasedDrops` (`requiredMinutesWatched > 0`), it adapts the schema into `DropsCampaign` data structure (`startAt`, `endAt`, `allow`, `status: "ACTIVE"`, `benefitEdges` with `DIRECT_ENTITLEMENT`).
   - The campaign is injected directly into `inventory_data` and registered in `self.wanted_games`.

2. **Parallel Streamer Drop Validation (`bulk_check_online`):**
   - Enabled `available_drops_check = True`.
   - In `State.CHANNELS_CLEANUP`, channels discovered from directory queries are validated via `await self.bulk_check_online(new_channels)` (executing in ~0.72s via batch GQL).
   - Channels lacking the active time-based campaign are set to `drops_enabled = False`.
   - Channels with verified drops are sorted to the top and selected for streamless watching.

3. **Telemetry & Noise Reduction:**
   - Silenced `aiohttp.access` log spam via `web.AppRunner(self.app, access_log=None)` in `core/sentinel_service.py`.

## Verification
- Verified on live Twitch API with active campaign `Remastered Release` (`5ccd33aa-a869-4de4-aca7-44775bf07823`) for *The Witcher 3: Wild Hunt*.
- Out of 20 live streams, 19 sub-badge streamers (`DropsBadge`, `DailyDropsON`, etc.) were filtered out in 0.72s.
- Sentinel selected verified streamer `yanavalenaa`, established WebSocket and Spade connection, and initiated progress tracking for `Fire Horse saddlebags` (0/30m).
