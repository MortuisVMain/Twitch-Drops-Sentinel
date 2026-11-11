"""Shared plumbing for talking to the native helper: spawn without a console, kill the whole tree."""
import logging
import os
import subprocess
from collections.abc import Sequence
from pathlib import Path

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = 2  # the batch/hold contract bumps the helper's version by one
CREATE_NO_WINDOW = 0x08000000


def command(helper: "Path | str | Sequence[str]", *args: object) -> list[str]:
    """Helper executable (or a command prefix, used by tests) plus arguments, never a shell string."""
    prefix = [str(helper)] if isinstance(helper, (str, os.PathLike)) else [str(part) for part in helper]
    return [*prefix, *(str(arg) for arg in args)]


def spawn(cmd: list[str]) -> subprocess.Popen:
    return subprocess.Popen(cmd, shell=False, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace",
                            creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)


def kill_tree(proc: subprocess.Popen) -> None:
    """Kill the process and its children, then reap it. Failures are logged, never swallowed silently."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        try:
            result = subprocess.run(["taskkill.exe", "/F", "/T", "/PID", str(proc.pid)], shell=False,
                                    capture_output=True, check=False, timeout=10,
                                    creationflags=CREATE_NO_WINDOW)
            if result.returncode != 0:
                logger.warning("taskkill returned %s for helper tree", result.returncode)
        except (OSError, subprocess.SubprocessError) as err:
            logger.error("taskkill failed for helper tree: %s", err)
    if proc.poll() is None:
        try:
            proc.kill()
        except OSError as err:
            logger.warning("helper kill after taskkill: %s", err)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        logger.error("helper process did not exit after kill (pid %s)", proc.pid)
