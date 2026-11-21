"""The achievements run of the Steam IDLE controller: settings, prepare phase, step loop, write guard and commands.

Every dependency comes through the constructor (the shared gate, the library cache, settings, the Steam client account
reader, the clock, the sleep hook), so the class is as testable as the controller. Commands return None on success or
a refusal code from the service contract; no account identifier is ever stored in a payload.
"""
import asyncio
import concurrent.futures
import dataclasses
import logging
import threading
import time
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from .achievement_queue import AchievementQueue, GamePlan, LibraryPlan, Rules, SelectedPlan
from .community import CommunityError
from .interrupted import InterruptedStore, account_hash
from .wake import Wake

if TYPE_CHECKING:
    from .controller import SteamClient, Tools
    from .protection import ProtectionChecker

logger = logging.getLogger(__name__)

ACHIEVEMENTS_ACK_KEY = "steam_idle_achievements_ack"
UNLOCK_MIN_KEY, UNLOCK_MAX_KEY = "steam_idle_unlock_min_minutes", "steam_idle_unlock_max_minutes"
SKIP_HIDDEN_KEY = "steam_idle_unlock_skip_hidden"
_MAX_PACE_MINUTES = 1440
_ENDED = frozenset({"idle", "done", "stopped"})
_TICK_SECONDS = 5.0
_SUMMARY_KEYS = ("kind", "startedAt", "gamesDone", "gamesTotal", "unlocked")
_NOT_FINISHED = frozenset({"stopped", "uncertain", "unlock_uncertain", "protection_unknown"})  # cut short or unchecked
_CLASSIFY_WAIT_SECONDS = 15.0  # a request (10 s) plus the spacing between requests (1.5 s) and slack


class AchievementsRun:
    def __init__(self, *, gate: Callable[[bool], "tuple[str | None, Tools, SteamClient | None]"],
                 get_setting: Callable[..., object], set_setting: Callable[[str, object], None],
                 risk_acknowledged: Callable[[], bool], client_state: "Callable[[], SteamClient]",
                 read_achievements: Callable[..., list], unlock: Callable[..., object], read_library: Callable[..., list],
                 cached_games: Callable[[int], list | None], cached_preview: Callable[[int], list | None],
                 store_library: Callable[[int, list], None],
                 session_error: Callable[[str], bool], is_closed: Callable[[], bool], steam_id: Callable[[int], str],
                 clock: Callable[[], float], uniform: Callable[[float, float], float],
                 sleep: Callable[[float], Awaitable[None]], protection: "ProtectionChecker",
                 store: InterruptedStore, wall_clock: Callable[[], float] = time.time,
                 user_denied: Callable[[int], bool] = lambda app_id: False):
        self._gate, self._get_setting, self._set_setting = gate, get_setting, set_setting
        self._protection, self._user_denied = protection, user_denied  # user_denied: the user's own anti-cheat games
        self._store, self._wall_clock = store, wall_clock
        self._interrupted: dict | None = store.load()  # a run the last session did not finish; never started by itself
        self._record: dict | None = None  # the record of the run in progress, rewritten whenever a game finishes
        self._closing = self._keep_record = False
        self._event_loop: asyncio.AbstractEventLoop | None = None
        self._risk_acknowledged, self._client_state = risk_acknowledged, client_state
        self._read_ach, self._unlock_ach, self._read_library = read_achievements, unlock, read_library
        self._cached_games, self._store_library, self._session_error = cached_games, store_library, session_error
        self._cached_preview = cached_preview
        self._is_closed, self._steam_id, self._sleep = is_closed, steam_id, sleep
        self._step_done = threading.Event()  # set while no queue step is running in the worker thread
        self._step_done.set()
        self._unlock_in_flight = threading.Event()  # set only while an unlock call runs in the worker thread
        self._wake = Wake()
        self._queue = AchievementQueue(self._queue_read, self._queue_unlock, clock, uniform, self._queue_guard,
                                       on_command=self._wake.set, classify=self._queue_classify,
                                       on_finished=self._on_game_finished, on_written=self._on_written)
        self._tools: "Tools | None" = None
        self._account, self._expected = 0, ""
        self._preparing = self._cancel = self._reading = False
        self.task: asyncio.Task | None = None

    # state
    def payload(self) -> dict:
        return {"acknowledged": bool(self._get_setting(ACHIEVEMENTS_ACK_KEY, False)), "settings": self.settings(),
                "run": self._run_status(), "interrupted": self._interrupted_summary()}

    def _interrupted_summary(self) -> dict | None:
        record = self._interrupted
        return None if record is None else {key: record[key] for key in _SUMMARY_KEYS}

    def settings(self) -> dict:
        low, high = self._setting_minutes(UNLOCK_MIN_KEY), self._setting_minutes(UNLOCK_MAX_KEY)
        skip = self._get_setting(SKIP_HIDDEN_KEY, True)
        return {"minMinutes": low, "maxMinutes": high, "skipHidden": skip if type(skip) is bool else True}

    def _setting_minutes(self, key: str) -> int:
        value = self._get_setting(key, 0)
        return value if type(value) is int and 0 <= value <= _MAX_PACE_MINUTES else 0

    def _run_status(self) -> dict:
        run = self._queue.status()
        if self._preparing and run["state"] == "idle":  # the owned games are being read before the queue starts
            run.update(state="scanning", mode="library")
        return run

    def active(self) -> bool:
        return self.task is not None and not self.task.done()

    @property
    def reading(self) -> bool:
        return self._reading

    @property
    def unlock_in_flight(self) -> bool:
        return self._unlock_in_flight.is_set()

    def wait_idle(self, timeout: float) -> bool:
        """Thread: wait for the running queue step (a read or an unlock call) to return; False on timeout."""
        return self._step_done.wait(timeout)

    # commands: None = accepted, otherwise a refusal code
    def acknowledge(self, accepted: bool) -> None:
        self._set_setting(ACHIEVEMENTS_ACK_KEY, bool(accepted))
        if not accepted:
            self.stop()

    def set_settings(self, min_minutes: object, max_minutes: object, skip_hidden: object) -> str | None:
        ints = (min_minutes, max_minutes)
        if (any(type(value) is not int or not 0 <= value <= _MAX_PACE_MINUTES for value in ints)
                or min_minutes > max_minutes or type(skip_hidden) is not bool):
            return "invalid_request"
        self._set_setting(UNLOCK_MIN_KEY, min_minutes)
        self._set_setting(UNLOCK_MAX_KEY, max_minutes)
        self._set_setting(SKIP_HIDDEN_KEY, skip_hidden)
        return None

    async def read(self, app_id: int) -> list[dict] | str:
        """Live read of one game's achievements: a refusal code, or the list; AchievementsError when the read failed."""
        refusal, tools, client = self._gate(True)
        if refusal is not None:
            return refusal
        steam_id = self._steam_id(client.account_id)

        def blocking_read() -> list:  # the thread releases the flag itself, so a cancelled request cannot free it early
            try:
                return self._read_ach(tools.helper, steam_id, app_id)
            finally:
                self._reading = False
        self._reading = True
        items = await asyncio.to_thread(blocking_read)
        return [{"apiName": a.api_name, "name": a.name, "description": a.description, "hidden": a.hidden,
                 "achieved": a.achieved, "unlockTime": a.unlock_time} for a in items]

    def start(self, plan: SelectedPlan | GamePlan | LibraryPlan, account_hash_required: str | None = None) -> str | None:
        refusal, tools, client = self._gate(True)
        if refusal is not None:
            return refusal
        expected = self._steam_id(client.account_id)
        if account_hash_required is not None and account_hash(expected) != account_hash_required:
            return "account_changed"
        if not isinstance(plan, LibraryPlan) and (self._protection.is_builtin(plan.app_id) or self._user_denied(plan.app_id)):
            return "protected_app"
        self._tools, self._account, self._expected = tools, client.account_id, expected
        self._cancel, self._preparing, self._keep_record = False, False, False
        settings = self.settings()
        rules = Rules(settings["minMinutes"], settings["maxMinutes"], settings["skipHidden"])
        self._event_loop = asyncio.get_running_loop()
        self.task = self._event_loop.create_task(self._loop(plan, rules))
        return None

    def resume_interrupted(self, library_confirmed: bool) -> str | None:
        """Start the interrupted run again minus the games it had finished, through the normal start path."""
        record = self._interrupted
        if record is None:
            return "no_interrupted_run"
        finished = set(record["finished"])
        if record["kind"] == "library":
            if not library_confirmed:
                return "invalid_request"
            plan = LibraryPlan((), sorted(set(record["exclude"]) | finished))
        elif record["appId"] in finished:
            self.discard_interrupted()
            return "no_interrupted_run"
        elif record["kind"] == "selected":
            plan = SelectedPlan(record["appId"], record["names"], record["name"])
        else:
            plan = GamePlan(record["appId"], record["name"])
        return self.start(plan, account_hash_required=record["accountHash"])

    def discard_interrupted(self) -> None:
        """Forget the interrupted run; the file of a run in progress is not touched."""
        self._interrupted = None
        if not self.active():
            self._store.delete()

    def stop(self) -> None:
        if self.active():
            self._cancel = True
            self._queue.stop()

    def interrupt(self) -> None:
        """Stop like a user stop, but keep the record of the run so it is offered as an interrupted run (module off)."""
        if self.active():
            self._keep_record = True
            self.stop()

    def pause(self) -> None:
        if self.active():
            self._queue.pause()

    def resume(self) -> None:
        if self.active():
            self._queue.resume()

    def skip(self) -> None:
        if self.active():
            self._queue.skip_current()

    def set_suspended(self, flag: bool) -> None:
        self._queue.set_suspended(flag)

    def close(self) -> None:
        """For shutdown: nothing new is written from now on, and the record of a run in progress stays on disk."""
        self._closing = self._cancel = True
        self._queue.close()

    # the run
    def _queue_read(self, app_id: int) -> list:
        return self._read_ach(self._tools.helper, self._expected, app_id)

    def _queue_unlock(self, app_id: int, names: list[str]):
        """The one write path; the helper's write gate is set inside achievements.unlock_achievements, child env only."""
        self._unlock_in_flight.set()
        try:
            return self._unlock_ach(self._tools.helper, self._expected, app_id, names)
        finally:
            self._unlock_in_flight.clear()

    def _queue_classify(self, app_id: int) -> str:
        """Step thread: the anti-cheat verdict, asked of the checker on the event loop. Anything but an answer is unknown;
        a shutdown or stop abandons the wait. A game on the user's own list is protected without asking the store."""
        if self._user_denied(app_id):
            return "protected"
        future = asyncio.run_coroutine_threadsafe(self._protection.classify(app_id), self._event_loop)
        deadline = time.monotonic() + _CLASSIFY_WAIT_SECONDS
        while True:
            try:
                return future.result(timeout=0.25)
            except concurrent.futures.TimeoutError:
                if future.done():  # the checker itself raised TimeoutError: that is its answer, not a slow wait
                    try:
                        return future.result()
                    except Exception:
                        logger.error("anti-cheat check for app %s failed", app_id, exc_info=True)
                        return "unknown"
                if self._cancel or self._is_closed() or time.monotonic() > deadline:
                    future.cancel()
                    logger.warning("anti-cheat check for app %s abandoned", app_id)
                    return "unknown"
            except Exception:
                logger.error("anti-cheat check for app %s failed", app_id, exc_info=True)
                return "unknown"

    def _queue_guard(self) -> str | None:
        """Runs in the step thread right before every unlock: both acknowledgements still given, same account."""
        if not (self._risk_acknowledged() and self._get_setting(ACHIEVEMENTS_ACK_KEY, False)):
            return "not_acknowledged"
        if self._client_state().account_id != self._account:
            return "account_changed"
        return None

    def _step(self) -> float:
        self._step_done.clear()
        try:
            return self._queue.step()
        finally:
            self._step_done.set()

    async def _prepare(self, plan):
        """The plan with its game names filled in (the owned games are read first when needed), or None if the run
        must not start: stopped meanwhile, or the games could not be read."""
        games = self._cached_games(self._account)
        if isinstance(plan, LibraryPlan) and games is None:
            self._preparing = True
            try:
                games = await asyncio.to_thread(self._read_library, self._tools.community,
                                                expected_steam_id64=self._expected)
            except CommunityError as error:
                logger.error("library read for the achievements run failed: %s", error.code)
                self._queue.abort(error.code if self._session_error(error.code) else "library_failed")
                return None
            finally:
                self._preparing = False
            self._store_library(self._account, games)
        if self._cancel or self._is_closed():
            return None
        if isinstance(plan, LibraryPlan):
            return dataclasses.replace(plan, games=[(g.app_id, g.name) for g in games])
        # the cached owned games first, then the cached drops preview; no read is made, and no name is invented
        names = {g.app_id: g.name for g in self._cached_preview(self._account) or []}
        names.update({g.app_id: g.name for g in games or []})
        return dataclasses.replace(plan, name=plan.name or names.get(plan.app_id) or f"App {plan.app_id}")

    def _begin_record(self, plan) -> None:
        """The record of the run that is about to start; the account is stored as a hash only."""
        record = {"version": 1, "startedAt": self._wall_clock(), "appId": None, "name": None, "names": None,
                  "exclude": None, "finished": [], "gamesDone": 0, "unlocked": 0, "accountHash": account_hash(self._expected)}
        if isinstance(plan, LibraryPlan):
            excluded = set(plan.exclude)
            record.update(kind="library", exclude=list(plan.exclude),
                          gamesTotal=sum(1 for app_id, _ in plan.games if app_id not in excluded))
        else:
            record.update(kind="selected" if isinstance(plan, SelectedPlan) else "game", appId=plan.app_id,
                          name=plan.name, gamesTotal=1)
            if isinstance(plan, SelectedPlan):
                record["names"] = list(plan.names)
        self._record = record
        self._store.save(record)  # one atomic write: it replaces the record of an earlier interrupted run
        self._interrupted = None

    def _on_game_finished(self, app_id: int, note: str | None, unlocked: int) -> None:
        """Step thread: a game was done with. One cut short (stopped, uncertain) is not counted, so a resume redoes it."""
        record = self._record
        if record is None:
            return
        if note not in _NOT_FINISHED:
            record["finished"].append(app_id)
            record["gamesDone"] = len(record["finished"])
        record["unlocked"] = unlocked
        self._store.save(record)

    def _on_written(self, unlocked: int) -> None:
        """Step thread: a write batch changed the account; the count of an unfinished game survives a restart."""
        record = self._record
        if record is not None:
            record["unlocked"] = unlocked
            self._store.save(record)

    def _end_record(self) -> None:
        """The run is over: its record goes when the queue finished or the user stopped it. A run that halted with an
        error code, or was interrupted by turning the module off, keeps the record and offers it as an interrupted
        run (a resume still checks the account)."""
        record, self._record = self._record, None
        if record is None:
            return
        run = self._queue.status()
        if run["state"] == "done" or (run["lastError"] is None and not self._keep_record):
            self._store.delete()
        else:
            self._interrupted = record

    async def _loop(self, plan, rules: Rules) -> None:
        try:
            self._wake.bind()
            if (plan := await self._prepare(plan)) is not None:
                self._begin_record(plan)
                self._queue.start(plan, rules)
            while True:
                if self._client_state().account_id != self._account:
                    self._queue.abort("account_changed")  # no step is running here, so nothing can be written meanwhile
                self._wake.clear()  # a command from here on ends the sleep below at once
                delay = await asyncio.to_thread(self._step)
                if self._queue.status()["state"] in _ENDED and delay > 0 and not self._queue.pending():
                    return
                await self._wake.sleep(self._sleep, min(delay, _TICK_SECONDS))
        except Exception:
            logger.error("steam idle achievements loop crashed", exc_info=True)
            self._queue.abort("internal_error")
        finally:
            if not self._closing:  # a shutdown keeps the record: the run was interrupted, not ended
                self._end_record()
