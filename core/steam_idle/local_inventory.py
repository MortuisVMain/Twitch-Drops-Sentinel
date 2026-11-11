"""Partial library observations from filenames and read-only native checks.

The caller supplies a trusted helper executable and an explicit Steam root.
Subscription observations do not establish permanent ownership or eligibility.
"""
import json
import logging
import os
import re
import stat
import subprocess
import time
from collections.abc import Sequence
from pathlib import Path

from ._helper import PROTOCOL_VERSION, command, kill_tree, spawn
from .inventory import MAX_ITEMS, InventoryError, Snapshot, aggregate

logger = logging.getLogger(__name__)

SOURCE = "local_cache_candidates"
HELPER_TIMEOUT = 60.0
_STEAM_ID_PREFIX = 0x0110000100000000
_ERROR_CODE = re.compile(r"[A-Za-z0-9_.-]{1,64}")


class _ProtocolError(Exception):
    """The helper's output broke the `apps` contract; carries a short, account-free reason."""


def _account_id(expected: str) -> int:
    if (not isinstance(expected, str) or not re.fullmatch(r"[1-9][0-9]{16}", expected)
            or int(expected) >> 32 != _STEAM_ID_PREFIX >> 32
            or not 0 < int(expected) & 0xffffffff):
        raise InventoryError("invalid expected SteamID64")
    return int(expected) & 0xffffffff


def _candidates(root: Path, account_id: int, deadline: float) -> tuple[int, ...] | None:
    userdata = root / "userdata"
    cache = userdata / str(account_id) / "config" / "librarycache"
    # Links are rejected at or below userdata; the Steam root itself may legitimately sit behind a junction.
    for path in (userdata, *reversed(cache.parents[:2]), cache):
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return None
        if stat.S_ISLNK(metadata.st_mode) or getattr(metadata, "st_file_attributes", 0) & 0x400:
            raise InventoryError("linked cache path rejected")
        if not stat.S_ISDIR(metadata.st_mode):
            raise InventoryError("cache path is not a directory")
    candidates = set()
    with os.scandir(cache) as entries:
        for entry in entries:
            if time.monotonic() > deadline:
                raise InventoryError("inventory observation deadline exceeded")
            if not re.fullmatch(r"[1-9][0-9]{0,9}\.json", entry.name):
                continue
            app_id = int(entry.name[:-5])
            if app_id >= 2**32:
                continue
            if len(candidates) >= MAX_ITEMS:
                raise InventoryError("cache entry limit exceeded")
            metadata = entry.stat(follow_symlinks=False)
            if (not stat.S_ISREG(metadata.st_mode)
                    or getattr(metadata, "st_file_attributes", 0) & 0x400):
                raise InventoryError("linked or non-file cache candidate rejected")
            candidates.add(app_id)
    return tuple(sorted(candidates))


def _json_line(line: str) -> dict:
    try:
        value = json.loads(line)
    except ValueError as error:
        raise _ProtocolError("not_json") from error
    if not isinstance(value, dict):
        raise _ProtocolError("not_an_object")
    return value


def _version(value: dict) -> None:
    try:
        version = value["protocolVersion"]
    except KeyError as error:
        raise _ProtocolError("missing_protocol_version") from error
    if type(version) is not int or version != PROTOCOL_VERSION:
        raise _ProtocolError("protocol_version")


def _parse_batch(stdout: str, app_ids: Sequence[int], returncode: int) -> list[dict]:
    """Strictly validate the helper's JSON lines; raise _ProtocolError or a helper-reported failure."""
    lines = stdout.splitlines()
    if not lines:
        raise _ProtocolError("no_output")
    last = _json_line(lines[-1])
    _version(last)
    if "status" not in last:
        raise _ProtocolError("missing_final_status")
    try:
        if last["status"] == "failed":
            code = last["error"]
            raise _ProtocolError(f"helper_error_{code}" if isinstance(code, str) and _ERROR_CODE.fullmatch(code)
                                 else "helper_error_unreadable")
        if last["status"] != "complete":
            raise _ProtocolError("unknown_status")
        count = last["count"]
    except KeyError as error:
        raise _ProtocolError("missing_final_field") from error
    if type(count) is not int or count != len(app_ids) or len(lines) != len(app_ids) + 1:
        raise _ProtocolError("count_mismatch")
    if returncode != 0:
        raise _ProtocolError("nonzero_exit")
    rows = []
    for line, app_id in zip(lines, app_ids):
        raw = _json_line(line)
        _version(raw)
        try:
            seen, subscribed, installed = raw["appId"], raw["subscribed"], raw["installed"]
        except KeyError as error:
            raise _ProtocolError("missing_item_field") from error
        if (type(seen) is not int or seen != app_id
                or type(subscribed) is not bool or type(installed) is not bool):
            raise _ProtocolError("invalid_item")
        rows.append({"app_id": app_id, "name": f"App {app_id}",
                     "ownership": "subscribed" if subscribed else "unknown", "installed": installed})
    return rows


def _failure(returncode: int | None, reason: str) -> InventoryError:
    err = InventoryError(f"apps helper failed (rc={returncode}): {reason}")
    logger.error("candidate batch observation failed: %s", err)
    return err


def _run_batch(helper: "Path | Sequence[str]", expected: str, app_ids: Sequence[int]) -> list[dict]:
    try:
        proc = spawn(command(helper, "apps", expected))
    except OSError as error:
        raise _failure(None, "start_failed") from error
    try:
        stdout, _ = proc.communicate("".join(f"{app_id}\n" for app_id in app_ids), timeout=HELPER_TIMEOUT)
    except subprocess.TimeoutExpired as error:
        kill_tree(proc)
        try:
            proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning("helper pipes still open after tree kill")
        raise _failure(proc.returncode, "timeout") from error
    except (OSError, ValueError) as error:
        kill_tree(proc)
        raise _failure(proc.returncode, "io_error") from error
    try:
        return _parse_batch(stdout, app_ids, proc.returncode)
    except _ProtocolError as error:
        kill_tree(proc)
        raise _failure(proc.returncode, str(error)) from error


def observe(steam_root: Path, expected_steam_id: str, account_epoch: str,
            probe_executable: "Path | Sequence[str]") -> Snapshot:
    """Observe at most 10k filename candidates: a 30 s scan budget, then one `apps` helper run (60 s).

    Missing cache is unknown; an existing empty cache is partial. Failures abort
    the observation. Callers can feed snapshot items into an incomplete page for
    InventoryStore; neither this provider nor that store authorizes game actions.
    """
    account_id = _account_id(expected_steam_id)
    aggregate(SOURCE, account_epoch, ())  # Validate epoch before filesystem work.
    deadline = time.monotonic() + 30
    try:
        candidates = _candidates(Path(steam_root), account_id, deadline)
    except OSError as error:
        raise InventoryError("cache discovery failed") from error
    if candidates is None:
        return aggregate(SOURCE, account_epoch, ())
    rows = _run_batch(probe_executable, expected_steam_id, candidates) if candidates else []
    return aggregate(SOURCE, account_epoch, [{"items": rows, "cursor": None,
                     "next_cursor": None, "complete": False}])
