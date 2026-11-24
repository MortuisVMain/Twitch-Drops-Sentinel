"""
Hell Harvest — GitHub auto-updater
Mortuis_V_Studio

Handles:
- Checking latest release from GitHub API (https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases/latest)
- Rate limit mitigation (15 min cache, 15 min pause after a failure, honours GitHub's rate limit reset, timeout 8s)
- Semantic version comparison
- Safe atomic patch extraction (100% protection of cookies.jar, Trophies.md, config.json)
"""

from __future__ import annotations

import hashlib
import http.client
import json
import logging
import os
import re
import shutil
import sys
import time
import threading
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("TwitchDrops.Updater")

CORE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CORE_DIR.parent
CACHE_FILE = PROJECT_DIR / "data" / "update_check_cache.json"
# The files an update replaced, kept until the next update, so "Roll back" can put the previous version back
ROLLBACK_DIR = PROJECT_DIR / "data" / "rollback"
ROLLBACK_MANIFEST = ROLLBACK_DIR / "manifest.json"
# A version rolled back from is not offered again; a newer one is
SKIP_FILE = PROJECT_DIR / "data" / "update_skip.json"

from version import __version__ as CURRENT_VERSION
REPO_API_URL = "https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases/latest"
# the beta channel reads the newest releases, pre-releases included (/releases/latest never returns a pre-release)
REPO_RELEASES_URL = "https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases?per_page=20"
UPDATE_CHANNELS = ("stable", "beta")
UPDATE_CACHE_SECONDS = 900
# A newer release without its ZIP yet (the release workflow uploads it minutes after the tag) is asked about again this soon
ASSETS_PENDING_RECHECK_SECONDS = 120
# A caller waits this long for the check already in flight (its own request is capped at 8s plus the token lookup)
CHECK_WAIT_SECONDS = 30.0

# Files that MUST NEVER be overwritten by an update
PROTECTED_PATHS = {
    "config.json",
    "trophies.md",
    "cookies.jar",
    "core/cookies.jar",
    "core/settings.json",
    "window_state.json",
    "data/window_state.json",
    "installed_games.json",
    "data/installed_games.json",
    "ignored_games.json",
    "data/ignored_games.json",
}

TRUSTED_RELEASE_REPO = "MortuisVMain/Twitch-Drops-Sentinel"  # current repo: API and page URLs are built from it
TRUSTED_RELEASE_REPOS = (TRUSTED_RELEASE_REPO, "MortuisVMain/Hell-Harvest")  # the second one is ready for a future rename
PROTECTED_FOLDERS = ("data/", "giveaways_engine/data/")
PROTECTED_SUFFIXES = (".jar", ".log")


def is_trusted_release_url(url: Any) -> bool:
    """Only release assets of this repository: the parsed address decides, a substring proves nothing."""
    if not isinstance(url, str) or "\\" in url or any(ch.isspace() or ord(ch) < 32 for ch in url):
        return False
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme.lower() != "https" or parsed.username or parsed.password or port not in (None, 443):
        return False
    host = (parsed.hostname or "").lower()
    if "%" in parsed.path or "?" in url or "#" in url or "/../" in parsed.path or parsed.path.endswith("/.."):
        return False  # an encoded dot is a dot, and a release asset address has no query or fragment
    if host == "github.com":
        return any(parsed.path.startswith(f"/{repo}/releases/download/") for repo in TRUSTED_RELEASE_REPOS)
    if host == "api.github.com":
        return any(parsed.path.startswith(f"/repos/{repo}/releases/assets/") for repo in TRUSTED_RELEASE_REPOS)
    return False


RELEASES_PAGE_URL = f"https://github.com/{TRUSTED_RELEASE_REPO}/releases/latest"
_SHA256_RE = re.compile(r"[0-9a-fA-F]{64}")
_REPOS_PATTERN = "(?:" + "|".join(re.escape(repo) for repo in TRUSTED_RELEASE_REPOS) + ")"
_ASSET_API_PATH_RE = re.compile(rf"/repos/{_REPOS_PATTERN}/releases/assets/[0-9]+")
_ASSET_DOWNLOAD_PATH_RE = re.compile(rf"/{_REPOS_PATTERN}/releases/download/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)")
DIGEST_UNAVAILABLE_MESSAGE = ("Не удалось получить контрольную сумму обновления от GitHub, поэтому установка отменена, файлы не изменены. "
                              f"Скачайте обновление вручную: {RELEASES_PAGE_URL}")
DIGEST_MISMATCH_MESSAGE = ("Контрольная сумма скачанного архива не совпадает с опубликованной на GitHub, поэтому установка отменена, файлы не изменены. "
                           f"Скачайте обновление вручную: {RELEASES_PAGE_URL}")


def parse_sha256_digest(value: Any) -> Optional[str]:
    """The hex of a GitHub asset digest ('sha256:<64 hex>'); anything else, including another algorithm, is None."""
    if not isinstance(value, str) or not value.startswith(("sha256:", "SHA256:")):
        return None
    hex_part = value[len("sha256:"):]
    return hex_part.lower() if _SHA256_RE.fullmatch(hex_part) else None


def _is_protected(rel_path: str) -> bool:
    lowered = rel_path.casefold()
    return (lowered in PROTECTED_PATHS or lowered.endswith(PROTECTED_SUFFIXES)
            or lowered.startswith(PROTECTED_FOLDERS))


def archive_member_target(root: Path, member: str) -> Optional[Path]:
    """Where an archive member may be written, or None. The path is normalized first: ./config.json is config.json."""
    text = member.replace("\\", "/")
    if ":" in text or "\0" in text or text.startswith("//"):
        return None  # a drive, an NTFS stream or a network share
    parts: list[str] = []
    for raw_part in text.split("/"):
        part = raw_part.rstrip(" .") if raw_part not in (".", "..") else raw_part  # Windows drops these from a name
        if part in ("", "."):
            continue
        if part == "..":
            if not parts:
                return None
            parts.pop()
        else:
            parts.append(part)
    if text.endswith("/") or not parts:
        return None
    # The whole release may sit in one folder, e.g. "Hell Harvest v3.0/core/..."
    if len(parts) > 1 and any(word in parts[0].lower() for word in ("twitch", "sentinel", "hell harvest")):
        parts = parts[1:]
    if _is_protected("/".join(parts)):
        return None
    resolved_root = root.resolve()
    target = resolved_root.joinpath(*parts).resolve()
    if not target.is_relative_to(resolved_root):
        return None
    # Links and short 8.3 names only show after resolving
    if _is_protected(target.relative_to(resolved_root).as_posix()):
        return None
    return target


def parse_version(v: str) -> tuple[int, ...]:
    clean = v.strip().lstrip("vV")
    parts = []
    for chunk in clean.split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        if digits:
            parts.append(int(digits))
    return tuple(parts) if parts else (0, 0, 0)

def version_key(v: str) -> tuple:
    """Sort key where a pre-release comes before its release: 3.9.0-beta.2 < 3.9.0 < 3.9.1.
    parse_version alone would read 3.9.0-beta.2 as 3.9.0.2, newer than 3.9.0."""
    clean = str(v).strip().lstrip("vV")
    base, _, suffix = clean.partition("-")
    numbers = parse_version(base)
    numbers = numbers + (0,) * max(0, 3 - len(numbers))
    if not suffix:
        return (numbers, 1, ())
    return (numbers, 0, parse_version(suffix) if any(ch.isdigit() for ch in suffix) else ())


def pick_release(releases: Any, include_prerelease: bool) -> Optional[dict]:
    """The newest published release from a GitHub /releases list; drafts are never picked, pre-releases only
    when asked. None when nothing fits."""
    best = None
    for rel in releases if isinstance(releases, list) else []:
        if not isinstance(rel, dict) or rel.get("draft") or not rel.get("tag_name"):
            continue
        if rel.get("prerelease") and not include_prerelease:
            continue
        if best is None or version_key(rel["tag_name"]) > version_key(best["tag_name"]):
            best = rel
    return best


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
    except Exception as exc:
        logger.debug("Failed reading github_token from config: %s", exc)

    # Check Git Credential Manager
    try:
        import subprocess
        proc = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True,
            text=True,
            timeout=3,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if line.startswith("password="):
                    val = line.split("=", 1)[1].strip()
                    if val:
                        return val
    except Exception as exc:
        logger.debug("Git credential manager check failed: %s", exc)

    return ""

def check_and_apply_pending_exe_update() -> bool:
    """
    Checks for TwitchDropsSentinel.update and swaps it to TwitchDropsSentinel.exe.
    On Windows NTFS, a running executable cannot be overwritten directly, but can be renamed.
    """
    update_file = PROJECT_DIR / "TwitchDropsSentinel.update"
    target_exe = PROJECT_DIR / "TwitchDropsSentinel.exe"
    if not update_file.exists():
        return False
    try:
        old_exe = PROJECT_DIR / "TwitchDropsSentinel.exe.old"
        if old_exe.exists():
            try:
                old_exe.unlink(missing_ok=True)
            except Exception as exc:
                logger.debug("Failed unlinking old_exe: %s", exc)
        if target_exe.exists():
            try:
                target_exe.rename(old_exe)
            except Exception as e:
                logger.warning(f"Could not rotate running exe to .old: {e}")
        update_file.rename(target_exe)
        logger.info("Successfully applied pending executable update: TwitchDropsSentinel.update -> TwitchDropsSentinel.exe")
        return True
    except Exception as e:
        logger.warning(f"Could not swap TwitchDropsSentinel.update to .exe: {e}")
        return False

class RollbackRecorder:
    """Saves each file an update is about to replace (once) and notes the files it adds. The manifest is written
    only when the update finished, so a half-applied update never offers a rollback that would mix versions."""

    def __init__(self, root: Path, rollback_dir: Path) -> None:
        self.root, self.dir = root, rollback_dir
        self.saved: list[str] = []
        self.added: list[str] = []
        shutil.rmtree(rollback_dir, ignore_errors=True)
        (rollback_dir / "files").mkdir(parents=True, exist_ok=True)

    def before_write(self, target: Path) -> None:
        rel = target.resolve().relative_to(self.root.resolve()).as_posix()
        if target.name == "TwitchDropsSentinel.update":  # swapped in for the exe right after extraction
            self.before_write(target.with_name("TwitchDropsSentinel.exe"))
        if rel in self.saved or rel in self.added:
            return
        if target.is_file():
            dest = self.dir / "files" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, dest)
            self.saved.append(rel)
        else:
            self.added.append(rel)

    def finish(self, from_version: str, to_version: str) -> None:
        manifest = {"from_version": from_version, "to_version": to_version, "created": time.time(),
                    "saved": self.saved, "added": self.added}
        (self.dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def rollback_info(manifest_path: Optional[Path] = None) -> Optional[dict]:
    """{"from_version", "to_version", "created"} of the update that can be rolled back, or None."""
    manifest_path = manifest_path or ROLLBACK_MANIFEST
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return {"from_version": str(data["from_version"]), "to_version": str(data["to_version"]), "created": float(data["created"])}
    except FileNotFoundError:
        return None
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Rollback manifest %s is unreadable: %s", manifest_path, exc)
        return None


def _put_back(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.suffix.lower() == ".exe" and target.exists():  # a running exe can be renamed, not overwritten
        old = target.with_suffix(".exe.old")
        old.unlink(missing_ok=True)
        target.rename(old)
    temp = target.with_name(target.name + ".rollback.tmp")
    shutil.copy2(source, temp)
    os.replace(temp, target)


def apply_rollback(root: Optional[Path] = None, rollback_dir: Optional[Path] = None, skip_file: Optional[Path] = None) -> tuple[bool, str]:
    """Puts the files of the previous version back and removes the ones the update added. The version rolled back
    from is remembered so it is not offered again. The app must restart."""
    root, rollback_dir, skip_file = root or PROJECT_DIR, rollback_dir or ROLLBACK_DIR, skip_file or SKIP_FILE
    manifest_path = rollback_dir / "manifest.json"
    info = rollback_info(manifest_path)
    if info is None:
        return False, "Откатывать нечего: последнее обновление не сохранило прошлую версию."
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    root_resolved = root.resolve()
    try:
        for rel in data.get("saved", []):
            target = (root / rel).resolve()
            if root_resolved not in target.parents:
                raise ValueError(f"path outside the app: {rel}")
            _put_back(rollback_dir / "files" / rel, target)
        for rel in data.get("added", []):
            target = (root / rel).resolve()
            if root_resolved not in target.parents or _is_protected(rel):
                continue
            target.unlink(missing_ok=True)
    except Exception as exc:
        logger.error("Rollback to v%s failed; the rollback copy is kept for another try: %s", info["from_version"], exc, exc_info=True)
        return False, f"Откат не удался: {exc}"
    skip_file.parent.mkdir(parents=True, exist_ok=True)
    skip_file.write_text(json.dumps({"skip": info["to_version"]}), encoding="utf-8")
    shutil.rmtree(rollback_dir, ignore_errors=True)
    logger.info("Rolled back from v%s to v%s", info["to_version"], info["from_version"])
    return True, f"Возвращена версия {info['from_version']}. Перезапустите Hell Harvest."


def skipped_version(skip_file: Optional[Path] = None) -> str:
    skip_file = skip_file or SKIP_FILE
    try:
        return str(json.loads(skip_file.read_text(encoding="utf-8")).get("skip", ""))
    except FileNotFoundError:
        return ""
    except (OSError, ValueError, AttributeError) as exc:
        logger.warning("Update skip file %s is unreadable: %s", skip_file, exc)
        return ""


class SafeAuthRedirectHandler(urllib.request.HTTPRedirectHandler):
    """
    Prevents leaking or conflicting Authorization headers when redirected
    across domains (e.g. GitHub API -> AWS S3 / objects.githubusercontent.com).
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme.lower() != "https":
            raise urllib.error.HTTPError(newurl, code, "Redirect away from https refused", headers, fp)
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is not None:
            orig_host = (urlsplit(req.full_url).hostname or "").lower()
            new_host = (urlsplit(newurl).hostname or "").lower()
            if orig_host != new_host and "Authorization" in new_req.headers:
                del new_req.headers["Authorization"]
        return new_req


PART_SIZE = 4 * 1024 * 1024
DOWNLOAD_WORKERS = 8
REQUEST_TIMEOUT = 20
MAX_STALLS = 8
RETRY_BACKOFF = 0.5
PROBE_ATTEMPTS = 4
_NETWORK_ERRORS = (OSError, http.client.HTTPException)


def headers_for_host(headers: dict[str, str], origin_url: str, url: str) -> dict[str, str]:
    """Authorization only travels to the host it was meant for, never to a CDN the release redirects to."""
    if (urlsplit(origin_url).hostname or "").lower() == (urlsplit(url).hostname or "").lower():
        return dict(headers)
    return {k: v for k, v in headers.items() if k.lower() != "authorization"}


class _RangeSource:
    """Opens byte ranges of one download; remembers the resolved (signed, short-lived) CDN address."""

    def __init__(self, url: str, headers: dict[str, str], opener) -> None:
        self.origin_url, self.headers, self.opener = url, headers, opener
        self.url = url
        self._lock = threading.Lock()

    def open(self, start: Optional[int] = None, end: Optional[int] = None):
        """Plain GET when start is None, else the byte range start..end (open-ended when end is None)."""
        url = self.url
        headers = headers_for_host(self.headers, self.origin_url, url)
        if start is not None:
            headers["Range"] = f"bytes={start}-" if end is None else f"bytes={start}-{end}"
        return self.opener.open(urllib.request.Request(url, headers=headers), timeout=REQUEST_TIMEOUT)

    def probe(self) -> Optional[int]:
        """Total size when the server honours Range (206 + Content-Range), else None; pins the final address."""
        self.url = self.origin_url
        with self.open(0, 0) as resp:
            final_url = resp.geturl()
            match = re.fullmatch(r"bytes 0-0/(\d+)", resp.headers.get("Content-Range") or "")
            if resp.status != 206 or not match:
                return None
            self.url = final_url
            return int(match.group(1))

    def refresh(self, stale_url: str) -> None:
        """Re-resolve the CDN address once after it expired; parallel callers share one result."""
        with self._lock:
            if self.url == stale_url:
                logger.info("Download address expired, resolving again from %s", self.origin_url)
                try:
                    self.probe()
                except _NETWORK_ERRORS as exc:
                    # The part retries anyway; a failed re-resolve must not skip its retry budget
                    logger.warning("Could not resolve %s again: %s", self.origin_url, exc)


def _backoff(stalls: int, what: str, exc: Exception) -> None:
    if stalls >= MAX_STALLS:
        raise exc
    logger.warning("%s interrupted (%s), retry %d/%d", what, exc, stalls, MAX_STALLS)
    time.sleep(min(RETRY_BACKOFF * stalls, 3))


def _fetch_part(source: _RangeSource, path: Path, start: int, end: int, progress, abort: threading.Event) -> None:
    """Fill path[start..end]; after a drop continue from the bytes already written."""
    pos, stalls = start, 0
    while pos <= end:
        if abort.is_set():
            return
        url = source.url
        try:
            with source.open(pos, end) as resp:
                if resp.status != 206:
                    raise OSError(f"server answered {resp.status} to a Range request")
                with open(path, "r+b") as f:
                    f.seek(pos)
                    while pos <= end and not abort.is_set():
                        chunk = resp.read(min(64 * 1024, end - pos + 1))
                        if not chunk:
                            raise ConnectionError("connection closed before the part was complete")
                        f.write(chunk)
                        pos += len(chunk)
                        stalls = 0
                        progress(len(chunk))
        except _NETWORK_ERRORS as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 403, 410):
                source.refresh(url)
            stalls += 1
            _backoff(stalls, f"Part {start}-{end}", exc)


def _download_parallel(source: _RangeSource, path: Path, total: int, progress, part_size: int, workers: int) -> None:
    with open(path, "wb") as f:
        f.truncate(total)
    abort = threading.Event()
    parts = [(s, min(s + part_size, total) - 1) for s in range(0, total, part_size)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_fetch_part, source, path, s, e, progress, abort) for s, e in parts]
        try:
            for fut in futures:
                fut.result()
        except BaseException:
            abort.set()
            raise


def _download_stream(source: _RangeSource, path: Path, progress) -> None:
    """One connection; after a drop resume with Range, or start over when the server answers 200."""
    got, total, stalls = 0, 0, 0
    with open(path, "wb") as f:
        while True:
            try:
                with source.open(got if got else None) as resp:
                    if got and resp.status != 206:
                        progress(total, -got)
                        got = 0
                        f.seek(0)
                        f.truncate()
                    total = total or int(resp.headers.get("Content-Length") or 0)
                    while True:
                        chunk = resp.read(64 * 1024)
                        if not chunk:
                            return
                        f.write(chunk)
                        got += len(chunk)
                        stalls = 0
                        progress(total, len(chunk))
            except _NETWORK_ERRORS as exc:
                stalls += 1
                _backoff(stalls, "Download", exc)


def download_file(url: str, headers: dict[str, str], path: Path, opener, progress,
                  part_size: int = PART_SIZE, workers: int = DOWNLOAD_WORKERS) -> None:
    """Download url to path. progress(total_bytes, delta_bytes) may be called from several threads."""
    source = _RangeSource(url, headers, opener)
    total = None
    for attempt in range(1, PROBE_ATTEMPTS + 1):
        try:
            total = source.probe()
            break
        except _NETWORK_ERRORS as exc:
            # A slow link often drops the first TLS handshake; one bad probe must not cost the parallel download
            logger.warning("Range probe %d/%d failed for %s: %s", attempt, PROBE_ATTEMPTS, url, exc)
            if attempt < PROBE_ATTEMPTS:
                time.sleep(RETRY_BACKOFF * attempt)
    if not total:
        logger.info("Downloading %s in a single stream", url)
    if total:
        _download_parallel(source, path, total, lambda d: progress(total, d), part_size, workers)
    else:
        _download_stream(source, path, progress)


def get_live_local_version() -> str:
    try:
        v_file = CORE_DIR / "version.py"
        if v_file.exists():
            text = v_file.read_text(encoding="utf-8")
            match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', text)
            if match:
                return match.group(1)
    except Exception as exc:
        logger.debug("Failed reading version.py: %s", exc)
    return CURRENT_VERSION

def rate_limit_wait(exc: Exception, now: float) -> float:
    """Seconds GitHub asked to wait before the next request; 0 when the error is not a rate limit."""
    if not isinstance(exc, urllib.error.HTTPError) or exc.code not in (403, 429):
        return 0.0
    try:
        retry_after = exc.headers.get("Retry-After")
        if retry_after:
            return float(retry_after)
        if exc.headers.get("X-RateLimit-Remaining") == "0":
            return float(exc.headers["X-RateLimit-Reset"]) - now
    except (KeyError, TypeError, ValueError) as parse_err:
        logger.warning("Unreadable GitHub rate limit headers: %s", parse_err)
    return 0.0

class DownloadStatus:
    """Thread-safe progress sink that mirrors a running download into the updater status dict."""

    def __init__(self, lock: threading.Lock, status: dict) -> None:
        self._lock, self._status = lock, status
        self._downloaded = 0
        self._last_time = self._last_bytes = 0.0

    def __call__(self, total: int, delta: int) -> None:
        now = time.time()
        with self._lock:
            self._downloaded += delta
            if self._last_time == 0.0:
                self._last_time = now
            if total and not self._status["total_bytes"]:
                self._status["total_bytes"] = total
                self._status["total_mb"] = round(total / (1024 * 1024), 2)
            dt = now - self._last_time
            if dt < 0.35:
                return
            speed = (self._downloaded - self._last_bytes) / dt / (1024 * 1024)
            dl_mb = round(self._downloaded / (1024 * 1024), 2)
            self._status.update({
                "stage": "downloading",
                "percent": min(int(self._downloaded / total * 100), 95) if total > 0 else 50,
                "downloaded_bytes": self._downloaded,
                "downloaded_mb": dl_mb,
                "total_mb": self._status["total_mb"] or dl_mb,
                "speed_mbps": round(speed, 2),
            })
            self._last_time, self._last_bytes = now, self._downloaded

    def finish(self) -> None:
        with self._lock:
            dl_mb = round(self._downloaded / (1024 * 1024), 2)
            self._status.update({
                "downloaded_bytes": self._downloaded,
                "downloaded_mb": dl_mb,
                "total_mb": self._status["total_mb"] or dl_mb,
            })


class GitHubUpdater:
    def __init__(self):
        self.last_check_time: float = 0.0
        self._retry_not_before: float = 0.0
        self._rate_limited_until: float = 0.0  # unlike _retry_not_before, a forced check respects it too
        self._last_error: str = ""
        self._cached_result: Optional[dict[str, Any]] = None
        self._is_updating: bool = False
        self.channel: str = "stable"  # set from config.json "update_channel"
        self._lock = threading.Lock()  # guards the fields above and the status; never held during a request
        self._check_lock = threading.Lock()  # one request to GitHub at a time
        self._attempts: int = 0  # finished requests, so a caller that waited can tell its answer arrived
        self._last_attempt: dict[str, Any] = {}
        self._status: dict[str, Any] = {
            "is_updating": False,
            "stage": "idle",
            "percent": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "downloaded_mb": 0.0,
            "total_mb": 0.0,
            "speed_mbps": 0.0,
            "error_message": "",
        }
        self._load_cache()

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._status)

    def _load_cache(self):
        if CACHE_FILE.exists():
            try:
                data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
                result = data.get("result")
                # An answer from before an update still names the old version and offers the update just installed
                if isinstance(result, dict) and result.get("local_version") != get_live_local_version():
                    return
                # a release that was still building its ZIP is asked about again at once
                self.last_check_time = 0.0 if isinstance(result, dict) and result.get("assets_pending") else float(data.get("time", 0))
                self._cached_result = result
            except Exception as exc:
                logger.debug("Failed loading update cache: %s", exc)

    def _save_cache(self, result: dict[str, Any]):
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            payload = {"time": time.time(), "result": result}
            CACHE_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            logger.debug(f"Could not save update cache: {e}")

    def set_channel(self, channel: Any) -> None:
        """'stable' or 'beta'; anything else is stable. A change drops the cached answer of the other channel."""
        channel = channel if channel in UPDATE_CHANNELS else "stable"
        with self._lock:
            if channel == self.channel:
                return
            self.channel = channel
            self._cached_result = None
            self.last_check_time = 0.0
            self._retry_not_before = 0.0
        logger.info("Update channel: %s", channel)

    def forget_cached_check(self) -> None:
        """After a rollback the cached answer names the wrong local version."""
        with self._lock:
            self._cached_result = None
            self.last_check_time = 0.0
        CACHE_FILE.unlink(missing_ok=True)

    def check_for_updates(self, force: bool = False) -> dict[str, Any]:
        """Callers arriving while a request is in flight wait for its answer instead of sending their own."""
        now = time.time()
        # Cache for 15 minutes unless force refresh requested
        with self._lock:
            if self._cached_result and self._cached_result.get("channel", "stable") != self.channel:
                self._cached_result = None  # an answer saved for the other channel
            if not force and self._cached_result and (now - self.last_check_time) < UPDATE_CACHE_SECONDS:
                return self._cached_result
            attempts_seen = self._attempts

        if not self._check_lock.acquire(timeout=CHECK_WAIT_SECONDS):
            logger.warning("Update check skipped: the previous request is still running after %.0fs", CHECK_WAIT_SECONDS)
            with self._lock:
                return {**(self._cached_result or self._baseline_result(get_live_local_version())),
                        "error": "TimeoutError: the previous update check is still running"}
        try:
            with self._lock:
                if self._attempts != attempts_seen:
                    return dict(self._last_attempt)
            return self._request_latest_release(force)
        finally:
            self._check_lock.release()

    @staticmethod
    def _baseline_result(live_current: str) -> dict[str, Any]:
        return {
            "current_version": live_current,
            "latest_version": live_current,
            "local_version": live_current,
            "remote_version": live_current,
            "release_name": f"Hell Harvest v{live_current}",
            "release_notes": "",
            "update_available": False,
            "changelog": "",
            "html_url": "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases",
            "download_url": "",
            "asset_api_url": "",
            "is_hot_patch": False,
            "published_at": "",
        }

    def _request_latest_release(self, force: bool) -> dict[str, Any]:
        """Only called with _check_lock held."""
        now = time.time()
        live_current = get_live_local_version()
        result = self._baseline_result(live_current)

        with self._lock:
            # A forced check skips the pause after an ordinary failure, never the one GitHub asked for
            if now < self._rate_limited_until or (not force and now < self._retry_not_before):
                return {**(self._cached_result or result), "error": self._last_error}

        token = get_optional_github_token()
        headers = {
            "User-Agent": "TwitchDropsSentinel-Updater/3.1",
            "Accept": "application/vnd.github.v3+json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        with self._lock:
            channel = self.channel
        beta = channel == "beta"
        result["channel"] = channel
        req = urllib.request.Request(REPO_RELEASES_URL if beta else REPO_API_URL, headers=headers)
        opener = urllib.request.build_opener(SafeAuthRedirectHandler)

        try:
            with opener.open(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if beta:
                    data = pick_release(data, include_prerelease=True)
                    if data is None:
                        raise ValueError("GitHub returned no published release")
                remote_tag = data["tag_name"]
                remote_ver = version_key(remote_tag)
                local_ver = version_key(live_current)

                skipped = skipped_version()
                update_avail = remote_ver > local_ver and not (skipped and version_key(skipped) == remote_ver)
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

                # Without a ZIP the Install button has nothing to install: offer the release once its package is there
                assets_pending = update_avail and not (patch_url or full_url)
                update_avail = update_avail and not assets_pending
                if assets_pending:
                    logger.info("Release %s has no ZIP yet (still building); asking again in %ds", remote_tag, ASSETS_PENDING_RECHECK_SECONDS)

                rel_ver = remote_tag.lstrip("vV")
                body_notes = data.get("body", "") or "Регулярное обновление Hell Harvest."

                chosen_download = patch_url or full_url or data.get("html_url", "")
                chosen_api_asset = patch_api_url or full_api_url or ""

                result.update({
                    "latest_version": rel_ver,
                    "remote_version": rel_ver,
                    "local_version": live_current,
                    "current_version": live_current,
                    "release_name": data.get("name") or f"Hell Harvest v{rel_ver}",
                    "release_notes": body_notes,
                    "changelog": body_notes,
                    "update_available": update_avail,
                    "assets_pending": assets_pending,
                    "html_url": data.get("html_url", result["html_url"]),
                    "download_url": chosen_download,
                    "asset_api_url": chosen_api_asset,
                    "is_hot_patch": bool(patch_url),
                    "published_at": data.get("published_at", ""),
                    "prerelease": bool(data.get("prerelease")),
                })
                with self._lock:
                    self._cached_result = result
                    self.last_check_time = now - UPDATE_CACHE_SECONDS + ASSETS_PENDING_RECHECK_SECONDS if assets_pending else now
                    self._retry_not_before = 0.0
                    self._rate_limited_until = 0.0
                    self._last_error = ""
                    self._attempts += 1
                    self._last_attempt = result
                self._save_cache(result)
                logger.info(f"Update check completed: remote={remote_tag}, available={update_avail}")
        except Exception as e:
            wait = rate_limit_wait(e, now)
            with self._lock:
                self._last_error = f"{type(e).__name__}: {e}"
                self._retry_not_before = now + max(UPDATE_CACHE_SECONDS, wait)
                self._rate_limited_until = now + wait if wait > 0 else 0.0
                failed = {**(self._cached_result or result), "error": self._last_error}
                self._attempts += 1
                self._last_attempt = failed
            logger.warning("Update check failed: %s", failed["error"])
            return failed

        return result

    def apply_update_from_url(self, download_url: str, asset_api_url: Optional[str] = None) -> tuple[bool, str]:
        """Installs a release asset of this repository; any other address is refused before a request is made.
        The archive must also match the SHA-256 GitHub publishes for that very asset, or nothing is installed."""
        urls = [download_url] + ([asset_api_url] if asset_api_url and asset_api_url != download_url else [])
        untrusted = [u for u in urls if not is_trusted_release_url(u)]
        if untrusted:
            logger.warning(f"Update refused, not a release of {TRUSTED_RELEASE_REPOS}: {untrusted}")
            return False, "Некорректная ссылка на скачивание обновления."
        token = get_optional_github_token()
        opener = urllib.request.build_opener(SafeAuthRedirectHandler)
        expected: dict[str, str] = {}
        for url in urls:
            digest = self._resolve_expected_sha256(url, token, opener)
            if digest is None:
                logger.error("Update refused: no usable SHA-256 published for %s", url)
                return False, DIGEST_UNAVAILABLE_MESSAGE
            expected[url] = digest
        return self._install_update(urls, expected)

    @staticmethod
    def _resolve_expected_sha256(url: str, token: str, opener) -> Optional[str]:
        """The SHA-256 GitHub publishes for exactly this asset of the trusted repository, or None for any doubt."""
        parts = urlsplit(url)
        if (parts.hostname or "").lower() == "api.github.com" and _ASSET_API_PATH_RE.fullmatch(parts.path):
            metadata_url, tag, name = url, None, None
        else:
            match = _ASSET_DOWNLOAD_PATH_RE.fullmatch(parts.path) if (parts.hostname or "").lower() == "github.com" else None
            if not match:
                return None
            tag, name = match.groups()
            metadata_url = f"https://api.github.com/repos/{TRUSTED_RELEASE_REPO}/releases/tags/{tag}"
        headers = {"User-Agent": "TwitchDropsSentinel-Updater/3.1", "Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            with opener.open(urllib.request.Request(metadata_url, headers=headers), timeout=8) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            logger.warning("Could not read the release metadata %s: %s", metadata_url, exc, exc_info=True)
            return None
        if not isinstance(payload, dict):
            return None
        if tag is None:
            record = payload if payload.get("url") == url else None
        else:
            assets = payload.get("assets")
            records = [a for a in assets if isinstance(a, dict) and a.get("browser_download_url") == url and a.get("name") == name] \
                if payload.get("tag_name") == tag and isinstance(assets, list) else []
            record = records[0] if len(records) == 1 else None
        return parse_sha256_digest(record.get("digest")) if record else None

    def _install_update(self, urls_to_try: list[str], expected_sha256: dict[str, str]) -> tuple[bool, str]:
        """expected_sha256 maps every address to the digest its archive must have; the archive is opened only if it matches."""
        if self._is_updating:
            return False, "Обновление уже загружается и устанавливается."
        self._is_updating = True
        with self._lock:
            self._status.update({
            "is_updating": True,
            "stage": "downloading",
            "percent": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "downloaded_mb": 0.0,
            "total_mb": 0.0,
            "speed_mbps": 0.0,
            "error_message": "",
        })

        staging_dir = PROJECT_DIR / "_staging"
        zip_path = staging_dir / "update.zip"
        backup_dir = PROJECT_DIR / ".backup_state"

        token = get_optional_github_token()
        opener = urllib.request.build_opener(SafeAuthRedirectHandler)

        try:
            staging_dir.mkdir(parents=True, exist_ok=True)

            download_success = False
            last_err = None

            for try_url in urls_to_try:
                try:
                    logger.info(f"Downloading update payload from {try_url}...")
                    req_headers = {"User-Agent": "TwitchDropsSentinel-Updater/3.1"}
                    if (urlsplit(try_url).hostname or "").lower() == "api.github.com":
                        req_headers["Accept"] = "application/octet-stream"
                    if token and is_trusted_release_url(try_url):
                        req_headers["Authorization"] = f"Bearer {token}"

                    expected = expected_sha256.get(try_url)
                    if not expected:
                        raise ValueError(f"no expected SHA-256 for {try_url}")
                    status_progress = DownloadStatus(self._lock, self._status)
                    download_file(try_url, req_headers, zip_path, opener, status_progress)
                    status_progress.finish()
                    archive_hash = hashlib.sha256()
                    with open(zip_path, "rb") as f:
                        for block in iter(lambda: f.read(1024 * 1024), b""):
                            archive_hash.update(block)

                    if archive_hash.hexdigest() != expected:
                        # Not a network error: the other address would carry the same asset, so do not try it
                        logger.error("Update SHA-256 mismatch for %s: expected %s, got %s", try_url, expected, archive_hash.hexdigest())
                        shutil.rmtree(staging_dir, ignore_errors=True)
                        with self._lock:
                            self._status.update({"stage": "error", "error_message": DIGEST_MISMATCH_MESSAGE})
                        return False, DIGEST_MISMATCH_MESSAGE
                    download_success = True
                    break
                except Exception as e:
                    last_err = e
                    logger.warning(f"Download attempt failed for {try_url}: {e}")

            if not download_success:
                shutil.rmtree(staging_dir, ignore_errors=True)
                return False, f"Не удалось загрузить архив обновления: {last_err}"

            with self._lock:
                self._status.update({
                    "stage": "extracting",
                    "percent": 96,
                    "speed_mbps": 0.0,
                })
            # Test ZIP integrity
            with zipfile.ZipFile(zip_path, "r") as zf:
                bad_file = zf.testzip()
                if bad_file:
                    return False, f"Архив поврежден: ошибка в файле {bad_file}"

                recorder = RollbackRecorder(PROJECT_DIR, ROLLBACK_DIR)
                from_version = get_live_local_version()

                # 1. Backup protected user data first
                backup_dir.mkdir(parents=True, exist_ok=True)
                for item_name in ("config.json", "Trophies.md", "core/cookies.jar"):
                    src = PROJECT_DIR / item_name
                    if src.exists():
                        dest = backup_dir / Path(item_name).name
                        shutil.copy2(src, dest)

                # 2. Extract strictly non-protected files
                extracted_count = 0
                for member in zf.namelist():
                    target_file = archive_member_target(PROJECT_DIR, member)
                    if target_file is None:
                        if not member.endswith(("/", "\\")):
                            logger.info(f"Preserving protected path, not extracting: {member}")
                        continue
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    recorder.before_write(target_file)

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

            # Immediately attempt to swap pending TwitchDropsSentinel.update to TwitchDropsSentinel.exe
            check_and_apply_pending_exe_update()
            recorder.finish(from_version, get_live_local_version())

            # Invalidate update cache so subsequent checks immediately see new version
            with self._lock:
                self._cached_result = None
                self.last_check_time = 0.0
            if CACHE_FILE.exists():
                try:
                    CACHE_FILE.unlink(missing_ok=True)
                except Exception as exc:
                    logger.debug("Failed unlinking CACHE_FILE: %s", exc)
            logger.info(f"Update successfully applied! Extracted {extracted_count} files.")
            with self._lock:
                self._status.update({
                    "stage": "done",
                    "percent": 100,
                    "is_updating": False,
                    "error_message": "",
                })
            return True, f"Успешно обновлено ({extracted_count} файлов заменено). Перезапустите Hell Harvest."

        except Exception as e:
            logger.error(f"Error applying update: {e}", exc_info=True)
            with self._lock:
                self._status.update({
                    "stage": "error",
                    "is_updating": False,
                    "error_message": str(e),
                })
            return False, f"Ошибка установки обновления: {e}"
        finally:
            self._is_updating = False
            with self._lock:
                self._status["is_updating"] = False

UPDATER = GitHubUpdater()
