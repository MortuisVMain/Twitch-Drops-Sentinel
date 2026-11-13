"""Service-facing Steam IDLE controller: tool discovery, Steam client state, community session and the farm loop.

Every external effect is an injected callable, so tests need no Steam, no node and no real time. Commands return
None on success or a refusal code from the service contract; no account identifier is ever stored in a payload.
"""
import asyncio
import dataclasses
import logging
import random
import shutil
import sys
import threading
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from . import achievements, community
from ._helper import command as build_command, kill_tree, spawn
from .achievement_queue import AchievementQueue, GamePlan, LibraryPlan, Rules, SelectedPlan
from .achievements import AchievementsError
from .community import CommunityError
from .farm import CardFarm, FarmRules
from .presence import Presence

logger = logging.getLogger(__name__)

RISK_ACK_KEY = "steam_idle_risk_ack"
ACHIEVEMENTS_ACK_KEY = "steam_idle_achievements_ack"
UNLOCK_MIN_KEY, UNLOCK_MAX_KEY = "steam_idle_unlock_min_minutes", "steam_idle_unlock_max_minutes"
SKIP_HIDDEN_KEY = "steam_idle_unlock_skip_hidden"
_MAX_PACE_MINUTES = 1440
_STEAM_ID_BASE = 76561197960265728
_REGISTRY_KEY = r"Software\Valve\Steam\ActiveProcess"
_HELPER_CANDIDATES = (
    Path("steam_idle") / "SteamIdleProbe.exe",
    Path("tools") / "steam_idle_probe" / "bin" / "Release" / "net10.0-windows" / "SteamIdleProbe.exe",
)
_ENDED = frozenset({"idle", "done", "stopped", "needs_login"})
_TICK_SECONDS = 5.0
_RELEASE_SECONDS = 3.0
_SESSION_BY_CODE = {"signed_out": "signed_out", "account_mismatch": "account_mismatch"}


_PREVIEW_CAP = 200


def steam_id64(account_id: int) -> str:
    return str(_STEAM_ID_BASE + account_id)


def steam_idle_backend_kind(test_mode: bool, live_flag: bool) -> str:
    """"inert" only in test mode without the explicit SENTINEL_STEAM_IDLE_LIVE opt-in, otherwise "real"."""
    return "inert" if test_mode and not live_flag else "real"


def _preview_error(code: str) -> str:
    return "failed" if code.startswith("failed:") else code


@dataclass(frozen=True)
class SteamClient:
    running: bool
    account_id: int  # 0 when nobody is signed in

    @property
    def signed_in(self) -> bool:
        return self.running and self.account_id != 0


@dataclass(frozen=True)
class Tools:
    unavailable: str | None  # None, helper_missing, node_missing or unsupported
    helper: Path | None = None
    community: tuple[str, ...] = ()  # node executable and the community script


def find_tools(app_root: Path, engine_root: Path, which: Callable[[str], str | None] = shutil.which,
               platform_name: str = sys.platform) -> Tools:
    """Installed helper first, then the dev build; node is found the way the giveaways controller finds it."""
    if platform_name != "win32":
        return Tools("unsupported")
    helper = next((path for path in (app_root / rel for rel in _HELPER_CANDIDATES) if path.is_file()), None)
    if helper is None:
        return Tools("helper_missing")
    node, script = which("node"), engine_root / "steam-community.js"
    if node is None or not script.is_file():
        return Tools("node_missing")
    return Tools(None, helper, (node, str(script)))


def _registry_value(name: str) -> int | None:
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REGISTRY_KEY) as key:
            return winreg.QueryValueEx(key, name)[0]
    except OSError as error:  # Steam never ran for this user: a normal state
        logger.debug("steam registry value %s not readable: %s", name, error)
        return None


def _pid_exists(pid: int) -> bool:
    import psutil
    return psutil.pid_exists(pid)


def read_steam_client(read_value: Callable[[str], int | None] = _registry_value,
                      pid_exists: Callable[[int], bool] = _pid_exists) -> SteamClient:
    pid, user = read_value("pid"), read_value("ActiveUser")
    if type(pid) is not int or pid <= 0 or not pid_exists(pid):
        return SteamClient(False, 0)
    return SteamClient(True, user if type(user) is int and user > 0 else 0)


class HeldPresence:
    """The farm's presence interface (`start(app_id)`) bound to one helper and one account."""

    def __init__(self, helper: Path, steam_id: str):
        self._helper, self._steam_id, self._presence = helper, steam_id, Presence()

    def start(self, app_id: int) -> None:
        self._presence.start(self._helper, self._steam_id, app_id)

    def stop(self) -> None:
        self._presence.stop()

    def is_running(self) -> bool:
        return self._presence.is_running()


async def run_login(prefix: Sequence[str]) -> int | None:
    """Run `<node> steam-community.js login` (its browser window is the visible part) until it exits."""
    proc = spawn(build_command(prefix, "login"))
    try:
        proc.stdin.close()
        return await asyncio.to_thread(proc.wait)
    finally:
        await asyncio.to_thread(kill_tree, proc)
        for stream in (proc.stdin, proc.stdout):
            stream.close()


class SteamIdleController:
    def __init__(self, *, get_setting: Callable[..., object], set_setting: Callable[[str, object], None],
                 find_tools: Callable[[], Tools], client_state: Callable[[], SteamClient],
                 read_drops: Callable[..., list], read_library: Callable[..., list], read_status: Callable[..., None],
                 presence_factory: Callable[[Path, str], object],
                 run_login: Callable[[Sequence[str]], Awaitable[object]], clock: Callable[[], float],
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep, rules: FarmRules | None = None,
                 kill_reads: Callable[[], None] = lambda: None,
                 read_achievements: Callable[..., list] | None = None, unlock: Callable[..., object] | None = None,
                 uniform: Callable[[float, float], float] = random.uniform):
        self._get_setting, self._set_setting = get_setting, set_setting
        self._find_tools, self._client_state = find_tools, client_state
        self._read_drops_fn, self._read_library_fn, self._read_status_fn = read_drops, read_library, read_status
        self._presence_factory, self._run_login, self._clock, self._sleep = presence_factory, run_login, clock, sleep
        self._kill_reads = kill_reads
        self._read_ach, self._unlock_ach = read_achievements or _never, unlock or _never
        self._step_done = threading.Event()  # set while no farm step is running in the worker thread
        self._step_done.set()
        self._achv_step_done = threading.Event()  # the same for the achievements queue
        self._achv_step_done.set()
        self._farm = CardFarm(rules or FarmRules(), self._read_drops, self._new_presence, clock, self._hold_guard)
        self._queue = AchievementQueue(self._queue_read, self._queue_unlock, clock, uniform, self._queue_guard)
        self._achv_tools: Tools | None = None
        self._achv_account, self._achv_expected = 0, ""
        self._achv_preparing = self._achv_cancel = self._achv_reading = False
        self._achv_task = self._library_task = None
        self._library: tuple[int, list, float] | None = None  # account id, owned games, read time
        self._library_error: str | None = None
        self._session, self._checked_account, self._checked_at = "unknown", 0, None
        self._task = self._login_task = self._check_task = None
        self._suspend_sent = False
        self._live: list = []
        self._run_tools: Tools | None = None
        self._expected: str | None = None
        self._run_account = 0
        self._run_error: str | None = None
        self._library_fetched = False
        self._scan_task = None
        self._closed = False
        self._preview: tuple[int, list, float] | None = None  # account id, farmable games, read time
        self._preview_error: str | None = None

    # payload
    def state(self) -> dict:
        tools = self._find_tools()
        client = self._client_state() if tools.unavailable is None else SteamClient(False, 0)
        farm = self._farm.status()
        if self._run_error and farm["state"] in ("stopped", "needs_login"):
            farm["lastError"] = self._run_error
        age = None if self._checked_at is None else self._clock() - self._checked_at
        return {
            "available": tools.unavailable is None,
            "unavailableReason": tools.unavailable,
            "riskAcknowledged": bool(self._get_setting(RISK_ACK_KEY, False)),
            "steam": {"running": client.running, "signedIn": client.signed_in},
            "community": {"session": self._session, "checkedAgeSeconds": age},
            "farm": farm,
            "library": self._library_payload(client.account_id),
            "preview": self._preview_payload(client.account_id),
            "achievements": {
                "acknowledged": bool(self._get_setting(ACHIEVEMENTS_ACK_KEY, False)),
                "settings": self._achv_settings(),
                "run": self._achv_run(),
            },
        }

    def _library_payload(self, account_id: int) -> dict:
        """The owned games cache. Dropped lazily when the account changed or the session signed out."""
        library = self._library
        if self._session in ("signed_out", "account_mismatch") or (library and account_id not in (0, library[0])):
            self._library = library = self._library_error = None
        if self._library_scan_running():
            status = "scanning"
        else:
            status = "failed" if self._library_error else "ready" if library else "none"
        return {"count": len(library[1]) if library else None, "status": status,
                "ageSeconds": None if library is None else self._clock() - library[2]}

    def _achv_settings(self) -> dict:
        low, high = self._setting_minutes(UNLOCK_MIN_KEY), self._setting_minutes(UNLOCK_MAX_KEY)
        skip = self._get_setting(SKIP_HIDDEN_KEY, True)
        return {"minMinutes": low, "maxMinutes": high, "skipHidden": skip if type(skip) is bool else True}

    def _setting_minutes(self, key: str) -> int:
        value = self._get_setting(key, 0)
        return value if type(value) is int and 0 <= value <= _MAX_PACE_MINUTES else 0

    def _achv_run(self) -> dict:
        run = self._queue.status()
        if self._achv_preparing and run["state"] == "idle":  # the owned games are being read before the queue starts
            run.update(state="scanning", mode="library")
        return run

    def _store_library(self, account_id: int, games: list) -> None:
        self._library, self._library_error = (account_id, games, self._clock()), None

    def _preview_payload(self, account_id: int) -> dict:
        """The farmable games read on demand. Dropped lazily when the account changed or the session signed out."""
        preview = self._preview
        if self._session in ("signed_out", "account_mismatch") or (preview and account_id not in (0, preview[0])):
            self._preview = preview = self._preview_error = None
        games, age = (preview[1], self._clock() - preview[2]) if preview else ([], None)
        if self._scan_running():
            status = "scanning"
        else:
            status = "failed" if self._preview_error else "ready" if preview else "none"
        return {
            "status": status, "ageSeconds": age, "error": self._preview_error,
            "games": [{"appId": g.app_id, "name": g.name, "dropsRemaining": g.drops_remaining,
                       "playtimeHours": g.playtime_hours} for g in games[:_PREVIEW_CAP]],
            "totalDropsRemaining": sum(g.drops_remaining for g in games),
        }

    def _store_preview(self, account_id: int, drops: list) -> None:
        self._preview, self._preview_error = (account_id, community.farmable(drops), self._clock()), None

    # commands: None = accepted, otherwise a refusal code
    def acknowledge(self, accepted: bool) -> None:
        self._set_setting(RISK_ACK_KEY, bool(accepted))
        if not accepted and self._running():
            self._farm.stop()

    def start(self) -> str | None:
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable"
        if not self._get_setting(RISK_ACK_KEY, False):
            return "risk_not_acknowledged"
        client = self._client_state()
        if (refusal := self._client_refusal(client)) is not None:
            return refusal
        if self._busy() or self._running() or self._achv_active():  # a second start must never rebind the run
            return "busy"
        if self._session == "account_mismatch" or (self._session == "signed_in" and self._checked_account != client.account_id):
            return "account_mismatch"
        if self._session != "signed_in":
            return "community_signed_out"
        self._run_tools, self._run_account, self._expected = tools, client.account_id, steam_id64(client.account_id)
        self._run_error, self._library_fetched = None, False
        self._farm.start()
        self._task = asyncio.get_running_loop().create_task(self._run_loop())
        return None

    def _read_gate(self, achievements_ack: bool = False) -> tuple[str | None, Tools, SteamClient | None]:
        """The gates shared by every on-demand read and the achievements start: (refusal, tools, client)."""
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable", tools, None
        if not self._get_setting(RISK_ACK_KEY, False):
            return "risk_not_acknowledged", tools, None
        if achievements_ack and not self._get_setting(ACHIEVEMENTS_ACK_KEY, False):
            return "achievements_not_acknowledged", tools, None
        client = self._client_state()
        if (refusal := self._client_refusal(client)) is not None:
            return refusal, tools, client
        if self._closed or self._busy() or self._running() or self._achv_active():
            return "busy", tools, client
        if self._session == "account_mismatch" or (self._session == "signed_in" and self._checked_account != client.account_id):
            return "account_mismatch", tools, client
        if self._session != "signed_in":
            return "community_signed_out", tools, client
        return None, tools, client

    def scan(self) -> str | None:
        """Read the card drops on demand for the preview; same gates as start, never while another job runs."""
        refusal, tools, client = self._read_gate()
        if refusal is None:
            self._start_scan(tools, client.account_id)
        return refusal

    # achievements: commands return None = accepted, otherwise a refusal code
    def acknowledge_achievements(self, accepted: bool) -> None:
        self._set_setting(ACHIEVEMENTS_ACK_KEY, bool(accepted))
        if not accepted:
            self.stop_achievements()

    def set_achievements_settings(self, min_minutes: object, max_minutes: object, skip_hidden: object) -> str | None:
        ints = (min_minutes, max_minutes)
        if (any(type(value) is not int or not 0 <= value <= _MAX_PACE_MINUTES for value in ints)
                or min_minutes > max_minutes or type(skip_hidden) is not bool):
            return "invalid_request"
        self._set_setting(UNLOCK_MIN_KEY, min_minutes)
        self._set_setting(UNLOCK_MAX_KEY, max_minutes)
        self._set_setting(SKIP_HIDDEN_KEY, skip_hidden)
        return None

    def library_scan(self) -> str | None:
        """Read the owned games on demand; same gates as scan."""
        refusal, tools, client = self._read_gate()
        if refusal is None:
            self._library_task = asyncio.get_running_loop().create_task(self._do_library_scan(tools, client.account_id))
        return refusal

    def library_games(self) -> list[dict] | None:
        """The cached owned games for the signed-in account, or None when nothing is cached."""
        self._library_payload(self._client_state().account_id)  # applies the lazy drop
        if self._library is None:
            return None
        return [{"appId": g.app_id, "name": g.name, "playtimeMinutes": g.playtime_minutes} for g in self._library[1]]

    async def achievements_of(self, app_id: int) -> list[dict] | str:
        """Live read of one game's achievements: a refusal code, or the list; AchievementsError when the read failed."""
        refusal, tools, client = self._read_gate(achievements_ack=True)
        if refusal is not None:
            return refusal
        self._achv_reading = True
        try:
            items = await asyncio.to_thread(self._read_ach, tools.helper, steam_id64(client.account_id), app_id)
        finally:
            self._achv_reading = False
        return [{"apiName": a.api_name, "name": a.name, "description": a.description, "hidden": a.hidden,
                 "achieved": a.achieved, "unlockTime": a.unlock_time} for a in items]

    def start_achievements(self, plan: SelectedPlan | GamePlan | LibraryPlan) -> str | None:
        refusal, tools, client = self._read_gate(achievements_ack=True)
        if refusal is not None:
            return refusal
        self._achv_tools, self._achv_account = tools, client.account_id
        self._achv_expected = steam_id64(client.account_id)
        self._achv_cancel, self._achv_preparing = False, False
        settings = self._achv_settings()
        rules = Rules(settings["minMinutes"], settings["maxMinutes"], settings["skipHidden"])
        self._achv_task = asyncio.get_running_loop().create_task(self._achv_loop(plan, rules))
        return None

    def stop_achievements(self) -> str | None:
        if self._find_tools().unavailable:
            return "unavailable"
        if self._achv_active():
            self._achv_cancel = True
            self._queue.stop()
        return None

    def pause_achievements(self) -> str | None:
        return self._forward_achv(self._queue.pause)

    def resume_achievements(self) -> str | None:
        return self._forward_achv(self._queue.resume)

    def skip_achievements(self) -> str | None:
        return self._forward_achv(self._queue.skip_current)

    def _forward_achv(self, command: Callable[[], None]) -> str | None:
        if self._find_tools().unavailable:
            return "unavailable"
        if self._achv_active():
            command()
        return None

    def stop(self) -> str | None:
        return self._forward("stop")

    def pause(self) -> str | None:
        return self._forward("pause")

    def resume(self) -> str | None:
        return self._forward("resume")

    def skip(self) -> str | None:
        return self._forward("skip_current")

    def login(self) -> str | None:
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable"
        if self._busy():
            return "busy"
        self._session = "login_open"
        self._login_task = asyncio.get_running_loop().create_task(self._do_login(tools))
        return None

    def check(self) -> str | None:
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable"
        if self._busy():
            return "busy"
        client = self._client_state()
        if (refusal := self._client_refusal(client)) is not None:
            return refusal
        self._session = "checking"
        self._check_task = asyncio.get_running_loop().create_task(self._do_check(tools, client.account_id))
        return None

    def set_suspended(self, flag: bool) -> None:
        """Called every guard tick; only a change reaches the farm, so its command queue cannot grow while idle."""
        flag = bool(flag)
        if flag != self._suspend_sent:
            self._suspend_sent = flag
            self._farm.set_suspended(flag)
            self._queue.set_suspended(flag)

    async def join(self) -> None:
        while tasks := [task for task in self._tasks() if not task.done()]:  # a check may start the auto-scan
            await asyncio.gather(*tasks, return_exceptions=True)

    def _tasks(self) -> list:
        return [task for task in (self._task, self._login_task, self._check_task, self._scan_task, self._library_task,
                                  self._achv_task) if task is not None]

    async def shutdown(self) -> None:
        """Close the farm and the achievements queue for good, end the tasks and any read in flight, and release every
        held game within seconds. An unlock call already in flight is not killed; nothing is written after it."""
        self._closed = True
        self._farm.close()
        self._achv_cancel = True
        self._queue.close()
        tasks = [task for task in self._tasks() if not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=_RELEASE_SECONDS)
        try:
            await asyncio.wait_for(asyncio.to_thread(self._wind_down), 2 * _RELEASE_SECONDS)
        except asyncio.TimeoutError:
            logger.error("releasing the held game timed out on shutdown")

    def _wind_down(self) -> None:
        """Thread: kill the in-flight reads, let a blocked step finish (the closed farm holds nothing), release all."""
        try:
            self._kill_reads()
        except Exception:
            logger.error("killing the in-flight community reads failed", exc_info=True)
        deadline = time.monotonic() + _RELEASE_SECONDS
        if not self._step_done.wait(_RELEASE_SECONDS):
            logger.error("a farm step is still blocked on shutdown; the closed farm releases what it starts")
        if not self._achv_step_done.wait(max(deadline - time.monotonic(), 0.0)):
            logger.error("an achievements step is still blocked on shutdown; the closed queue writes nothing more")
        self._release_presences()

    # internals
    @staticmethod
    def _client_refusal(client: SteamClient) -> str | None:
        if not client.running:
            return "steam_not_running"
        return None if client.signed_in else "steam_signed_out"

    def _busy(self) -> bool:
        return self._achv_reading or any(
            task is not None and not task.done() for task in (self._login_task, self._check_task, self._scan_task, self._library_task))

    def _achv_active(self) -> bool:
        return self._achv_task is not None and not self._achv_task.done()

    def _library_scan_running(self) -> bool:
        return self._library_task is not None and not self._library_task.done()

    def _scan_running(self) -> bool:
        return self._scan_task is not None and not self._scan_task.done()

    def _start_scan(self, tools: Tools, account_id: int) -> None:
        self._scan_task = asyncio.get_running_loop().create_task(self._do_scan(tools, account_id))

    def _running(self) -> bool:
        return self._task is not None and not self._task.done()

    def _forward(self, method: str) -> str | None:
        if self._find_tools().unavailable:
            return "unavailable"
        if self._running():
            getattr(self._farm, method)()
        return None

    def _new_presence(self) -> object:
        presence = self._presence_factory(self._run_tools.helper, self._expected)
        self._live = [held for held in self._live if held.is_running()] + [presence]
        return presence

    def _release_presences(self) -> None:
        for presence in list(self._live):
            try:
                if presence.is_running():
                    presence.stop()
            except Exception:  # shutdown must still release the rest
                logger.error("releasing a held game failed", exc_info=True)

    def _read_drops(self) -> list:
        """The farm's drops reader: bound to the run's account; the library count is read once per run after it."""
        try:
            drops = self._read_drops_fn(self._run_tools.community, expected_steam_id64=self._expected)
        except CommunityError as error:
            if error.code in _SESSION_BY_CODE:
                self._session = _SESSION_BY_CODE[error.code]
            if error.code == "account_mismatch":
                self._run_error = error.code
                raise CommunityError("signed_out") from error  # the farm ends in needs_login
            raise
        self._checked_at = self._clock()
        self._store_preview(self._run_account, drops)
        if not self._library_fetched:
            self._library_fetched = True
            try:
                self._store_library(self._run_account, self._read_library_fn(self._run_tools.community,
                                                                              expected_steam_id64=self._expected))
            except CommunityError as error:
                logger.error("library read failed: %s", error.code)
        return drops

    def _hold_guard(self) -> str | None:
        """Runs in the step thread right before a game is held: the client must still be on the run's account."""
        if self._client_state().account_id != self._run_account:
            self._run_error = "account_changed"
            return "account_changed"
        return None

    def _step(self) -> float:
        self._step_done.clear()
        try:
            return self._farm.step()
        finally:
            self._step_done.set()

    async def _run_loop(self) -> None:
        try:
            while True:
                if self._client_state().account_id != self._run_account:
                    self._run_error = "account_changed"
                    self._farm.stop()
                delay = await asyncio.to_thread(self._step)
                if self._farm.status()["state"] in _ENDED and delay > 0:
                    return
                await self._sleep(min(delay, _TICK_SECONDS))
        except Exception:
            logger.error("steam idle farm loop crashed", exc_info=True)
            await self._abort_run()

    async def _abort_run(self) -> None:
        """After a crash: release every live presence directly and report the farm stopped; never raises."""
        self._run_error = "internal_error"
        try:
            await asyncio.to_thread(self._release_presences)
            self._farm.abort("internal_error")
        except Exception:
            logger.error("steam idle crash cleanup failed", exc_info=True)

    # achievements run
    def _queue_read(self, app_id: int) -> list:
        return self._read_ach(self._achv_tools.helper, self._achv_expected, app_id)

    def _queue_unlock(self, app_id: int, names: list[str]):
        """The one write path; the helper's write gate is set inside achievements.unlock_achievements, child env only."""
        return self._unlock_ach(self._achv_tools.helper, self._achv_expected, app_id, names)

    def _queue_guard(self) -> str | None:
        """Runs in the step thread right before every unlock: still acknowledged and still the run's account."""
        if not self._get_setting(ACHIEVEMENTS_ACK_KEY, False):
            return "not_acknowledged"
        if self._client_state().account_id != self._achv_account:
            return "account_changed"
        return None

    def _achv_step(self) -> float:
        self._achv_step_done.clear()
        try:
            return self._queue.step()
        finally:
            self._achv_step_done.set()

    def _cached_games(self) -> list | None:
        library = self._library
        return library[1] if library and library[0] == self._achv_account else None

    async def _achv_prepare(self, plan):
        """The plan with its game names filled in (the owned games are read first when needed), or None if the run
        must not start: stopped meanwhile, or the games could not be read."""
        games = self._cached_games()
        if isinstance(plan, LibraryPlan) and games is None:
            self._achv_preparing = True
            try:
                games = await asyncio.to_thread(self._read_library_fn, self._achv_tools.community,
                                                expected_steam_id64=self._achv_expected)
            except CommunityError as error:
                logger.error("library read for the achievements run failed: %s", error.code)
                code = error.code if error.code in _SESSION_BY_CODE else "library_failed"
                if code in _SESSION_BY_CODE:
                    self._session = _SESSION_BY_CODE[code]
                self._queue.abort(code)
                return None
            finally:
                self._achv_preparing = False
            self._store_library(self._achv_account, games)
        if self._achv_cancel or self._closed:
            return None
        if isinstance(plan, LibraryPlan):
            return dataclasses.replace(plan, games=[(g.app_id, g.name) for g in games])
        names = {g.app_id: g.name for g in games or []}
        return dataclasses.replace(plan, name=plan.name or names.get(plan.app_id) or f"App {plan.app_id}")

    async def _achv_loop(self, plan, rules: Rules) -> None:
        try:
            if (plan := await self._achv_prepare(plan)) is not None:
                self._queue.start(plan, rules)
            while True:
                if self._client_state().account_id != self._achv_account:
                    self._queue.abort("account_changed")  # no step is running here, so nothing can be written meanwhile
                delay = await asyncio.to_thread(self._achv_step)
                if self._queue.status()["state"] in _ENDED and delay > 0:
                    return
                await self._sleep(min(delay, _TICK_SECONDS))
        except Exception:
            logger.error("steam idle achievements loop crashed", exc_info=True)
            self._queue.abort("internal_error")

    async def _do_library_scan(self, tools: Tools, account_id: int) -> None:
        """One owned-games read in a worker thread; a failure keeps the previous list and records the error."""
        self._library_error = None
        try:
            games = await asyncio.to_thread(self._read_library_fn, tools.community,
                                            expected_steam_id64=steam_id64(account_id))
        except CommunityError as error:
            logger.error("library scan failed: %s", error.code)
            if error.code in _SESSION_BY_CODE:
                self._session = _SESSION_BY_CODE[error.code]
            else:
                self._library_error = _preview_error(error.code)
        except Exception:
            logger.error("library scan crashed", exc_info=True)
            self._library_error = "internal_error"
        else:
            self._checked_at = self._clock()
            self._store_library(account_id, games)

    async def _do_login(self, tools: Tools) -> None:
        try:
            await self._run_login(tools.community)
        except OSError:
            logger.error("sign-in window could not be started", exc_info=True)
            self._session = "error"
            return
        client = self._client_state()
        if not client.signed_in:
            self._session = "unknown"
            return
        await self._do_check(tools, client.account_id)

    async def _do_check(self, tools: Tools, account_id: int) -> None:
        self._session = "checking"
        try:
            await asyncio.to_thread(self._read_status_fn, tools.community, expected_steam_id64=steam_id64(account_id))
        except CommunityError as error:
            logger.error("community session check failed: %s", error.code)
            self._session = _SESSION_BY_CODE.get(error.code, "error")
        else:
            self._session, self._checked_account = "signed_in", account_id
            if (not self._closed and not self._running() and not self._scan_running()
                    and not (self._preview and self._preview[0] == account_id)):
                self._start_scan(tools, account_id)
        self._checked_at = self._clock()

    async def _do_scan(self, tools: Tools, account_id: int) -> None:
        """One drops read in a worker thread; a failure keeps the previous list and records the error."""
        self._preview_error = None
        try:
            drops = await asyncio.to_thread(self._read_drops_fn, tools.community,
                                            expected_steam_id64=steam_id64(account_id))
        except CommunityError as error:
            logger.error("preview scan failed: %s", error.code)
            if error.code in _SESSION_BY_CODE:
                self._session = _SESSION_BY_CODE[error.code]
            else:
                self._preview_error = _preview_error(error.code)
        except Exception:
            logger.error("preview scan crashed", exc_info=True)
            self._preview_error = "internal_error"
        else:
            self._checked_at = self._clock()
            self._store_preview(account_id, drops)


def _never(*args: object, **kwargs: object):
    raise RuntimeError("the steam idle backend is inert")


def _kill_reads() -> None:
    """Kill every read in flight (community scripts and helper achievement reads); never an unlock."""
    community.kill_in_flight()
    achievements.kill_in_flight()


def create_controller(app_root: Path, engine_root: Path, get_setting: Callable[..., object],
                      set_setting: Callable[[str, object], None], inert: bool = False) -> SteamIdleController:
    """Real dependencies, or an inert backend (test mode) that reports unsupported and never touches the system."""
    if inert:
        return SteamIdleController(
            get_setting=get_setting, set_setting=set_setting, find_tools=lambda: Tools("unsupported"),
            client_state=lambda: SteamClient(False, 0), read_drops=_never, read_library=_never, read_status=_never,
            presence_factory=_never, run_login=_never, clock=time.monotonic)
    return SteamIdleController(
        get_setting=get_setting, set_setting=set_setting, find_tools=lambda: find_tools(app_root, engine_root),
        client_state=read_steam_client, read_drops=community.read_drops, read_library=community.read_library,
        read_status=community.read_status, presence_factory=HeldPresence, run_login=run_login, clock=time.monotonic,
        kill_reads=_kill_reads, read_achievements=achievements.read_achievements, unlock=achievements.unlock_achievements)
