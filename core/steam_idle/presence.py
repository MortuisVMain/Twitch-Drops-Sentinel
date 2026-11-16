"""Synchronous controller for the helper's `hold <steamid64> <appid>` command (in-game presence)."""
import contextlib
import json
import logging
import queue
import re
import subprocess
import threading
import time
from collections.abc import Sequence
from pathlib import Path

from ._helper import PROTOCOL_VERSION, command, kill_tree, spawn, steam_account_id
from .inventory import InventoryError

logger = logging.getLogger(__name__)

_ERROR_CODE = re.compile(r"[A-Za-z0-9_.-]{1,64}")


class PresenceError(RuntimeError):
    """Hold failed; `code` is the helper's error code or a short local reason, never account data."""

    def __init__(self, code: str, returncode: int | None = None):
        super().__init__(f"hold failed (rc={returncode}): {code}")
        self.code = code
        self.returncode = returncode


def _read_lines(stream, lines: "queue.Queue[str | None]") -> None:
    try:
        for line in stream:
            lines.put(line.rstrip("\r\n"))
    except (OSError, ValueError) as err:  # the pipe was closed under us after a kill
        logger.debug("hold output reader stopped: %s", err)
    finally:
        lines.put(None)


def _status(line: str) -> dict:
    try:
        value = json.loads(line)
        version, status = value["protocolVersion"], value["status"]
    except (ValueError, KeyError, TypeError) as error:
        raise PresenceError("protocol") from error
    if type(version) is not int or version != PROTOCOL_VERSION or not isinstance(status, str):
        raise PresenceError("protocol")
    return value


def _error_code(value: dict) -> str:
    code = value.get("error")
    return code if isinstance(code, str) and _ERROR_CODE.fullmatch(code) else "helper_error"


class Presence:
    """Holds one app as 'in game' through a helper process. Not thread-safe; call from one thread."""

    def __init__(self) -> None:
        self._proc: subprocess.Popen | None = None
        self._lines: "queue.Queue[str | None]" = queue.Queue()
        self._reader: threading.Thread | None = None

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self.is_running() else None

    def is_running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def __enter__(self) -> "Presence":
        return self

    def __exit__(self, exc_type: object, *_: object) -> None:
        try:
            self.stop()
        except PresenceError as err:
            if exc_type is None:
                raise
            logger.error("hold stop failed while handling another error: %s", err)  # the body's error wins

    def start(self, helper_exe: "Path | Sequence[str]", steam_id64: str, app_id: int, timeout: float = 10.0) -> None:
        if self._proc is not None:
            raise PresenceError("already_started")
        try:
            steam_account_id(steam_id64)
        except InventoryError as error:
            raise PresenceError("invalid_steam_id") from error
        if type(app_id) is not int or not 0 < app_id < 2**32:
            raise PresenceError("invalid_app_id")
        try:
            proc = spawn(command(helper_exe, "hold", steam_id64, app_id))
        except OSError as error:
            logger.error("hold helper start failed: %s", error)
            raise PresenceError("start_failed") from error
        self._proc, self._lines = proc, queue.Queue()
        self._reader = threading.Thread(target=_read_lines, args=(proc.stdout, self._lines), daemon=True)
        self._reader.start()
        try:
            self._await_holding(proc, app_id, timeout)
        except PresenceError as err:
            logger.error("hold start failed: %s", err)
            self._discard(proc, kill=True)
            raise PresenceError(err.code, proc.returncode) from err

    def _await_holding(self, proc: subprocess.Popen, app_id: int, timeout: float) -> None:
        try:
            line = self._lines.get(timeout=timeout)
        except queue.Empty as error:
            raise PresenceError("timeout") from error
        if line is None:
            with contextlib.suppress(subprocess.TimeoutExpired):  # let a real exit code through before any kill
                proc.wait(timeout=2)
            raise PresenceError("helper_exited")
        value = _status(line)
        if value["status"] == "failed":
            raise PresenceError(_error_code(value))
        seen = value.get("appId")
        if value["status"] != "holding" or type(seen) is not int or seen != app_id:
            raise PresenceError("protocol")

    def stop(self, timeout: float = 3.0) -> None:
        """Ask the helper to release and wait for it; kill the tree and raise if it does not comply. Idempotent."""
        proc = self._proc
        if proc is None:
            return
        deadline = time.monotonic() + timeout
        try:
            self._release(proc, deadline)
        except PresenceError as err:
            logger.error("hold stop failed: %s", err)
            self._discard(proc, kill=True)
            raise PresenceError(err.code, proc.returncode) from err
        self._discard(proc, kill=False)

    def _release(self, proc: subprocess.Popen, deadline: float) -> None:
        try:
            proc.stdin.buffer.write(b"stop\n")  # exact LF bytes, no text-mode CRLF translation
            proc.stdin.flush()
            proc.stdin.close()
        except (OSError, ValueError) as err:
            logger.warning("could not send stop to the helper: %s", err)
        while True:
            try:
                line = self._lines.get(timeout=max(deadline - time.monotonic(), 0))
            except queue.Empty as error:
                raise PresenceError("stop_timeout") from error
            if line is None:
                raise PresenceError("helper_exited")
            value = _status(line)
            if value["status"] == "failed":
                raise PresenceError(_error_code(value))
            if value["status"] == "released":
                break
        try:
            proc.wait(timeout=max(deadline - time.monotonic(), 0.1))
        except subprocess.TimeoutExpired as error:
            raise PresenceError("stop_timeout") from error
        if proc.returncode != 0:
            raise PresenceError("bad_exit")

    def _discard(self, proc: subprocess.Popen, kill: bool) -> None:
        if kill:
            kill_tree(proc)
        self._proc = None
        if self._reader is not None:
            self._reader.join(timeout=2)
            self._reader = None
        for stream in (proc.stdin, proc.stdout):
            with contextlib.suppress(OSError, ValueError):
                stream.close()
