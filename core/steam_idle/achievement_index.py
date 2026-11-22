"""Which owned games have Steam achievements, so the Achievements picker can leave the others out.

Source: the public store (IStoreBrowseService/GetItems, no key, app ids only), feature category 22 "Steam Achievements".
One request covers up to BATCH app ids. Answers are cached on disk: True for HAS_TTL_SECONDS, False for NONE_TTL_SECONDS
(a game can get achievements later). An app the store does not answer for stays unknown (None), is never cached and is
shown. A live read of a game's achievements is the better answer and overrides the store. The HTTP fetch, the clock and
the sleep are injected, so tests never touch the network.
"""
import asyncio
import json
import logging
import time
import urllib.parse
from collections.abc import Awaitable, Callable, Iterable
from pathlib import Path

from atomic_json import atomic_write_json

from .protection import Fetch, http_fetch

logger = logging.getLogger(__name__)

CACHE_FILE_NAME = "steam_idle_achievement_index.json"
HAS_TTL_SECONDS = 90 * 86400
NONE_TTL_SECONDS = 14 * 86400
BATCH = 100
GAP_SECONDS = 1.0
TIMEOUT_SECONDS = 15.0
_ACHIEVEMENTS_CATEGORY = 22
_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json={}"


def _url(app_ids: list[int]) -> str:
    body = {"ids": [{"appid": app_id} for app_id in app_ids],
            "context": {"language": "english", "country_code": "US"}, "data_request": {}}
    return _URL.format(urllib.parse.quote(json.dumps(body, separators=(",", ":"))))


def parse_items(text: str) -> dict[int, bool]:
    """app id -> has achievements, for every item the store answered with success; ValueError on a broken body."""
    try:
        items = json.loads(text)["response"]["store_items"]
        if not isinstance(items, list):
            raise TypeError("store_items is not a list")
        result: dict[int, bool] = {}
        for item in items:
            if item.get("success") != 1 or type(item.get("appid")) is not int:
                continue  # unknown to the store (delisted, region): stays unknown
            features = (item.get("categories") or {}).get("feature_categoryids") or []
            result[item["appid"]] = _ACHIEVEMENTS_CATEGORY in features
        return result
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError(f"unexpected GetItems answer: {error}") from error


class AchievementIndex:
    def __init__(self, cache_path: Path | None, fetch: Fetch = http_fetch, clock: Callable[[], float] = time.time,
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep):
        self.cache_path = cache_path
        self._fetch, self._clock, self._sleep = fetch, clock, sleep
        self._entries: dict[str, dict] | None = None
        self._asked: set[int] = set()  # asked the store this session: an unknown answer is not asked again until restart

    def known(self, app_id: int) -> bool | None:
        entry = self._load().get(str(app_id))
        if entry is None:
            return None
        has, at = entry.get("has"), entry.get("at")
        if type(has) is not bool or type(at) not in (int, float):
            return None
        ttl = HAS_TTL_SECONDS if has else NONE_TTL_SECONDS
        return has if 0 <= self._clock() - at < ttl else None

    def missing(self, app_ids: Iterable[int]) -> list[int]:
        """The ids with no fresh answer that the store was not asked about yet in this session."""
        return [app_id for app_id in app_ids if app_id not in self._asked and self.known(app_id) is None]

    def progress(self, app_id: int) -> dict | None:
        """{"achieved", "total"} from the last live read of the game, or None when it was never read."""
        entry = self._load().get(str(app_id))
        if entry is None:
            return None
        achieved, total = entry.get("achieved"), entry.get("total")
        if type(achieved) is not int or type(total) is not int or not 0 <= achieved <= total:
            return None
        return {"achieved": achieved, "total": total}

    def record(self, app_id: int, achieved: int, total: int) -> None:
        """A live read of the game's own list: the final answer, with the account's progress in it."""
        if self.known(app_id) is (total > 0) and self.progress(app_id) == {"achieved": achieved, "total": total}:
            return
        self._load()[str(app_id)] = {"has": total > 0, "at": self._clock(), "achieved": achieved, "total": total}
        self._save()

    async def fill(self, app_ids: Iterable[int]) -> None:
        """Ask the store about every missing id, BATCH at a time. A failed batch is logged and the rest goes on."""
        todo = self.missing(app_ids)
        for start in range(0, len(todo), BATCH):
            batch = todo[start:start + BATCH]
            self._asked.update(batch)
            if start:
                await self._sleep(GAP_SECONDS)
            try:
                status, text = await asyncio.wait_for(self._fetch(_url(batch)), TIMEOUT_SECONDS)
                if status != 200:
                    logger.warning("achievement index: store answered HTTP %s for %d apps", status, len(batch))
                    continue
                answers = parse_items(text)
            except Exception:  # timeout, connection or a broken body: those apps stay unknown and are shown
                logger.warning("achievement index: lookup of %d apps failed", len(batch), exc_info=True)
                continue
            now = self._clock()
            entries = self._load()
            for app_id, has in answers.items():
                kept = {k: v for k, v in entries.get(str(app_id), {}).items() if k in ("achieved", "total")}
                entries[str(app_id)] = {**kept, "has": has, "at": now}
            self._save()

    # cache
    def _load(self) -> dict[str, dict]:
        if self._entries is None:
            self._entries = {}
            if self.cache_path is not None and self.cache_path.is_file():
                try:
                    data = json.loads(self.cache_path.read_text(encoding="utf-8"))
                    if data["version"] != 1 or not isinstance(data["entries"], dict):
                        raise ValueError("unsupported achievement index cache")
                    self._entries = {k: v for k, v in data["entries"].items() if isinstance(v, dict)}
                except (OSError, ValueError, KeyError, TypeError):
                    logger.error("achievement index cache %s is unreadable and is ignored", self.cache_path.name,
                                 exc_info=True)
        return self._entries

    def _save(self) -> None:
        if self.cache_path is None:
            return
        try:
            atomic_write_json(self.cache_path, {"version": 1, "entries": self._load()})
        except OSError:
            logger.error("achievement index cache %s could not be written", self.cache_path.name, exc_info=True)
