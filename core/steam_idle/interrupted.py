"""The record of an achievements run in progress, kept on disk so a restart can offer to continue it.

It holds the plan, the games already finished, the counts and a SHA-256 hash of the account the run was started for,
never the account id itself. Nothing here starts a run: the record is only read, shown and, on the user's word, resumed.
"""
import hashlib
import json
import logging
from pathlib import Path

from atomic_json import atomic_write_json

logger = logging.getLogger(__name__)

RECORD_FILE_NAME = "steam_idle_interrupted_run.json"
_KINDS = frozenset({"game", "selected", "library"})
_COUNTS = ("gamesDone", "gamesTotal", "unlocked")


def account_hash(steam_id: str) -> str:
    return hashlib.sha256(steam_id.encode("ascii")).hexdigest()


def _int_list(value: object) -> bool:
    return isinstance(value, list) and all(type(item) is int for item in value)


def _check(data: object) -> None:
    """Raises ValueError for anything that is not a record this module wrote."""
    if not isinstance(data, dict) or data.get("version") != 1 or data.get("kind") not in _KINDS:
        raise ValueError("not an interrupted-run record")
    if any(type(data.get(key)) is not int or data[key] < 0 for key in _COUNTS):
        raise ValueError("bad counts")
    started = data.get("startedAt")
    if type(started) not in (int, float) or not _int_list(data.get("finished")):
        raise ValueError("bad start time or finished list")
    if not isinstance(data.get("accountHash"), str) or len(data["accountHash"]) != 64:
        raise ValueError("bad account hash")
    if data["kind"] == "library":
        if not _int_list(data.get("exclude")):
            raise ValueError("bad exclude list")
    elif type(data.get("appId")) is not int or not isinstance(data.get("name"), str):
        raise ValueError("bad game")
    elif data["kind"] == "selected" and not (isinstance(data.get("names"), list)
                                              and all(isinstance(name, str) for name in data["names"])):
        raise ValueError("bad names")


class InterruptedStore:
    """One JSON file; a store without a path keeps nothing."""

    def __init__(self, path: Path | None):
        self._path = path

    def load(self) -> dict | None:
        """The record, or None when there is none. An unreadable or malformed file is logged and renamed aside."""
        path = self._path
        if path is None or not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            _check(data)
        except (OSError, ValueError):
            logger.error("interrupted-run record %s is unreadable and is set aside", path.name, exc_info=True)
            self._set_aside(path)
            return None
        return data

    @staticmethod
    def _set_aside(path: Path) -> None:
        try:
            path.replace(path.with_name(path.name + ".corrupt"))
        except OSError:
            logger.error("interrupted-run record %s could not be set aside", path.name, exc_info=True)

    def save(self, data: dict) -> None:
        if self._path is None:
            return
        try:
            atomic_write_json(self._path, data)
        except OSError:
            logger.error("interrupted-run record %s could not be written", self._path.name, exc_info=True)

    def delete(self) -> None:
        if self._path is None:
            return
        try:
            self._path.unlink(missing_ok=True)
        except OSError:
            logger.error("interrupted-run record %s could not be deleted", self._path.name, exc_info=True)
