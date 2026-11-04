"""All-or-nothing saving of settings: the files on disk and the dict in memory change together or not at all."""

from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Callable, Dict, Optional, Sequence


def _restore(path: Path, content: Optional[bytes]) -> None:
    if content is None:
        path.unlink(missing_ok=True)
        return
    tmp = path.with_name(path.name + ".restore.tmp")
    tmp.write_bytes(content)
    os.replace(tmp, path)


def save_transaction(files: Sequence[Path], writers: Sequence[Callable[[], None]]) -> None:
    """Runs the writers in order; if one fails, every file is put back as it was (or removed if it did not exist) and the error is raised."""
    before: Dict[Path, Optional[bytes]] = {p: (p.read_bytes() if p.exists() else None) for p in files}
    try:
        for write in writers:
            write()
    except Exception:
        for path, content in before.items():
            try:
                _restore(path, content)
            except OSError:
                pass  # the original error is the one the caller needs; a failed restore must not hide it
        raise


def apply_change(settings: dict, mutate: Callable[[dict], None], save: Callable[[], None]) -> None:
    """Changes the settings and saves; if either fails, the same dict object goes back to its old content and the error is raised."""
    previous = copy.deepcopy(settings)
    try:
        mutate(settings)
        save()
    except Exception:
        settings.clear()
        settings.update(previous)
        raise
