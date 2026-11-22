"""Hours phase of the card farm: several games held at once, one presence each, only to gather playtime.

Steam gives a restricted account no card drops from a game before it has N hours (`hours_until_drops`). Hours accrue on
every game played at once, so the games under the threshold are idled together (up to `batch_size`), then farmed one
at a time. Every side effect is injected and nothing sleeps; the farm drives this one step at a time.
"""
import logging
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace

from .community import GameDrops
from .presence import PresenceError

logger = logging.getLogger(__name__)

_STALL_SECONDS = 3600.0  # no playtime gain on any batched game this long: the phase is given up (badge hours lag)
_MAX_PARALLEL = 32  # presences stopped at once


@dataclass(frozen=True)
class Outcome:
    """`kind`: idle (nothing to do), started, failed (the game is out), refused (`code` is why no game may be held),
    fatal (the whole run must stop with `code`)."""
    kind: str
    game: GameDrops | None = None
    code: str | None = None


@dataclass(frozen=True)
class Recheck:
    done: list[GameDrops]
    stalled: bool


def under_threshold(games: Iterable[GameDrops], hours: float) -> list[GameDrops]:
    return [game for game in games if game.playtime_hours < hours]


def pick(queue: list[GameDrops], hours: float, size: int) -> list[GameDrops]:
    """The games to idle together, in queue order; empty unless the phase is on and at least two need hours."""
    if hours <= 0 or size < 2:
        return []
    low = under_threshold(queue, hours)
    return low[:size] if len(low) >= 2 else []


def _stop(presence: object) -> str | None:
    """Stop one presence; a failure is logged and returned as an error code, never raised."""
    try:
        presence.stop()
    except Exception as error:  # a failed release must never stall the farm
        code = getattr(error, "code", type(error).__name__)
        logger.error("presence release failed: %s", code, exc_info=True)
        return f"release_failed:{code}"
    return None


def run_all(items: list, action: Callable[[object], object]) -> list:
    """Run `action` on every item at once (each stop can take seconds, so a full batch must not add them up); the
    results in order. `action` must not raise."""
    if not items:
        return []
    with ThreadPoolExecutor(max_workers=min(len(items), _MAX_PARALLEL)) as pool:
        return list(pool.map(action, items))


class BatchPhase:
    """The games of one hours phase: `pending` still to start, `held` with a live presence."""

    def __init__(self, games: list[GameDrops], factory: Callable[[], object], refusal: Callable[[], str | None],
                 now: float):
        self.pending, self.held, self.progress_at = list(games), {}, now
        self._factory, self._refusal = factory, refusal
        self._presences: dict[int, object] = {}
        self._lost: dict[int, int] = {}

    @property
    def games(self) -> list[GameDrops]:
        return [*self.held.values(), *self.pending]

    def ids(self) -> set[int]:
        return {game.app_id for game in self.games}

    def start_next(self) -> Outcome:
        """Start the first pending game (one per call, so a stop stays responsive)."""
        return self._start(self.pending.pop(0)) if self.pending else Outcome("idle")

    def _start(self, game: GameDrops, reason: str | None = None) -> Outcome:
        if (why := self._refusal()) is not None:
            return Outcome("refused", game, why)
        presence = self._factory()
        try:
            presence.start(game.app_id)
        except PresenceError as error:
            logger.error("presence start failed: %s", error.code)
            if error.code == "identity_mismatch":
                return Outcome("fatal", game, error.code)
            return Outcome("failed", game, reason or error.code)
        except Exception:
            _stop(presence)  # whatever it half-started must not outlive the crash
            raise
        if (why := self._refusal()) is not None:  # the request arrived while the presence was starting
            _stop(presence)
            return Outcome("refused", game, why)
        self.held[game.app_id], self._presences[game.app_id] = game, presence
        return Outcome("started", game)

    def revive_one(self) -> Outcome:
        """A helper died on its own: one fresh attempt, a second loss in a row fails the game. One game per call."""
        dead = None
        for app_id, presence in self._presences.items():
            if presence.is_running():
                self._lost.pop(app_id, None)
            elif dead is None:
                dead = app_id
        if dead is None:
            return Outcome("idle")
        game, lost = self.held[dead], self._lost.get(dead, 0) + 1
        self.drop(dead)
        if lost >= 2:
            return Outcome("failed", game, "presence_lost")
        outcome = self._start(game, "presence_lost")
        if outcome.kind == "started":
            self._lost[dead] = lost
        return outcome

    def drop(self, app_id: int) -> None:
        """Take one game out and release its presence."""
        self.held.pop(app_id, None)
        self._lost.pop(app_id, None)
        if (presence := self._presences.pop(app_id, None)) is not None:
            _stop(presence)

    def recheck(self, drops: list[GameDrops], hours: float, at: float) -> Recheck:
        """Apply a fresh read: finished games and games with enough hours leave; only playtime increases are progress."""
        latest = {game.app_id: game for game in drops}
        done, progressed, had_games = [], False, bool(self.held)
        for app_id, game in list(self.held.items()):
            now = latest.get(app_id)
            if now is None or now.drops_remaining == 0:
                done.append(game)
                self.drop(app_id)
                continue
            if now.playtime_hours < game.playtime_hours:  # playtime never decreases: a missing figure reads as 0
                now = replace(now, playtime_hours=game.playtime_hours)
            progressed = progressed or now.playtime_hours > game.playtime_hours
            if now.playtime_hours != game.playtime_hours:
                logger.info("%s: %.1f h -> %.1f h", game.name, game.playtime_hours, now.playtime_hours)
            if now.playtime_hours >= hours:
                logger.info("%s left the playtime batch (%.1f h)", game.name, now.playtime_hours)
                self.drop(app_id)
            else:
                self.held[app_id] = now
        if progressed or not had_games:
            self.progress_at = at
        return Recheck(done, at - self.progress_at >= _STALL_SECONDS)

    def release_all(self) -> str | None:
        """Stop every presence; returns the first release error code, if any."""
        presences = list(self._presences.values())
        self.held, self.pending, self._presences, self._lost = {}, [], {}, {}
        codes = [code for code in run_all(presences, _stop) if code]
        return codes[0] if codes else None
