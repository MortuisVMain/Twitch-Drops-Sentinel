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
RELEASE_TITLE = f"Twitch Drops Sentinel v{__version__} — Telemetry Purge, Autonomous Giveaways & ScreenDimmer Apple Luna Integration"
RELEASE_NOTES = f"""## 🛡️ Twitch Drops Sentinel v{__version__}

### ⚡ Что нового в v{__version__}:
- **Очистка от путающей телеметрии (Zero Noise):** Убраны все технические метрики («0.8 GB сэкономлено», «CPU 12%», «0% GPU», «Spade Stealth», «0% нагрузки на GPU»). На Дашборде теперь лаконичный живой статус «● Фарм активен».
- **Полная автономность Раздач Игр (Giveaways Hub Self-Containment):** Движок `giveaways_engine/` (~550 КБ) встроен прямо в корень дистрибутива. Приложение больше не зависит от путей разработчика и работает автономно на любых ПК друзей и пользователей.
- **Устранение CORS-ошибок (Zero Failed to Fetch):** В `core/sentinel_service.py` обработчик CORS защищен перехватом исключений, гарантируя доставку заголовков CORS даже при HTTP-ошибках.
- **Единая Студия Настроек & Двусторонняя синхронизация Mute:** Устранены дублирующие нижние карточки в Настройках. Управление режимом сна/выключения интегрировано прямо в карточку модуля. Кнопка звука (Mute) в Topbar синхронизирована с сервером.
- **Полнофункциональный ScreenDimmer (Apple Luna 2.0):** Новая вкладка «Затемнение» в сайдбаре:
  - Мастер-слайдер яркости и тактильные пресеты (100%, 75%, 50%, 25%, 10%, 🌑 Blackout).
  - Аппаратные оверлеи Win32 на чистом C# без мерцания и утечек памяти.
  - Таймеры автоматического сна экрана (15 мин, 30 мин, 1 час, 2 часа).
- **Вкладка «Удаленные» & Синхронизация раздач Twitch:** Удаленные игры попадают в отдельную вкладку «🗑️ Удаленные» с восстановлением в 1 клик. Кнопка «+ В ТОП» надежно заблокирована для удаленных и исключенных игр.

### 📦 Файлы релиза:
1. `Twitch_Drops_Sentinel_v{__version__}_Public_Release.zip` (~60 MB) — Полная автономная версия со встроенным portable Python 3.12 и автономным Giveaways Engine для чистой установки в 1 клик.
2. `Twitch_Drops_Sentinel_Patch_v{__version__}.zip` (~35 MB) — Полный хот-патч для встроенного Auto-Updater прямо из интерфейса.

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
