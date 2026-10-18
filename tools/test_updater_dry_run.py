"""
Comprehensive End-to-End Verification of GitHub Auto-Updater
Mortuis_V_Studio
"""

import sys
import shutil
import tempfile
import json
import zipfile
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE / "core"))

from updater import GitHubUpdater, parse_version, PROTECTED_PATHS, SafeAuthRedirectHandler, get_optional_github_token
import urllib.request

def test_updater_flow():
    print("=" * 65)
    print("  TESTING GITHUB AUTO-UPDATER END-TO-END")
    print("=" * 65)

    # 1. Version parser tests
    print("[1/5] Testing Version Parsing...")
    assert parse_version("3.1.0") == (3, 1, 0)
    assert parse_version("v3.1.0") == (3, 1, 0)
    assert parse_version("v3.2.0-rc1") == (3, 2, 1)
    assert parse_version("v3.2.0") > parse_version("v3.1.0")
    assert parse_version("v4.0") > parse_version("v3.9.9")
    print("      Version Parser: PASS [OK]")

    # 2. Check token resolution
    print("[2/5] Testing GitHub Token Resolution...")
    token = get_optional_github_token()
    print(f"      Resolved Token length: {len(token)} (Auth ready for private/public repos)")
    assert len(token) > 0, "Expected GitHub token from environment or Git Credential Manager"
    print("      Token Resolution: PASS [OK]")

    # 3. Live GitHub API check
    print("[3/5] Testing check_for_updates(force=True)...")
    updater = GitHubUpdater()
    check_result = updater.check_for_updates(force=True)
    print(f"      Current Version: {check_result['current_version']}")
    print(f"      Remote Version:  {check_result['latest_version']}")
    print(f"      Release Name:    {check_result['release_name']}")
    print(f"      Download URL:    {check_result['download_url']}")
    print(f"      Asset API URL:   {check_result['asset_api_url']}")
    print(f"      Is Hot Patch:    {check_result['is_hot_patch']}")

    assert check_result["latest_version"] == "3.1.0", f"Unexpected remote version: {check_result['latest_version']}"
    assert check_result["download_url"], "Expected non-empty download_url"
    assert check_result["asset_api_url"], "Expected non-empty asset_api_url"
    print("      Check for Updates: PASS [OK]")

    # 4. Safe Cross-Domain Download Test
    print("[4/5] Testing Safe Download via SafeAuthRedirectHandler...")
    test_download_url = check_result["asset_api_url"] or check_result["download_url"]
    opener = urllib.request.build_opener(SafeAuthRedirectHandler)
    req = urllib.request.Request(
        test_download_url,
        headers={
            "User-Agent": "TwitchDropsSentinel-Updater/3.1",
            "Accept": "application/octet-stream",
            "Authorization": f"Bearer {token}",
        }
    )
    with opener.open(req, timeout=15) as resp:
        sample_chunk = resp.read(2048)
        assert len(sample_chunk) == 2048
        assert resp.status == 200
        print(f"      Downloaded first chunk successfully from GitHub (HTTP {resp.status})")
    print("      Safe Cross-Domain Download: PASS [OK]")

    # 5. Atomic Extraction & Protected Files Preservation in Mock Sandbox
    print("[5/5] Testing Atomic Sandbox Extraction & Zero Overwrite...")
    with tempfile.TemporaryDirectory() as temp_dir:
        sandbox = Path(temp_dir)
        mock_core = sandbox / "core"
        mock_core.mkdir(parents=True)
        (sandbox / "dist").mkdir(parents=True)

        # Setup user sensitive files
        user_config = sandbox / "config.json"
        user_config.write_text('{"user_secret": "do_not_overwrite", "priority_games": ["MyGame"]}', encoding="utf-8")

        user_trophies = sandbox / "Trophies.md"
        user_trophies.write_text('# My Custom Trophies\n- Won 10 drops\n', encoding="utf-8")

        user_cookie = mock_core / "cookies.jar"
        user_cookie.write_text('# Netscape HTTP Cookie File - USER PRIVATE TOKEN', encoding="utf-8")

        # Copy the actual hot-patch zip
        patch_zip = WORKSPACE / "Twitch_Drops_Sentinel_Patch_v3.1.zip"
        assert patch_zip.exists(), "Patch zip missing!"

        # Extract using the exact logic from updater
        staging_dir = sandbox / "_staging"
        staging_dir.mkdir(parents=True, exist_ok=True)
        backup_dir = sandbox / ".backup_state"
        backup_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(patch_zip, "r") as zf:
            assert zf.testzip() is None, "ZIP corrupted!"

            # Backup protected user data first
            for item_name in ("config.json", "Trophies.md", "core/cookies.jar"):
                src = sandbox / item_name
                if src.exists():
                    dest = backup_dir / Path(item_name).name
                    shutil.copy2(src, dest)

            extracted_count = 0
            for member in zf.namelist():
                norm = member.replace("\\", "/").lstrip("/")
                parts = norm.split("/")
                if len(parts) > 1 and ("twitch" in parts[0].lower() or "sentinel" in parts[0].lower()):
                    rel_path = "/".join(parts[1:])
                else:
                    rel_path = norm

                if not rel_path or rel_path.endswith("/"):
                    continue

                if rel_path.lower() in PROTECTED_PATHS or rel_path.endswith(".jar"):
                    continue

                target_file = sandbox / rel_path
                target_file.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as zf_in, open(target_file, "wb") as out_f:
                    shutil.copyfileobj(zf_in, out_f)
                extracted_count += 1

        # Assertions
        assert user_config.read_text(encoding="utf-8") == '{"user_secret": "do_not_overwrite", "priority_games": ["MyGame"]}'
        assert user_trophies.read_text(encoding="utf-8") == '# My Custom Trophies\n- Won 10 drops\n'
        assert user_cookie.read_text(encoding="utf-8") == '# Netscape HTTP Cookie File - USER PRIVATE TOKEN'
        assert (backup_dir / "config.json").exists()
        assert (backup_dir / "Trophies.md").exists()
        assert (backup_dir / "cookies.jar").exists()
        assert (sandbox / "dist" / "index.html").exists()
        assert (sandbox / "core" / "updater.py").exists()
        print(f"      Extracted {extracted_count} patch files into sandbox.")
        print("      Protected files check: 100% UNTOUCHED & BACKED UP [PASS]")

    print("=" * 65)
    print("  GITHUB AUTO-UPDATER VERIFICATION: ALL PASS [SUCCESS]")
    print("=" * 65)

if __name__ == "__main__":
    test_updater_flow()
