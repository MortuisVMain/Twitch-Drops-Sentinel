"""History of problems found and fixed by the health checks (background and manual): the last 20 events.

A row that turns warn/fail (or gets worse) is a "found" event; a row that was warn/fail and is ok again is "fixed". The last known status per
check id is kept with the events, so a restart does not repeat old news. A row missing from a run (the background run has no network rows)
keeps its last known status. Stored next to data/health_watch.json with the same atomic write.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Callable, Optional

from atomic_json import atomic_write_json
from health import sanitize

logger = logging.getLogger("sentinel.health_history")

MAX_EVENTS = 20
TITLE_LIMIT = 200
DEFAULT_STORE = Path(__file__).resolve().parent.parent / "data" / "health_history.json"
_SEVERITY = {"ok": 0, "warn": 1, "fail": 2}
_FIELDS = ("time", "checkId", "area", "title", "status", "event")


def _clean_event(item: Any) -> Optional[dict]:
    """A stored event with every field of the right type, or None."""
    if not isinstance(item, dict) or not all(key in item for key in _FIELDS):
        return None
    when = item["time"]
    if not isinstance(when, (int, float)) or isinstance(when, bool) or item["event"] not in ("found", "fixed") or item["status"] not in _SEVERITY:
        return None
    if not all(isinstance(item[key], str) for key in ("checkId", "area", "title")):
        return None
    return {key: item[key] for key in _FIELDS}


class HealthHistory:
    def __init__(self, store_path: Optional[Path], clock: Callable[[], float]) -> None:
        self._store_path = store_path
        self._clock = clock
        self._events: list[dict] = []  # oldest first
        self._known: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        if self._store_path is None or not self._store_path.exists():
            return
        try:
            data = json.loads(self._store_path.read_text(encoding="utf-8"))
            events = [clean for clean in (_clean_event(item) for item in data.get("events") or []) if clean]
            known = {str(k): v for k, v in dict(data.get("known") or {}).items() if v in _SEVERITY}
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            logger.warning("Health history %s is unreadable, starting empty: %s", self._store_path, exc, exc_info=True)
            return
        self._events, self._known = events[-MAX_EVENTS:], known

    def _save(self) -> None:
        if self._store_path is None:
            return
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_json(self._store_path, {"events": self._events, "known": self._known})
        except OSError as exc:
            logger.warning("Could not save health history %s: %s", self._store_path, exc, exc_info=True)

    def events(self) -> list[dict]:
        """Newest first."""
        return [dict(event) for event in reversed(self._events)]

    def record(self, rows: list[dict]) -> None:
        """Compares a run with the last known statuses and appends what changed."""
        now = float(self._clock())
        changed = False
        for row in rows:
            check_id, status = row.get("id"), row.get("status")
            if not isinstance(check_id, str) or status not in _SEVERITY:
                continue
            before = self._known.get(check_id, "ok")
            event = None
            if _SEVERITY[status] > _SEVERITY[before]:
                event = "found"
            elif status == "ok" and before != "ok":
                event = "fixed"
            if self._known.get(check_id) != status:
                self._known[check_id] = status
                changed = True
            if event:
                self._events.append({"time": now, "checkId": check_id, "area": str(row.get("area") or ""),
                                     "title": sanitize(str(row.get("title") or check_id))[:TITLE_LIMIT], "status": status, "event": event})
        del self._events[:-MAX_EVENTS]
        if changed:
            self._save()
