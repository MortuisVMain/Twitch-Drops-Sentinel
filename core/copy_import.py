"""Bringing the settings, sign-ins and data of an old copy into this one.

The running service holds its files open and saves them on shutdown, so an import is staged (a marker file) and applied at
the next start, before anything loads, like a profile restore. Before copying, the files it will replace are saved to
data/import_backup_<time>/. The old copy is only ever read. The apply is all or nothing: every file is copied to a temporary
name and moved into place, and a failure puts the already replaced files back and parks the marker as <marker>.failed."""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, List, Optional

from atomic_json import atomic_write_json
from startup_copies import is_within

logger = logging.getLogger("SentinelService")

MARKER_NAME = "import_pending.json"
MARKER_TTL = timedelta(hours=24)  # a staged import that was never applied is stale after this
# Profile files next to the exe (config, Twitch sign-in, engine settings, trophies) and the two data folders
PROFILE_FILES = ("config.json", "core/settings.json", "core/cookies.jar", "cookies.jar", "Trophies.md")
DATA_DIRS = ("data", "giveaways_engine/data")
# Runtime state of the other copy, never carried over: browser profiles and screenshots, backups, logs, its own bookkeeping
SKIP_DIRS = {"browser", "screenshots", "backups", "restore_pending", "rollback", "cache", "node_modules", "__pycache__"}
SKIP_FILES = {MARKER_NAME, "startup_cleanup_backup.json"}
SKIP_SUFFIXES = (".log", ".tmp", ".corrupt")
SIGN_IN_FILES = ("core/cookies.jar", "cookies.jar", "giveaways_engine/data/sessions.json")
_TEMP_SUFFIX = ".importtmp"
_FILE_ATTRIBUTE_REPARSE_POINT = 0x400


class ImportRefused(ValueError):
    """The chosen folder cannot be imported from; the text is meant for the user."""


def is_sentinel_copy(path: Path) -> bool:
    path = Path(path)
    return (path / "core" / "version.py").is_file() or (path / "TwitchDropsSentinel.exe").is_file()


def _is_link(path: Path) -> bool:
    """A symlink or any Windows reparse point (junction, mount point): never followed. Unreadable counts as a link."""
    try:
        return path.is_symlink() or bool(getattr(path.lstat(), "st_file_attributes", 0) & _FILE_ATTRIBUTE_REPARSE_POINT)
    except OSError:
        return True


def _wanted(rel: Path) -> bool:
    if rel.name in SKIP_FILES or rel.name.endswith(SKIP_SUFFIXES):
        return False
    return not any(part in SKIP_DIRS or part.startswith("import_backup_") for part in rel.parts[:-1])


def _plain_file(path: Path, base: Path) -> bool:
    """A regular file that really lies inside base (no link on the way)."""
    return path.is_file() and not _is_link(path) and is_within(path, base)


def _files(base: Path) -> List[str]:
    """Posix paths, relative to base, of the files an import covers. Links and junctions are skipped, not followed."""
    base = Path(base)
    found = [rel for rel in PROFILE_FILES if _plain_file(base / rel, base)]
    for folder in DATA_DIRS:
        root = base / folder
        if not root.is_dir() or _is_link(root) or not is_within(root, base):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if not _is_link(Path(dirpath) / d))
            for name in sorted(filenames):
                path = Path(dirpath) / name
                if _wanted(path.relative_to(root)) and _plain_file(path, base):
                    found.append(path.relative_to(base).as_posix())
    return found


def own_data_state(project: Path, defaults: dict) -> dict:
    """What an import would replace: settings that differ from the defaults, and any sign-in. An unreadable config counts as the user's."""
    project = Path(project)
    config = project / "config.json"
    non_default = False
    if config.is_file():
        try:
            current = json.loads(config.read_text(encoding="utf-8-sig"))
            non_default = not isinstance(current, dict) or any(key in current and current[key] != value for key, value in defaults.items())
        except ValueError:
            logger.warning("config.json of this copy is unreadable; an import will ask before replacing it", exc_info=True)
            non_default = True
    return {"nonDefaultConfig": non_default, "signedIn": any((project / rel).is_file() for rel in SIGN_IN_FILES)}


def has_importable_data(source: Path) -> bool:
    return bool(_files(Path(source)))


def stage_import(project: Path, source: Path) -> dict:
    """Checks the source and writes the marker (resolved absolute path, time) that the next start applies. Raises ImportRefused."""
    project, source = Path(project).resolve(), Path(source).resolve()
    if source == project:
        raise ImportRefused("это текущая копия")
    if not is_sentinel_copy(source):
        raise ImportRefused("в этой папке нет копии Hell Harvest")
    marker = {"source": str(source), "time": datetime.now().isoformat(timespec="seconds")}
    atomic_write_json(project / "data" / MARKER_NAME, marker)
    return marker


def _system_exes() -> List[str]:
    import psutil
    return [proc.info["exe"] for proc in psutil.process_iter(["exe"]) if proc.info.get("exe")]


def _check_destination(project: Path, rel: str) -> Path:
    target = project / rel
    if (os.path.lexists(target) and _is_link(target)) or not is_within(target, project):
        raise ImportRefused(f"{rel} leads outside of this copy")
    return target


def _put_back(backup: Path, project: Path, replaced: List[str], created: List[str]) -> None:
    """Rollback of a failed apply: replaced files come back from the backup, files that did not exist are removed again."""
    for rel in replaced:
        try:
            shutil.copy2(backup / rel, project / rel)
        except OSError:
            logger.error("Rollback of %s failed; the original is in %s", rel, backup, exc_info=True)
    for rel in created:
        try:
            (project / rel).unlink(missing_ok=True)
        except OSError:
            logger.error("Rollback could not remove %s", rel, exc_info=True)


def apply_pending_import(project: Path, now: Callable[[], str] = lambda: datetime.now().strftime("%Y%m%d_%H%M%S"),
                         clock: Callable[[], datetime] = datetime.now, running_exes: Callable[[], List[str]] = _system_exes,
                         copy_file: Callable = shutil.copy2) -> Optional[List[str]]:
    """At start: re-checks the staged source, backs up what will be replaced, copies the staged files over this copy, removes the marker.
    Returns the copied files, or None when nothing was staged, the marker is stale or no longer valid (it is dropped, nothing
    changes), or the copy failed (rolled back, the marker kept as <marker>.failed so it is not retried at every start)."""
    project = Path(project).resolve()
    marker_path = project / "data" / MARKER_NAME
    if not marker_path.is_file():
        return None
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
        source, staged = Path(marker["source"]), datetime.fromisoformat(marker["time"])
    except (ValueError, KeyError, TypeError, OSError):
        logger.error("Import marker %s is unreadable; dropped, nothing imported", marker_path, exc_info=True)
        marker_path.unlink(missing_ok=True)
        return None
    problem = None
    if not source.is_absolute():
        problem = "its source is not an absolute path"
    elif clock() - staged > MARKER_TTL:
        logger.warning("Import marker %s was staged at %s, more than %s ago; dropped, nothing imported", marker_path, staged, MARKER_TTL)
        marker_path.unlink(missing_ok=True)
        return None
    else:
        source = source.resolve()
        if source == project:
            problem = "the source is this copy"
        elif not is_sentinel_copy(source):
            problem = f"{source} is gone or is not a Hell Harvest copy any more"
        elif any(is_within(exe, source) for exe in running_exes()):
            problem = f"the copy at {source} is running"
    if problem:
        logger.error("Staged import dropped, nothing imported: %s", problem)
        marker_path.unlink(missing_ok=True)
        return None

    files = _files(source)
    backup = project / "data" / f"import_backup_{now()}"
    replaced: List[str] = []
    created: List[str] = []
    try:
        for rel in files:
            target = _check_destination(project, rel)
            saved = backup / rel
            if target.is_file() and not saved.exists():
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
        for rel in files:
            target = _check_destination(project, rel)
            existed = target.is_file()
            target.parent.mkdir(parents=True, exist_ok=True)
            temp = target.with_name(target.name + _TEMP_SUFFIX)
            try:
                copy_file(source / rel, temp)
                os.replace(temp, target)
            finally:
                temp.unlink(missing_ok=True)
            (replaced if existed else created).append(rel)
    except Exception:
        logger.error("Import from %s failed half way; the files already replaced are put back and the marker is kept as %s.failed",
                     source, MARKER_NAME, exc_info=True)
        _put_back(backup, project, replaced, created)
        os.replace(marker_path, marker_path.with_name(MARKER_NAME + ".failed"))
        return None
    marker_path.unlink(missing_ok=True)
    logger.info("Imported %d files from %s; the replaced files are in %s", len(files), source, backup)
    return files
