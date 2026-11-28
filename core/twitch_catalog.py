"""Turns the drop campaigns Twitch itself returns (dashboard + CampaignDetails, already merged) into the
per-game list the in-app catalog reads: one entry per game, its campaigns under "rewards"."""
from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable, Iterable
from datetime import datetime
from typing import Any

logger = logging.getLogger("TwitchDropsSentinel.TwitchCatalog")

LIVE_STATUSES = ("ACTIVE", "UPCOMING")
REFRESH_INTERVAL = 900.0  # seconds between catalog refreshes
DETAILS_CHUNK = 20  # CampaignDetails queries per GQL batch
_BOX_ART_SIZE = re.compile(r"\{width\}x\{height\}|(?<=-)\d+x\d+(?=\.\w+$)")


def _ts(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _box_art(url: Any) -> str:
    return _BOX_ART_SIZE.sub("285x380", url) if isinstance(url, str) else ""


def _connected(c: dict[str, Any]) -> bool:
    flag = (c.get("self") or {}).get("isAccountConnected")
    return flag if isinstance(flag, bool) else not c.get("accountLinkURL")


def _reward(c: dict[str, Any], game: dict[str, Any], name: str) -> dict[str, Any]:
    return {
        "id": c["id"],
        "name": c.get("name"),
        "status": c.get("status"),
        "startAt": c.get("startAt"),
        "endAt": c.get("endAt"),
        "game": {"id": game.get("id"), "displayName": name, "name": game.get("name") or name,
                 "boxArtURL": _box_art(game.get("boxArtURL"))},
        "accountLinkURL": c.get("accountLinkURL") or "",
        "allow": c.get("allow"),
        "self": {"isAccountConnected": _connected(c)},
        "timeBasedDrops": [
            {"id": d.get("id"), "name": d.get("name"), "requiredMinutesWatched": d.get("requiredMinutesWatched", 0)}
            for d in c.get("timeBasedDrops") or [] if isinstance(d, dict)
        ],
    }


def build_catalog_campaigns(campaigns: Iterable[Any]) -> list[dict[str, Any]]:
    """Entries that are not live campaigns with a game and an id are skipped (logged at debug)."""
    groups: dict[str, dict[str, Any]] = {}
    for c in campaigns:
        game = c.get("game") if isinstance(c, dict) else None
        name = (game or {}).get("displayName") or (game or {}).get("name")
        if not (isinstance(game, dict) and name and c.get("id") and c.get("status") in LIVE_STATUSES):
            logger.debug("Campaign skipped for the catalog: %r", c.get("id") if isinstance(c, dict) else type(c))
            continue
        drops = [d for d in c.get("timeBasedDrops") or [] if isinstance(d, dict)]
        if drops and all((d.get("requiredMinutesWatched") or 0) <= 0 for d in drops):
            logger.debug("Campaign skipped for the catalog, no drop is earned by watching (subscription only): %r", c.get("id"))
            continue
        key = str(game.get("id") or name.strip().lower())
        reward = _reward(c, game, name)
        g = groups.get(key)
        if g is None:
            groups[key] = {
                "gameDisplayName": name, "gameId": game.get("id"), "gameBoxArtURL": reward["game"]["boxArtURL"],
                "status": c["status"], "startAt": c.get("startAt"), "endAt": c.get("endAt"),
                "isAccountConnected": reward["self"]["isAccountConnected"],
                "accountLinkURL": "" if reward["self"]["isAccountConnected"] else reward["accountLinkURL"],
                "rewards": [reward],
            }
            continue
        g["rewards"].append(reward)
        if c["status"] == "ACTIVE":
            g["status"] = "ACTIVE"
        if (s := _ts(c.get("startAt"))) and (not (cur := _ts(g["startAt"])) or s < cur):
            g["startAt"] = c.get("startAt")
        if (e := _ts(c.get("endAt"))) and (not (cur := _ts(g["endAt"])) or e > cur):
            g["endAt"] = c.get("endAt")
        if not g["gameBoxArtURL"]:
            g["gameBoxArtURL"] = reward["game"]["boxArtURL"]
        if not reward["self"]["isAccountConnected"]:
            g["isAccountConnected"] = False
            g["accountLinkURL"] = g["accountLinkURL"] or reward["accountLinkURL"]
    return list(groups.values())


def publish_first_party(fetcher: Any, campaigns: dict[str, Any], dashboard_ids: Iterable[str]) -> None:
    """Hand the dashboard campaigns (not the inventory-only ones) to the fetcher. Never raises: the catalog must not cost an inventory fetch."""
    try:
        wanted = set(dashboard_ids)
        fetcher.set_first_party(build_catalog_campaigns(c for cid, c in campaigns.items() if cid in wanted))
    except Exception as exc:
        logger.error("Publishing Twitch campaigns to the catalog failed: %s", exc, exc_info=True)


def should_refresh(last_activity: float | None, now: float, interval: float = REFRESH_INTERVAL) -> bool:
    """True when nothing (inventory fetch or refresh) published the catalog within the interval."""
    return last_activity is None or now - last_activity >= interval


class CatalogRefresher:
    """Keeps the catalog young while farming: one dashboard request per refresh, CampaignDetails only for unseen ids."""

    def __init__(self, fetcher: Any) -> None:
        self.fetcher = fetcher
        self.known: dict[str, dict[str, Any]] = {}
        self.last_activity: float | None = None

    def note_inventory(self, campaigns: dict[str, Any], now: float) -> None:
        """Remember the details a full inventory fetch merged, and that it just published the catalog."""
        self.known = {cid: c for cid, c in campaigns.items() if isinstance(c, dict) and c.get("status") in LIVE_STATUSES}
        self.last_activity = now

    async def refresh(
        self,
        request: Callable[[], Awaitable[Any]],
        fetch_details: Callable[[list[tuple[str, Any]]], Awaitable[dict[str, Any]]],
        now: float,
    ) -> bool:
        """Returns True when a refreshed catalog was published. Failures are logged, the old catalog stays."""
        if not should_refresh(self.last_activity, now):
            return False
        try:
            response = await request()
            dashboard = response["data"]["currentUser"]["dropCampaigns"] or []
            live = {c["id"]: c for c in dashboard if c["status"] in LIVE_STATUSES}
            new = [(cid, c) for cid, c in live.items() if cid not in self.known]
            details: dict[str, Any] = {}
            for i in range(0, len(new), DETAILS_CHUNK):
                details.update(await fetch_details(new[i:i + DETAILS_CHUNK]))
            merged = {cid: {**(self.known.get(cid) or details.get(cid) or c), "status": c["status"]} for cid, c in live.items()}
        except Exception as exc:
            logger.error("Catalog refresh failed, keeping the previous catalog: %s", exc, exc_info=True)
            self.last_activity = now  # next try after a full interval, not every tick
            return False
        self.known = merged
        self.last_activity = now
        publish_first_party(self.fetcher, merged, merged.keys())
        return True
