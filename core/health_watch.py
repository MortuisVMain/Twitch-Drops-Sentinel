"""Background health watch: a light run of the read-only checks every N hours; a new failure is announced once.

The first run comes FIRST_RUN_SECONDS after the service starts (a problem left from last time shows soon), then every
health_watch_hours. Turning the watch on, or changing the interval, reschedules from that moment. The last run, the problem
count and the failures already announced are kept in data/health_watch.json, so a restart does not announce old news.
A warning only counts toward the dot; only a failure is toasted, once, until it goes away and comes back.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional, TypeGuard

from atomic_json import atomic_write_json

logger = logging.getLogger("sentinel.health_watch")

ENABLED_KEY = "health_watch_enabled"
HOURS_KEY = "health_watch_hours"
HOURS_CHOICES = (1, 4, 12, 24)
DEFAULT_ENABLED = True
DEFAULT_HOURS = 1
FIRST_RUN_SECONDS = 300
RETRY_SECONDS = 300  # after a run that crashed
SLEEP_GAP_SECONDS = 60  # the loop ticks every second: a longer gap between ticks means the PC slept
DEFAULT_STORE = Path(__file__).resolve().parent.parent / "data" / "health_watch.json"
UNWATCHED_AREAS = ("network",)  # slow, and a flaky link is not "something broke"


def _valid_hours(value: Any) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool) and value in HOURS_CHOICES


def hours_from(settings: dict) -> int:
    value = settings.get(HOURS_KEY)
    return value if _valid_hours(value) else DEFAULT_HOURS


def enabled_from(settings: dict) -> bool:
    value = settings.get(ENABLED_KEY)
    return value if isinstance(value, bool) else DEFAULT_ENABLED


def normalize_settings(data: dict) -> None:
    """Incoming settings: a switch that is not true/false or an interval outside 1/4/12/24 is removed (the stored value stays)."""
    if ENABLED_KEY in data and not isinstance(data[ENABLED_KEY], bool):
        logger.warning("%s ignored: expected true or false, got %r", ENABLED_KEY, data[ENABLED_KEY])
        del data[ENABLED_KEY]
    if HOURS_KEY in data and not _valid_hours(data[HOURS_KEY]):
        logger.warning("%s ignored: expected one of %s, got %r", HOURS_KEY, HOURS_CHOICES, data[HOURS_KEY])
        del data[HOURS_KEY]


def _watched(rows: list[dict]) -> list[dict]:
    return [row for row in rows if row.get("area") not in UNWATCHED_AREAS]


def count_problems(rows: list[dict]) -> int:
    """Rows that are fail or warn, outside the areas the watch does not look at."""
    return sum(1 for row in _watched(rows) if row.get("status") in ("fail", "warn"))


def count_fails(rows: list[dict]) -> int:
    """Rows that are fail, outside the areas the watch does not look at."""
    return sum(1 for row in _watched(rows) if row.get("status") == "fail")


def _problem_id(row: dict) -> str:
    return f"{row.get('id')}:{row.get('status')}"


_TOAST = {"ru": "{title}. Откройте «Центр проверки»", "en": "{title}. Open \"Health center\""}


class HealthWatch:
    def __init__(
        self,
        store_path: Optional[Path],
        clock: Callable[[], float],
        enabled: Callable[[], bool],
        hours: Callable[[], int],
        run: Callable[[str], Awaitable[dict]],
        notify: Callable[[str, str], None],
        lang: Callable[[], str],
        mono: Callable[[], float] = time.monotonic,
        history: Optional[Any] = None,
    ) -> None:
        """clock: epoch seconds, only the shown time of a run. mono: monotonic seconds, what the schedule runs on (a clock change or
        a sleep must not fire or skip a run). run(lang) returns {"checks": [rows]}. notify(key, message): keys are unique per announcement.
        history: optional HealthHistory, fed with every run (background and manual)."""
        self._store_path = store_path
        self._clock = clock
        self._enabled = enabled
        self._hours = hours
        self._run = run
        self._notify = notify
        self._lang = lang
        self._mono = mono
        self._history = history
        self._last_manual: Optional[float] = None
        self._manual_seq = 0  # bumped by every manual check: a background run that began before it must not overwrite its count
        self._last_run: Optional[float] = None
        self._problems = 0
        self._fails = 0
        self._notified: set[str] = set()
        self._load()
        self._applied = (enabled(), hours())
        self._last_tick = mono()
        self._due: Optional[float] = self._last_tick + FIRST_RUN_SECONDS if self._applied[0] else None

    def _load(self) -> None:
        if self._store_path is None or not self._store_path.exists():
            return
        try:
            data = json.loads(self._store_path.read_text(encoding="utf-8"))
            last, problems, notified = data.get("lastRun"), data.get("problems"), data.get("notified")
            manual = data.get("lastManual")
            if isinstance(last, (int, float)) and not isinstance(last, bool):
                self._last_run = float(last)
            if isinstance(manual, (int, float)) and not isinstance(manual, bool):
                self._last_manual = float(manual)
            if isinstance(problems, int) and not isinstance(problems, bool) and problems >= 0:
                self._problems = problems
            fails = data.get("fails")
            if isinstance(fails, int) and not isinstance(fails, bool) and fails >= 0:
                self._fails = fails
            if isinstance(notified, list):
                self._notified = {str(item) for item in notified}
        except (OSError, ValueError, AttributeError) as exc:
            logger.warning("Health watch memory %s is unreadable, starting empty: %s", self._store_path, exc, exc_info=True)

    def _save(self) -> None:
        if self._store_path is None:
            return
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_json(self._store_path, {"lastRun": self._last_run, "lastManual": self._last_manual, "problems": self._problems, "fails": self._fails, "notified": sorted(self._notified)})
        except OSError as exc:
            logger.warning("Could not save health watch memory %s: %s", self._store_path, exc, exc_info=True)

    def state(self) -> dict:
        return {"enabled": self._enabled(), "hours": self._hours(), "problems": self._problems, "fails": self._fails, "lastRun": self._last_run, "lastManual": self._last_manual}

    def record_manual(self, rows: list[dict]) -> None:
        """The panel's own check: the stored count follows it (the dot clears once things are fixed); the schedule is not touched."""
        self._manual_seq += 1
        self._last_manual = self._clock()
        self._record_history(rows)
        count = count_problems(rows)
        failing = {_problem_id(row) for row in _watched(rows) if row.get("status") == "fail"}
        self._problems = count
        self._fails = count_fails(rows)
        self._notified &= failing  # fixed and broken again later is news again
        self._save()

    def _record_history(self, rows: list[dict]) -> None:
        if self._history is None:
            return
        try:
            self._history.record(rows)
        except Exception as exc:  # noqa: BLE001 - the history is a convenience: it must not break a check
            logger.error("Health history could not record a run: %s", exc, exc_info=True)

    def _refresh(self) -> None:
        """Settings changed since the last look: switching on, or a new interval, restarts the clock from now."""
        now = self._mono()
        enabled, hours = self._enabled(), self._hours()
        was_enabled, was_hours = self._applied
        self._applied = (enabled, hours)
        if not enabled:
            self._due = None
        elif not was_enabled:
            self._due = now + FIRST_RUN_SECONDS
        elif hours != was_hours:
            self._due = now + hours * 3600

    async def tick(self) -> bool:
        """Runs the checks when one is due. Never raises: a crash is logged and tried again later. True when a run finished."""
        now = self._mono()
        gap, self._last_tick = now - self._last_tick, now
        try:
            self._refresh()
            if self._due is None:
                return False
            if gap > SLEEP_GAP_SECONDS:  # the PC slept: the network and sign-ins need a moment, a run now would report false failures
                self._due = now + FIRST_RUN_SECONDS
            if now < self._due:
                return False
            seq = self._manual_seq
            result = await self._run(self._lang())
            rows = _watched(list(result.get("checks") or []))
            if not self._enabled():  # switched off while the run worked: nothing from it is shown
                return False
            ended = self._mono()
            self._last_run = self._clock()
            self._due = ended + self._hours() * 3600
            if seq == self._manual_seq:  # a manual check that landed meanwhile is newer than this result
                self._problems = count_problems(rows)
                self._fails = count_fails(rows)
                self._record_history(rows)  # an older picture than a manual check that landed meanwhile is not news
                self._announce(rows, self._last_run)
            self._save()
            return True
        except Exception as exc:  # noqa: BLE001 - the loop must outlive any one run
            logger.error("Background health run failed: %s", exc, exc_info=True)
            self._due = self._mono() + RETRY_SECONDS
            return False

    def _announce(self, rows: list[dict], now: float) -> None:
        failing = {_problem_id(row): row for row in rows if row.get("status") == "fail"}
        template = _TOAST["en" if self._lang() == "en" else "ru"]
        for pid in sorted(set(failing) - self._notified):
            try:
                self._notify(f"{pid}:{int(now)}", template.format(title=failing[pid].get("title") or pid))
            except Exception as exc:  # noqa: BLE001 - a broken notifier must not stop the watch
                logger.warning("Health watch could not announce %s: %s", pid, exc, exc_info=True)
        self._notified = set(failing)  # what went away is forgotten, so its return is news again
