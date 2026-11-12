"""Card-farming state machine: one game held at a time, every side effect injected, no threads or sleeping."""
import logging
from collections.abc import Callable
from dataclasses import dataclass

from .community import CommunityError, GameDrops, farmable
from .presence import PresenceError

logger = logging.getLogger(__name__)

_ACTIVE = frozenset({"scanning", "farming", "waiting"})
_RESTARTABLE = frozenset({"idle", "done", "stopped", "needs_login"})


@dataclass(frozen=True)
class FarmRules:
    recheck_seconds: float = 600.0
    max_game_seconds: float = 6 * 3600
    blacklist: frozenset[int] = frozenset()
    retry_seconds: float = 300.0
    max_consecutive_read_failures: int = 5


def _brief(game: GameDrops) -> dict:
    return {"appId": game.app_id, "name": game.name, "dropsRemaining": game.drops_remaining}


class CardFarm:
    """Call step() from one place only; commands merely queue and are applied one per step."""

    def __init__(self, rules: FarmRules, read_drops: Callable[[], list[GameDrops]],
                 presence_factory: Callable[[], object], clock: Callable[[], float]):
        self._rules, self._read_drops, self._factory, self._clock = rules, read_drops, presence_factory, clock
        self._commands: list[tuple[Callable, tuple]] = []
        self._state = "idle"
        self._paused = self._suspended = False
        self._presence = None
        self._held: GameDrops | None = None
        self._held_since = self._progress_at = self._next_read = 0.0
        self._lost = 0
        self._reset_run()

    def _reset_run(self) -> None:
        self._queue: list[GameDrops] = []
        self._done: list[GameDrops] = []
        self._failed: list[tuple[GameDrops, str]] = []
        self._skipped: set[int] = set()
        self._failures = 0
        self._last_error: str | None = None
        self._last_read: float | None = None

    # commands: record intent only
    def start(self) -> None:
        self._commands.append((self._do_start, ()))

    def stop(self) -> None:
        self._commands.append((self._do_stop, ()))

    def pause(self) -> None:
        self._commands.append((self._do_pause, ()))

    def resume(self) -> None:
        self._commands.append((self._do_resume, ()))

    def skip_current(self) -> None:
        self._commands.append((self._do_skip, ()))

    def set_suspended(self, flag: bool) -> None:
        self._commands.append((self._do_suspend, (bool(flag),)))

    def step(self) -> float:
        """At most one transition; returns the seconds until the next call is useful (0 = call again now)."""
        if self._commands:
            command, args = self._commands.pop(0)
            command(*args)
        elif self._state == "scanning" or (self._state == "waiting" and self._clock() >= self._next_read):
            self._scan()
        elif self._state == "farming":
            self._tick_farming()
        return self._delay()

    def _delay(self) -> float:
        if self._commands or self._state == "scanning":
            return 0.0
        if self._state in ("farming", "waiting"):
            return max(self._next_read - self._clock(), 0.0)
        return self._rules.recheck_seconds

    def status(self) -> dict:
        now, held = self._clock(), self._held
        return {
            "state": self._state,
            "current": None if held is None else {**_brief(held), "heldSeconds": now - self._held_since},
            "queue": [_brief(g) for g in self._queue],
            "done": [{"appId": g.app_id, "name": g.name} for g in self._done],
            "failed": [{"appId": g.app_id, "name": g.name, "reason": why} for g, why in self._failed],
            "totalDropsRemaining": sum(g.drops_remaining for g in self._queue) + (held.drops_remaining if held else 0),
            "lastReadAgeSeconds": None if self._last_read is None else now - self._last_read,
            "lastError": self._last_error,
            "paused": self._paused,
            "suspended": self._suspended,
        }

    # command handlers
    def _do_start(self) -> None:
        if self._state in _RESTARTABLE:
            self._reset_run()
            self._state = "suspended" if self._suspended else "scanning"

    def _do_stop(self) -> None:
        self._release()
        self._paused = False
        self._state = "stopped"

    def _do_pause(self) -> None:
        if self._state in _ACTIVE or self._state == "suspended":
            self._release()
            self._paused, self._state = True, "paused"

    def _do_resume(self) -> None:
        if self._state == "paused":
            self._paused = False
            self._state = "suspended" if self._suspended else "scanning"

    def _do_suspend(self, flag: bool) -> None:
        self._suspended = flag
        if flag and self._state in _ACTIVE:
            self._release()
            self._state = "suspended"
        elif not flag and self._state == "suspended":
            self._state = "scanning"

    def _do_skip(self) -> None:
        if self._state == "farming" and self._held is not None:
            self._skipped.add(self._held.app_id)
            self._release()
            self._advance()

    # holding games
    def _release(self) -> None:
        presence, self._presence, self._held, self._lost = self._presence, None, None, 0
        if presence is None:
            return
        try:
            presence.stop()
        except Exception as error:  # a failed release must never stall the farm; it is recorded and not retried
            code = getattr(error, "code", type(error).__name__)
            logger.error("presence release failed: %s", code, exc_info=True)
            self._last_error = f"release_failed:{code}"

    def _hold(self, game: GameDrops, reason: str | None = None) -> bool:
        presence = self._factory()
        try:
            presence.start(game.app_id)
        except PresenceError as error:
            logger.error("presence start failed: %s", error.code)
            if error.code == "identity_mismatch":
                self._queue, self._state, self._last_error = [], "stopped", error.code
            else:
                self._failed.append((game, reason or error.code))
            return False
        now = self._clock()
        self._presence, self._held = presence, game
        self._held_since = self._progress_at = now
        self._next_read = now + self._rules.recheck_seconds
        self._state = "farming"
        return True

    def _advance(self) -> None:
        """Hold the next queued game, skipping ones that fail to start; done when none are left."""
        while self._queue:
            if self._hold(self._queue.pop(0)):
                return
            if self._state == "stopped":
                return
        self._state = "done"

    def _rebuild(self, drops: list[GameDrops]) -> None:
        out = self._rules.blacklist | self._skipped | {g.app_id for g in self._done}
        out |= {g.app_id for g, _ in self._failed} | ({self._held.app_id} if self._held else set())
        self._queue = [g for g in farmable(drops) if g.app_id not in out]

    # reading and farming
    def _read(self) -> list[GameDrops] | None:
        try:
            drops = self._read_drops()
        except CommunityError as error:
            self._on_read_error(error.code)
            return None
        self._failures, self._last_error, self._last_read = 0, None, self._clock()
        return drops

    def _on_read_error(self, code: str) -> None:
        logger.error("drops read failed: %s", code)
        self._failures += 1
        if code == "signed_out":
            self._release()
            self._state = "needs_login"
        elif self._failures >= self._rules.max_consecutive_read_failures:
            self._release()
            self._state = "stopped"
        else:
            self._next_read = self._clock() + self._rules.retry_seconds
            if self._held is None:
                self._state = "waiting"
        self._last_error = code

    def _scan(self) -> None:
        drops = self._read()
        if drops is not None:
            self._rebuild(drops)
            self._advance()

    def _tick_farming(self) -> None:
        if not self._presence.is_running():
            self._revive()
            return
        self._lost = 0
        if self._clock() >= self._next_read:
            self._recheck()

    def _recheck(self) -> None:
        drops = self._read()
        if drops is None:
            return
        held = self._held
        now = self._clock()
        current = next((g for g in drops if g.app_id == held.app_id), None)
        if current is None or current.drops_remaining == 0:
            self._release()
            self._done.append(held)
        elif current.drops_remaining < held.drops_remaining:
            self._held, self._progress_at = current, now
        elif now - self._progress_at >= self._rules.max_game_seconds:
            self._release()
            self._failed.append((held, "no_progress"))
        self._rebuild(drops)
        if self._held is None:
            self._advance()
        else:
            self._next_read = now + self._rules.recheck_seconds

    def _revive(self) -> None:
        """The helper died on its own: one fresh attempt, a second loss in a row fails the game."""
        game, lost = self._held, self._lost + 1
        saved = (self._held_since, self._progress_at, self._next_read)
        self._release()
        if lost < 2 and self._hold(game, "presence_lost"):
            self._held_since, self._progress_at, self._next_read = saved
            self._lost = lost
            return
        if self._state != "stopped":
            if lost >= 2:
                self._failed.append((game, "presence_lost"))
            self._advance()
