"""Reads the Steam Community `drops` and `library` commands of the browser script (one JSON line on stdout)."""
import collections
import json
import logging
import math
import queue
import re
import subprocess
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass

from ._helper import command, kill_tree, spawn, steam_account_id
from .inventory import InventoryError

logger = logging.getLogger(__name__)

_ERROR_CODE = re.compile(r"[A-Za-z0-9_.-]{1,64}")
_SIGNED_OUT_EXIT = 3
_MISMATCH_EXIT = 5


@dataclass(frozen=True)
class GameDrops:
    app_id: int
    name: str
    drops_remaining: int
    playtime_hours: float


@dataclass(frozen=True)
class OwnedGame:
    app_id: int
    name: str
    playtime_minutes: int


class CommunityError(Exception):
    """`code` is signed_out, failed:<script code>, timeout, start_failed or protocol; never account data."""

    def __init__(self, code: str):
        super().__init__(f"community read failed: {code}")
        self.code = code


_LIVE: "set[subprocess.Popen]" = set()  # script processes of the reads in flight
_LIVE_LOCK = threading.Lock()


def kill_in_flight() -> None:
    """Kill the process tree of every read in flight; each blocked read then fails and returns (used on shutdown)."""
    with _LIVE_LOCK:
        procs = list(_LIVE)
    for proc in procs:
        kill_tree(proc)


def _read_lines(stream, lines: "queue.Queue[str | None]") -> None:
    try:
        for line in stream:
            if line.strip():
                lines.put(line.rstrip("\r\n"))
    except (OSError, ValueError) as err:  # the pipe was closed under us after a kill
        logger.debug("community output reader stopped: %s", err)
    finally:
        lines.put(None)


_STDERR_LINES = 20
_STDERR_LINE_CHARS = 200
_STDERR_TOTAL_BYTES = 4096
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+\S+")
_SECRET = re.compile(r"(?i)(steamLoginSecure|steamLogin|sessionid|steamid|cookie|token|authorization|secret|password|passwd)"
                     r"(\s*[=:]\s*|\s+)\S+")
_STEAM_ID64 = re.compile(r"\b7656119\d{10}\b")
_LONG_TOKEN = re.compile(r"[A-Za-z0-9%_+/=-]{32,}")


def _scrub(line: str) -> str:
    """One stderr line trimmed, with anything that looks like a cookie, token or account id replaced."""
    line = _BEARER.sub(r"\1 <hidden>", line)
    line = _SECRET.sub(r"\1=<hidden>", line)
    line = _STEAM_ID64.sub("<id>", line)
    return _LONG_TOKEN.sub("<hidden>", line)[:_STDERR_LINE_CHARS]


def _read_stderr(stream, tail: "collections.deque[str]") -> None:
    """Keep the last lines of the script's stderr (bounded memory); runs until the pipe closes."""
    try:
        while chunk := stream.readline(2000):
            if chunk.strip():
                tail.append(chunk.rstrip("\r\n"))
    except (OSError, ValueError) as err:  # the pipe was closed under us after a kill
        logger.debug("community stderr reader stopped: %s", err)


def _stderr_tail(tail: "collections.deque[str]") -> str:
    text = "\n".join(_scrub(line) for line in tail)
    return text.encode("utf-8")[-_STDERR_TOTAL_BYTES:].decode("utf-8", errors="ignore")


def _expect_args(expected_steam_id64: str | None) -> list[str]:
    """The script's `--expect=<id>` argument; an id that is not a valid SteamID64 is refused before anything runs."""
    if expected_steam_id64 is None:
        return []
    try:
        steam_account_id(expected_steam_id64)
    except InventoryError as error:
        raise CommunityError("invalid_steam_id") from error
    return [f"--expect={expected_steam_id64}"]


def _run(prefix: Sequence[str], verb: str, timeout: float, expected_steam_id64: str | None = None,
         ok_status: str = "complete") -> dict:
    """Run `<prefix> <verb>`, return its single JSON result line once it is a complete, successful result."""
    extra = _expect_args(expected_steam_id64)
    try:
        proc = spawn(command(prefix, verb, *extra), stderr=subprocess.PIPE)
    except OSError as error:
        logger.error("community %s start failed: %s", verb, error)
        raise CommunityError("start_failed") from error
    with _LIVE_LOCK:
        _LIVE.add(proc)
    lines: "queue.Queue[str | None]" = queue.Queue()
    reader = threading.Thread(target=_read_lines, args=(proc.stdout, lines), daemon=True)
    reader.start()
    err_tail: "collections.deque[str]" = collections.deque(maxlen=_STDERR_LINES)
    err_reader = threading.Thread(target=_read_stderr, args=(proc.stderr, err_tail), daemon=True)
    err_reader.start()
    failure: CommunityError | None = None
    try:
        proc.stdin.close()
        return _result(proc, lines, timeout, ok_status)
    except CommunityError as err:
        logger.error("community %s failed: %s", verb, err.code)
        failure = err
        raise
    finally:
        kill_tree(proc)  # also reaps a browser the script may have left behind
        with _LIVE_LOCK:
            _LIVE.discard(proc)
        reader.join(timeout=2)
        err_reader.join(timeout=2)
        if failure is not None:
            logger.warning("community %s run failed: %s (exit %s); script stderr tail:\n%s", verb, failure.code,
                           proc.returncode, _stderr_tail(err_tail) or "(empty)")
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            if stream is not None:
                stream.close()


def _result(proc: subprocess.Popen, lines: "queue.Queue[str | None]", timeout: float, ok_status: str) -> dict:
    collected: list[str] = []
    deadline = time.monotonic() + timeout
    try:
        while (line := lines.get(timeout=max(deadline - time.monotonic(), 0))) is not None:
            collected.append(line)
    except queue.Empty as error:
        raise CommunityError("timeout") from error
    try:
        returncode = proc.wait(timeout=10)
    except subprocess.TimeoutExpired as error:
        raise CommunityError("timeout") from error
    if returncode == _MISMATCH_EXIT:
        raise CommunityError("account_mismatch")
    if len(collected) != 1:
        raise CommunityError("signed_out" if returncode == _SIGNED_OUT_EXIT and not collected else "protocol")
    try:
        value = json.loads(collected[0])
        status = value["status"]
    except (ValueError, KeyError, TypeError) as error:
        raise CommunityError("protocol") from error
    if status == "signed_out" or returncode == _SIGNED_OUT_EXIT:
        raise CommunityError("signed_out")
    if status == "failed":
        code = value.get("error")
        raise CommunityError(f"failed:{code if isinstance(code, str) and _ERROR_CODE.fullmatch(code) else 'helper_error'}")
    if status != ok_status or returncode != 0:
        raise CommunityError("protocol")
    return value


def _is_int(value: object, minimum: int) -> bool:
    return type(value) is int and value >= minimum


def _games(value: dict, build) -> list:
    """Build every entry of value["games"]; any malformed entry or repeated appId rejects the whole list."""
    try:
        raw = value["games"]
        if type(raw) is not list:
            raise CommunityError("protocol")
        games = [build(entry) for entry in raw]
    except (KeyError, TypeError, ValueError) as error:
        raise CommunityError("protocol") from error
    if len({game.app_id for game in games}) != len(games):
        raise CommunityError("protocol")
    return games


def _drops_entry(entry: dict) -> GameDrops:
    app_id, name, drops, hours = entry["appId"], entry["name"], entry["dropsRemaining"], entry["playtimeHours"]
    if (not _is_int(app_id, 1) or type(name) is not str or not _is_int(drops, 0)
            or type(hours) not in (int, float) or not math.isfinite(hours) or hours < 0):
        raise ValueError("bad drops entry")
    return GameDrops(app_id, name, drops, float(hours))


def _library_entry(entry: dict) -> OwnedGame:
    app_id, name, minutes = entry["appId"], entry["name"], entry["playtimeMinutes"]
    if not _is_int(app_id, 1) or type(name) is not str or not _is_int(minutes, 0):
        raise ValueError("bad library entry")
    return OwnedGame(app_id, name, minutes)


def read_drops(command: Sequence[str], timeout: float = 300.0,
               expected_steam_id64: str | None = None) -> list[GameDrops]:
    """Every game badge with its remaining card drops; all-or-nothing."""
    return _games(_run(command, "drops", timeout, expected_steam_id64), _drops_entry)


def read_status(command: Sequence[str], timeout: float = 120.0, expected_steam_id64: str | None = None) -> None:
    """Return when the browser session is signed in (as the expected account, if given); raise CommunityError otherwise."""
    _run(command, "status", timeout, expected_steam_id64, ok_status="signed_in")


def read_library(command: Sequence[str], timeout: float = 120.0,
                 expected_steam_id64: str | None = None) -> list[OwnedGame]:
    """The owned games; all-or-nothing."""
    value = _run(command, "library", timeout, expected_steam_id64)
    games = _games(value, _library_entry)
    if value.get("count") != len(games):
        raise CommunityError("protocol")
    return games


def farmable(drops: Sequence[GameDrops]) -> list[GameDrops]:
    """Games with card drops left, the ones closest to finishing first."""
    return sorted((game for game in drops if game.drops_remaining > 0), key=lambda g: (g.drops_remaining, g.app_id))
