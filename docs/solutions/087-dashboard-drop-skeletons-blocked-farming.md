# 087. Nothing Farmed: the Dashboard's Drop Skeletons Overwrote the Campaign Details

## Symptom

From 4.4.2 on, the engine farmed only campaigns already started in the Twitch inventory. Every other campaign of a queued
game (MARVEL SNAP, World of Tanks, Albion Online on 2026-11-28) was "not farmable: no drop can be earned now", the log said
"no queued game has campaigns", and the app fell back to the reward campaign. Twitch itself listed the drops as normal
watch-time drops (120 to 360 minutes, no subscription, benefits present).

## Cause

4.4.2 switched `Campaigns` to the ViewerDropsDashboard hash `69750554...` (`fetchRewardCampaigns`). That query lists each
campaign's `timeBasedDrops` as skeletons: `id`, `requiredMinutesWatched`, `requiredSubs` only, no name, benefits or dates.
`Twitch.fetch_campaigns` merged the dashboard entry FIRST and the CampaignDetails second, and `_merge_data` takes a list
whole from the first side. The skeleton list won, so each drop had no benefits and dates 1970..2099, `_base_earn_conditions`
failed, and `can_earn_within` was False for the whole campaign. Campaigns in the inventory were fine: there the inventory
data (full drops with `self`) is merged first.

## Fix

`fetch_campaigns` merges the details first: `self._merge_data(fetched_data, campaign_ids)`. A campaign whose details failed
keeps the dashboard data. Test: `core/test_campaign_details_merge.py` (fails with the old order).

## How it was found

Not by tests (they were green) but by asking the engine itself: a read-only script ran `Twitch.fetch_inventory()` on a temp
copy of the login and printed, per campaign and drop, `is_claimed`, `benefits`, dates and `can_earn_within`. The empty drop
names and the 1970 dates pointed straight at the merge.

## Related findings of the same walk-through

- The shelf matched a game to "the last campaign of that game" in the engine (Albion had two active and two expired weeks):
  now `better_campaign` picks farmable > active > not finished (`core/test_campaign_per_game.py`).
- A campaign whose every drop needs 0 minutes (subscription-only badge, DOOM) is not listed in the farm catalog any more
  (`test_twitch_catalog.py`): it showed "1 drop waits, link your account".
- 20 suite gates that bundle TypeScript with esbuild looked for `node_modules/.bin` in the workspace only. In a git worktree
  (`.claude/worktrees/x`) node_modules is in the main checkout, so every one of them printed "skipped" and counted as passed.
  `node_bin()` now looks upwards; check the suite output for "(node/esbuild not available: skipped)" before trusting it.
