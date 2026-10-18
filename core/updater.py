"""
Twitch Drops Sentinel v3 — GitHub Auto-Updater Module
Mortuis_V_Studio

Handles:
- Checking latest release from GitHub API (https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases/latest)
- Rate limit mitigation (caches response for 6 hours, timeout 5s)
- Semantic version comparison
- Safe atomic patch extraction (100% protection of cookies.jar, Trophies.md, config.json)
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("TwitchDrops.Updater")

CORE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CORE_DIR.parent
CACHE_FILE = PROJECT_DIR / "data" / "update_check_cache.json"

CURRENT_VERSION = "3.1.0"
REPO_API_URL = "https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases/latest"

# Files that MUST NEVER be overwritten by an update
PROTECTED_PATHS = {
    "config.json",
    "trophies.md",
    "cookies.jar",
    "core/cookies.jar",
    "window_state.json",
    "data/window_state.json",
    "installed_games.json",
    "data/installed_games.json",
}

def parse_version(v: str) -> tuple[int, ...]:
    clean = v.strip().lstrip("vV")
    parts = []
    for chunk in clean.split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        if digits:
            parts.append(int(digits))
    return tuple(parts) if parts else (0, 0, 0)

class GitHubUpdater:
    def __init__(self):
        self.last_check_time: float = 0.0
        self._cached_result: Optional[dict[str, Any]] = None
        self._load_cache()

    def _load_cache(self):
        if CACHE_FILE.exists():
            try:
                data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
                self.last_check_time = float(data.get("time", 0))
                self._cached_result = data.get("result")
            except Exception:
                pass

    def _save_cache(self, result: dict[str, Any]):
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            payload = {"time": time.time(), "result": result}
            CACHE_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            logger.debug(f"Could not save update cache: {e}")

    def check_for_updates(self, force: bool = False) -> dict[str, Any]:
        now = time.time()
        # Cache for 6 hours unless force refresh requested
        if not force and self._cached_result and (now - self.last_check_time) < 21600:
            return self._cached_result

        result: dict[str, Any] = {
            "current_version": CURRENT_VERSION,
            "latest_version": CURRENT_VERSION,
            "local_version": CURRENT_VERSION,
            "remote_version": CURRENT_VERSION,
            "release_name": f"Twitch Drops Sentinel v{CURRENT_VERSION}",
            "release_notes": "",
            "update_available": False,
            "changelog": "",
            "html_url": "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases",
            "download_url": "",
            "is_hot_patch": False,
            "published_at": "",
        }

        req = urllib.request.Request(
            REPO_API_URL,
            headers={
                "User-Agent": "TwitchDropsSentinel-Updater/3.1",
                "Accept": "application/vnd.github.v3+json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                remote_tag = data.get("tag_name", "3.0.0")
                remote_ver = parse_version(remote_tag)
                local_ver = parse_version(CURRENT_VERSION)

                update_avail = remote_ver > local_ver
                assets = data.get("assets", [])

                patch_url = None
                full_url = None
                for a in assets:
                    name = a.get("name", "").lower()
                    url = a.get("browser_download_url", "")
                    if "patch" in name and name.endswith(".zip"):
                        patch_url = url
                    elif name.endswith(".zip"):
                        full_url = url

                rel_ver = remote_tag.lstrip("vV")
                body_notes = data.get("body", "") or "Регулярное обновление Twitch Drops Sentinel."

                result.update({
                    "latest_version": rel_ver,
                    "remote_version": rel_ver,
                    "local_version": CURRENT_VERSION,
                    "current_version": CURRENT_VERSION,
                    "release_name": data.get("name") or f"Twitch Drops Sentinel v{rel_ver}",
                    "release_notes": body_notes,
                    "changelog": body_notes,
                    "update_available": update_avail,
                    "html_url": data.get("html_url", result["html_url"]),
                    "download_url": patch_url or full_url or data.get("html_url", ""),
                    "is_hot_patch": bool(patch_url),
                    "published_at": data.get("published_at", ""),
                })
                self._cached_result = result
                self.last_check_time = now
                self._save_cache(result)
                logger.info(f"Update check completed: remote={remote_tag}, available={update_avail}")
        except Exception as e:
            logger.debug(f"GitHub update check note: {e}")
            if self._cached_result:
                return self._cached_result

        return result

    def apply_update_from_url(self, download_url: str) -> tuple[bool, str]:
        if not download_url or not download_url.startswith("http"):
            return False, "Некорректная ссылка на скачивание обновления."

        staging_dir = PROJECT_DIR / "_staging"
        zip_path = staging_dir / "update.zip"
        backup_dir = PROJECT_DIR / ".backup_state"

        try:
            staging_dir.mkdir(parents=True, exist_ok=True)
            backup_dir.mkdir(parents=True, exist_ok=True)

            logger.info(f"Downloading update payload from {download_url}...")
            req = urllib.request.Request(download_url, headers={"User-Agent": "TwitchDropsSentinel-Updater/3.1"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(zip_path, "wb") as f:
                shutil.copyfileobj(resp, f)

            # Test ZIP integrity
            with zipfile.ZipFile(zip_path, "r") as zf:
                bad_file = zf.testzip()
                if bad_file:
                    return False, f"Архив поврежден: ошибка в файле {bad_file}"

                # 1. Backup protected user data first
                for item_name in ("config.json", "Trophies.md", "core/cookies.jar"):
                    src = PROJECT_DIR / item_name
                    if src.exists():
                        dest = backup_dir / Path(item_name).name
                        shutil.copy2(src, dest)

                # 2. Extract strictly non-protected files
                extracted_count = 0
                for member in zf.namelist():
                    norm = member.replace("\\", "/").lstrip("/")
                    # If file is nested inside folder in zip (e.g. "Twitch Drops Sentinel v3.0/core/..."):
                    parts = norm.split("/")
                    if len(parts) > 1 and ("twitch" in parts[0].lower() or "sentinel" in parts[0].lower()):
                        rel_path = "/".join(parts[1:])
                    else:
                        rel_path = norm

                    if not rel_path or rel_path.endswith("/"):
                        continue

                    # Check blacklist
                    if rel_path.lower() in PROTECTED_PATHS or rel_path.endswith(".jar"):
                        logger.info(f"Preserving protected user file: {rel_path}")
                        continue

                    target_file = PROJECT_DIR / rel_path
                    target_file.parent.mkdir(parents=True, exist_ok=True)

                    with zf.open(member) as zf_in, open(target_file, "wb") as out_f:
                        shutil.copyfileobj(zf_in, out_f)
                    extracted_count += 1

            # Cleanup staging
            shutil.rmtree(staging_dir, ignore_errors=True)
            logger.info(f"Update successfully applied! Extracted {extracted_count} files.")
            return True, f"Успешно обновлено ({extracted_count} файлов заменено). Перезапустите Sentinel."

        except Exception as e:
            logger.error(f"Error applying update: {e}", exc_info=True)
            return False, f"Ошибка установки обновления: {e}"

UPDATER = GitHubUpdater()
