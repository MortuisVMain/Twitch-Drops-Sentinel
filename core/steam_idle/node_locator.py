"""Finds Node.js when the PATH of this process is stale (it was installed, for example with winget, after the app started).

The process PATH is tried first. Then the PATH that Windows keeps in the registry (read fresh: the user's and the
machine's) and the folders the installers use. Every lookup is injected, so the tests touch neither disk nor registry."""
import logging
import os
import re
import shutil
from collections.abc import Callable, Mapping
from pathlib import Path

logger = logging.getLogger(__name__)

_REGISTRY_PATHS = (("HKEY_CURRENT_USER", "Environment"),
                   ("HKEY_LOCAL_MACHINE", r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"))


def registry_paths() -> list[str]:
    """The `Path` value of the user's and the machine's environment, as stored (variables not yet expanded)."""
    import winreg
    values = []
    for hive, subkey in _REGISTRY_PATHS:
        try:
            with winreg.OpenKey(getattr(winreg, hive), subkey) as key:
                value = winreg.QueryValueEx(key, "Path")[0]
        except OSError as error:  # no such value for this user or machine: a normal state
            logger.debug("registry %s\\%s Path not readable: %s", hive, subkey, error)
            continue
        if isinstance(value, str):
            values.append(value)
    return values


def find_node(which: Callable[[str], str | None] = shutil.which, environ: Mapping[str, str] = os.environ,
              registry_paths: Callable[[], list[str]] = registry_paths,
              is_file: Callable[[Path], bool] = Path.is_file) -> str | None:
    """Path of node.exe, or None. The process PATH, then the registry PATH, then the usual install folders."""
    found = which("node")
    if found is not None:
        return found
    folders: list[str] = []
    try:
        for value in registry_paths():
            folders += [_expand(part, environ) for part in value.split(";")]
    except OSError:
        logger.warning("the registry PATH could not be read", exc_info=True)
    for variable, tail in (("ProgramFiles", "nodejs"), ("ProgramFiles(x86)", "nodejs"), ("LOCALAPPDATA", r"Programs\nodejs")):
        if environ.get(variable):
            folders.append(str(Path(environ[variable]) / tail))
    for folder in folders:
        if folder.strip():
            candidate = Path(folder.strip()) / "node.exe"
            if is_file(candidate):
                return str(candidate)
    return None


def _expand(text: str, environ: Mapping[str, str]) -> str:
    """%NAME% variables of a registry value, from `environ` (an unknown one stays as it is)."""
    return re.sub(r"%([^%]+)%", lambda match: environ.get(match.group(1)) or match.group(0), text)
