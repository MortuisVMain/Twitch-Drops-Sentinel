"""Which games the farm holds back because they may still be refundable, and when the app first saw each game.

The pages the app reads carry no purchase date, so the moment a game first showed up in a card-drops preview stands in
for it. A game seen under 14 days ago with under 2 hours played is held back unless the user released it by hand.
The record is one JSON file: app id -> epoch seconds of the first sighting, plus the app ids released by hand.
"""
import json
import logging
import math
import threading
from collections.abc import Callable, Iterable
from pathlib import Path

from atomic_json import atomic_write_json

from .community import GameDrops

logger = logging.getLogger(__name__)

FILE_NAME = "steam_idle_first_seen.json"
SECONDS_PER_DAY = 86400.0
REFUND_WINDOW_SECONDS = 14 * SECONDS_PER_DAY
REFUND_MAX_HOURS = 2.0


def is_held(first_seen: float, playtime_hours: float | None, now: float, released: bool = False) -> bool:
    """True while the game may still be refunded: recent, barely played and not released by hand."""
    return (not released and now - first_seen < REFUND_WINDOW_SECONDS
            and (playtime_hours or 0.0) < REFUND_MAX_HOURS)


def days_left(first_seen: float, now: float) -> int:
    """Whole days until the window ends, rounded up, never below 1."""
    return max(1, math.ceil((first_seen + REFUND_WINDOW_SECONDS - now) / SECONDS_PER_DAY))


def _number(value: object) -> bool:
    return type(value) in (int, float) and value >= 0


def _parse(data: object) -> tuple[dict[int, float], set[int]]:
    """Raises ValueError for anything that is not a file this module wrote."""
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("not a first-seen record")
    seen, released = data.get("firstSeen"), data.get("released")
    if not isinstance(seen, dict) or not all(key.isdecimal() and _number(value) for key, value in seen.items()):
        raise ValueError("bad firstSeen")
    if not isinstance(released, list) or not all(type(item) is int for item in released):
        raise ValueError("bad released list")
    return {int(key): value for key, value in seen.items()}, set(released)


class FirstSeenStore:
    """Thread-safe; a store without a path keeps everything in memory."""

    def __init__(self, path: Path | None, clock: Callable[[], float]):
        self._path, self._clock = path, clock
        self._lock = threading.Lock()
        self._first_seen: dict[int, float] = {}
        self._released: set[int] = set()
        self._baselined = False  # False only until the first preview of a store that has no file yet
        self._load()

    def _load(self) -> None:
        path = self._path
        if path is None or not path.is_file():
            return
        self._baselined = True  # a lost or unreadable file must not free recent purchases: later games count as new
        try:
            self._first_seen, self._released = _parse(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            logger.error("first-seen record %s is unreadable and is set aside", path.name, exc_info=True)
            try:
                path.replace(path.with_name(path.name + ".corrupt"))
            except OSError:
                logger.error("first-seen record %s could not be set aside", path.name, exc_info=True)

    def _save(self) -> None:
        if self._path is None:
            return
        data = {"version": 1, "firstSeen": {str(k): v for k, v in sorted(self._first_seen.items())},
                "released": sorted(self._released)}
        try:
            atomic_write_json(self._path, data)
        except OSError:
            logger.error("first-seen record %s could not be written", self._path.name, exc_info=True)

    def observe(self, games: Iterable[GameDrops]) -> None:
        """Record the games of a drops preview that were never seen before. Entries of vanished games are kept."""
        with self._lock:
            # The first preview ever seen is the existing library: stamp it as seen long ago so nothing is held back.
            stamp = self._clock() if self._baselined else 0
            new = {g.app_id for g in games} - self._first_seen.keys()
            first = not self._baselined
            self._baselined = True
            self._first_seen.update(dict.fromkeys(new, stamp))
            if new or first:
                self._save()

    def release(self, app_id: int) -> None:
        with self._lock:
            if app_id not in self._released:
                self._released.add(app_id)
                self._save()

    def is_released(self, app_id: int) -> bool:
        with self._lock:
            return app_id in self._released

    def held(self, games: Iterable[GameDrops]) -> list[tuple[GameDrops, int]]:
        """The games still inside their refund window with the days left; games never observed are not held."""
        now = self._clock()
        with self._lock:
            return [(g, days_left(self._first_seen[g.app_id], now)) for g in games
                    if g.app_id in self._first_seen
                    and is_held(self._first_seen[g.app_id], g.playtime_hours, now, g.app_id in self._released)]
