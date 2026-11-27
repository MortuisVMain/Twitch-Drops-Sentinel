"""The decision behind auto-shutdown, one step per second. The power action itself stays with the caller."""

from __future__ import annotations

import logging
import subprocess
from typing import Any, Callable, Iterable, List, NamedTuple, Optional

logger = logging.getLogger(__name__)

COUNTDOWN_SECONDS = 60


class Step(NamedTuple):
    countdown: Optional[int]
    fire: bool
    cancelled: bool
    fired: bool = False  # already fired for this finish: stays set until the setting goes off or the target is no longer done


def priority_drops_done(inventory: Iterable[Any], priority_games: List[str], rewards_pending: bool = False) -> bool:
    """True when there are drops of priority games and all of them are claimed (and no queued reward campaign is left to farm)."""
    if rewards_pending:
        return False
    wanted = {name.lower() for name in priority_games}
    found = False
    for campaign in inventory:
        for drop in campaign.timed_drops.values():
            if drop.campaign.game.name.lower() in wanted:
                found = True
                if not drop.is_claimed:
                    return False
    return found


def _lock_workstation() -> None:
    import ctypes

    if not ctypes.windll.user32.LockWorkStation():
        raise OSError("LockWorkStation failed")


def run_power_action(mode: str, popen: Callable[..., Any] = subprocess.Popen, lock_workstation: Callable[[], None] = _lock_workstation) -> None:
    """Performs the chosen mode ('shutdown' | 'sleep' | 'lock'); popen and lock_workstation are seams for tests."""
    if mode == "shutdown":
        popen(["shutdown", "/s", "/t", "0"])
    elif mode == "sleep":
        popen(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
    elif mode == "lock":
        lock_workstation()
    else:
        logger.warning("Luna Auto-Shutdown: unknown mode %r, nothing was done", mode)


def next_countdown(countdown: Optional[int], enabled: bool, done: bool, fired: bool = False) -> Step:
    """The conditions are read again every second, so switching off or a new target stops a running countdown.
    After a fire nothing starts again (a PC that went to sleep would sleep again after waking) until the conditions have changed."""
    if not (enabled and done):
        return Step(None, False, countdown is not None, False)
    if fired:
        return Step(None, False, False, True)
    if countdown is None:
        return Step(COUNTDOWN_SECONDS, False, False, False)
    if countdown <= 1:
        return Step(None, True, False, True)
    return Step(countdown - 1, False, False, False)
