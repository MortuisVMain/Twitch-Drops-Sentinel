"""Service-facing Steam IDLE controller: tool discovery, Steam client state, community session and the farm loop.

Every external effect is an injected callable, so tests need no Steam, no node and no real time. Commands return
None on success or a refusal code from the service contract; no account identifier is ever stored in a payload.
"""
import asyncio
import logging
import shutil
import sys
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from . import community
from ._helper import command as build_command, kill_tree, spawn
from .community import CommunityError
from .farm import CardFarm, FarmRules
from .presence import Presence

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
_SESSION_BY_CODE = {"signed_out": "signed_out", "account_mismatch": "account_mismatch"}


def steam_id64(account_id: int) -> str:
    return str(_STEAM_ID_BASE + account_id)


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
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep, rules: FarmRules | None = None):
        self._get_setting, self._set_setting = get_setting, set_setting
        self._find_tools, self._client_state = find_tools, client_state
        self._read_drops_fn, self._read_library_fn, self._read_status_fn = read_drops, read_library, read_status
        self._presence_factory, self._run_login, self._clock, self._sleep = presence_factory, run_login, clock, sleep
        self._farm = CardFarm(rules or FarmRules(), self._read_drops, self._new_presence, clock)
        self._session, self._checked_account, self._checked_at = "unknown", 0, None
        self._library_count: int | None = None
        self._task = self._login_task = self._check_task = None
        self._suspend_sent = False
        self._live: list = []
        self._run_tools: Tools | None = None
        self._expected: str | None = None
        self._run_account = 0
        self._run_error: str | None = None
        self._library_fetched = False

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
            "library": {"count": self._library_count},
        }

    # commands: None = accepted, otherwise a refusal code
    def acknowledge(self, accepted: bool) -> None:
        self._set_setting(RISK_ACK_KEY, bool(accepted))

    def start(self) -> str | None:
        tools = self._find_tools()
        if tools.unavailable:
            return "unavailable"
        if not self._get_setting(RISK_ACK_KEY, False):
            return "risk_not_acknowledged"
        client = self._client_state()
        if (refusal := self._client_refusal(client)) is not None:
            return refusal
        if self._busy():
            return "busy"
        if self._session == "account_mismatch" or (self._session == "signed_in" and self._checked_account != client.account_id):
            return "account_mismatch"
        if self._session != "signed_in":
            return "community_signed_out"
        self._run_tools, self._run_account, self._expected = tools, client.account_id, steam_id64(client.account_id)
        self._run_error, self._library_fetched = None, False
        self._farm.start()
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(self._run_loop())
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

    async def join(self) -> None:
        tasks = [task for task in (self._task, self._login_task, self._check_task) if task is not None]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def shutdown(self) -> None:
        """Stop the farm, release the held game and end every task within a few seconds."""
        self._farm.stop()
        tasks = [task for task in (self._task, self._login_task, self._check_task) if task is not None and not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=_RELEASE_SECONDS)
        try:
            await asyncio.wait_for(asyncio.to_thread(self._release_presences), _RELEASE_SECONDS)
        except asyncio.TimeoutError:
            logger.error("releasing the held game timed out on shutdown")

    # internals
    @staticmethod
    def _client_refusal(client: SteamClient) -> str | None:
        if not client.running:
            return "steam_not_running"
        return None if client.signed_in else "steam_signed_out"

    def _busy(self) -> bool:
        return any(task is not None and not task.done() for task in (self._login_task, self._check_task))

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
        if not self._library_fetched:
            self._library_fetched = True
            try:
                self._library_count = len(self._read_library_fn(self._run_tools.community, expected_steam_id64=self._expected))
            except CommunityError as error:
                logger.error("library read failed: %s", error.code)
        return drops

    def _step(self) -> float:
        return self._farm.step()

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
            self._run_error = "internal_error"
            self._farm.stop()
            await asyncio.to_thread(self._step)

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
        self._checked_at = self._clock()


def _never(*args: object, **kwargs: object):
    raise RuntimeError("the steam idle backend is inert")


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
        read_status=community.read_status, presence_factory=HeldPresence, run_login=run_login, clock=time.monotonic)
