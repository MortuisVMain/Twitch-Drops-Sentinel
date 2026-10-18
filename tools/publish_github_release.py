"""
Twitch Drops Sentinel v3.1 — GitHub Release Publisher & Asset Uploader
Mortuis_V_Studio
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WORKSPACE = Path(__file__).resolve().parent.parent
FULL_ZIP = WORKSPACE / "Twitch_Drops_Sentinel_v3.1_Public_Release.zip"
PATCH_ZIP = WORKSPACE / "Twitch_Drops_Sentinel_Patch_v3.1.zip"

TAG_NAME = "v3.1.0"
RELEASE_TITLE = "Twitch Drops Sentinel v3.1.0 — Public Release & Auto-Updater"
RELEASE_NOTES = """## 🛡️ Twitch Drops Sentinel v3.1.0

### ⚡ Что нового:
- **GitHub Auto-Updater:** Встроенный модуль 1-клик проверки и установки обновлений без потери сессий (`cookies.jar`, `Trophies.md`, `config.json` защищены железным блэклистом).
- **2-колоночный Bento Grid:** Просторная компоновка дашборда на 2 колонки вместо 3, оптимизированная под Apple Luna 2.0.
- **Zero-Mock Telemetry:** Полная ликвидация фейковых данных — в дашборде и topbar отображаются только 100% измеренные метрики (сэкономленный трафик в GB, CPU%, аптайм, реальные клеймы).
- **Чистый мульти-пользовательский дистрибутив:** Новые пользователи получают чистую систему с автосканером Steam/Epic/GOG и возможностью добавления своих папок с играми.
- **Управление звуками:** Мгновенный Mute тактильных звуков интерфейса в Topbar и SettingsStudio с сохранением состояния.

### 📦 Файлы релиза:
1. `Twitch_Drops_Sentinel_v3.1_Public_Release.zip` (~61 MB) — Полная автономная версия со встроенным portable Python 3.12 для новых пользователей.
2. `Twitch_Drops_Sentinel_Patch_v3.1.zip` (~1.4 MB) — Легковесный хот-патч для встроенного Auto-Updater.

*Crafted with precision by Mortuis_V_Studio (2026).*
"""

def get_token() -> str:
    # 1. Check environment variables
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    if token:
        return token.strip()
    
    # 2. Check Git Credential Manager
    try:
        import subprocess
        proc = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True,
            text=True,
            timeout=10
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if line.startswith("password="):
                    val = line.split("=", 1)[1].strip()
                    if val:
                        return val
    except Exception as e:
        print(f"[*] Note: git credential fill error: {e}")

    raise ValueError("No GITHUB_TOKEN or GH_TOKEN found in environment or Git Credential Manager!")

def make_request(url: str, method: str = "GET", data: bytes = None, headers: dict = None) -> dict:
    req_headers = {
        "User-Agent": "Sentinel-Release-Publisher/3.1",
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {get_token()}",
    }
    if headers:
        req_headers.update(headers)
    
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            content = resp.read()
            if not content:
                return {}
            return json.loads(content.decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} on {url}: {err_msg}")

def main():
    print("=" * 65)
    print(f"  PUBLISHING GITHUB RELEASE: {TAG_NAME}")
    print("=" * 65)
    
    token = get_token()
    print(f"[*] GitHub token detected (length: {len(token)})")
    
    assert FULL_ZIP.exists(), f"Missing {FULL_ZIP}"
    assert PATCH_ZIP.exists(), f"Missing {PATCH_ZIP}"
    
    # 1. Check if release exists for this tag
    repo_url = "https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel"
    release_data = None
    try:
        print(f"[*] Checking existing release for tag {TAG_NAME}...")
        release_data = make_request(f"{repo_url}/releases/tags/{TAG_NAME}")
        print(f"      Found existing release id: {release_data.get('id')}")
    except RuntimeError as e:
        if "404" in str(e):
            print(f"[*] No existing release found for {TAG_NAME}. Creating new release...")
        else:
            raise

    # 2. Create release if not found
    if not release_data:
        payload = {
            "tag_name": TAG_NAME,
            "target_commitish": "main",
            "name": RELEASE_TITLE,
            "body": RELEASE_NOTES,
            "draft": False,
            "prerelease": False,
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        release_data = make_request(
            f"{repo_url}/releases",
            method="POST",
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )
        print(f"      [PASS] Created release id: {release_data.get('id')} ({release_data.get('html_url')})")
    else:
        # Update release notes & title
        rel_id = release_data["id"]
        payload = {
            "name": RELEASE_TITLE,
            "body": RELEASE_NOTES,
            "draft": False,
            "prerelease": False,
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        release_data = make_request(
            f"{repo_url}/releases/{rel_id}",
            method="PATCH",
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )
        print(f"      [PASS] Updated release id: {rel_id}")

    release_id = release_data["id"]
    existing_assets = {a["name"]: a["id"] for a in release_data.get("assets", [])}

    # 3. Upload assets
    assets_to_upload = [
        (FULL_ZIP, "Twitch_Drops_Sentinel_v3.1_Public_Release.zip"),
        (PATCH_ZIP, "Twitch_Drops_Sentinel_Patch_v3.1.zip"),
    ]

    for file_path, asset_name in assets_to_upload:
        if asset_name in existing_assets:
            old_asset_id = existing_assets[asset_name]
            print(f"[*] Deleting existing asset '{asset_name}' (id: {old_asset_id})...")
            make_request(f"{repo_url}/releases/assets/{old_asset_id}", method="DELETE")
            time.sleep(1)

        file_bytes = file_path.read_bytes()
        file_mb = len(file_bytes) / (1024 * 1024)
        print(f"[*] Uploading '{asset_name}' ({file_mb:.2f} MB)...")
        upload_url = f"https://uploads.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases/{release_id}/assets?name={asset_name}"
        
        uploaded = make_request(
            upload_url,
            method="POST",
            data=file_bytes,
            headers={
                "Content-Type": "application/zip",
                "Content-Length": str(len(file_bytes)),
            }
        )
        print(f"      [PASS] Uploaded '{asset_name}': id={uploaded.get('id')}, download={uploaded.get('browser_download_url')}")

    print("=" * 65)
    print("  GITHUB RELEASE PUBLISHED SUCCESSFULLY!")
    print(f"  URL: {release_data.get('html_url')}")
    print("=" * 65)

if __name__ == "__main__":
    main()
