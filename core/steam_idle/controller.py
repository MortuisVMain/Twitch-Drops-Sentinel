"""Service-facing Steam IDLE controller: tool discovery, Steam client state, community session and the farm loop.

Every external effect is an injected callable, so tests need no Steam, no node and no real time. Commands return
None on success or a refusal code from the service contract; no account identifier is ever stored in a payload.
"""
import asyncio
import logging
import math
import random
import shutil
import sys
import threading
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from . import achievements, community
from .achievement_index import CACHE_FILE_NAME as ACH_INDEX_FILE_NAME, AchievementIndex
from ._helper import command as build_command, kill_tree, spawn
from .activity import attach as attach_activity_log
from .achievement_queue import GamePlan, LibraryPlan, SelectedPlan
from .achievements import AchievementsError
from .achievements_run import ACHIEVEMENTS_ACK_KEY, AchievementsRun
from .batch import run_all
from .community import CommunityError, GameDrops
from .drops_daily import DailyDrops
from .farm import CardFarm, FarmRules
from .first_drop import MIN_SAMPLES, FirstDropSamples, verdict
from .first_seen import FILE_NAME as FIRST_SEEN_FILE_NAME, FirstSeenStore
from .node_locator import find_node
from .interrupted import RECORD_FILE_NAME, InterruptedStore
from .play_watch import PlayWatch
from .presence import Presence
from .protection import (BUILTIN, CACHE_FILE_NAME, MAX_USER_DENYLIST, USER_DENYLIST_KEY, ProtectionChecker, clean_user_denylist,
                         is_builtin)
from .run_events import NOTIFY_KEY, RunEvents
from .wake import Wake

logger = logging.getLogger(__name__)

RISK_ACK_KEY = "steam_idle_risk_ack"
HOURS_KEY = "steam_idle_hours_until_drops"
PAUSE_KEY = "steam_idle_pause_while_playing"
DEFAULT_HOURS, MAX_HOURS = 3.0, 10.0  # ArchiSteamFarm's HoursUntilCardDrops default; the setting's upper bound
_STEAM_ID_BASE = 76561197960265728
_REGISTRY_KEY = r"Software\Valve\Steam\ActiveProcess"
_STEAM_KEY = r"Software\Valve\Steam"
_WATCH_SECONDS = 60.0  # how often a run looks for a game the user started themselves
_FARM_PAUSABLE = frozenset({"scanning", "farming", "batching", "waiting"})
_ABSENT = object()  # a setting the request did not mention
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


def _valid_hours(value: object) -> bool:
    return type(value) in (int, float) and 0 <= value <= MAX_HOURS and math.isfinite(value)  # range first: 10**400 overflows isfinite


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
               platform_name: str = sys.platform, fallback: Callable[[], str | None] = lambda: None) -> Tools:
    """Installed helper first, then the dev build; node is found the way the giveaways controller finds it, then by
    `fallback` (a Node.js installed after the app started is not on this process's PATH yet)."""
    if platform_name != "win32":
        return Tools("unsupported")
    helper = next((path for path in (app_root / rel for rel in _HELPER_CANDIDATES) if path.is_file()), None)
    if helper is None:
        return Tools("helper_missing")
    node, script = which("node") or fallback(), engine_root / "steam-community.js"
    if node is None or not script.is_file():
        return Tools("node_missing")
    return Tools(None, helper, (node, str(script)))


def _registry_value(name: str, path: str = _REGISTRY_KEY) -> int | None:
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
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


def read_running_app_id(read_value: Callable[[str, str], int | None] = _registry_value) -> int | None:
    """The app id Steam reports as running (0: none; None: unreadable, which says nothing about a game). Whether this
    also shows the games the app's own helper processes hold is unverified, which is why the caller subtracts the app's
    held ids and debounces."""
    value = read_value("RunningAppID", _STEAM_KEY)
    if value is None:
        return None
    return value if type(value) is int and value > 0 else 0


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


async def run_login(prefix: Sequence[str], expected_steam_id64: str | None = None) -> int | None:
    """Run `<node> steam-community.js login [--expect=<id>]` (its browser window is the visible part) until it exits.

    With an expected id the window signs out a session of another account instead of closing on it."""
    proc = spawn(build_command(prefix, "login", *([f"--expect={expected_steam_id64}"] if expected_steam_id64 else [])))
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
                 module_enabled: Callable[[], bool] = lambda: True, achievement_index: AchievementIndex | None = None,
                 read_games: Callable[..., list] | None = None, running_app: Callable[[], int] | None = None,
                 notify: Callable[[str, str, str, str], object] = lambda *args: None):
        self._index = achievement_index  # without one every game counts as unknown and nothing is asked
        self._index_task = None
        self._index_version = 0  # goes up when a lookup ends, so the page reads the list again even if it never saw it run
        self._get_setting, self._set_setting, self._module_enabled = get_setting, set_setting, module_enabled
        self._protection = protection or ProtectionChecker(None, _never)  # without one no request is ever made
        self._find_tools, self._client_state, self._engine_installed = find_tools, client_state, engine_installed
        self._read_drops_fn, self._read_library_fn, self._read_status_fn = read_drops, read_library, read_status
        self._read_games_fn = read_games  # None: the farm's rechecks read every badge page
        self._wall_clock = wall_clock
        self._daily = DailyDrops(get_setting, set_setting, wall_clock)
        self._first_drops = FirstDropSamples(get_setting, set_setting)
        self._events = RunEvents(notify, lambda: self._flag(NOTIFY_KEY), self._daily)
        self._running_app = running_app  # None: no detector (not Windows, or the inert backend), nothing is watched
        self._play = PlayWatch()
        self._auto: dict | None = None  # the pause the watch made: {"farm": bool, "achv": bool, "since": clock time}
        self._watch_task = None
        self._presence_factory, self._run_login, self._clock, self._sleep = presence_factory, run_login, clock, sleep
        self._kill_reads = kill_reads
        self._step_done = threading.Event()  # set while no farm step is running in the worker thread
        self._step_done.set()
        self._wake = Wake()
        self._first_seen = first_seen or FirstSeenStore(None, wall_clock)
        self._first_seen.bind_account(lambda: self._run_account)  # the farm's holds follow the account it runs for
        self._rules_injected = rules is not None  # injected rules (tests) fix the hours phase; the setting is for the app
        self._farm = CardFarm(rules or FarmRules(), self._read_drops, self._new_presence, clock, self._hold_guard,
                              on_command=self._wake.set, refund=self._first_seen,
                              read_games=self._read_games if read_games else None, on_drops=self._count_drops,
                              on_first_drop=self._record_first_drop)
        self._achv = AchievementsRun(
            gate=self._read_gate, get_setting=get_setting, set_setting=set_setting,
            risk_acknowledged=lambda: bool(get_setting(RISK_ACK_KEY, False)),
            client_state=lambda: self._client_state(),
            read_achievements=read_achievements or _never, unlock=unlock or _never,
            read_library=lambda *args, **kwargs: self._read_library_fn(*args, **kwargs),
            cached_games=self._cached_games, cached_preview=self._cached_preview, store_library=self._store_library,
            session_error=self._session_error,
            is_closed=lambda: self._closed, steam_id=steam_id64, clock=clock, uniform=uniform, sleep=sleep,
            protection=self._protection, user_denied=lambda app_id: app_id in self._user_denylist(), wall_clock=wall_clock,
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
        self._deny_cache: tuple[str, list[int]] | None = None  # repr of the stored list, its cleaned form

    def farm_state(self) -> str:
        """The card farm's state alone ("idle", "farming", "needs_login"...), without probing Steam."""
        return self._farm.status()["state"]

    # payload
    def state(self) -> dict:
        """`busy` is true while the farm or an achievements run is active: turning the module off would stop it."""
        tools = self._find_tools() if self._module_enabled() else Tools("module_disabled")  # off: nothing is probed
        client = self._client_state() if tools.unavailable is None else SteamClient(False, 0)
        farm = self._farm.status()
        farm["hoursUntilDrops"] = self._hours_setting()
        account = client.account_id or self._run_account
        farm["droppedToday"] = self._daily.today(account)
        farm["thresholdSuggestion"] = self._suggestion(account, farm["hoursUntilDrops"])
        farm["pauseWhilePlaying"], farm["notify"] = self._flag(PAUSE_KEY), self._flag(NOTIFY_KEY)
        farm["autoPause"] = self._auto_payload()
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
            "denylist": self._denylist_payload(),
            "busy": self._running() or self._achv.active(),
        }

    def _flag(self, key: str) -> bool:
        """A boolean setting that is on unless stored as exactly False."""
        value = self._get_setting(key, True)
        return value if type(value) is bool else True

    def _suggestion(self, account: int, hours: float) -> dict | None:
        samples = self._first_drops.samples(account)
        found = verdict(samples, hours)
        return None if found is None else {**found, "samples": len(samples)}

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
                "ageSeconds": None if library is None else self._clock() - library[2],
                "achievementsChecking": self._index_running(), "achievementsVersion": self._index_version}

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
        self._events.begin_run(str(int(self._wall_clock())))
        if not self._rules_injected:
            self._farm.set_hours_until_drops(self._hours_setting())
        self._farm.start()
        self._task = asyncio.get_running_loop().create_task(self._run_loop())
        self._ensure_watch()
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

    def set_farm_settings(self, hours_until_drops: object = _ABSENT, *, pause_while_playing: object = _ABSENT,
                          notify: object = _ABSENT) -> str | None:
        """Any of: the playtime a game needs before its cards drop (applies from the next run; 0 turns the hours phase
        off), whether the farm steps aside while the user plays, whether Steam IDLE notifications are sent. All values
        are checked before any is stored."""
        if not self._module_enabled():
            return "module_disabled"
        given = {key: value for key, value in ((HOURS_KEY, hours_until_drops), (PAUSE_KEY, pause_while_playing),
                                               (NOTIFY_KEY, notify)) if value is not _ABSENT}
        if not given or not all(_valid_hours(value) if key == HOURS_KEY else type(value) is bool
                                for key, value in given.items()):
            return "invalid_request"
        for key, value in given.items():
            self._set_setting(key, float(value) if key == HOURS_KEY else value)
        if pause_while_playing is False:
            self._release_auto("setting turned off")
        return None

    def _hours_setting(self) -> float:
        value = self._get_setting(HOURS_KEY, DEFAULT_HOURS)
        if _valid_hours(value):
            return float(value)
        logger.warning("stored %s is invalid (%r); using %s", HOURS_KEY, value, DEFAULT_HOURS)
        return DEFAULT_HOURS

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
        user = set(self._user_denylist())
        index = self._index
        self._start_index_fill([g.app_id for g in self._library[1]])
        return [{"appId": g.app_id, "name": g.name, "playtimeMinutes": g.playtime_minutes,
                 "protected": is_builtin(g.app_id) or g.app_id in user, "userDenied": g.app_id in user,
                 "hasAchievements": None if index is None else index.known(g.app_id),
                 "achievements": None if index is None else index.progress(g.app_id)}
                for g in self._library[1]]

    def _index_running(self) -> bool:
        return self._index_task is not None and not self._index_task.done()

    def _start_index_fill(self, app_ids: list[int]) -> None:
        """Ask the store, in the background, which listed games have achievements; the page reads the list again once
        `achievementsChecking` turns false. Runs from a request handler, so a loop is running."""
        if self._index is None or self._closed or self._index_running() or not self._index.missing(app_ids):
            return
        self._index_task = asyncio.get_running_loop().create_task(self._fill_index(app_ids))

    async def _fill_index(self, app_ids: list[int]) -> None:
        try:
            await self._index.fill(app_ids)
        finally:
            self._index_version += 1

    # the user's own anti-cheat games, merged with the built-in table
    def _user_denylist(self) -> list[int]:
        """The stored list, cleaned. Bad entries are warned about once per distinct stored value, not on every poll."""
        raw = self._get_setting(USER_DENYLIST_KEY, [])
        signature = repr(raw)
        if self._deny_cache is None or self._deny_cache[0] != signature:
            self._deny_cache = (signature, clean_user_denylist(raw))
        return self._deny_cache[1]

    def _game_name(self, app_id: int) -> str | None:
        for cache in (self._library, self._preview):
            if cache is not None:
                for game in cache[1]:
                    if game.app_id == app_id:
                        return game.name
        return BUILTIN.get(app_id)

    def _denylist_payload(self) -> dict:
        return {"max": MAX_USER_DENYLIST, "builtinCount": len(BUILTIN),
                "entries": [{"appId": app_id, "name": self._game_name(app_id)} for app_id in self._user_denylist()]}

    @staticmethod
    def _valid_app_id(app_id: object) -> bool:
        return type(app_id) is int and 1 <= app_id <= 0xFFFFFFFF

    def deny_add(self, app_id: object) -> str | None:
        """Never touch this game with achievements, on the user's word."""
        if not self._module_enabled():
            return "module_disabled"
        if not self._valid_app_id(app_id):
            return "invalid_request"
        if is_builtin(app_id):
            return "already_builtin"
        current = self._user_denylist()
        if app_id in current:
            return None
        if len(current) >= MAX_USER_DENYLIST:
            return "denylist_full"
        self._set_setting(USER_DENYLIST_KEY, [*current, app_id])
        return None

    def deny_remove(self, app_id: object) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        if not self._valid_app_id(app_id):
            return "invalid_request"
        current = self._user_denylist()
        if app_id in current:
            self._set_setting(USER_DENYLIST_KEY, [item for item in current if item != app_id])
        return None

    async def achievements_of(self, app_id: int) -> list[dict] | str:
        """Live read of one game's achievements: a refusal code, or the list; AchievementsError when the read failed."""
        result = await self._achv.read(app_id)
        if self._index is not None and isinstance(result, list):
            # the game's own list beats the store's category and gives the card its progress
            self._index.record(app_id, sum(1 for a in result if a["achieved"]), len(result))
        return result

    def start_achievements(self, plan: SelectedPlan | GamePlan | LibraryPlan) -> str | None:
        refusal = self._achv.start(plan)
        if refusal is None:
            self._ensure_watch()
        return refusal

    def resume_interrupted(self, library_confirmed: bool) -> str | None:
        if not self._module_enabled():
            return "module_disabled"
        refusal = self._achv.resume_interrupted(library_confirmed)
        if refusal is None:
            self._ensure_watch()
        return refusal

    def discard_interrupted(self) -> str | None:
        """Allowed while the module is off: it only forgets a record, so the user can clear a banner they cannot continue."""
        self._achv.discard_interrupted()
        return None

    def stop_achievements(self) -> str | None:
        self._take_over("achv")
        return self._forward_achv(self._achv.stop, allowed_off=True)

    def pause_achievements(self) -> str | None:
        self._take_over("achv")
        return self._forward_achv(self._achv.pause)

    def resume_achievements(self) -> str | None:
        self._take_over("achv")
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
        self._take_over("farm")
        return self._forward("stop", allowed_off=True)

    def pause(self) -> str | None:
        self._take_over("farm")
        return self._forward("pause")

    def resume(self) -> str | None:
        self._take_over("farm")
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
                                  self._index_task, self._achv.task) if task is not None]

    async def shutdown(self) -> None:
        """Close the farm and the achievements queue for good (nothing new is written), end the tasks and any read in
        flight, wait for an unlock call already in flight (at most _UNLOCK_WAIT_SECONDS, never killing it) and release
        every held game."""
        self._closed = True
        self._farm.close()
        self._achv.close()
        tasks = [task for task in (*self._tasks(), self._watch_task) if task is not None and not task.done()]
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
        """Stop every held game at once: each stop can take seconds, and a full batch must fit the shutdown budget."""
        run_all(list(self._live), self._release_one)

    @staticmethod
    def _release_one(presence: object) -> None:
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
            self._on_run_read_error(error)
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

    def _read_games(self, app_ids: list[int]) -> list:
        """The farm's cheap reader: just these games' card pages, bound to the run's account like _read_drops. A failure
        says nothing about the session yet: the farm falls back to a full read, which decides."""
        games = self._read_games_fn(self._run_tools.community, app_ids, expected_steam_id64=self._expected)
        self._checked_at = self._clock()
        return games

    def _on_run_read_error(self, error: CommunityError) -> None:
        """Note what a failed read says about the session; an account mismatch reaches the farm as a sign-out."""
        if error.code in _SESSION_BY_CODE:
            self._session = _SESSION_BY_CODE[error.code]
        if error.code == "account_mismatch":
            self._run_error = error.code
            raise CommunityError("signed_out") from error  # the farm ends in needs_login

    def _count_drops(self, count: int) -> None:
        self._daily.add(self._run_account, count)

    def _record_first_drop(self, game: GameDrops, hours: float) -> None:
        """Step thread: keep the playtime at the first card of a game farmed alone from zero hours (see first_drop.py)."""
        try:
            count = self._first_drops.add(self._run_account, hours)
        except Exception:
            logger.error("first-drop sample for %s could not be stored", game.name, exc_info=True)
            return
        if count:
            logger.info("First drop in %s after %.1f h (sample %s)", game.name, hours,
                        f"{count}/{MIN_SAMPLES}" if count <= MIN_SAMPLES else count)

    # a game the user plays themselves: the farm steps aside (a pause of its own kind) and goes on when it is closed
    def _ensure_watch(self) -> None:
        """Start the once-a-minute look at Steam's RunningAppID for as long as a run is on; runs from a command handler."""
        if self._running_app is None or self._closed or (self._watch_task is not None and not self._watch_task.done()):
            return
        self._watch_task = asyncio.get_running_loop().create_task(self._watch_loop())

    async def _watch_loop(self) -> None:
        try:
            while self._running() or self._achv.active():
                await asyncio.sleep(_WATCH_SECONDS)
                try:
                    self.check_user_game()
                except Exception:  # one bad look must not end the watch and leave the run paused for good
                    logger.error("steam idle play watch check failed", exc_info=True)
        finally:
            if self._closed:  # shutdown: the runs are closed, nothing to resume
                self._auto = None
                self._play.reset()
            else:  # what is still paused by us goes on; a stopped run just has nothing to resume
                self._release_auto("watch ended")

    def check_user_game(self) -> None:
        """One look at the running game: pause for one the user started, resume once it has been closed for a while."""
        if self._running_app is None:
            return
        if not self._flag(PAUSE_KEY):
            self._release_auto("setting turned off")
            return
        if self._auto is not None and not self._still_ours():
            self._auto = None  # stopped or ended some other way: not ours to resume
            self._play.reset()
        try:
            running = self._running_app()
            running = None if running is None else int(running)
        except Exception:
            logger.warning("the running game could not be read", exc_info=True)
            return
        if running is None:  # unreadable is not "no game": it must not count as a close
            return
        action = self._play.observe(running, self._held_ids(), self._clock())
        if action is None:
            return
        if action[0] == "pause":
            self._pause_for_user(action[1])
        else:
            self._release_auto("game closed")

    def _held_ids(self) -> frozenset[int]:
        current = self._achv.payload()["run"].get("current")
        return self._farm.held_ids() | (frozenset({current["appId"]}) if current else frozenset())

    def _pause_for_user(self, app_id: int) -> None:
        farm_on = self._running() and self._farm.status()["state"] in _FARM_PAUSABLE
        achv_on = self._achv.active() and self._achv.payload()["run"]["state"] != "paused"
        if not (farm_on or achv_on):
            self._play.reset()  # nothing running, or already paused by hand: no pause of ours
            return
        if farm_on:
            self._farm.pause()
        if achv_on:
            self._achv.pause()
        self._auto = {"farm": farm_on, "achv": achv_on, "since": self._clock()}
        name = self._game_name(app_id)
        logger.info("Paused: you are playing %s", f"{name} ({app_id})" if name else f"app {app_id}")

    def _still_ours(self) -> bool:
        """The pause the watch made is still in force (the farm or the achievements run still shows paused)."""
        auto = self._auto
        return auto is not None and ((auto["farm"] and self._farm.status()["state"] == "paused")
                                     or (auto["achv"] and self._achv.payload()["run"]["state"] == "paused"))

    def _release_auto(self, why: str) -> None:
        """Resume what the watch paused, and only that; a pause made by hand is never touched."""
        auto, self._auto = self._auto, None
        self._play.reset()
        if auto is None:
            return
        if auto["farm"] and self._farm.status()["state"] == "paused":
            self._farm.resume()
        if auto["achv"] and self._achv.payload()["run"]["state"] == "paused":
            self._achv.resume()
        logger.info("Resumed: %s", why)

    def _take_over(self, side: str) -> None:
        """A command from the user on `side` ("farm" or "achv"): that half of the pause becomes theirs. The other half
        stays the watch's to resume; once none is left the game that caused it is ignored until it closes."""
        if self._auto is None or not self._auto[side]:
            return
        self._auto = {**self._auto, side: False}
        if not (self._auto["farm"] or self._auto["achv"]):
            self._auto = None
            self._play.dismiss()

    def _auto_payload(self) -> dict | None:
        auto, paused = self._auto, self._play.paused
        if auto is None or paused is None or not self._still_ours():
            return None
        return {"reason": "user_playing", "appId": paused[0], "since": max(self._clock() - auto["since"], 0.0)}

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
                self._announce(self._events.daily_summary, self._run_account)
                delay = await asyncio.to_thread(self._step)
                self._announce(self._events.observe, self._farm.status(), self._run_error, self._run_account)
                if self._farm.status()["state"] in _ENDED and delay > 0 and not self._farm.pending():
                    return
                await self._wake.sleep(self._sleep, min(delay, _TICK_SECONDS))
        except Exception:
            logger.error("steam idle farm loop crashed", exc_info=True)
            await self._abort_run()

    @staticmethod
    def _announce(notice: Callable[..., None], *args: object) -> None:
        """A notification problem must never stop the farm."""
        try:
            notice(*args)
        except Exception:
            logger.error("steam idle notification check failed", exc_info=True)

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
        before = self._client_state()  # the account the web session has to match; none when the client is signed out
        try:
            await self._run_login(tools.community, steam_id64(before.account_id) if before.signed_in else None)
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


def _active_account() -> int:
    """The Steam account active now (0 when none or unreadable): the owner of an old first-seen record."""
    try:
        return read_steam_client().account_id
    except Exception:  # registry or process lookup failed: the record then goes to the first account seen
        logger.warning("active Steam account could not be read", exc_info=True)
        return 0


def create_controller(app_root: Path, engine_root: Path, get_setting: Callable[..., object],
                      set_setting: Callable[[str, object], None], inert: bool = False,
                      module_enabled: Callable[[], bool] = lambda: True,
                      notify: Callable[[str, str, str, str], object] = lambda *args: None) -> SteamIdleController:
    """Real dependencies, or an inert backend (test mode) that reports unsupported and never touches the system."""
    attach_activity_log()  # the console reads what the module logs; attached once, whatever the number of controllers
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
        achievement_index=AchievementIndex(app_root / ACH_INDEX_FILE_NAME),
        first_seen=FirstSeenStore(app_root / FIRST_SEEN_FILE_NAME, time.time, claimant=_active_account()),
        get_setting=get_setting, set_setting=set_setting, find_tools=lambda: find_tools(app_root, engine_root, fallback=find_node),
        client_state=read_steam_client, read_drops=community.read_drops, read_library=community.read_library,
        read_games=community.read_games,
        read_status=community.read_status, presence_factory=HeldPresence, run_login=run_login, clock=time.monotonic,
        notify=notify, running_app=read_running_app_id if sys.platform == "win32" else None, kill_reads=_kill_reads, read_achievements=achievements.read_achievements, unlock=achievements.unlock_achievements)
