"""Service-facing Steam IDLE controller: tool discovery, Steam client state, community session and the farm loop.

Every external effect is an injected callable, so tests need no Steam, no node and no real time. Commands return
None on success or a refusal code from the service contract; no account identifier is ever stored in a payload.
"""
import asyncio
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
from .achievement_queue import GamePlan, LibraryPlan, SelectedPlan
from .achievements import AchievementsError
from .achievements_run import ACHIEVEMENTS_ACK_KEY, AchievementsRun
from .community import CommunityError
from .farm import CardFarm, FarmRules
from .first_seen import FILE_NAME as FIRST_SEEN_FILE_NAME, FirstSeenStore
from .interrupted import RECORD_FILE_NAME, InterruptedStore
from .presence import Presence
from .protection import CACHE_FILE_NAME, ProtectionChecker
from .wake import Wake

logger = logging.getLogger(__name__)

RISK_ACK_KEY = "steam_idle_risk_ack"
_STEAM_ID_BASE = 76561197960265728
_REGISTRY_KEY = r"Software\Valve\Steam\ActiveProcess"
_HELPER_CANDIDATES = (
    Path("steam_idle") / "SteamIdleProbe.exe",
    Path("tools") / "steam_idle_probe" / "bin" / "Release" / "net10.0-windows" / "SteamIdleProbe.exe",
)
_ENDED = frozenset({"idle", "done", "stopped", "needs_login"})
_TICK_SECONDS = 5.0
_RELEASE_SECONDS = 3.0
_UNLOCK_WAIT_SECONDS = 12.0  # how long shutdown waits for an unlock call already in flight; it is never killed
# worst case of shutdown(): tasks, then the wind-down (farm step + unlock wait + 1 s slack)
SHUTDOWN_BUDGET_SECONDS = 2 * _RELEASE_SECONDS + _UNLOCK_WAIT_SECONDS + 1.0
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
                 uniform: Callable[[float, float], float] = random.uniform, protection: ProtectionChecker | None = None,
                 data_dir: Path | None = None, wall_clock: Callable[[], float] = time.time,
                 first_seen: FirstSeenStore | None = None, engine_installed: Callable[[], bool] = lambda: True,
                 module_enabled: Callable[[], bool] = lambda: True):
        self._get_setting, self._set_setting, self._module_enabled = get_setting, set_setting, module_enabled
        self._protection = protection or ProtectionChecker(None, _never)  # without one no request is ever made
        self._find_tools, self._client_state, self._engine_installed = find_tools, client_state, engine_installed
        self._read_drops_fn, self._read_library_fn, self._read_status_fn = read_drops, read_library, read_status
        self._presence_factory, self._run_login, self._clock, self._sleep = presence_factory, run_login, clock, sleep
        self._kill_reads = kill_reads
        self._step_done = threading.Event()  # set while no farm step is running in the worker thread
        self._step_done.set()
        self._wake = Wake()
        self._first_seen = first_seen or FirstSeenStore(None, wall_clock)
        self._first_seen.bind_account(lambda: self._run_account)  # the farm's holds follow the account it runs for
        self._farm = CardFarm(rules or FarmRules(), self._read_drops, self._new_presence, clock, self._hold_guard,
                              on_command=self._wake.set, refund=self._first_seen)
        self._achv = AchievementsRun(
            gate=self._read_gate, get_setting=get_setting, set_setting=set_setting,
            risk_acknowledged=lambda: bool(get_setting(RISK_ACK_KEY, False)),
            client_state=lambda: self._client_state(),
            read_achievements=read_achievements or _never, unlock=unlock or _never,
            read_library=lambda *args, **kwargs: self._read_library_fn(*args, **kwargs),
            cached_games=self._cached_games, cached_preview=self._cached_preview, store_library=self._store_library,
            session_error=self._session_error,
            is_closed=lambda: self._closed, steam_id=steam_id64, clock=clock, uniform=uniform, sleep=sleep,
            protection=self._protection, wall_clock=wall_clock,
            store=InterruptedStore(None if data_dir is None else data_dir / RECORD_FILE_NAME))
        self._library_task = None
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
        """`busy` is true while the farm or an achievements run is active: turning the module off would stop it."""
        tools = self._find_tools() if self._module_enabled() else Tools("module_disabled")  # off: nothing is probed
        client = self._client_state() if tools.unavailable is None else SteamClient(False, 0)
        farm = self._farm.status()
        if self._run_error and farm["state"] in ("stopped", "needs_login"):
            farm["lastError"] = self._run_error
        age = None if self._checked_at is None else self._clock() - self._checked_at
        session = self._session
        if tools.unavailable is None and not self._engine_installed():  # computed, so installing the engine clears it
            session, age = "engine_missing", None
        return {
            "available": tools.unavailable is None,
            "unavailableReason": tools.unavailable,
            "riskAcknowledged": bool(self._get_setting(RISK_ACK_KEY, False)),
            "steam": {"running": client.running, "signedIn": client.signed_in},
            "community": {"session": session, "checkedAgeSeconds": age},
            "farm": farm,
            "library": self._library_payload(client.account_id),
            "preview": self._preview_payload(client.account_id),
            "achievements": self._achv.payload(),
            "busy": self._running() or self._achv.active(),
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

    def _store_library(self, account_id: int, games: list) -> None:
        self._library, self._library_error = (account_id, games, self._clock()), None

    def _cached_games(self, account_id: int) -> list | None:
        library = self._library
        return library[1] if library and library[0] == account_id else None

    def _cached_preview(self, account_id: int) -> list | None:
        preview = self._preview
        return preview[1] if preview and preview[0] == account_id else None

    def _session_error(self, code: str) -> bool:
        """Apply a community error code to the session; True when it was a session code."""
        if code not in _SESSION_BY_CODE:
            return False
        self._session = _SESSION_BY_CODE[code]
        return True

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
        games = community.farmable(drops)
        self._first_seen.observe(games, account_id)
        self._preview, self._preview_error = (account_id, games, self._clock()), None

    # commands: None = accepted, otherwise a refusal code
    def acknowledge(self, accepted: bool) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        self._set_setting(RISK_ACK_KEY, bool(accepted))
        if not accepted:
            if self._running():
                self._farm.stop()
            self._achv.stop()
        return None

    def start(self) -> str | None:
        refusal, tools, client = self._read_gate()  # a second start must never rebind the run
        if refusal is not None:
            return refusal
        self._run_tools, self._run_account, self._expected = tools, client.account_id, steam_id64(client.account_id)
        self._run_error, self._library_fetched = None, False
        self._farm.start()
        self._task = asyncio.get_running_loop().create_task(self._run_loop())
        return None

    def _read_gate(self, achievements_ack: bool = False) -> tuple[str | None, Tools, SteamClient | None]:
        """The gates shared by every on-demand read and the achievements start: (refusal, tools, client)."""
        if not self._module_enabled():
            return "module_disabled", Tools("module_disabled"), None
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable", tools, None
        if not self._engine_installed():
            return "engine_missing", tools, None
        if not self._get_setting(RISK_ACK_KEY, False):
            return "risk_not_acknowledged", tools, None
        if achievements_ack and not self._get_setting(ACHIEVEMENTS_ACK_KEY, False):
            return "achievements_not_acknowledged", tools, None
        client = self._client_state()
        if (refusal := self._client_refusal(client)) is not None:
            return refusal, tools, client
        if self._closed or self._busy() or self._running():
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
    def acknowledge_achievements(self, accepted: bool) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        self._achv.acknowledge(accepted)
        return None

    def set_achievements_settings(self, min_minutes: object, max_minutes: object, skip_hidden: object) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        return self._achv.set_settings(min_minutes, max_minutes, skip_hidden)

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
        return await self._achv.read(app_id)

    def start_achievements(self, plan: SelectedPlan | GamePlan | LibraryPlan) -> str | None:
        return self._achv.start(plan)

    def resume_interrupted(self, library_confirmed: bool) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        return self._achv.resume_interrupted(library_confirmed)

    def discard_interrupted(self) -> str | None:
        """Allowed while the module is off: it only forgets a record, so the user can clear a banner they cannot continue."""
        self._achv.discard_interrupted()
        return None

    def stop_achievements(self) -> str | None:
        return self._forward_achv(self._achv.stop, allowed_off=True)

    def pause_achievements(self) -> str | None:
        return self._forward_achv(self._achv.pause)

    def resume_achievements(self) -> str | None:
        return self._forward_achv(self._achv.resume)

    def skip_achievements(self) -> str | None:
        return self._forward_achv(self._achv.skip)

    def _forward_achv(self, command: Callable[[], None], allowed_off: bool = False) -> str | None:
        if not (allowed_off or self._module_enabled()):
            return "module_disabled"
        if self._find_tools().unavailable:
            return "unavailable"
        command()
        return None

    def stop(self) -> str | None:
        return self._forward("stop", allowed_off=True)

    def pause(self) -> str | None:
        return self._forward("pause")

    def resume(self) -> str | None:
        return self._forward("resume")

    def skip(self) -> str | None:
        return self._forward("skip_current")

    def release_held(self, app_id: int) -> str | None:
        """Farm a game the refund hold keeps back, on the user's word; `not_held` for any other game."""
        if not self._module_enabled():
            return "module_disabled"
        if not any(game["appId"] == app_id for game in self._farm.status()["refundHeld"]):
            return "not_held"
        self._first_seen.release(app_id)
        self._farm.refresh()
        return None

    def login(self) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable"
        if not self._engine_installed():
            return "engine_missing"
        if self._busy():
            return "busy"
        self._session = "login_open"
        self._login_task = asyncio.get_running_loop().create_task(self._do_login(tools))
        return None

    def check(self) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable"
        if not self._engine_installed():
            return "engine_missing"
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
            self._achv.set_suspended(flag)

    async def set_module_enabled(self, enabled: bool) -> None:
        """Called once per change of the setting behind `module_enabled`. Turning off stops the farm (the game is
        released by its own step) and the achievements run (its record is kept, so it can be resumed after turning
        on), waiting for an unlock call in flight, which is never killed. Turning on needs nothing: the gate reads the
        setting, and the interrupted run is offered again by `state()`."""
        if enabled:
            logger.info("steam idle module turned on")
            return
        logger.info("steam idle module turned off")
        if self._running():
            self._farm.stop()
        self._achv.interrupt()
        tasks = [task for task in (self._task, self._achv.task) if task is not None and not task.done()]
        if not tasks:
            return
        _, pending = await asyncio.wait(tasks, timeout=_RELEASE_SECONDS + _UNLOCK_WAIT_SECONDS + 1.0)
        if pending:
            logger.error("steam idle did not stop within the budget after the module was turned off")

    async def join(self) -> None:
        while tasks := [task for task in self._tasks() if not task.done()]:  # a check may start the auto-scan
            await asyncio.gather(*tasks, return_exceptions=True)

    def _tasks(self) -> list:
        return [task for task in (self._task, self._login_task, self._check_task, self._scan_task, self._library_task,
                                  self._achv.task) if task is not None]

    async def shutdown(self) -> None:
        """Close the farm and the achievements queue for good (nothing new is written), end the tasks and any read in
        flight, wait for an unlock call already in flight (at most _UNLOCK_WAIT_SECONDS, never killing it) and release
        every held game."""
        self._closed = True
        self._farm.close()
        self._achv.close()
        tasks = [task for task in self._tasks() if not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=_RELEASE_SECONDS)
        try:
            await asyncio.wait_for(asyncio.to_thread(self._wind_down), _RELEASE_SECONDS + _UNLOCK_WAIT_SECONDS + 1.0)
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
        if self._achv.unlock_in_flight:
            logger.info("unlock in flight at shutdown, waiting")
            if not self._achv.wait_idle(_UNLOCK_WAIT_SECONDS):
                logger.warning("unlock still in flight after %.0f s at shutdown; the account state may be incomplete",
                               _UNLOCK_WAIT_SECONDS)
        elif not self._achv.wait_idle(max(deadline - time.monotonic(), 0.0)):
            logger.error("an achievements step is still blocked on shutdown; the closed queue writes nothing more")
        self._release_presences()

    # internals
    @staticmethod
    def _client_refusal(client: SteamClient) -> str | None:
        if not client.running:
            return "steam_not_running"
        return None if client.signed_in else "steam_signed_out"

    def _busy(self) -> bool:
        return self._achv.reading or self._achv.active() or any(
            task is not None and not task.done() for task in (self._login_task, self._check_task, self._scan_task, self._library_task))

    def _library_scan_running(self) -> bool:
        return self._library_task is not None and not self._library_task.done()

    def _scan_running(self) -> bool:
        return self._scan_task is not None and not self._scan_task.done()

    def _start_scan(self, tools: Tools, account_id: int) -> None:
        self._scan_task = asyncio.get_running_loop().create_task(self._do_scan(tools, account_id))

    def _running(self) -> bool:
        return self._task is not None and not self._task.done()

    def _forward(self, method: str, allowed_off: bool = False) -> str | None:
        if not (allowed_off or self._module_enabled()):
            return "module_disabled"
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
            self._wake.bind()
            while True:
                if self._client_state().account_id != self._run_account:
                    self._run_error = "account_changed"
                    self._farm.stop()
                self._wake.clear()  # a command from here on ends the sleep below at once
                delay = await asyncio.to_thread(self._step)
                if self._farm.status()["state"] in _ENDED and delay > 0 and not self._farm.pending():
                    return
                await self._wake.sleep(self._sleep, min(delay, _TICK_SECONDS))
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
                      set_setting: Callable[[str, object], None], inert: bool = False,
                      module_enabled: Callable[[], bool] = lambda: True) -> SteamIdleController:
    """Real dependencies, or an inert backend (test mode) that reports unsupported and never touches the system."""
    if inert:
        return SteamIdleController(
            module_enabled=module_enabled,
            get_setting=get_setting, set_setting=set_setting, find_tools=lambda: Tools("unsupported"),
            client_state=lambda: SteamClient(False, 0), read_drops=_never, read_library=_never, read_status=_never,
            presence_factory=_never, run_login=_never, clock=time.monotonic)
    from giveaways_controller import engine_installed  # the readiness window's own check, imported late: it is heavy
    return SteamIdleController(
        module_enabled=module_enabled, engine_installed=lambda: engine_installed(engine_root),
        protection=ProtectionChecker(app_root / CACHE_FILE_NAME), data_dir=app_root,
        first_seen=FirstSeenStore(app_root / FIRST_SEEN_FILE_NAME, time.time),
        get_setting=get_setting, set_setting=set_setting, find_tools=lambda: find_tools(app_root, engine_root),
        client_state=read_steam_client, read_drops=community.read_drops, read_library=community.read_library,
        read_status=community.read_status, presence_factory=HeldPresence, run_login=run_login, clock=time.monotonic,
        kill_reads=_kill_reads, read_achievements=achievements.read_achievements, unlock=achievements.unlock_achievements)
