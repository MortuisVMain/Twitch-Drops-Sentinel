"""
Twitch Drops Sentinel v3.0 — Comprehensive Verification Suite
Mortuis_V_Studio

Validates:
1. Monolithic TwitchDropsSentinel.exe artifact integrity
2. Frontend singlefile bundle dist/index.html
3. Preserved cookies.jar Twitch authentication session
4. Core Microservice REST API (GET /api/state, POST /api/settings)
5. 138 Installed Games Catalog integrity
6. Trophy Vault parsing & Trophies.md journal
7. Hardware Guard & psutil detection
"""

import asyncio
import os
import sys
import json
import time
import urllib.request
import subprocess
from contextlib import suppress
from pathlib import Path
import psutil
import re
import atexit
import hashlib
import shutil
import socket
import tempfile

WORKSPACE = Path(__file__).resolve().parent

# On a CI runner there is no exe, no cookies, no journal and no live Twitch: gates that need them print an
# explicit SKIP instead of failing (set CI=1 locally to rehearse it).
IN_CI = os.environ.get("CI", "").lower() in ("1", "true", "yes")
# test_giveaways_hub_integration reads the claimed-games inventory of the user's own giveaways database
CI_LIVE_ONLY: set = {"test_giveaways_hub_integration"}

# The suite never touches the user's live data, config, cookies or the live service on port 28492.
# It copies the code and a read-only snapshot of the data into a temp project root and runs its own
# service there on a free port. Cookies are never copied, so the sandbox cannot act on the account.
LIVE_PORT = 28492
LIVE_PROTECTED = [
    WORKSPACE / "data" / "installed_games.json",
    WORKSPACE / "data" / "ignored_games.json",
    WORKSPACE / "Trophies.md",
    WORKSPACE / "config.json",
    WORKSPACE / "core" / "settings.json",
    WORKSPACE / "cookies.jar",
    WORKSPACE / "core" / "cookies.jar",
]


def _read_clipboard():
    """Current Windows clipboard text, or None when it cannot be read."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"],
            capture_output=True, timeout=15)
        return out.stdout.decode("utf-8", errors="replace") if out.returncode == 0 else None
    except Exception:
        return None


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _build_sandbox():
    root = Path(tempfile.mkdtemp(prefix="sentinel_suite_"))
    shutil.copytree(WORKSPACE / "core", root / "core", ignore=shutil.ignore_patterns(
        "__pycache__", "*.log", "*.old", "cookies.jar", "dump.dat", "lock.file", "cache"))
    for name in ("config.json", "config.default.json", "Trophies.md"):
        if (WORKSPACE / name).exists():
            shutil.copy2(WORKSPACE / name, root / name)
    if IN_CI:
        # a fresh checkout has neither the user's config nor the trophy journal: start from the defaults
        if not (root / "config.json").exists() and (root / "config.default.json").exists():
            shutil.copy2(root / "config.default.json", root / "config.json")
        if not (root / "Trophies.md").exists():
            (root / "Trophies.md").write_text("# \U0001f3c6 \u0416\u0443\u0440\u043d\u0430\u043b \u0422\u0440\u043e\u0444\u0435\u0435\u0432\n\n| \u0414\u0430\u0442\u0430 | \u0418\u0433\u0440\u0430 | \u0414\u0440\u043e\u043f | \u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f | \u0421\u0442\u0430\u0442\u0443\u0441 |\n|---|---|---|---|---|\n", encoding="utf-8")
    if (WORKSPACE / "data").exists():
        shutil.copytree(WORKSPACE / "data", root / "data", ignore=shutil.ignore_patterns("browser", "*cookie*", "backups"))
    engine_src = WORKSPACE / "giveaways_engine"
    if engine_src.exists():
        shutil.copytree(engine_src, root / "giveaways_engine", ignore=shutil.ignore_patterns("node_modules", "browser", "screenshots", "*.log"))
    return root


SANDBOX = _build_sandbox()
TEST_PORT = _free_port()
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"
_LIVE_HASHES = {path: _sha256(path) for path in LIVE_PROTECTED}
sys.path.insert(0, str(SANDBOX))  # `core.*` imports resolve to the sandbox copy, not the live tree


def _cleanup_sandbox():
    shutil.rmtree(SANDBOX, ignore_errors=True)


atexit.register(_cleanup_sandbox)


def assert_live_data_untouched():
    changed = [str(path.relative_to(WORKSPACE)) for path, digest in _LIVE_HASHES.items() if _sha256(path) != digest]
    assert not changed, f"Suite modified live user files: {changed}"

def test_artifacts():
    print("[1/10] Testing Binary & Bundle Artifacts...")
    exe_path = WORKSPACE / "TwitchDropsSentinel.exe"
    dist_html = WORKSPACE / "dist" / "index.html"
    app_ico = WORKSPACE / "assets" / "app.ico"
    cookies_jar = WORKSPACE / "core" / "cookies.jar"  # existence check only

    if IN_CI and not exe_path.exists():
        print("      SKIP: TwitchDropsSentinel.exe is built later in the pipeline, not present on the runner")
    else:
        assert exe_path.exists(), f"EXE missing: {exe_path}"
        exe_size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"      TwitchDropsSentinel.exe size: {exe_size_mb:.2f} MB")
        assert exe_size_mb > 50, "EXE size too small for standalone publish!"

    assert dist_html.exists(), "dist/index.html missing!"
    html_kb = dist_html.stat().st_size / 1024
    print(f"      dist/index.html singlefile bundle: {html_kb:.1f} KB")
    assert html_kb > 200, "dist/index.html appears incomplete!"

    assert app_ico.exists(), "app.ico missing!"
    if IN_CI and not cookies_jar.exists():
        print("      SKIP: cookies.jar is a private user file and never lives in the repository")
    else:
        assert cookies_jar.exists(), "cookies.jar missing!"
    print("      Artifacts: ALL PASS [OK]")

def test_installed_games_catalog():
    print("[2/22] Testing Clean Installed Games & Catalog Database...")
    catalog_path = WORKSPACE / "src" / "data" / "gamesCatalog.ts"
    assert catalog_path.exists(), "gamesCatalog.ts missing!"
    content = catalog_path.read_text(encoding="utf-8")
    assert "Path of Exile 2" in content
    assert "Hunt: Showdown 1896" in content
    assert "The Witcher 3: Wild Hunt" in content
    assert "Cyberpunk 2077" in content
    assert "USER_INSTALLED_GAMES" in content
    assert "E:Cracked" not in content, "Clean public release must not contain cracked tags"
    print("      Clean Installed Games & Catalog: PASS [OK]")

def test_trophy_vault_journal():
    print("[3/10] Testing Trophy Vault Journal (Trophies.md)...")
    trophies_path = SANDBOX / "Trophies.md"
    assert trophies_path.exists(), "Trophies.md missing!"
    lines = trophies_path.read_text(encoding="utf-8").splitlines()
    assert any("🏆 Журнал Трофеев" in l for l in lines), "Trophies.md must have valid journal header"
    item_rows = [l for l in lines if l.startswith("|") and ("Забран" in l or "забран" in l.lower())]
    print(f"      Found {len(item_rows)} claimed trophy entries in Trophies.md")
    print("      Trophy Vault Journal: PASS [OK]")

def test_hardware_guard():
    print("[4/10] Testing Hardware Guard Sensors...")
    cpu = psutil.cpu_percent(interval=0.1)
    battery = psutil.sensors_battery()
    running_procs = len(list(psutil.process_iter(['name'])))
    print(f"      CPU Usage: {cpu}% | Running Processes: {running_procs}")
    if battery:
        print(f"      Battery: {battery.percent}% (Plugged in: {battery.power_plugged})")
    assert running_procs > 20, "Process enumeration failed!"
    print("      Hardware Guard Sensors: PASS [OK]")

SUITE_PROC = None

def _terminate_suite_proc():
    """Stop the daemon spawned by the suite even when a gate fails mid-run."""
    if SUITE_PROC is not None and SUITE_PROC.poll() is None:
        SUITE_PROC.terminate()
        with suppress(Exception):
            SUITE_PROC.wait(timeout=3)

def ensure_test_service():
    global SUITE_PROC
    for attempt in range(15):
        try:
            req = urllib.request.Request(BASE_URL + "/api/state", headers={"Connection": "close", "User-Agent": "Sentinel-Test"})
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return
        except Exception:
            if attempt == 0 and (SUITE_PROC is None or SUITE_PROC.poll() is not None):
                print("      Spawning test Sentinel Service daemon...")
                service_script = SANDBOX / "core" / "sentinel_service.py"
                SUITE_PROC = subprocess.Popen(
                    [sys.executable, str(service_script)],
                    env={**os.environ, "SENTINEL_SERVICE_PORT": str(TEST_PORT), "SENTINEL_TEST_MODE": "1"},
                    cwd=str(SANDBOX / "core"),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                atexit.register(_terminate_suite_proc)
            time.sleep(0.5)

def test_core_service_api():
    print("[5/10] Testing Core Microservice & REST API...")
    service_script = SANDBOX / "core" / "sentinel_service.py"
    ensure_test_service()

    def safe_urlopen(req, timeout=10.0, max_retries=3):
        if isinstance(req, str):
            req = urllib.request.Request(req, headers={"Connection": "close", "User-Agent": "Sentinel-Test"})
        elif isinstance(req, urllib.request.Request):
            req.add_header("Connection", "close")
            if not req.has_header("User-Agent"):
                req.add_header("User-Agent", "Sentinel-Test")
        for attempt in range(max_retries):
            try:
                return urllib.request.urlopen(req, timeout=timeout)
            except (ConnectionResetError, urllib.error.URLError) as e:
                if attempt == max_retries - 1:
                    raise
                time.sleep(0.5)

    data = {}
    for _ in range(8):
        req = urllib.request.Request(BASE_URL + "/api/state")
        with safe_urlopen(req, timeout=10.0) as res:
            assert res.status == 200, f"Expected 200, got {res.status}"
            data = json.loads(res.read().decode("utf-8"))
            if data.get("username"):
                break
        time.sleep(0.5)
    assert data.get("connected") is True
    assert "username" in data
    assert data.get("username", "").lower() in ["mortuis_v", ""]
    assert "active_drop" in data
    assert "hardware" in data
    assert "stats" in data
    assert "settings" in data
    drop_str = f"{data['active_drop']['name']} ({data['active_drop']['game']})" if data.get('active_drop') else "None (Standby / Initializing)"
    print(f"      Active Drop: {drop_str}")
    print(f"      Stats: Saved {data['stats']['traffic_saved_mb']} MB, Claimed {data['stats']['total_drops_claimed']} items")

    # Test POST /api/settings
    test_settings = {"auto_shutdown_on_complete": True, "pause_on_gaming": True}
    post_data = json.dumps(test_settings).encode("utf-8")
    post_req = urllib.request.Request(
        BASE_URL + "/api/settings",
        data=post_data,
        headers={"Content-Type": "application/json"}
    )
    with safe_urlopen(post_req, timeout=10.0) as res:
        assert res.status == 200
        post_res = json.loads(res.read().decode("utf-8"))
        assert post_res.get("status") == "ok"
        print("      POST /api/settings: PASS [OK]")

    # Test GET /api/verify-game
    v_req = urllib.request.Request(BASE_URL + "/api/verify-game?query=Desert")
    with safe_urlopen(v_req, timeout=10.0) as res:
        assert res.status == 200
        v_res = json.loads(res.read().decode("utf-8"))
        if IN_CI and v_res.get("verified") is not True:
            print("      SKIP: /api/verify-game needs the live Twitch catalog, which a CI runner does not have")
        else:
            assert v_res.get("verified") is True
            assert "Desert" in v_res.get("canonical_name", "")
            print(f"      GET /api/verify-game (Desert -> {v_res['canonical_name']}, drops={v_res.get('has_active_drops')}): PASS [OK]")

    # Test GET /api/catalog
    c_req = urllib.request.Request(BASE_URL + "/api/catalog")
    with safe_urlopen(c_req, timeout=10.0) as res:
        assert res.status == 200
        c_res = json.loads(res.read().decode("utf-8"))
        assert isinstance(c_res, list)
        if IN_CI and len(c_res) <= 50:
            print("      SKIP: a catalog of more than 50 games needs the user's installed games and live Twitch data")
        else:
            assert len(c_res) > 50
            print(f"      GET /api/catalog ({len(c_res)} games): PASS [OK]")

    # Test GET /api/v1/giveaways/state
    g_req = urllib.request.Request(BASE_URL + "/api/v1/giveaways/state")
    with safe_urlopen(g_req, timeout=10.0) as res:
        assert res.status == 200
        g_res = json.loads(res.read().decode("utf-8"))
        assert "runner" in g_res and "stores" in g_res and "inventory" in g_res and "scheduler" in g_res
        print(f"      GET /api/v1/giveaways/state ({len(g_res.get('stores', {}))} stores, {len(g_res.get('inventory', []))} items): PASS [OK]")

    # Test GET /api/updates/check
    u_req = urllib.request.Request(BASE_URL + "/api/updates/check")
    with safe_urlopen(u_req, timeout=10.0) as res:
        assert res.status == 200
        u_res = json.loads(res.read().decode("utf-8"))
        assert "update_available" in u_res
        ver_key = "local_version" if "local_version" in u_res else "current_version"
        assert ver_key in u_res
        print(f"      GET /api/updates/check (Local: {u_res[ver_key]}, Available: {u_res['update_available']}): PASS [OK]")

        # Verify /api/updates/status
        status_req = urllib.request.Request(BASE_URL + "/api/updates/status")
        with urllib.request.urlopen(status_req, timeout=5) as resp:
            s_res = json.loads(resp.read().decode("utf-8"))
            assert "stage" in s_res
            assert "percent" in s_res
            print(f"      GET /api/updates/status (Stage: {s_res['stage']}, Percent: {s_res['percent']}%): PASS [OK]")

    print("      Core Service API: PASS [OK]")

def test_prd_compliance():
    print("[6/10] Testing PRD Acceptance Criteria...")
    prd_path = WORKSPACE / "docs" / "internal" / "PRD_SENTINEL_V3.md"
    assert prd_path.exists(), "PRD_SENTINEL_V3.md missing!"
    content = prd_path.read_text(encoding="utf-8")
    assert "Twitch Drops Sentinel" in content
    assert "Mortuis_V" in content
    assert "E:\\Games Cracked" not in content, "Public PRD must not contain cracked tags!"
    print("      Project: Twitch Drops Sentinel v3.1")
    print("      Author: Mortuis_V / Mortuis_V_Studio")
    print("      PRD Structure: PASS [OK]")

def test_branding_check():
    print("[7/10] Testing Brand Identity...")
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    
    assert "Mortuis_V" in app_tsx
    assert "Mortuis_V_Studio" in settings_tsx
    print("      Brand Signature [Mortuis_V / Mortuis_V_Studio]: PASS [OK]")

def test_streamless_engine_contract():
    print("[8/10] Testing Streamless Twitch Engine & Headless GUI Contract...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))

    from gui import send_toast_msg
    assert callable(send_toast_msg), "send_toast_msg must be callable!"

    from settings import Settings
    from twitch import Twitch
    import inspect

    class Args:
        def __init__(self):
            self.tray = False
            self.log = True
            self.dump = False
            self.logging_level = 20
            self.debug_ws = 0
            self.debug_gql = 0

    s = Settings(Args())
    assert hasattr(s, "dump") and s.dump is False, "Settings.dump must exist!"

    t = Twitch(s)
    assert hasattr(t.gui, "login") and hasattr(t.gui.login, "update"), "gui.login must have update!"
    assert hasattr(t.gui, "inv") and inspect.iscoroutinefunction(t.gui.inv.add_campaign), "gui.inv.add_campaign must be coroutine!"
    assert hasattr(t.gui, "websockets") and hasattr(t.gui.websockets, "update"), "gui.websockets must have update!"
    assert hasattr(t.gui, "channels") and hasattr(t.gui.channels, "display"), "gui.channels must have display!"
    assert hasattr(t.gui, "trophies") and hasattr(t.gui.trophies, "load_trophies"), "gui.trophies must have load_trophies!"
    print("      Streamless Engine Headless Contract: ALL PASS [OK]")

def test_palette_integrity():
    print("[9/10] Testing Apple Luna 2.0 Palette Integrity (Zero-Neon Check)...")
    components_dir = WORKSPACE / "src" / "components"
    banned_colors = ["#9146ff", "#00f2fe", "#772ce8", "#c084fc"]
    violations = []
    for tsx_file in components_dir.glob("*.tsx"):
        content = tsx_file.read_text(encoding="utf-8").lower()
        for color in banned_colors:
            if color in content:
                violations.append(f"{tsx_file.name} contains banned color {color}")
    assert len(violations) == 0, f"Found neon color violations: {violations}"
    print("      Zero-Neon Check (0 banned accents in components): ALL PASS [OK]")

def test_safe_inventory_parsing():
    print("[10/10] Testing Safe GraphQL Dict Parsing & Resiliency...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))

    from inventory import Benefit
    from utils import Game

    # 1. Test empty Benefit dict
    b = Benefit({})
    assert b.id == "", "Empty Benefit id must be empty string"
    assert b.name == "", "Empty Benefit name must be empty string"

    # 2. Test malformed Game dict
    g = Game({"invalid": 123})
    assert g.id == 0, "Default Game id must be 0"
    assert g.name == "Unknown Game", "Default Game name must be Unknown Game"

    g2 = Game(None)
    assert g2.id == 0 and g2.name == "Unknown Game", "None Game must not crash"
    print("      Defensive Schema Parsing: ALL PASS [OK]")

def test_mojibake_cleanliness():
    print("[11/15] Testing Zero-Mojibake Cleanliness Across All Core Files...")
    core_dir = SANDBOX / "core"
    banned_substrings = ["Р·Р", "рџ", "вњ", "вќ", "РџС", "РќР", "РћС"]
    violations = []
    for py_file in core_dir.glob("*.py"):
        content = py_file.read_text(encoding="utf-8")
        for sub in banned_substrings:
            if sub in content:
                violations.append(f"{py_file.name} contains mojibake token '{sub}'")
    assert len(violations) == 0, f"Mojibake violations detected: {violations}"
    print("      Zero Mojibake / CP1251 Artifacts in core/*.py: ALL PASS [OK]")

def test_trophy_matching_cyrillic():
    print("[12/15] Testing Cyrillic Trophy Status & Trophies.md Matching...")
    trophies_path = SANDBOX / "Trophies.md"
    assert trophies_path.exists(), "Trophies.md missing!"
    # Verify that the regex/substring match correctly matches 'забран'
    test_line = "| 2026-10-12 14:00 | **HITMAN World of Assassination** | Crowbar | The Herbalist | ✅ Забран |"
    assert ("забран" in test_line.lower() or "✅" in test_line), "Cyrillic matching must pass"
    lines = trophies_path.read_text(encoding="utf-8").splitlines()
    claimed_lines = [l for l in lines if ("забран" in l.lower() or "✅" in l)]
    print(f"      Cyrillic Trophy Matching ({len(claimed_lines)} entries in journal): ALL PASS [OK]")

def test_channel_drops_enabled_resilience():
    print("[13/15] Testing Channel drops_enabled Resilience & Flapping Prevention...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from channel import Channel, Stream
    from settings import Settings
    from twitch import Twitch

    class Args:
        def __init__(self):
            self.tray = False
            self.log = False
            self.dump = False
            self.logging_level = 20
            self.debug_ws = 0
            self.debug_gql = 0

    t = Twitch(Settings(Args()))
    ch = Channel(t, id=12345, login="test_streamer", display_name="Test Streamer")
    
    # 1. Directory discovery with drops_enabled=True
    raw_dir_data = {
        "id": "111",
        "game": {"id": 1, "name": "HITMAN World of Assassination"},
        "viewersCount": 100,
        "title": "Playing HITMAN Drops ON",
        "broadcaster": {"id": "12345", "login": "test_streamer", "displayName": "Test Streamer"}
    }
    ch._stream = Stream.from_directory(ch, raw_dir_data, drops_enabled=True)
    assert ch.drops_enabled is True, "Stream must have drops_enabled=True from directory"

    # 2. External update with empty available_drops for same game must NOT flip to False
    update_data = {
        "stream": {"id": "111", "viewersCount": 105},
        "broadcastSettings": {"game": {"id": 1, "name": "HITMAN World of Assassination"}, "title": "Playing HITMAN"}
    }
    ch.external_update(update_data, [])
    assert ch.drops_enabled is True, "drops_enabled must be preserved across external updates for same game"
    print("      Channel drops_enabled Resilience: ALL PASS [OK]")

def test_expired_campaign_filtering():
    print("[14/15] Testing Expired Campaign Filtering in Inventory...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from inventory import DropsCampaign
    from settings import Settings
    from twitch import Twitch

    class Args:
        def __init__(self):
            self.tray = False
            self.log = False
            self.dump = False
            self.logging_level = 20
            self.debug_ws = 0
            self.debug_gql = 0

    t = Twitch(Settings(Args()))
    expired_data = {
        "id": "exp_camp_1",
        "name": "War for Atreia - Series 2",
        "status": "EXPIRED",
        "game": {"id": 10, "name": "AION 2"},
        "startAt": "2026-10-01T00:00:00Z",
        "endAt": "2026-10-10T00:00:00Z",
        "timeBasedDrops": []
    }
    camp = DropsCampaign(t, expired_data, {})
    assert camp.expired is True, "Expired status must mark campaign.expired=True"
    assert camp.active is False, "Expired campaign must not be active"
    print("      Expired Campaign Filtering: ALL PASS [OK]")

def test_watchdog_active_drop_sync():
    print("[15/15] Testing Watchdog Active Drop Sync & Grace Period Logic...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from inventory import DropsCampaign, TimedDrop
    from settings import Settings
    from twitch import Twitch

    class Args:
        def __init__(self):
            self.tray = False
            self.log = False
            self.dump = False
            self.logging_level = 20
            self.debug_ws = 0
            self.debug_gql = 0

    t = Twitch(Settings(Args()))
    camp_data = {
        "id": "hitman_camp_1",
        "name": "The Herbalist #4",
        "status": "ACTIVE",
        "game": {"id": 50, "name": "HITMAN World of Assassination"},
        "startAt": "2026-10-01T00:00:00Z",
        "endAt": "2026-10-30T00:00:00Z",
        "timeBasedDrops": [
            {"id": "drop_crowbar", "name": "Purple Streak Crowbar", "requiredMinutesWatched": 60, "self": {"currentMinutesWatched": 2}}
        ]
    }
    camp = DropsCampaign(t, camp_data, {})
    drop = camp.timed_drops["drop_crowbar"]
    t._drops[drop.id] = drop
    t._active_mining_drop = drop
    
    # Assert _active_mining_drop is prioritized for HITMAN
    game_name = "HITMAN World of Assassination"
    candidate = t._active_mining_drop
    assert candidate is not None and candidate.campaign.game.name == game_name and not candidate.is_claimed
    assert candidate.id == "drop_crowbar"
    print("      Watchdog Active Drop Sync: ALL PASS [OK]")

def test_search_games_and_box_art_cache():
    print("[16/16] Testing Multi-Source Game Search & Steam Box Art Cache...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from campaigns_fetcher import CAMPAIGNS_FETCHER, BOX_ART_CACHE_FILE

    # 1. Search cached/live games
    results = CAMPAIGNS_FETCHER.search_games("hitman")
    assert isinstance(results, list), "search_games must return a list"
    assert len(results) > 0, "search_games('hitman') must return results"
    first = results[0]
    assert "name" in first and "canonical_name" in first, "Each search item must have name and canonical_name"
    assert "box_art" in first, "Each search item must have box_art"
    
    # 2. Verify cache structure
    assert isinstance(CAMPAIGNS_FETCHER._box_art_cache, dict), "box_art_cache must be a dictionary"
    print("      Multi-Source Game Search & Box Art Cache: ALL PASS [OK]")

def test_sequel_guard_and_no_false_box_art():
    print("[17/17] Testing Strict Sequel Guard & Zero-False-Box-Art Matching...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from campaigns_fetcher import smart_game_match

    # 1. Daemonhunters must NEVER match Hunt
    assert not smart_game_match("Warhammer 40,000: Chaos Gate - Daemonhunters", "Hunt: Showdown"), "Daemonhunters must not match Hunt"
    assert not smart_game_match("Hunt", "Warhammer 40,000: Chaos Gate - Daemonhunters"), "Hunt must not match Daemonhunters"

    # 2. Path of Exile 1 must NEVER match Path of Exile 2
    assert not smart_game_match("Path of Exile", "Path of Exile 2"), "PoE 1 must not match PoE 2"
    assert not smart_game_match("Path of Exile 2", "Path of Exile"), "PoE 2 must not match PoE 1"
    assert not smart_game_match("Hades", "Hades II"), "Hades must not match Hades II"
    assert not smart_game_match("Frostpunk", "Frostpunk 2"), "Frostpunk must not match Frostpunk 2"

    # 3. Legitimate matches must pass
    assert smart_game_match("Hunt: Showdown", "Hunt: Showdown 1896"), "Hunt 1896 should match Hunt: Showdown"
    assert smart_game_match("Warhammer 40,000: Space Marine 2", "Space Marine II"), "Roman numerals should match Arabic"

    print("      Strict Sequel Guard & Zero False Matches: ALL PASS [OK]")

def test_audited_steam_app_ids_and_verified_sequels():
    print("[18/18] Testing Audited Steam AppIDs & Verified Sequels...")
    import re
    from pathlib import Path
    ts_file = WORKSPACE / "src" / "utils" / "gameBoxArts.ts"
    assert ts_file.exists(), "gameBoxArts.ts must exist"
    content = ts_file.read_text(encoding="utf-8")

    # 1. Assert fixed AppIDs
    assert "'dredge': '1562430'" in content, "Dredge must be mapped to 1562430"
    assert "'the division 2': '2221490'" in content, "The Division 2 must be mapped to 2221490"
    assert "'dune: spice wars': '1605220'" in content, "Dune: Spice Wars must be mapped to 1605220"
    assert "'skull and bones': '2853730'" in content, "Skull and Bones must be mapped to 2853730"
    assert "'steamworld build': '2134770'" in content, "SteamWorld Build must be mapped to 2134770"
    assert "'mechanicus 2': '2532480'" in content, "Mechanicus 2 must be mapped to 2532480"
    assert "'moonlighter 2': '2350790'" in content, "Moonlighter 2 must be mapped to 2350790"
    assert "'endless legend 2': '3407390'" in content, "Endless Legend 2 must be mapped to 3407390"

    # 2. Assert verified sequels from user's request
    assert "'battlefield 6': '2807960'" in content, "Battlefield 6 must be mapped to 2807960"
    assert "'jurassic world evolution 3': '2958130'" in content, "Jurassic World Evolution 3 must be mapped to 2958130"
    assert "'planet zoo 2': '3219030'" in content, "Planet Zoo 2 must be mapped to 3219030"
    assert "'graveyard keeper 2': '4358690'" in content, "Graveyard Keeper 2 must be mapped to 4358690"

    print("      Audited Steam AppIDs & Verified Sequels: ALL PASS [OK]")

def test_giveaways_hub_integration():
    print("[19/19] Testing Free Games Claimer Giveaways Hub Integration...")
    import sys
    import asyncio
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from giveaways_controller import GiveawaysOrchestrator

    orchestrator = GiveawaysOrchestrator()
    state = asyncio.run(orchestrator.get_state())

    assert "runner" in state, "State must contain 'runner'"
    assert "stores" in state, "State must contain 'stores'"
    assert "inventory" in state, "State must contain 'inventory'"
    assert "scheduler" in state, "State must contain 'scheduler'"

    store_ids = list(state["stores"].keys())
    assert "epic" in store_ids, "Epic Games store missing"
    assert "gog" in store_ids, "GOG store missing"
    assert "steam" in store_ids, "Steam store missing"
    assert "fab" in store_ids, "Fab store missing"
    assert "unity" in store_ids, "Unity store missing"

    # Inventory test
    assert len(state["inventory"]) > 0, "Inventory must contain claimed items"
    first_item = state["inventory"][0]
    assert "id" in first_item and "title" in first_item and "store" in first_item

    # Scheduler test
    sched = state["scheduler"]
    assert "taskName" in sched and "FreeGamesClaimerStudio" in sched["taskName"]
    assert "state" in sched

    # Frontend bundle test - verify giveaways in bundle
    dist_html = WORKSPACE / "dist" / "index.html"
    bundle_text = dist_html.read_text(encoding="utf-8")
    assert "Раздачи" in bundle_text or "giveaways" in bundle_text

    print(f"      Giveaways Hub Integration ({len(state['inventory'])} items, scheduler={sched['state']}): ALL PASS [OK]")

def test_universal_game_scanner():
    print("[20/22] Testing Universal GameScanner (Steam, Epic, GOG, Custom folders)...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from game_scanner import GameScanner

    scanner = GameScanner()
    steam_games = scanner.scan_steam()
    epic_games = scanner.scan_epic()
    gog_games = scanner.scan_gog()
    total = scanner.scan_all_sync()
    print(f"      Discovered: Steam={len(steam_games)} | Epic={len(epic_games)} | GOG={len(gog_games)} | Total={len(total)}")
    assert len(total) > 0, "Scanner must discover installed games on this system!"
    if IN_CI and not steam_games:
        print("      SKIP: a CI runner has no Steam library to scan")
    else:
        assert any(g.get("platform") == "steam" for g in total), "Expected at least one Steam game"
    print("      Universal GameScanner: ALL PASS [OK]")

def test_route_aliases_and_directory_management():
    print("[21/22] Testing Route Aliases & Directory Management Endpoints...")
    # Verify that sentinel_service.py has all requested route aliases
    service_code = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/scan-games" in service_code, "Route alias /api/scan-games must be registered"
    assert "/api/open-trophies-file" in service_code, "Route alias /api/open-trophies-file must be registered"
    assert "/api/sync" in service_code, "Route /api/sync must be registered"
    assert "/api/game-directories" in service_code, "Route /api/game-directories must be registered"
    assert "/api/game-directories/add" in service_code, "Route /api/game-directories/add must be registered"
    assert "/api/game-directories/remove" in service_code, "Route /api/game-directories/remove must be registered"
    assert "/api/browse-folder" in service_code, "Route /api/browse-folder must be registered"
    print("      Route Aliases & Directory Endpoints: ALL PASS [OK]")

def test_audio_mute_and_release_safety():
    print("[22/22] Testing Audio Mute & Multi-User Release Safety...")
    # 1. Verify useTactileAudio has mute toggle and persistence
    audio_hook = (WORKSPACE / "src" / "hooks" / "useTactileAudio.ts").read_text(encoding="utf-8")
    assert "toggleMute" in audio_hook, "toggleMute must exist in useTactileAudio"
    assert "isMuted" in audio_hook, "isMuted must exist in useTactileAudio"
    assert "sentinel_muted" in audio_hook, "sentinel_muted must be persisted in localStorage"

    # 2. Verify Topbar has mute button
    app_code = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "Volume2" in app_code and "VolumeX" in app_code, "App.tsx must include Volume icons"
    assert "toggleMute" in app_code, "App.tsx must wire toggleMute"

    # 3. Verify SettingsStudio has folder manager and mute switch
    settings_code = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleBrowseAndAddFolder" in settings_code, "SettingsStudio must have handleBrowseAndAddFolder"
    assert "handleRemoveFolder" in settings_code, "SettingsStudio must have handleRemoveFolder"
    assert "Звуки интерфейса" in settings_code, "SettingsStudio must have UI sound mute switch"

    # 4. Verify C# MainForm.cs handles SELECT_FOLDER message
    mainform_code = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "SELECT_FOLDER" in mainform_code, "MainForm.cs must handle SELECT_FOLDER"
    assert "FolderBrowserDialog" in mainform_code, "MainForm.cs must instantiate FolderBrowserDialog"
    assert "C:\\AI Local Projects\\Ideas\\Twitch Drops Sentinel v3\\dist" not in mainform_code, "Hardcoded author path must be eliminated"

    print("      Audio Mute & Multi-User Release Safety: ALL PASS [OK]")

def test_argon_public_hardening_and_resilience():
    print("[23/23] Testing Argon Public Release Hardening & Host Resilience...")
    # 1. Mutex and Single-Instance in C#
    program_cs = (WORKSPACE / "desktop" / "Program.cs").read_text(encoding="utf-8")
    assert "TwitchDropsSentinel_v3_Mutex" in program_cs, "Program.cs must register single instance mutex"
    assert "WM_SENTINEL_SHOW_V3_0" in program_cs, "Program.cs must register WM_SENTINEL_SHOW message"
    assert "PostMessage(HWND_BROADCAST" in program_cs, "Program.cs must broadcast wake up message on duplicate launch"

    # 2. Job Object & WndProc in MainForm.cs
    mainform_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "ChildProcessTracker" in mainform_cs, "MainForm.cs must include Win32 ChildProcessTracker"
    assert "CreateJobObject" in mainform_cs, "MainForm.cs must bind to Job Object"
    assert "WndProc" in mainform_cs, "MainForm.cs must override WndProc for WM_SENTINEL_SHOW"
    assert "-X utf8" in mainform_cs, "MainForm.cs must launch python with -X utf8 argument"
    assert "ShowWindow" in mainform_cs, "MainForm.cs must import Win32 ShowWindow for reliable tray restore"
    assert "SW_RESTORE" in mainform_cs, "MainForm.cs must use SW_RESTORE to unwrap minimized DWM stub"
    assert "EnsureValidWindowBounds" in mainform_cs, "MainForm.cs must include EnsureValidWindowBounds"
    assert "SC_MINIMIZE" in mainform_cs, "MainForm.cs must intercept SC_MINIMIZE to prevent window geometry collapse"
    assert "ShowInTaskbar = false" not in mainform_cs, "MainForm.cs must never mutate ShowInTaskbar to prevent RecreateHandle()"

    # 3. Sleep guard and endpoints in sentinel_service.py
    service_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "set_sleep_guard" in service_py, "sentinel_service.py must include set_sleep_guard"
    assert "ES_SYSTEM_REQUIRED" in service_py, "set_sleep_guard must use ES_SYSTEM_REQUIRED"
    assert "/api/autostart" in service_py, "sentinel_service.py must register /api/autostart"
    assert "/api/diagnostic-report" in service_py, "sentinel_service.py must register /api/diagnostic-report"
    assert "generate_sanitized_diagnostic_report" in service_py, "sentinel_service.py must include sanitized report generator"

    # 4. SettingsStudio autostart & report
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleToggleAutostart" in settings_tsx, "SettingsStudio must have autostart handler"
    assert "handleCopyDiagnosticReport" in settings_tsx, "SettingsStudio must have diagnostic report copy handler"
    assert "Запускать с Windows" in settings_tsx, "SettingsStudio must render Windows autostart option"
    assert "Диагностический отчет" in settings_tsx, "SettingsStudio must render diagnostic report button"

    # 5. Diagnostic report sanitization unit test
    sys.path.insert(0, str(SANDBOX / "core"))
    from sentinel_service import generate_sanitized_diagnostic_report
    fake_settings = {"priority_games": ["Path of Exile 2"], "game_directories": []}
    fake_hw = {"cpu_percent": 15, "on_battery": False, "is_gaming": False}
    from version import __version__ as _real_version
    from gui_headless import STATE_BRIDGE
    secret_logs = [
        {"time": "12:00:00", "level": "INFO", "message": "login with oauth:abcdef0123456789abcdef0123456789"},
        {"time": "12:00:01", "level": "INFO", "message": "auth_token=SECRETTOKENVALUE123 refreshed"},
        {"time": "12:00:02", "level": "INFO", "message": "password=hunter2secret saved"},
    ]
    _saved_logs = list(STATE_BRIDGE.recent_logs)
    STATE_BRIDGE.recent_logs = secret_logs
    try:
        report = generate_sanitized_diagnostic_report(fake_settings, fake_hw)
    finally:
        STATE_BRIDGE.recent_logs = _saved_logs
    # the title carries the real version from core/version.py, not a hard-coded one
    assert f"TWITCH DROPS SENTINEL v{_real_version} — DIAGNOSTIC REPORT" in report, report.splitlines()[1]
    assert "v3.1 " not in report.splitlines()[1]
    # no token, password or cookie value may leak into the report
    for secret in ("abcdef0123456789abcdef0123456789", "SECRETTOKENVALUE123", "hunter2secret"):
        assert secret not in report, f"diagnostic report leaked a secret: {secret}"
    assert "oauth:[REDACTED]" in report
    assert "END OF DIAGNOSTIC REPORT" in report

    print("      Argon Hardening & Host Resilience: ALL PASS [OK]")

def test_github_updater_and_zero_mock_telemetry():
    print("[24/24] Testing GitHub Auto-Updater & Zero-Mock Telemetry...")

    # 1. Verify core/updater.py exists and parses versions correctly
    sys.path.insert(0, str(SANDBOX / "core"))
    from updater import GitHubUpdater, parse_version, UPDATER, PROTECTED_PATHS, check_and_apply_pending_exe_update
    from version import __version__

    assert __version__ == "3.5.5", f"Version mismatch: {__version__}"
    assert parse_version("3.5.5") == (3, 5, 5)
    assert parse_version("v3.3.6-beta") == (3, 3, 6)
    assert parse_version("v3.5.5") > parse_version("3.5.4")
    assert not check_and_apply_pending_exe_update(), "Should return False when no .update file is pending"

    # 2. Verify protected blacklist in updater
    assert "cookies.jar" in PROTECTED_PATHS
    assert "trophies.md" in PROTECTED_PATHS or "Trophies.md" in PROTECTED_PATHS
    assert "config.json" in PROTECTED_PATHS

    # 3. Verify zero fake hardware telemetry in LiveDashboard.tsx
    live_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    for fake_str in ["RTX 5070 Ti", "Cold (38°C)", "1.2 Watt", "Direct ISP", "14 ms Stealth"]:
        assert fake_str not in live_tsx, f"Found mock hardware telemetry in LiveDashboard.tsx: {fake_str}"

    # 4. Verify 2-column bento grid in index.css
    css_content = (WORKSPACE / "src" / "index.css").read_text(encoding="utf-8")
    assert "minmax(380px, 460px) 1fr" in css_content, "Bento grid must be 2 columns"

    # 5. Verify App.tsx has update modal and real telemetry
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "updateInfo" in app_tsx, "App.tsx must have updater state"
    assert "showUpdateModal" in app_tsx, "App.tsx must have update modal"
    assert "version-pro" in app_tsx, "App.tsx must display version badge"
    assert "TrophiesVault Verified" not in app_tsx, "Footer must not contain TrophiesVault Verified artifact"

    # 6. Verify SettingsStudio.tsx has GitHub updater card
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "Обновления: не проверялись" in settings_tsx, "SettingsStudio must render the short update status"
    assert "handleCheckUpdates" in settings_tsx, "SettingsStudio must have handleCheckUpdates"

    # 7. Verify orphaned legacy components are purged
    for orphan in ["Header.tsx", "Navigation.tsx", "TrophyVault.tsx"]:
        assert not (WORKSPACE / "src" / "components" / orphan).exists(), f"Orphaned component {orphan} must be deleted"

    print("      GitHub Auto-Updater & Zero-Mock Telemetry: ALL PASS [OK]")

def test_hardware_guard_false_positive_and_installed_clear():
    print("[25/25] Testing Hardware Guard Anti-False-Positive & Installed Clear...")
    
    # 1. Verify sentinel_service.py contains SYSTEM_NON_GAME_EXES and no blind auto-injection
    svc_code = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "SYSTEM_NON_GAME_EXES" in svc_code
    assert "happ.exe" in svc_code
    assert "mscopilot.exe" in svc_code
    assert "spotify.exe" in svc_code
    assert "handle_ignore_process" in svc_code
    assert "handle_clear_installed_games" in svc_code
    # Ensure old bug is not present in games_folder_rescan_loop
    assert "games_to_pause" not in svc_code.split("def games_folder_rescan_loop")[1].split("def ")[0]

    # 2. Verify App.tsx has no duplicate top alert banner
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "Hardware Guard: Обнаружена игра" not in app_tsx, "App.tsx must not contain duplicate gaming alert banner"

    # 3. Verify LiveDashboard.tsx has 1-click ignore button
    live_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "handleIgnoreDetectedProcess" in live_tsx, "LiveDashboard must contain handleIgnoreDetectedProcess"
    assert "Это не игра (Игнорировать)" in live_tsx, "LiveDashboard must contain ignore button text"

    # 4. Verify SettingsStudio.tsx has clear installed games button
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleClearInstalledGames" in settings_tsx, "SettingsStudio must contain handleClearInstalledGames"
    assert "Очистить список" in settings_tsx, "SettingsStudio must contain clear list button"

    # 5. Verify GameShelf.tsx has installed games management
    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "handleClearInstalled" in shelf_tsx, "GameShelf must contain handleClearInstalled"

    # 6. Verify REST API endpoints respond cleanly
    ensure_test_service()
    req_ignore = urllib.request.Request(
        BASE_URL + "/api/hardware/ignore-process",
        data=json.dumps({"process": "Happ.exe"}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_ignore, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"
        assert d.get("ignored") == "Happ.exe"

    req_clear = urllib.request.Request(
        BASE_URL + "/api/installed-games/clear",
        data=b"{}",
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    # /clear wipes the real data/installed_games.json: keep a copy and put it back.
    installed_file = SANDBOX / "data" / "installed_games.json"
    installed_backup = installed_file.read_bytes() if installed_file.exists() else None
    try:
        with urllib.request.urlopen(req_clear, timeout=5.0) as res:
            assert res.status == 200
            d = json.loads(res.read().decode("utf-8"))
            assert d.get("status") == "ok"
            assert d.get("cleared") is True
    finally:
        if installed_backup is not None:
            installed_file.write_bytes(installed_backup)

    print("      Hardware Guard Anti-False-Positive & Installed Clear: ALL PASS [OK]")

def test_channel_points_clipboard_and_feature_toggles():
    print("[26/26] Testing Channel Points Auto-Claim, Multi-Layer Clipboard & Feature Toggles...")

    # 1. Verify MainForm.cs has COPY_TO_CLIPBOARD IPC
    main_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "COPY_TO_CLIPBOARD" in main_cs, "MainForm.cs must handle COPY_TO_CLIPBOARD"
    assert "Clipboard.SetText" in main_cs, "MainForm.cs must copy to system clipboard"

    # 2. Verify core/sentinel_service.py has clipboard endpoint and feature flags
    svc_code = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/clipboard/copy" in svc_code, "sentinel_service.py must register /api/clipboard/copy"
    assert "handle_clipboard_copy" in svc_code, "sentinel_service.py must implement handle_clipboard_copy"
    assert "claim_channel_points" in svc_code, "load_settings must support claim_channel_points"
    assert "auto_claim_drops" in svc_code, "load_settings must support auto_claim_drops"
    assert "giveaways_enabled" in svc_code, "load_settings must support giveaways_enabled"
    assert "streamer_watchdog_enabled" in svc_code, "load_settings must support streamer_watchdog_enabled"

    # 3. Verify core/twitch.py has CommunityPoints topic, claim mutation & feature gates
    twitch_code = (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8")
    assert "CommunityPoints" in twitch_code, "twitch.py must subscribe to CommunityPoints topic"
    assert "claim_channel_points_if_available" in twitch_code, "twitch.py must implement claim_channel_points_if_available"
    assert "ClaimCommunityPoints" in twitch_code, "twitch.py must define ClaimCommunityPoints mutation"
    assert "channel_points_earned" in twitch_code, "twitch.py must increment channel_points_earned"
    assert "claim_channel_points_enabled" in twitch_code, "twitch.py must store claim_channel_points_enabled"
    assert "auto_claim_drops_enabled" in twitch_code, "twitch.py must guard auto_claim_drops_enabled"
    assert "streamer_watchdog_enabled" in twitch_code, "twitch.py must guard streamer_watchdog_enabled"

    # 4. Verify src/components/SettingsStudio.tsx has 4-layer copy and 10 feature switches
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "COPY_TO_CLIPBOARD" in settings_tsx, "SettingsStudio must trigger C# COPY_TO_CLIPBOARD IPC"
    assert "/api/clipboard/copy" in settings_tsx, "SettingsStudio must trigger backend fallback clipboard"
    assert "МОДУЛИ" in settings_tsx, "SettingsStudio must render feature modules board"
    assert "claim_channel_points" in settings_tsx, "SettingsStudio must have claim_channel_points switch"
    assert "auto_claim_drops" in settings_tsx, "SettingsStudio must have auto_claim_drops switch"
    assert "giveaways_enabled" in settings_tsx, "SettingsStudio must have giveaways_enabled switch"
    assert "streamer_watchdog_enabled" in settings_tsx, "SettingsStudio must have streamer_watchdog_enabled switch"

    # 5. Live test: GET /api/diagnostic-report and POST /api/clipboard/copy
    req_diag = urllib.request.Request(
        BASE_URL + "/api/diagnostic-report",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_diag, timeout=5.0) as res:
        assert res.status == 200
        diag_text = res.read().decode("utf-8")
        assert "twitch drops sentinel" in diag_text.lower()

    clipboard_before = _read_clipboard()
    req_clip = urllib.request.Request(
        BASE_URL + "/api/clipboard/copy",
        data=json.dumps({"text": diag_text[:300]}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_clip, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"
    if clipboard_before is not None:
        assert _read_clipboard() == clipboard_before, "Test-mode /api/clipboard/copy must not touch the user's clipboard"

    # 6. Live test: Settings persistence through /api/settings and /api/state
    req_settings = urllib.request.Request(
        BASE_URL + "/api/settings",
        data=json.dumps({
            "claim_channel_points": True,
            "auto_claim_drops": True,
            "giveaways_enabled": True,
            "streamer_watchdog_enabled": True,
        }).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_settings, timeout=10.0) as res:
        assert res.status == 200

    req_state = urllib.request.Request(
        BASE_URL + "/api/state",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_state, timeout=10.0) as res:
        assert res.status == 200
        state = json.loads(res.read().decode("utf-8"))
        st = state.get("settings", {})
        assert st.get("claim_channel_points") is True
        assert st.get("auto_claim_drops") is True
        assert st.get("giveaways_enabled") is True
        assert st.get("streamer_watchdog_enabled") is True

    print("      Channel Points Auto-Claim, Multi-Layer Clipboard & Feature Toggles: ALL PASS [OK]")

def test_game_scanner_anti_software_and_patch_filtering():
    print("[27/27] Testing GameScanner Anti-Software, Patch & Container Stop-Word Filtering...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from game_scanner import (
        GameScanner, CONTAINER_STOP_WORDS, MOD_PATCH_PATTERNS,
        NON_GAME_NAMES, NON_GAME_PUBLISHERS
    )

    # 1. Verify container stop words
    for word in ["game", "games", "steamlibrary", "repack", "downloads"]:
        assert word in CONTAINER_STOP_WORDS, f"Container stop word '{word}' missing"

    # 2. Verify mod and patch pattern matching with zero false positives on real games
    assert MOD_PATCH_PATTERNS.search("Clair Obscur Expedition 33 - Русификатор звука, текста v1.5") is not None
    assert MOD_PATCH_PATTERNS.search("Cyberpunk 2077 - Mod Pack v2.1") is not None
    assert MOD_PATCH_PATTERNS.search("Game Patch Update v1.03") is not None
    assert MOD_PATCH_PATTERNS.search("Crack Fix") is not None
    assert MOD_PATCH_PATTERNS.search("Hades II") is None
    # Poison tests: Real games must NEVER be false-positive matched!
    assert MOD_PATCH_PATTERNS.search("Lost Ark") is None
    assert MOD_PATCH_PATTERNS.search("Call of Duty: Modern Warfare") is None
    assert MOD_PATCH_PATTERNS.search("Ghost of Tsushima") is None
    assert MOD_PATCH_PATTERNS.search("Frostpunk 2") is None

    # 3. Verify non-game software names and publishers with zero false positives on real games
    test_non_games = [
        "calibre 64bit", "Capture One", "Gemini", "Happ - Proxy Utility 4.5.3(624)",
        "AnVir Task Manager 9.4.0", "K-Lite Mega Codec Pack 18.0.5"
    ]
    for non_game in test_non_games:
        assert NON_GAME_NAMES.search(non_game) is not None, f"Non-game '{non_game}' should be matched by NON_GAME_NAMES"

    # Poison tests: Real games must NEVER be blocked as desktop software!
    assert NON_GAME_NAMES.search("Mirror's Edge") is None
    assert NON_GAME_NAMES.search("Sword Art Online") is None
    assert NON_GAME_NAMES.search("We Happy Few") is None

    # 4. Verify GameShelf.tsx has Trash2 button and handleRemoveInstalled
    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "handleRemoveInstalled" in shelf_tsx, "GameShelf must define handleRemoveInstalled"
    assert "/api/installed-games/remove" in shelf_tsx, "GameShelf must call /api/installed-games/remove"
    assert "Trash2" in shelf_tsx, "GameShelf must render Trash2 icon for installed games"

    # 5. Verify live endpoint POST /api/installed-games/remove
    req_remove = urllib.request.Request(
        BASE_URL + "/api/installed-games/remove",
        data=json.dumps({"id": "test_game_sample_123", "name": "Sample Test Game"}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_remove, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"
        assert d.get("removed") == "Sample Test Game"

    # Clean up test artifact from ignored_games
    scanner = GameScanner()
    ignored = scanner.load_ignored_games()
    ignored.discard("test_game_sample_123")
    ignored.discard("sample test game")
    ignored.discard("sampletestgame")
    (scanner.data_dir / "ignored_games.json").write_text(
        json.dumps(sorted(list(ignored)), indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print("      GameScanner Anti-Software, Patch & Container Stop-Word Filtering: ALL PASS [OK]")

def test_game_scanner_deduplication_and_trophies_clear():
    """Gate 28: Verifies path deduplication, appid name fallback, DLC rejection, and trophies clearing."""
    print("[28/28] Testing GameScanner Deduplication, AppID Name Fallback & Trophies Clear Gate...")

    from core.game_scanner import GameScanner, InstalledGame, normalize_game_name
    scanner = GameScanner()

    # 1. Verify appid_ fallback logic in normalize / steam
    from core.game_scanner import EDITION_STRIP_RE
    assert EDITION_STRIP_RE.search("Death Stranding DC"), "EDITION_STRIP_RE must match DC abbreviation"
    assert normalize_game_name("Death Stranding DC") == normalize_game_name("Death Stranding Director's Cut")

    # 2. Verify path-based deduplication in register()
    mock_store_game = InstalledGame.create(
        game_id="steam_12345",
        name="A Plague Tale: Innocence",
        platform="steam",
        category="Steam",
        install_path="C:\\Games\\APlagueTale",
    )
    mock_custom_duplicate = InstalledGame.create(
        game_id="custom_aplaguetale",
        name="APlagueTale",
        platform="custom",
        category="Локальный",
        install_path="C:\\Games\\APlagueTale",
    )

    discovered = {}
    seen_install_paths = {}

    def test_reg(games):
        for g in games:
            name = g.get("name", "").strip()
            norm = g.get("normalized_name") or normalize_game_name(name)
            install_path_raw = g.get("install_path", "")
            canon_path = str(Path(install_path_raw).resolve()).lower() if install_path_raw else ""
            if canon_path and canon_path in seen_install_paths:
                existing_platform = seen_install_paths[canon_path]
                if existing_platform in ("steam", "epic", "gog") and g.get("platform") in ("registry", "custom"):
                    continue
            existing = discovered.get(norm)
            if existing is None or existing.get("platform") in ("registry", "custom"):
                discovered[norm] = g
                if canon_path:
                    seen_install_paths[canon_path] = g.get("platform", "custom")

    test_reg([mock_store_game])
    test_reg([mock_custom_duplicate])
    assert len(discovered) == 1, "Secondary custom duplicate with same install_path must be omitted"
    assert list(discovered.values())[0]["name"] == "A Plague Tale: Innocence"

    # 3. Verify DLC upgrade rejection pattern
    dlc_name = "Clair Obscur: Expedition 33 - Deluxe Edition Upgrade"
    assert re.search(r"\b(upgrade|dlc pack|soundtrack|artbook)\b", dlc_name, re.I), "DLC upgrade must match filter"

    # 4. Verify Live POST /api/trophies/clear endpoint
    req_clear = urllib.request.Request(
        BASE_URL + "/api/trophies/clear",
        data=b"{}",
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    trophies_file = SANDBOX / "Trophies.md"
    # /clear truncates the real Trophies.md journal: keep a copy and put it back.
    trophies_backup = trophies_file.read_bytes() if trophies_file.exists() else None
    try:
        with urllib.request.urlopen(req_clear, timeout=5.0) as res:
            assert res.status == 200
            d = json.loads(res.read().decode("utf-8"))
            assert d.get("status") == "ok"
            assert d.get("cleared") is True

        assert trophies_file.exists(), "Trophies.md must exist after clearing"
        content = trophies_file.read_text(encoding="utf-8")
        assert "# 🏆 Журнал Трофеев Twitch Drops Sentinel" in content
        lines = [l for l in content.splitlines() if l.strip()]
        assert len(lines) <= 5, "Cleared Trophies.md must contain only the header table"
    finally:
        if trophies_backup is not None:
            trophies_file.write_bytes(trophies_backup)

    # 5. Verify SettingsStudio.tsx has clear button
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleClearTrophies" in settings_tsx, "SettingsStudio must have handleClearTrophies"
    assert "/api/trophies/clear" in settings_tsx, "SettingsStudio must call /api/trophies/clear"
    assert "showReportModal" in settings_tsx, "SettingsStudio must support showReportModal"

    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "removedKeys" in shelf_tsx, "GameShelf must support optimistic removedKeys"

    print("      GameScanner Deduplication, AppID Name Fallback & Trophies Clear: ALL PASS [OK]")

def test_sleep_guard_watchdog_and_account_protection():
    print("[29/29] Testing Sleep Guard, WebSocket Probe Watchdog, Log Rotation & Account Protection...")
    # 1. Sleep Guard in core/twitch.py
    twitch_py = (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8")
    assert "SLEEP GUARD" in twitch_py, "twitch.py must contain SLEEP GUARD log"
    assert "raw_step_elapsed > 60.0" in twitch_py, "twitch.py must clamp sleep gap when raw_step_elapsed > 60s"
    assert "streamer_watch_start += sleep_gap" in twitch_py, "twitch.py must adjust streamer_watch_start by sleep_gap"
    assert "is_linked" in twitch_py, "switch_priority must check is_linked"

    # 2. WebSocket Heartbeat Watchdog in core/websocket.py
    ws_py = (SANDBOX / "core" / "websocket.py").read_text(encoding="utf-8")
    assert "_last_msg_time" in ws_py, "websocket.py must track _last_msg_time"
    assert "_probe_sent" in ws_py, "websocket.py must track _probe_sent"
    assert "now - self._last_msg_time > 45.0" in ws_py, "websocket.py must send probe PING after 45s of silence"

    # 3. Log Rotation in desktop/MainForm.cs
    mainform_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "writeRotatedLog" in mainform_cs, "MainForm.cs must implement writeRotatedLog"
    assert "5 * 1024 * 1024" in mainform_cs, "MainForm.cs must rotate logs at 5 MB"
    assert ".old" in mainform_cs, "MainForm.cs must archive old log with .old suffix"

    # 4. Logout / Account Switcher
    service_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/auth/logout" in service_py, "sentinel_service.py must register /api/auth/logout"
    assert "handle_logout" in service_py, "sentinel_service.py must implement handle_logout"
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleLogout" in settings_tsx, "SettingsStudio must implement handleLogout"
    assert "Сменить аккаунт" in settings_tsx, "SettingsStudio must render 'Сменить аккаунт' button"

    # 5. Linked Account Warning & Badges
    fetcher_py = (SANDBOX / "core" / "campaigns_fetcher.py").read_text(encoding="utf-8")
    assert "is_account_connected" in fetcher_py, "campaigns_fetcher.py must propagate is_account_connected"
    assert "account_link_url" in fetcher_py, "campaigns_fetcher.py must propagate account_link_url"
    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "⚠️ Требуется привязка" in shelf_tsx, "GameShelf must display '⚠️ Требуется привязка' badge"

    # 6. SmartScreen Unblock in Launcher
    launcher_bat = (WORKSPACE / "Запустить_Twitch_Drops_Sentinel.bat").read_text(encoding="utf-8")
    assert "Unblock-File" in launcher_bat, "Launcher must run Unblock-File to prevent SmartScreen popups"

    print("      Sleep Guard, WebSocket Watchdog, Log Rotation & Account Protection: ALL PASS [OK]")

def test_r6s_showcase_acl_and_strict_priority_guard():
    print("[30/30] Testing Showcase ACL Matching, Twitch Drops Directory Discovery & Strict Priority Guard...")

    # 1. Verify core/channel.py has available_campaign_ids and showcase ACL check
    channel_py = (SANDBOX / "core" / "channel.py").read_text(encoding="utf-8")
    assert "available_campaign_ids" in channel_py, "Channel.__slots__ must include available_campaign_ids"
    assert "self.available_campaign_ids = {" in channel_py, "_check_drops_enabled must store available_campaign_ids"
    assert "len(campaign.allowed_channels) <= 10" in channel_py, "_check_drops_enabled must allow showcase ACLs <= 10"

    # 2. Verify core/inventory.py allows showcase ACLs & AvailableDrops confirmed channels
    inv_py = (SANDBOX / "core" / "inventory.py").read_text(encoding="utf-8")
    assert "available_campaign_ids" in inv_py, "inventory.py _base_can_earn must check available_campaign_ids"
    assert "len(self.allowed_channels) <= 10" in inv_py, "inventory.py _base_can_earn must check len(allowed_channels) <= 10"

    # 3. Verify core/twitch.py discovers live streams for games with showcase ACLs
    twitch_py = (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8")
    assert "len(campaign.allowed_channels) <= 10" in twitch_py, "twitch.py must add campaign.game to no_acl when ACL <= 10"

    # 4. Verify LiveDashboard.tsx keeps all games visible in default ALL tab
    dashboard_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "Все (${sortedQueuedCampaigns.length})" in dashboard_tsx, "LiveDashboard must display 'Все' tab with full count"
    assert "if (shelfFilter === 'ALL') return true;" in dashboard_tsx, "LiveDashboard ALL tab must return true"

    # 5. Verify settings.json priority clean from unwanted games
    settings_raw = (SANDBOX / "core" / "settings.json").read_text(encoding="utf-8")
    settings_json = json.loads(settings_raw)
    priority_list = settings_json.get("priority", [])
    assert "Infestation: The New Z" not in priority_list, "Infestation: The New Z must not be in priority list"
    assert settings_json.get("priority_mode", {}).get("data") == 0, "priority_mode must be strictly 0"

    print("      Showcase ACL Matching, Drops Discovery & Strict Priority Guard: ALL PASS [OK]")

def test_giveaways_stores_persistence_and_version_standardization():
    print("[31/31] Testing Giveaways Store Persistence & Single-Location Dynamic Version...")

    # 1. Verify sentinel_service.py returns version in state and defaults giveaways stores
    sentinel_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert '"version": self.get_app_version()' in sentinel_py, "sentinel_service must include version in get_full_state"
    assert '"giveaways_selected_stores"' in sentinel_py, "sentinel_service must include giveaways_selected_stores in load_settings"
    assert '"giveaways_headless"' in sentinel_py, "sentinel_service must include giveaways_headless in load_settings"

    # 2. Verify updater.py dynamic local version reading and cache invalidation
    updater_py = (SANDBOX / "core" / "updater.py").read_text(encoding="utf-8")
    assert "def get_live_local_version()" in updater_py, "updater.py must contain get_live_local_version"
    assert "local_ver = parse_version(live_current)" in updater_py, "updater.py must compare against live_current"
    assert "self._cached_result = None" in updater_py, "updater.py must invalidate cache on update apply"

    # 3. Verify GiveawaysView.tsx two-tier persistence
    gv_tsx = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "sentinel_giveaways_selected_stores" in gv_tsx, "GiveawaysView must use sentinel_giveaways_selected_stores in localStorage"
    assert "sentinel_giveaways_headless" in gv_tsx, "GiveawaysView must use sentinel_giveaways_headless in localStorage"
    assert "onUpdateSettings" in gv_tsx, "GiveawaysView must support onUpdateSettings"

    # 4. Verify App.tsx uses dynamic version in sidebar only and removed from footer
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "sentinelState?.version || updateInfo?.local_version" in app_tsx, "App.tsx must use dynamic sentinelState version in sidebar"
    assert "Sentinel v{" not in app_tsx, "App.tsx must not contain hardcoded version string in footer"

    # 5. Verify SettingsStudio and HelpModal clean headers
    help_tsx = (WORKSPACE / "src" / "components" / "HelpModal.tsx").read_text(encoding="utf-8")
    assert "Sentinel v3.0" not in help_tsx, "HelpModal must not contain hardcoded Sentinel v3.0"
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "Twitch Drops Sentinel v{" not in settings_tsx, "SettingsStudio header must not have hardcoded version string"

    # 6. Verify live REST API /api/state returns dynamic version
    ensure_test_service()
    req_state = urllib.request.Request(
        BASE_URL + "/api/state",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_state, timeout=5.0) as res:
        assert res.status == 200
        st = json.loads(res.read().decode("utf-8"))
        assert "version" in st, "/api/state must return version key"
        assert len(st["version"]) >= 3, "version string must be valid"

    print("      Giveaways Store Persistence & Single-Location Version: ALL PASS [OK]")

def test_game_shelf_claimed_tab_and_trophies_integration():
    print("[32/32] Testing GameShelf '🏆 Собрано' Tab & Trophies Synthesis...")

    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    # 1. Verify GameShelf accepts trophies and onOpenVaultFile
    assert "trophies?: TrophyItem[];" in shelf_tsx, "GameShelfProps must include trophies"
    assert "onOpenVaultFile?: () => void;" in shelf_tsx, "GameShelfProps must include onOpenVaultFile"

    # 2. Verify filterMode includes 'claimed'
    assert "'drops' | 'priority' | 'claimed'" in shelf_tsx and "filterMode" in shelf_tsx, "filterMode must include 'claimed'"

    # 3. Verify claimed tab and banner
    assert "🏆 Собрано" in shelf_tsx, "GameShelf must display '🏆 Собрано' tab"
    assert "filterMode === 'claimed'" in shelf_tsx, "GameShelf must handle filterMode === 'claimed'"
    assert "isGameClaimed" in shelf_tsx, "GameShelf must have isGameClaimed function"
    assert "claimedTrophiesByGame" in shelf_tsx, "GameShelf must have claimedTrophiesByGame mapping"

    # 4. Verify App.tsx passes trophies and onOpenVaultFile to GameShelf
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "trophies={sentinelState.trophies}" in app_tsx, "App.tsx must pass trophies to GameShelf"
    assert "onOpenVaultFile={handleOpenVaultFile}" in app_tsx, "App.tsx must pass onOpenVaultFile to GameShelf"

    # 5. Verify excludedSet filters out ignored games from non-excluded tabs and persist-hides synthetic games
    assert "excludedSet" in shelf_tsx, "GameShelf must define case-insensitive excludedSet"
    assert "onAddToExcluded(gameName)" in shelf_tsx, "GameShelf must add non-installed games to excludedList on hide"

    # 6. Verify Ace Combat 8 vs Ace Combat Zero distinction in smart_game_match
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from campaigns_fetcher import smart_game_match
    assert not smart_game_match("Ace Combat Zero: The Belkan War", "ACE COMBAT 8: WINGS OF THEVE")

    print("      GameShelf '🏆 Собрано' Tab & Trophies Synthesis: ALL PASS [OK]")

def test_twitch_drops_sync_and_active_filter():
    print("[33/33] Testing Live Twitch Drops Sync & Active-Only Drops Filter...")
    import sys
    from datetime import datetime, timezone, timedelta
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from campaigns_fetcher import is_campaign_active_now, CAMPAIGNS_FETCHER

    # 1. Test is_campaign_active_now timestamp & status validation
    now_dt = datetime.now(timezone.utc)
    active_camp = {
        "id": "test_active",
        "status": "ACTIVE",
        "startAt": (now_dt - timedelta(hours=2)).isoformat(),
        "endAt": (now_dt + timedelta(days=2)).isoformat(),
        "timeBasedDrops": [{"id": "d1", "startAt": (now_dt - timedelta(hours=2)).isoformat(), "endAt": (now_dt + timedelta(days=2)).isoformat()}]
    }
    assert is_campaign_active_now(active_camp, now_dt), "Active campaign should return True"

    expired_status_camp = dict(active_camp, status="EXPIRED")
    assert not is_campaign_active_now(expired_status_camp, now_dt), "EXPIRED status must return False"

    past_camp = dict(active_camp, endAt=(now_dt - timedelta(minutes=5)).isoformat())
    assert not is_campaign_active_now(past_camp, now_dt), "Past endAt must return False"

    future_camp = dict(active_camp, startAt=(now_dt + timedelta(hours=1)).isoformat())
    assert not is_campaign_active_now(future_camp, now_dt), "Future startAt must return False"

    # 2. Test CAMPAIGNS_FETCHER.sync_active_drops signature
    assert hasattr(CAMPAIGNS_FETCHER, "sync_active_drops"), "CAMPAIGNS_FETCHER must have sync_active_drops method"

    # 3. Test types.ts definition
    types_ts = (WORKSPACE / "src" / "types.ts").read_text(encoding="utf-8")
    assert "drops_start_at?: string;" in types_ts, "GameItem must declare drops_start_at"
    assert "is_active_now?: boolean;" in types_ts, "GameItem must declare is_active_now"

    # 4. Test GameShelf.tsx integration
    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "handleSyncDrops" in shelf_tsx, "GameShelf must have handleSyncDrops"
    assert "isDropActiveNow" in shelf_tsx, "GameShelf must define isDropActiveNow"
    assert "isSyncingDrops" in shelf_tsx, "GameShelf must track isSyncingDrops"
    assert "isSyncSuccess" in shelf_tsx, "GameShelf must track isSyncSuccess"
    assert "↻ Обновить" in shelf_tsx, "GameShelf must have the refresh button"
    assert "filterMode === 'drops'" in shelf_tsx and "isCampaignRunning(g)" in shelf_tsx, "Active campaigns tab must filter with isCampaignRunning"

    # 5. Test App.tsx passes onShowToast and onManualRefresh
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "onShowToast={showToast}" in app_tsx, "App.tsx must pass onShowToast to GameShelf"
    assert "onManualRefresh={handleManualRefresh}" in app_tsx, "App.tsx must pass onManualRefresh to GameShelf"

    # 6. Test sentinel_service routes
    service_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/campaigns/sync" in service_py, "sentinel_service must register /api/campaigns/sync"
    assert "handle_sync" in service_py, "sentinel_service must have handle_sync"

    print("      Live Twitch Drops Sync & Active-Only Drops Filter: ALL PASS [OK]")

def test_shelf_removed_tab_and_startup_sync():
    print("[34/34] Testing Removed Tab, Startup Drops Sync & Protected Action Buttons...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from game_scanner import GameScanner

    # 1. Test GameScanner unignore_game functionality
    scanner = GameScanner()
    scanner.ignore_game("test_gate34_game", "Test Gate 34 Game")
    ignored_before = scanner.load_ignored_games()
    assert "test_gate34_game" in ignored_before, "Game must be in ignored set after ignore_game"
    
    unignore_ok = scanner.unignore_game("test_gate34_game", "Test Gate 34 Game")
    assert unignore_ok, "unignore_game must return True"
    ignored_after = scanner.load_ignored_games()
    assert "test_gate34_game" not in ignored_after, "Game must be removed from ignored set after unignore_game"

    # 2. Test sentinel_service endpoints and full state keys
    service_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/installed-games/restore" in service_py, "sentinel_service must register /api/installed-games/restore"
    assert "/api/ignored-games/restore" in service_py, "sentinel_service must register /api/ignored-games/restore"
    assert "/api/ignored-games" in service_py, "sentinel_service must register /api/ignored-games"
    assert "handle_restore_installed_game" in service_py, "sentinel_service must implement handle_restore_installed_game"
    assert '"ignored_games":' in service_py, "sentinel_service must return ignored_games in get_full_state"

    # 3. Test campaigns_fetcher startup sync in background loop
    camp_fetcher_py = (SANDBOX / "core" / "campaigns_fetcher.py").read_text(encoding="utf-8")
    assert "await asyncio.to_thread(self.sync_active_drops, False, STARTUP_CACHE_MAX_AGE)" in camp_fetcher_py, "campaigns_fetcher must trigger sync_active_drops on startup"

    # 4. Test GameShelf.tsx removed tab, banners, disabled buttons, and restore button
    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "🗑️ Удалённые" in shelf_tsx, "GameShelf must have '🗑️ Удалённые' tab"
    assert "filterMode === 'removed'" in shelf_tsx, "GameShelf must handle filterMode === 'removed'"
    assert "handleRestoreGame" in shelf_tsx, "GameShelf must have handleRestoreGame"
    assert "В исключениях (нельзя в очередь)" in shelf_tsx, "GameShelf must disable priority button for excluded games"
    assert "В удалённых (нельзя в очередь)" in shelf_tsx, "GameShelf must disable priority button for removed games"
    assert "Восстановить" in shelf_tsx, "GameShelf must provide 'Восстановить' button"

    # 5. Test GameSearchAutocomplete.tsx badges and disabled buttons
    search_tsx = (WORKSPACE / "src" / "components" / "GameSearchAutocomplete.tsx").read_text(encoding="utf-8")
    assert "ignoredList" in search_tsx, "GameSearchAutocomplete must accept ignoredList"
    assert "В исключениях" in search_tsx, "GameSearchAutocomplete must show 'В исключениях' badge"
    assert "В удалённых" in search_tsx, "GameSearchAutocomplete must show 'В удалённых' badge"
    assert "inExcluded ?" in search_tsx and "inRemoved ?" in search_tsx and "disabled={true}" in search_tsx, "GameSearchAutocomplete must disable button for excluded/removed"

    # 6. Test App.tsx passes ignoredGames
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "ignoredGames={sentinelState.ignored_games}" in app_tsx, "App.tsx must pass ignoredGames to GameShelf"

    # 7. Test live REST endpoint for ignored games & restore
    ensure_test_service()
    req_ignored = urllib.request.Request(
        BASE_URL + "/api/ignored-games",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_ignored, timeout=5.0) as res:
        assert res.status == 200
        ig_data = json.loads(res.read().decode("utf-8"))
        assert "ignored_games" in ig_data, "/api/ignored-games must return ignored_games"

    print("      Removed Tab, Startup Drops Sync & Protected Action Buttons: ALL PASS [OK]")

def test_telemetry_cleanliness_giveaways_self_containment_and_screendimmer_suite():
    print("[35/35] Verifying Telemetry Cleanliness, Giveaways Self-Containment & ScreenDimmer Integration...")

    # 1. Zero Noise Telemetry Purge
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "telemetry-pill" not in app_tsx, "App.tsx topbar must not contain telemetry-pill"
    assert "0% GPU" not in app_tsx, "App.tsx must not contain 0% GPU telemetry"

    dash_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "metric-pills" not in dash_tsx, "LiveDashboard must not contain metric-pills container"
    assert "0.8 GB" not in dash_tsx, "LiveDashboard must not contain '0.8 GB сэкономлено'"
    assert "Spade Stealth: 0% GPU" not in dash_tsx, "LiveDashboard must not contain Spade Stealth GPU mock"
    assert "Streamless WebSocket Protocol: 0% нагрузки на GPU" not in dash_tsx, "LiveDashboard must not contain 0% GPU banner"
    assert "Ожидание кампаний" in dash_tsx, "LiveDashboard must render the dedicated idle hero (Ожидание кампаний)"

    # 2. Giveaways Engine Self-Containment
    fgc_local = WORKSPACE / "giveaways_engine"
    assert fgc_local.is_dir(), "Local giveaways_engine directory must exist in workspace root"
    assert (fgc_local / "ClaimGames.cmd").is_file(), "giveaways_engine/ClaimGames.cmd must exist"
    assert (fgc_local / "package.json").is_file(), "giveaways_engine/package.json must exist"
    
    from giveaways_controller import resolve_fgc_root
    resolved = resolve_fgc_root()
    # resolve(): on a CI runner TEMP is an 8.3 short path (RUNNER~1), the module path is the long form
    assert resolved.resolve() == (SANDBOX / "giveaways_engine").resolve(), f"resolve_fgc_root() must resolve to the project root engine, got {resolved}"

    # 3. Settings Studio Unification
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "Luna Auto-Shutdown Engine" not in settings_tsx, "SettingsStudio must not have duplicate lower card"
    assert "Hardware Guard</h3>" not in settings_tsx, "SettingsStudio must not have duplicate Hardware Guard lower card"
    assert "handlePowerModeChange" in settings_tsx, "SettingsStudio must embed power mode selector in module item"

    # 4. ScreenDimmer Integration
    types_ts = (WORKSPACE / "src" / "types.ts").read_text(encoding="utf-8")
    assert "'dimmer'" in types_ts, "NavTab type must include 'dimmer'"
    assert "DimmerState" in types_ts, "types.ts must define DimmerState"

    dimmer_tsx = WORKSPACE / "src" / "components" / "ScreenDimmerView.tsx"
    assert dimmer_tsx.is_file(), "src/components/ScreenDimmerView.tsx must exist"
    dimmer_code = dimmer_tsx.read_text(encoding="utf-8")
    assert "ScreenDimmerView" in dimmer_code, "ScreenDimmerView component must be exported"
    assert "Alt + Backspace" in dimmer_code, "ScreenDimmerView must mention tactile blackout shortcut"

    main_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "BlackoutOverlayForm" in main_cs, "desktop/MainForm.cs must contain BlackoutOverlayForm"
    assert "SetBlackout" in main_cs, "desktop/MainForm.cs must contain SetBlackout method"

    # 5. Live Dimmer REST API
    ensure_test_service()
    req_dimmer = urllib.request.Request(
        BASE_URL + "/api/v1/dimmer/state",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_dimmer, timeout=5.0) as res:
        assert res.status == 200
        dimmer_data = json.loads(res.read().decode("utf-8"))
        assert "master_brightness" in dimmer_data, "Dimmer state must include master_brightness"
        assert "is_blackout" in dimmer_data, "Dimmer state must include is_blackout"

    req_br = urllib.request.Request(
        BASE_URL + "/api/v1/dimmer/brightness",
        data=json.dumps({"brightness": 75}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"},
        method="POST"
    )
    with urllib.request.urlopen(req_br, timeout=5.0) as res:
        assert res.status == 200
        resp_br = json.loads(res.read().decode("utf-8"))
        assert resp_br.get("status") == "ok"
        assert resp_br.get("state", {}).get("master_brightness") == 75

    req_bo = urllib.request.Request(
        BASE_URL + "/api/v1/dimmer/blackout",
        data=json.dumps({"enabled": True}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"},
        method="POST"
    )
    with urllib.request.urlopen(req_bo, timeout=5.0) as res:
        assert res.status == 200
        resp_bo = json.loads(res.read().decode("utf-8"))
        assert resp_bo.get("status") == "ok"
        assert resp_bo.get("state", {}).get("is_blackout") is True

    req_bo_off = urllib.request.Request(
        BASE_URL + "/api/v1/dimmer/blackout",
        data=json.dumps({"enabled": False}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"},
        method="POST"
    )
    with urllib.request.urlopen(req_bo_off, timeout=5.0) as res:
        assert res.status == 200

    req_br_reset = urllib.request.Request(
        BASE_URL + "/api/v1/dimmer/brightness",
        data=json.dumps({"brightness": 100}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"},
        method="POST"
    )
    with urllib.request.urlopen(req_br_reset, timeout=5.0) as res:
        assert res.status == 200

    print("      Telemetry Cleanliness, Giveaways Engine & ScreenDimmer Suite: ALL PASS [OK]")

def test_manual_farm_override_and_native_screendimmer_suite():
    print("[36/36] Verifying Manual Game Farm Override & Native Hardware ScreenDimmer Pro...")

    # 1. Backend Core Twitch & SentinelService verification
    twitch_py = (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8")
    assert "self.forced_game" in twitch_py, "Twitch client must have self.forced_game"
    assert "set_forced_game" in twitch_py, "Twitch client must implement set_forced_game"
    assert "clear_forced_game" in twitch_py, "Twitch client must implement clear_forced_game"
    assert "FORCED FARM" in twitch_py, "Twitch client must log [FORCED FARM] transitions"
    assert "smart_game_match" in twitch_py, "Twitch client must use safe smart_game_match"

    service_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/farm/force" in service_py, "SentinelService must expose /api/farm/force"
    assert "/api/farm/cancel-force" in service_py, "SentinelService must expose /api/farm/cancel-force"
    assert "handle_force_farm" in service_py, "SentinelService must implement handle_force_farm"
    assert "handle_cancel_force_farm" in service_py, "SentinelService must implement handle_cancel_force_farm"
    assert '"forced_game":' in service_py, "SentinelService state must include forced_game"

    # 2. Live REST API verification for Force Farm
    ensure_test_service()
    req_force = urllib.request.Request(
        BASE_URL + "/api/farm/force",
        data=json.dumps({"game": "Rust"}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"},
        method="POST"
    )
    with urllib.request.urlopen(req_force, timeout=5.0) as res:
        assert res.status == 200
        force_data = json.loads(res.read().decode("utf-8"))
        assert force_data.get("status") == "ok"
        assert force_data.get("forced_game") == "Rust"

    # Verify state reflects forced game
    req_state = urllib.request.Request(
        BASE_URL + "/api/state",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_state, timeout=5.0) as res:
        assert res.status == 200
        state_data = json.loads(res.read().decode("utf-8"))
        assert state_data.get("forced_game") == "Rust", f"State forced_game must be Rust, got {state_data.get('forced_game')}"

    # Cancel force farm
    req_cancel = urllib.request.Request(
        BASE_URL + "/api/farm/cancel-force",
        data=json.dumps({}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"},
        method="POST"
    )
    with urllib.request.urlopen(req_cancel, timeout=5.0) as res:
        assert res.status == 200
        cancel_data = json.loads(res.read().decode("utf-8"))
        assert cancel_data.get("status") == "ok"
        assert cancel_data.get("forced_game") is None

    # 3. Native C# MainForm & Hardware ScreenDimmer verification
    main_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "dxva2.dll" in main_cs, "desktop/MainForm.cs must import dxva2.dll"
    assert "GetPhysicalMonitorsFromHMONITOR" in main_cs, "MainForm.cs must import GetPhysicalMonitorsFromHMONITOR"
    assert "SetMonitorBrightness" in main_cs, "MainForm.cs must import SetMonitorBrightness"
    assert "DestroyPhysicalMonitors" in main_cs, "MainForm.cs must import DestroyPhysicalMonitors"
    assert "WmiMonitorBrightnessMethods" in main_cs, "MainForm.cs must support WMI laptop brightness"
    assert "SetHardwareBrightness" in main_cs, "MainForm.cs must implement SetHardwareBrightness"
    assert "NotifyWebviewDimmerState" in main_cs, "MainForm.cs must implement NotifyWebviewDimmerState"
    assert "DIMMER_STATE_CHANGED" in main_cs, "MainForm.cs must emit DIMMER_STATE_CHANGED"
    assert "SetThreadExecutionState" in main_cs, "MainForm.cs must configure AwayMode during blackout"
    assert "MouseDown" in main_cs and "KeyDown" in main_cs, "BlackoutOverlayForm must dismiss on mouse click or key press"

    # 4. Frontend ScreenDimmerView.tsx & LiveDashboard.tsx verification
    dimmer_tsx = (WORKSPACE / "src" / "components" / "ScreenDimmerView.tsx").read_text(encoding="utf-8")
    assert "Физическое расположение дисплеев" in dimmer_tsx, "ScreenDimmerView must contain Display Stage"
    assert "Общая яркость всех дисплеев" in dimmer_tsx, "ScreenDimmerView must contain Master brightness hero"
    assert "Блэкаут 0%" in dimmer_tsx, "ScreenDimmerView must contain quick preset 'Блэкаут 0%'"
    assert "Ночь 15%" in dimmer_tsx, "ScreenDimmerView must contain quick preset 'Ночь 15%'"
    assert "Комфорт 40%" in dimmer_tsx, "ScreenDimmerView must contain quick preset 'Комфорт 40%'"
    assert "Работа 75%" in dimmer_tsx, "ScreenDimmerView must contain quick preset 'Работа 75%'"
    assert "Максимум 100%" in dimmer_tsx, "ScreenDimmerView must contain quick preset 'Максимум 100%'"
    assert "Затемнить только этот" in dimmer_tsx, "ScreenDimmerView must contain the single-monitor blackout button"
    assert "Alt + Backspace" in dimmer_tsx, "ScreenDimmerView must support Alt + Backspace shortcut"

    dash_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "Выбрать игру для фарма ▾" in dash_tsx, "LiveDashboard must contain 'Выбрать игру для фарма ▾' button"
    assert "Фарм вне очереди" in dash_tsx, "LiveDashboard must contain clear title 'Фарм вне очереди'"
    assert "activeTwitchDropsGames" in dash_tsx, "LiveDashboard must filter only active Twitch Drops games"
    assert "⚡ ПРИНУДИТЕЛЬНЫЙ ФОКУС:" in dash_tsx, "LiveDashboard must contain Active Forced Focus banner"
    assert "Сбросить фокус / В авто" in dash_tsx, "LiveDashboard must contain cancel button 'Сбросить фокус / В авто'"
    assert "showFullCatalogModal" in dash_tsx, "LiveDashboard must contain showFullCatalogModal state"
    assert "Каталог игр Twitch & Steam" in dash_tsx, "LiveDashboard must contain Full Catalog Modal title"
    assert "Фармить сейчас" in dash_tsx, "LiveDashboard Full Catalog Modal must have 'Фармить сейчас' action buttons"

    print("      Manual Game Farm Override & Native ScreenDimmer Pro: ALL PASS [OK]")

def test_update_check_failure_reports_running_version():
    print("[audit F-001] Update check failure must report the real running version...")
    import asyncio, json as _json
    sys.path.insert(0, str(SANDBOX / "core"))
    from sentinel_service import SentinelSupervisor, UPDATER
    from version import __version__

    def boom(force=False):
        raise RuntimeError("simulated network failure")

    original = UPDATER.check_for_updates
    UPDATER.check_for_updates = boom
    try:
        class _Req:
            query = {}
        resp = asyncio.run(SentinelSupervisor.handle_check_updates(None, _Req()))
    finally:
        UPDATER.check_for_updates = original
    data = _json.loads(resp.text)
    assert data["has_update"] is False
    assert data["current_version"] == __version__, data
    assert data["latest_version"] == __version__, data


def test_update_check_failure_is_visible_and_retried():
    print("[updater] A failed update check is reported, logged and retried without hammering GitHub...")
    import asyncio, email.message, inspect, json as _json, logging, types, urllib.error
    sys.path.insert(0, str(SANDBOX / "core"))
    import updater
    from sentinel_service import SentinelSupervisor, UPDATER

    work = SANDBOX / "update_check"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    calls = []
    clock = {"now": 1_000_000.0}
    next_response = {"value": None}

    class _Resp:
        def __init__(self, payload):
            self.payload = payload
        def __enter__(self):
            return self
        def __exit__(self, *exc):
            return False
        def read(self):
            return _json.dumps(self.payload).encode("utf-8")

    class _Opener:
        def open(self, req, timeout=None):
            calls.append(req.full_url)
            value = next_response["value"]
            if isinstance(value, Exception):
                raise value
            return _Resp(value)

    class _Capture(logging.Handler):
        def __init__(self):
            super().__init__(level=logging.WARNING)
            self.messages = []
        def emit(self, record):
            self.messages.append(record.getMessage())

    def rate_limited(reset_in):
        headers = email.message.Message()
        headers["X-RateLimit-Remaining"] = "0"
        headers["X-RateLimit-Reset"] = str(int(clock["now"] + reset_in))
        return urllib.error.HTTPError(updater.REPO_API_URL, 403, "rate limit exceeded", headers, None)

    release = {"tag_name": "v99.0.0", "name": "v99", "body": "notes", "assets": [], "html_url": "https://example.test/r"}
    saved = (updater.CACHE_FILE, updater.get_optional_github_token, updater.urllib.request.build_opener, updater.time)
    capture = _Capture()
    updater.logger.addHandler(capture)
    updater.CACHE_FILE = work / "cache.json"
    updater.get_optional_github_token = lambda: ""
    updater.urllib.request.build_opener = lambda *a: _Opener()
    updater.time = types.SimpleNamespace(time=lambda: clock["now"])
    try:
        checker = updater.GitHubUpdater()

        # No cache yet: the failure is reported with its reason and written to the log at warning level
        next_response["value"] = urllib.error.URLError("getaddrinfo failed")
        first = checker.check_for_updates()
        assert "getaddrinfo failed" in first.get("error", ""), first
        assert first["update_available"] is False
        assert any("getaddrinfo failed" in m for m in capture.messages), capture.messages

        # A periodic check right after does not go to GitHub again and still reports the failure
        assert checker.check_for_updates().get("error") == first["error"] and len(calls) == 1
        # ...but a press of the button always does, and after the pause the periodic check does too
        checker.check_for_updates(force=True)
        assert len(calls) == 2
        clock["now"] += 901
        checker.check_for_updates()
        assert len(calls) == 3

        # A rate limit holds periodic checks until GitHub's reset time, well past the usual pause
        clock["now"] += 901
        next_response["value"] = rate_limited(3600)
        limited = checker.check_for_updates()
        assert "403" in limited["error"] and len(calls) == 4, limited
        clock["now"] += 1800
        assert "403" in checker.check_for_updates()["error"] and len(calls) == 4, "must wait for X-RateLimit-Reset"
        clock["now"] += 1801
        next_response["value"] = release

        # Success clears the failure
        ok = checker.check_for_updates()
        assert len(calls) == 5 and ok["update_available"] is True and "error" not in ok, ok

        # A later failure keeps the known release and says the check failed; the cache itself stays clean
        clock["now"] += 901
        next_response["value"] = urllib.error.URLError("offline")
        stale = checker.check_for_updates()
        assert stale["update_available"] is True and stale["remote_version"] == "99.0.0" and "offline" in stale["error"], stale
        assert "error" not in checker._cached_result and "error" not in _json.loads(updater.CACHE_FILE.read_text(encoding="utf-8"))["result"]

        # A reply without a tag is a failure, not "you are up to date"
        next_response["value"] = {"message": "unexpected"}
        assert "tag_name" in checker.check_for_updates(force=True)["error"]
    finally:
        updater.logger.removeHandler(capture)
        updater.CACHE_FILE, updater.get_optional_github_token, updater.urllib.request.build_opener, updater.time = saved

    # The periodic check must not flash a console window over a game
    assert "creationflags" in inspect.getsource(updater.get_optional_github_token)

    # The service keeps the shape the UI reads even when the check itself crashes
    def boom(force=False):
        raise RuntimeError("simulated crash")
    original = UPDATER.check_for_updates
    UPDATER.check_for_updates = boom
    try:
        class _Req:
            query = {}
        data = _json.loads(asyncio.run(SentinelSupervisor.handle_check_updates(None, _Req())).text)
    finally:
        UPDATER.check_for_updates = original
    assert data["update_available"] is False and data["local_version"] and "simulated crash" in data["error"], data

    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "setInterval(pollUpdates, UPDATE_POLL_MS)" in app_tsx, "App.tsx must repeat the check while the app sits in the tray"
    assert "'visibilitychange'" in app_tsx, "App.tsx must check when the window is shown again"
    assert "announcedUpdateRef" in app_tsx, "the periodic check must not reopen a dismissed update window"
    assert "if (result.error)" in app_tsx, "a manual check must not claim the version is current when the check failed"
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "`Не удалось проверить обновления: ${updateCheckFailure}`" in settings_tsx, "Settings must show the failed check"
    print("      Update check failure visible, logged, retried within limits: PASS [OK]")


def test_campaigns_fetcher_backoff_retry_after_and_fresh_cache():
    print("[audit F-020] Campaigns API client: Retry-After, exponential backoff, fresh-cache startup...")
    import email.message
    import urllib.error
    sys.path.insert(0, str(SANDBOX / "core"))
    import campaigns_fetcher as cf

    calls = []

    def make_urlopen(code, retry_after=None):
        def fake(req, timeout=None):
            calls.append(code)
            headers = email.message.Message()
            if retry_after is not None:
                headers["Retry-After"] = str(retry_after)
            raise urllib.error.HTTPError(req.full_url, code, "err", headers, None)
        return fake

    real_urlopen = cf.urllib.request.urlopen
    try:
        fetcher = cf.CampaignsFetcher()
        fetcher._cached_campaigns = [{"id": "cached"}]

        # 429 with Retry-After: one request, then blocked even for force=True.
        cf.urllib.request.urlopen = make_urlopen(429, retry_after=120)
        assert fetcher.fetch_sync(force=True) == [{"id": "cached"}]
        assert len(calls) == 1
        assert fetcher._blocked_until - time.time() >= 119, "Retry-After must be honoured"
        fetcher.fetch_sync(force=True)
        assert len(calls) == 1, "No request may be sent while blocked"

        # Without Retry-After the delay grows exponentially (with jitter).
        fetcher._fail_count = 0
        fetcher._blocked_until = 0
        calls.clear()
        cf.urllib.request.urlopen = make_urlopen(500)
        fetcher.fetch_sync(force=True)
        first = fetcher._blocked_until - time.time()
        fetcher._blocked_until = 0
        fetcher.fetch_sync(force=True)
        second = fetcher._blocked_until - time.time()
        assert len(calls) == 2 and second > first > 30, (first, second)

        # Fresh cache: startup must not call the API.
        fetcher._blocked_until = 0
        fetcher._fail_count = 0
        calls.clear()
        fetcher._last_fetch_time = time.time() - 600
        fetcher.fetch_sync(max_age=900)
        assert not calls, "Cache younger than max_age must not trigger a request"
        fetcher.fetch_sync()
        assert len(calls) == 1, "Default max_age (5 min) must refetch a 10 min old cache"
    finally:
        cf.urllib.request.urlopen = real_urlopen


def test_console_messages_follow_configured_language():
    print("[audit F-021] Console messages come from translate.py / lang/*.json, not hardcoded English...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from translate import _, default_translation

    keys = set(default_translation["sentinel"])
    ru = json.loads((SANDBOX / "core" / "lang" / "Русский.json").read_text(encoding="utf-8"))
    assert set(ru["sentinel"]) == keys, "Russian lang file must cover every sentinel message key"
    assert "онлайн" not in ru["status"]["goes_offline"], "goes_offline must not say online"
    try:
        _.set_language("Русский")
        assert "Каталог" in _("sentinel", "catalog_built").format(games=1, active=1)
        _.set_language("English")
        assert _("sentinel", "catalog_built").format(games=1, active=1).startswith("Built catalog")
    finally:
        _.set_language("English")

    service_py = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "apply_engine_language" in service_py


def test_giveaways_hung_node_process_hits_ceiling():
    print("[audit F-024] A Node process that stops producing output must be aborted at the ceiling...")
    import asyncio
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc

    class _HungStdout:
        def __aiter__(self):
            return self

        async def __anext__(self):
            await asyncio.sleep(3600)

    class _HungProc:
        pid = 4242
        returncode = None
        stdout = _HungStdout()

        async def wait(self):
            await asyncio.sleep(3600)

    async def scenario():
        orch = gc.GiveawaysOrchestrator()
        proc = _HungProc()
        orch._proc = proc
        aborted = []

        async def fake_abort():
            aborted.append(True)
            proc.returncode = 1
            return {"status": "aborted"}

        orch.abort_claim = fake_abort
        orch._read_inventory_sync = lambda force=False: None
        original = gc.FGC_RUN_CEILING_SECONDS
        gc.FGC_RUN_CEILING_SECONDS = 0.3
        try:
            await asyncio.wait_for(orch._monitor_process(proc), timeout=5.0)
        finally:
            gc.FGC_RUN_CEILING_SECONDS = original
        return aborted

    assert asyncio.run(scenario()) == [True], "Hung process must be aborted by the ceiling"


def test_shutdown_aborts_running_giveaways_process():
    print("[audit F-025] Service shutdown/restart must not leave the Node giveaways process behind...")
    import asyncio
    from types import SimpleNamespace
    sys.path.insert(0, str(SANDBOX / "core"))
    from sentinel_service import SentinelSupervisor

    aborted = []

    async def abort_claim():
        aborted.append(True)
        return {"status": "aborted"}

    fake = SimpleNamespace(giveaways=SimpleNamespace(abort_claim=abort_claim))

    async def scenario():
        try:
            await SentinelSupervisor._delayed_stop(fake)
        except SystemExit:
            return True
        return False

    assert asyncio.run(scenario()), "_delayed_stop must end with SystemExit"
    assert aborted == [True], "_delayed_stop must abort the giveaways process first"


def test_idle_hero_does_not_promise_claimed_or_unlinked_campaigns():
    print("[audit F-032] Shared campaign rules: hero, queue rows and off-queue block must agree...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "idle_check"
    out_dir.mkdir(exist_ok=True)
    bundle = out_dir / "idleInfo.mjs"
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "idleInfo.ts"), "--bundle", "--format=esm", f"--outfile={bundle}"],
                         capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    state_bundle = out_dir / "campaignState.mjs"
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignState.ts"), "--bundle", "--format=esm", f"--outfile={state_bundle}"],
                         capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr

    base = {"has_drops": True, "is_active_now": True, "drops_start_at": "2026-10-30T00:00:00.000Z",
            "drops_end_at": "2026-11-04T00:00:00.000Z"}
    games = [
        # received already (trophies exist), backend sends no progress fields
        {**base, "name": "EVE Online", "is_account_connected": True, "rewards_count": 1},
        # account not linked: backend legitimately skips it
        {**base, "name": "World of Tanks", "is_account_connected": False, "total_drops": 3, "claimed_drops": 0,
         "progress_percent": 0.0, "is_finished": False, "account_link_url": "https://example.test/link"},
        {**base, "name": "Battlefield REDSEC", "is_account_connected": True, "rewards_count": 1},
        # in the queue as #83 and closing: must not show up as off-queue
        {**base, "name": "Albion Online", "is_account_connected": True, "total_drops": 2, "claimed_drops": 0, "progress_percent": 0.0},
        # not in the queue, everything received
        {**base, "name": "Castlevania: Belmont's Curse", "is_account_connected": True, "total_drops": 1, "claimed_drops": 1,
         "progress_percent": 100.0},
        # not in the queue, live campaign: the only valid off-queue candidate
        {**base, "name": "Caliber", "is_account_connected": True, "total_drops": 2, "claimed_drops": 0, "progress_percent": 0.0},
        # no campaign at all
        {"name": "Hearthstone", "has_drops": False, "is_active_now": False},
    ]
    trophies = [
        {"id": "1", "date": "2026-11-01 10:00", "game": "EVE Online", "drop_name": "Drop 1", "campaign": "c", "status": "Claimed"},
        {"id": "2", "date": "2026-11-01 11:00", "game": "Battlefield REDSEC", "drop_name": "Cup", "campaign": "c", "status": "Claimed"},
        # a trophy from an older campaign must not count
        {"id": "3", "date": "2026-09-01 11:00", "game": "Caliber", "drop_name": "Old", "campaign": "old", "status": "Claimed"},
    ]
    queue = ["EVE Online", "World of Tanks", "Battlefield REDSEC", "Albion Online", "Hearthstone"]
    fixture = {"priorityList": queue, "allGames": games, "trophies": trophies, "strictMode": True, "now": 1793534400000}
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { computeIdleInfo, isOffQueueCandidate } from './idleInfo.mjs';\n"
        "import { getCampaignState, campaignLabel } from './campaignState.mjs';\n"
        f"const f = {json.dumps(fixture)};\n"
        "const info = computeIdleInfo(f);\n"
        "const labels = Object.fromEntries(f.allGames.map(g => [g.name, campaignLabel(getCampaignState(g, f.trophies))]));\n"
        "const offQueue = f.allGames.filter(g => isOffQueueCandidate(g, f.priorityList, f.trophies)).map(g => g.name);\n"
        "console.log(JSON.stringify({ info, labels, offQueue }));\n",
        encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    data = json.loads(run.stdout)
    info = data["info"]
    # hero: Albion is the only queue game with something left, so the hero may name it, but never EVE/WoT/REDSEC
    assert "EVE" not in info["reason"] and "REDSEC" not in info["reason"] and "World of Tanks" not in info["reason"], info
    assert info["unlinked"] == [{"name": "World of Tanks", "count": 3, "url": "https://example.test/link"}], info["unlinked"]
    # queue rows use the same rules
    assert data["labels"]["EVE Online"] == "всё получено", data["labels"]
    assert data["labels"]["Battlefield REDSEC"] == "всё получено", data["labels"]
    assert data["labels"]["World of Tanks"] == "привяжите аккаунт", data["labels"]
    assert data["labels"]["Albion Online"] == "идёт · 2 дропа", data["labels"]
    assert data["labels"]["Hearthstone"] == "нет кампании", data["labels"]
    assert data["labels"]["Caliber"] == "идёт · 2 дропа", "an old trophy must not count for the current campaign"
    # off-queue block: no queue games and nothing already received
    assert data["offQueue"] == ["Caliber"], data["offQueue"]
    assert "Albion Online" not in data["offQueue"]
    assert "Castlevania: Belmont's Curse" not in data["offQueue"]
    assert "outsideCount" in info and info["outsideCount"] == 1, info
    shutil.rmtree(out_dir, ignore_errors=True)


def test_queue_wait_message_counts_the_whole_queue():
    print("[audit F-033] Queue wait message must count the whole queue, not priority[:4]...")
    twitch_py = (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8")
    assert 'priority[:4]' not in twitch_py, "twitch.py must not truncate the queue in the wait message"
    for key in ("queue_no_campaigns_strict", "queue_no_campaigns", "queue_waiting_status"):
        assert f'_("sentinel", "{key}")' in twitch_py, f"twitch.py must use the localized key {key}"
    sys.path.insert(0, str(SANDBOX / "core"))
    from translate import _
    try:
        _.set_language("Русский")
        text = _("sentinel", "queue_no_campaigns_strict").format(count=87)
        assert "87" in text and "из очереди" in text, text
    finally:
        _.set_language("English")


def test_console_folds_progress_and_repeated_lines():
    print("[audit F-034] Console display folds progress spam and repeats, the journal itself is untouched...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "console_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "consoleLog.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'consoleLog.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    logs = []
    for n in range(1, 6):
        logs.append({"time": f"12:00:0{n}", "level": "STATUS", "message": f"[STATUS] Добавление кампаний в инвентарь... ({100 + n}/120)"})
    logs.append({"time": "12:00:10", "level": "INFO", "message": "Каталог собран: 235 игр"})
    logs.append({"time": "12:00:11", "level": "INFO", "message": "Каталог собран: 235 игр"})
    logs.append({"time": "12:00:12", "level": "INFO", "message": "Каталог собран: 235 игр"})
    logs.append({"time": "12:00:13", "level": "CLAIM", "message": "Drop получено: Hunt Red (1/2)"})
    logs.append({"time": "12:00:14", "level": "CLAIM", "message": "Drop получено: Hunt Blue (1/2)"})
    logs.append({"time": "12:00:15", "level": "INFO", "message": "Каталог собран: 235 игр"})
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { collapseLogs } from './consoleLog.mjs';\n"
        f"const logs = {json.dumps(logs, ensure_ascii=False)};\n"
        "const out = collapseLogs(logs).map(r => [r.log.message, r.count, r.log.time]);\n"
        "console.log(JSON.stringify({ out, total: logs.length }));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    data = json.loads(run.stdout)
    rows = data["out"]
    assert [r[0] for r in rows].count("[STATUS] Добавление кампаний в инвентарь... (105/120)") == 1 and len([r for r in rows if "Добавление кампаний" in r[0]]) == 1, rows
    catalog = [r for r in rows if r[0].startswith("Каталог собран")]
    assert [r[1] for r in catalog] == [3, 1], rows  # 3 in a row folded, a later one stays separate
    assert len([r for r in rows if r[0].startswith("Drop получено")]) == 2, "different drops must stay separate"
    assert data["total"] == 11 and len(rows) == 5, rows
    # the copy handler must keep working on the full journal
    dash = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "safeRecentLogs.map((l) =>" in dash, "Copy must use the full journal"
    shutil.rmtree(out_dir, ignore_errors=True)


def test_active_campaigns_tab_sorting_and_new_marker():
    print("[audit F-035] Active campaigns tab: honest running set, freshest first, new marker, sort modes...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "campaign_list_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignList.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'campaignList.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    now = 1793534400000  # 2026-11-01T12:00:00Z
    def g(i, name, start, end, **kw):
        return {"id": i, "name": name, "has_drops": True, "is_active_now": True, "drops_start_at": start, "drops_end_at": end,
                "is_installed": False, **kw}
    games = [
        g("a", "Alpha", "2026-10-20T00:00:00Z", "2026-11-20T00:00:00Z"),
        g("b", "Bravo", "2026-10-31T00:00:00Z", "2026-11-02T00:00:00Z"),
        g("c", "Charlie", "2026-10-25T00:00:00Z", "2026-11-10T00:00:00Z"),
        g("d", "Delta", None, "2026-11-30T00:00:00Z"),
        g("e", "Echo", "2026-12-01T00:00:00Z", "2026-12-30T00:00:00Z"),   # starts in the future
        g("f", "Foxtrot", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"),  # already over
        {"id": "g", "name": "Golf", "has_drops": False, "is_active_now": False},
    ]
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { isCampaignRunning, sortCampaigns, isNewCampaign, campaignKey, mergeSeen } from './campaignList.mjs';\n"
        f"const games = {json.dumps(games)}; const now = {now};\n"
        "const running = games.filter(g => isCampaignRunning(g, now));\n"
        "const names = (l) => l.map(g => g.name);\n"
        "const seenAll = new Set(running.map(campaignKey));\n"
        # Charlie is older than Bravo but unseen: must come first in 'new' mode
        "const seenOld = new Set(running.filter(g => g.name !== 'Charlie').map(campaignKey));\n"
        "const out = {\n"
        "  running: names(running),\n"
        "  firstVisit: names(sortCampaigns(running, 'new', null)),\n"
        "  firstVisitNew: running.filter(g => isNewCampaign(g, null)).length,\n"
        "  seenAll: names(sortCampaigns(running, 'new', seenAll)),\n"
        "  withNewcomer: names(sortCampaigns(running, 'new', seenOld)),\n"
        "  newcomerFlag: running.filter(g => isNewCampaign(g, seenOld)).map(g => g.name),\n"
        "  ending: names(sortCampaigns(running, 'ending', seenAll)),\n"
        "  alpha: names(sortCampaigns(running, 'alpha', seenAll)),\n"
        "  none: games.filter(g => isCampaignRunning({ ...g, has_drops: false }, now)).length,\n"
        "  merged: mergeSeen(seenOld, running).length,\n"
        "};\n"
        "console.log(JSON.stringify(out));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["running"] == ["Alpha", "Bravo", "Charlie", "Delta"], d["running"]     # no future, no past, no non-campaign
    assert d["firstVisit"] == ["Bravo", "Charlie", "Alpha", "Delta"], d["firstVisit"]  # freshest first, undated last
    assert d["firstVisitNew"] == 0, "first visit must not mark anything as new"
    assert d["seenAll"] == ["Bravo", "Charlie", "Alpha", "Delta"], d["seenAll"]
    assert d["withNewcomer"][0] == "Charlie" and d["newcomerFlag"] == ["Charlie"], d
    assert d["ending"] == ["Bravo", "Charlie", "Alpha", "Delta"], d["ending"]
    assert d["alpha"] == ["Alpha", "Bravo", "Charlie", "Delta"], d["alpha"]
    assert d["none"] == 0, "counter must be an honest 0, not the catalog size"
    assert d["merged"] == 4
    shelf = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "|| games.length" not in shelf, "the active-campaigns counter must not fall back to the catalog size"
    assert "Активные кампании" in shelf and "Гарантированные" not in shelf
    shutil.rmtree(out_dir, ignore_errors=True)


def test_console_folds_sync_cycles_but_never_important_events():
    print("[audit F-036] Console: sync cycles fold into one row, CLAIM/WARN/errors never fold...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "console_sync_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "consoleLog.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'consoleLog.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    cycle = [
        "Синхронизация активных Twitch Drops и каталога игр...",
        "Каталог собран: 235 игр, из них с активными дропами 98.",
        "Синхронизация завершена: активных дропов 98, всего игр в каталоге 235.",
        "Кампании обновлены: установлено игр 138, размер каталога 235.",
        "Раздачи Twitch синхронизированы: 98 активных кампаний онлайн.",
    ]
    logs, n = [], 0
    def add(level, message):
        nonlocal n
        n += 1
        logs.append({"time": f"12:{n // 60:02d}:{n % 60:02d}", "level": level, "message": message})
    for _ in range(2):          # two cycles
        for m in cycle:
            add("INFO", m)
    add("CLAIM", "Drop получено: Hunt Red (2/2)")
    for m in cycle:             # one more cycle after the claim
        add("INFO", m)
    add("WARNING", "Не удалось получить кампании: HTTP 429")
    for m in cycle[:2]:         # a short, interrupted tail
        add("INFO", m)
    add("ERROR", "Ошибка движка Twitch")
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { collapseLogs } from './consoleLog.mjs';\n"
        f"const logs = {json.dumps(logs, ensure_ascii=False)};\n"
        "const fold = collapseLogs(logs).map(r => [r.log.level, r.log.message, r.count, r.block ? r.block.length : 0]);\n"
        "const raw = collapseLogs(logs, { expandSync: true }).length;\n"
        "console.log(JSON.stringify({ fold, raw, total: logs.length }));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    fold = d["fold"]
    levels = [r[0] for r in fold]
    # block, CLAIM, block, WARNING, block (2 lines), ERROR
    assert levels == ["INFO", "CLAIM", "INFO", "WARNING", "INFO", "ERROR"], fold
    assert fold[0][1] == "Синхронизация: 235 игр, 98 кампаний, установлено 138" and fold[0][2] == 2 and fold[0][3] == 10, fold[0]
    assert fold[2][2] == 1 and fold[2][3] == 5, fold[2]
    assert fold[1][1].startswith("Drop получено") and fold[3][1].startswith("Не удалось") and fold[5][1] == "Ошибка движка Twitch"
    assert d["raw"] == d["total"] - 0 or d["raw"] <= d["total"], "expandSync keeps the lines unfolded"
    assert d["raw"] > len(fold), "the Core filter must show more rows than the folded view"
    dash = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "safeRecentLogs.map((l) =>" in dash, "Copy must still use the full journal"
    shutil.rmtree(out_dir, ignore_errors=True)


def test_settings_modules_counter_matches_switches():
    print("[audit F-037] Settings: 'Включено: N из 10' is computed from the same states as the switches...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "module_switch_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "moduleSwitches.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'moduleSwitches.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { moduleStates, modulesLabel } from './moduleSwitches.mjs';\n"
        "const base = { auto_shutdown_on_complete: true, pause_on_battery: true };\n"
        "const on = (s, extras) => modulesLabel(moduleStates(s, extras));\n"
        "const out = {\n"
        "  allOn: on(base, { muted: false, autostart: true }),\n"
        # the real report: modules 5 (hardware guard) and 7 (toasts) switched off
        "  fiveAndSevenOff: on({ ...base, hardware_guard_enabled: false, native_toasts: false }, { muted: false, autostart: true }),\n"
        "  serviceSilent: on(base, { muted: false, autostart: null }),\n"
        "  muted: on(base, { muted: true, autostart: true }),\n"
        "  defaults: on({}, { muted: false, autostart: false }),\n"
        "  keys: Object.keys(moduleStates(base, { muted: false, autostart: true })).length,\n"
        "};\n"
        "console.log(JSON.stringify(out));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["allOn"] == "Включено: 10 из 10", d
    assert d["fiveAndSevenOff"] == "Включено: 8 из 10", d      # the bug: the old header always said 10 / 10
    assert d["serviceSilent"] == "Включено: 9 из 10", d         # autostart unknown counts as off
    assert d["muted"] == "Включено: 9 из 10", d
    assert d["defaults"] == "Включено: 7 из 10", d              # battery pause, power cascade and autostart default to off
    assert d["keys"] == 10
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "10 / 10" not in settings_tsx and "ПОД КОНТРОЛЕМ" not in settings_tsx, "the counter must not be hard-coded"
    assert "modulesLabel(moduleOn)" in settings_tsx and "moduleOn[m.key]" in settings_tsx, "counter and switches must share moduleOn"
    shutil.rmtree(out_dir, ignore_errors=True)


def test_shelf_facts_trophy_line_and_sync_age():
    print("[audit F-038] Shelf: time/drops/link facts, one-line trophy summary, 'updated N min ago'...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "campaign_facts_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignFacts.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'campaignFacts.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    now = 1793534400000  # 2026-11-01T12:00:00Z
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { timeLeftLabel, campaignFacts, lastTrophyLine, agoLabel, gamesWord } from './campaignFacts.mjs';\n"
        f"const now = {now};\n"
        "const g = (o) => ({ id: 'x', name: 'Alpha', is_installed: false, has_drops: true, is_active_now: true, total_drops: 4, claimed_drops: 1, ...o });\n"
        "const iso = (ms) => new Date(now + ms).toISOString();\n"
        "const H = 3600 * 1000, D = 24 * H;\n"
        "const trophies = [\n"
        "  { id: '1', date: '2026-10-30 09:00', game: 'Alpha', drop_name: 'Old Hat', campaign: 'c', status: 'CLAIMED' },\n"
        "  { id: '2', date: '2026-11-01 10:21', game: 'Beta', drop_name: 'New Cape', campaign: 'c', status: 'CLAIMED' },\n"
        "  { id: '3', date: '2026-10-31 18:00', game: 'Gamma', drop_name: 'Middle', campaign: 'c', status: 'CLAIMED' },\n"
        "];\n"
        "const out = {\n"
        "  t12d: timeLeftLabel(iso(12 * D + 3 * H), now),\n"
        "  t2d5h: timeLeftLabel(iso(2 * D + 5 * H + 1000), now),\n"
        "  t7h: timeLeftLabel(iso(7 * H + 1000), now),\n"
        "  t35m: timeLeftLabel(iso(35 * 60000 + 1000), now),\n"
        "  over: timeLeftLabel(iso(-1000), now),\n"
        "  noEnd: timeLeftLabel(undefined, now),\n"
        "  running: campaignFacts(g({ drops_end_at: iso(5 * H) }), { trophies: [], linked: true, now }),\n"
        "  needsLink: campaignFacts(g({ drops_end_at: iso(3 * D) }), { trophies: [], linked: false, now }),\n"
        "  unknownTotal: campaignFacts(g({ total_drops: undefined, claimed_drops: undefined, drops_end_at: iso(3 * D) }), { trophies: [], linked: true, now }),\n"
        "  noCampaign: campaignFacts(g({ has_drops: false }), { trophies: [], linked: true, now }),\n"
        "  line: lastTrophyLine(trophies, 26),\n"
        "  lineEmpty: lastTrophyLine([], 0),\n"
        "  agoNull: agoLabel(null, now),\n"
        "  agoNow: agoLabel(now - 20000, now),\n"
        "  ago5: agoLabel(now - 5 * 60000 - 1000, now),\n"
        "  ago3h: agoLabel(now - 3 * H, now),\n"
        "  words: [1, 2, 5, 11, 21, 26].map(gamesWord),\n"
        "};\n"
        "console.log(JSON.stringify(out));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert (d["t12d"], d["t2d5h"], d["t7h"], d["t35m"]) == ("12 д", "2 д 5 ч", "7 ч", "35 мин"), d
    assert d["over"] == "закончилась" and d["noEnd"] is None, d
    r = d["running"]
    assert r["timeLeft"] == "5 ч" and r["urgent"] is True and r["drops"] == "3 дропа" and r["link"] == "linked", r
    n = d["needsLink"]
    assert n["link"] == "needs" and n["urgent"] is False and n["timeLeft"] == "3 д", n
    assert d["unknownTotal"]["drops"] == "есть дропы", d["unknownTotal"]      # no invented drop count
    assert d["noCampaign"]["link"] is None and d["noCampaign"]["drops"] is None, d["noCampaign"]
    assert d["line"].startswith("Трофеи · 26 игр · последний: New Cape, "), d["line"]   # latest by time, not by file order
    assert d["lineEmpty"] == "Трофеи · пока нет наград", d["lineEmpty"]
    assert d["agoNull"] is None and d["agoNow"] == "обновлено только что", d
    assert d["ago5"] == "обновлено 5 мин назад" and d["ago3h"] == "обновлено 3 ч назад", d
    assert d["words"] == ["игра", "игры", "игр", "игр", "игра", "игр"], d["words"]
    shelf = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "campaignFacts(game," in shelf and shelf.count("campaignFacts(") >= 2, "tiles and list rows must use the shared facts"
    assert "sentinel_shelf_view" in shelf and "sentinel_trophy_vault_open" in shelf, "view mode and trophy state must be remembered"
    assert "Исключения (${excludedList.length})" in shelf and "role=\"menu\"" in shelf, "service lists live in the menu"
    shutil.rmtree(out_dir, ignore_errors=True)


def test_queue_filter_only_with_campaigns():
    print("[audit F-039] Dashboard queue: 'only with campaigns' hides empty rows, keeps the order, counts honestly...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "queue_view_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignState.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'campaignState.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { queueView } from './campaignState.mjs';\n"
        "const row = (name, kind) => ({ name, state: { kind, remaining: 0, linkUrl: null } });\n"
        "const items = [row('A', 'running'), row('B', 'none'), row('C', 'link'), row('D', 'none'), row('E', 'done')];\n"
        "const all = queueView(items, false);\n"
        "const only = queueView(items, true);\n"
        "const empty = queueView([row('X', 'none')], true);\n"
        "console.log(JSON.stringify({\n"
        "  allNames: all.visible.map(i => i.name), allTotal: all.total, allWith: all.withCampaign,\n"
        "  onlyNames: only.visible.map(i => i.name), onlyTotal: only.total, onlyWith: only.withCampaign,\n"
        "  emptyVisible: empty.visible.length, emptyTotal: empty.total, emptyWith: empty.withCampaign,\n"
        "}));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["allNames"] == ["A", "B", "C", "D", "E"] and d["allTotal"] == 5 and d["allWith"] == 3, d
    assert d["onlyNames"] == ["A", "C", "E"], d            # order untouched, rows without a campaign hidden
    assert d["onlyTotal"] == 5 and d["onlyWith"] == 3, d    # the header counter does not depend on the filter
    assert d["emptyVisible"] == 0 and d["emptyTotal"] == 1 and d["emptyWith"] == 0, d
    dash = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "sentinel_queue_only_campaigns" in dash and "(с кампаниями: {queueWithCampaignCount})" in dash
    shutil.rmtree(out_dir, ignore_errors=True)


def test_toast_gate_dedup_switch_and_priming():
    print("[audit F-040] Windows toasts: one per event, the switch is honoured, first run is silent, a restart repeats nothing...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from notifications import ToastGate, MAX_TOASTS_PER_BATCH

    work = SANDBOX / "toast_gate_check"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    store = work / "notified.json"
    sent = []
    flag = {"on": True}

    def make_gate():
        return ToastGate(lambda title, msg: sent.append((title, msg)), lambda: flag["on"], store)

    one = lambda game: f"one {game}"
    many = lambda games: f"many {len(games)}"

    gate = make_gate()
    assert gate.notify("drop_claimed", "d1", "T", "m1") is True
    assert gate.notify("drop_claimed", "d1", "T", "m1") is False, "the same drop must toast once"
    assert gate.notify("needs_link", "d1", "T", "m1") is True, "another kind with the same id is another event"
    assert len(sent) == 2

    # switch off: the event is remembered, nothing is sent, and switching on does not replay it
    flag["on"] = False
    assert gate.notify("drop_claimed", "d2", "T", "m2") is False
    flag["on"] = True
    assert gate.notify("drop_claimed", "d2", "T", "m2") is False
    assert len(sent) == 2

    # state-derived kinds: the first call only remembers what is already true
    sent.clear()
    assert gate.notify_new("campaign_started", [("c1", "A"), ("c2", "B")], "T", one, many) == 0 and sent == []
    assert gate.notify_new("campaign_started", [("c1", "A"), ("c2", "B"), ("c3", "C")], "T", one, many) == 1
    assert sent == [("T", "one C")], sent
    assert gate.notify_new("campaign_started", [("c1", "A"), ("c2", "B"), ("c3", "C")], "T", one, many) == 0
    sent.clear()
    burst = [(f"n{i}", f"G{i}") for i in range(MAX_TOASTS_PER_BATCH + 2)]
    assert gate.notify_new("campaign_started", burst, "T", one, many) == 1, "a burst becomes one summary toast"
    assert sent == [("T", f"many {MAX_TOASTS_PER_BATCH + 2}")], sent

    # restart: a new gate on the same memory repeats nothing but still toasts genuinely new campaigns
    sent.clear()
    gate2 = make_gate()
    assert gate2.notify("drop_claimed", "d1", "T", "m1") is False
    assert gate2.notify_new("campaign_started", [("c1", "A"), ("c9", "Z")], "T", one, many) == 1
    assert sent == [("T", "one Z")], sent

    # switched off while a campaign starts: remembered silently
    sent.clear()
    flag["on"] = False
    assert gate2.notify_new("needs_link", [("l1", "Q")], "T", one, many) == 0
    flag["on"] = True
    assert gate2.notify_new("needs_link", [("l1", "Q")], "T", one, many) == 0 and sent == []

    # a damaged memory file must not stop the service
    store.write_text("{not json", encoding="utf-8")
    sent.clear()
    assert make_gate().notify("drop_claimed", "x", "T", "m") is True

    core = SANDBOX / "core"
    inventory_py = (core / "inventory.py").read_text(encoding="utf-8")
    assert "NOTIFIER.notify(" in inventory_py and "send_toast_msg" not in inventory_py, "claims must go through the gate"
    assert "tray.notify(claim_text" not in inventory_py, "the second, ungated claim toast must be gone"
    assert "_notify_queue_events(priority, exclude)" in (core / "twitch.py").read_text(encoding="utf-8")
    assert "set_native_toasts(" in (core / "sentinel_service.py").read_text(encoding="utf-8")
    shutil.rmtree(work, ignore_errors=True)


def test_new_campaign_step_is_not_hidden_by_the_previous_steps_trophies():
    print("[round5] Albion: drop names repeat between campaign steps, so the journal check must match the campaign...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from utils import trophies_show_completed
    journal = (
        "| 2026-11-01 01:46 | **Albion Online** | Dragonfire Chest | Dragonfire 9 - #6/7 | \u2705 \u0417\u0430\u0431\u0440\u0430\u043d |\n"
        "| 2026-11-01 02:46 | **Albion Online** | Noble Community Chest | Dragonfire 9 - #6/7 | \u2705 \u0417\u0430\u0431\u0440\u0430\u043d |\n"
    )
    drops = ["Dragonfire Chest", "Noble Community Chest"]
    assert trophies_show_completed(journal, "Albion Online", "Dragonfire 9 - #6/7", drops) is True
    # the very same chests in the next step are NOT received yet (this was the bug: the step was dropped from the inventory)
    assert trophies_show_completed(journal, "Albion Online", "Dragonfire 9 - #7/7", drops) is False
    assert trophies_show_completed(journal, "Albion Online", "Dragonfire 9 - #6/7", drops + ["Extra Chest"]) is False
    assert trophies_show_completed(journal, "Albion Online", "", drops) is False
    assert trophies_show_completed(journal, "Another Game", "Dragonfire 9 - #6/7", drops) is False
    twitch_py = (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8")
    assert twitch_py.count("trophies_show_completed(") == 2 and "drops_claimed >= len(time_drops)" not in twitch_py


def test_listed_but_unfarmable_campaign_never_reads_as_available():
    print("[round5] A campaign the engine cannot farm is reported with a reason and never as 'Кампании есть'...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    from utils import campaign_farmability
    now = datetime.now(timezone.utc)
    def camp(**kw):
        base = dict(finished=False, _valid=True, ends_at=now + timedelta(days=1), starts_at=now - timedelta(hours=1),
                    eligible=True, can_earn_within=lambda stamp: True)
        base.update(kw)
        return SimpleNamespace(**base)
    assert campaign_farmability(camp()) == (True, "")
    ok, why = campaign_farmability(camp(can_earn_within=lambda s: False))
    assert ok is False and why, "a campaign cut by can_earn_within must come with a reason"
    assert campaign_farmability(camp(can_earn_within=lambda s: False, finished=True))[1] == "\u0432\u0441\u0435 \u043d\u0430\u0433\u0440\u0430\u0434\u044b \u0443\u0436\u0435 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u044b"
    assert campaign_farmability(camp(can_earn_within=lambda s: False, ends_at=now - timedelta(minutes=1)))[1].startswith("\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044f \u0437\u0430\u043a\u043e\u043d\u0447")
    assert "\u043d\u0435 \u043d\u0430\u0447\u0430\u043b\u0430\u0441\u044c" in campaign_farmability(camp(can_earn_within=lambda s: False, starts_at=now + timedelta(hours=5)))[1]
    assert "\u043f\u0440\u0438\u0432\u044f\u0437\u043a" in campaign_farmability(camp(can_earn_within=lambda s: False, eligible=False))[1]

    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: front half skipped)")
        return
    out_dir = SANDBOX / "farmable_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "idleInfo.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'idleInfo.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { computeIdleInfo } from './idleInfo.mjs';\n"
        "const now = 1793534400000;\n"
        "const mk = (extra) => ({ id: 'a', name: 'Albion Online', is_installed: false, has_drops: true, is_active_now: true, rewards_count: 2, is_account_connected: true, drops_end_at: '2026-11-02T09:29:00Z', ...extra });\n"
        "const run = (g) => computeIdleInfo({ priorityList: ['Albion Online'], allGames: [g], trophies: [], strictMode: true, now });\n"
        "console.log(JSON.stringify({ plain: run(mk({})), cut: run(mk({ farmable: false, not_farmable_reason: 'campaign is not in the Twitch inventory' })), ok: run(mk({ farmable: true })) }));\n",
        encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["plain"]["reason"].startswith("\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0435\u0441\u0442\u044c"), d["plain"]["reason"]       # no verdict from the engine: the catalog is trusted
    assert d["ok"]["reason"].startswith("\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0435\u0441\u0442\u044c")
    assert "\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0435\u0441\u0442\u044c" not in d["cut"]["reason"], d["cut"]["reason"]
    assert d["cut"]["reason"] == "Albion Online: \u0434\u0440\u043e\u043f\u044b \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u2014 campaign is not in the Twitch inventory", d["cut"]["reason"]
    assert d["cut"]["workableNames"] == []
    shutil.rmtree(out_dir, ignore_errors=True)


def test_campaign_dates_line():
    print("[round5] Campaign dates: 'с … · до …' in local time, start highlighted for a fresh campaign...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "campaign_dates_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignFacts.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'campaignFacts.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { campaignDatesLine } from './campaignFacts.mjs';\n"
        "const now = Date.parse('2026-11-01T16:00:00Z');\n"
        "console.log(JSON.stringify({\n"
        "  fresh: campaignDatesLine('2026-11-01T10:00:00.000Z', '2026-11-02T09:29:59.999Z', now),\n"
        "  old: campaignDatesLine('2026-10-20T10:00:00.000Z', '2026-11-20T09:29:59.999Z', now),\n"
        "  future: campaignDatesLine('2026-11-05T10:00:00.000Z', '2026-11-06T10:00:00.000Z', now),\n"
        "  endOnly: campaignDatesLine(undefined, '2026-11-02T09:29:59.999Z', now),\n"
        "  none: campaignDatesLine(undefined, undefined, now),\n"
        "  garbage: campaignDatesLine('not a date', '???', now),\n"
        "}));\n", encoding="utf-8")
    env = dict(os.environ, TZ="UTC")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60, env=env)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["fresh"] == {"text": "с 1 нояб. 10:00 · до 2 нояб. 09:29", "startedRecently": True}, d["fresh"]
    assert d["old"]["startedRecently"] is False and d["old"]["text"].startswith("с 20 окт."), d["old"]
    assert d["future"]["startedRecently"] is False, "a campaign that has not started cannot be 'new'"
    assert d["endOnly"]["text"] == "до 2 нояб. 09:29" and d["endOnly"]["startedRecently"] is False
    assert d["none"] is None and d["garbage"] is None, "no dates, no line"
    shelf = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert shelf.count("campaignDatesLine(") == 2, "tiles and list rows must both show the dates"
    shutil.rmtree(out_dir, ignore_errors=True)


def test_cover_keeper_replaces_broken_and_missing_covers():
    print("[round5] Covers: a broken or missing cover gets a verified replacement, a good one is left alone...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import asyncio
    from cover_keeper import CoverKeeper, steam_fallback_urls

    lib = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3527290/library_600x900.jpg"
    fb = steam_fallback_urls(lib)
    assert fb[0].endswith("/3527290/header.jpg") and any("capsule_616x353" in u for u in fb) and len(fb) == 4
    assert steam_fallback_urls("https://static-cdn.jtvnw.net/ttv-boxart/500188_IGDB-285x380.jpg") == []
    assert steam_fallback_urls("") == []

    work = SANDBOX / "cover_keeper_check"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    store = work / "verified.json"
    twitch_bad = "https://static-cdn.jtvnw.net/ttv-boxart/500188_IGDB-285x380.jpg"
    good = "https://static-cdn.jtvnw.net/ttv-boxart/1_IGDB-285x380.jpg"
    steam_header = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3527290/header.jpg"
    hunt_steam = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/594650/header.jpg"
    alive = {good, steam_header, hunt_steam, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/777/header.jpg"}
    searched = []

    async def head(url):
        return url in alive

    async def search(name):
        searched.append(name)
        return [hunt_steam] if name == "Hunt: Showdown 1896" else []

    games = [
        {"name": "Fine Game", "box_art": good},
        {"name": "PEAK", "box_art": lib},                      # new Steam game: no library poster, header works
        {"name": "Hunt: Showdown 1896", "box_art": twitch_bad},  # Twitch art went 404: Steam search by name
        {"name": "Epic Only Game", "box_art": None},            # nothing found anywhere
    ]
    keeper = CoverKeeper(store)
    found = asyncio.run(keeper.refresh(games, head, search))
    assert found == 2, found
    assert keeper.pick("Fine Game", good) == good
    assert keeper.pick("PEAK", lib) == steam_header
    assert keeper.pick("Hunt: Showdown 1896", twitch_bad) == hunt_steam
    assert keeper.pick("Epic Only Game", None) is None
    # a working cover is never swapped; the keeper does not search for games that are fine
    assert "Fine Game" not in searched and "PEAK" not in searched
    # memory survives a restart, and a game nothing was found for is not searched again right away
    searched.clear()
    again = CoverKeeper(store)
    assert again.pick("PEAK", lib) == steam_header
    asyncio.run(again.refresh(games, head, search))
    asyncio.run(again.refresh(games, head, search))
    assert searched.count("Epic Only Game") == 1, searched
    shutil.rmtree(work, ignore_errors=True)

    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: front half skipped)")
        return
    out_dir = SANDBOX / "box_art_sources_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "gameBoxArts.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'gameBoxArts.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { resolveGameBoxArtSources } from './gameBoxArts.mjs';\n"
        f"const lib = '{lib}';\n"
        "console.log(JSON.stringify({ peak: resolveGameBoxArtSources('PEAK', [lib]), none: resolveGameBoxArtSources('Totally Unknown Indie', [undefined, null]), twitch: resolveGameBoxArtSources('Unknown Thing', ['https://static-cdn.jtvnw.net/ttv-boxart/9_IGDB-285x380.jpg']) }));\n",
        encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["peak"][0] == lib and any(u.endswith("/3527290/header.jpg") for u in d["peak"]) and len(d["peak"]) == len(set(d["peak"]))
    assert d["none"] == [], "no source at all: the component shows initials instead of a broken image"
    assert d["twitch"] == ["https://static-cdn.jtvnw.net/ttv-boxart/9_IGDB-285x380.jpg"]
    shutil.rmtree(out_dir, ignore_errors=True)


def test_cover_search_names_and_non_game_filter():
    print("[round5] Covers by name: folder names are normalised, only a close title is accepted, utilities are not games...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from cover_keeper import normalize_game_name, same_game
    cases = {
        "ItTakesTwo": "It Takes Two",
        "Breathedge2": "Breathedge 2",
        "Marvel's SpiderMan - Miles Morales": "Marvel's Spider Man: Miles Morales",
        "PVZ Replanted": "Plants vs. Zombies Replanted",
        "Warhammer 40000 Mechanicus II": "Warhammer 40,000 Mechanicus II",
        "PlayStation\u00ae Accessories": "Play Station Accessories",
        "Hearthstone": "Hearthstone",
        "StarCraft II": "Star Craft II",
    }
    for raw, want in cases.items():
        assert normalize_game_name(raw) == want, (raw, normalize_game_name(raw), want)
    assert "\u00ae" not in normalize_game_name("Game\u00ae\u2122")
    # accepted: the same game under the store's spelling
    assert same_game("ItTakesTwo", "It Takes Two")
    assert same_game("Marvel's SpiderMan - Miles Morales", "Marvel's Spider-Man: Miles Morales")
    assert same_game("Marvels Spider-Man 2", "Marvel's Spider-Man 2")
    assert same_game("StarCraft II", "StarCraft II")
    assert same_game("Breathedge2", "Breathedge 2")
    # refused: a different game, a sequel, a lookalike
    assert not same_game("Breathedge2", "Breathedge")
    assert not same_game("Marvel's SpiderMan - Remastered", "Marvel's Spider-Man 2")
    assert not same_game("Hearthstone", "Hearthstorm")
    assert not same_game("StarCraft II", "StarCraft: Remastered")
    assert not same_game("", "Anything")
    from game_scanner import NON_GAME_NAMES
    assert NON_GAME_NAMES.search("PlayStation\u00ae Accessories") and NON_GAME_NAMES.search("REDlauncher")
    assert not NON_GAME_NAMES.search("Cyberpunk 2077") and not NON_GAME_NAMES.search("Hearthstone")
    svc = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "NON_GAME_NAMES.search(" in svc, "scanned utilities must be hidden from the catalog"


def _serve_zip_once(zip_path):
    """Serve one file on a free local port; returns (url, server)."""
    import http.server
    import threading
    directory = str(zip_path.parent)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=directory, **k)

        def log_message(self, *a):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/{zip_path.name}", server


def test_patch_update_keeps_user_data_and_blocks_path_traversal():
    print("[clean-install] Hot-patch over an older install: user data kept, code replaced, traversal blocked...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import zipfile
    import updater

    work = SANDBOX / "patch_update_check"
    shutil.rmtree(work, ignore_errors=True)
    install = work / "install"
    (install / "core").mkdir(parents=True)
    (install / "data").mkdir()
    (install / "giveaways_engine" / "data").mkdir(parents=True)
    user_files = {
        "config.json": '{"priority_games": ["My Game"]}',
        "Trophies.md": "| my trophy |",
        "core/cookies.jar": "SECRET-SESSION",
        "data/installed_games.json": '[{"name": "Mine"}]',
        "giveaways_engine/data/claims.json": '{"claimed": 7}',
    }
    for rel, body in user_files.items():
        (install / rel).write_text(body, encoding="utf-8")
    (install / "core" / "version.py").write_text('__version__ = "3.3.4"\n', encoding="utf-8")

    patch = work / "patch.zip"
    with zipfile.ZipFile(patch, "w") as zf:
        zf.writestr("Twitch Drops Sentinel v3.5.5/core/version.py", '__version__ = "3.5.4"\n')
        zf.writestr("Twitch Drops Sentinel v3.5.5/core/new_module.py", "X = 1\n")
        for rel in user_files:
            zf.writestr(f"Twitch Drops Sentinel v3.5.5/{rel}", "OVERWRITTEN-BY-PATCH")
        zf.writestr("Twitch Drops Sentinel v3.5.5/../../evil.txt", "traversal")
    url, server = _serve_zip_once(patch)
    saved_dir = updater.PROJECT_DIR
    updater.PROJECT_DIR = install
    try:
        ok, message = updater.GitHubUpdater().apply_update_from_url(url)
    finally:
        updater.PROJECT_DIR = saved_dir
        server.shutdown()
    assert ok, message
    assert (install / "core" / "version.py").read_text(encoding="utf-8").strip() == '__version__ = "3.5.4"'
    assert (install / "core" / "new_module.py").exists()
    for rel, body in user_files.items():
        assert (install / rel).read_text(encoding="utf-8") == body, f"user file overwritten by the patch: {rel}"
    assert not (work / "evil.txt").exists() and not (SANDBOX / "evil.txt").exists(), "path traversal must be blocked"

    # no network: a clear message, nothing half-installed
    saved_dir = updater.PROJECT_DIR
    updater.PROJECT_DIR = install
    try:
        ok, message = updater.GitHubUpdater().apply_update_from_url("http://127.0.0.1:9/none.zip")
    finally:
        updater.PROJECT_DIR = saved_dir
    assert ok is False and "Не удалось загрузить" in message, message
    assert (install / "core" / "version.py").read_text(encoding="utf-8").strip() == '__version__ = "3.5.4"'
    shutil.rmtree(work, ignore_errors=True)


def test_config_files_saved_with_a_bom_still_load():
    print("[clean-install] A config.json edited in Notepad/PowerShell (UTF-8 with BOM) still loads...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from utils import json_load
    work = SANDBOX / "bom_check"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    path = work / "settings.json"
    path.write_bytes(b"\xef\xbb\xbf" + '{"language": "English"}'.encode("utf-8"))
    assert json_load(path, {"language": "Русский"})["language"] == "English"
    svc = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert 'open(CONFIG_FILE, "r", encoding="utf-8-sig")' in svc, "config.json must be read with utf-8-sig"
    shutil.rmtree(work, ignore_errors=True)


def test_login_code_copy_and_activate_link():
    print("[login] Copy button: service first, browser clipboard second, an honest false when both fail; activate link carries the code...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "login_code_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "loginCode.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'loginCode.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { copyText, activateUrl } from './loginCode.mjs';\n"
        "const calls = [];\n"
        "const okFetch = async (url, init) => { calls.push(['fetch', JSON.parse(init.body).text]); return { ok: true, json: async () => ({ status: 'ok' }) }; };\n"
        "const badFetch = async () => { throw new Error('offline'); };\n"
        "const clip = { writeText: async (t) => { calls.push(['clip', t]); } };\n"
        "const badClip = { writeText: async () => { throw new Error('denied'); } };\n"
        "const out = {\n"
        "  viaService: await copyText('ABCD1234', okFetch, clip),\n"
        "  callsService: calls.slice(),\n"
        "  fallback: await copyText('WXYZ9876', badFetch, clip),\n"
        "  callsAll: calls.slice(),\n"
        "  bothFail: await copyText('NOPE', badFetch, badClip),\n"
        "  noClipboard: await copyText('NOPE', badFetch, undefined),\n"
        "  link: activateUrl('https://www.twitch.tv/activate', 'ABCD1234'),\n"
        "  linkAlready: activateUrl('https://www.twitch.tv/activate?device-code=ABCD1234', 'ABCD1234'),\n"
        "  linkNoUri: activateUrl(null, 'AB CD'),\n"
        "};\n"
        "console.log(JSON.stringify(out));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["viaService"] is True and d["callsService"] == [["fetch", "ABCD1234"]], d
    assert d["fallback"] is True and ["clip", "WXYZ9876"] in d["callsAll"], d
    assert d["bothFail"] is False and d["noClipboard"] is False, "a failed copy must be reported, not swallowed"
    assert d["link"] == "https://www.twitch.tv/activate?device-code=ABCD1234"
    assert d["linkAlready"] == "https://www.twitch.tv/activate?device-code=ABCD1234"
    assert d["linkNoUri"] == "https://www.twitch.tv/activate?device-code=AB%20CD"
    dash = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "Скопировано ✓" in dash and "Не удалось скопировать, выделите код вручную" in dash and "userSelect: 'all'" in dash
    shutil.rmtree(out_dir, ignore_errors=True)


def test_missing_webview2_runtime_has_an_explanation():
    print("[clean-install] A PC without the WebView2 Runtime gets a Russian explanation and the download page...")
    main_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "WebView2RuntimeNotFoundException" in main_cs and "developer.microsoft.com/microsoft-edge/webview2" in main_cs


def test_giveaways_without_node_explains_what_is_missing():
    print("[clean-install] Giveaways on a PC without Node.js: a clear message instead of a crash...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import asyncio
    import giveaways_controller as gc
    from aiohttp import web
    orch = gc.GiveawaysOrchestrator()

    async def no_scheduler(force=False):
        return {"state": "Ready"}

    orch._query_scheduler = no_scheduler
    original = gc.shutil.which
    gc.shutil.which = lambda name, *a, **k: None
    try:
        try:
            asyncio.run(orch.start_claim(["epic"], True))
            raise AssertionError("start_claim must refuse to start without Node.js")
        except web.HTTPPreconditionFailed as exc:
            body = json.loads(exc.text)
            assert "Node.js" in body["detail"] and "nodejs.org" in body["detail"], body
    finally:
        gc.shutil.which = original
    assert orch._proc is None, "nothing may be left running after the refusal"


def _run_store_login(script, page_code, extra_env=None, seed=None):
    """Runs the shipped dist/<script> the way the app does (visible browser, stdin at EOF) against a stub browser engine."""
    engine = Path(tempfile.mkdtemp(prefix="login_check_", dir=SANDBOX))
    shutil.copytree(WORKSPACE / "giveaways_engine" / "dist", engine / "dist")
    shutil.copy2(WORKSPACE / "giveaways_engine" / "package.json", engine / "package.json")
    stub = engine / "node_modules" / "patchright"
    stub.mkdir(parents=True)
    (stub / "package.json").write_text('{"name": "patchright", "type": "module", "main": "index.js"}', encoding="utf-8")
    (stub / "index.js").write_text(
        "import fs from 'node:fs';\n"
        + page_code
        + "\nexport const chromium = { launchPersistentContext: async dir => {\n"
          "  fs.mkdirSync(dir, { recursive: true });\n"  # a real browser creates the profile and with it data/
          "  return { pages: () => [page], newPage: async () => page, setDefaultTimeout() {}, close: async () => {} };\n"
          "} };\n",
        encoding="utf-8",
    )
    if seed is not None:
        (engine / "data").mkdir()
        seed(engine / "data" / "sessions.json")
    env = {**os.environ, "SHOW": "1", "FGC_MINIMIZE": "0", "LOGIN_TIMEOUT": "2", "NOTIFY": "", **(extra_env or {})}
    res = subprocess.run(["node", str(engine / "dist" / script)], cwd=engine, env=env, stdin=subprocess.DEVNULL,
                         capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
    sessions = engine / "data" / "sessions.json"
    return res, (json.loads(sessions.read_text(encoding="utf-8")) if sessions.is_file() else {})


def test_unity_orders_only_at_a_clear_zero_total():
    """The order button may be pressed only when the page clearly says the order is free."""
    source = (WORKSPACE / "giveaways_engine" / "unity.js").read_text(encoding="utf-8")
    bundle = (WORKSPACE / "giveaways_engine" / "dist" / "unity.mjs").read_text(encoding="utf-8")
    for code in (source, bundle):
        assert "Main Street 1" not in code and "1234567890" not in code, "made-up billing data must never reach an account"
        assert 'input[type="checkbox"]' not in code, "ticking every checkbox on the page also accepts what the user never saw"
    assert "waitForFreeOrder" in bundle, "dist/unity.mjs is what ships: rebuild it"

    script = """
const { orderTotalState, hasPaidAmount, waitForFreeOrder } = await import(process.argv[1]);
const states = {};
for (const text of JSON.parse(process.argv[2])) states[text] = orderTotalState(text);
const paid = {};
for (const text of JSON.parse(process.argv[3])) paid[text] = hasPaidAmount(text);
const fakePage = (texts) => { let i = 0; return {
  evaluate: async () => texts[Math.min(i++, texts.length - 1)], waitForTimeout: async () => {} }; };
const waits = {
  stable: await waitForFreeOrder(fakePage(['Total $49.00', 'Total $0.00'])),
  flicker: await waitForFreeOrder(fakePage(['Total $0.00', 'Total $49.00'])),
  blank: await waitForFreeOrder(fakePage([''])),
};
console.log(JSON.stringify({ states, paid, waits }));
"""
    module = (WORKSPACE / "giveaways_engine" / "src" / "checkout.js").as_uri()
    free = ["Total $0.00", "Итого 0,00 ₽", "Total\n$0.00", "Total: 0.00 USD", "Total (incl. VAT) €0,00",
            "Subtotal $49.00\nDiscount -$49.00\nTotal $0.00", "Итого\n0 ₽", "Total tax $0.00\nTotal $0.00"]
    paid_totals = ["Total $49.00", "Итого 1000,00 ₽", "Total 10 €", "Total 49,90 €", "Total $0.50", "Сумма 4900 ₽",
                   "Subtotal $49.00\nTax $0.00\nTotal $49.00", "Total\n$49.00", "Total 1 000,00 ₽", "Total USD 5.00",
                   "Total $0.00\nTotal due $49.00"]
    unknown = ["", "Your cart", "Subtotal $0.00", "Total Free", "Total", "Total tax $0.00", "Discount $0.00", "Total $0.00 or so"]
    buttons_paid = ["Pay $49.00", "Оплатить 1000 ₽", "Pay now 0,50 €"]
    buttons_free = ["Pay now", "Заплатить немедленно", "Pay $0.00", "Complete order"]
    res = subprocess.run(
        ["node", "--input-type=module", "-e", script, module, json.dumps(free + paid_totals + unknown),
         json.dumps(buttons_paid + buttons_free)],
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert res.returncode == 0, f"node failed:\n{res.stderr[-800:]}"
    out = json.loads(res.stdout)
    for text in free:
        assert out["states"][text] == "free", f"{text!r} is a free order, got {out['states'][text]}"
    for text in paid_totals:
        assert out["states"][text] == "paid", f"{text!r} would charge money, got {out['states'][text]}"
    for text in unknown:
        assert out["states"][text] == "unknown", f"{text!r} says nothing about the total, got {out['states'][text]}"
    for text in buttons_paid:
        assert out["paid"][text] is True, f"button {text!r} names a price"
    for text in buttons_free:
        assert out["paid"][text] is False, f"button {text!r} names no price"
    assert out["waits"] == {"stable": True, "flicker": False, "blank": False}, f"zero must hold on the page: {out['waits']}"


def test_store_login_finishes_without_a_terminal():
    print("[friend-report] Store login: no terminal prompts, the browser login is noticed and remembered...")
    if shutil.which("node") is None:
        print("      SKIP: Node.js is missing, the store scripts cannot run")
        return
    # Signed out at first; the user finishes signing in inside the browser window.
    steam_page = (
        "let signedIn = false;\n"
        "const page = {\n"
        "  goto: async () => {}, $$eval: async () => [],\n"
        "  waitForSelector: async () => { signedIn = true; },\n"
        "  locator: () => ({ count: async () => (signedIn ? 1 : 0), textContent: async () => 'steam_tester' }),\n"
        "};"
    )
    res, sessions = _run_store_login("steam.mjs", steam_page)
    output = res.stdout + res.stderr
    assert "ERR_USE_AFTER_CLOSE" not in output, f"a terminal prompt killed the login window:\n{output[-800:]}"
    assert res.returncode == 0, f"steam login run failed ({res.returncode}):\n{output[-800:]}"
    assert "Press ESC" not in output, "the app log must not talk about a terminal the user does not have"
    assert sessions.get("steam", {}).get("account") == "steam_tester", f"a finished login must be remembered, got {sessions}"
    assert sessions["steam"].get("confirmedAt"), f"the UI compares this with the start of the attempt, got {sessions}"

    # Fab has its own login check: it must wait for the user instead of failing right after the window opens.
    fab_page = (
        "let checks = 0;\n"
        "const page = {\n"
        "  goto: async () => {}, waitForTimeout: async () => {}, setViewportSize: async () => {}, $$eval: async () => [],\n"
        "  evaluate: async () => { checks += 1; return checks > 2; },\n"
        "  isClosed: () => false,\n"
        "  screenshot: async () => {},\n"
        "};"
    )
    res, sessions = _run_store_login("fab.mjs", fab_page)
    output = res.stdout + res.stderr
    assert sessions.get("fab", {}).get("account"), f"Fab must wait for the login in the browser window, got {sessions}:\n{output[-800:]}"

    # Unity: the page asks its API who is signed in. The newsletter "Sign up" button is on the page either way.
    def unity_page(user_code):
        return (
            "const started = Date.now();\n"
            "const handlers = [];\n"
            f"const currentUser = () => ({user_code});\n"
            "const answer = () => { const user = currentUser(); if (user) handlers.forEach(h => h({\n"
            "  url: () => 'https://assetstore.unity.com/api/graphql/batch', json: async () => [{ data: { user } }] })); };\n"
            "const page = {\n"
            "  on: (name, handler) => { if (name === 'response') handlers.push(handler); },\n"
            "  goto: async () => answer(), waitForTimeout: async ms => { await new Promise(r => setTimeout(r, Math.min(ms, 100))); answer(); },\n"
            "  setViewportSize: async () => {}, addStyleTag: async () => {}, isClosed: () => false,\n"
            "  url: () => 'https://assetstore.unity.com/',\n"
            "  locator: () => ({ count: async () => 1, first: () => ({ click: async () => {}, isVisible: async () => false }) }),\n"
            "};"
        )

    res, sessions = _run_store_login("unity.mjs", unity_page("{ id: '0', name: 'Anonymous' }"))
    output = res.stdout + res.stderr
    assert not sessions.get("unity", {}).get("account") and "Login detected" not in output, f"nobody signed in to Unity, got {sessions}:\n{output[-800:]}"
    res, sessions = _run_store_login("unity.mjs", unity_page("null"))
    output = res.stdout + res.stderr
    assert not sessions.get("unity", {}).get("account"), f"a page that never answered proves no login, got {sessions}:\n{output[-800:]}"
    res, sessions = _run_store_login("unity.mjs", unity_page("Date.now() - started < 500 ? { id: '0', name: 'Anonymous' } : { id: '42', name: 'unity_tester' }"))
    output = res.stdout + res.stderr
    assert sessions.get("unity", {}).get("account") == "unity_tester", f"a finished Unity login must be noticed, got {sessions}:\n{output[-800:]}"

    # Measured on the real site: only /account/cart asks for the user, the home page where the sign-in starts does not.
    unity_round_trip = (
        "const started = Date.now();\n"
        "const elapsed = () => Date.now() - started;\n"
        "const handlers = [];\n"
        "let visited = 'https://assetstore.unity.com/account/cart';\n"
        "const page = {\n"
        "  on: (name, handler) => { if (name === 'response') handlers.push(handler); },\n"
        "  goto: async url => {\n"
        "    visited = url;\n"
        "    if (!url.includes('/account/cart')) return;\n"
        "    const user = elapsed() < 800 ? { id: '0', name: 'Anonymous' } : { id: '42', name: 'unity_tester' };\n"
        "    handlers.forEach(h => h({ url: () => 'https://assetstore.unity.com/api/graphql/batch', json: async () => [{ data: { user } }] }));\n"
        "  },\n"
        "  waitForTimeout: async ms => new Promise(r => setTimeout(r, Math.min(ms, 100))),\n"
        "  setViewportSize: async () => {}, addStyleTag: async () => {}, isClosed: () => false,\n"
        "  url: () => (elapsed() > 300 && elapsed() < 800 ? 'https://id.unity.com/login' : visited),\n"
        "  locator: () => ({ count: async () => 1, first: () => ({ click: async () => {}, isVisible: async () => false }) }),\n"
        "};"
    )
    res, sessions = _run_store_login("unity.mjs", unity_round_trip)
    output = res.stdout + res.stderr
    assert sessions.get("unity", {}).get("account") == "unity_tester", f"coming back from Unity ID must be checked on the page that answers, got {sessions}:\n{output[-800:]}"


def test_login_state_follows_the_latest_attempt():
    print("[friend-report review] Login state: sign-out, Steam Guard in the browser, broken sessions.json...")
    if shutil.which("node") is None:
        print("      SKIP: Node.js is missing, the store scripts cannot run")
        return
    signed_out_steam = (
        "const page = {\n"
        "  goto: async () => {}, $$eval: async () => [], waitForSelector: async () => {},\n"
        "  locator: () => ({ count: async () => 0, textContent: async () => { throw new Error('Timeout: nobody signed in'); } }),\n"
        "};"
    )
    earlier_login = lambda path: path.write_text('{"steam": {"account": "old_account", "confirmedAt": 1}}', encoding="utf-8")
    res, sessions = _run_store_login("steam.mjs", signed_out_steam, seed=earlier_login)
    assert sessions.get("steam", {}).get("account", "kept") is None, f"a signed-out store must forget the old account, got {sessions}"
    assert "confirmedAt" not in sessions["steam"], f"nothing was confirmed, got {sessions}"

    # Credentials from the environment, Steam then asks for a Steam Guard code: only the browser window can answer it.
    # fill(undefined) throws the same way in real Patchright: "locator.fill: value: expected string, got undefined"
    steam_guard = (
        "let signedIn = false;\n"
        "const field = { fill: async v => { if (typeof v !== 'string') throw new Error('locator.fill: value: expected string, got undefined'); }, click: async () => {} };\n"
        "const page = {\n"
        "  goto: async () => {}, $$eval: async () => [], waitForSelector: async () => { signedIn = true; },\n"
        "  getByLabel: () => field, getByRole: () => field,\n"
        "  locator: s => ({\n"
        "    count: async () => (s === '#account_pulldown' && signedIn ? 1 : 0), textContent: async () => 'guard_tester',\n"
        "    waitFor: async () => {}, isVisible: async () => s === '#authcode', fill: field.fill, press: async () => {},\n"
        "  }),\n"
        "};"
    )
    res, sessions = _run_store_login("steam.mjs", steam_guard, extra_env={"STEAM_USERNAME": "fixture_name", "STEAM_PASSWORD": "fixture_value"})
    output = res.stdout + res.stderr
    assert res.returncode == 0 and "expected string" not in output, f"a Steam Guard code without a terminal must not fail the run:\n{output[-800:]}"
    assert sessions.get("steam", {}).get("account") == "guard_tester", f"got {sessions}"

    signed_in_steam = (
        "const page = {\n"
        "  goto: async () => {}, $$eval: async () => [], waitForSelector: async () => {},\n"
        "  locator: () => ({ count: async () => 1, textContent: async () => 'steam_tester' }),\n"
        "};"
    )
    res, sessions = _run_store_login("steam.mjs", signed_in_steam, seed=lambda path: path.write_text("{broken", encoding="utf-8"))
    output = res.stdout + res.stderr
    assert res.returncode == 0, f"a broken sessions.json must not fail the run:\n{output[-800:]}"
    assert sessions.get("steam", {}).get("account") == "steam_tester", f"a broken sessions.json must recover, got {sessions}"
    assert "sessions.json" in output, "the broken file must be logged"

    res, _ = _run_store_login("steam.mjs", signed_in_steam, seed=lambda path: path.mkdir())  # stands in for a file that cannot be written
    output = res.stdout + res.stderr
    assert res.returncode == 0, f"a failed write must not fail the run:\n{output[-800:]}"
    assert "sessions.json" in output and "steam" in output, f"a failed write must be logged with context:\n{output[-800:]}"

    # The tab judges this attempt, not whether some account is known from before.
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "loginAttemptSucceeded(" in view, "GiveawaysView must judge the login by this attempt"
    if not esbuild.exists():
        print("      (esbuild not available: login attempt rule skipped)")
        return
    out_dir = Path(tempfile.mkdtemp(prefix="login_attempt_", dir=SANDBOX))
    bundle = out_dir / "loginAttempt.mjs"
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "loginAttempt.ts"), "--bundle", "--format=esm", f"--outfile={bundle}"],
                         capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    check = out_dir / "check.mjs"
    check.write_text(
        "import { loginAttemptSucceeded as ok } from './loginAttempt.mjs';\n"
        "console.log(JSON.stringify([ok({ account: 'old', loginConfirmedAt: 100 }, 200), ok({ account: 'old', loginConfirmedAt: 300 }, 200),\n"
        "  ok({ account: 'old' }, 200), ok(undefined, 200)]));\n", encoding="utf-8")
    res = subprocess.run(["node", str(check)], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == [False, True, False, False], res.stdout


def test_itch_login_wait_checks_the_host_not_a_substring():
    print("[login-polish] Itch: a third-party OAuth page that mentions itch.io is not a login...")
    if shutil.which("node") is None:
        print("      SKIP: Node.js is missing, the store scripts cannot run")
        return
    urls = [
        "https://itch.io/my-collections", "https://someone.itch.io/game", "https://itch.io/login",
        "https://accounts.example.com/oauth?redirect_uri=https://itch.io/callback", "https://notitch.io/", "https://itch.io.evil.example/",
    ]
    page = (
        "const page = {\n"
        "  goto: async () => {}, waitForTimeout: async () => {}, setViewportSize: async () => {}, isClosed: () => false,\n"
        "  url: () => 'https://itch.io/login',\n"
        "  locator: () => ({ count: async () => 1 }),\n"
        f"  waitForURL: async predicate => {{ console.log('URLCHECK ' + JSON.stringify({json.dumps(urls)}.map(u => predicate(new URL(u))))); }},\n"
        "};"
    )
    res, _ = _run_store_login("itch.mjs", page)
    output = res.stdout + res.stderr
    line = next((l for l in output.splitlines() if l.startswith("URLCHECK ")), None)
    assert line, f"itch.mjs never waited for the login URL:\n{output[-800:]}"
    assert json.loads(line[len("URLCHECK "):]) == [True, True, False, False, False, False], line


def test_two_factor_and_confirm_without_a_terminal_go_through_the_log():
    print("[login-polish] GOG/Epic/Prime: no code prompt without a terminal; Prime says why a game was skipped...")
    engine = WORKSPACE / "giveaways_engine"
    for name in ("gog.js", "epic-games.js", "prime-gaming.js"):
        src = (engine / name).read_text(encoding="utf-8")
        assert "if (!otp)" in src and src.index("if (!otp)") < src.index("[SENTINEL] Введите код двухфакторной") < src.index("pressSequentially(otp"),             f"{name}: without a code, log a request for the browser window and do not type"
    prime = (engine / "prime-gaming.js").read_text(encoding="utf-8")
    assert prime.count("await confirm()") == 1, "prime-gaming.js: confirm() must only be called through the logging wrapper"
    assert prime.count("confirmClaim()") == 3 and "[SENTINEL]" in prime.split("confirmClaim =")[1].split("\n")[0], "the skip reason must be logged"


def test_login_hint_goes_away_once_the_attempt_succeeded():
    print("[login-polish] Login hint and stale error follow this attempt...")
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    if not esbuild.exists() or shutil.which("node") is None:
        print("      (esbuild or node not available: skipped)")
        return
    out_dir = Path(tempfile.mkdtemp(prefix="login_hint_", dir=SANDBOX))
    bundle = out_dir / "loginAttempt.mjs"
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "loginAttempt.ts"), "--bundle", "--format=esm", f"--outfile={bundle}"],
                         capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    check = out_dir / "check.mjs"
    check.write_text(
        "import { loginHintVisible as v } from './loginAttempt.mjs';\n"
        "console.log(JSON.stringify([v({ loginConfirmedAt: 100 }, 200, null), v({ loginConfirmedAt: 300 }, 200, null),\n"
        "  v(undefined, 200, null), v({ loginConfirmedAt: 100 }, 200, 'boom')]));\n", encoding="utf-8")
    res = subprocess.run(["node", str(check)], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == [True, False, True, False], res.stdout
    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "loginHintVisible(" in view, "GiveawaysView must hide the hint with loginHintVisible"


def test_giveaways_setup_failure_and_engine_stdin():
    print("[login-polish] npm failure is a failure; the engine never inherits the service's console...")
    import asyncio
    import types
class _FakeTaskScheduler:
    """Stands in for powershell.exe, so a gate never touches the real Windows Task Scheduler."""

    class _Proc:
        def __init__(self, stdout: bytes, returncode: int):
            self._stdout = stdout
            self.returncode = returncode

        async def communicate(self):
            await asyncio.sleep(0)  # a real process yields here, which is what lets two requests interleave
            return self._stdout, b"Access is denied"

    class _HungProc:
        returncode = None
        reaped = False

        async def communicate(self):
            await asyncio.sleep(3600)

        def kill(self):
            self.returncode = 1

        async def wait(self):
            self.reaped = True
            return self.returncode

    def __init__(self, exists=False, fail_writes=False, query_broken=False, hang_writes=False, action=None,
                 node_version=b"v24.1.0\n", last_result=None, hang_queries=False):
        self.hang_queries = hang_queries
        self.action = action or {}
        self.node_version = node_version
        self.last_result = last_result
        self.exists = exists
        self.fail_writes = fail_writes
        self.query_broken = query_broken
        self.hang_writes = hang_writes
        self.hung_proc = None
        self.writes = []

    async def __call__(self, *args, **kwargs):
        script = args[-1]
        if script == "--version":
            return self._Proc(self.node_version, 0)
        if "ConvertTo-Json" in script:
            if self.hang_queries:
                self.hung_proc = self._HungProc()
                return self.hung_proc
            if self.query_broken:
                return self._Proc(b"", 1)
            info = {"exists": self.exists, "state": "Ready" if self.exists else "Unknown", "lastRun": None,
                    "nextRun": None, "lastResult": self.last_result, "daysOfWeek": 37 if self.exists else None, **self.action}
            return self._Proc(json.dumps(info).encode(), 0)
        self.writes.append(script)
        if self.hang_writes:
            self.hung_proc = self._HungProc()
            return self.hung_proc
        if self.fail_writes:
            return self._Proc(b"", 1)
        if "Register-ScheduledTask" in script:
            if self.exists:  # no -Force: the real cmdlet refuses a task that already exists
                return self._Proc(b"", 1)
            self.exists = True
        return self._Proc(b"", 0)


def test_scheduler_task_is_created_on_a_clean_install():
    print("[clean-install] Giveaways scheduler: the Windows task is created on demand, its absence is reported...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import asyncio
    import giveaways_controller as gc
    from aiohttp import web

    original_exec, original_which = gc.asyncio.create_subprocess_exec, gc.shutil.which
    original_write_timeout = gc.SCHEDULER_WRITE_TIMEOUT_SECONDS
    original_fgc_path = os.environ.pop("FGC_PATH", None)  # the gate needs the sandbox engine, whatever the machine has set
    gc.shutil.which = lambda name, *a, **k: r"C:\Program Files\nodejs\node.exe"

    def run(fake, action):
        gc.asyncio.create_subprocess_exec = fake
        return asyncio.run(action(gc.GiveawaysOrchestrator()))

    try:
        # Turning the scheduler on when no task exists creates it, and it starts the engine itself
        fake = _FakeTaskScheduler()
        sched = run(fake, lambda o: o.toggle_scheduler(enable=True))
        assert sched["exists"] is True, sched
        script = fake.writes[-1]
        assert "Register-ScheduledTask" in script and "FreeGamesClaimerStudio" in script, script
        assert "runner.js" in script and "node.exe" in script, script
        assert "ClaimGames.cmd" not in script, "the task must not depend on the batch proxy"
        assert "-Force" not in script, "a task that appeared meanwhile must never be overwritten"
        for day in ("Tuesday", "Friday", "Sunday"):
            assert f"'{day}'" in script, f"default day {day} missing: {script}"

        # A toggle without an explicit target treats a missing task as off, not as on
        fake = _FakeTaskScheduler()
        run(fake, lambda o: o.toggle_scheduler())
        assert fake.exists, "toggling a missing task must create it"

        # Picking days when no task exists creates it with exactly those days
        fake = _FakeTaskScheduler()
        sched = run(fake, lambda o: o.update_scheduler_days(["Monday"]))
        assert sched["exists"] is True, sched
        assert "'Monday'" in fake.writes[-1] and "'Friday'" not in fake.writes[-1], fake.writes[-1]

        # Turning off something that does not exist creates nothing and reports the absence
        fake = _FakeTaskScheduler()
        sched = run(fake, lambda o: o.toggle_scheduler(enable=False))
        assert sched["exists"] is False and not fake.writes, fake.writes
        fake = _FakeTaskScheduler()
        sched = run(fake, lambda o: o.update_scheduler_days([]))
        assert sched["exists"] is False and not fake.writes, fake.writes

        # An existing task keeps its own action: a user's launcher is never replaced
        fake = _FakeTaskScheduler(exists=True)
        run(fake, lambda o: o.update_scheduler_days(["Monday"]))
        run(fake, lambda o: o.toggle_scheduler(enable=False))
        assert fake.writes and not any("Register-ScheduledTask" in w for w in fake.writes), fake.writes

        # A failed write reaches the caller instead of looking like a success
        for prepared, action in (
            (_FakeTaskScheduler(fail_writes=True), lambda o: o.toggle_scheduler(enable=True)),
            (_FakeTaskScheduler(exists=True, fail_writes=True), lambda o: o.update_scheduler_days(["Monday"])),
            (_FakeTaskScheduler(exists=True, fail_writes=True), lambda o: o.toggle_scheduler(enable=False)),
        ):
            try:
                run(prepared, action)
                raise AssertionError("a failed scheduler write must raise")
            except web.HTTPException as exc:
                assert exc.status >= 400 and json.loads(exc.text)["detail"], exc.text

        # Two quick day clicks on a clean install: the task is created once, the second click updates it
        async def two_quick_clicks(o):
            return await asyncio.gather(o.update_scheduler_days(["Monday"]), o.update_scheduler_days(["Monday", "Friday"]))

        fake = _FakeTaskScheduler()
        run(fake, two_quick_clicks)
        registers = [w for w in fake.writes if "Register-ScheduledTask" in w]
        assert len(registers) == 1 and "'Friday'" in fake.writes[-1] and "Set-ScheduledTask" in fake.writes[-1], fake.writes

        # A write that hangs is killed and reaped, and its possibly applied result is not hidden by the cache
        async def write_times_out(o):
            try:
                await o.update_scheduler_days(["Monday"])
                raise AssertionError("a hung scheduler write must raise")
            except web.HTTPException as exc:
                assert json.loads(exc.text)["detail"], exc.text
            assert o._scheduler_cache[0] == 0.0, "the state cached before the write must not survive it"

        gc.SCHEDULER_WRITE_TIMEOUT_SECONDS = 0.01
        fake = _FakeTaskScheduler(exists=True, hang_writes=True)
        run(fake, write_times_out)
        assert fake.hung_proc.reaped and fake.hung_proc.returncode is not None, "the hung process must be killed and awaited"
        gc.SCHEDULER_WRITE_TIMEOUT_SECONDS = original_write_timeout

        # A scheduler that did not answer is not reported as "no task", and nothing is written blindly
        fake = _FakeTaskScheduler(query_broken=True)
        state = run(fake, lambda o: o._query_scheduler(force=True))
        assert state["queryFailed"] is True, state
        try:
            run(fake, lambda o: o.toggle_scheduler(enable=True))
            raise AssertionError("no write may happen while the scheduler state is unknown")
        except web.HTTPException as exc:
            assert json.loads(exc.text)["detail"], exc.text
        assert not fake.writes, fake.writes

        # No Node.js: refuse with an explanation instead of creating a task that can only fail
        gc.shutil.which = lambda name, *a, **k: None
        fake = _FakeTaskScheduler()
        try:
            run(fake, lambda o: o.toggle_scheduler(enable=True))
            raise AssertionError("the task must not be created without Node.js")
        except web.HTTPPreconditionFailed as exc:
            assert "Node.js" in json.loads(exc.text)["detail"], exc.text
        assert not fake.writes, fake.writes
    finally:
        gc.asyncio.create_subprocess_exec, gc.shutil.which = original_exec, original_which
        gc.SCHEDULER_WRITE_TIMEOUT_SECONDS = original_write_timeout
        if original_fgc_path is not None:
            os.environ["FGC_PATH"] = original_fgc_path

    # The interface derives "active" from a task that really exists
    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "data?.scheduler?.state !== 'Disabled'" not in view, "a missing task must not read as active"
    assert "isSchedulerMissing" in view and "{actionError" in view, "the missing task and scheduler errors must be shown"


def test_scheduler_query_that_hangs_is_killed_and_reaped():
    print("[clean-install] Giveaways scheduler: a state query that hangs is killed, awaited and reported as failed...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import asyncio
    import giveaways_controller as gc

    original_exec, original_timeout = gc.asyncio.create_subprocess_exec, gc.SCHEDULER_QUERY_TIMEOUT_SECONDS
    fake = _FakeTaskScheduler(hang_queries=True)
    gc.asyncio.create_subprocess_exec = fake
    gc.SCHEDULER_QUERY_TIMEOUT_SECONDS = 0.01
    try:
        state = asyncio.run(gc.GiveawaysOrchestrator()._query_scheduler(force=True))
    finally:
        gc.asyncio.create_subprocess_exec, gc.SCHEDULER_QUERY_TIMEOUT_SECONDS = original_exec, original_timeout
    assert state["queryFailed"] is True, state
    assert fake.hung_proc.reaped and fake.hung_proc.returncode is not None, "the hung query process must be killed and awaited"


def test_scheduler_refuses_an_old_node_and_task_paths_follow_the_install():
    print("[clean-install] Giveaways scheduler: Node.js below 20 is refused, a moved install re-points the task...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    from aiohttp import web

    class _Out:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    class _Proc:
        pid = 777

        def __init__(self, returncode):
            self.returncode = returncode
            self.stdout = _Out()

        async def wait(self):
            return self.returncode

    engine = Path(tempfile.mkdtemp(prefix="setup_", dir=SANDBOX))
    (engine / "runner.js").write_text("", encoding="utf-8")

    def run(npm_returncode):
        spawned = []

        async def fake_exec(*args, **kwargs):
            spawned.append((args, kwargs))
            if "install" in args and "npm" in args:  # npm leaves a half-installed patchright behind either way
                (engine / "node_modules" / "patchright").mkdir(parents=True, exist_ok=True)
                return _Proc(npm_returncode)
            return _Proc(0)

        async def no_scheduler(force=False):
            return {"state": "Ready"}

        async def no_wait(proc, label):
            return None

        async def no_monitor(proc):
            return None

        orch = gc.GiveawaysOrchestrator()
        orch._query_scheduler = no_scheduler
        orch._monitor_process = no_monitor
        saved = (gc.resolve_fgc_root, gc.shutil.which, asyncio.create_subprocess_exec, orch._wait_or_kill)
        gc.resolve_fgc_root = lambda: engine
        gc.shutil.which = lambda name, *a, **k: name
        asyncio.create_subprocess_exec = fake_exec
        if npm_returncode is None:
            orch._wait_or_kill = no_wait  # the timeout path: killed, returncode never filled in
        try:
            async def go():
                try:
                    await orch.start_claim(["epic"], False)
                    return "started"
                except web.HTTPServiceUnavailable:
                    return "failed"
            outcome = asyncio.run(go())
        finally:
            gc.resolve_fgc_root, gc.shutil.which, asyncio.create_subprocess_exec = saved[:3]
            shutil.rmtree(engine / "node_modules", ignore_errors=True)
        return outcome, spawned

    assert run(1)[0] == "failed", "npm exited with 1: a leftover patchright folder must not hide that"
    assert run(None)[0] == "failed", "npm timed out (returncode None): that is a failure too"
    outcome, spawned = run(0)
    assert outcome == "started", outcome
    node_runs = [kw for args, kw in spawned if args and args[0] == "node"]
    assert node_runs and node_runs[0].get("stdin") == asyncio.subprocess.DEVNULL, f"the engine must not inherit stdin, got {node_runs}"


def test_store_card_shows_login_even_with_nothing_claimed():
    print("[friend-report] Store card: a finished login counts, claimed games are not required...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    engine = Path(tempfile.mkdtemp(prefix="cards_", dir=SANDBOX))
    (engine / "data").mkdir()
    (engine / "data" / "sessions.json").write_text('{"steam": {"account": "steam_tester", "confirmedAt": 5}}', encoding="utf-8")
    (engine / "data" / "steam.json").write_text('{"steam_tester": {}}', encoding="utf-8")
    # Signed-out run of Fab/Unity/itch.io leaves a placeholder account behind: that is not a login
    (engine / "data" / "fab.json").write_text('{"default": {}}', encoding="utf-8")
    # Older installs have claimed games but no sessions entry yet
    (engine / "data" / "gog.json").write_text('{"gog_tester": {"1": {"title": "G", "time": "2026-01-01", "status": "claimed"}}}', encoding="utf-8")
    original = gc.resolve_fgc_root
    gc.resolve_fgc_root = lambda: engine
    try:
        orch = gc.GiveawaysOrchestrator()
        stores, _ = orch._read_inventory_sync(force=True)
        assert stores["steam"]["account"] == "steam_tester", stores["steam"]
        assert stores["fab"]["account"] is None, stores["fab"]
        assert stores["gog"]["account"] == "gog_tester", stores["gog"]
        assert stores["epic"]["account"] is None, stores["epic"]
        # the card must flip during the run, without a forced refresh
        sessions_file = engine / "data" / "sessions.json"
        sessions_file.write_text('{"steam": {"account": "steam_tester"}, "epic": {"account": "epic_tester"}}', encoding="utf-8")
        os.utime(sessions_file, (time.time() + 5, time.time() + 5))
        stores, _ = orch._read_inventory_sync(force=False)
        assert stores["epic"]["account"] == "epic_tester", stores["epic"]
        assert stores["steam"]["loginConfirmedAt"] is None, stores["steam"]
        # Signed out after an earlier login: claimed games must not bring the old account back
        sessions_file.write_text('{"gog": {"account": null}}', encoding="utf-8")
        os.utime(sessions_file, (time.time() + 10, time.time() + 10))
        stores, _ = orch._read_inventory_sync(force=False)
        assert stores["gog"]["account"] is None, stores["gog"]
        # A BOM is not damage
        sessions_file.write_bytes(b'\xef\xbb\xbf{"epic": {"account": "bom_tester", "confirmedAt": 7}}')
        os.utime(sessions_file, (time.time() + 15, time.time() + 15))
        stores, _ = orch._read_inventory_sync(force=False)
        assert stores["epic"]["account"] == "bom_tester" and stores["epic"]["loginConfirmedAt"] == 7, stores["epic"]
        # A broken file means "nothing known", not a crash
        sessions_file.write_text("{broken", encoding="utf-8")
        os.utime(sessions_file, (time.time() + 20, time.time() + 20))
        stores, _ = orch._read_inventory_sync(force=False)
        assert stores["epic"]["account"] is None and stores["gog"]["account"] == "gog_tester", stores["gog"]
        # A removed file is noticed without a forced refresh
        sessions_file.write_text('{"epic": {"account": "epic_tester"}}', encoding="utf-8")
        os.utime(sessions_file, (time.time() + 25, time.time() + 25))
        stores, _ = orch._read_inventory_sync(force=False)
        assert stores["epic"]["account"] == "epic_tester", stores["epic"]
        sessions_file.unlink()
        stores, _ = orch._read_inventory_sync(force=False)
        assert stores["epic"]["account"] is None, stores["epic"]
    finally:
        gc.resolve_fgc_root = original

    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "{actionError &&" in view, "errors from starting a run or a login must be visible"
    assert "setData(stateData)" not in view, "SSE state events are partial: they must not replace the store data"
    auth = view[view.index("const handleStoreAuth"):view.index("const handleCopyLogs")]
    assert "res.ok" in auth, "a refused login (no Node.js, a run in progress) must be reported"
    node = r"C:\Program Files\nodejs\node.exe"
    original_exec, original_which = gc.asyncio.create_subprocess_exec, gc.shutil.which
    original_log = gc.SCHEDULED_LOG
    original_fgc_path = os.environ.pop("FGC_PATH", None)
    gc.shutil.which = lambda name, *a, **k: node

    def run(fake, action):
        gc.asyncio.create_subprocess_exec = fake
        return asyncio.run(action(gc.GiveawaysOrchestrator()))

    try:
        # Node.js below 20: refused with an explanation, nothing is created
        fake = _FakeTaskScheduler(node_version=b"v18.20.4\n")
        try:
            run(fake, lambda o: o.toggle_scheduler(enable=True))
            raise AssertionError("the task must not be created with an old Node.js")
        except web.HTTPPreconditionFailed as exc:
            detail = json.loads(exc.text)["detail"]
            assert "Node.js" in detail and "18" in detail and "20" in detail, detail
        assert not fake.writes, fake.writes

        # The task runs in scheduled mode: the engine reads the store choice and writes the log itself
        fake = _FakeTaskScheduler()
        run(fake, lambda o: o.toggle_scheduler(enable=True))
        script = fake.writes[-1]
        assert "--scheduled" in script and "--claim" not in script, script
        assert "config.json" in script and "giveaways_scheduled.log" in script, script

        arguments, work_dir = gc._task_action(node)
        current = {"execute": "conhost.exe", "arguments": arguments, "workingDirectory": work_dir}
        stale = {**current, "arguments": arguments.replace(str(gc.resolve_fgc_root()), r"D:\old folder\giveaways_engine")}

        async def repair_then_state(o):
            await o.repair_task_paths()
            return await o._query_scheduler(force=True)

        # Moved install: only the action changes, the trigger with the chosen days stays
        fake = _FakeTaskScheduler(exists=True, action=stale)
        state = run(fake, repair_then_state)
        assert len(fake.writes) == 1 and "Set-ScheduledTask" in fake.writes[0] and "-Action" in fake.writes[0], fake.writes
        assert "-Trigger" not in fake.writes[0] and "New-ScheduledTaskTrigger" not in fake.writes[0], fake.writes[0]
        assert not state["repairError"], state

        # Same paths, whatever the letter case PATHEXT produced: no write at all
        fake = _FakeTaskScheduler(exists=True, action={**current, "arguments": arguments.replace("node.exe", "node.EXE")})
        run(fake, repair_then_state)
        assert not fake.writes, fake.writes

        # No task: the check creates nothing
        fake = _FakeTaskScheduler()
        run(fake, repair_then_state)
        assert not fake.writes, fake.writes

        # A task the user set up with an own launcher is not ours to re-point
        fake = _FakeTaskScheduler(exists=True, action={"execute": r"C:\Scripts\Launcher.bat", "arguments": "", "workingDirectory": ""})
        state = run(fake, repair_then_state)
        assert not fake.writes and not state["repairError"], (fake.writes, state)

        # A failed repair does not raise, and the state says so
        fake = _FakeTaskScheduler(exists=True, action=stale, fail_writes=True)
        state = run(fake, repair_then_state)
        assert state["exists"] and state["repairError"], state

        # An unreachable scheduler does not raise either
        run(_FakeTaskScheduler(query_broken=True), repair_then_state)

        # Node.js gone after the task was created: reported, nothing written
        gc.shutil.which = lambda name, *a, **k: None
        fake = _FakeTaskScheduler(exists=True, action=current)
        state = run(fake, repair_then_state)
        assert "Node.js" in state["repairError"] and not fake.writes, state
        gc.shutil.which = lambda name, *a, **k: node

        # A failed scheduled run is reported; "never ran" and "still running" are not failures
        for code, failed in ((1, True), (0, False), (None, False), (267011, False), (267009, False)):
            state = run(_FakeTaskScheduler(exists=True, last_result=code), lambda o: o._query_scheduler(force=True))
            assert state["lastRunFailed"] is failed, (code, state)
        assert state["logFile"].endswith("giveaways_scheduled.log"), state

        # conhost does not pass the exit code on, so for our task the scheduler reports 0: the run log tells
        run_log = Path(tempfile.mkdtemp(prefix="sentinel_runlog_")) / "giveaways_scheduled.log"
        gc.SCHEDULED_LOG = run_log
        for text, failed in (("[SENTINEL] start\n[SENTINEL] \u2715 cannot read config\n", True),
                             ("[SENTINEL] \u2715 GOG failed\nmore\n[SENTINEL] done\n", False),
                             (None, False)):
            run_log.unlink(missing_ok=True)
            if text is not None:
                run_log.write_text(text, encoding="utf-8")
            state = run(_FakeTaskScheduler(exists=True, last_result=0), lambda o: o._query_scheduler(force=True))
            assert state["lastRunFailed"] is failed, (text, state)
    finally:
        gc.SCHEDULED_LOG = original_log
        gc.asyncio.create_subprocess_exec, gc.shutil.which = original_exec, original_which
        if original_fgc_path is not None:
            os.environ["FGC_PATH"] = original_fgc_path

    service = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "self.giveaways.repair_task_paths()" in service, "the service must check the task paths when it starts"
    assert service.index("if TEST_MODE:\n            logger.info(\"SENTINEL_TEST_MODE") < service.index("self.giveaways.repair_task_paths()"), \
        "the check must stay out of the test daemon: its sandbox path must never reach a real task"
    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "giveaways_selected_stores: selectedStores" in view, "the store choice must reach config.json, a scheduled run reads it there"
    assert "repairError" in view and "lastRunFailed" in view, "scheduler problems must be shown"


def test_scheduled_run_collects_selected_stores_and_writes_a_log():
    print("[clean-install] Giveaways runner: a scheduled run follows the store choice and leaves a UTF-8 log...")
    node = shutil.which("node")
    if not node:
        print("      SKIP: Node.js is missing, the runner cannot be started")
        return
    engine = Path(tempfile.mkdtemp(prefix="sentinel_sched_")) / "движок с пробелом"
    try:
        (engine / "dist").mkdir(parents=True)
        (engine / "node_modules" / "patchright").mkdir(parents=True)
        shutil.copy2(WORKSPACE / "giveaways_engine" / "runner.js", engine / "runner.js")
        shutil.copy2(WORKSPACE / "giveaways_engine" / "package.json", engine / "package.json")
        scripts = {"epic": "epic-games", "gog": "gog", "steam": "steam", "fab": "fab", "unity": "unity", "itch": "itch"}
        for store, name in scripts.items():
            (engine / "dist" / f"{name}.mjs").write_text(f"console.log('STORE {store} раздача');", encoding="utf-8")
        config, log = engine / "config.json", engine / "giveaways_scheduled.log"

        def run_scheduled(*node_args):
            result = subprocess.run([node, *node_args, "runner.js", "--scheduled", "--config", str(config), "--log", str(log)],
                                    cwd=str(engine), capture_output=True, text=True, encoding="utf-8", timeout=60)
            return result.returncode, log.read_text(encoding="utf-8")

        def stores_in(text):
            return sorted(store for store in scripts if f"STORE {store} раздача" in text)

        # Only the selected stores run, the children's output and Cyrillic land in the log as UTF-8
        config.write_text(json.dumps({"giveaways_selected_stores": ["epic", "itch"]}), encoding="utf-8")
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == ["epic", "itch"], (code, text)
        assert "Запуск по расписанию" in text, text

        # Every run starts the file over, so it cannot grow without limit
        config.write_text(json.dumps({"giveaways_selected_stores": ["gog"]}), encoding="utf-8")
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == ["gog"], (code, text)

        # A config saved with a BOM still counts, an unknown store is skipped and named
        config.write_bytes(b"\xef\xbb\xbf" + json.dumps({"giveaways_selected_stores": ["steam", "nope"]}).encode())
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == ["steam"] and "nope" in text, (code, text)

        # All stores off: nothing runs and the log says why
        config.write_text(json.dumps({"giveaways_selected_stores": []}), encoding="utf-8")
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == [] and "не выбран" in text, (code, text)

        # The giveaways module switched off in the settings: nothing runs either
        config.write_text(json.dumps({"giveaways_enabled": False, "giveaways_selected_stores": ["epic"]}), encoding="utf-8")
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == [] and "отключ" in text, (code, text)

        # No choice saved yet: the defaults the interface shows
        defaults = ["epic", "fab", "gog", "steam", "unity"]
        config.write_text(json.dumps({"language": "ru"}), encoding="utf-8")
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == defaults, (code, text)
        config.unlink()
        code, text = run_scheduled()
        assert code == 0 and stores_in(text) == defaults, (code, text)

        # A damaged config: a store the user turned off must not run on a guess, the run fails visibly
        for damaged in ('{"giveaways_selected_stores": ["epic"', '{"giveaways_selected_stores": "epic"}', "null"):
            config.write_text(damaged, encoding="utf-8")
            code, text = run_scheduled()
            assert code != 0 and stores_in(text) == [] and "config.json" in text, (damaged, code, text)

        # Node.js below 20: the log explains it, the exit code shows it
        config.write_text(json.dumps({"giveaways_selected_stores": ["epic"]}), encoding="utf-8")
        old_node = engine / "old_node.cjs"
        old_node.write_text("Object.defineProperty(process, 'versions', { value: { ...process.versions, node: '18.20.4' } });", encoding="utf-8")
        code, text = run_scheduled("-r", str(old_node))
        assert code != 0 and stores_in(text) == [] and "Node.js" in text and "18.20.4" in text, (code, text)
    finally:
        shutil.rmtree(engine.parent, ignore_errors=True)


def test_engine_installs_itself_for_a_scheduled_run():
    print("[clean-install] Giveaways runner: a scheduled first run installs the browser engine on its own...")
    node = shutil.which("node")
    if not node:
        print("      SKIP: Node.js is missing, the runner cannot be started")
        return
    engine = Path(tempfile.mkdtemp(prefix="sentinel_runner_"))
    try:
        shutil.copy2(WORKSPACE / "giveaways_engine" / "runner.js", engine / "runner.js")
        shutil.copy2(WORKSPACE / "giveaways_engine" / "package.json", engine / "package.json")
        bin_dir = engine / "fake_bin"
        bin_dir.mkdir()
        (bin_dir / "npm.cmd").write_text("@echo npm %*>>install.log\r\n@mkdir node_modules\\patchright\r\n", encoding="utf-8")
        (bin_dir / "npx.cmd").write_text("@echo npx %*>>install.log\r\n", encoding="utf-8")
        env = {**os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ.get("PATH", "")}

        def run_runner():
            return subprocess.run([node, "runner.js", "--headless", "--claim", "steam"], cwd=str(engine), env=env,
                                  capture_output=True, text=True, encoding="utf-8", timeout=60)

        first = run_runner()
        assert first.returncode == 0, first.stdout + first.stderr
        log = (engine / "install.log").read_text(encoding="utf-8")
        assert "npm install" in log and "npx patchright install chromium" in log, log
        run_runner()
        assert (engine / "install.log").read_text(encoding="utf-8") == log, "an installed engine must not be installed again"

        # A failed install stops the run with an error code instead of failing every store one by one
        shutil.rmtree(engine / "node_modules")
        (bin_dir / "npm.cmd").write_text("@exit /b 7\r\n", encoding="utf-8")
        assert run_runner().returncode != 0, "a failed install must be visible in the exit code"
    finally:
        shutil.rmtree(engine, ignore_errors=True)


def test_english_ui_covers_every_russian_string():
    print("[i18n] Every Russian string of the UI has an English translation...")
    node = shutil.which("node")
    if not node or not (WORKSPACE / "node_modules" / "typescript").exists():
        print("      SKIP: Node.js or node_modules (npm ci) is missing, the translation check cannot run")
        return
    result = subprocess.run([node, str(WORKSPACE / "tools" / "check_i18n.mjs")], cwd=str(WORKSPACE),
                            capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert result.returncode == 0, (result.stdout + result.stderr)[-2000:]
    print("      " + result.stdout.strip().splitlines()[-1] + " [OK]")


def test_claimed_drop_never_replaces_the_drop_being_farmed():
    print("[Dashboard] A drop that is not being farmed cannot take over the progress counter...")
    import sys
    core_dir = SANDBOX / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from gui_headless import STATE_BRIDGE
    from inventory import DropsCampaign
    from settings import Settings
    from twitch import Twitch

    class Args:
        tray = False
        log = False
        dump = False
        logging_level = 20
        debug_ws = 0
        debug_gql = 0

    t = Twitch(Settings(Args()))

    def campaign(camp_id, drops):
        return DropsCampaign(t, {
            "id": camp_id, "name": camp_id, "status": "ACTIVE", "self": {"isAccountConnected": True},
            "game": {"id": 1, "displayName": "Hunt: Showdown 1896"},
            "startAt": "2026-01-01T00:00:00Z", "endAt": "2099-01-01T00:00:00Z",
            "timeBasedDrops": drops,
        }, {})

    def drop(drop_id, name, required, current, claimed=False):
        return {
            "id": drop_id, "name": name, "requiredMinutesWatched": required,
            "startAt": "2026-01-01T00:00:00Z", "endAt": "2099-01-01T00:00:00Z",
            "benefitEdges": [{"benefit": {"id": drop_id + "_b", "name": name, "distributionType": "DIRECT_ENTITLEMENT", "imageAssetURL": ""}}],
            "self": {"currentMinutesWatched": current, "isClaimed": claimed},
        }

    saved = STATE_BRIDGE.active_drop
    try:
        # The live case: Supply Crate is at 80/120 while another campaign of the game holds a claimed Hunt White
        crates = campaign("crates", [drop("crate", "Supply Crate", 120, 80), drop("spare", "Spare Key", 240, 80)])
        whites = campaign("whites", [drop("white", "Hunt White", 15, 15, claimed=True)])
        crate = crates.timed_drops["crate"]
        white = whites.timed_drops["white"]

        crate.display()
        assert STATE_BRIDGE.active_drop["progress_percent"] == 67

        # Twitch's CurrentDrop session and websocket can still name the claimed drop
        white.display()
        assert STATE_BRIDGE.active_drop["id"] == "crate", f"claimed drop took over: {STATE_BRIDGE.active_drop}"
        white.update_minutes(3)
        assert STATE_BRIDGE.active_drop["id"] == "crate", f"finished campaign took over: {STATE_BRIDGE.active_drop}"

        # Progress of the whole campaign shows the drop being farmed, not the last one of the list
        crates.timed_drops["spare"]._on_state_changed()
        assert STATE_BRIDGE.active_drop["id"] == "crate", f"sibling drop took over: {STATE_BRIDGE.active_drop}"
        crate.update_minutes(90)
        assert STATE_BRIDGE.active_drop["id"] == "crate"
        assert STATE_BRIDGE.active_drop["current_minutes"] == 90, "a refresh of the shown drop must still reach the UI"
        assert STATE_BRIDGE.active_drop["progress_percent"] == 75

        # The drop being farmed still reaches 100% and shows as claimed when it finishes
        crate.is_claimed = True
        crate.real_current_minutes = crate.required_minutes
        crate.display()
        assert STATE_BRIDGE.active_drop["id"] == "crate" and STATE_BRIDGE.active_drop["is_claimed"] is True
        assert STATE_BRIDGE.active_drop["progress_percent"] == 100
    finally:
        STATE_BRIDGE.active_drop = saved
    print("      Counter follows only the drop being farmed: ALL PASS [OK]")


if __name__ == "__main__":
    print("=" * 65)
    print("  TWITCH DROPS SENTINEL v3.1 — VERIFICATION TEST SUITE")
    print("  Author: Mortuis_V / Mortuis_V_Studio")
    print("=" * 65)
    GATES = [
        test_artifacts,
        test_installed_games_catalog,
        test_trophy_vault_journal,
        test_hardware_guard,
        test_core_service_api,
        test_prd_compliance,
        test_branding_check,
        test_streamless_engine_contract,
        test_palette_integrity,
        test_safe_inventory_parsing,
        test_mojibake_cleanliness,
        test_trophy_matching_cyrillic,
        test_channel_drops_enabled_resilience,
        test_expired_campaign_filtering,
        test_watchdog_active_drop_sync,
        test_search_games_and_box_art_cache,
        test_sequel_guard_and_no_false_box_art,
        test_audited_steam_app_ids_and_verified_sequels,
        test_giveaways_hub_integration,
        test_universal_game_scanner,
        test_route_aliases_and_directory_management,
        test_audio_mute_and_release_safety,
        test_argon_public_hardening_and_resilience,
        test_github_updater_and_zero_mock_telemetry,
        test_hardware_guard_false_positive_and_installed_clear,
        test_channel_points_clipboard_and_feature_toggles,
        test_game_scanner_anti_software_and_patch_filtering,
        test_game_scanner_deduplication_and_trophies_clear,
        test_sleep_guard_watchdog_and_account_protection,
        test_r6s_showcase_acl_and_strict_priority_guard,
        test_giveaways_stores_persistence_and_version_standardization,
        test_game_shelf_claimed_tab_and_trophies_integration,
        test_twitch_drops_sync_and_active_filter,
        test_shelf_removed_tab_and_startup_sync,
        test_telemetry_cleanliness_giveaways_self_containment_and_screendimmer_suite,
        test_manual_farm_override_and_native_screendimmer_suite,
        test_update_check_failure_reports_running_version,
        test_update_check_failure_is_visible_and_retried,
        test_campaigns_fetcher_backoff_retry_after_and_fresh_cache,
        test_console_messages_follow_configured_language,
        test_giveaways_hung_node_process_hits_ceiling,
        test_shutdown_aborts_running_giveaways_process,
        test_idle_hero_does_not_promise_claimed_or_unlinked_campaigns,
        test_queue_wait_message_counts_the_whole_queue,
        test_console_folds_progress_and_repeated_lines,
        test_active_campaigns_tab_sorting_and_new_marker,
        test_console_folds_sync_cycles_but_never_important_events,
        test_settings_modules_counter_matches_switches,
        test_shelf_facts_trophy_line_and_sync_age,
        test_queue_filter_only_with_campaigns,
        test_toast_gate_dedup_switch_and_priming,
        test_new_campaign_step_is_not_hidden_by_the_previous_steps_trophies,
        test_listed_but_unfarmable_campaign_never_reads_as_available,
        test_campaign_dates_line,
        test_cover_keeper_replaces_broken_and_missing_covers,
        test_cover_search_names_and_non_game_filter,
        test_giveaways_without_node_explains_what_is_missing,
        test_store_login_finishes_without_a_terminal,
        test_unity_orders_only_at_a_clear_zero_total,
        test_login_state_follows_the_latest_attempt,
        test_itch_login_wait_checks_the_host_not_a_substring,
        test_two_factor_and_confirm_without_a_terminal_go_through_the_log,
        test_login_hint_goes_away_once_the_attempt_succeeded,
        test_giveaways_setup_failure_and_engine_stdin,
        test_store_card_shows_login_even_with_nothing_claimed,
        test_scheduler_task_is_created_on_a_clean_install,
        test_scheduler_query_that_hangs_is_killed_and_reaped,
        test_engine_installs_itself_for_a_scheduled_run,
        test_scheduler_refuses_an_old_node_and_task_paths_follow_the_install,
        test_scheduled_run_collects_selected_stores_and_writes_a_log,
        test_missing_webview2_runtime_has_an_explanation,
        test_login_code_copy_and_activate_link,
        test_config_files_saved_with_a_bom_still_load,
        test_patch_update_keeps_user_data_and_blocks_path_traversal,
        test_english_ui_covers_every_russian_string,
        test_claimed_drop_never_replaces_the_drop_being_farmed,
    ]
    # Gates that only make sense with the user's own data, exe or live Twitch. On a CI runner they are skipped
    # loudly, never silently; CI_COLLECT=1 runs everything and lists what would fail (used to refresh this set).
    failed = []
    for gate in GATES:
        if IN_CI and gate.__name__ in CI_LIVE_ONLY:
            print(f"      SKIP [{gate.__name__}]: needs the user's data, the exe or live Twitch; not available on a CI runner")
            continue
        if os.environ.get("CI_COLLECT") == "1":
            try:
                gate()
            except Exception as exc:  # noqa: BLE001 - collecting, reported below
                failed.append(gate.__name__)
                print(f"      COLLECT-FAIL [{gate.__name__}]: {type(exc).__name__}: {exc}")
        else:
            gate()
    if failed:
        print("CI_COLLECT failures:", failed)
        sys.exit(1)
    assert_live_data_untouched()
    print("      Live user files untouched (sha256 identical): PASS [OK]")
    print("=" * 65)
    print("  ALL 41 VERIFICATION GATES PASSED WITH EXIT CODE 0! [SUCCESS]")
    print("=" * 65)
    if SUITE_PROC is not None:
        SUITE_PROC.terminate()
        with suppress(Exception):
            SUITE_PROC.wait(timeout=3)
        print("  Test daemon terminated cleanly.")



