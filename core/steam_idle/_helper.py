"""Shared plumbing for talking to the native helper: spawn without a console, kill the whole tree."""
import logging
import os
import re
import subprocess
import weakref
from collections.abc import Sequence
from pathlib import Path

from .inventory import InventoryError

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = 2  # the batch/hold contract bumps the helper's version by one
CREATE_NO_WINDOW = 0x08000000
WRITE_GATE = "SENTINEL_STEAM_IDLE_ALLOW_WRITE"
TASKKILL_NOT_FOUND = 128  # the process is already gone: a normal outcome
_STEAM_ID_PREFIX = 0x0110000100000000


def steam_account_id(expected: str) -> int:
    """Validate a SteamID64 (individual, public universe) and return its 32-bit account id."""
    if (not isinstance(expected, str) or not re.fullmatch(r"[1-9][0-9]{16}", expected)
            or int(expected) >> 32 != _STEAM_ID_PREFIX >> 32
            or not 0 < int(expected) & 0xffffffff):
        raise InventoryError("invalid expected SteamID64")
    return int(expected) & 0xffffffff


def command(helper: "Path | str | Sequence[str]", *args: object) -> list[str]:
    """Helper executable (or a command prefix, used by tests) plus arguments, never a shell string."""
    prefix = [str(helper)] if isinstance(helper, (str, os.PathLike)) else [str(part) for part in helper]
    return [*prefix, *(str(arg) for arg in args)]


def _job_for(proc: subprocess.Popen):
    """Put the helper in a job object so its descendants stay reachable after it exits (taskkill /T cannot
    find them then). Closing the last handle kills any survivors. Returns the handle or None (logged)."""
    import ctypes
    from ctypes import wintypes

    class Counters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in ("r", "w", "o", "rb", "wb", "ob")]

    class Basic(ctypes.Structure):
        _fields_ = [("per_process_time", ctypes.c_int64), ("per_job_time", ctypes.c_int64),
                    ("flags", wintypes.DWORD), ("min_ws", ctypes.c_size_t), ("max_ws", ctypes.c_size_t),
                    ("active_limit", wintypes.DWORD), ("affinity", ctypes.c_size_t),
                    ("priority", wintypes.DWORD), ("scheduling", wintypes.DWORD)]

    class Extended(ctypes.Structure):
        _fields_ = [("basic", Basic), ("io", Counters), ("process_mem", ctypes.c_size_t),
                    ("job_mem", ctypes.c_size_t), ("peak_process_mem", ctypes.c_size_t),
                    ("peak_job_mem", ctypes.c_size_t)]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        logger.warning("job object not created: %s", ctypes.WinError(ctypes.get_last_error()))
        return None
    info = Extended()
    info.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not (kernel32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))
            and kernel32.AssignProcessToJobObject(job, int(proc._handle))):
        logger.warning("helper not placed in a job object: %s", ctypes.WinError(ctypes.get_last_error()))
        kernel32.CloseHandle(job)
        return None
    weakref.finalize(proc, kernel32.CloseHandle, job)
    return job


def child_env() -> dict[str, str]:
    """The parent environment without the write gate: no child may inherit the permission to change an account."""
    return {key: value for key, value in os.environ.items() if key.upper() != WRITE_GATE}


def spawn(cmd: list[str], env: "dict[str, str] | None" = None, stderr: int = subprocess.DEVNULL) -> subprocess.Popen:
    """Start a helper child. `env` defaults to `child_env()`; only the unlock path passes one that carries the gate.
    `stderr` is DEVNULL unless the caller reads the pipe itself (the community reader does)."""
    proc = subprocess.Popen(cmd, shell=False, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=stderr, text=True, encoding="utf-8", errors="replace",
                            env=child_env() if env is None else env,
                            creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        proc.job = _job_for(proc) if os.name == "nt" else None
    except Exception as error:  # a started child must never be left behind
        logger.error("job object setup failed: %s", error, exc_info=True)
        kill_tree(proc)
        for stream in (proc.stdin, proc.stdout):
            stream.close()
        raise OSError("job object setup failed") from error
    return proc


def _terminate_job(proc: subprocess.Popen) -> None:
    import ctypes
    from ctypes import wintypes
    terminate = ctypes.WinDLL("kernel32").TerminateJobObject
    terminate.argtypes = [wintypes.HANDLE, wintypes.UINT]
    if not terminate(proc.job, 1):
        logger.error("job termination failed for helper tree: %s", ctypes.WinError())


def kill_tree(proc: subprocess.Popen) -> None:
    """Kill the process and its children, then reap it. Failures are logged, never swallowed silently."""
    if os.name == "nt":  # even when the direct child already exited, its children may still run
        if getattr(proc, "job", None):
            _terminate_job(proc)
        try:
            result = subprocess.run(["taskkill.exe", "/F", "/T", "/PID", str(proc.pid)], shell=False,
                                    capture_output=True, check=False, timeout=10,
                                    creationflags=CREATE_NO_WINDOW)
            if result.returncode not in (0, TASKKILL_NOT_FOUND):
                logger.warning("taskkill returned %s for helper tree", result.returncode)
        except (OSError, subprocess.SubprocessError) as err:
            logger.error("taskkill failed for helper tree: %s", getattr(err, "strerror", None) or type(err).__name__)
    if proc.poll() is None:
        try:
            proc.kill()
        except OSError as err:
            logger.warning("helper kill after taskkill: %s", err)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        logger.error("helper process did not exit after kill (pid %s)", proc.pid)
