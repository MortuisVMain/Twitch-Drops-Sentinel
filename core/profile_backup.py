"""What a profile backup holds, under paths relative to the install so that same-named files stay apart."""

from __future__ import annotations

import json
import os
import shutil
import zipfile
from pathlib import Path
from typing import List, NamedTuple


class Entry(NamedTuple):
    path: Path
    arcname: str
    required: bool


def profile_entries(project_dir: Path, engine_settings: Path, cookies: Path) -> List[Entry]:
    def entry(path: Path, required: bool = False) -> Entry:
        return Entry(path, path.resolve().relative_to(project_dir.resolve()).as_posix(), required)

    return [
        entry(project_dir / "config.json", required=True),
        entry(engine_settings),
        entry(cookies),
        entry(project_dir / "cookies.jar"),
        entry(project_dir / "data" / "settings.json"),
        entry(project_dir / "data" / "installed_games.json"),
        entry(project_dir / "data" / "ignored_games.json"),
        entry(project_dir / "data" / "dimmer_state.json"),
        entry(project_dir / "Trophies.md"),
    ]


def write_backup(zip_path: Path, entries: List[Entry]) -> List[str]:
    """Writes what exists and returns the required files it could not find. A failed write leaves no partial archive."""
    present = {e.arcname: e for e in entries if e.path.is_file()}
    temp_path = zip_path.with_name(zip_path.name + ".tmp")
    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for arcname, e in present.items():
                zf.write(e.path, arcname=arcname)
            zf.writestr("manifest.json", json.dumps({"format": 1, "files": [{"path": a} for a in present]}, indent=2))
        os.replace(temp_path, zip_path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise
    return [e.arcname for e in entries if e.required and e.arcname not in present]


# --- restore -------------------------------------------------------------------------------------------------------
# A restore is staged while the app runs and applied at the next start, before anything loads: the running service
# and the Twitch engine save settings and cookies on shutdown, which would overwrite files restored in place.

MAX_MEMBER_BYTES = 50 * 1024 * 1024
PENDING_MARKER = "restore.json"


class BackupError(ValueError):
    """The archive is not a usable profile backup; the message is shown to the user."""


def read_backup(zip_path: Path, entries: List[Entry]) -> dict:
    """arcname -> bytes for the known profile files in the archive. Anything else in it is ignored, so a crafted
    archive can only ever write the files a backup itself writes."""
    known = {e.arcname for e in entries}
    try:
        with zipfile.ZipFile(zip_path) as zf:
            try:
                manifest = json.loads(zf.read("manifest.json"))
            except KeyError:
                raise BackupError("в архиве нет manifest.json: это не бэкап Sentinel") from None
            except ValueError as exc:
                raise BackupError(f"manifest.json повреждён: {exc}") from exc
            if not isinstance(manifest, dict) or manifest.get("format") != 1:
                raise BackupError("неизвестный формат бэкапа")
            files = {}
            for info in zf.infolist():
                if info.filename not in known:
                    continue
                if info.file_size > MAX_MEMBER_BYTES:
                    raise BackupError(f"{info.filename} больше {MAX_MEMBER_BYTES // (1024 * 1024)} МБ")
                files[info.filename] = zf.read(info)
    except zipfile.BadZipFile as exc:
        raise BackupError(f"файл не является ZIP-архивом: {exc}") from exc
    missing = [e.arcname for e in entries if e.required and e.arcname not in files]
    if missing:
        raise BackupError(f"в архиве нет обязательных файлов: {', '.join(missing)}")
    try:
        config = json.loads(files["config.json"].decode("utf-8"))
    except (KeyError, ValueError) as exc:
        raise BackupError(f"config.json в архиве повреждён: {exc}") from exc
    if not isinstance(config, dict):
        raise BackupError("config.json в архиве не является объектом настроек")
    return files


def stage_restore(zip_path: Path, entries: List[Entry], pending_dir: Path) -> List[str]:
    """Checks the archive and puts its files into pending_dir. The marker is written last, so a stage cut short is
    never applied. Returns the staged file names."""
    files = read_backup(zip_path, entries)
    if pending_dir.exists():
        shutil.rmtree(pending_dir)
    for arcname, data in files.items():
        target = pending_dir / arcname
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    names = sorted(files)
    (pending_dir / PENDING_MARKER).write_text(json.dumps({"files": names}, indent=2), encoding="utf-8")
    return names


def apply_pending_restore(project_dir: Path, entries: List[Entry], pending_dir: Path) -> List[str]:
    """At start: moves a complete staged restore into place and removes the stage. A stage without its marker was cut
    short and is dropped. Returns the restored file names (empty when there was nothing to apply)."""
    if not pending_dir.exists():
        return []
    marker = pending_dir / PENDING_MARKER
    if not marker.is_file():
        shutil.rmtree(pending_dir)
        return []
    known = {e.arcname: e.path for e in entries}
    names = [n for n in json.loads(marker.read_text(encoding="utf-8")).get("files", []) if n in known]
    restored = []
    for name in names:
        source = pending_dir / name
        if not source.is_file():
            continue
        target = known[name]
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_name(target.name + ".restore.tmp")
        shutil.copyfile(source, temp)
        os.replace(temp, target)
        restored.append(name)
    shutil.rmtree(pending_dir)
    return restored
