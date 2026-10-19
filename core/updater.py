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
import re
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

from version import __version__ as CURRENT_VERSION
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
    "ignored_games.json",
    "data/ignored_games.json",
}

def parse_version(v: str) -> tuple[int, ...]:
    clean = v.strip().lstrip("vV")
    parts = []
    for chunk in clean.split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        if digits:
            parts.append(int(digits))
    return tuple(parts) if parts else (0, 0, 0)

def get_optional_github_token() -> str:
    """Safely retrieves GitHub token if available (env, config, or git credential manager)."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    if token:
        return token.strip()

    # Check config.json
    try:
        config_path = PROJECT_DIR / "config.json"
        if config_path.exists():
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
            tok = str(cfg.get("github_token", "")).strip()
            if tok:
                return tok
    except Exception:
        pass

    # Check Git Credential Manager
    try:
        import subprocess
        proc = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True,
            text=True,
            timeout=3,
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if line.startswith("password="):
                    val = line.split("=", 1)[1].strip()
                    if val:
                        return val
    except Exception:
        pass

    return ""

class SafeAuthRedirectHandler(urllib.request.HTTPRedirectHandler):
    """
    Prevents leaking or conflicting Authorization headers when redirected
    across domains (e.g. GitHub API -> AWS S3 / objects.githubusercontent.com).
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is not None:
            from urllib.parse import urlparse
            orig_host = urlparse(req.full_url).netloc
            new_host = urlparse(newurl).netloc
            if orig_host != new_host and "Authorization" in new_req.headers:
                del new_req.headers["Authorization"]
        return new_req

def get_live_local_version() -> str:
    try:
        v_file = CORE_DIR / "version.py"
        if v_file.exists():
            text = v_file.read_text(encoding="utf-8")
            match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', text)
            if match:
                return match.group(1)
    except Exception:
        pass
    return CURRENT_VERSION

class GitHubUpdater:
    def __init__(self):
        self.last_check_time: float = 0.0
        self._cached_result: Optional[dict[str, Any]] = None
        self._is_updating: bool = False
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

        live_current = get_live_local_version()
        result: dict[str, Any] = {
            "current_version": live_current,
            "latest_version": live_current,
            "local_version": live_current,
            "remote_version": live_current,
            "release_name": f"Twitch Drops Sentinel v{live_current}",
            "release_notes": "",
            "update_available": False,
            "changelog": "",
            "html_url": "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases",
            "download_url": "",
            "asset_api_url": "",
            "is_hot_patch": False,
            "published_at": "",
        }

        token = get_optional_github_token()
        headers = {
            "User-Agent": "TwitchDropsSentinel-Updater/3.1",
            "Accept": "application/vnd.github.v3+json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(REPO_API_URL, headers=headers)
        opener = urllib.request.build_opener(SafeAuthRedirectHandler)

        try:
            with opener.open(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                remote_tag = data.get("tag_name", "3.0.0")
                remote_ver = parse_version(remote_tag)
                local_ver = parse_version(live_current)

                update_avail = remote_ver > local_ver
                assets = data.get("assets", [])

                patch_url = None
                patch_api_url = None
                full_url = None
                full_api_url = None
                for a in assets:
                    name = a.get("name", "").lower()
                    url = a.get("browser_download_url", "")
                    api_url = a.get("url", "")
                    if "patch" in name and name.endswith(".zip"):
                        patch_url = url
                        patch_api_url = api_url
                    elif name.endswith(".zip"):
                        full_url = url
                        full_api_url = api_url

                rel_ver = remote_tag.lstrip("vV")
                body_notes = data.get("body", "") or "Регулярное обновление Twitch Drops Sentinel."

                chosen_download = patch_url or full_url or data.get("html_url", "")
                chosen_api_asset = patch_api_url or full_api_url or ""

                result.update({
                    "latest_version": rel_ver,
                    "remote_version": rel_ver,
                    "local_version": live_current,
                    "current_version": live_current,
                    "release_name": data.get("name") or f"Twitch Drops Sentinel v{rel_ver}",
                    "release_notes": body_notes,
                    "changelog": body_notes,
                    "update_available": update_avail,
                    "html_url": data.get("html_url", result["html_url"]),
                    "download_url": chosen_download,
                    "asset_api_url": chosen_api_asset,
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

    def apply_update_from_url(self, download_url: str, asset_api_url: Optional[str] = None) -> tuple[bool, str]:
        if not download_url or not download_url.startswith("http"):
            return False, "Некорректная ссылка на скачивание обновления."

        if self._is_updating:
            return False, "Обновление уже загружается и устанавливается."
        self._is_updating = True

        staging_dir = PROJECT_DIR / "_staging"
        zip_path = staging_dir / "update.zip"
        backup_dir = PROJECT_DIR / ".backup_state"

        token = get_optional_github_token()
        opener = urllib.request.build_opener(SafeAuthRedirectHandler)

        urls_to_try = [download_url]
        if asset_api_url and asset_api_url != download_url and asset_api_url.startswith("http"):
            urls_to_try.append(asset_api_url)

        try:
            staging_dir.mkdir(parents=True, exist_ok=True)
            backup_dir.mkdir(parents=True, exist_ok=True)

            download_success = False
            last_err = None

            for try_url in urls_to_try:
                try:
                    logger.info(f"Downloading update payload from {try_url}...")
                    req_headers = {"User-Agent": "TwitchDropsSentinel-Updater/3.1"}
                    if "api.github.com" in try_url:
                        req_headers["Accept"] = "application/octet-stream"
                        if token:
                            req_headers["Authorization"] = f"Bearer {token}"
                    elif token:
                        req_headers["Authorization"] = f"Bearer {token}"

                    req = urllib.request.Request(try_url, headers=req_headers)
                    with opener.open(req, timeout=45) as resp, open(zip_path, "wb") as f:
                        shutil.copyfileobj(resp, f)

                    download_success = True
                    break
                except Exception as e:
                    last_err = e
                    logger.warning(f"Download attempt failed for {try_url}: {e}")

            if not download_success:
                return False, f"Не удалось загрузить архив обновления: {last_err}"

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

                    # If target file is an existing .exe, rotate it first to avoid PermissionError on Windows!
                    if target_file.exists() and target_file.suffix.lower() == ".exe":
                        old_file = target_file.with_suffix(".exe.old")
                        try:
                            if old_file.exists():
                                old_file.unlink(missing_ok=True)
                            target_file.rename(old_file)
                        except Exception as e:
                            logger.warning(f"Could not rotate {target_file.name}: {e}")

                    with zf.open(member) as zf_in, open(target_file, "wb") as out_f:
                        shutil.copyfileobj(zf_in, out_f)
                    extracted_count += 1

            # Cleanup staging
            shutil.rmtree(staging_dir, ignore_errors=True)
            # Invalidate update cache so subsequent checks immediately see new version
            self._cached_result = None
            self.last_check_time = 0.0
            if CACHE_FILE.exists():
                try:
                    CACHE_FILE.unlink(missing_ok=True)
                except Exception:
                    pass
            logger.info(f"Update successfully applied! Extracted {extracted_count} files.")
            return True, f"Успешно обновлено ({extracted_count} файлов заменено). Перезапустите Sentinel."

        except Exception as e:
            logger.error(f"Error applying update: {e}", exc_info=True)
            return False, f"Ошибка установки обновления: {e}"
        finally:
            self._is_updating = False

UPDATER = GitHubUpdater()
