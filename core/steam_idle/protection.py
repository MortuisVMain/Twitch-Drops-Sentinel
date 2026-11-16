"""Anti-cheat classification of one app id: protected, clear or unknown. A game with anti-cheat is never written to.

Order: the built-in table, then the disk cache, then one request to the public store endpoint (app id only, no account
data) looking for the "Valve Anti-Cheat enabled" category. Anything uncertain is `unknown` and is never cached; callers
treat `unknown` like `protected`. The HTTP fetch, the clock and the sleep are injected, so tests never touch the network.
"""
import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from pathlib import Path

import aiohttp

from atomic_json import atomic_write_json

logger = logging.getLogger(__name__)

PROTECTED, CLEAR, UNKNOWN = "protected", "clear", "unknown"
CACHE_FILE_NAME = "steam_idle_protection_cache.json"
CLEAR_TTL_SECONDS = 30 * 86400
MIN_GAP_SECONDS = 1.5
TIMEOUT_SECONDS = 10.0
_VAC_CATEGORY = 8
_URL = "https://store.steampowered.com/api/appdetails?appids={}&filters=basic,categories"

# Ids and names are confirmed against the store. Anti-cheat: category 8 (Valve Anti-Cheat enabled), the store text
# naming it (359550 and 107410), or, for the last block, a third-party anti-cheat the store data does not flag.
# That last block is from common knowledge of those games: listing one too many only refuses a write.
BUILTIN: dict[int, str] = {
    10: "Counter-Strike",
    240: "Counter-Strike: Source",
    440: "Team Fortress 2",
    550: "Left 4 Dead 2",
    570: "Dota 2",
    730: "Counter-Strike 2",
    4000: "Garry's Mod",
    107410: "Arma 3",
    221100: "DayZ",
    252490: "Rust",
    346110: "ARK: Survival Evolved",
    359550: "Tom Clancy's Rainbow Six Siege",
    393380: "Squad",
    236390: "War Thunder",
    271590: "Grand Theft Auto V Legacy",
    381210: "Dead by Daylight",
    553850: "HELLDIVERS 2",
    578080: "PUBG: BATTLEGROUNDS",
    594650: "Hunt: Showdown 1896",
    1085660: "Destiny 2",
    1172470: "Apex Legends",
    1203220: "NARAKA: BLADEPOINT",
    1245620: "ELDEN RING",
    1938090: "Call of Duty",
    2357570: "Overwatch 2",
}

Fetch = Callable[[str], Awaitable[tuple[int, str]]]  # url -> (HTTP status, body text)


def is_builtin(app_id: int) -> bool:
    return app_id in BUILTIN


async def http_fetch(url: str) -> tuple[int, str]:
    timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session, session.get(url) as response:
        return response.status, await response.text()


class ProtectionChecker:
    def __init__(self, cache_path: Path | None, fetch: Fetch = http_fetch, clock: Callable[[], float] = time.time,
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep, timeout: float = TIMEOUT_SECONDS):
        self.cache_path = cache_path
        self._fetch, self._clock, self._sleep, self._timeout = fetch, clock, sleep, timeout
        self._lock: asyncio.Lock | None = None  # created in the running loop, one request at a time
        self._entries: dict[str, dict] | None = None
        self._last_request: float | None = None

    @staticmethod
    def is_builtin(app_id: int) -> bool:
        return is_builtin(app_id)

    async def classify(self, app_id: int) -> str:
        if is_builtin(app_id):
            return PROTECTED
        if self._lock is None:
            self._lock = asyncio.Lock()
        async with self._lock:
            if (cached := self._cached(app_id)) is not None:
                return cached
            verdict = await self._request(app_id)
            if verdict != UNKNOWN:
                self._store(app_id, verdict)
            return verdict

    # cache
    def _load(self) -> dict[str, dict]:
        if self._entries is None:
            self._entries = {}
            if self.cache_path is not None and self.cache_path.is_file():
                try:
                    data = json.loads(self.cache_path.read_text(encoding="utf-8"))
                    entries = data["entries"]
                    if not isinstance(entries, dict):
                        raise ValueError("entries is not an object")
                    self._entries = {k: v for k, v in entries.items() if isinstance(v, dict)}
                except (OSError, ValueError, KeyError, TypeError):
                    logger.error("anti-cheat cache %s is unreadable and is ignored", self.cache_path.name, exc_info=True)
        return self._entries

    def _cached(self, app_id: int) -> str | None:
        entry = self._load().get(str(app_id))
        if entry is None:
            return None
        if entry.get("status") == PROTECTED:
            return PROTECTED
        checked = entry.get("checkedAt")
        if (entry.get("status") == CLEAR and isinstance(checked, (int, float)) and not isinstance(checked, bool)
                and 0 <= self._clock() - checked < CLEAR_TTL_SECONDS):
            return CLEAR
        return None

    def _store(self, app_id: int, verdict: str) -> None:
        entries = self._load()
        entries[str(app_id)] = {"status": verdict, "checkedAt": self._clock()}
        if self.cache_path is None:
            return
        try:
            atomic_write_json(self.cache_path, {"version": 1, "entries": entries})
        except OSError:
            logger.error("anti-cheat cache %s could not be written", self.cache_path.name, exc_info=True)

    # request
    async def _request(self, app_id: int) -> str:
        if self._last_request is not None:
            wait = min(max(MIN_GAP_SECONDS - (self._clock() - self._last_request), 0.0), MIN_GAP_SECONDS)
            if wait > 0:
                await self._sleep(wait)
        self._last_request = self._clock()
        try:
            status, text = await asyncio.wait_for(self._fetch(_URL.format(app_id)), self._timeout)
        except Exception as error:  # timeout, connection or a broken fetch: never a verdict
            logger.warning("anti-cheat check for app %s failed: %s", app_id, type(error).__name__, exc_info=True)
            return UNKNOWN
        verdict = _verdict(app_id, status, text)
        if verdict == UNKNOWN:
            logger.warning("anti-cheat check for app %s gave no usable answer (HTTP %s)", app_id, status)
        return verdict


def _verdict(app_id: int, status: int, text: str) -> str:
    if status != 200:
        return UNKNOWN
    try:
        entry = json.loads(text)[str(app_id)]
        if entry["success"] is not True:
            return UNKNOWN
        categories = entry["data"]["categories"]
        ids = {category["id"] for category in categories}
    except (ValueError, KeyError, TypeError):
        return UNKNOWN
    return PROTECTED if _VAC_CATEGORY in ids else CLEAR
