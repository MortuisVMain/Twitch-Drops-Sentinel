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

from ._helper import PROTOCOL_VERSION, WRITE_GATE, child_env, command, kill_tree, spawn, steam_account_id
from .inventory import InventoryError

logger = logging.getLogger(__name__)

MAX_ACHIEVEMENTS = 10000
MAX_NAME = 512
MAX_DESCRIPTION = 2048
MAX_API_NAME_BYTES = 256
MAX_UNLOCK_NAMES = 200
MIN_UNLOCK_TIMEOUT = 50.0  # the helper has its own 45 s limit and answers with a wrote-aware failure line
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
    `partial` (unlock only) holds the UnlockResult of every complete, valid result line received before the failure.
    """

    def __init__(self, code: str, wrote: bool = False, partial: "Sequence[UnlockResult]" = ()):
        super().__init__(f"achievements read failed: {code}")
        self.code = code
        self.wrote = wrote
        self.partial = list(partial)
        self.action = "achievements read"

    def __str__(self) -> str:
        return f"{self.action} failed: {self.code}"


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


def _collect(proc: subprocess.Popen, lines: "queue.Queue", deadline: float, collected: list[str], max_lines: int) -> int:
    """Fill `collected` (so the caller keeps what arrived even on failure) and return the exit code."""
    try:
        while (line := lines.get(timeout=max(deadline - time.monotonic(), 0))) is not None:
            if line is _TOO_LONG or len(collected) >= max_lines:
                raise AchievementsError("protocol")
            collected.append(line)
        return proc.wait(timeout=max(deadline - time.monotonic(), 0.1))
    except (queue.Empty, subprocess.TimeoutExpired) as error:
        raise AchievementsError("timeout") from error


def _close_streams(*streams) -> None:
    """Close what is left of the pipes; a close that flushes into a dead pipe must not replace the real outcome."""
    for stream in streams:
        if stream is not None:
            try:
                stream.close()
            except OSError as error:
                logger.warning("helper pipe close failed: %s", error)


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
        _close_streams(proc.stdin)
        collected: list[str] = []
        returncode = _collect(proc, lines, time.monotonic() + timeout, collected, MAX_ACHIEVEMENTS + 1)
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
        _close_streams(proc.stdin, proc.stdout)


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


_UNCHANGED = frozenset((*_NO_WRITE, "rejected"))  # results that left the account as it was
_UNCERTAIN_RESULTS = frozenset(("pending", "unconfirmed", "store_failed"))
_PRE_WRITE_EXITS = (2, 4)  # input errors (2) and pre-write failures (4): the exit codes a nothing-written failure has


@dataclass(frozen=True)
class UnlockOutcome:
    """`changed`: some name ended in unlocked/pending/unconfirmed/store_failed. `uncertain`: some name is pending,
    unconfirmed or store_failed, or the store state is "timeout"/"no"; the account may then differ from the request."""
    results: list[UnlockResult]
    stored: str  # yes | no | timeout | not_needed
    changed: bool
    uncertain: bool


def _outcome(results: list[UnlockResult], stored: str) -> UnlockOutcome:
    return UnlockOutcome(results, stored,
                         changed=any(item.result not in _UNCHANGED for item in results),
                         uncertain=stored in ("timeout", "no") or any(item.result in _UNCERTAIN_RESULTS for item in results))


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


def _partial(lines: list[str], names: Sequence[str]) -> list[UnlockResult]:
    """The leading result lines that are complete and valid, in input order."""
    results = []
    for line, name in zip(lines, names):
        try:
            results.append(UnlockResult(name, _unlock_item(_object(line), name)))
        except AchievementsError:
            break
    return results


def _write_names(proc: subprocess.Popen, payload: bytes) -> None:
    """Writer thread: the pipe can fill up (a helper that never reads) or break (one that left early)."""
    try:
        proc.stdin.buffer.write(payload)  # bytes: no CRLF rewrite
        proc.stdin.buffer.flush()
    except (OSError, ValueError) as error:  # the helper's answer, or the lack of one, is judged by the reader
        logger.warning("unlock names not fully delivered: %s", error)
    finally:
        _close_streams(proc.stdin)


def _start_unlock(helper_exe, steam_id64: str, app_id: int) -> subprocess.Popen:
    """Start the helper with the write gate in its own environment only; os.environ is never touched."""
    try:
        proc = spawn(command(helper_exe, "unlock", steam_id64, app_id), env={**child_env(), WRITE_GATE: "1"})
    except OSError as error:
        logger.error("unlock start failed: %s", error)
        raise AchievementsError("start_failed") from error
    if os.name == "nt" and proc.job is None:  # without the job a killed helper could leave a worker behind
        kill_tree(proc)
        _close_streams(proc.stdin, proc.stdout)
        logger.error("unlock start failed: helper not in a job object")
        raise AchievementsError("start_failed")
    return proc


def _unlock(helper_exe, steam_id64: str, app_id: int, api_names: Sequence[str], timeout: float) -> UnlockOutcome:
    try:
        steam_account_id(steam_id64)
    except InventoryError as error:
        raise AchievementsError("invalid_steam_id") from error
    if not _is_int(app_id, 1, _UINT32_MAX):
        raise AchievementsError("invalid_app_id")
    names = _check_names(api_names)
    deadline = time.monotonic() + timeout  # also covers the stdin write
    proc = _start_unlock(helper_exe, steam_id64, app_id)
    lines: "queue.Queue" = queue.Queue()
    reader = threading.Thread(target=_reader, args=(proc.stdout, lines), daemon=True)
    payload = "".join(f"{name}\n" for name in names).encode("utf-8")
    writer = threading.Thread(target=_write_names, args=(proc, payload), daemon=True)
    try:
        reader.start()
        writer.start()
        collected: list[str] = []
        try:
            returncode = _collect(proc, lines, deadline, collected, len(names) + 1)
        except AchievementsError as error:
            raise AchievementsError(error.code, wrote=True, partial=_partial(collected, names)) from error
        try:
            results, stored = _parse_unlock(collected, app_id, names)
        except AchievementsError as error:
            wrote = error.wrote or returncode not in _PRE_WRITE_EXITS  # a failed line is trusted only with its exit code
            raise AchievementsError(error.code, wrote, _partial(collected, names)) from error
        if returncode != 0:
            raise AchievementsError("protocol", wrote=True, partial=results)
        return _outcome(results, stored)
    finally:
        kill_tree(proc)  # also reaps anything the helper left behind and unblocks a stuck write
        reader.join(timeout=2)
        writer.join(timeout=2)
        _close_streams(proc.stdout, *(() if writer.is_alive() else (proc.stdin,)))


def unlock_achievements(helper_exe: "Path | str | Sequence[str]", steam_id64: str, app_id: int,
                        api_names: Sequence[str], timeout: float = 60.0) -> UnlockOutcome:
    """WRITES to the real account: unlock the named achievements; `UnlockOutcome.results` has one UnlockResult per
    name in input order, `stored` is the store state ("yes" | "no" | "timeout" | "not_needed").

    A normal return does not mean the account matches the request unless `outcome.uncertain` is False; when it is True
    re-read the achievements. `outcome.changed` is True when at least one name was written (anything but
    already/unknown/rejected).

    All-or-nothing: any protocol defect, timeout or non-zero exit raises AchievementsError. `wrote` on the error tells
    whether the account may have been changed (a failed line proves that nothing was only with exit code 2 or 4 and
    without `wrote`); `partial` holds the per-name results of the complete result lines received before the failure.
    `timeout` (covers the stdin write too) must be at least 50 s, else ValueError: the helper has its own 45 s limit.

    The caller must serialise calls per account: two concurrent unlocks for one account are not supported."""
    if not timeout >= MIN_UNLOCK_TIMEOUT:
        raise ValueError(f"unlock timeout must be at least {MIN_UNLOCK_TIMEOUT} seconds")
    try:
        return _unlock(helper_exe, steam_id64, app_id, api_names, timeout)
    except AchievementsError as err:
        err.action = "unlock"
        logger.error("achievements unlock failed: %s (wrote=%s)", err.code, err.wrote)
        raise
