"""Reads the achievements of one app through the native helper's READ-ONLY `achievements` command.

`unlock_achievements` is the one WRITE path: it runs the helper's `unlock` command, which changes the real account.
"""
import json
import logging
import os
import queue
import re
import subprocess
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from ._helper import CREATE_NO_WINDOW, PROTOCOL_VERSION, _job_for, command, kill_tree, spawn, steam_account_id
from .inventory import InventoryError

logger = logging.getLogger(__name__)

MAX_ACHIEVEMENTS = 10000
MAX_NAME = 512
MAX_DESCRIPTION = 2048
MAX_API_NAME_BYTES = 256
MAX_UNLOCK_NAMES = 200
WRITE_GATE = "SENTINEL_STEAM_IDLE_ALLOW_WRITE"
_MAX_LINE = 20000  # 2560 characters of text, each possibly escaped to six, plus the fixed keys
_TOO_LONG = object()
_ERROR_CODE = re.compile(r"[a-z][a-z0-9_]{0,63}")
_ITEM_KEYS = frozenset(("protocolVersion", "apiName", "name", "description", "hidden", "achieved", "unlockTime"))
_END_KEYS = frozenset(("protocolVersion", "status", "appId", "count"))
_FAILED_KEYS = frozenset(("protocolVersion", "status", "error"))
_UINT32_MAX = 0xFFFFFFFF


@dataclass(frozen=True)
class Achievement:
    api_name: str
    name: str
    description: str
    hidden: bool
    achieved: bool
    unlock_time: int  # unix seconds, 0 while locked


class AchievementsError(Exception):
    """`code` is a helper error code (stats_unavailable...), or timeout, start_failed, protocol, invalid_*; never account data.

    `wrote` is True when the account may have been changed (unlock only): the helper said so, or it died or went silent
    after it was started with names to write. A caller must then re-read the achievements before trusting any state.
    """

    def __init__(self, code: str, wrote: bool = False):
        super().__init__(f"achievements read failed: {code}")
        self.code = code
        self.wrote = wrote


def valid_api_name(value: object) -> bool:
    """1..256 bytes of valid UTF-8 without control characters (U+0000-U+001F, U+007F).

    U+FFFD is refused too: it is what undecodable bytes turn into, so it marks a name that was not valid UTF-8."""
    if type(value) is not str or not value or len(value) > MAX_API_NAME_BYTES:
        return False
    if any(ord(char) < 0x20 or char in "\x7f�" for char in value):
        return False
    try:
        return len(value.encode("utf-8")) <= MAX_API_NAME_BYTES
    except UnicodeEncodeError:  # a lone surrogate
        return False


def _reader(stream, lines: "queue.Queue") -> None:
    try:
        while line := stream.readline(_MAX_LINE + 2):
            if len(line) > _MAX_LINE and not line.endswith("\n"):
                lines.put(_TOO_LONG)
                return
            lines.put(line.rstrip("\r\n"))
    except (OSError, ValueError) as err:  # the pipe was closed under us after a kill
        logger.debug("achievements output reader stopped: %s", err)
    finally:
        lines.put(None)


def _no_duplicate_keys(pairs):
    keys = [key for key, _ in pairs]
    if len(set(keys)) != len(keys):
        raise ValueError("duplicate key")
    return dict(pairs)


def _object(line: str) -> dict:
    try:
        value = json.loads(line, object_pairs_hook=_no_duplicate_keys)
    except (ValueError, RecursionError) as error:
        raise AchievementsError("protocol") from error
    if type(value) is not dict:
        raise AchievementsError("protocol")
    return value


def _is_int(value: object, minimum: int, maximum: int) -> bool:
    return type(value) is int and minimum <= value <= maximum


def _failure(value: dict) -> AchievementsError:
    code = value.get("error")
    ok = (set(value) == _FAILED_KEYS and _is_int(value["protocolVersion"], PROTOCOL_VERSION, PROTOCOL_VERSION)
          and type(code) is str and _ERROR_CODE.fullmatch(code))
    return AchievementsError(code if ok else "protocol")


def _achievement(value: dict) -> Achievement:
    if set(value) != _ITEM_KEYS or not _is_int(value["protocolVersion"], PROTOCOL_VERSION, PROTOCOL_VERSION):
        raise AchievementsError("protocol")
    api, name, text = value["apiName"], value["name"], value["description"]
    hidden, achieved, unlock = value["hidden"], value["achieved"], value["unlockTime"]
    if (not valid_api_name(api)
            or type(name) is not str or len(name) > MAX_NAME
            or type(text) is not str or len(text) > MAX_DESCRIPTION
            or type(hidden) is not bool or type(achieved) is not bool
            or not _is_int(unlock, 0, _UINT32_MAX) or (not achieved and unlock != 0)):
        raise AchievementsError("protocol")
    return Achievement(api, name, text, hidden, achieved, unlock)


def _parse(lines: list[str], app_id: int) -> list[Achievement]:
    """Validate the complete answer; an error line must stand alone, and nothing may follow the complete line."""
    if not lines:
        raise AchievementsError("protocol")
    first = _object(lines[0])
    if first.get("status") == "failed":
        if len(lines) != 1:
            raise AchievementsError("protocol")
        raise _failure(first)
    items = [_achievement(_object(line)) for line in lines[:-1]]
    end = _object(lines[-1])
    if (set(end) != _END_KEYS or end["status"] != "complete" or not _is_int(end["protocolVersion"], PROTOCOL_VERSION, PROTOCOL_VERSION)
            or not _is_int(end["appId"], app_id, app_id) or not _is_int(end["count"], len(items), len(items))):
        raise AchievementsError("protocol")
    if len({item.api_name for item in items}) != len(items):
        raise AchievementsError("protocol")
    return items


def _collect(proc: subprocess.Popen, lines: "queue.Queue", timeout: float) -> tuple[list[str], int]:
    collected: list[str] = []
    deadline = time.monotonic() + timeout
    try:
        while (line := lines.get(timeout=max(deadline - time.monotonic(), 0))) is not None:
            if line is _TOO_LONG or len(collected) > MAX_ACHIEVEMENTS:  # one more than achievements + the end line
                raise AchievementsError("protocol")
            collected.append(line)
        return collected, proc.wait(timeout=max(deadline - time.monotonic(), 0.1))
    except (queue.Empty, subprocess.TimeoutExpired) as error:
        raise AchievementsError("timeout") from error


def read_achievements(helper_exe: "Path | str | Sequence[str]", steam_id64: str, app_id: int,
                      timeout: float = 45.0) -> list[Achievement]:
    """Every achievement of `app_id` in API order as seen by the signed-in account; all-or-nothing, never changes anything."""
    try:
        steam_account_id(steam_id64)
    except InventoryError as error:
        raise AchievementsError("invalid_steam_id") from error
    if not _is_int(app_id, 1, _UINT32_MAX):
        raise AchievementsError("invalid_app_id")
    try:
        proc = spawn(command(helper_exe, "achievements", steam_id64, app_id))
    except OSError as error:
        logger.error("achievements start failed: %s", error)
        raise AchievementsError("start_failed") from error
    lines: "queue.Queue" = queue.Queue()
    reader = threading.Thread(target=_reader, args=(proc.stdout, lines), daemon=True)
    reader.start()
    try:
        proc.stdin.close()
        collected, returncode = _collect(proc, lines, timeout)
        items = _parse(collected, app_id)
        if returncode != 0:
            raise AchievementsError("protocol")
        return items
    except AchievementsError as err:
        logger.error("achievements read failed: %s", err.code)
        raise
    finally:
        kill_tree(proc)  # also reaps anything the helper left behind
        reader.join(timeout=2)
        for stream in (proc.stdin, proc.stdout):
            if stream is not None:
                stream.close()


# ---- WRITE path: the helper's `unlock` command -------------------------------------------------------------------

_UNLOCK_ITEM_KEYS = frozenset(("protocolVersion", "apiName", "result"))
_UNLOCK_END_KEYS = frozenset(("protocolVersion", "status", "appId", "requested", "unlocked", "stored"))
_FAILED_WROTE_KEYS = _FAILED_KEYS | {"wrote"}
_NO_WRITE = ("already", "unknown")  # every other result means SetAchievement was called for that name
_STORE_RESULTS = ("unlocked", "store_failed", "pending", "unconfirmed")  # results of names that went through StoreStats
_ALLOWED_BY_STORE = {
    "not_needed": frozenset((*_NO_WRITE, "rejected")),
    "yes": frozenset((*_NO_WRITE, "rejected", "unlocked", "unconfirmed")),
    "timeout": frozenset((*_NO_WRITE, "rejected", "pending", "unconfirmed")),
    "no": frozenset((*_NO_WRITE, "rejected", "store_failed", "pending", "unconfirmed")),
}
_ALL_RESULTS = frozenset().union(*_ALLOWED_BY_STORE.values())


@dataclass(frozen=True)
class UnlockResult:
    api_name: str
    result: str  # unlocked | already | unknown | rejected | store_failed | pending | unconfirmed


def _violation() -> AchievementsError:
    """The helper broke the contract after it was started with names to write: the account state is uncertain."""
    return AchievementsError("protocol", wrote=True)


def _unlock_object(line: str) -> dict:
    try:
        return _object(line)
    except AchievementsError as error:
        raise _violation() from error


def _unlock_failure(value: dict) -> AchievementsError:
    code, wrote = value.get("error"), value.get("wrote")
    ok = ((set(value) == _FAILED_KEYS or (set(value) == _FAILED_WROTE_KEYS and wrote is True))
          and _is_int(value["protocolVersion"], PROTOCOL_VERSION, PROTOCOL_VERSION)
          and type(code) is str and _ERROR_CODE.fullmatch(code))
    return AchievementsError(code, wrote is True) if ok else _violation()


def _unlock_item(value: dict, name: str) -> str:
    result = value.get("result")
    if (set(value) != _UNLOCK_ITEM_KEYS or not _is_int(value["protocolVersion"], PROTOCOL_VERSION, PROTOCOL_VERSION)
            or value["apiName"] != name or type(result) is not str or result not in _ALL_RESULTS):
        raise _violation()
    return result


def _unlock_end(value: dict, app_id: int, results: list[str]) -> str:
    stored = value.get("stored")
    unlocked = results.count("unlocked")
    if (set(value) != _UNLOCK_END_KEYS or value["status"] != "complete"
            or not _is_int(value["protocolVersion"], PROTOCOL_VERSION, PROTOCOL_VERSION)
            or not _is_int(value["appId"], app_id, app_id)
            or not _is_int(value["requested"], len(results), len(results))
            or not _is_int(value["unlocked"], unlocked, unlocked)
            or type(stored) is not str or stored not in _ALLOWED_BY_STORE):
        raise _violation()
    went_through_store = any(result in _STORE_RESULTS for result in results)
    if (not set(results) <= _ALLOWED_BY_STORE[stored] or went_through_store != (stored != "not_needed")
            or ("store_failed" in results and ("pending" in results or "unconfirmed" in results))):
        raise _violation()
    return stored


def _parse_unlock(lines: list[str], app_id: int, names: Sequence[str]) -> tuple[list[UnlockResult], str]:
    """Validate the complete answer. A failed line must stand alone; nothing may follow the complete line."""
    if not lines:
        raise _violation()
    first = _unlock_object(lines[0])
    if first.get("status") == "failed":
        raise _unlock_failure(first) if len(lines) == 1 else _violation()
    if len(lines) != len(names) + 1:
        raise _violation()
    results = [_unlock_item(_unlock_object(line), name) for line, name in zip(lines, names)]
    stored = _unlock_end(_unlock_object(lines[-1]), app_id, results)
    return [UnlockResult(name, result) for name, result in zip(names, results)], stored


def _check_names(api_names: object) -> list[str]:
    if not isinstance(api_names, (list, tuple)) or not 1 <= len(api_names) <= MAX_UNLOCK_NAMES:
        raise AchievementsError("invalid_name_list")
    if not all(valid_api_name(name) for name in api_names):
        raise AchievementsError("invalid_name_list")
    if len(set(api_names)) != len(api_names):
        raise AchievementsError("duplicate_name")
    return list(api_names)


def _spawn_with_gate(cmd: list[str]) -> subprocess.Popen:
    """Like `_helper.spawn`, but the child alone gets the write gate; os.environ is never touched."""
    env = {**os.environ, WRITE_GATE: "1"}
    proc = subprocess.Popen(cmd, shell=False, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, encoding="utf-8", errors="replace", env=env,
                            creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    proc.job = _job_for(proc) if os.name == "nt" else None
    return proc


def unlock_achievements(helper_exe: "Path | str | Sequence[str]", steam_id64: str, app_id: int,
                        api_names: Sequence[str], timeout: float = 60.0) -> tuple[list[UnlockResult], str]:
    """WRITES to the real account: unlock the named achievements and return one result per name, in input order,
    plus the store state ("yes" | "no" | "timeout" | "not_needed").

    All-or-nothing: any protocol defect, timeout or non-zero exit raises AchievementsError. `wrote` on the error tells
    whether the account may have been changed; only a well-formed failure line without it proves that nothing was."""
    try:
        steam_account_id(steam_id64)
    except InventoryError as error:
        raise AchievementsError("invalid_steam_id") from error
    if not _is_int(app_id, 1, _UINT32_MAX):
        raise AchievementsError("invalid_app_id")
    names = _check_names(api_names)
    try:
        proc = _spawn_with_gate(command(helper_exe, "unlock", steam_id64, app_id))
    except OSError as error:
        logger.error("unlock start failed: %s", error)
        raise AchievementsError("start_failed") from error
    lines: "queue.Queue" = queue.Queue()
    reader = threading.Thread(target=_reader, args=(proc.stdout, lines), daemon=True)
    reader.start()
    try:
        try:
            proc.stdin.buffer.write("".join(f"{name}\n" for name in names).encode("utf-8"))  # bytes: no CRLF rewrite
            proc.stdin.buffer.flush()
            proc.stdin.close()
        except OSError as error:  # the helper left early; its answer, or the lack of one, is judged below
            logger.warning("unlock names not fully delivered: %s", error)
        try:
            collected, returncode = _collect(proc, lines, timeout)
        except AchievementsError as error:
            raise AchievementsError(error.code, wrote=True) from error
        parsed = _parse_unlock(collected, app_id, names)
        if returncode != 0:
            raise _violation()
        return parsed
    except AchievementsError as err:
        logger.error("achievements unlock failed: %s (wrote=%s)", err.code, err.wrote)
        raise
    finally:
        kill_tree(proc)  # also reaps anything the helper left behind
        reader.join(timeout=2)
        for stream in (proc.stdin, proc.stdout):
            if stream is not None:
                stream.close()
