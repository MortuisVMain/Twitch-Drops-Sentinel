"""The decision behind auto-shutdown, one step per second. The power action itself stays with the caller."""

from __future__ import annotations

from typing import Any, Iterable, List, NamedTuple, Optional

COUNTDOWN_SECONDS = 60


class Step(NamedTuple):
    countdown: Optional[int]
    fire: bool
    cancelled: bool
    fired: bool = False  # already fired for this finish: stays set until the setting goes off or the target is no longer done


def priority_drops_done(inventory: Iterable[Any], priority_games: List[str]) -> bool:
    """True when there are drops of priority games and all of them are claimed."""
    wanted = {name.lower() for name in priority_games}
    found = False
    for campaign in inventory:
        for drop in campaign.timed_drops.values():
            if drop.campaign.game.name.lower() in wanted:
                found = True
                if not drop.is_claimed:
                    return False
    return found


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
