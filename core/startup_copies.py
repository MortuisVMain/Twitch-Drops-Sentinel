"""Other copies of the app that start with Windows or still run: finding them (read-only) and cleaning up after them.

Users unpack every release into a new folder, so old copies keep an autostart entry, a giveaways task or a v2 Startup
shortcut. Every system reader and writer sits behind `Backend`, so the logic is tested with fakes and never touches the
real registry, Startup folder, scheduled tasks or processes. A removal first appends the original entry to the backup
file; the only thing ever deleted from disk is the .lnk shortcut itself, never a file or folder of the other copy."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from atomic_json import atomic_write_json

logger = logging.getLogger("SentinelService")

CLOSE_GRACE_SECONDS = 3.0
_CLOSE_POLL_SECONDS = 0.25
EXE_NAME = "TwitchDropsSentinel.exe"
AUTOSTART_VALUE = "TwitchDropsSentinel"
RUN_SUBKEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUNONCE_SUBKEY = r"Software\Microsoft\Windows\CurrentVersion\RunOnce"
TASK_PREFIX = "FreeGamesClaimerStudio"
AUTO_CLEAN_KINDS = ("run_value", "startup_link", "scheduler_task")

_OUR_NAME_RE = re.compile(rf'{re.escape(EXE_NAME)}|start_sentinel[^\\/"<>|?*]*\.bat', re.IGNORECASE)
_ABSOLUTE_RE = re.compile(r"(?:[A-Za-z]:[\\/]|\\\\)")
_BARE_COMMAND_RE = re.compile(r'[^"<>|?*]*?\.(?:exe|bat|cmd)(?=\s|$)', re.IGNORECASE)
_CMD_SWITCH_RE = re.compile(r"\s*(?:/[sqeav]\s+)*/[ck]\s*", re.IGNORECASE)
_RUNNER_RE = re.compile(r'"([^"]*runner\.js)"', re.IGNORECASE)
_VERSION_RE = re.compile(r'__version__\s*=\s*["\']([^"\']+)["\']')
_TASK_NAME_RE = re.compile(rf"{TASK_PREFIX}(-[A-Za-z0-9]+)?")
_TASK_PATH_RE = re.compile(r"\\(?:(?!\.+\\)[A-Za-z0-9 _.-]+\\)*")
_VALUE_NAME_RE = re.compile(r"[^\\\x00-\x1f]{1,255}")
_NO_WINDOW = 0x08000000
_TASK_ROOT = "\\"
_LNK_MAGIC = b"\x4c\x00\x00\x00"
_START_TOLERANCE = 0.01


class Refusal(Exception):
    """The action is against the rules (not removable, not ours, changed since the scan): a refusal, not a failure."""


class NotFound(KeyError):
    """No entry with that id (any more)."""


def norm(path) -> str:
    """Case-insensitive, slash-insensitive form of a path, for comparing folders."""
    return os.path.normcase(os.path.realpath(str(path)))


def is_within(path, folder) -> bool:
    """Whole path components, not characters: C:\\a\\bc is not inside C:\\a\\b."""
    inner, outer = norm(path), norm(folder)
    return inner == outer or inner.startswith(outer.rstrip(os.sep) + os.sep)


def copy_root(exe_dir) -> Path:
    """In a source checkout the exe sits in <root>\\desktop\\publish; the copy is the root."""
    folder = Path(exe_dir)
    if folder.name.casefold() == "publish" and folder.parent.name.casefold() == "desktop":
        return folder.parent.parent
    return folder


def _split_command(text: str) -> tuple:
    """(the executable token, the rest): a quoted first token, a bare path up to .exe/.bat/.cmd, or the first word."""
    text = text.strip()
    if text.startswith('"'):
        end = text.find('"', 1)
        return (text[1:], "") if end < 0 else (text[1:end], text[end + 1:])
    bare = _BARE_COMMAND_RE.match(text)
    if bare:
        return bare.group(0), text[bare.end():]
    head, _, rest = text.partition(" ")
    return head, rest


def _basename(path: str) -> str:
    return re.split(r"[\\/]", path)[-1]


def extract_target(command: str) -> Optional[str]:
    """Our exe or start_sentinel*.bat when it is the program the command runs (directly or as cmd /c <it>); an argument never counts."""
    head, rest = _split_command(os.path.expandvars(command or ""))
    if _basename(head).casefold() in ("cmd", "cmd.exe"):
        switch = _CMD_SWITCH_RE.match(rest)
        if not switch:
            return None
        rest = rest[switch.end():]
        if rest.startswith('""'):
            rest = rest[1:]
        head, _ = _split_command(rest)
    return head if _ABSOLUTE_RE.match(head) and _OUR_NAME_RE.fullmatch(_basename(head)) else None


def _same_start(a: Optional[float], b: Optional[float]) -> bool:
    return a is None and b is None or (a is not None and b is not None and abs(a - b) < _START_TOLERANCE)


def _looks_like_task_xml(text) -> bool:
    return isinstance(text, str) and text.lstrip().startswith("<") and "Task" in text


class Backend:
    """Everything that touches the system. The defaults read the real files; the system methods are in SystemBackend."""

    def path_exists(self, path) -> bool:
        return Path(path).exists()

    def read_text(self, path) -> Optional[str]:
        try:
            return Path(path).read_text(encoding="utf-8-sig")
        except OSError:
            return None

    def run_entries(self) -> list: raise NotImplementedError
    def delete_run_value(self, hive, subkey, name): raise NotImplementedError
    def set_run_value(self, hive, subkey, name, data): raise NotImplementedError
    def startup_folder(self) -> Optional[Path]: raise NotImplementedError
    def startup_links(self) -> list: raise NotImplementedError
    def scheduled_tasks(self) -> list: raise NotImplementedError
    def export_task(self, name, path) -> str: raise NotImplementedError
    def unregister_task(self, name, path): raise NotImplementedError
    def register_task(self, name, path, xml): raise NotImplementedError
    def processes(self) -> list: raise NotImplementedError  # (pid, exe, create_time): the start time tells a process from a later one that got its pid
    def request_close(self, pid, created): raise NotImplementedError
    def kill_tree(self, pid, copy_dir, created): raise NotImplementedError


def _read_version(backend: Backend, copy_dir: Path) -> Optional[str]:
    text = backend.read_text(copy_dir / "core" / "version.py")
    found = _VERSION_RE.search(text) if text else None
    return found.group(1) if found else None


def _finding(backend: Backend, kind: str, name: str, target: str, copy_dir: Optional[Path], location: str, *,
             removable: bool, closable: bool = False, pid: Optional[int] = None, started_at: Optional[float] = None,
             owns_autostart: bool = False, task_path: Optional[str] = None) -> dict:
    exists = None if copy_dir is None else backend.path_exists(copy_dir)
    key = "|".join([kind, location, name, norm(target) if target else "", str(pid or ""), str(started_at or "")])
    return {
        "id": hashlib.sha1(key.encode("utf-8")).hexdigest()[:12], "kind": kind, "name": name, "target": target,
        "copyDir": None if copy_dir is None else str(copy_dir),
        "version": None if copy_dir is None else _read_version(backend, copy_dir),
        "dirExists": exists, "removable": removable, "closable": closable, "location": location, "pid": pid,
        "ownsAutostart": owns_autostart, "startedAt": started_at, "taskPath": task_path,
    }


def _mine(project_dir) -> set:
    return {norm(project_dir), norm(Path(project_dir) / "desktop" / "publish")}


def _other_copy_dir(exe_dir, mine: set) -> Optional[Path]:
    """The folder of the copy an exe belongs to, or None when that is this copy."""
    root = copy_root(exe_dir)
    return None if norm(root) in mine or norm(exe_dir) in mine else root


def _task_runner(task: dict) -> tuple:
    """(runner.js path or None, the copy folder it belongs to or None) of a scheduler task."""
    runner = _RUNNER_RE.search(task.get("arguments") or "")
    engine_dir = Path(runner.group(1)).parent if runner else None
    copy_dir = engine_dir.parent if engine_dir is not None and engine_dir.name.casefold() == "giveaways_engine" else None
    return (runner.group(1) if runner else None), copy_dir


def scan(backend: Backend, project_dir: Path, this_task: str, own_pid: Optional[int] = None, platform_name: str = sys.platform) -> dict:
    """Findings for every copy other than this one. Windows only: anywhere else the answer is empty."""
    result = {"findings": [], "autostartOwner": None, "scannedAt": time.time()}
    if platform_name != "win32":
        return result
    mine = _mine(project_dir)
    own_pid = os.getpid() if own_pid is None else own_pid
    findings = result["findings"]

    for hive, subkey, name, data in backend.run_entries():
        target = extract_target(data)
        copy_dir = _other_copy_dir(Path(target).parent, mine) if target else None
        if copy_dir is None:
            continue
        location = f"{hive}\\{subkey}"
        is_user_run = hive == "HKCU" and subkey == RUN_SUBKEY
        findings.append(_finding(backend, "hklm_run" if hive == "HKLM" else "run_value", name, target, copy_dir, location,
                                 removable=hive == "HKCU", owns_autostart=is_user_run and name == AUTOSTART_VALUE))

    for lnk, command in backend.startup_links():
        target = extract_target(command)
        copy_dir = _other_copy_dir(Path(target).parent, mine) if target else None
        if copy_dir is not None:
            findings.append(_finding(backend, "startup_link", Path(lnk).name, target, copy_dir, str(lnk), removable=True))

    for task in backend.scheduled_tasks():
        name = str(task.get("name") or "")
        if name.casefold() == this_task.casefold() or not (name.casefold() == TASK_PREFIX.casefold() or name.casefold().startswith(TASK_PREFIX.casefold() + "-")):
            continue
        runner, copy_dir = _task_runner(task)
        if copy_dir is not None and norm(copy_dir) in mine:
            continue
        task_path = str(task.get("path") or _TASK_ROOT)
        findings.append(_finding(backend, "scheduler_task", name, runner or "", copy_dir, f"Task Scheduler{task_path}{name}",
                                 removable=copy_dir is not None, task_path=task_path))

    for pid, exe, created in backend.processes():
        if pid == own_pid or Path(exe).name.casefold() != EXE_NAME.casefold():
            continue
        copy_dir = _other_copy_dir(Path(exe).parent, mine)
        if copy_dir is not None:
            findings.append(_finding(backend, "process", EXE_NAME, exe, copy_dir, f"pid {pid}", removable=False, closable=True, pid=pid, started_at=created))

    owners = [f for f in findings if f["ownsAutostart"]]
    result["autostartOwner"] = owners[0] if owners else None
    return result


class StartupCopies:
    """Cached findings plus the cleanup actions on them; one lock, so the UI and the start check never interleave."""

    def __init__(self, backend: Backend, project_dir: Path, this_task: str, backup_path: Path, set_autostart: Callable[[bool], bool],
                 own_pid: Optional[int] = None, notify: Optional[Callable[[str, str], None]] = None,
                 sleep: Callable[[float], None] = time.sleep, monotonic: Callable[[], float] = time.monotonic):
        self._backend, self._project, self._task = backend, Path(project_dir), this_task
        self._mine = _mine(project_dir)
        self._backup_path, self._set_autostart, self._own_pid, self._notify = Path(backup_path), set_autostart, own_pid, notify
        self._sleep, self._monotonic = sleep, monotonic
        self._lock = threading.RLock()
        self._state: Optional[dict] = None

    def rescan(self) -> dict:
        with self._lock:
            self._state = scan(self._backend, self._project, self._task, self._own_pid)
            return self._state

    def state(self) -> dict:
        with self._lock:
            return self._state if self._state is not None else self.rescan()

    def _find(self, finding_id: str) -> dict:
        for attempt in (self.state(), None):
            state = attempt if attempt is not None else self.rescan()
            for finding in state["findings"]:
                if finding["id"] == finding_id:
                    return finding
        raise NotFound(finding_id)

    # --- backup -----------------------------------------------------------------------------------------------------
    def _read_backups(self) -> list:
        if not self._backup_path.exists():
            return []
        try:
            data = json.loads(self._backup_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
            raise ValueError("not a list")
        except ValueError as exc:
            corrupt = self._backup_path.with_name(self._backup_path.name + ".corrupt")
            logger.error("Startup cleanup backup %s is unreadable (%s); kept as %s and a new one started", self._backup_path, exc, corrupt, exc_info=True)
            os.replace(self._backup_path, corrupt)
            return []

    def _append_backup(self, record: dict) -> str:
        record = {"backupId": uuid.uuid4().hex[:12], "time": datetime.now().isoformat(timespec="seconds"), **record}
        atomic_write_json(self._backup_path, self._read_backups() + [record])
        return record["backupId"]

    def _read_current(self, finding: dict) -> Optional[dict]:
        """What the entry holds right now ({'target', 'data'}), read again from the system; None when it is gone."""
        kind, name = finding["kind"], finding["name"]
        if kind == "run_value":
            hive, subkey = finding["location"].split("\\", 1)
            data = next((d for h, s, n, d in self._backend.run_entries() if (h, s, n) == (hive, subkey, name)), None)
            return None if data is None else {"target": extract_target(data), "data": data, "copyDir": None}
        if kind == "startup_link":
            command = next((c for lnk, c in self._backend.startup_links() if norm(lnk) == norm(finding["location"])), None)
            return None if command is None else {"target": extract_target(command), "data": command, "copyDir": None}
        if kind == "scheduler_task":
            task = next((t for t in self._backend.scheduled_tasks()
                         if t.get("name") == name and str(t.get("path") or _TASK_ROOT) == finding["taskPath"]), None)
            if task is None:
                return None
            runner, copy_dir = _task_runner(task)
            return {"target": runner, "data": None, "copyDir": copy_dir}
        raise Refusal(kind)

    def _verified_current(self, finding: dict) -> dict:
        """The entry as it is now, once it is confirmed to be the one the user saw: still another copy's, still at the same place."""
        current = self._read_current(finding)
        if current is None or not current["target"]:
            raise Refusal("запись уже изменилась или исчезла, обновите список")
        folder = current["copyDir"] if finding["kind"] == "scheduler_task" else _other_copy_dir(Path(current["target"]).parent, self._mine)
        if folder is None or (finding["kind"] == "scheduler_task" and norm(folder) in self._mine):
            raise Refusal("запись теперь указывает на эту копию")
        if norm(current["target"]) != norm(finding["target"]):
            raise Refusal("запись теперь указывает на другое место, обновите список")
        return current

    def _backup_finding(self, finding: dict, current: dict) -> None:
        kind, base = finding["kind"], {"kind": finding["kind"], "name": finding["name"], "target": finding["target"], "copyDir": finding["copyDir"]}
        if kind == "run_value":
            hive, subkey = finding["location"].split("\\", 1)
            self._append_backup({**base, "hive": hive, "subkey": subkey, "data": current["data"]})
        elif kind == "startup_link":
            self._append_backup({**base, "path": finding["location"], "bytesBase64": base64.b64encode(Path(finding["location"]).read_bytes()).decode("ascii")})
        elif kind == "scheduler_task":
            xml = self._backend.export_task(finding["name"], finding["taskPath"])
            if not _looks_like_task_xml(xml):
                raise RuntimeError(f"the export of task {finding['name']} is empty or not XML; the task is left in place")
            self._append_backup({**base, "taskPath": finding["taskPath"], "xml": xml})
        else:
            raise Refusal(kind)

    def restore(self, backup_id: str) -> bool:
        """Puts a backed-up entry back as it was, after checking that the record is one of ours; what it overwrites is saved first."""
        with self._lock:
            record = next((r for r in self._read_backups() if isinstance(r, dict) and r.get("backupId") == backup_id), None)
            if record is None:
                raise NotFound(backup_id)
            kind = record.get("kind")
            if kind == "run_value":
                self._restore_run_value(record)
            elif kind == "startup_link":
                self._restore_startup_link(record)
            elif kind == "scheduler_task":
                self._restore_task(record)
            else:
                raise Refusal(f"неизвестный тип записи: {kind!r}")
            logger.info("Startup entry restored from the cleanup backup: %s %s", kind, record.get("name"))
            self.rescan()
            return True

    def _restore_run_value(self, record: dict) -> None:
        hive, subkey, name, data = (record.get(k) for k in ("hive", "subkey", "name", "data"))
        if (hive != "HKCU" or subkey not in (RUN_SUBKEY, RUNONCE_SUBKEY) or not isinstance(name, str) or not _VALUE_NAME_RE.fullmatch(name)
                or not isinstance(data, str) or extract_target(data) is None):
            raise Refusal("запись резервной копии не похожа на автозапуск Sentinel")
        current = next((d for h, s, n, d in self._backend.run_entries() if (h, s, n) == (hive, subkey, name)), None)
        if current is not None and current != data:
            self._append_backup({"kind": "run_value", "name": name, "target": extract_target(current), "copyDir": None, "hive": hive, "subkey": subkey, "data": current})
        self._backend.set_run_value(hive, subkey, name, data)

    def _restore_startup_link(self, record: dict) -> None:
        folder, raw = self._backend.startup_folder(), record.get("path")
        path = Path(raw) if isinstance(raw, str) and raw else None
        if (folder is None or path is None or path.suffix.lower() != ".lnk" or ".." in path.parts or norm(path.parent) != norm(folder)):
            raise Refusal("ярлык можно вернуть только в папку автозагрузки")
        try:
            content = base64.b64decode(record.get("bytesBase64") or "", validate=True)
        except (binascii.Error, ValueError, TypeError):
            raise Refusal("в резервной копии повреждено содержимое ярлыка") from None
        if not content.startswith(_LNK_MAGIC):
            raise Refusal("в резервной копии не ярлык")
        if path.is_file() and path.read_bytes() != content:
            self._append_backup({"kind": "startup_link", "name": path.name, "target": None, "copyDir": None, "path": str(path),
                                 "bytesBase64": base64.b64encode(path.read_bytes()).decode("ascii")})
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def _restore_task(self, record: dict) -> None:
        name, task_path, xml = record.get("name"), record.get("taskPath") or _TASK_ROOT, record.get("xml")
        if (not isinstance(name, str) or not _TASK_NAME_RE.fullmatch(name) or not isinstance(task_path, str) or not _TASK_PATH_RE.fullmatch(task_path)
                or not _looks_like_task_xml(xml)):
            raise Refusal("запись резервной копии не похожа на задание Sentinel")
        if any(t.get("name") == name and str(t.get("path") or _TASK_ROOT) == task_path for t in self._backend.scheduled_tasks()):
            raise Refusal("задание с таким именем уже есть, оно не перезаписывается")
        self._backend.register_task(name, task_path, xml)

    # --- actions ----------------------------------------------------------------------------------------------------
    def _remove_found(self, finding: dict) -> None:
        if not finding["removable"]:
            raise Refusal("эту запись убрать нельзя")
        current = self._verified_current(finding)
        self._backup_finding(finding, current)  # first: if it cannot be saved, nothing is removed
        kind = finding["kind"]
        if kind == "run_value":
            hive, subkey = finding["location"].split("\\", 1)
            self._backend.delete_run_value(hive, subkey, finding["name"])
        elif kind == "startup_link":
            Path(finding["location"]).unlink()
        else:
            self._backend.unregister_task(finding["name"], finding["taskPath"])
        logger.info("Removed startup entry of another copy (%s %s -> %s); the original is in %s", kind, finding["name"], finding["target"], self._backup_path.name)

    def remove(self, finding_id: str) -> bool:
        with self._lock:
            self._remove_found(self._find(finding_id))
            self.rescan()
            return True

    def remove_all(self) -> dict:
        """Tries every removable finding; one failure is logged and reported for its item and never stops the others."""
        with self._lock:
            results = []
            for finding in [f for f in self.state()["findings"] if f["removable"]]:
                item = {"id": finding["id"], "name": finding["name"]}
                try:
                    self._remove_found(finding)
                    results.append({**item, "ok": True})
                except Exception as exc:
                    logger.error("Could not remove the startup entry %s (%s): %s", finding["name"], finding["target"], exc, exc_info=True)
                    results.append({**item, "ok": False, "error": str(exc) if isinstance(exc, Refusal) else "ошибка системы, подробности в журнале"})
            self.rescan()
            return {"removed": sum(1 for r in results if r["ok"]), "results": results}

    def move_autostart(self) -> bool:
        """The autostart value of the other copy is backed up, then rewritten to start this copy. A failure raises."""
        with self._lock:
            owner = self.rescan()["autostartOwner"]
            if owner is not None:
                current = self._read_current(owner)
                if current is not None:
                    self._backup_finding(owner, current)
            if not self._set_autostart(True):
                logger.error("Moving the autostart to this copy failed (the autostart setter reported no success)")
                raise RuntimeError("the autostart was not moved")
            logger.info("Autostart moved to this copy (was: %s)", owner["target"] if owner else "none")
            self.rescan()
            return True

    def _same_process(self, finding: dict) -> bool:
        """The process in the finding is still running: the same pid, exe and start time, so a reused pid does not count."""
        exe = norm(finding["target"])
        return any(p == finding["pid"] and norm(e) == exe and _same_start(c, finding["startedAt"]) for p, e, c in self._backend.processes())

    def close(self, finding_id: str) -> bool:
        """Closes a running exe of another copy: a polite close first, its process tree is killed after the grace time.
        The process is re-identified (pid, exe, start time) right before each step, so a reused pid is never touched."""
        with self._lock:
            finding = self._find(finding_id)
            if not finding["closable"]:
                raise Refusal("эту запись закрыть нельзя")
            pid, copy_dir, started = finding["pid"], finding["copyDir"], finding["startedAt"]
            if not self._same_process(finding):
                logger.info("The copy at %s (pid %s) is already gone; nothing to close", copy_dir, pid)
                self.rescan()
                return True
            self._backend.request_close(pid, started)
            begun = self._monotonic()
            while self._same_process(finding) and self._monotonic() - begun < CLOSE_GRACE_SECONDS:
                self._sleep(_CLOSE_POLL_SECONDS)
            if self._same_process(finding):
                logger.warning("Copy at %s did not close in %.0f s; killing its process tree", copy_dir, CLOSE_GRACE_SECONDS)
                self._backend.kill_tree(pid, copy_dir, started)
            logger.info("Closed the running copy from %s (pid %s)", copy_dir, pid)
            self.rescan()
            return not self._same_process(finding)

    def startup_check(self) -> dict:
        """At service start: entries of copies whose folder is gone are removed (backed up); live findings are announced once per set.
        A folder counts as gone only when its parent exists: an unplugged drive or a disconnected share is not a deleted copy."""
        with self._lock:
            cleaned = []
            for finding in self.rescan()["findings"]:
                if (finding["kind"] in AUTO_CLEAN_KINDS and finding["removable"] and finding["dirExists"] is False
                        and self._backend.path_exists(Path(finding["copyDir"]).parent)):
                    try:
                        self._remove_found(finding)
                        cleaned.append(finding["id"])
                    except Exception as exc:
                        logger.error("Could not remove the dead startup entry %s (%s): %s", finding["name"], finding["target"], exc, exc_info=True)
            remaining = self.rescan()["findings"]
            if remaining and self._notify is not None:
                key = hashlib.sha1("|".join(sorted(f["id"] for f in remaining)).encode("utf-8")).hexdigest()[:12]
                self._notify(key, f"Найдены другие копии Sentinel в автозапуске или в работе: {len(remaining)}. Откройте Настройки и уберите лишнее.")
            return {"cleaned": cleaned, "remaining": len(remaining)}


class NullBackend(Backend):
    """Sees nothing and changes nothing: used by test runs of the service, which must never touch the machine they run on."""

    def run_entries(self): return []
    def startup_folder(self): return None
    def startup_links(self): return []
    def scheduled_tasks(self): return []
    def processes(self): return []

    def _refuse(self, *_args):
        raise Refusal("test mode: the system is not touched")

    delete_run_value = set_run_value = export_task = unregister_task = register_task = request_close = kill_tree = _refuse


# --- the installer hint ---------------------------------------------------------------------------------------------

def installed_by_installer(project_dir: Path) -> bool:
    """The Inno Setup uninstaller (unins000.exe) sits next to the exe of an installed copy and of no portable one."""
    return any(Path(project_dir).glob("unins*.exe"))


def downloads_dir() -> Path:
    """The user's Downloads folder, wherever Windows redirected it."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            guid = (ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID("374DE290-123F-4565-9164-39C4925E467B").bytes_le)
            out = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, wintypes.HANDLE(0), ctypes.byref(out)) == 0 and out.value:
                path = out.value
                ctypes.windll.ole32.CoTaskMemFree(out)
                return Path(path)
        except Exception as exc:
            logger.warning("Could not ask Windows for the Downloads folder: %s", exc, exc_info=True)
    return Path.home() / "Downloads"


def installer_hint_visible(project_dir: Path, found_other_copies: bool, dismissed: bool, downloads: Path) -> bool:
    """Hint at the installer when this copy is a portable one that sits in Downloads or has left other copies behind."""
    if dismissed or installed_by_installer(project_dir):
        return False
    inside = norm(downloads) == norm(project_dir) or norm(downloads) + os.sep in norm(project_dir) + os.sep
    return inside or found_other_copies


# --- the real system ----------------------------------------------------------------------------------------------

def _powershell(script: str, env_extra: Optional[dict] = None, timeout: int = 30) -> str:
    """Runs a script; any error, also a non-terminating one, fails the call (`$ErrorActionPreference = 'Stop'`)."""
    done = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                           "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; " + script],
                          capture_output=True, timeout=timeout, creationflags=_NO_WINDOW, env={**os.environ, **(env_extra or {})})
    if done.returncode != 0:
        raise RuntimeError(f"PowerShell exited {done.returncode}: {done.stderr.decode('utf-8', errors='replace').strip()[:400]}")
    return done.stdout.decode("utf-8-sig", errors="replace").strip()


def _json_list(text: str) -> list:
    if not text:
        return []
    data = json.loads(text)
    return data if isinstance(data, list) else [data]


def _task_name(name: str) -> str:
    if not _TASK_NAME_RE.fullmatch(name):
        raise ValueError(f"not one of our task names: {name!r}")
    return name


def _task_path(path: str) -> str:
    if not _TASK_PATH_RE.fullmatch(path or ""):
        raise ValueError(f"not a task folder: {path!r}")
    return path


# The folder arrives in the environment: a script that embedded it would be broken by a curly quote in a user name
_STARTUP_LINKS_SCRIPT = (
    "$sh = New-Object -ComObject WScript.Shell; "
    "Get-ChildItem -LiteralPath $env:SENTINEL_STARTUP_DIR -Filter *.lnk | ForEach-Object { try { $l = $sh.CreateShortcut($_.FullName); "
    "[pscustomobject]@{ path = $_.FullName; target = $l.TargetPath; args = $l.Arguments } } catch { $null } } | ConvertTo-Json -Compress")


class SystemBackend(Backend):
    """Windows implementation. Reads are always safe; writes are limited to HKCU Run values, .lnk files and our task names."""

    def run_entries(self) -> list:
        if sys.platform != "win32":
            return []
        import winreg
        entries = []
        for hive_name, hive in (("HKCU", winreg.HKEY_CURRENT_USER), ("HKLM", winreg.HKEY_LOCAL_MACHINE)):
            for subkey in (RUN_SUBKEY, RUNONCE_SUBKEY):
                try:
                    with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ) as key:
                        index = 0
                        while True:
                            try:
                                name, data, kind = winreg.EnumValue(key, index)
                            except OSError:
                                break
                            index += 1
                            if kind in (winreg.REG_SZ, winreg.REG_EXPAND_SZ) and isinstance(data, str):
                                entries.append((hive_name, subkey, name, data))
                except FileNotFoundError:
                    continue
                except OSError as exc:
                    logger.warning("Could not read %s\\%s: %s", hive_name, subkey, exc, exc_info=True)
        return entries

    @staticmethod
    def _user_run_key(hive: str, subkey: str, access: int):
        import winreg
        if hive != "HKCU" or subkey not in (RUN_SUBKEY, RUNONCE_SUBKEY):
            raise Refusal(f"{hive}\\{subkey} is read-only")
        return winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey, 0, access)

    def delete_run_value(self, hive, subkey, name):
        import winreg
        with self._user_run_key(hive, subkey, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, name)

    def set_run_value(self, hive, subkey, name, data):
        import winreg
        with self._user_run_key(hive, subkey, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, data)

    def startup_folder(self) -> Optional[Path]:
        appdata = os.environ.get("APPDATA")
        return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" if appdata else None

    def startup_links(self) -> list:
        folder = self.startup_folder()
        if sys.platform != "win32" or folder is None or not folder.is_dir():
            return []
        out = _powershell(_STARTUP_LINKS_SCRIPT, env_extra={"SENTINEL_STARTUP_DIR": str(folder)})
        return [(item["path"], f'{item.get("target") or ""} {item.get("args") or ""}'.strip()) for item in _json_list(out)]

    def scheduled_tasks(self) -> list:
        if sys.platform != "win32":
            return []
        out = _powershell(
            f"Get-ScheduledTask | Where-Object {{ $_.TaskName -like '{TASK_PREFIX}*' }} | ForEach-Object {{ $a = $_.Actions | Select-Object -First 1; "
            "[pscustomobject]@{ name = $_.TaskName; path = $_.TaskPath; execute = $a.Execute; arguments = $a.Arguments } } | ConvertTo-Json -Compress")
        return _json_list(out)

    def export_task(self, name, path) -> str:
        return _powershell(f"Export-ScheduledTask -TaskName '{_task_name(name)}' -TaskPath '{_task_path(path)}'")

    def unregister_task(self, name, path):
        _powershell(f"Unregister-ScheduledTask -TaskName '{_task_name(name)}' -TaskPath '{_task_path(path)}' -Confirm:$false")

    def register_task(self, name, path, xml):
        _powershell(f"Register-ScheduledTask -TaskName '{_task_name(name)}' -TaskPath '{_task_path(path)}' -Xml $env:SENTINEL_TASK_XML | Out-Null",
                    env_extra={"SENTINEL_TASK_XML": xml})

    def processes(self) -> list:
        import psutil
        found = []
        for proc in psutil.process_iter(["pid", "name", "exe", "create_time"]):
            try:
                if (proc.info["name"] or "").casefold() == EXE_NAME.casefold() and proc.info["exe"]:
                    found.append((proc.info["pid"], proc.info["exe"], proc.info["create_time"]))
            except psutil.Error as exc:
                logger.debug("Skipped a process while listing copies: %s", exc)
        return found

    @staticmethod
    def _verified_process(psutil, pid, created):
        """The process with this pid, only if it was started at `created`; None when it is gone or the pid went to another process."""
        try:
            proc = psutil.Process(pid)
            return proc if created is not None and abs(proc.create_time() - created) < _START_TOLERANCE else None
        except psutil.NoSuchProcess:
            return None

    @staticmethod
    def _top_windows(pid) -> list:
        """Every top-level window of the process, hidden ones too (a copy in the tray has none visible)."""
        import ctypes
        from ctypes import wintypes
        windows = []
        user32 = ctypes.windll.user32
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def collect(hwnd, _lparam):
            owner = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
            if owner.value == pid:
                windows.append(hwnd)
            return True

        user32.EnumWindows(callback_type(collect), 0)
        return windows

    def request_close(self, pid, created):
        import ctypes
        import psutil
        proc = self._verified_process(psutil, pid, created)
        if proc is None:
            logger.info("Pid %s is not the copy that was found (gone or reused); no close request sent", pid)
            return
        windows = self._top_windows(pid)
        for hwnd in windows:
            ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
        if not windows:
            proc.terminate()

    def kill_tree(self, pid, copy_dir, created):
        """Kills the verified exe and every descendant whose own exe lies inside the copy's folder; a command line mentioning it proves nothing."""
        import psutil
        root = self._verified_process(psutil, pid, created)
        if root is None:
            logger.info("Pid %s is not the copy that was found (gone or reused); nothing killed", pid)
            return
        try:
            family = root.children(recursive=True) + [root]
        except psutil.NoSuchProcess:
            return
        for proc in family:
            try:
                exe = proc.exe()
                if proc.pid == pid or (exe and is_within(exe, copy_dir)):
                    proc.kill()
            except psutil.NoSuchProcess:
                continue
            except psutil.Error as exc:
                logger.error("Could not kill pid %s of the copy at %s: %s", proc.pid, copy_dir, exc, exc_info=True)
