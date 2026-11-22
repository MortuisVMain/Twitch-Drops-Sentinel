"""Playtime at the first card drop of games farmed alone from zero hours, and what it says about the account.

An unrestricted account gets a game's first card within minutes; a restricted one only after about N hours. A few
samples tell which, so the app can suggest the "hours before first drop" setting. It only ever suggests: the setting
is never changed here. Samples are kept per account (a hash, never the account id) in the settings store.
"""
import hashlib
import logging
import statistics
from collections.abc import Callable, Sequence

logger = logging.getLogger(__name__)

KEY = "steam_idle_first_drop_samples"
START_HOURS_BELOW = 0.1  # only a game that began with (almost) no playtime says anything about the threshold
MIN_SAMPLES, MAX_SAMPLES = 3, 10
RESTRICTED_FROM_HOURS = 1.0  # a median at or above this is a restricted account
MIN_SUGGEST, MAX_SUGGEST = 0.5, 10.0
_SHARED = "shared"
_MAX_HOURS = 1e9  # far above any real playtime; keeps float() of a stored int from overflowing


def drop_hours(playtime_hours: float | None, held_seconds: float) -> float:
    """Playtime shown by the read that saw the drop; the hold duration when that read has none."""
    return float(playtime_hours) if playtime_hours else held_seconds / 3600.0


def verdict(samples: Sequence[float], current_hours: float) -> dict | None:
    """`{"kind", "suggestedHours"}`, or None: too few samples, or the setting already is the suggestion."""
    if len(samples) < MIN_SAMPLES:
        return None
    median = statistics.median(samples)
    if median < RESTRICTED_FROM_HOURS:
        found = {"kind": "unrestricted", "suggestedHours": 0}
    else:
        found = {"kind": "restricted", "suggestedHours": min(max(round(median * 2) / 2, MIN_SUGGEST), MAX_SUGGEST)}
    return None if found["suggestedHours"] == current_hours else found


def _key(account: int) -> str:
    if not account:
        return _SHARED
    return hashlib.sha256(f"steam-idle-first-drop:{account}".encode()).hexdigest()[:16]


def _number(value: object) -> bool:
    return type(value) in (int, float) and 0 <= value <= _MAX_HOURS  # range first: 10**400 overflows isfinite; NaN fails it


def _valid(bucket: object) -> bool:
    return isinstance(bucket, list) and all(_number(value) for value in bucket)


class FirstDropSamples:
    def __init__(self, get_setting: Callable[..., object], set_setting: Callable[[str, object], None]):
        self._get, self._set = get_setting, set_setting

    def _load(self) -> "tuple[dict[str, list[float]], bool]":
        """The valid buckets and whether anything stored had to be thrown away."""
        stored = self._get(KEY, {})
        if not isinstance(stored, dict):
            return {}, True
        good = {key: [float(v) for v in bucket] for key, bucket in stored.items()
                if isinstance(key, str) and _valid(bucket)}
        return good, len(good) != len(stored)

    def samples(self, account: int) -> list[float]:
        return list(self._load()[0].get(_key(account), []))

    def add(self, account: int, hours: object) -> int:
        """Store one sample (newest `MAX_SAMPLES` kept); the new count, 0 when `hours` is not a usable number."""
        if not _number(hours):
            logger.warning("first-drop sample %r ignored", hours)
            return 0
        buckets, damaged = self._load()
        if damaged:
            logger.warning("stored %s is unreadable; the unreadable part was dropped", KEY)
        kept = [*buckets.get(_key(account), []), float(hours)][-MAX_SAMPLES:]
        buckets[_key(account)] = kept
        self._set(KEY, buckets)
        return len(kept)
