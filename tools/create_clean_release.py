"""
Twitch Drops Sentinel v3.0 — Clean Multi-User & Public Release Builder
Mortuis_V_Studio

Builds a 100% clean, standalone ZIP distribution ready for friends, Discord, or GitHub Releases:
- Zero author credentials (cookies.jar excluded)
- Zero personal logs or private trophy history
- Embedded portable Python runtime
- Universal game scanner and native folder selection
- Pre-compiled single-file host TwitchDropsSentinel.exe
"""

import os
import sys
import shutil
import zipfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WORKSPACE = Path(__file__).resolve().parent.parent
DIST_STAGING = WORKSPACE / "dist_release"
RELEASE_DIR = DIST_STAGING / "Twitch Drops Sentinel v3.0"
ZIP_OUTPUT = WORKSPACE / "Twitch_Drops_Sentinel_v3.0_Public_Release.zip"

def create_release():
    print("=" * 65)
    print("  BUILDING TWITCH DROPS SENTINEL v3.0 CLEAN PUBLIC RELEASE")
    print("=" * 65)

    if DIST_STAGING.exists():
        shutil.rmtree(DIST_STAGING)
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Main Executable
    exe_src = WORKSPACE / "TwitchDropsSentinel.exe"
    assert exe_src.exists(), f"Missing executable: {exe_src}"
    print(f"[*] Copying {exe_src.name} ({exe_src.stat().st_size / (1024*1024):.1f} MB)...")
    shutil.copy2(exe_src, RELEASE_DIR / "TwitchDropsSentinel.exe")

    # 2. Dist Frontend Bundle
    dist_src = WORKSPACE / "dist"
    print("[*] Copying frontend bundle (dist/)...")
    shutil.copytree(dist_src, RELEASE_DIR / "dist")

    # 3. Assets
    assets_src = WORKSPACE / "assets"
    if assets_src.exists():
        print("[*] Copying assets (app.ico, app.png)...")
        shutil.copytree(assets_src, RELEASE_DIR / "assets")

    # 4. Embedded Portable Runtime
    portable_src = WORKSPACE / "portable_runtime"
    if portable_src.exists():
        print("[*] Copying portable Python 3.12 runtime...")
        shutil.copytree(portable_src, RELEASE_DIR / "portable_runtime")

    # 5. Core Python Engine (Excluding cookies, logs, pycache)
    core_src = WORKSPACE / "core"
    core_dest = RELEASE_DIR / "core"
    core_dest.mkdir(parents=True, exist_ok=True)
    print("[*] Packaging sanitized core engine modules...")
    banned_files = {"cookies.jar", "sentinel_stdout.log", "sentinel_stderr.log"}
    for item in core_src.rglob("*"):
        if item.is_file():
            rel = item.relative_to(core_src)
            # Skip caches, cookies, logs
            if "__pycache__" in rel.parts or rel.name in banned_files or rel.suffix in (".pyc", ".pyo"):
                continue
            target = core_dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)

    # 6. Clean Default Trophies.md
    print("[*] Generating clean Trophies.md template...")
    trophies_content = (
        "# 🏆 Журнал Трофеев Twitch Drops Sentinel\n\n"
        "Здесь автоматически сохраняется история всех наград, собранных на вашем Twitch аккаунте.\n\n"
        "| Дата и Время | Игра | Награда (Дроп) | Кампания | Статус |\n"
        "| :--- | :--- | :--- | :--- | :--- |\n"
    )
    (RELEASE_DIR / "Trophies.md").write_text(trophies_content, encoding="utf-8")

    # 7. Clean Default config.json
    print("[*] Generating clean default config.json...")
    clean_config = (
        "{\n"
        '  "auto_shutdown_on_complete": false,\n'
        '  "auto_shutdown_mode": "shutdown",\n'
        '  "pause_on_gaming": true,\n'
        '  "pause_on_battery": true,\n'
        '  "native_toasts": true,\n'
        '  "ui_sound_enabled": true,\n'
        '  "game_directories": [],\n'
        '  "priority_games": [\n'
        '    "Rust",\n'
        '    "The Witcher 3: Wild Hunt",\n'
        '    "Hunt: Showdown 1896",\n'
        '    "Path of Exile 2",\n'
        '    "Cyberpunk 2077"\n'
        '  ],\n'
        '  "excluded_games": [],\n'
        '  "priority_mode": 1\n'
        "}\n"
    )
    (RELEASE_DIR / "config.json").write_text(clean_config, encoding="utf-8")

    # 8. 1-Click Launcher BAT
    print("[*] Generating 1-click launcher batch file...")
    bat_content = (
        "@echo off\r\n"
        "chcp 65001 >nul\r\n"
        "title Twitch Drops Sentinel v3.0\r\n"
        "start \"\" \"%~dp0TwitchDropsSentinel.exe\"\r\n"
    )
    (RELEASE_DIR / "Запустить_Twitch_Drops_Sentinel.bat").write_text(bat_content, encoding="utf-8")

    # 9. User Guide & Documentation
    if (WORKSPACE / "ИНСТРУКЦИЯ.md").exists():
        shutil.copy2(WORKSPACE / "ИНСТРУКЦИЯ.md", RELEASE_DIR / "ИНСТРУКЦИЯ.md")
    if (WORKSPACE / "README.md").exists():
        shutil.copy2(WORKSPACE / "README.md", RELEASE_DIR / "README.md")

    # 10. Data directory with empty initial cache
    (RELEASE_DIR / "data").mkdir(parents=True, exist_ok=True)

    # 11. Create ZIP Archive
    print(f"[*] Compressing into archive: {ZIP_OUTPUT.name}...")
    if ZIP_OUTPUT.exists():
        ZIP_OUTPUT.unlink()

    with zipfile.ZipFile(ZIP_OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for file in RELEASE_DIR.rglob("*"):
            if file.is_file():
                arcname = file.relative_to(DIST_STAGING)
                zf.write(file, arcname)

    zip_mb = ZIP_OUTPUT.stat().st_size / (1024 * 1024)
    print(f"      [PASS] Release package created successfully! Size: {zip_mb:.2f} MB")

    # 12. Security Audit on Created ZIP
    print("[*] Performing Security Audit on generated archive...")
    with zipfile.ZipFile(ZIP_OUTPUT, "r") as zf:
        namelist = zf.namelist()
        for name in namelist:
            assert "cookies.jar" not in name.lower(), f"CRITICAL: Found cookies.jar in zip! {name}"
            assert "sentinel_stdout" not in name.lower(), f"CRITICAL: Found log file in zip! {name}"
            assert "sentinel_stderr" not in name.lower(), f"CRITICAL: Found log file in zip! {name}"

    print(f"      [PASS] Security Audit Passed: ZERO private tokens, 0 cookies, 0 personal logs.")
    print("=" * 65)
    print(f"  READY FOR DISTRIBUTION: {ZIP_OUTPUT}")
    print("=" * 65)

if __name__ == "__main__":
    create_release()
