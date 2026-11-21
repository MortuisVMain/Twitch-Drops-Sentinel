"""Farm schedule (quiet hours): farming runs only inside a daily time window on chosen weekdays.

config.json "farm_schedule": {"enabled": bool, "days": [0..6] (Monday = 0), "start": "HH:MM", "end": "HH:MM"}.
A window whose end is not after its start crosses midnight and belongs to the day it starts on: Friday 23:00-07:00
also covers Saturday 03:00. start == end means the whole day. Times are the PC's local time.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

DEFAULT_SCHEDULE = {"enabled": False, "days": [0, 1, 2, 3, 4, 5, 6], "start": "01:00", "end": "09:00"}


def _parse_hhmm(value: Any) -> Optional[int]:
    try:
        hours, minutes = str(value).split(":")
        h, m = int(hours), int(minutes)
    except ValueError:
        return None
    return h * 60 + m if 0 <= h <= 23 and 0 <= m <= 59 else None


def _minutes(value: Any, fallback: str) -> int:
    parsed = _parse_hhmm(value)
    return parsed if parsed is not None else _parse_hhmm(fallback)


def normalize(raw: Any) -> dict:
    """A clean schedule from whatever config.json or the UI holds; unknown or broken parts fall back to defaults."""
    src = raw if isinstance(raw, dict) else {}
    days = src.get("days", DEFAULT_SCHEDULE["days"])
    if not isinstance(days, list):
        days = DEFAULT_SCHEDULE["days"]
    clean_days = sorted({d for d in days if isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6})
    start = _minutes(src.get("start"), DEFAULT_SCHEDULE["start"])
    end = _minutes(src.get("end"), DEFAULT_SCHEDULE["end"])
    return {
        "enabled": bool(src.get("enabled", False)),
        "days": clean_days,
        "start": f"{start // 60:02d}:{start % 60:02d}",
        "end": f"{end // 60:02d}:{end % 60:02d}",
    }


def _windows_around(schedule: dict, now: datetime):
    """(start, end) datetimes of the windows that start from yesterday to a week ahead, in order."""
    start_m = _minutes(schedule["start"], DEFAULT_SCHEDULE["start"])
    end_m = _minutes(schedule["end"], DEFAULT_SCHEDULE["end"])
    length = (end_m - start_m) % (24 * 60) or 24 * 60
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for offset in range(-1, 8):
        day = midnight + timedelta(days=offset)
        if day.weekday() in schedule["days"]:
            begin = day + timedelta(minutes=start_m)
            yield begin, begin + timedelta(minutes=length)


def in_window(schedule: dict, now: datetime) -> bool:
    """True when farming is allowed now: the schedule is off, or now is inside one of its windows."""
    if not schedule.get("enabled"):
        return True
    return any(begin <= now < end for begin, end in _windows_around(schedule, now))


def next_change(schedule: dict, now: datetime) -> Optional[datetime]:
    """When farming next starts (outside a window) or stops (inside one); None when the schedule is off or has no days."""
    if not schedule.get("enabled") or not schedule["days"]:
        return None
    windows = list(_windows_around(schedule, now))
    inside = [end for begin, end in windows if begin <= now < end]
    if inside:
        # back-to-back windows (a whole-day window every day) merge into one stretch
        end = max(inside)
        for begin, later_end in windows:
            if begin <= end < later_end:
                end = later_end
        return end
    upcoming = [begin for begin, _ in windows if begin > now]
    return min(upcoming) if upcoming else None
