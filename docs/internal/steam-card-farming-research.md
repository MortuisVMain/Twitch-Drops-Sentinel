# Steam card farming: methods research (2026-11-22)

Sources: ArchiSteamFarm wiki (Configuration, Performance, FAQ), ASF discussions #2924, Steam Community `tradingcards` group, Idle Master threads. No genuinely new 2025-2026 tricks were found; forums confirm the old rules.

## Facts

| Topic | Finding | Source |
|---|---|---|
| Drop interval | ~1 card / 30 min of single-game play for most games; some 1/h, a few 1/2h. Set by the developer, cannot be sped up. | ASF FAQ, discussion #2924 |
| Drops per game | About half the set, rounded up (5-card set gives 3 drops). | tradingcards forum |
| Restricted accounts | New accounts and accounts that refunded are "restricted": no drop from a game until it has N hours (ASF `HoursUntilCardDrops`, default 3; older lore says 2). Unrestricted accounts drop the first card after ~30 min. Status can change. | ASF Performance, Configuration |
| Detecting restriction | Idle 3-5 zero-hour games one at a time overnight; if every first drop comes after the same number of hours, that is the threshold. | ASF Performance |
| Parallel idling | Steam counts up to 32 appIDs at once. Hours accrue on all of them, but card drops while idling several are close to zero. | ASF Configuration, Performance |
| ASF "Complex" | Games below the threshold: idle up to 32 at once only to accumulate hours (no drop checks). Games at or above it: farm one at a time ("Simple"). | ASF Performance |
| Start/stop trick | Closing/reopening a game sometimes triggers an instant drop (reported on 20 of 30 games, later drops slower). ASF calls it a Steam bug, does not use it, and treats rapid toggling as an Online Conduct violation. Current status unknown. | discussion #2924, ASF Performance |
| Ordering | ASF `FarmingOrders`: fewest cards left first (3), most left (4), hours (5/6), marketable first (15), etc. The wiki gives no single recommendation. | ASF Configuration |
| Polling | ASF `FarmingDelay` = 15 min between badge rechecks of the held game. Badge page caching can delay detection. | ASF Configuration, FAQ |
| No drops | $5-limited accounts, Family Sharing, F2P without spending, paid games given free in a promo, duplicate free+paid license. | ASF FAQ |
| Refunds | ASF `SkipRefundableGames`: skip games bought < 2 weeks ago with < 2 h played (idling burns the refund window). | ASF Configuration |
| Risk | No VAC risk (client is not touched), but automation is against Steam ToS; known bans involve large bot farms (keep to about 10 accounts). | ASF FAQ |

## Comparison with Sentinel's current farm (core/steam_idle)

| Aspect | Sentinel now | Best practice |
|---|---|---|
| Games held | One at a time | One at a time for drops, plus a batch of up to 32 for under-threshold games on restricted accounts |
| Order | Fewest drops left first | Same (ASF order 3); optionally marketable first |
| Recheck | 10 min | 15 min (ASF); 10 is fine |
| Give-up | 6 h without progress | Fine; some games drop only every 2 h |
| Refund window | Held back (first_seen) | Same as SkipRefundableGames |
| Start/stop trick | Not used | Do not use |

## Conclusion

For an unrestricted account the current one-by-one algorithm already matches best practice. The one big win is for restricted accounts with many fresh games: a "hours batch" phase (idle up to 32 under-threshold games at once until each reaches ~3 h, no badge polling), then the existing one-by-one phase. On 100 fresh games that saves about 3 h per game, roughly 300 h down to about 10 h of batch time (100/32 batches of 3 h each).
