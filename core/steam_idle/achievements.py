"""Reads the achievements of one app through the native helper's READ-ONLY `achievements` command."""
import json
import logging
import queue
import re
import subprocess
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from ._helper import PROTOCOL_VERSION, command, kill_tree, spawn, steam_account_id
from .inventory import InventoryError

logger = logging.getLogger(__name__)

MAX_ACHIEVEMENTS = 10000
MAX_NAME = 512
MAX_DESCRIPTION = 2048
_MAX_LINE = 20000  # 2560 characters of text, each possibly escaped to six, plus the fixed keys
_TOO_LONG = object()
_API_NAME = re.compile(r"[\x20-\x7E]{1,128}")
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
    """`code` is a helper error code (stats_unavailable...), or timeout, start_failed, protocol, invalid_*; never account data."""

    def __init__(self, code: str):
        super().__init__(f"achievements read failed: {code}")
        self.code = code


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
    if (type(api) is not str or not _API_NAME.fullmatch(api)
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
