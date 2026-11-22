"""A rough time estimate for the card farm: half an hour per card plus the playtime the games still need first."""
import math
from collections.abc import Iterable

from .batch import under_threshold
from .community import GameDrops

HOURS_PER_DROP = 0.5


def estimate(batch: Iterable[GameDrops], queue: Iterable[GameDrops], hours_until_drops: float, batch_size: int,
             held: GameDrops | None = None) -> dict:
    """`dropsRemaining` over the held game, the hours batch and the queue; `hours` is HOURS_PER_DROP per card plus
    the hours phase: the longest wait inside the current batch, and one full threshold for every further batch the
    under-threshold queued games will make up (a rough upper bound, games are not packed any better than that)."""
    batch, queue = list(batch), list(queue)
    drops = sum(game.drops_remaining for game in (*batch, *queue)) + (held.drops_remaining if held else 0)
    hours = drops * HOURS_PER_DROP
    if hours_until_drops > 0:
        hours += max((hours_until_drops - game.playtime_hours for game in under_threshold(batch, hours_until_drops)), default=0.0)
        waiting = len(under_threshold(queue, hours_until_drops))
        hours += math.ceil(waiting / max(batch_size, 1)) * hours_until_drops
    return {"dropsRemaining": drops, "hours": round(hours, 1)}
