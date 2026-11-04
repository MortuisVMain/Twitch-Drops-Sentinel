"""What a profile backup holds, under paths relative to the install so that same-named files stay apart."""

from __future__ import annotations

import json
import os
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
