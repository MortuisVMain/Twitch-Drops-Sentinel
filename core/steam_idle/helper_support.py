"""Shared test support: fake helper command prefix and process-liveness checks (Windows)."""
import ctypes
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

FAKE = Path(__file__).with_name("fake_helper.py")


def fake_command(mode: str, pidfile: Path) -> list[str]:
    return [sys.executable, "-S", "-X", "utf8", str(FAKE), mode, str(pidfile)]


def pid_alive(pid: int) -> bool:
    """True while the process has not exited; a direct handle check, far cheaper than spawning tasklist."""
    synchronize, wait_timeout = 0x00100000, 0x102
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel32.OpenProcess(synchronize, False, pid)
    if not handle:
        return False  # no such process (or never ours to open)
    try:
        return kernel32.WaitForSingleObject(handle, 0) == wait_timeout
    finally:
        kernel32.CloseHandle(handle)


def read_pids(pidfile: Path) -> list[int]:
    return [int(token) for token in pidfile.read_text(encoding="utf-8").split()]


def wait_gone(pids: list[int], timeout: float = 5.0) -> list[int]:
    """Return the pids still alive after the timeout."""
    deadline = time.monotonic() + timeout
    alive = list(pids)
    while alive and time.monotonic() < deadline:
        alive = [pid for pid in alive if pid_alive(pid)]
        time.sleep(0.05)
    return alive


def force_kill(pidfile: Path) -> None:
    """Test cleanup so a failed assertion never leaves a sleeper behind."""
    if pidfile.exists():
        for pid in filter(pid_alive, read_pids(pidfile)):
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, check=False)
