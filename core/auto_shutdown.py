"""The decision behind auto-shutdown, one step per second. The power action itself stays with the caller."""

from __future__ import annotations

from typing import Any, Iterable, List, NamedTuple, Optional

COUNTDOWN_SECONDS = 60


class Step(NamedTuple):
    countdown: Optional[int]
    fire: bool
    cancelled: bool


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


def next_countdown(countdown: Optional[int], enabled: bool, done: bool) -> Step:
    """The conditions are read again every second, so switching off or a new target stops a running countdown."""
    if not (enabled and done):
        return Step(None, False, countdown is not None)
    if countdown is None:
        return Step(COUNTDOWN_SECONDS, False, False)
    if countdown <= 1:
        return Step(None, True, False)
    return Step(countdown - 1, False, False)
