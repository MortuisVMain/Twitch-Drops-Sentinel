"""Partial library observations from filenames and read-only native checks.

The caller supplies a trusted probe executable and an explicit Steam root.
Subscription observations do not establish permanent ownership or eligibility.
"""
import json
import os
import re
import stat
import subprocess
import time
from pathlib import Path

from .inventory import MAX_ITEMS, InventoryError, Snapshot, aggregate

SOURCE = "local_cache_candidates"
_STEAM_ID_PREFIX = 0x0110000100000000


def _account_id(expected: str) -> int:
    if (not isinstance(expected, str) or not re.fullmatch(r"[1-9][0-9]{16}", expected)
            or int(expected) >> 32 != _STEAM_ID_PREFIX >> 32
            or not 0 < int(expected) & 0xffffffff):
        raise InventoryError("invalid expected SteamID64")
    return int(expected) & 0xffffffff


def _candidates(root: Path, account_id: int, deadline: float) -> tuple[int, ...] | None:
    cache = root / "userdata" / str(account_id) / "config" / "librarycache"
    # Check every ancestor for links/junctions before opening the directory.
    for path in (*reversed(cache.parents), cache):
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
        for index, entry in enumerate(entries):
            if time.monotonic() > deadline:
                raise InventoryError("inventory observation deadline exceeded")
            if index >= MAX_ITEMS:
                raise InventoryError("cache entry limit exceeded")
            if not re.fullmatch(r"[1-9][0-9]{0,9}\.json", entry.name):
                continue
            app_id = int(entry.name[:-5])
            if app_id >= 2**32:
                continue
            metadata = entry.stat(follow_symlinks=False)
            if (not stat.S_ISREG(metadata.st_mode)
                    or getattr(metadata, "st_file_attributes", 0) & 0x400):
                raise InventoryError("linked or non-file cache candidate rejected")
            candidates.add(app_id)
    return tuple(sorted(candidates))


def _check(probe: Path, expected: str, app_id: int, timeout: float) -> dict:
    try:
        result = subprocess.run([str(probe), "app", expected, str(app_id)], shell=False, check=False,
                                capture_output=True, text=True, encoding="utf-8", timeout=timeout)
        if result.returncode != 0 or len(result.stdout) > 4096 or result.stderr:
            raise InventoryError("candidate probe failed")
        raw = json.loads(result.stdout)
        if (not isinstance(raw, dict) or type(raw["protocolVersion"]) is not int
                or raw["protocolVersion"] != 1 or raw["clientConnection"] != "connected"
                or raw["identity"] != "expected_account_confirmed"
                or raw["steamOperations"] != "unsupported" or raw["error"] is not None
                or type(raw["appId"]) is not int or raw["appId"] != app_id
                or type(raw["subscribed"]) is not bool or type(raw["installed"]) is not bool):
            raise InventoryError("invalid candidate probe response")
    except (OSError, subprocess.SubprocessError, UnicodeError, ValueError, KeyError, TypeError) as error:
        raise InventoryError("candidate probe observation failed") from error
    return {"app_id": app_id, "name": f"App {app_id}",
                "ownership": "subscribed" if raw["subscribed"] else "unknown", "installed": raw["installed"]}


def observe(steam_root: Path, expected_steam_id: str, account_epoch: str,
            probe_executable: Path) -> Snapshot:
    """Observe at most 10k filename candidates within a 30-second total budget.

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
    rows = []
    for app_id in candidates:
        remaining = deadline - time.monotonic()
        if remaining < 10:
            raise InventoryError("inventory observation deadline exceeded")
        rows.append(_check(probe_executable, expected_steam_id, app_id, 10))
    if time.monotonic() > deadline:
        raise InventoryError("inventory observation deadline exceeded")
    return aggregate(SOURCE, account_epoch, [{"items": rows, "cursor": None,
                     "next_cursor": None, "complete": False}])
