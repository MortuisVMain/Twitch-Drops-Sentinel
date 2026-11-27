# 082. Steam IDLE: every card-page recheck failed with gamecards_unparsed

## Symptom
Steam IDLE log, every 10 minutes all night (v4.2.1):
```
ERROR community cards failed: failed:gamecards_unparsed
WARNING community cards run failed: failed:gamecards_unparsed (exit 4); ... failed at page 1: gamecards_unparsed
WARNING card pages read failed (failed:gamecards_unparsed); reading every badge page instead
```
Drops and hours were still right, because the farm fell back to reading every badge page, but each cycle cost many more Steam requests and three error lines.

## Root cause
`parseGameCardsPage` (`giveaways_engine/src/steam_community_parse.js`) rejected any page containing `class="badge_row`, meant to catch a redirect to the badges list. The real `/my/gamecards/<appid>/?l=english` page wraps its own badge in:
```html
<div class="badge_row depressed badge_gamecard_page">
```
so every real card page was rejected. The synthetic fixtures had no wrapper, so the tests passed.

## Fix
- Reject the page only when it has a badge_row whose class does not contain `badge_gamecard_page` (badges-list rows are `badge_row is_link`). The other guards stay: the page must link `/gamecards/<appid>`, and carry exactly one drops cell.
- Fixture `tools/engine_tests/fixtures/steam/gamecards-real-2026-11.html`, cut from the live page (profile renamed, card list removed), and a test that it parses (1 drop, 9.7 h).
- Repeated identical community failures are now logged loudly once, then at DEBUG with a count, and one INFO line on recovery (`FailureStreaks` in `core/steam_idle/community.py` and `farm.py`).

## Pitfalls
- Build parser fixtures from a real page (trimmed and anonymised), not from memory of the markup: Steam's wrappers carry the same class prefixes as the rows they are guarded against.
- A working fallback hides a broken primary path. Watch for a warning that repeats every cycle.
