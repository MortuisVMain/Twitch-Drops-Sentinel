"""Which games the farm holds back because they may still be refundable, and when the app first saw each game.

The pages the app reads carry no purchase date, so the moment a game first showed up in a card-drops preview stands in
for it. A game seen under 14 days ago with under 2 hours played is held back unless the user released it by hand.
The record is one JSON file with one bucket per Steam account (keyed by a hash of the account id): app id -> epoch
seconds of the first sighting, plus the app ids released by hand.
"""
import hashlib
import json
import logging
import math
import re
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
SHARED = "shared"  # the record of older versions, kept for every account together, until an account takes it over


def is_held(first_seen: float, playtime_hours: float | None, now: float, released: bool = False) -> bool:
    """True while the game may still be refunded: recent, barely played and not released by hand."""
    return (not released and now - first_seen < REFUND_WINDOW_SECONDS
            and (playtime_hours or 0.0) < REFUND_MAX_HOURS)


def days_left(first_seen: float, now: float) -> int:
    """Whole days until the window ends, rounded up, never below 1."""
    return max(1, math.ceil((first_seen + REFUND_WINDOW_SECONDS - now) / SECONDS_PER_DAY))


def _number(value: object) -> bool:
    return type(value) in (int, float) and value >= 0


def _key(account: int | None) -> str:
    """The record key of a Steam account: a short hash, never the account id itself. No account is the shared bucket."""
    if not account:
        return SHARED
    return hashlib.sha256(f"steam-idle-first-seen:{account}".encode()).hexdigest()[:16]


class _Bucket:
    """One account's record: app id -> first sighting, and the app ids released by hand."""

    def __init__(self, first_seen: "dict[int, float] | None" = None, released: "set[int] | None" = None):
        self.first_seen: dict[int, float] = first_seen if first_seen is not None else {}
        self.released: set[int] = released if released is not None else set()

    def to_json(self) -> dict:
        return {"firstSeen": {str(k): v for k, v in sorted(self.first_seen.items())}, "released": sorted(self.released)}


def _parse_bucket(data: object) -> _Bucket:
    """Raises ValueError for anything that is not a bucket this module wrote."""
    if not isinstance(data, dict):
        raise ValueError("not a first-seen bucket")
    seen, released = data.get("firstSeen"), data.get("released")
    if not isinstance(seen, dict) or not all(key.isdecimal() and _number(value) for key, value in seen.items()):
        raise ValueError("bad firstSeen")
    if not isinstance(released, list) or not all(type(item) is int for item in released):
        raise ValueError("bad released list")
    return _Bucket({int(key): value for key, value in seen.items()}, set(released))


def _parse(data: object) -> "dict[str, _Bucket]":
    """Version 1 (one record for every account) becomes the shared bucket; version 2 holds one bucket per account."""
    if isinstance(data, dict) and data.get("version") == 1:
        return {SHARED: _parse_bucket(data)}
    if not isinstance(data, dict) or data.get("version") != 2:
        raise ValueError("not a first-seen record")
    accounts = data.get("accounts")
    if not isinstance(accounts, dict) or not all(re.fullmatch(r"[0-9a-f]{16}", key) for key in accounts):
        raise ValueError("bad accounts")
    buckets = {key: _parse_bucket(value) for key, value in accounts.items()}
    if SHARED in data:
        buckets[SHARED] = _parse_bucket(data[SHARED])
    return buckets


class FirstSeenStore:
    """Thread-safe; a store without a path keeps everything in memory.

    Every call names the Steam account it is about, or leaves it to `account` (a provider of the current account id).
    The record that older versions kept for all accounts together is the shared bucket: the first account that uses the
    store takes it over, and every other account starts from its own first preview."""

    def __init__(self, path: Path | None, clock: Callable[[], float], account: Callable[[], int] = lambda: 0):
        self._path, self._clock, self._account = path, clock, account
        self._lock = threading.Lock()
        self._buckets: dict[str, _Bucket] = {}
        self._lost = False  # True when the file could not be read: accounts missing from it count as already baselined
        self._load()

    def bind_account(self, account: Callable[[], int]) -> None:
        """Where calls without an explicit account read the current one."""
        self._account = account

    def _load(self) -> None:
        path = self._path
        if path is None or not path.is_file():
            return
        try:
            self._buckets = _parse(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            self._lost = True  # a lost or unreadable file must not free recent purchases: later games count as new
            logger.error("first-seen record %s is unreadable and is set aside", path.name, exc_info=True)
            try:
                path.replace(path.with_name(path.name + ".corrupt"))
            except OSError:
                logger.error("first-seen record %s could not be set aside", path.name, exc_info=True)

    def _save(self) -> None:
        if self._path is None:
            return
        data: dict = {"version": 2, "accounts": {key: bucket.to_json() for key, bucket in sorted(self._buckets.items())
                                                 if key != SHARED}}
        if SHARED in self._buckets:
            data[SHARED] = self._buckets[SHARED].to_json()
        try:
            atomic_write_json(self._path, data)
        except OSError:
            logger.error("first-seen record %s could not be written", self._path.name, exc_info=True)

    def _claim_shared(self, key: str) -> None:
        """The first known account takes over the old shared record (caller holds the lock)."""
        if key != SHARED and SHARED in self._buckets and key not in self._buckets:
            self._buckets[key] = self._buckets.pop(SHARED)
            self._save()

    def _bucket(self, account: int | None, create: bool = False) -> "_Bucket | None":
        account = self._account() if account is None else account
        key = _key(account)
        self._claim_shared(key)
        if create and key not in self._buckets:
            self._buckets[key] = _Bucket()
        return self._buckets.get(key)

    def observe(self, games: Iterable[GameDrops], account: int | None = None) -> None:
        """Record the games of a drops preview that were never seen before. Entries of vanished games are kept."""
        with self._lock:
            known = self._bucket(account)
            # An account's first preview is its existing library: stamp it as seen long ago so nothing is held back.
            first = known is None
            bucket = known or self._bucket(account, create=True)
            stamp = 0 if first and not self._lost else self._clock()
            new = {g.app_id for g in games} - bucket.first_seen.keys()
            bucket.first_seen.update(dict.fromkeys(new, stamp))
            if new or first:
                self._save()

    def release(self, app_id: int, account: int | None = None) -> None:
        with self._lock:
            bucket = self._bucket(account, create=True)
            if app_id not in bucket.released:
                bucket.released.add(app_id)
                self._save()

    def is_released(self, app_id: int, account: int | None = None) -> bool:
        with self._lock:
            bucket = self._bucket(account)
            return bucket is not None and app_id in bucket.released

    def held(self, games: Iterable[GameDrops], account: int | None = None) -> list[tuple[GameDrops, int]]:
        """The games still inside their refund window with the days left; games never observed are not held."""
        now = self._clock()
        with self._lock:
            bucket = self._bucket(account)
            if bucket is None:
                return []
            return [(g, days_left(bucket.first_seen[g.app_id], now)) for g in games
                    if g.app_id in bucket.first_seen
                    and is_held(bucket.first_seen[g.app_id], g.playtime_hours, now, g.app_id in bucket.released)]
