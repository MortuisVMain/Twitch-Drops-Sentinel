"""Card-farming state machine: one game held at a time, every side effect injected, no sleeping.

step() runs in one worker thread; commands and status() may be called from another. Commands only queue (and set an
immediate request flag), and status() returns a snapshot published after each step, so a step blocked in a read or a
presence start never blocks a caller and a caller never sees a half-applied transition. Every hold re-checks the
request flags right before it starts a presence, so a stop, close, pause or suspend that arrived during a blocked step
is honoured before a game is held. Each command also republishes the snapshot with the pending intent applied (stop,
pause, resume and suspend show at once and hold nothing) and calls the wake hook so the run loop steps without delay.
"""
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, replace

from .community import CommunityError, GameDrops, farmable
from .first_seen import FirstSeenStore
from .presence import PresenceError

logger = logging.getLogger(__name__)

_ACTIVE = frozenset({"scanning", "farming", "waiting"})
_RESTARTABLE = frozenset({"idle", "done", "stopped", "needs_login"})
_HALTED = frozenset({"stopped", "paused", "suspended"})
_LIVE = _ACTIVE | {"paused", "suspended"}


@dataclass(frozen=True)
class FarmRules:
    recheck_seconds: float = 600.0
    max_game_seconds: float = 6 * 3600
    blacklist: frozenset[int] = frozenset()
    retry_seconds: float = 300.0
    max_consecutive_read_failures: int = 5


@dataclass(frozen=True)
class _Snapshot:
    state: str
    held: GameDrops | None
    held_since: float
    queue: tuple
    done: tuple
    failed: tuple
    last_read: float | None
    last_error: str | None
    paused: bool
    suspended: bool
    refund_held: tuple = ()


def _brief(game: GameDrops) -> dict:
    return {"appId": game.app_id, "name": game.name, "dropsRemaining": game.drops_remaining}


class CardFarm:
    """Call step() from one place only; commands merely queue and are applied one per step (stop clears the queue)."""

    def __init__(self, rules: FarmRules, read_drops: Callable[[], list[GameDrops]],
                 presence_factory: Callable[[], object], clock: Callable[[], float],
                 hold_guard: Callable[[], str | None] | None = None, on_command: Callable[[], None] = lambda: None,
                 refund: FirstSeenStore | None = None):
        self._rules, self._read_drops, self._factory, self._clock = rules, read_drops, presence_factory, clock
        self._refund = refund or FirstSeenStore(None, time.time)  # games that may still be refundable stay queued out
        self._guard = hold_guard  # called right before each hold: None = allowed, else the code to stop with
        self._wake = on_command  # called after every command; must be safe from any thread
        self._lock = threading.Lock()
        self._commands: list[tuple[Callable, tuple]] = []
        self._closed = self._stop_req = self._pause_req = self._suspend_req = False
        self._state = "idle"
        self._paused = self._suspended = False
        self._presence = None
        self._held: GameDrops | None = None
        self._held_since = self._progress_at = self._next_read = 0.0
        self._lost = 0
        self._reset_run()
        self._publish()

    def _reset_run(self) -> None:
        self._queue: list[GameDrops] = []
        self._done: list[GameDrops] = []
        self._failed: list[tuple[GameDrops, str]] = []
        self._skipped: set[int] = set()
        self._failures = 0
        self._refund_held: list[tuple[GameDrops, int]] = []
        self._last_drops: list[GameDrops] | None = None
        self._last_error: str | None = None
        self._last_read: float | None = None

    # commands: record intent only
    def start(self) -> None:
        with self._lock:
            self._pause_req = False
            self._commands.append((self._do_start, ()))
            self._show_intent()
        self._wake()

    def stop(self) -> None:
        with self._lock:
            self._stop_req, self._pause_req = True, False
            self._commands[:] = [(self._do_stop, ())]
            self._show_intent()
        self._wake()

    def close(self) -> None:
        """Permanent stop for shutdown: releases like stop() and refuses every later hold."""
        with self._lock:
            self._closed = True
        self.stop()

    def pause(self) -> None:
        with self._lock:
            self._pause_req = True
            self._commands.append((self._do_pause, ()))
            self._show_intent()
        self._wake()

    def resume(self) -> None:
        with self._lock:
            self._pause_req = False
            self._commands.append((self._do_resume, ()))
            self._show_intent()
        self._wake()

    def skip_current(self) -> None:
        with self._lock:
            self._commands.append((self._do_skip, ()))
        self._wake()

    def refresh(self) -> None:
        """Rebuild the queue from the last read (a game was released by hand)."""
        with self._lock:
            self._commands.append((self._do_refresh, ()))
        self._wake()

    def set_suspended(self, flag: bool) -> None:
        flag = bool(flag)
        with self._lock:
            self._suspend_req = flag
            self._commands[:] = [c for c in self._commands if c[0] != self._do_suspend] + [(self._do_suspend, (flag,))]
            self._show_intent()
        self._wake()

    def abort(self, code: str) -> None:
        """Crash path, only when no step is running: forget everything held and report stopped with `code`.

        The caller releases the real presences; this only makes the state honest.
        """
        with self._lock:
            self._commands.clear()
            self._stop_req = True
        self._presence = self._held = None
        self._queue, self._paused, self._lost = [], False, 0
        self._state, self._last_error = "stopped", code
        self._publish()

    def step(self) -> float:
        """At most one transition; returns the seconds until the next call is useful (0 = call again now)."""
        try:
            with self._lock:
                command = self._commands.pop(0) if self._commands else None
            if command is not None:
                command[0](*command[1])
            elif self._state == "scanning" or (self._state == "waiting" and self._clock() >= self._next_read):
                self._scan()
            elif self._state == "farming":
                self._tick_farming()
            return self._delay()
        finally:
            self._publish()

    def pending(self) -> bool:
        """True while a command is queued and not yet applied by a step (the status may already show its effect)."""
        with self._lock:
            return bool(self._commands)

    def _delay(self) -> float:
        if self._commands or self._state == "scanning":
            return 0.0
        if self._state in ("farming", "waiting"):
            return max(self._next_read - self._clock(), 0.0)
        return self._rules.recheck_seconds

    def _publish(self) -> None:
        snap = _Snapshot(
            self._state, self._held, self._held_since, tuple(self._queue), tuple(self._done), tuple(self._failed),
            self._last_read, self._last_error, self._paused, self._suspended, tuple(self._refund_held))
        with self._lock:
            self._snap = self._with_intent(snap)

    def _show_intent(self) -> None:
        """Lock held: the published snapshot reflects a command that no step has applied yet."""
        self._snap = self._with_intent(self._snap)

    def _with_intent(self, snap: _Snapshot) -> _Snapshot:
        """Lock held: `snap` with the pending requests applied (nothing held), exactly as the queued commands will."""
        state = snap.state
        pending = {command[0] for command in self._commands}
        if (self._closed or self._stop_req) and state in _LIVE:
            return replace(snap, state="stopped", held=None, queue=(), paused=False, suspended=self._suspend_req)
        if self._pause_req and state in _ACTIVE | {"suspended"}:
            return replace(snap, state="paused", held=None, paused=True)
        if self._suspend_req and state in _ACTIVE:
            return replace(snap, state="suspended", held=None, suspended=True)
        if state == "paused" and not self._pause_req and self._do_resume in pending:
            return replace(snap, state="suspended" if self._suspend_req else "scanning", paused=False,
                           suspended=self._suspend_req)
        if state == "suspended" and not (self._suspend_req or self._pause_req) and self._do_suspend in pending:
            return replace(snap, state="scanning", suspended=False)
        return snap

    def status(self) -> dict:
        snap, now = self._snap, self._clock()
        held = snap.held
        return {
            "state": snap.state,
            "current": None if held is None else {**_brief(held), "heldSeconds": now - snap.held_since},
            "queue": [_brief(g) for g in snap.queue],
            "done": [{"appId": g.app_id, "name": g.name} for g in snap.done],
            "failed": [{"appId": g.app_id, "name": g.name, "reason": why} for g, why in snap.failed],
            "totalDropsRemaining": sum(g.drops_remaining for g in snap.queue) + (held.drops_remaining if held else 0),
            "lastReadAgeSeconds": None if snap.last_read is None else now - snap.last_read,
            "lastError": snap.last_error,
            "paused": snap.paused,
            "suspended": snap.suspended,
            "refundHeld": [{"appId": g.app_id, "name": g.name, "reason": "refund_window", "daysLeft": days}
                           for g, days in snap.refund_held if not self._refund.is_released(g.app_id)],
        }

    # command handlers
    def _do_start(self) -> None:
        if self._closed:
            return
        with self._lock:
            self._stop_req = False
        if self._state in _RESTARTABLE:
            self._reset_run()
            self._suspended = self._suspend_req
            self._state = "suspended" if self._suspended else "scanning"

    def _do_stop(self) -> None:
        self._release()
        self._paused = False
        self._suspended = self._suspend_req  # a suspend command dropped by the queue clear still counts
        self._state = "stopped"

    def _do_pause(self) -> None:
        if self._state in _ACTIVE or self._state in ("suspended", "paused"):
            self._release()
            self._paused, self._state = True, "paused"

    def _do_resume(self) -> None:
        if self._state == "paused":
            self._paused = False
            self._suspended = self._suspend_req
            self._state = "suspended" if self._suspended else "scanning"

    def _do_suspend(self, flag: bool) -> None:
        self._suspended = flag
        if flag and self._state in _ACTIVE:
            self._release()
            self._state = "suspended"
        elif not flag and self._state == "suspended":
            self._state = "scanning"

    def _do_refresh(self) -> None:
        if self._last_drops is None:
            return
        queue = self._queue
        self._rebuild(self._last_drops)
        if self._state not in _ACTIVE:
            self._queue = queue  # a finished or stopped run does not start holding again by itself

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

    def _refusal(self) -> str | None:
        """Why no game may be held right now (the freshest requests, not the last applied state), else None."""
        with self._lock:
            if self._closed or self._stop_req:
                return "stopped"
            if self._pause_req:
                return "paused"
            if self._suspend_req:
                return "suspended"
        return None if self._guard is None else self._guard()

    def _refuse(self, why: str) -> None:
        self._queue = []
        if why == "paused":
            self._paused = True
        elif why == "suspended":
            self._suspended = True
        elif why != "stopped":
            self._last_error = why
        self._state = why if why in ("paused", "suspended") else "stopped"

    def _discard(self, presence: object) -> None:
        """Release a presence the farm never adopted."""
        try:
            presence.stop()
        except Exception as error:
            logger.error("presence release failed: %s", getattr(error, "code", type(error).__name__), exc_info=True)

    def _hold(self, game: GameDrops, reason: str | None = None) -> bool:
        if (why := self._refusal()) is not None:
            self._refuse(why)
            return False
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
        except Exception:
            self._discard(presence)  # whatever it half-started must not outlive the crash
            raise
        if (why := self._refusal()) is not None:  # the request arrived while the presence was starting
            self._discard(presence)
            self._refuse(why)
            return False
        now = self._clock()
        self._presence, self._held = presence, game
        self._held_since = self._progress_at = now
        self._next_read = now + self._rules.recheck_seconds
        self._state = "farming"
        logger.info("farm holding app %s (%d card drops left)", game.app_id, game.drops_remaining)
        return True

    def _advance(self) -> None:
        """Hold the next queued game, skipping ones that fail to start; done when none are left."""
        while self._queue:
            if self._hold(self._queue.pop(0)):
                return
            if self._state in _HALTED:
                return
        self._state = "done"

    def _rebuild(self, drops: list[GameDrops]) -> None:
        out = self._rules.blacklist | self._skipped | {g.app_id for g in self._done}
        out |= {g.app_id for g, _ in self._failed} | ({self._held.app_id} if self._held else set())
        wanted = [g for g in farmable(drops) if g.app_id not in out]
        self._refund_held = self._refund.held(wanted)
        back = {g.app_id for g, _ in self._refund_held}
        self._queue = [g for g in wanted if g.app_id not in back]
        self._last_drops = drops

    # reading and farming
    def _read(self) -> list[GameDrops] | None:
        with self._lock:
            if self._closed or self._stop_req:  # the queued stop is applied next; do not start a long read
                return None
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
        logger.info("farm recheck app %s: %s card drops left (was %d)", held.app_id,
                    current.drops_remaining if current else "none", held.drops_remaining)
        if current is None or current.drops_remaining == 0:
            self._release()
            self._done.append(held)
        elif current.drops_remaining < held.drops_remaining:
            self._held, self._progress_at = current, now
        else:
            self._held = current  # a higher count is shown as read; only a decrease resets the no-progress timer
            if now - self._progress_at >= self._rules.max_game_seconds:
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
        if self._state not in _HALTED:
            if lost >= 2:
                self._failed.append((game, "presence_lost"))
            self._advance()
