"""Shared test support: fake helper command prefix and process-liveness checks (Windows)."""
import subprocess
import sys
import time
from pathlib import Path

FAKE = Path(__file__).with_name("fake_helper.py")


def fake_command(mode: str, pidfile: Path) -> list[str]:
    return [sys.executable, "-X", "utf8", str(FAKE), mode, str(pidfile)]


def pid_alive(pid: int) -> bool:
    result = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
                            capture_output=True, check=True)
    # tasklist answers in the console code page (CP866 on Russian Windows); the PID itself is ASCII.
    return f'"{pid}"'.encode("ascii") in result.stdout


def read_pids(pidfile: Path) -> list[int]:
    return [int(token) for token in pidfile.read_text(encoding="utf-8").split()]


def wait_gone(pids: list[int], timeout: float = 5.0) -> list[int]:
    """Return the pids still alive after the timeout."""
    deadline = time.monotonic() + timeout
    alive = list(pids)
    while alive and time.monotonic() < deadline:
        alive = [pid for pid in alive if pid_alive(pid)]
        time.sleep(0.1)
    return alive


def force_kill(pidfile: Path) -> None:
    """Test cleanup so a failed assertion never leaves a sleeper behind."""
    if pidfile.exists():
        for pid in read_pids(pidfile):
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, check=False)
