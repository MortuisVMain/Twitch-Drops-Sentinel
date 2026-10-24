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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
from version import __version__

WORKSPACE = Path(__file__).resolve().parent.parent
FULL_ZIP = WORKSPACE / f"Twitch_Drops_Sentinel_v{__version__}_Public_Release.zip"
PATCH_ZIP = WORKSPACE / f"Twitch_Drops_Sentinel_Patch_v{__version__}.zip"

TAG_NAME = f"v{__version__}"
RELEASE_TITLE = f"Twitch Drops Sentinel v{__version__} — Free Games Syndicate & Architecture Hardening"
RELEASE_NOTES = f"""## 🛡️ Twitch Drops Sentinel v{__version__}

### ⚡ Что нового в v{__version__}:
- **Интеграция Синдиката Раздач (Free Games Syndicate):**
  - Полный автоматический сбор бесплатных раздач с 5 платформ: **Epic Games Store**, **GOG**, **Steam (100% Free-to-keep)**, **Fab / Unreal Engine Assets**, **Unity Asset Store**.
  - Интегрированный стелс-раннер на базе Patchright Chromium с единым защищенным локальным профилем сессий.
  - Удобный вход в 1 клик (`🔑 Войти в аккаунт`) прямо из карточки магазина с живым статусом подключения (`● Онлайн` / `⚠ Требуется вход`).
  - Умный префлайт: мгновенная проверка раздач на GOG и Steam за <500 мс без запуска тяжелого браузера при отсутствии раздач.
- **Глубокая очистка кодовой базы и устранение коллизий стейта (Karpathy 200->50):**
  - Ликвидирована коллизия флага `native_toasts` и удалена паразитная дублирующая Карточка №4 в Настройках (-83 строки).
  - Устранена рассинхронизация и дублирование состояния при переключении звука интерфейса.
  - Вычищены маркетинговые полосы с главного экрана, освободив 140px полезной высоты дашборда.
  - Удален мертвый апстрим-код из Giveaways Engine (`migrate.js`, `version.js`, неиспользуемые конфигурации).
  - Сведены к единому эталону в `core/utils.py` четыре независимые реализации сопоставления названий игр (`smart_game_match`).
  - Оптимизированы фоновые циклы `Hardware Guard` (устранено пересоздание функций внутри `while self.is_running:`).
- **Надежность и верификация:**
  - Все **36 верификационных гейтов** в `test_sentinel_suite.py` успешно пройдены с чистым Exit Code 0.

### 📦 Файлы релиза:
1. `Twitch_Drops_Sentinel_v{__version__}_Public_Release.zip` — Полная автономная версия со встроенным portable Python 3.12, Chromium и всеми модулями для установки в 1 клик.
2. `Twitch_Drops_Sentinel_Patch_v{__version__}.zip` — Хот-патч для встроенного Auto-Updater прямо из интерфейса программы.

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
        (FULL_ZIP, f"Twitch_Drops_Sentinel_v{__version__}_Public_Release.zip"),
        (PATCH_ZIP, f"Twitch_Drops_Sentinel_Patch_v{__version__}.zip"),
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
