"""Cards dropped today, per Steam account, kept in the app's settings store.

One setting maps an account key (a hash, never the account id) to {"date": "YYYY-MM-DD", "count": n}; the date is
local, and a bucket of an earlier date counts as zero and is overwritten by the next drop.
"""
import datetime
import hashlib
import logging
from collections.abc import Callable

logger = logging.getLogger(__name__)

KEY = "steam_idle_drops_daily"
_SHARED = "shared"  # no account known


def _key(account: int) -> str:
    if not account:
        return _SHARED
    return hashlib.sha256(f"steam-idle-drops-daily:{account}".encode()).hexdigest()[:16]


def _valid(bucket: object) -> bool:
    return (isinstance(bucket, dict) and isinstance(bucket.get("date"), str)
            and type(bucket.get("count")) is int and bucket["count"] >= 0)


class DailyDrops:
    def __init__(self, get_setting: Callable[..., object], set_setting: Callable[[str, object], None],
                 wall_clock: Callable[[], float]):
        self._get, self._set, self._wall_clock = get_setting, set_setting, wall_clock

    def _today(self) -> str:
        return datetime.datetime.fromtimestamp(self._wall_clock()).strftime("%Y-%m-%d")

    def _load(self) -> "tuple[dict[str, dict], bool]":
        """The valid buckets and whether anything stored had to be thrown away."""
        stored = self._get(KEY, {})
        if not isinstance(stored, dict):
            return {}, True
        good = {key: bucket for key, bucket in stored.items() if isinstance(key, str) and _valid(bucket)}
        return good, len(good) != len(stored)

    def today(self, account: int) -> int:
        bucket = self._load()[0].get(_key(account))
        return bucket["count"] if bucket and bucket["date"] == self._today() else 0

    def previous_day(self, account: int) -> "tuple[str, str, int] | None":
        """(bucket key, date, count) of yesterday's drops when there were any, else None; the key is a hash."""
        bucket = self._load()[0].get(_key(account))
        yesterday = (datetime.datetime.fromtimestamp(self._wall_clock()) - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        if bucket and bucket["date"] == yesterday and bucket["count"] > 0:
            return _key(account), yesterday, bucket["count"]
        return None

    def add(self, account: int, count: int) -> None:
        if count <= 0:
            return
        buckets, damaged = self._load()
        if damaged:
            logger.warning("stored %s is unreadable; the unreadable part was dropped", KEY)
        key, today = _key(account), self._today()
        bucket = buckets.get(key)
        before = bucket["count"] if bucket and bucket["date"] == today else 0
        buckets[key] = {"date": today, "count": before + count}
        self._set(KEY, buckets)
