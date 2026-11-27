# 084. The campaign catalog comes from the user's own Twitch data

## Context
The catalog of games with Drops was fetched from a third-party API (`twitch-drops-api.sunkwi.com`, later `drops.sunkwi.com`) with backoff, `Retry-After` handling and a 15-minute loop. It was an outside dependency that could be down, rate-limited or wrong, and every Hell Harvest install called it.

## Decision
- The catalog is built from Twitch's own dashboard data (`core/twitch_catalog.py`: `build_catalog_campaigns`, `publish_first_party`, `CatalogRefresher`) and published through `CampaignsFetcher.set_first_party`. Cache file `data/active_campaigns_cache.json` is `{"source": "twitch", "saved_at", "campaigns"}`.
- Measurement (2026-11-27): all 72 games of the third-party API were on the user's own dashboard, which had 79. The third-party source added nothing, so it is removed: `API_URL`, the HTTP fetch, backoff state, the `start_background_loop` and the "enrich inventory with live campaigns" block in `twitch.py`.
- An old cache without the `twitch` marker (a bare list from the third-party API) is ignored on load and logged once at info. `catalog_source` is `"twitch"` or `"none"`.
- Pre-login trade-off: before the first Twitch sign-in the catalog is empty (the shelf says to sign in to Twitch). Installed games still show; the catalog fills right after the first dashboard fetch and is persisted for later starts.
- Refresh: `CatalogRefresher` re-reads the dashboard every 15 minutes and fetches details only for campaign ids not seen yet.

## Applicability
No code under `core/` or `src/` may call a third-party campaigns API; `test_campaign_catalog_has_no_third_party_source` in `test_sentinel_suite.py` fails if one comes back.
