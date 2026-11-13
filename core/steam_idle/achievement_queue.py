"""Achievements unlock queue: one game at a time, every side effect injected, no sleeping.

step() runs in one worker thread; commands and status() may come from another. pause, resume and suspend only set
immediate flags and stop/close set a request flag, so the guard right before every unlock sees them even when they
arrived while a step was blocked in a read or an unlock. status() returns a snapshot published at the end of each step.
Nothing is written once the queue is closed, stopped, paused, suspended or done, and any uncertain outcome stops the run.
"""
import logging
import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .achievements import MAX_UNLOCK_NAMES, Achievement, AchievementsError, UnlockOutcome

logger = logging.getLogger(__name__)

_ACTIVE = frozenset({"scanning", "unlocking", "waiting"})
_RESTARTABLE = frozenset({"idle", "done", "stopped"})
# helper codes that mean no further game can work either: the account, the write permission or the helper itself
_FATAL = frozenset({"identity_mismatch", "account_mismatch", "active_account_changed", "write_not_allowed",
                    "start_failed", "invalid_steam_id"})
_RESULT_TOTAL = {"unlocked": "unlocked", "already": "already", "unknown": "rejected", "rejected": "rejected"}
_LIST_CAP = 200
_IDLE_SECONDS = 5.0


@dataclass(frozen=True)
class Rules:
    min_minutes: int = 0
    max_minutes: int = 0
    skip_hidden: bool = True


@dataclass(frozen=True)
class SelectedPlan:
    app_id: int
    names: Sequence[str]
    name: str = ""


@dataclass(frozen=True)
class GamePlan:
    app_id: int
    name: str = ""


@dataclass(frozen=True)
class LibraryPlan:
    games: Sequence[tuple[int, str]]
    exclude: Sequence[int] = ()


@dataclass
class _Game:
    app_id: int
    name: str
    targets: list[str]
    total: int = 0
    done: int = 0
    unlocked: int = 0
    skipped: int = 0
    failed: int = 0


@dataclass(frozen=True)
class _Snapshot:
    phase: str
    mode: str | None
    current: tuple | None
    wait_until: float | None
    queue: tuple
    finished: tuple
    totals: tuple
    last_error: str | None
    paused: bool
    suspended: bool


class AchievementQueue:
    """Call step() from one place only; start and skip are queued and applied one per step, stop clears the queue."""

    def __init__(self, read_achievements: Callable[[int], list[Achievement]],
                 unlock: Callable[[int, list[str]], UnlockOutcome], clock: Callable[[], float],
                 uniform: Callable[[float, float], float], guard: Callable[[], str | None] | None = None):
        self._read, self._unlock, self._clock, self._uniform, self._guard = read_achievements, unlock, clock, uniform, guard
        self._lock = threading.Lock()
        self._commands: list[tuple[Callable, tuple]] = []
        self._closed = self._stop_req = self._pause_req = self._suspend_req = False
        self._phase, self._mode, self._rules = "idle", None, Rules()
        self._reset_run()
        self._publish()

    def _reset_run(self) -> None:
        self._queue: list[tuple[int, str]] = []
        self._cur: _Game | None = None
        self._requested: list[str] | None = None
        self._finished: list[tuple] = []
        self._totals = dict.fromkeys(("unlocked", "already", "skipped", "rejected", "failed"), 0)
        self._wait_until: float | None = None
        self._last_error: str | None = None

    # commands: record intent only
    def start(self, plan: SelectedPlan | GamePlan | LibraryPlan, rules: Rules = Rules()) -> None:
        with self._lock:
            self._pause_req = False
            self._commands.append((self._do_start, (plan, rules)))

    def stop(self) -> None:
        with self._lock:
            self._stop_req, self._pause_req = True, False
            self._commands[:] = [(self._do_stop, ())]

    def close(self) -> None:
        """Permanent stop for shutdown: like stop() and every later start is ignored."""
        with self._lock:
            self._closed = True
        self.stop()

    def pause(self) -> None:
        with self._lock:
            self._pause_req = True

    def resume(self) -> None:
        with self._lock:
            self._pause_req = False

    def set_suspended(self, flag: bool) -> None:
        with self._lock:
            self._suspend_req = bool(flag)

    def skip_current(self) -> None:
        with self._lock:
            self._commands.append((self._do_skip, ()))

    def abort(self, code: str) -> None:
        """Crash path, only when no step is running: forget everything and report stopped with `code`."""
        with self._lock:
            self._commands.clear()
            self._stop_req = True
        self._halt(code)
        self._publish()

    def step(self) -> float:
        """At most one transition or one blocking call; returns the seconds until the next call is useful."""
        try:
            with self._lock:
                command = self._commands.pop(0) if self._commands else None
                blocked = self._pause_req or self._suspend_req
            if command is not None:
                command[0](*command[1])
            elif not blocked:
                if self._phase == "scanning":
                    self._scan()
                elif self._phase == "unlocking":
                    self._write()
                elif self._phase == "waiting" and self._clock() >= self._wait_until:
                    self._wait_until = None
                    self._phase = "unlocking" if self._cur is not None else "scanning"
            return self._delay()
        finally:
            self._publish()

    def _delay(self) -> float:
        with self._lock:
            if self._commands:
                return 0.0
            blocked = self._pause_req or self._suspend_req
        if self._phase not in _ACTIVE or blocked:
            return _IDLE_SECONDS
        if self._phase == "waiting":
            return min(max(self._wait_until - self._clock(), 0.0), _IDLE_SECONDS)
        return 0.0

    def _publish(self) -> None:
        with self._lock:
            paused, suspended = self._pause_req, self._suspend_req
            halted = self._closed or self._stop_req
        if halted and self._phase in _ACTIVE:  # a stop or close that no step has applied yet is already in force
            self._snap = _Snapshot("stopped", self._mode, None, None, (), tuple(self._finished),
                                   tuple(self._totals.items()), self._last_error, False, False)
            return
        cur = self._cur
        self._snap = _Snapshot(
            self._phase, self._mode, None if cur is None else (cur.app_id, cur.name, cur.done, cur.total),
            self._wait_until, tuple(self._queue[:_LIST_CAP]), tuple(self._finished), tuple(self._totals.items()),
            self._last_error, paused, suspended)

    def status(self) -> dict:
        snap = self._snap
        active = snap.phase in _ACTIVE
        paused, suspended = active and snap.paused, active and snap.suspended
        current = snap.current
        return {
            "state": "paused" if paused else "suspended" if suspended else snap.phase,
            "mode": snap.mode,
            "current": None if current is None else dict(zip(("appId", "name", "done", "total"), current)),
            "nextUnlockInSeconds": None if snap.wait_until is None else max(snap.wait_until - self._clock(), 0.0),
            "queue": [{"appId": app_id, "name": name} for app_id, name in snap.queue],
            "finished": [dict(zip(("appId", "name", "unlocked", "skipped", "failed", "note"), row))
                         for row in snap.finished],
            "totals": dict(snap.totals),
            "lastError": snap.last_error,
            "paused": paused,
            "suspended": suspended,
        }

    # command handlers
    def _do_start(self, plan, rules: Rules) -> None:
        if self._closed:
            return
        with self._lock:
            self._stop_req = False
        if self._phase not in _RESTARTABLE:
            return
        self._reset_run()
        self._rules = rules
        if isinstance(plan, LibraryPlan):
            excluded = set(plan.exclude)
            self._mode, self._queue = "library", [(a, n) for a, n in plan.games if a not in excluded]
        elif isinstance(plan, SelectedPlan):
            self._mode, self._queue, self._requested = "selected", [(plan.app_id, plan.name)], list(dict.fromkeys(plan.names))
        else:
            self._mode, self._queue = "game", [(plan.app_id, plan.name)]
        self._phase = "scanning"

    def _do_stop(self) -> None:
        self._halt(None)

    def _do_skip(self) -> None:
        if self._cur is not None and self._phase in _ACTIVE:
            self._wait_until = None
            self._finish("skipped_by_user")

    def _halt(self, code: str | None) -> None:
        self._queue, self._cur, self._wait_until, self._phase = [], None, None, "stopped"
        with self._lock:
            self._pause_req = False
        if code:
            self._last_error = code

    def _finish(self, note: str | None) -> None:
        game = self._cur
        self._finished = ([(game.app_id, game.name, game.unlocked, game.skipped, game.failed, note)]
                          + self._finished)[:_LIST_CAP]
        self._cur = None
        self._phase = "scanning" if self._queue else "done"

    # writing is allowed only through here
    def _refusal(self) -> str | None:
        with self._lock:
            if self._closed or self._stop_req:
                return "stopped"
            if self._pause_req:
                return "paused"
            if self._suspend_req:
                return "suspended"
        return None if self._guard is None else self._guard()

    def _refuse(self, why: str) -> None:
        if why in ("paused", "suspended"):  # a guard-sourced pause behaves like the command
            with self._lock:
                if why == "paused":
                    self._pause_req = True
                else:
                    self._suspend_req = True
            return
        self._halt(None if why == "stopped" else why)

    def _scan(self) -> None:
        with self._lock:
            if self._closed or self._stop_req:  # the queued stop is applied next; do not start a long read
                return
        if self._cur is None:
            if not self._queue:
                self._phase = "done"
                return
            app_id, name = self._queue.pop(0)
            self._cur = _Game(app_id, name, [])
            return
        game = self._cur
        try:
            items = self._read(game.app_id)
        except AchievementsError as error:
            logger.error("achievements read failed: %s", error.code)
            self._finish("read_failed")
            if error.code in _FATAL:
                self._halt(error.code)
            return
        self._open(game, items)

    def _open(self, game: _Game, items: list[Achievement]) -> None:
        if not items:
            return self._finish("no_achievements")
        by_name = {item.api_name: item for item in items}
        wanted = self._requested if self._requested is not None else [i.api_name for i in items if not i.achieved]
        for name in wanted:
            item = by_name.get(name)
            if item is None:
                self._totals["rejected"] += 1
            elif item.achieved:
                self._totals["already"] += 1
            elif item.hidden and self._rules.skip_hidden:
                game.skipped += 1
                self._totals["skipped"] += 1
            else:
                game.targets.append(name)
        game.total = len(game.targets)
        if not game.targets:
            return self._finish("nothing_missing" if not game.skipped else None)
        self._phase = "unlocking"

    def _paced(self) -> bool:
        return self._rules.min_minutes > 0 or self._rules.max_minutes > 0

    def _write(self) -> None:
        game = self._cur
        batch = game.targets[:1 if self._paced() else MAX_UNLOCK_NAMES]
        if (why := self._refusal()) is not None:
            return self._refuse(why)
        try:
            outcome = self._unlock(game.app_id, list(batch))
        except AchievementsError as error:
            return self._on_error(game, error, len(batch))
        self._apply(game, batch, outcome)

    def _on_error(self, game: _Game, error: AchievementsError, batch_size: int) -> None:
        logger.error("achievements unlock failed: %s (wrote=%s)", error.code, error.wrote)
        lost = batch_size if error.wrote else len(game.targets)
        game.failed += lost
        self._totals["failed"] += lost
        self._finish(error.code)
        if error.wrote or error.code in _FATAL:
            self._halt(error.code)

    def _apply(self, game: _Game, batch: list[str], outcome: UnlockOutcome) -> None:
        failed = 0
        for item in outcome.results:
            key = _RESULT_TOTAL.get(item.result)
            if key is None:
                failed += 1
                continue
            self._totals[key] += 1
            game.unlocked += key == "unlocked"
        game.failed += failed
        self._totals["failed"] += failed
        game.done += len(batch)
        del game.targets[:len(batch)]
        if outcome.uncertain or failed or len(outcome.results) != len(batch):
            self._finish("unlock_uncertain")
            return self._halt("unlock_uncertain")
        if not game.targets:
            self._finish(None)
        if self._paced() and outcome.changed and self._phase != "done":
            low = self._rules.min_minutes * 60
            self._wait_until = self._clock() + self._uniform(low, max(self._rules.max_minutes * 60, low))
            self._phase = "waiting"
