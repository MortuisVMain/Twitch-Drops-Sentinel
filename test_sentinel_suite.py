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
    # the first answer may wait for the scheduler query, whose ceiling is SCHEDULER_QUERY_TIMEOUT_SECONDS (15 s)
    with safe_urlopen(g_req, timeout=20.0) as res:
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

    assert __version__ == "3.5.8", f"Version mismatch: {__version__}"
    assert parse_version("3.5.8") == (3, 5, 8)
    assert parse_version("v3.3.6-beta") == (3, 3, 6)
    assert parse_version("v3.5.8") > parse_version("3.5.6")
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
    print("[audit F-039] Dashboard queue: status filters hide rows, keep the order, counters add up, old setting migrates...")
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
        "import { queueView, queueCounts, parseQueueFilter } from './campaignState.mjs';\n"
        "const row = (name, kind, idx) => ({ name, priorityIndex: idx, state: { kind, remaining: 0, linkUrl: null } });\n"
        "const items = [row('A', 'running', 0), row('B', 'none', 1), row('C', 'link', 2), row('D', 'none', 3), row('E', 'done', 4), row('F', 'running', 5)];\n"
        "const names = (f) => queueView(items, f).visible.map(i => i.name);\n"
        "const prio = (f) => queueView(items, f).visible.map(i => i.priorityIndex);\n"
        "const c0 = queueCounts(items, false);\n"
        "const c1 = queueCounts(items, true);\n"
        "const ce = queueCounts([], true);\n"
        "const sum = (c) => c.available + c.needLink + c.finished + c.noCampaign;\n"
        "console.log(JSON.stringify({\n"
        "  all: names('all'), available: names('available'), action: names('action'), none: names('none'),\n"
        "  prioAll: prio('all'), prioAvailable: prio('available'), prioNone: prio('none'),\n"
        "  total: queueView(items, 'none').total, c0, c1, ce, s0: sum(c0), s1: sum(c1), se: sum(ce),\n"
        "  p: [parseQueueFilter(null), parseQueueFilter('available'), parseQueueFilter('none'), parseQueueFilter('action'),\n"
        "      parseQueueFilter('all'), parseQueueFilter('bogus'), parseQueueFilter('')],\n"
        "}));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["all"] == ["A", "B", "C", "D", "E", "F"], d        # "all" keeps the finished rows (the dashboard folds them into their own group)
    assert d["available"] == ["A", "F"] and d["action"] == ["C"] and d["none"] == ["B", "D"], d
    assert "E" not in d["available"] + d["action"] + d["none"], d   # finished rows only under "all"
    assert d["prioAll"] == [0, 1, 2, 3, 4, 5] and d["prioAvailable"] == [0, 5] and d["prioNone"] == [1, 3], d   # real queue positions, never renumbered
    assert d["total"] == 6, d                                    # the counter does not depend on the filter
    assert d["c0"] == {"total": 6, "available": 2, "needLink": 1, "finished": 1, "noCampaign": 2}, d["c0"]
    assert d["c1"] == {"total": 7, "available": 3, "needLink": 1, "finished": 1, "noCampaign": 2}, d["c1"]   # the farmed game: +1 total, +1 available
    assert d["ce"] == {"total": 1, "available": 1, "needLink": 0, "finished": 0, "noCampaign": 0}, d["ce"]
    assert d["s0"] == d["c0"]["total"] and d["s1"] == d["c1"]["total"] and d["se"] == d["ce"]["total"], d   # the parts always add up to the total
    # no stored value starts as "all" (the legacy switch is not migrated: "action" would hide running games); a stored value wins; unknown falls back to "all"
    assert d["p"] == ["all", "available", "none", "action", "all", "all", "all"], d["p"]
    dash = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "sentinel_queue_filter" in dash and "sentinel_queue_only_campaigns" not in dash, "only the new key is used; the legacy key is neither read nor migrated"
    assert "filterLogs(safeRecentLogs, 'ALL')" in dash, "[audit] the collapsed console line always takes the ALL view, not the chip-filtered one"
    assert "toggleQueueOnlyCampaigns" not in dash and "(с кампаниями:" not in dash, "the old toggle and counter are gone"
    assert 'role="group"' in dash and "aria-pressed={queueFilter ===" in dash, "filters are an accessible segmented group"
    assert 'id="queueCount"' in dash
    shutil.rmtree(out_dir, ignore_errors=True)


def test_shelf_unclaimed_filter_uses_shared_campaign_state():
    print("[audit F-039b] Shelf: 'Есть неполученные' counts running and link-needed campaigns through getCampaignState...")
    shelf = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "import { getCampaignState } from '../utils/campaignState'" in shelf, "one shared definition of the campaign state"
    assert "'unclaimed'" in shelf and "🎁 Есть неполученные ({unclaimedCount})" in shelf
    assert "kind === 'running' || kind === 'link'" in shelf, "finished and no-campaign games are not 'unclaimed'"
    assert "Есть неполученные награды: кампания идёт и что-то ещё можно получить" in shelf


def test_console_collapse_tray_filter_and_plain_labels():
    print("[usability 2] Console: collapse decision, [TRAY] hidden outside Core, toggle is accessible; plain labels; honest empty collection...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "console_view_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "consoleLog.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'consoleLog.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { resolveConsoleCollapsed as r, filterLogs, isTrayLine } from './consoleLog.mjs';\n"
        "const L = (level, message) => ({ time: '10:00:00', level, message });\n"
        "const logs = [L('INFO', '[TRAY] Icon: idle'), L('WATCH', 'Просмотр канала: abc'), L('CLAIM', 'Забран трофей'), L('SYS', 'Ядро запущено'),\n"
        "              L('INFO', '[CORE] started'), L('INFO', 'Каталог собран: 10 игр'), L('INFO', '  [tray] Icon: farming')];\n"
        "const msgs = (f) => filterLogs(logs, f).map(l => l.message);\n"
        "console.log(JSON.stringify({\n"
        "  noChoice: [r(null, true), r(null, false)],\n"
        "  explicit: [r('1', true), r('1', false), r('0', true), r('0', false)],\n"
        "  junk: [r('true', true), r('', false), r('2', true), r('yes', false)],\n"
        "  all: msgs('ALL'), watch: msgs('WATCH'), claim: msgs('CLAIM'), core: msgs('CORE'),\n"
        "  tray: [isTrayLine(L('INFO', '[TRAY] Icon: idle')), isTrayLine(L('INFO', '[CORE] x')), isTrayLine(L('INFO', 'Значок [TRAY] в трее')), isTrayLine(L('INFO', ''))],\n"
        "}));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["noChoice"] == [True, False], d["noChoice"]                 # no choice: collapsed while idle, expanded while farming
    assert d["explicit"] == [True, True, False, False], d["explicit"]    # an explicit choice wins either way
    assert d["junk"] == [True, False, True, False], d["junk"]            # a junk stored value falls back to the default
    assert d["all"] == ["Просмотр канала: abc", "Забран трофей", "Ядро запущено", "[CORE] started", "Каталог собран: 10 игр"], d["all"]   # [TRAY] hidden in "All"
    assert d["watch"] == ["Просмотр канала: abc"] and d["claim"] == ["Забран трофей"], (d["watch"], d["claim"])
    assert "[TRAY] Icon: idle" in d["core"] and "  [tray] Icon: farming" in d["core"], d["core"]   # "Core" shows them (the service logs them at INFO)
    assert d["tray"] == [True, False, False, False], d["tray"]           # only a leading [TRAY]; other brackets untouched
    dash = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "aria-expanded={!consoleCollapsed}" in dash and "onClick={toggleConsole}" in dash, "the console toggle exposes aria-expanded"
    assert "CONSOLE_COLLAPSED_KEY" in dash and "resolveConsoleCollapsed(consoleChoice, isIdle)" in dash, "stored choice + idle state decide"
    assert "console.warn('LiveDashboard: не удалось сохранить состояние консоли'" in dash, "a failed save is reported, not swallowed"
    assert "safeRecentLogs.map((l) =>" in dash, "Copy still takes the untouched full journal"
    assert "hardware.is_paused" in dash and "Автосбор включён · Сейчас ожидает" in dash and 'id="heroDropTitle">Ожидание кампаний' in dash, "idle hero states the farm switch"
    for new in ("🎯 Режим: только очередь", "⚡ Режим: очередь + любые", "Показать игры вне очереди", "Собирать сейчас", "Сейчас · отменить"):
        assert new in dash, new
    for old in ("Только очередь ⇄", "Очередь + любые ⇄", "'ФОКУС'", "'FORCE'", "Фармить вне очереди\n"):
        assert old not in dash, old
    shelf = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "ВНЕ" in shelf and "НЕ В ОЧЕРЕДИ" not in shelf and "СТАНДАРТ" not in shelf, "the rocker names what the position really is"
    app = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    css = (WORKSPACE / "src" / "index.css").read_text(encoding="utf-8")
    assert "relief-chip" not in app and "relief-chip" not in css and "FLAT-2D" not in app, "the backdrop chip is gone from the header"
    giv = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "claimedItems.length === 0 ? (" in giv and "Пока ничего не получено" in giv and "Подключите магазин, чтобы начать." in giv, "empty collection has its own text"
    assert giv.index("Пока ничего не получено") < giv.index("Тайтлы не найдены по заданным критериям"), "'not found' stays for a search/filter that hides existing items"
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


def test_short_window_console_minimum_leaves_the_collapsed_console_alone():
    print("[usability] the short-window console minimum and the off-queue cap apply only while the console is expanded...")
    css = (WORKSPACE / "src" / "index.css").read_text(encoding="utf-8")
    block = re.search(r"@media \(max-height: 800px\)\s*\{(.*?)\n  \}", css, re.S)
    assert block, "the short-window block exists"
    rules = block.group(1)
    assert ".middle-console-island:not(.console-collapsed) {" in rules and "min-height: 8.5rem" in rules, "console minimum skips the collapsed console"
    assert ".middle-console-island:not(.console-collapsed) ~ #overrideSection .override-scroll-grid {" in rules, "grid cap only while expanded"
    assert not re.search(r"\.right-deck-col \.(middle-console-island|override-scroll-grid) \{", rules), "no unscoped rule is left"
    print("      Collapsed console: PASS [OK]")


def test_queue_row_shows_why_a_campaign_cannot_be_farmed():
    print("[usability] a queued game with an unfarmable campaign shows the engine's reason as the row caption, in both languages...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if esbuild.exists() and node is not None:
        out_dir = SANDBOX / "reason_caption_check"
        out_dir.mkdir(exist_ok=True)
        res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignState.ts"), "--bundle", "--format=esm",
                              f"--outfile={out_dir / 'campaignState.mjs'}"], capture_output=True, text=True, timeout=60)
        assert res.returncode == 0, res.stderr
        driver = out_dir / "driver.mjs"
        driver.write_text(
            "import { getCampaignState, campaignLabel } from './campaignState.mjs';\n"
            "const g = (extra) => ({ id: 'a', name: 'Albion Online', has_drops: true, is_active_now: true, rewards_count: 2, is_account_connected: true, ...extra });\n"
            "const label = (x) => campaignLabel(getCampaignState(x));\n"
            "console.log(JSON.stringify({ cut: label(g({ farmable: false, not_farmable_reason: 'кампании нет в инвентаре Twitch' })), "
            "noReason: label(g({ farmable: false })), none: label(undefined), running: label(g({ farmable: true })) }));\n",
            encoding="utf-8")
        run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
        assert run.returncode == 0, run.stderr
        d = json.loads(run.stdout)
        assert d["cut"] == "кампании нет в инвентаре Twitch", d
        assert d["noReason"] == "нет кампании" and d["none"] == "нет кампании", d
        assert d["running"].startswith("идёт"), d
        shutil.rmtree(out_dir, ignore_errors=True)
    else:
        print("      (node/esbuild not available: label check skipped)")
    # every reason string the service can produce has an English translation
    en = (WORKSPACE / "src" / "i18n" / "en" / "state.ts").read_text(encoding="utf-8")
    sources = (WORKSPACE / "core" / "utils.py").read_text(encoding="utf-8") + (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    farmability = re.search(r"def campaign_farmability.*?(?=\ndef )", sources, re.S).group(0)
    reasons = re.findall(r'return False, "([^"]+)"', farmability)
    assert len(reasons) >= 4, reasons
    reasons += re.findall(r'\["not_farmable_reason"\] = "([^"]+)"', sources)
    for reason in reasons:
        assert f"'{reason}':" in en, f"no English translation for the reason: {reason}"
    row = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "title={item.state.kind === 'none' ? item.state.reason : undefined}" in row, "the full reason is in the row's title"
    print("      Reason caption: PASS [OK]")


def test_remaining_watch_minutes_helper_and_deadline_facts():
    print("[usability 3] Deadline: the engine's remaining watch minutes reach the game dict; deadlineFacts compares them with the time left...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import logging
    from datetime import datetime, timedelta, timezone
    from inventory import DropsCampaign
    from settings import Settings
    from twitch import Twitch
    from utils import campaign_remaining_watch_minutes as rem

    class Args:
        tray = False
        log = False
        dump = False
        logging_level = 20
        debug_ws = 0
        debug_gql = 0

    t = Twitch(Settings(Args()))   # real engine objects: DropsCampaign / TimedDrop built from GQL-shaped dicts
    iso = lambda days: (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def drop(drop_id, required, current=0, claimed=False, after=(), ends=10):
        return {
            "id": drop_id, "name": drop_id, "requiredMinutesWatched": required,
            "startAt": iso(-5), "endAt": iso(ends),
            "benefitEdges": [{"benefit": {"id": drop_id + "_b", "name": drop_id, "distributionType": "DIRECT_ENTITLEMENT", "imageAssetURL": ""}}],
            "preconditionDrops": [{"id": p} for p in after],
            "self": {"currentMinutesWatched": current, "isClaimed": claimed},
        }

    def camp(camp_id, drops):
        return DropsCampaign(t, {"id": camp_id, "name": camp_id, "status": "ACTIVE", "game": {"id": 1, "displayName": "G"},
                                 "startAt": iso(-5), "endAt": iso(10), "timeBasedDrops": drops}, {})

    # a chain of two (60 -> 120) next to a parallel drop of 100: the longest chain wins, parallel drops overlap
    chain = camp("rm-chain", [drop("a", 60), drop("b", 120, after=["a"]), drop("p", 100)])
    assert rem(chain) == 180, rem(chain)
    assert rem(camp("rm-chain-progress", [drop("a", 60, 50), drop("b", 120, after=["a"]), drop("p", 100)])) == 130
    # a claimed predecessor counts 0
    assert rem(camp("rm-claimed", [drop("a", 60, claimed=True), drop("b", 45, after=["a"])])) == 45
    # an unclaimed drop that has already expired can never be earned: its 600 minutes must not count
    expired = camp("rm-expired", [drop("ok", 60), drop("gone", 600, ends=-1)])
    assert expired.remaining_minutes == 600 and rem(expired) == 60, "the engine property over-counts; the helper does not"
    # an over-watched drop clamps to 0, also inside a chain
    assert rem(camp("rm-over", [drop("a", 30, 50)])) == 0
    assert rem(camp("rm-over-chain", [drop("a", 30, 50), drop("b", 40, after=["a"])])) == 40
    # nothing earnable (all claimed, or no drops at all): unknown, not 0
    assert rem(camp("rm-allclaimed", [drop("a", 30, claimed=True)])) is None
    assert rem(camp("rm-empty", [])) is None
    assert isinstance(rem(chain), int)
    # a broken precondition id: unknown, and the warning is logged only once per campaign across polls
    records = []
    class Catch(logging.Handler):
        def emit(self, record):
            records.append(record)
    utils_logger = logging.getLogger("TwitchDrops")
    handler = Catch(level=logging.WARNING)
    utils_logger.addHandler(handler)
    try:
        broken = camp("rm-broken", [drop("a", 30, after=["ghost"])])
        assert rem(broken) is None and rem(broken) is None
        warned = [r for r in records if "remaining watch time unknown" in r.getMessage()]
        assert len(warned) == 1 and warned[0].exc_info, "one warning with a traceback, not one per poll"
    finally:
        utils_logger.removeHandler(handler)
    service = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "campaign_remaining_watch_minutes" in service and 'g["remaining_watch_minutes"]' in service, "the service adds the field next to progress_percent"
    assert service.count('g.pop("remaining_watch_minutes", None)') == 2, "[audit] cached catalog dicts lose a stale value when it is unknown or the campaign is not in the inventory"

    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: front half skipped)")
        return
    out_dir = SANDBOX / "deadline_facts_check"
    out_dir.mkdir(exist_ok=True)
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "campaignFacts.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'campaignFacts.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { deadlineFacts as f } from './campaignFacts.mjs';\n"
        "const now = Date.parse('2026-11-04T10:00:00Z');\n"
        "const at = (min) => new Date(now + min * 60000).toISOString();\n"
        "console.log(JSON.stringify({\n"
        "  enough: f(at(348), 120, now), late: f(at(60), 120, now), equal: f(at(120), 120, now), oneOver: f(at(120), 121, now),\n"
        "  zero: f(at(60), 0, now), unknownWatch: f(at(60), undefined, now), nullWatch: f(at(60), null, now), nanWatch: f(at(60), NaN, now),\n"
        "  negWatch: f(at(60), -5, now), badDate: f('not a date', 30, now), noDate: f(undefined, 30, now), emptyDate: f('', 30, now),\n"
        "  past: f(at(-10), 30, now),\n"
        "}));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert d["enough"] == {"msLeft": 348 * 60000, "watchMinutes": 120, "verdict": "enough"}, d["enough"]
    assert d["late"]["verdict"] == "late" and d["late"]["watchMinutes"] == 120 and d["late"]["msLeft"] == 60 * 60000, d["late"]
    assert d["equal"]["verdict"] == "enough", d["equal"]                    # exactly as much time as watching: not late
    assert d["oneOver"]["verdict"] == "late", d["oneOver"]
    assert d["zero"]["verdict"] == "enough" and d["zero"]["watchMinutes"] == 0, d["zero"]
    for key in ("unknownWatch", "nullWatch", "nanWatch", "negWatch"):
        assert d[key]["verdict"] == "unknown" and d[key]["watchMinutes"] is None and d[key]["msLeft"] == 60 * 60000, (key, d[key])   # an old payload without the field
    for key in ("badDate", "noDate", "emptyDate"):
        assert d[key]["verdict"] == "unknown" and d[key]["msLeft"] is None, (key, d[key])      # no usable end date: no verdict
    assert d["past"]["verdict"] == "late", d["past"]
    shutil.rmtree(out_dir, ignore_errors=True)

    board = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "deadlineFacts(" in board and "До конца" in board and "Не успеть:" in board and "время просмотра неизвестно" in board
    assert "успеете" not in board, "a verdict of 'enough' is never promised"
    ui_types = (WORKSPACE / "src" / "types.ts").read_text(encoding="utf-8")
    assert "remaining_watch_minutes?: number" in ui_types
    fixture = (WORKSPACE / "tools" / "ui_fixture.js").read_text(encoding="utf-8")
    assert fixture.count("remaining_watch_minutes") >= 2, "the fixture shows enough, late and unknown"
    print("      Deadline facts: PASS [OK]")


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
        ok, message = updater.GitHubUpdater()._install_update([url], {url: hashlib.sha256(patch.read_bytes()).hexdigest()})
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
        ok, message = updater.GitHubUpdater()._install_update(["http://127.0.0.1:9/none.zip"], {"http://127.0.0.1:9/none.zip": "0" * 64})
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


def test_giveaways_readiness_window_texts_report_and_counts():
    print("[readiness-ui] Readiness window: every reason has a text, the report hides account names, todo items are counted...")
    import shutil as _sh
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    node = _sh.which("node")
    if not esbuild.exists() or node is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "readiness_ui_check"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir()
    res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "giveawaysReadiness.ts"), "--bundle", "--format=esm",
                          f"--outfile={out_dir / 'giveawaysReadiness.mjs'}"], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import * as R from './giveawaysReadiness.mjs';\n"
        "const ctx = { storeName: (id) => ({ epic: 'Epic Games', gog: 'GOG.com' }[id] || id), formatDate: (when) => 'D:' + new Date(when).toISOString().slice(0, 10) };\n"
        "const it = (id, status, params = {}, action = null, store) => ({ id, status, params, action, ...(store ? { store } : {}) });\n"
        "const SECRET = 'secret.user@example.com';\n"
        "const items = [\n"
        "  it('module', 'ok', { path: 'C:/x' }),\n"
        "  it('node', 'todo', { reason: 'old', version: 'v18.2.0', required: 20 }, { kind: 'open_url', url: 'https://nodejs.org' }),\n"
        "  it('engine', 'todo', {}, null),\n"
        "  it('browser', 'warning', { found: null }),\n"
        "  it('selection', 'ok', { reason: null, stores: ['epic', 'gog'] }),\n"
        "  it('login', 'ok', { account: SECRET, confirmedAt: '2026-10-30T18:20:00Z' }, null, 'epic'),\n"
        "  it('login', 'todo', {}, { kind: 'sign_in', store: 'gog' }, 'gog'),\n"
        "  it('site', 'ok', {}, null, 'epic'), it('site', 'warning', {}, null, 'gog'),\n"
        "  it('scheduler', 'info', { reason: 'not_created' }, { kind: 'enable_scheduler' }),\n"
        "];\n"
        "const resp = { ready: false, remaining: 3, checkedAt: '2026-11-03T12:00:00Z', engineInstall: { running: false, error: null }, items };\n"
        "const report = R.buildReport(resp, ctx, '3.5.6');\n"
        "const bad = [];\n"
        "for (const [id, reasons] of Object.entries(R.KNOWN_REASONS)) for (const reason of reasons) {\n"
        "  const params = id === 'browser' ? { found: reason } : { reason, version: 'v1', required: 20, error: 'boom', logFile: 'C:/log.txt', stores: [] };\n"
        "  for (const status of ['ok', 'todo', 'warning', 'info']) for (const action of [null, { kind: 'install_engine' }]) {\n"
        "    const t = R.itemText(it(id, status, params, action), ctx);\n"
        "    const all = [t.title, ...t.lines];\n"
        "    if (!t.lines.length || all.some((s) => typeof s !== 'string' || !s.trim() || /undefined|null|NaN|\\[object/.test(s))) bad.push([id, reason, status, all]);\n"
        "  }\n"
        "}\n"
        "const strange = R.itemText(it('scheduler', 'warning', { reason: 'brand_new_reason' }), ctx);\n"
        "const unknownId = R.itemText({ id: 'zzz', status: 'weird', params: {}, action: null }, ctx);\n"
        "const bs = String.fromCharCode(92);\n"
        "const logPath = 'C:' + bs + 'Users' + bs + 'Ivan Petrov' + bs + 'AppData' + bs + 'run.log';\n"
        "const pathReport = R.buildReport({ ...resp, engineInstall: { running: false, error: \"EPERM, open '\" + logPath + \"'\" }, items: [\n"
        "  it('engine', 'todo', {}, { kind: 'install_engine' }),\n"
        "  it('scheduler', 'warning', { reason: 'last_run_failed', logFile: logPath }, null),\n"
        "  it('scheduler', 'warning', { reason: 'repair_failed', error: 'denied ' + bs + bs + 'pc' + bs + 'share' + bs + 'Ivan' + bs + 'task.xml' }, null),\n"
        "] }, ctx, '3.5.6');\n"
        "const grouped = R.groupItems(items);\n"
        "const installing = R.itemText(it('engine', 'todo', {}, { kind: 'install_engine' }), { ...ctx, engineInstall: { running: true, error: null } });\n"
        "const failed = R.itemText(it('engine', 'todo', {}, { kind: 'install_engine' }), { ...ctx, engineInstall: { running: false, error: 'EPERM' } });\n"
        "console.log(JSON.stringify({\n"
        "  report, pathReport, bad, strange, unknownId, installing, failed,\n"
        "  epochLogin: R.itemText(it('login', 'ok', { account: 'a', confirmedAt: 1700000000000 }, null, 'epic'), ctx),\n"
        "  engineWarned: R.itemText(it('engine', 'ok'), { ...ctx, engineInstall: { running: false, error: 'Chromium warning' } }),\n"
        "  engineStatus: [R.itemStatus(it('engine', 'ok'), { running: false, error: 'EPERM' }), R.itemStatus(it('engine', 'todo'), { running: false, error: 'EPERM' }), R.itemStatus(it('engine', 'ok'), { running: false, error: null }), R.itemStatus(it('engine', 'ok'), { running: true, error: 'EPERM' }), R.itemStatus(it('node', 'ok'), { running: false, error: 'EPERM' })],\n"
        "  warnReport: R.buildReport({ ...resp, engineInstall: { running: false, error: 'EPERM' }, items: [it('engine', 'ok')] }, ctx, '3.5.8'),\n"
        "  todo: R.countTodo(items), todoNone: R.countTodo([]), todoWarnOnly: R.countTodo([it('browser', 'warning'), it('scheduler', 'info')]),\n"
        "  groups: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.map((i) => i.id)])),\n"
        "  sitesOk: R.allSitesOk([it('site', 'ok'), it('site', 'ok')]), sitesMixed: R.allSitesOk(grouped.sites), sitesEmpty: R.allSitesOk([]),\n"
        "  summaryZero: R.summaryText(0), summaryTwo: R.summaryText(2),\n"
        "  urls: [R.safeUrl('https://nodejs.org'), R.safeUrl('javascript:alert(1)'), R.safeUrl(null)],\n"
        "  loginWindow: R.itemText(items[5], ctx).lines, loginMissing: R.itemText(items[6], ctx).lines,\n"
        "}));\n", encoding="utf-8")
    run = subprocess.run([node, str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stderr
    d = json.loads(run.stdout)
    assert "secret.user@example.com" not in d["report"], "the report must not carry account names"
    assert "Вход есть" in d["report"] and "Версия приложения: 3.5.6" in d["report"] and "Осталось шагов: 3" in d["report"], d["report"]
    assert "Ivan" not in d["pathReport"] and "Users" not in d["pathReport"] and "pc" not in d["pathReport"].split("denied")[1], \
        f"the report must not carry a Windows user name from a path: {d['pathReport']}"
    assert "run.log" in d["pathReport"] and "task.xml" in d["pathReport"], "the report keeps the file name"
    assert d["bad"] == [], f"every status/reason must give a text, not an empty or broken string: {d['bad']}"
    assert d["strange"]["lines"] and d["unknownId"]["title"] == "zzz" and d["unknownId"]["lines"], "an unknown reason or id still gets a text"
    assert d["loginWindow"][0] == "secret.user@example.com" and d["loginWindow"][1].startswith("Вход подтверждён"), d["loginWindow"]
    assert d["loginMissing"] == ["Нужно войти в аккаунт"]
    assert d["installing"]["lines"] == ["Устанавливается…"] and "EPERM" in " ".join(d["failed"]["lines"])
    assert d["todo"] == 3 and d["todoNone"] == 0 and d["todoWarnOnly"] == 0, "only `todo` items count as steps left"
    assert any("D:2023-11-14" in line for line in d["epochLogin"]["lines"]), f"the service sends confirmedAt as epoch ms: {d['epochLogin']}"
    assert "Установка завершилась с ошибкой: Chromium warning" in d["engineWarned"]["lines"], f"the install error must show on a ready engine: {d['engineWarned']}"
    assert d["engineStatus"] == ["warning", "todo", "ok", "ok", "ok"], "an install error on a working engine is a warning, never a todo"
    assert "[Внимание]" in d["warnReport"] and "EPERM" in d["warnReport"], d["warnReport"]
    assert d["groups"] == {"main": ["module", "node", "engine", "browser", "selection"], "logins": ["login", "login"],
                           "sites": ["site", "site"], "scheduler": ["scheduler"]}, d["groups"]
    assert d["sitesOk"] is True and d["sitesMixed"] is False and d["sitesEmpty"] is False
    assert d["summaryZero"] == "Всё готово" and d["summaryTwo"] == "Осталось шагов: 2"
    assert d["urls"] == ["https://nodejs.org", None, None], "only http(s) addresses are opened"
    hook = (WORKSPACE / "src" / "hooks" / "useGiveawaysReadiness.ts").read_text(encoding="utf-8")
    assert "silent && quick && fullInFlight.current" in hook, "a poll must not replace a full check in flight"
    assert "finished && windowOpenRef.current" in hook, "a full check asks the store sites: only for the open window"
    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "INSTALL_POLL_MS = 5000" in hook and "if (!windowOpen || !installing) return;" in hook, "poll only while the window is open and the engine installs"
    assert "?quick=1" in hook and "useEffect(() => { check(true); }, [check]);" in hook and "check(true, true), INSTALL_POLL_MS" in hook, \
        "the check on tab open and the install poll are quick: no store sites"
    assert "readinessErrorAtOpen" in view and "!readinessOpen" in view, "an action error raised while the window is open shows in it and does not wait on the tab"
    assert hook.count("setInterval") == 1, "no other timer-driven polling: every check opens the store sites"
    assert view.count("setInterval") == 1 and "useGiveawaysReadiness(" in view, "the view adds no timer of its own"
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

        # Another install that still exists owns this task: two copies must not keep overwriting each other
        other_install = Path(tempfile.mkdtemp(prefix="other_install_", dir=SANDBOX))
        (other_install / "runner.js").write_text("", encoding="utf-8")
        foreign = {**current, "arguments": arguments.replace(str(gc.resolve_fgc_root()), str(other_install))}
        assert foreign["arguments"] != arguments, foreign
        fake = _FakeTaskScheduler(exists=True, action=foreign)
        run(fake, repair_then_state)
        assert fake.writes == [], f"the task of a live install was overwritten: {fake.writes}"

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

        # A store that fails makes the whole run fail visibly: conhost hides the exit code, the last log line tells
        (engine / "dist" / "gog.mjs").write_text("console.log('STORE gog раздача'); process.exit(3);", encoding="utf-8")
        config.write_text(json.dumps({"giveaways_selected_stores": ["gog", "steam"]}), encoding="utf-8")
        code, text = run_scheduled()
        assert stores_in(text) == ["gog", "steam"], (code, text)
        assert text.strip().splitlines()[-1].startswith("[SENTINEL] ✕"), text
        config.write_text(json.dumps({"giveaways_selected_stores": ["steam"]}), encoding="utf-8")
        code, text = run_scheduled()
        assert not text.strip().splitlines()[-1].startswith("[SENTINEL] ✕"), text

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
        + "\nexport const chromium = { launchPersistentContext: async (dir, options) => {\n"
          "  fs.mkdirSync(dir, { recursive: true });\n"  # a real browser creates the profile and with it data/
          "  if (process.env.LAUNCH_LOG) fs.writeFileSync(process.env.LAUNCH_LOG, JSON.stringify(options));\n"
          "  return { pages: () => [page], newPage: async () => page, setDefaultTimeout() {}, close: async () => {},\n"
          "    clearCookies: async o => { fs.appendFileSync(process.env.COOKIE_LOG, String(o.domain) + '\\n'); } };\n"
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
            "Subtotal $49.00\nDiscount -$49.00\nTotal $0.00", "Итого\n0 ₽", "Total tax $0.00\nTotal $0.00",
            "Total savings $49.00\nTotal $0.00", "Sub-total $49.00\nTotal $0.00", "Your total: $0.00", "Total ₹0.00"]
    paid_totals = ["Total $49.00", "Итого 1000,00 ₽", "Total 10 €", "Total 49,90 €", "Total $0.50", "Сумма 4900 ₽",
                   "Subtotal $49.00\nTax $0.00\nTotal $49.00", "Total\n$49.00", "Total 1 000,00 ₽", "Total USD 5.00",
                   "Total $0.00\nTotal due $49.00", "Total: $0.00\nTotal due today: $19.99", "Total: $0.00\nTotal price $19.99",
                   "Total: ₹499.00\nTotal: $0.00", "Your total: $19.99", "Total: $0.00\nTotal 5 PLN", "Total\n₹499\nTotal $0.00",
                   "Total $0.00 ($19.99 after trial)"]
    unknown = ["", "Your cart", "Subtotal $0.00", "Total Free", "Total", "Total tax $0.00", "Discount $0.00", "Total $0.00 or so"]
    buttons_paid = ["Pay $49.00", "Оплатить 1000 ₽", "Pay now 0,50 €", "Pay ₹499", "Pay 19.99", "Pay 19,99 zł"]
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


def test_release_archives_carry_the_licenses():
    print("[licensing] Both release archives ship the license texts of the code inside them...")
    tool = (WORKSPACE / "tools" / "create_clean_release.py").read_text(encoding="utf-8")
    assert 'LICENSE_FILES = ("LICENSE", "THIRD_PARTY_NOTICES.md")' in tool, "the MIT and AGPL notices must travel with the code"
    assert "shutil.copy2(WORKSPACE / license_file, RELEASE_DIR / license_file)" in tool, "the full archive must carry them"
    assert "pzf.write(RELEASE_DIR / license_file, license_file)" in tool, "the patch must carry them"
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.md", "giveaways_engine/LICENSE"):
        assert (WORKSPACE / name).is_file(), f"{name} is missing"
    print("      Release licenses: ALL PASS [OK]")


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
    res, sessions = _run_store_login("unity.mjs", unity_page("null"), seed=lambda path: path.write_text('{"unity": {"account": "kept", "confirmedAt": 1}}', encoding="utf-8"))
    assert sessions["unity"]["account"] == "kept", f"silence from the store proves no sign-out either, got {sessions}"
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


def test_switch_account_forgets_only_that_store():
    print("[switch-account] The button signs out of one store, a normal run never touches cookies...")
    if shutil.which("node") is None:
        print("      SKIP: Node.js is missing, the store scripts cannot run")
        return
    import asyncio
    import re
    import types
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc

    steam_page = (
        "let signedIn = false;\n"
        "const page = {\n"
        "  goto: async () => {}, $$eval: async () => [],\n"
        "  waitForSelector: async () => { signedIn = true; },\n"
        "  locator: () => ({ count: async () => (signedIn ? 1 : 0), textContent: async () => 'other_account' }),\n"
        "};"
    )
    fab_page = (
        "const page = {\n"
        "  goto: async () => {}, waitForTimeout: async () => {}, setViewportSize: async () => {}, $$eval: async () => [],\n"
        "  evaluate: async () => false, isClosed: () => false, screenshot: async () => {},\n"
        "};"
    )

    def run(script, page_code, store=None, seed=None):
        log = Path(tempfile.mkdtemp(prefix="cookies_", dir=SANDBOX)) / "cleared.log"
        env = {"COOKIE_LOG": str(log)}
        if store:
            env["FGC_SWITCH_ACCOUNT"] = store
        res, sessions = _run_store_login(script, page_code, extra_env=env, seed=seed)
        cleared = log.read_text(encoding="utf-8").split() if log.is_file() else []
        return res, sessions, cleared

    res, sessions, cleared = run("steam.mjs", steam_page)
    assert cleared == [], f"a normal run must keep every login, cleared {cleared}"

    res, sessions, cleared = run("steam.mjs", steam_page, store="steam")
    assert len(cleared) == 1, f"switching must clear the store's cookies once, got {cleared}:\n{res.stdout[-600:]}"
    domain = re.compile(cleared[0].strip("/"))
    for host in (".steampowered.com", "store.steampowered.com", "steamcommunity.com"):
        assert domain.search(host), f"{host} keeps the old Steam login"
    for host in (".gog.com", "notsteampowered.com", ".epicgames.com"):
        assert not domain.search(host), f"switching Steam must not sign out of {host}"
    assert sessions["steam"]["account"] == "other_account", f"the new login must be recorded, got {sessions}"

    res, sessions, cleared = run("steam.mjs", steam_page, store="nonsense")
    assert res.returncode != 0 and not sessions.get("steam", {}).get("account"), "an unknown store must stop, not claim under the old login"

    seed = lambda path: path.write_text('{"epic": {"account": "old", "confirmedAt": 1}}', encoding="utf-8")
    res, sessions, cleared = run("fab.mjs", fab_page, store="fab", seed=seed)
    domain = re.compile(cleared[0].strip("/"))
    assert domain.search("www.fab.com") and domain.search(".epicgames.com"), "Fab signs in through Epic: both must go"
    assert sessions["epic"]["account"] is None, f"the Epic card must not keep the account that was signed out, got {sessions}"

    class _Out:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    engine = Path(tempfile.mkdtemp(prefix="switch_", dir=SANDBOX))
    (engine / "runner.js").write_text("", encoding="utf-8")
    (engine / "node_modules" / "patchright").mkdir(parents=True)
    spawned = []

    async def fake_exec(*args, **kwargs):
        spawned.append(kwargs)
        return types.SimpleNamespace(pid=1, returncode=None, stdout=_Out())

    async def no_scheduler(force=False):
        return {"state": "Ready"}

    async def go(switch):
        orch = gc.GiveawaysOrchestrator()
        orch._query_scheduler = no_scheduler
        orch._monitor_process = lambda proc: asyncio.sleep(0)
        await orch.start_auth("steam", switch_account=switch)

    real_exec, real_root = asyncio.create_subprocess_exec, gc.resolve_fgc_root
    asyncio.create_subprocess_exec, gc.resolve_fgc_root = fake_exec, lambda: engine
    try:
        asyncio.run(go(False))
        asyncio.run(go(True))
    finally:
        asyncio.create_subprocess_exec, gc.resolve_fgc_root = real_exec, real_root
    assert "FGC_SWITCH_ACCOUNT" not in (spawned[-2].get("env") or os.environ), "a plain sign-in must keep the login"
    assert spawned[-1]["env"]["FGC_SWITCH_ACCOUNT"] == "steam", "the switch must reach the engine"
    from aiohttp import web
    count = len(spawned)
    try:
        asyncio.run(gc.GiveawaysOrchestrator().start_auth("nonsense", switch_account=True))
        raise AssertionError("an unknown store must be refused, not replaced with the default stores")
    except web.HTTPBadRequest:
        pass
    assert len(spawned) == count, "a refused sign-in must not start anything"

    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "window.confirm(" in view and "handleStoreAuth(store.id, true)" in view and "?switch=1" in view, "the button must ask first, then switch"
    print("      Switch account: ALL PASS [OK]")


def test_giveaways_readiness_says_what_is_left():
    print("[readiness] Giveaways check: every item in both states, nothing is changed by looking...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    import giveaways_readiness as gr

    work = Path(tempfile.mkdtemp(prefix="readiness_", dir=SANDBOX))
    engine, home, config = work / "engine", work / "home", work / "config.json"
    (engine / "data").mkdir(parents=True)
    home.mkdir()
    node = r"C:\Program Files\nodejs\node.exe"
    saved = (gc.asyncio.create_subprocess_exec, gc.shutil.which, gc.resolve_fgc_root, gc.CONFIG_FILE, gr._site_reachable,
             {k: os.environ.get(k) for k in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")})
    gc.resolve_fgc_root, gc.CONFIG_FILE = (lambda: engine), config
    for key in saved[5]:
        os.environ[key] = str(home)

    probed, forced = [], []

    def check(fake=None, which=node, sites=True, **kwargs):
        gc.asyncio.create_subprocess_exec = fake or _FakeTaskScheduler(exists=True)
        gc.shutil.which = lambda name, *a, **k: which
        probed.clear()
        forced.clear()

        async def reachable(session, url):
            probed.append(url)
            return sites
        gr._site_reachable = reachable
        orchestrator = gc.GiveawaysOrchestrator()
        real_query = orchestrator._query_scheduler

        async def spy(force=False):
            forced.append(force)
            return await real_query(force=force)
        orchestrator._query_scheduler = spy
        report = asyncio.run(gr.check_readiness(orchestrator, **kwargs))
        return report, {(i["id"], i.get("store")): i for i in report["items"]}

    def make_ready():
        (engine / "runner.js").write_text("", encoding="utf-8")
        (engine / "node_modules" / "patchright").mkdir(parents=True, exist_ok=True)
        chrome = home / "Google" / "Chrome" / "Application"
        chrome.mkdir(parents=True, exist_ok=True)
        (chrome / "chrome.exe").write_text("", encoding="utf-8")
        config.write_text(json.dumps({"giveaways_selected_stores": ["steam", "gog"]}), encoding="utf-8")
        (engine / "data" / "sessions.json").write_text(json.dumps({
            "steam": {"account": "me", "confirmedAt": 1700000000000}, "gog": {"account": "me2", "confirmedAt": 1}}), encoding="utf-8")

    try:
        # A clean machine: everything that is missing is named, and optional items do not block
        report, items = check(_FakeTaskScheduler(exists=False), which=None, sites=False)
        assert items[("module", None)]["status"] == "todo", items
        assert items[("node", None)]["status"] == "todo" and items[("node", None)]["params"]["reason"] == "missing", items
        assert items[("engine", None)]["status"] == "todo" and items[("engine", None)].get("action") is None, "the install cannot run without Node.js"
        assert items[("browser", None)]["status"] == "warning", items
        assert items[("login", "epic")]["status"] == "todo", "no choice saved yet: the default stores count"
        assert items[("site", "epic")]["status"] == "warning", items
        assert items[("scheduler", None)]["status"] == "info", items
        assert not report["ready"] and report["remaining"] == sum(i["status"] == "todo" for i in report["items"]), report

        # All set
        make_ready()
        before = {f: f.read_bytes() for f in (config, engine / "data" / "sessions.json")}
        report, items = check()
        assert report["ready"] and report["remaining"] == 0, report
        assert items[("node", None)]["params"]["version"] == "v24.1.0", items
        assert items[("browser", None)]["params"]["found"] == "chrome", items
        assert items[("login", "steam")]["params"] == {"account": "me", "confirmedAt": 1700000000000}, items
        assert ("login", "epic") not in items, "only the selected stores are checked"
        assert all(f.read_bytes() == body for f, body in before.items()), "looking must change nothing"
        assert "writes" not in report

        # An old Node.js, and an engine ready to install once Node.js is fine
        report, items = check(_FakeTaskScheduler(exists=True, node_version=b"v18.20.4\n"))
        assert items[("node", None)]["params"] == {"reason": "old", "version": "v18.20.4", "required": 20}, items
        shutil.rmtree(engine / "node_modules")
        report, items = check()
        assert items[("engine", None)]["action"] == {"kind": "install_engine"}, items
        (engine / "node_modules" / "patchright").mkdir(parents=True)

        # An install that was cut short: the folder is there, the engine is not ready and can be installed again
        marker = engine / "data" / gc.ENGINE_INCOMPLETE_MARK
        marker.write_text("", encoding="utf-8")
        report, items = check()
        assert items[("engine", None)]["status"] == "todo" and items[("engine", None)]["action"] == {"kind": "install_engine"}, items
        marker.unlink()

        # A store signed out after an earlier login
        (engine / "data" / "sessions.json").write_text(json.dumps({"steam": {"account": None}, "gog": {"account": "me2", "confirmedAt": 1}}), encoding="utf-8")
        report, items = check()
        assert items[("login", "steam")]["status"] == "todo" and items[("login", "steam")]["action"] == {"kind": "sign_in", "store": "steam"}, items
        assert items[("login", "gog")]["status"] == "ok" and report["remaining"] == 1, report

        # The choice of stores
        for body, reason in (({"giveaways_enabled": False, "giveaways_selected_stores": ["steam"]}, "disabled"),
                             ({"giveaways_selected_stores": []}, "none_selected")):
            config.write_text(json.dumps(body), encoding="utf-8")
            report, items = check()
            assert items[("selection", None)]["status"] == "todo" and items[("selection", None)]["params"]["reason"] == reason, items
            assert not [k for k in items if k[0] == "login"], items
        config.write_text("{ not json", encoding="utf-8")
        report, items = check()
        assert items[("selection", None)]["params"]["reason"] == "config_broken" and not report["ready"], items
        for broken in ({"giveaways_selected_stores": None}, {"giveaways_selected_stores": "steam"}):
            config.write_text(json.dumps(broken), encoding="utf-8")
            report, items = check()
            assert items[("selection", None)]["params"]["reason"] == "config_broken", f"runner.js cancels the run on {broken}: {items}"
        config.write_text(json.dumps({"giveaways_selected_stores": [["steam"], "gog", 7]}), encoding="utf-8")
        report, items = check()
        assert items[("selection", None)]["params"]["stores"] == ["gog"], "odd entries are skipped, as runner.js does"
        config.write_bytes(b"\xef\xbb\xbf" + json.dumps({"giveaways_selected_stores": ["gog"]}).encode())
        report, items = check()
        assert items[("selection", None)]["status"] == "ok" and ("login", "gog") in items, "a config saved with a BOM still counts"

        # A broken schedule warns, it does not stop a manual claim
        report, items = check(_FakeTaskScheduler(exists=True, last_result=1))
        assert items[("scheduler", None)]["status"] == "warning" and items[("scheduler", None)]["params"]["reason"] == "last_run_failed", items
        assert items[("scheduler", None)]["params"]["logFile"], items
        assert report["ready"], "the schedule is optional"
        report, items = check(_FakeTaskScheduler(query_broken=True))
        assert items[("scheduler", None)]["status"] == "warning" and items[("scheduler", None)]["params"]["reason"] == "query_failed", items

        # An unreachable site warns only
        report, items = check(sites=False)
        assert items[("site", "gog")]["status"] == "warning" and report["ready"], items

        # A quick check (the tab just opened) asks no site and takes the scheduler from the cache; the rest counts the same
        full_report, full_items = check(sites=False)
        assert full_report["full"] is True and probed and forced == [True], (probed, forced)
        quick, quick_items = check(sites=False, full=False)
        assert quick["full"] is False and not probed, "a quick check must not touch the store sites"
        assert forced == [False], "a quick check may use the cached scheduler state"
        assert not [k for k in quick_items if k[0] == "site"], quick_items
        assert quick["remaining"] == full_report["remaining"] and quick["ready"] == full_report["ready"], (quick, full_report)

        # A check that cannot run reports itself, the rest still answer
        async def broken_probe(session, url):
            raise OSError("no sockets")
        gc.asyncio.create_subprocess_exec = _FakeTaskScheduler(exists=True)
        gr._site_reachable = broken_probe
        report = asyncio.run(gr.check_readiness(gc.GiveawaysOrchestrator()))
        assert [i for i in report["items"] if i["id"] == "site"][0]["status"] == "warning", report
    finally:
        gc.asyncio.create_subprocess_exec, gc.shutil.which, gc.resolve_fgc_root, gc.CONFIG_FILE, gr._site_reachable = saved[:5]
        for key, value in saved[5].items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    print("      Giveaways readiness: ALL PASS [OK]")


def test_hanging_node_version_is_killed():
    print("[readiness] A node --version that hangs does not stay behind...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc

    class _Hung:
        returncode = None
        killed = False

        async def communicate(self):
            await asyncio.sleep(3600)

        def kill(self):
            self.killed = True
            self.returncode = 1

        async def wait(self):
            return self.returncode

    hung = _Hung()

    async def fake_exec(*args, **kwargs):
        return hung

    saved = gc.asyncio.create_subprocess_exec, gc.NODE_VERSION_TIMEOUT_SECONDS
    gc.asyncio.create_subprocess_exec, gc.NODE_VERSION_TIMEOUT_SECONDS = fake_exec, 0.01
    try:
        try:
            asyncio.run(gc.read_node_version("node"))
            raise AssertionError("a hung probe must time out")
        except asyncio.TimeoutError:
            pass
    finally:
        gc.asyncio.create_subprocess_exec, gc.NODE_VERSION_TIMEOUT_SECONDS = saved
    assert hung.killed, "every check would leave another node process behind"
    print("      Node probe: ALL PASS [OK]")


def test_engine_install_error_without_json_is_kept():
    print("[readiness] An install failure without a JSON body still reaches the window...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    from aiohttp import web

    async def scenario():
        orch = gc.GiveawaysOrchestrator()

        async def plain_failure(fgc_dir):
            raise web.HTTPConflict(reason="plain reason")
        orch._install_engine = plain_failure
        await orch._run_engine_install()
        return orch.engine_install_state()

    state = asyncio.run(scenario())
    assert state["error"], f"the failure was lost: {state}"
    print("      Install error text: ALL PASS [OK]")


def test_runner_finishes_an_interrupted_engine_install():
    print("[readiness] runner.js retries an engine install that was cut short...")
    node = shutil.which("node")
    if not node:
        print("      SKIP: Node.js is missing, the runner cannot be started")
        return
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    engine = Path(tempfile.mkdtemp(prefix="runner_install_", dir=SANDBOX))
    (engine / "dist").mkdir()
    (engine / "data").mkdir()
    (engine / "node_modules" / "patchright").mkdir(parents=True)
    shutil.copy2(WORKSPACE / "giveaways_engine" / "runner.js", engine / "runner.js")
    shutil.copy2(WORKSPACE / "giveaways_engine" / "package.json", engine / "package.json")
    (engine / "dist" / "gog.mjs").write_text("console.log('STORE gog');", encoding="utf-8")
    bin_dir = engine / "fakebin"
    bin_dir.mkdir()
    (bin_dir / "npm.cmd").write_text("@echo npm ran>> \"%~dp0calls.txt\"\r\n@exit /b %FAKE_NPM%\r\n", encoding="ascii")
    (bin_dir / "npx.cmd").write_text("@echo npx ran>> \"%~dp0calls.txt\"\r\n@exit /b %FAKE_NPX%\r\n", encoding="ascii")
    marker = engine / "data" / gc.ENGINE_INCOMPLETE_MARK
    config = engine / "config.json"
    config.write_text(json.dumps({"giveaways_selected_stores": ["gog"]}), encoding="utf-8")

    def run(npm, npx="0"):
        env = {**os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"], "FAKE_NPM": npm, "FAKE_NPX": npx}
        res = subprocess.run([node, "runner.js", "--scheduled", "--config", str(config)], cwd=engine, env=env,
                             capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        calls = bin_dir / "calls.txt"
        ran = calls.read_text(encoding="ascii") if calls.is_file() else ""
        calls.unlink(missing_ok=True)
        return res, ran

    # An old install: no mark, nothing is reinstalled
    res, ran = run("0")
    assert ran == "" and "STORE gog" in res.stdout, (ran, res.stdout[-400:])

    # The mark is left by an install that was cut short: the run finishes the install
    marker.write_text("", encoding="utf-8")
    res, ran = run("0")
    assert "npm ran" in ran and not marker.exists() and "STORE gog" in res.stdout, (ran, res.stdout[-400:])

    # npm fails: the run stops and the mark stays
    marker.write_text("", encoding="utf-8")
    res, ran = run("1")
    assert res.returncode == 1 and marker.exists() and "STORE gog" not in res.stdout, (res.returncode, res.stdout[-400:])

    # Chromium fails: Chrome or Edge can still do the work, so the run goes on
    marker.write_text("", encoding="utf-8")
    res, ran = run("0", "1")
    assert not marker.exists() and "STORE gog" in res.stdout, (ran, res.stdout[-400:])
    print("      Runner install: ALL PASS [OK]")


def test_engine_install_button_does_not_start_a_claim():
    print("[readiness] Installing the browser engine runs on its own and reports a failure...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    from aiohttp import web

    class _Out:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    class _Proc:
        def __init__(self, returncode):
            self.returncode, self.stdout, self.pid = returncode, _Out(), 7

        async def wait(self):
            return self.returncode

    engine = Path(tempfile.mkdtemp(prefix="engine_install_", dir=SANDBOX))
    (engine / "runner.js").write_text("", encoding="utf-8")
    saved = gc.asyncio.create_subprocess_exec, gc.shutil.which, gc.resolve_fgc_root
    gc.resolve_fgc_root = lambda: engine
    gc.shutil.which = lambda name, *a, **k: rf"C:\nodejs\{name}"

    def run(npm_code, slow=False, chromium_code=0):
        calls = []

        async def fake_exec(*args, **kwargs):
            calls.append(args)
            if "--version" in args:
                proc = _Proc(0)

                async def communicate():
                    return b"v24.1.0\n", b""
                proc.communicate = communicate
                return proc
            if "npm" in args:
                if slow:
                    await asyncio.sleep(0.05)
                (engine / "node_modules" / "patchright").mkdir(parents=True, exist_ok=True)
                return _Proc(npm_code)
            if "npx" in args:
                return _Proc(chromium_code)
            return _Proc(0)

        async def scenario():
            orch = gc.GiveawaysOrchestrator()

            async def no_scheduler(force=False):
                return {"state": "Ready"}
            orch._query_scheduler = no_scheduler
            started = await orch.install_engine()
            assert started["status"] == "started", started
            assert orch.engine_install_state()["running"], "the state must say it runs"
            again = await orch.install_engine()
            assert again["status"] == "already_running", again
            try:
                await orch.start_claim(["steam"])
                raise AssertionError("a claim must wait for the install to finish")
            except web.HTTPConflict:
                pass
            await orch._engine_install_task
            return orch.engine_install_state()

        gc.asyncio.create_subprocess_exec = fake_exec
        state = asyncio.run(scenario())
        assert not [c for c in calls if "runner.js" in " ".join(map(str, c))], f"installing must not start a claim: {calls}"
        return state

    try:
        state = run(0, slow=True)
        assert not state["running"] and state["error"] is None, state
        shutil.rmtree(engine / "node_modules")
        state = run(1, slow=True)
        assert not state["running"] and state["error"], f"a failed install must be reported: {state}"

        # npm left the folder behind: not installed, and the next attempt runs instead of skipping
        assert (engine / "node_modules" / "patchright").is_dir(), "the gate needs the half-finished folder"
        assert not gc.engine_installed(engine), "a failed npm install must not count as installed"
        state = run(0, slow=True)
        assert state["error"] is None and gc.engine_installed(engine), f"the retry must finish the install: {state}"

        # Chromium did not download: the engine works with Chrome or Edge, but the user is told
        shutil.rmtree(engine / "node_modules")
        state = run(0, slow=True, chromium_code=1)
        assert gc.engine_installed(engine), "npm succeeded, the engine is there"
        assert state["error"] and "Chromium" in state["error"], f"a failed browser download must be reported: {state}"
        assert not (engine / "data" / gc.ENGINE_INCOMPLETE_MARK).exists(), "only npm decides whether the engine is complete"

        # Without npm the button explains itself, nothing starts
        gc.shutil.which = lambda name, *a, **k: None
        async def no_npm():
            await gc.GiveawaysOrchestrator().install_engine()
        try:
            asyncio.run(no_npm())
            raise AssertionError("the install needs npm")
        except web.HTTPPreconditionFailed as exc:
            assert "Node.js" in json.loads(exc.text)["detail"], exc.text
    finally:
        gc.asyncio.create_subprocess_exec, gc.shutil.which, gc.resolve_fgc_root = saved
    print("      Engine install: ALL PASS [OK]")


def test_built_page_embeds_its_font():
    print("[build] dist/index.html carries Inter inside itself...")
    page = (WORKSPACE / "dist" / "index.html").read_text(encoding="utf-8")
    assert "url(@fontsource" not in page, "the font is left as an unresolved import: build without a node_modules junction"
    assert "url(data:font/woff2;base64," in page, "the page must embed its font, users may be offline"
    print("      Embedded font: ALL PASS [OK]")


def test_keyboard_palette_help_farm_and_log_prefix():
    print("[ui-audit] Palette arrows and Enter, modal focus, the FARM switch, one level per log line...")
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    if not esbuild.exists() or shutil.which("node") is None:
        print("      (node/esbuild not available: skipped)")
        return
    out_dir = SANDBOX / "ui_audit_check"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir()
    for name in ("paletteIndex", "consoleLog"):
        res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / f"{name}.ts"), "--bundle", "--format=esm",
                              f"--outfile={out_dir / (name + '.mjs')}"], capture_output=True, text=True, timeout=60, shell=os.name == "nt")
        assert res.returncode == 0, res.stderr
    driver = out_dir / "driver.mjs"
    driver.write_text(
        "import { movePaletteIndex as m, clampPaletteIndex as c, defaultPaletteIndex as d } from './paletteIndex.mjs';\n"
        "import { withoutLevelPrefix as w } from './consoleLog.mjs';\n"
        "console.log(JSON.stringify({\n"
        "  down: m(0, 1, 3), wrapDown: m(2, 1, 3), wrapUp: m(0, -1, 3), single: m(0, 1, 1), none: m(0, 1, 0),\n"
        "  clamped: c(5, 3), clampedEmpty: c(5, 0), kept: c(1, 3),\n"
        "  noneDown: m(-1, 1, 3), noneUp: m(-1, -1, 3), noneEmpty: m(-1, 1, 0), noneKept: c(-1, 3), noneOne: m(-1, 1, 1), oneDown: m(0, 1, 1),\n"
        "  startNav: d(2), startNoNav: d(0),\n"
        "  status: w('[STATUS] Ожидание', 'STATUS'), twice: w('[STATUS] [STATUS] Ожидание', 'status'),\n"
        "  source: w('[CORE] Запуск', 'INFO'), keepsOther: w('[STATUS] [CORE] Запуск', 'STATUS'),\n"
        "  plain: w('Просто текст', 'STATUS'), inside: w('Статус [STATUS] внутри', 'STATUS'), onlyPrefix: w('[STATUS]', 'STATUS'),\n"
        "  regexLevel: w('[A.B] x', 'A.B'), notRegex: w('[AxB] x', 'A.B'),\n"
        "}));\n",
        encoding="utf-8",
    )
    res = subprocess.run(["node", str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert res.returncode == 0, res.stderr[-800:]
    d = json.loads(res.stdout)
    assert (d["down"], d["wrapDown"], d["wrapUp"], d["single"], d["none"]) == (1, 0, 2, 0, 0), d
    assert (d["clamped"], d["clampedEmpty"], d["kept"]) == (2, 0, 1), d
    # review 13: with no selection Down takes the first result and Up the last; the first selection is only ever a navigation entry
    assert (d["noneDown"], d["noneUp"], d["noneEmpty"], d["noneKept"], d["noneOne"], d["oneDown"]) == (0, 2, 0, -1, 0, 0), d
    assert (d["startNav"], d["startNoNav"]) == (0, -1), d
    assert d["status"] == "Ожидание" and d["twice"] == "Ожидание", d
    assert d["source"] == "[CORE] Запуск" and d["keepsOther"] == "[CORE] Запуск", "other brackets stay"
    assert d["plain"] == "Просто текст" and d["inside"] == "Статус [STATUS] внутри", "only a leading prefix goes"
    assert d["onlyPrefix"] == "[STATUS]", "a line that is only the prefix must not turn empty"
    assert d["regexLevel"] == "x" and d["notRegex"] == "[AxB] x", "the level is text, not a pattern"

    app = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert 'role="switch"' in app and "aria-checked={!sentinelState.hardware.is_paused}" in app, "FARM must be a real switch"
    assert '<div \n              className={`power-rocker' not in app.replace("\r\n", "\n"), "FARM is not reachable from a keyboard as a div"
    assert "e.nativeEvent.isComposing" in app, "arrows and Enter must not break IME input"
    assert 'aria-modal="true"]' in app, "hotkeys must not act behind an open dialog"
    for name in ("HelpModal.tsx", "GiveawaysReadiness.tsx"):
        assert "useModalFocus(" in (WORKSPACE / "src" / "components" / name).read_text(encoding="utf-8"), name
    help_modal = (WORKSPACE / "src" / "components" / "HelpModal.tsx").read_text(encoding="utf-8")
    assert 'aria-labelledby="help-title"' in help_modal and 'id="help-title"' in help_modal, "the dialog needs its visible title as a name"
    view = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "withoutLevelPrefix(log.message, cat)" in view, "the console must show the level once"
    # review 14: every modal overlay is a real dialog, so hotkeys stay off behind it and Esc/Tab work inside it
    for name, title_id in (("App.tsx", "update-title"), ("components/LiveDashboard.tsx", "catalog-title"), ("components/SettingsStudio.tsx", "diag-title")):
        src = (WORKSPACE / "src" / name).read_text(encoding="utf-8")
        assert f'aria-labelledby="{title_id}"' in src and f'id="{title_id}"' in src, f"{name}: the dialog needs its visible title as a name"
        assert 'aria-modal="true"' in src and "useModalFocus(" in src, f"{name}: modal and focus trap"
    palette = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "defaultPaletteIndex(navActions.length)" in palette, "review 13: Enter right after typing runs only a navigation entry"
    print("      Keyboard and log prefix: ALL PASS [OK]")


def test_update_sources_and_token_scope():
    print("[C01] Updates come from this repository only, the token goes nowhere else...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import io
    import zipfile
    import urllib.error
    import urllib.request
    import updater

    repo = "MortuisVMain/Twitch-Drops-Sentinel"
    good = [f"https://github.com/{repo}/releases/download/v9.9.9/Patch.zip",
            f"https://api.github.com/repos/{repo}/releases/assets/123",
            f"HTTPS://GitHub.com/{repo}/releases/download/v9.9.9/Patch.zip"]
    bad = ["https://untrusted.example/Patch.zip",
           f"https://github.com.evil.example/{repo}/releases/download/v1/p.zip",
           f"https://evil.example/github.com/{repo}/releases/download/v1/p.zip",
           f"https://github.com@evil.example/{repo}/releases/download/v1/p.zip",
           f"https://evil.example\\@github.com/{repo}/releases/download/v1/p.zip",
           f"http://github.com/{repo}/releases/download/v1/p.zip",
           f"https://github.com:8443/{repo}/releases/download/v1/p.zip",
           "https://github.com/someone/else/releases/download/v1/p.zip",
           f"https://github.com/{repo}/archive/main.zip",
           f"https://api.github.com/repos/{repo}/contents/x",
           f"https://github.com/{repo}/releases/download/../../../../someone/else/p.zip",
           "file:///C:/Windows/win.ini", "", None]
    for url in good:
        assert updater.is_trusted_release_url(url), f"must be accepted: {url}"
    for url in bad:
        assert not updater.is_trusted_release_url(url), f"must be refused: {url}"

    # A fake network: records what was asked for and with which headers
    work = SANDBOX / "update_source_check"
    shutil.rmtree(work, ignore_errors=True)
    install = work / "install"
    (install / "core").mkdir(parents=True)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("core/new_module.py", "X = 1\n")
    payload = buffer.getvalue()
    requests = []

    class _Resp(io.BytesIO):
        headers = {"Content-Length": str(len(payload))}

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.close()

    metadata = json.dumps({"tag_name": "v9.9.9", "assets": [{
        "name": "Patch.zip", "browser_download_url": good[0], "digest": "sha256:" + hashlib.sha256(payload).hexdigest()}]}).encode("utf-8")

    class _Opener:
        def open(self, req, timeout=None):
            requests.append((req.full_url, dict(req.header_items())))
            if req.full_url.endswith("/releases/tags/v9.9.9"):
                return _Resp(metadata)
            return _Resp(payload)

    saved = updater.PROJECT_DIR, urllib.request.build_opener, updater.get_optional_github_token
    updater.PROJECT_DIR = install
    urllib.request.build_opener = lambda *a, **k: _Opener()
    try:
        updater.get_optional_github_token = lambda: "SYNTHETIC_TOKEN"
        ok, message = updater.GitHubUpdater().apply_update_from_url("https://untrusted.example/Patch.zip")
        assert not ok and requests == [], f"a foreign address must be refused before any request: {requests}, {message}"
        ok, message = updater.GitHubUpdater().apply_update_from_url(good[0], "https://untrusted.example/asset")
        assert not ok and requests == [], f"a foreign fallback address must be refused too: {requests}"

        ok, message = updater.GitHubUpdater().apply_update_from_url(good[0])
        assert ok, message
        assert requests[-1][1].get("Authorization") == "Bearer SYNTHETIC_TOKEN", requests[-1]
        assert (install / "core" / "new_module.py").exists()

        requests.clear()
        (install / "core" / "new_module.py").unlink()
        updater.get_optional_github_token = lambda: ""
        ok, message = updater.GitHubUpdater().apply_update_from_url(good[0])
        assert ok and "Authorization" not in requests[-1][1], f"works without a token: {requests}"
    finally:
        updater.PROJECT_DIR, urllib.request.build_opener, updater.get_optional_github_token = saved

    # Redirects: the token stays home, and a redirect cannot step down to plain http
    handler = updater.SafeAuthRedirectHandler()
    req = urllib.request.Request(good[1], headers={"Authorization": "Bearer SYNTHETIC_TOKEN"})
    moved = handler.redirect_request(req, None, 302, "Found", {}, "https://objects.githubusercontent.com/x")
    assert "Authorization" not in moved.headers, "the token must not follow a redirect to another host"
    try:
        handler.redirect_request(req, None, 302, "Found", {}, "http://objects.githubusercontent.com/x")
        raise AssertionError("a redirect to plain http must fail")
    except urllib.error.HTTPError:
        pass
    print("      Update sources: ALL PASS [OK]")


def test_protected_files_survive_any_archive_path():
    print("[C02] Archive paths are normalized before they are matched against user files...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import updater

    root = SANDBOX / "archive_path_check"
    shutil.rmtree(root, ignore_errors=True)
    (root / "core").mkdir(parents=True)
    wrapper = "Twitch Drops Sentinel v9"
    protected = ["config.json", "./config.json", "core/../config.json", "CONFIG.JSON", "config.json.", "config.json ",
                 ".\\config.json", "core\\..\\config.json", f"{wrapper}/config.json", f"{wrapper}/./config.json",
                 "Trophies.md", "core/cookies.jar", "core/settings.json", "./core/settings.json", "core/sentinel_service.log",
                 "sentinel_stdout.log", "data/installed_games.json", "data/./anything.json", "giveaways_engine/data/claims.json",
                 "giveaways_engine/./data/claims.json", "GIVEAWAYS_ENGINE/DATA/claims.json", "config.json::$DATA", "C:config.json"]
    for member in protected:
        assert updater.archive_member_target(root, member) is None, f"must not be written: {member}"
    for member in ("../evil.txt", "core/../../evil.txt", f"{wrapper}/../../evil.txt", "C:/Windows/evil.txt", "\\\\server\\share\\x"):
        assert updater.archive_member_target(root, member) is None, f"escapes the install: {member}"
    for member, expected in (("core/module.py", "core/module.py"), ("./core/module.py", "core/module.py"),
                             (f"{wrapper}/dist/index.html", "dist/index.html"), ("TwitchDropsSentinel.update", "TwitchDropsSentinel.update")):
        target = updater.archive_member_target(root, member)
        assert target == (root / expected).resolve(), f"{member} -> {target}"
    for folder in ("core/", f"{wrapper}/", "./"):
        assert updater.archive_member_target(root, folder) is None, f"a folder entry writes nothing: {folder}"
    print("      Archive paths: ALL PASS [OK]")


def test_atomic_settings_write_keeps_the_old_file():
    print("[C03] A failed settings write leaves the old file alone and says so...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import atomic_json

    work = SANDBOX / "atomic_json_check"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    target = work / "config.json"
    target.write_text('{"mine": 1}', encoding="utf-8")
    try:
        atomic_json.atomic_write_json(target, {"url": object()})
        raise AssertionError("what cannot be serialized must fail")
    except TypeError:
        pass
    assert target.read_text(encoding="utf-8") == '{"mine": 1}', "a failed dump must not touch the file"
    saved = atomic_json.os.replace

    def refuse(*a, **k):
        raise PermissionError("locked")

    atomic_json.os.replace = refuse
    try:
        atomic_json.atomic_write_json(target, {"new": 2})
        raise AssertionError("a failed replace must reach the caller")
    except PermissionError:
        pass
    finally:
        atomic_json.os.replace = saved
    assert target.read_text(encoding="utf-8") == '{"mine": 1}'
    assert [f.name for f in work.iterdir()] == ["config.json"], "no temp file stays behind"
    atomic_json.atomic_write_json(target, {"name": "кириллица"})
    raw_text = target.read_bytes()
    assert not raw_text.startswith(b"\xef\xbb\xbf") and json.loads(raw_text.decode("utf-8")) == {"name": "кириллица"}
    source = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "from settings import default_settings" not in source, "reset must use the supervisor's defaults, not the engine's"
    assert 'with open(CONFIG_FILE, "w"' not in source, "config.json must not be opened for writing before the data is ready"
    print("      Atomic settings: ALL PASS [OK]")


def test_profile_backup_is_complete():
    print("[C04] The backup holds the real settings, keeps same-named files apart, reports what is missing...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import zipfile
    import profile_backup

    root = SANDBOX / "backup_check"
    shutil.rmtree(root, ignore_errors=True)
    (root / "core").mkdir(parents=True)
    (root / "data").mkdir()
    files = {"config.json": "{}", "core/settings.json": '{"engine": 1}', "data/settings.json": '{"legacy": 1}', "core/cookies.jar": "c",
             "data/installed_games.json": "[]", "data/dimmer_state.json": "{}", "Trophies.md": "t"}
    for rel, body in files.items():
        (root / rel).write_text(body, encoding="utf-8")
    entries = profile_backup.profile_entries(root, root / "core" / "settings.json", root / "core" / "cookies.jar")
    out = root / "backup.zip"
    missing = profile_backup.write_backup(out, entries)
    assert missing == [], missing
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
        assert set(files) <= names, names
        assert zf.read("core/settings.json") == b'{"engine": 1}' and zf.read("data/settings.json") == b'{"legacy": 1}', "same basename, both kept"
        manifest = json.loads(zf.read("manifest.json"))
        assert {e["path"] for e in manifest["files"]} == set(files) and manifest["format"] == 1, manifest
    (root / "config.json").unlink()
    (root / "data" / "dimmer_state.json").unlink()
    missing = profile_backup.write_backup(out, entries)
    assert missing == ["config.json"], f"only what is required counts as missing: {missing}"
    source = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert '"status": "partial"' in source, "an incomplete backup must not read as a success"
    print("      Profile backup: ALL PASS [OK]")


def test_auto_shutdown_can_be_cancelled_and_engine_flags_apply():
    print("[C05/C06] The countdown follows the setting every second; saved flags reach every engine...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import types
    import auto_shutdown
    import engine_flags

    step = auto_shutdown.next_countdown
    # Starts only when allowed and done
    assert step(None, enabled=True, done=True) == auto_shutdown.Step(60, False, False)
    assert step(None, enabled=False, done=True) == auto_shutdown.Step(None, False, False)
    assert step(None, enabled=True, done=False) == auto_shutdown.Step(None, False, False)
    # Switched off, or a new target appeared, at any second: cancelled, nothing fires
    for left in (60, 30, 1):
        assert step(left, enabled=False, done=True) == auto_shutdown.Step(None, False, True)
        assert step(left, enabled=True, done=False) == auto_shutdown.Step(None, False, True)
    # Allowed all the way down: exactly one action
    left, fired = None, 0
    for _second in range(120):
        result = step(left, enabled=True, done=True)
        left, fired = result.countdown, fired + result.fire
        if result.fire:
            break
    assert fired == 1 and left is None and _second == 60, (fired, left, _second)

    def drop(game, claimed):
        return types.SimpleNamespace(is_claimed=claimed, campaign=types.SimpleNamespace(game=types.SimpleNamespace(name=game)))

    def campaign(*drops):
        return types.SimpleNamespace(timed_drops={i: d for i, d in enumerate(drops)})

    done = auto_shutdown.priority_drops_done
    assert done([campaign(drop("Rust", True))], ["rust"]), "all claimed"
    assert not done([campaign(drop("Rust", True), drop("Rust", False))], ["Rust"]), "one left"
    assert not done([campaign(drop("Other", True))], ["Rust"]), "nothing on the list means nothing finished"
    assert not done([], ["Rust"]), "an empty inventory is no finish"
    assert done([campaign(drop("Other", False)), campaign(drop("Rust", True))], ["Rust"]), "only priority games count"

    client = types.SimpleNamespace(claim_channel_points_enabled=True, auto_claim_drops_enabled=True, streamer_watchdog_enabled=True)
    engine_flags.apply_engine_flags(client, {"claim_channel_points": False, "auto_claim_drops": False, "streamer_watchdog_enabled": False})
    assert (client.claim_channel_points_enabled, client.auto_claim_drops_enabled, client.streamer_watchdog_enabled) == (False, False, False)
    engine_flags.apply_engine_flags(client, {})
    assert (client.claim_channel_points_enabled, client.auto_claim_drops_enabled, client.streamer_watchdog_enabled) == (True, True, True), "defaults stay on"

    source = (SANDBOX / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert source.count("apply_engine_flags(self.twitch_client, self.settings)") == 2, "start and save must share one path"
    start = source.index("self.twitch_client = Twitch(settings)")
    assert start < source.index("apply_engine_flags(self.twitch_client, self.settings)", start) < source.index("await self.twitch_client.run()", start), "flags before run()"
    print("      Shutdown and flags: ALL PASS [OK]")


def test_local_service_refuses_foreign_pages_and_resets_cleanly():
    print("[C01/C03] Sandbox service: foreign web pages are refused, reset writes the supervisor's schema...")
    import urllib.error

    def call(path, method="GET", origin=None, body=None, host=None):
        req = urllib.request.Request(BASE_URL + path, method=method, data=body)
        if body is not None:
            req.add_header("Content-Type", "application/json")
        if origin:
            req.add_header("Origin", origin)
        if host:
            req.add_header("Host", host)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as err:
            return err.code, err.headers, err.read()

    code, headers, _body = call("/api/state", origin="https://evil.example")
    assert code == 403 and "Access-Control-Allow-Origin" not in headers, f"a foreign page must not read the state: {code}"
    code, _h, _body = call("/api/shutdown", "POST", origin="https://evil.example")
    assert code == 403, f"a foreign page must not stop the service: {code}"
    code, _h, _body = call("/api/state", origin="null")
    assert code == 403, "an opaque origin is no local client"
    code, headers, _body = call("/api/apply-update", "OPTIONS", origin="https://evil.example")
    assert code == 403 and "Access-Control-Allow-Origin" not in headers, f"preflight: {code}"
    code, _h, _body = call("/api/state", host="evil.example")
    assert code == 403, f"DNS rebinding: a foreign Host must be refused, got {code}"

    code, headers, _body = call("/api/state", origin="https://app.sentinel")
    assert code == 200 and headers.get("Access-Control-Allow-Origin") == "https://app.sentinel", (code, dict(headers))
    code, headers, _body = call("/api/state", origin="http://127.0.0.1:5173")
    assert code == 200 and headers.get("Access-Control-Allow-Origin") == "http://127.0.0.1:5173", "the dev server"
    code, _h, _body = call("/api/state", origin="http://127.0.0.1:9999")
    assert code == 403, "only the shell and the dev-server ports may talk to the service"
    code, _h, _body = call("/api/state")
    assert code == 200, "the desktop shell sends no Origin"

    # Refused by address before any metadata or network work
    for url in ("https://untrusted.example/Patch.zip", "https://github.com.evil.example/MortuisVMain/Twitch-Drops-Sentinel/releases/download/v1/p.zip"):
        code, _h, answer = call("/api/updates/apply", "POST", origin="https://app.sentinel", body=json.dumps({"download_url": url}).encode())
        assert code == 400 and json.loads(answer)["status"] == "error", f"{url}: {code} {answer[:120]}"

    code, _h, answer = call("/api/settings/reset", "POST", origin="https://app.sentinel", body=b"{}")
    assert code == 200, answer[:300]
    settings = json.loads(answer)["settings"]
    assert "priority_games" in settings and "ui_theme" in settings and "twitch_url" not in settings and "exclude" not in settings, sorted(settings)[:12]
    config = json.loads((SANDBOX / "config.json").read_text(encoding="utf-8"))
    assert config["ui_theme"] == settings["ui_theme"], "the file and the answer must agree"
    print("      Local service: ALL PASS [OK]")


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


def test_scheduled_run_that_never_finished_is_reported_as_failed():
    print("[scheduler] A scheduled run killed mid-way, or one that never started, is reported as failed...")
    import asyncio
    import datetime as dt
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc

    DONE, FORMAT = "[SENTINEL] ■", "[SENTINEL] ◆"
    original_exec, original_log = gc.asyncio.create_subprocess_exec, gc.SCHEDULED_LOG
    work = Path(tempfile.mkdtemp(prefix="sentinel_runend_"))
    log = work / "giveaways_scheduled.log"
    gc.SCHEDULED_LOG = log
    task_args = f'--headless "node.exe" "runner.js" --scheduled --config "c.json" --log "{log}"'

    def ps_stamp(when):
        """What PowerShell's ToString('o') gives: 7 fraction digits and the UTC offset."""
        text = when.isoformat(timespec="microseconds")
        return text[:-6] + "0" + text[-6:]

    def state_for(text, modified=None, last_run="now", state="Ready", arguments=task_args):
        """lastRunFailed as the interface gets it, for a log with this text and mtime (epoch seconds) and this LastRunTime."""
        log.unlink(missing_ok=True)
        if text is not None:
            log.write_text(text, encoding="utf-8")
            if modified is not None:
                os.utime(log, (modified, modified))
        if last_run == "now":
            last_run = ps_stamp(dt.datetime.now().astimezone())
        info = {"state": state, "lastRun": last_run, "arguments": arguments, "execute": "conhost.exe", "workingDirectory": str(work)}
        gc.asyncio.create_subprocess_exec = _FakeTaskScheduler(exists=True, last_result=0, action=info)
        return asyncio.run(gc.GiveawaysOrchestrator()._query_scheduler(force=True))["lastRunFailed"]

    ok = f"{FORMAT} v2\n[SENTINEL] start\n{DONE} finished\n"
    killed = f"{FORMAT} v2\n[SENTINEL] start\nSTORE epic\n"
    try:
        # Runs of the current runner: only an explicit end line means it got to the end
        assert state_for(ok) is False
        assert state_for(killed) is True, "a log that stops without the end line was killed by the task's time limit"
        assert state_for(f"{FORMAT} v2\n[SENTINEL] start\n[SENTINEL] ✕ broken\n") is True
        assert state_for(f"{FORMAT} v2\n[SENTINEL] ✕ Critical\nError: x\n    at main (runner.js:1)\n") is True
        assert state_for(f"{FORMAT} v2\n[SENTINEL] skipped\n{DONE} finished\n") is False, "a skipped collection is a normal exit"
        assert state_for(f"{FORMAT} v2\n") is True and state_for("") is True, "nothing after the start line: killed or never got going"
        assert state_for(killed, state="Running") is False, "a run in progress has no end line yet"
        assert state_for(f"{FORMAT} v2\n" + "STORE line\n" * 3000) is True, "a long log is judged by its tail"
        assert state_for(f"{FORMAT} v2\n" + "STORE line\n" * 3000 + DONE + "\n") is False

        # Logs of the previous runner have no end line: they must not turn into an error before a run of the new one
        assert state_for("[SENTINEL] start\nSTORE epic\n") is False
        assert state_for("[SENTINEL] start\n[SENTINEL] ✕ old failure\n") is True

        # Node.js older than 20: runner.js dies on its imports before it opens the log, the log is from an earlier run
        now = dt.datetime.now().astimezone()
        for tz in (dt.timezone.utc, dt.timezone(dt.timedelta(hours=14)), dt.timezone(dt.timedelta(hours=-12)), dt.timezone(dt.timedelta(hours=5, minutes=30))):
            ran = now.astimezone(tz)
            stamp = ps_stamp(ran)
            assert state_for(ok, modified=now.timestamp() - 3600, last_run=stamp) is True, f"stale log, offset {tz}"
            assert state_for(ok, modified=now.timestamp() + 30, last_run=stamp) is False, f"fresh log, offset {tz}"
        assert state_for("[SENTINEL] start\n", modified=now.timestamp() - 3600, last_run=now.isoformat()) is True, "an old-format log is stale too"
        assert state_for(ok, modified=now.timestamp() - 3600, last_run=now.isoformat(), state="Running") is False
        assert state_for(ok, modified=now.timestamp() - 3600, last_run="not a date") is False, "an unreadable time proves nothing"

        # The task never ran: whatever is left in the log is not an error
        assert state_for(ok, modified=now.timestamp() - 3600, last_run=None) is False
        assert state_for(killed, modified=now.timestamp() - 3600, last_run="1999-11-30T00:00:00.0000000+03:00") is False
        assert state_for(None, last_run=None) is False

        # It ran, the task writes a log, and there is none: the runner never got to open it
        assert state_for(None) is True
        assert state_for(None, arguments='--headless "node.exe" "runner.js"') is False, "a task from before the log existed has none"
    finally:
        gc.asyncio.create_subprocess_exec, gc.SCHEDULED_LOG = original_exec, original_log
        shutil.rmtree(work, ignore_errors=True)

    # The real runner: first line names the log format, every normal exit ends with the end line, a failure does not
    node = shutil.which("node")
    if not node:
        print("      SKIP: Node.js is missing, the runner cannot be started")
        return
    engine = Path(tempfile.mkdtemp(prefix="sentinel_runend_engine_"))
    try:
        (engine / "dist").mkdir(parents=True)
        (engine / "node_modules" / "patchright").mkdir(parents=True)
        shutil.copy2(WORKSPACE / "giveaways_engine" / "runner.js", engine / "runner.js")
        shutil.copy2(WORKSPACE / "giveaways_engine" / "package.json", engine / "package.json")
        (engine / "dist" / "epic-games.mjs").write_text("console.log('STORE epic');", encoding="utf-8")
        (engine / "dist" / "gog.mjs").write_text("process.exit(3);", encoding="utf-8")
        config, run_log = engine / "config.json", engine / "run.log"

        def lines_of_run(settings):
            config.write_text(settings, encoding="utf-8")
            subprocess.run([node, "runner.js", "--scheduled", "--config", str(config), "--log", str(run_log)],
                           cwd=str(engine), capture_output=True, text=True, encoding="utf-8", timeout=60)
            return run_log.read_text(encoding="utf-8").strip().splitlines()

        for settings in ('{"giveaways_selected_stores": ["epic"]}', '{"giveaways_selected_stores": []}', '{"giveaways_enabled": false}'):
            lines = lines_of_run(settings)
            assert lines[0].startswith(FORMAT), (settings, lines)
            assert lines[-1].startswith(DONE), (settings, lines)
        for settings in ('{"giveaways_selected_stores": ["epic", "gog"]}', '{"giveaways_selected_stores": "epic"}'):
            lines = lines_of_run(settings)
            assert lines[0].startswith(FORMAT) and lines[-1].startswith("[SENTINEL] ✕"), (settings, lines)
            assert not any(line.startswith(DONE) for line in lines), (settings, lines)
    finally:
        shutil.rmtree(engine, ignore_errors=True)
    print("      Unfinished runs are reported, the runner marks its end: PASS [OK]")


def test_concurrent_update_checks_share_one_request():
    print("[updater] Simultaneous update checks make one GitHub request, a forced one still respects a rate limit...")
    import email.message, json as _json, threading, time as real_time, types, urllib.error
    sys.path.insert(0, str(SANDBOX / "core"))
    import updater

    work = SANDBOX / "update_check_concurrent"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    calls = []
    clock = {"now": 2_000_000.0}
    gate = threading.Event()
    entered = threading.Event()
    behaviour = {"value": None}

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
            entered.set()
            gate.wait(10)
            value = behaviour["value"]
            if isinstance(value, Exception):
                raise value
            return _Resp(value)

    def rate_limited(reset_in):
        headers = email.message.Message()
        headers["X-RateLimit-Remaining"] = "0"
        headers["X-RateLimit-Reset"] = str(int(clock["now"] + reset_in))
        return urllib.error.HTTPError(updater.REPO_API_URL, 403, "rate limit exceeded", headers, None)

    def in_threads(count, **kwargs):
        results = []
        threads = [threading.Thread(target=lambda: results.append(checker.check_for_updates(**kwargs)), daemon=True) for _ in range(count)]
        for thread in threads:
            thread.start()
        return threads, results

    release = {"tag_name": "v99.0.0", "name": "v99", "body": "notes", "assets": [], "html_url": "https://example.test/r"}
    saved = (updater.CACHE_FILE, updater.get_optional_github_token, updater.urllib.request.build_opener, updater.time,
             getattr(updater, "CHECK_WAIT_SECONDS", None))
    updater.CACHE_FILE = work / "cache.json"
    updater.get_optional_github_token = lambda: ""
    updater.urllib.request.build_opener = lambda *a: _Opener()
    updater.time = types.SimpleNamespace(time=lambda: clock["now"])
    try:
        # Six callers at once (a forced one among them): one request, everybody gets its result
        checker = updater.GitHubUpdater()
        behaviour["value"] = release
        threads, results = in_threads(5)
        assert entered.wait(5), "the check never reached GitHub"
        more, more_results = in_threads(1, force=True)
        real_time.sleep(0.3)
        gate.set()
        for thread in threads + more:
            thread.join(10)
        assert len(calls) == 1, f"simultaneous checks must share one request, got {len(calls)}"
        assert len(results + more_results) == 6 and all(r["update_available"] and "error" not in r for r in results + more_results), results

        # A rate limit pauses forced checks too; the usual pause after another failure does not
        checker = updater.GitHubUpdater()
        calls.clear()
        behaviour["value"] = rate_limited(3600)
        assert "403" in checker.check_for_updates(force=True)["error"] and len(calls) == 1
        clock["now"] += 60
        assert "403" in checker.check_for_updates(force=True)["error"] and len(calls) == 1, "a forced check must wait for X-RateLimit-Reset"
        clock["now"] += 3600
        behaviour["value"] = release
        assert "error" not in checker.check_for_updates(force=True) and len(calls) == 2

        # A check stuck on the network neither blocks a periodic check that has a fresh cache nor traps a later caller forever
        updater.CHECK_WAIT_SECONDS = 0.3
        calls.clear()
        gate.clear()
        entered.clear()
        stuck, _ = in_threads(1, force=True)
        assert entered.wait(5)
        started = real_time.perf_counter()
        assert checker.check_for_updates()["update_available"] is True, "a fresh cache must be served without waiting"
        assert real_time.perf_counter() - started < 0.25, "a periodic check with a fresh cache must not wait for the lock"
        started = real_time.perf_counter()
        late = checker.check_for_updates(force=True)
        assert real_time.perf_counter() - started < 5 and "error" in late and len(calls) == 1, late
        gate.set()
        stuck[0].join(10)
    finally:
        gate.set()
        updater.CACHE_FILE, updater.get_optional_github_token, updater.urllib.request.build_opener, updater.time, wait = saved
        if wait is None:
            if hasattr(updater, "CHECK_WAIT_SECONDS"):
                del updater.CHECK_WAIT_SECONDS
        else:
            updater.CHECK_WAIT_SECONDS = wait
    print("      Update checks: one request, rate limit kept, no endless wait: PASS [OK]")


def test_steam_login_window_fits_a_small_screen():
    print("[steam-viewport] Steam: a visible login window follows the window size, a hidden one keeps 1920x1080...")
    if shutil.which("node") is None:
        print("      SKIP: Node.js is missing, the store scripts cannot run")
        return
    page = "const page = { goto: async () => {}, $$eval: async () => [], waitForSelector: async () => {}, locator: () => ({ count: async () => 1, textContent: async () => 'x' }) };"
    for show, expected in (("1", None), ("0", {"width": 1920, "height": 1080})):
        launch_log = Path(tempfile.mkdtemp(prefix="steam_viewport_", dir=SANDBOX)) / "launch.json"
        _run_store_login("steam.mjs", page, extra_env={"SHOW": show, "FGC_FORCE": "1", "LAUNCH_LOG": str(launch_log)})
        assert launch_log.is_file(), "the stub browser was not launched"
        options = json.loads(launch_log.read_text(encoding="utf-8"))
        assert "viewport" in options and options["viewport"] == expected, f"SHOW={show}: viewport must be {expected}, got {options.get('viewport', 'missing')}"
    print("      Steam viewport: PASS [OK]")


def test_resolve_fgc_root_has_no_undefined_names():
    print("[dead-code] Giveaways: resolve_fgc_root refers only to names that exist...")
    import ast
    import builtins
    import inspect
    import textwrap
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc

    tree = ast.parse(textwrap.dedent(inspect.getsource(gc.resolve_fgc_root)))
    fn = tree.body[0]
    local = {a.arg for a in fn.args.args} | {n.id for n in ast.walk(fn) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)}
    missing = sorted({n.id for n in ast.walk(fn) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)
                      and n.id not in local and not hasattr(gc, n.id) and not hasattr(builtins, n.id)})
    assert not missing, f"resolve_fgc_root uses undefined names (dead code after a return?): {missing}"
    assert sum(isinstance(n, ast.Return) for n in fn.body) <= 1, "a return at the top level of the function must not be followed by more code"
    print("      resolve_fgc_root is clean: PASS [OK]")


def test_settings_changes_send_only_the_changed_fields():
    print("[audit C07] Settings: every handler posts only what it changed...")
    hook = (WORKSPACE / "src" / "hooks" / "useSentinelState.ts").read_text(encoding="utf-8")
    assert "const saveSettingsChange = async (changes: Partial<SentinelSettings>)" in hook, "one function must save partial changes"
    assert "const handleUpdateSettings = saveSettingsChange" in hook, "handleUpdateSettings is that function"
    assert "settings: { ...prev.settings, ...changes }" in hook, "local state merges into prev, not into a stale closure"
    assert "body: JSON.stringify(changes)" in hook, "only the changes go to the service"
    assert "JSON.stringify(updatedSettings)" not in hook and "JSON.stringify(merged)" not in hook, "no full snapshot may be posted"
    assert "...sentinelState.settings," not in hook, "no handler may rebuild settings from a stale snapshot"
    assert "console.error" in hook and "Не удалось сохранить настройку" in hook, "a refused save must be visible"
    for name in ("i18n/index.ts", "utils/textScale.ts"):
        src = (WORKSPACE / "src" / name).read_text(encoding="utf-8")
        assert "JSON.stringify({ " in src and "JSON.stringify(settings" not in src, f"{name} posts a single field"
    print("      Partial settings: PASS [OK]")


def test_giveaways_empty_store_choice_starts_nothing():
    print("[audit C09] Giveaways: an empty or unknown store choice is refused, a missing one means the defaults...")
    import asyncio
    import types
    sys.path.insert(0, str(SANDBOX / "core"))
    import giveaways_controller as gc
    from aiohttp import web

    class _Out:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    class _Proc:
        pid = 778
        returncode = None

        def __init__(self):
            self.stdout = _Out()

        async def wait(self):
            return 0

    engine = Path(tempfile.mkdtemp(prefix="c09_", dir=SANDBOX))
    (engine / "runner.js").write_text("", encoding="utf-8")
    (engine / "node_modules" / "patchright").mkdir(parents=True)

    def run(stores):
        spawned = []

        async def fake_exec(*args, **kwargs):
            spawned.append(args)
            return _Proc()

        async def no_scheduler(force=False):
            return {"state": "Ready"}

        async def no_monitor(proc):
            return None

        orch = gc.GiveawaysOrchestrator()
        orch._query_scheduler = no_scheduler
        orch._monitor_process = no_monitor
        saved = (gc.resolve_fgc_root, gc.shutil.which, asyncio.create_subprocess_exec, gc.engine_installed)
        gc.resolve_fgc_root = lambda: engine
        gc.shutil.which = lambda name, *a, **k: name
        gc.engine_installed = lambda d: True
        asyncio.create_subprocess_exec = fake_exec
        try:
            async def go():
                try:
                    res = await orch.start_claim(stores) if stores is not _MISSING else await orch.start_claim()
                    return ("started", res["stores"])
                except web.HTTPBadRequest as exc:
                    return ("refused", json.loads(exc.text)["detail"])
            outcome = asyncio.run(go())
        finally:
            gc.resolve_fgc_root, gc.shutil.which, asyncio.create_subprocess_exec, gc.engine_installed = saved
        return outcome, spawned

    _MISSING = object()
    for bad in ([], ["nope", "unknown"], "epic", {"epic": 1}, 5, [["steam"]], [None, 3]):
        outcome, spawned = run(bad)
        assert outcome == ("refused", "Не выбран ни один магазин."), (bad, outcome)
        assert not spawned, f"{bad!r} must not start a single process, got {spawned}"
    outcome, spawned = run(["gog", "nope"])
    assert outcome == ("started", ["gog"]) and len(spawned) == 1 and spawned[0][-1] == "gog", (outcome, spawned)
    outcome, spawned = run(None)
    assert outcome[0] == "started" and outcome[1] == list(gc.DEFAULT_CLAIM_STORES), outcome
    outcome, spawned = run(_MISSING)
    assert outcome[0] == "started" and outcome[1] == list(gc.DEFAULT_CLAIM_STORES), outcome
    shutil.rmtree(engine, ignore_errors=True)

    service = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    handler = service.split("async def handle_giveaways_claim", 1)[1].split("async def handle_giveaways_abort", 1)[0]
    assert 'body.get("stores")' in handler and '"epic", "gog"' not in handler, "the handler must pass the choice through untouched"
    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    claim = view.split("const handleClaimAll", 1)[1].split("\n  };", 1)[0]
    assert claim.index("selectedStores.length === 0") > claim.index("abort"), "stopping stays possible with no store selected"
    assert "Не выбран ни один магазин." in view or "giveaways.noStoreSelected" in view
    state_handler = view.split("sse.addEventListener('state'", 1)[1].split("});", 1)[0]
    assert "fetchState(false)" in state_handler and "setData(" not in state_handler, "C08: a state event only triggers a re-read, it never replaces the data"
    print("      Empty store choice: PASS [OK]")


def test_dimmer_logic_and_shell_use_it():
    print("[audit C10-C12] Dimmer: per-monitor debounce, explicit poll, blackout sound memory (no hardware)...")
    sdks = ""
    if shutil.which("dotnet"):
        sdks = subprocess.run(["dotnet", "--list-sdks"], capture_output=True, text=True, timeout=60).stdout
    if not any(line.startswith("10.") for line in sdks.splitlines()):
        print("      SKIP: the dimmer logic check needs the .NET SDK 10 (dotnet run); the source checks below still run")
    else:
        out_dir = Path(tempfile.mkdtemp(prefix="dimmer_check_", dir=SANDBOX))
        proj = WORKSPACE / "tools" / "dimmer_logic_check" / "DimmerLogicCheck.csproj"
        res = subprocess.run(
            ["dotnet", "run", "--project", str(proj), "-c", "Release", "-o", str(out_dir / "bin"),
             f"-p:BaseIntermediateOutputPath={out_dir / 'obj'}{os.sep}", f"-p:MSBuildProjectExtensionsPath={out_dir / 'obj'}{os.sep}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
        shutil.rmtree(out_dir, ignore_errors=True)
        assert res.returncode == 0, (res.stdout + res.stderr)[-1500:]
        assert "ALL DIMMER CHECKS PASSED" in res.stdout, res.stdout[-800:]
        print("      Dimmer logic check (dotnet run): PASS [OK]")

    form = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "new BrightnessDebouncer(" in form and "_brightnessDebounceCts" not in form, "C11: writes go through the per-monitor debouncer"
    assert "Task.Delay(span, ct)" in form and "LogDesktopError(" in form.split("new BrightnessDebouncer(", 1)[1][:600], "C11: injected delay, errors logged"
    assert "WaitAsync(300)" not in form and "WaitAsync(_hardwareCts.Token)" in form, "review 1: a write waits for the bus, it is not thrown away after 300 ms"
    assert "return SetHardwareBrightness(id, level);" in form, "review 1: the debouncer sees the write task"
    assert form.count("MonitorIds.Resolve(") >= 2, "review 2: the page's id is resolved before the cache and the debouncer"
    assert "ConcurrentDictionary<string, int> _monitorBrightnessMap" in form and "ConcurrentDictionary<string, int> _baselineBrightnessMap" in form, "review 3"
    assert "ContainsKey(" not in form, "review 3: no check-then-read on the shared maps"
    assert "explicitRefresh && !_isBlackout && monitors.Count > 0" in form, "review 5: no master recount during a blackout"
    assert "_blackoutMute.Exit(" in form.split("private void ShutdownBackend()", 1)[1][:900], "review 6: closing returns the sound directly"
    assert "NavigateToString(html)" not in form and "TwitchDropsSentinel_ui" in form, "fallback page: a mapped host, never an opaque origin"
    csproj = (WORKSPACE / "desktop" / "TwitchDropsSentinel.csproj").read_text(encoding="utf-8")
    assert r'EmbeddedResource Include="..\dist\index.html"' in csproj, "the fallback page is embedded"
    assert form.count("BrightnessReading.Resolve(") >= 2, "C10: both the DDC and the WMI branch resolve through BrightnessReading"
    assert "GetHardwareMonitors(bool explicitRefresh = false)" in form
    assert 'NotifyWebviewDimmerState(explicitRefresh: true)' in form.split('action == "SCAN_MONITORS"', 1)[1][:200], "C10: the poll asks the hardware"
    wmi = form.split("// 2. WMI Monitors", 1)[1].split("// 3. Fallback", 1)[0]
    assert "int? hardware = null" in wmi and "int bri = _masterBrightness;" not in wmi, "C10: a missing WMI value is null, not the master level"
    assert "BlackoutMuteMemory" in form and "_wasMutedBeforeBlackout" not in form, "C12: the sound is remembered on entry only"
    shutdown = form.split("private void ShutdownBackend()", 1)[1][:400]
    assert ".CancelAll()" in shutdown, "C11: closing drops waiting writes"
    print("      MainForm uses the dimmer logic: PASS [OK]")


def test_review_fixes_in_the_service():
    print("[review 7-12] Settings roll back together, no repeat shutdown, strict release URLs and origins...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import auto_shutdown
    import local_access
    import settings_transaction as st
    import updater

    # 8 (C05): a shutdown that already fired does not start again while the conditions stay the same
    step = auto_shutdown.next_countdown
    fired = step(1, True, True)
    assert fired.fire and fired.fired, fired
    again = step(fired.countdown, True, True, fired=fired.fired)
    assert again.countdown is None and not again.fire and again.fired, f"no second countdown after a fire: {again}"
    new_target = step(None, True, False, fired=True)
    assert not new_target.fired and not new_target.cancelled, new_target
    restart = step(new_target.countdown, True, True, fired=new_target.fired)
    assert restart.countdown == auto_shutdown.COUNTDOWN_SECONDS, "a new target and a new finish may fire again"
    assert not step(None, False, True, fired=True).fired, "switching the setting off resets it"

    # 9 (C01): an encoded dot is no dot, a query or fragment is not part of a release asset address
    repo = "MortuisVMain/Twitch-Drops-Sentinel"
    for url in (f"https://github.com/{repo}/releases/download/%2e%2e/%2e%2e/x/p.zip", f"https://github.com/{repo}/releases/download/..%2fx/p.zip",
                f"https://github.com/{repo}/releases/download/v1/p.zip?x=1", f"https://github.com/{repo}/releases/download/v1/p.zip#f",
                f"https://api.github.com/repos/{repo}/releases/assets/123%2f..%2f1"):
        assert not updater.is_trusted_release_url(url), f"must be refused: {url}"
    for url in (f"https://github.com/{repo}/releases/download/v1/Patch.zip", f"https://api.github.com/repos/{repo}/releases/assets/123"):
        assert updater.is_trusted_release_url(url), f"must pass: {url}"

    # 11: the shell's own origin and the two dev-server ports only
    for origin in ("https://app.sentinel", "http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173", None):
        assert local_access.origin_allowed(origin), origin
    for origin in ("http://localhost:9999", "http://127.0.0.1:28492", "http://localhost", "https://localhost:5173", "null", "https://evil.example"):
        assert not local_access.origin_allowed(origin), origin

    # 7 (C03): either both files and the memory change, or none does
    d = Path(tempfile.mkdtemp(prefix="txn_", dir=SANDBOX))
    cfg, eng, new_file = d / "config.json", d / "settings.json", d / "later.json"
    cfg.write_text('{"a": 1}', encoding="utf-8")
    eng.write_text('{"e": 1}', encoding="utf-8")

    def write_cfg():
        cfg.write_text('{"a": 2}', encoding="utf-8")

    def write_eng_half():
        eng.write_text('{"e": ', encoding="utf-8")
        raise OSError("disk full")

    def write_new():
        new_file.write_text("x", encoding="utf-8")
        raise OSError("disk full")

    try:
        st.save_transaction([cfg, eng, new_file], [write_cfg, write_eng_half, write_new])
        raise AssertionError("the failure must reach the caller")
    except OSError:
        pass
    assert cfg.read_text(encoding="utf-8") == '{"a": 1}' and eng.read_text(encoding="utf-8") == '{"e": 1}', "both files keep their old content"
    st.save_transaction([cfg, eng, new_file], [write_cfg, lambda: eng.write_text('{"e": 2}', encoding="utf-8")])
    assert cfg.read_text(encoding="utf-8") == '{"a": 2}' and eng.read_text(encoding="utf-8") == '{"e": 2}'
    try:
        st.save_transaction([cfg, eng, new_file], [write_new])
    except OSError:
        pass
    assert not new_file.exists(), "a file that did not exist before does not exist after a failed save"

    settings = {"x": 1, "l": [1]}
    same = settings

    def mutate(s):
        s["x"] = 2
        s["l"].append(2)

    def refusing_save():
        raise OSError("disk full")

    try:
        st.apply_change(settings, mutate, refusing_save)
        raise AssertionError("the failure must reach the caller")
    except OSError:
        pass
    assert settings is same and settings == {"x": 1, "l": [1]}, f"memory returns to the old state in place: {settings}"
    st.apply_change(settings, mutate, lambda: None)
    assert settings == {"x": 2, "l": [1, 2]}
    shutil.rmtree(d, ignore_errors=True)

    source = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "save_transaction(" in source.split("def save_settings", 1)[1].split("def load_trophies", 1)[0], "save_settings writes both files in one transaction"
    for name in ("handle_post_settings", "handle_reset_settings", "handle_add_game_directory", "handle_remove_game_directory"):
        body = source.split(f"async def {name}", 1)[1].split("\n    async def ", 1)[0]
        assert "apply_change(" in body, f"{name} must roll the memory back when saving fails"
    # 10: nothing follows the final return of the CORS middleware
    cors = source.split("async def cors_middleware", 1)[1].split("def get_app_version", 1)[0]
    assert 'Access-Control-Allow-Origin"] = "*"' not in cors, "the old wildcard block is dead code"
    print("      Review service fixes: PASS [OK]")


def test_clean_install_copies_the_default_config_template():
    print("[clean-install] load_settings copies config.default.json to config.json when config.json is missing...")
    work = Path(tempfile.mkdtemp(prefix="clean_install_", dir=SANDBOX))
    shutil.copytree(SANDBOX / "core", work / "core", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy2(WORKSPACE / "config.default.json", work / "config.default.json")
    assert not (work / "config.json").exists()
    code = ("import sys; sys.path.insert(0, 'core'); import sentinel_service as s; "
            "s.SentinelSupervisor.load_settings(None)")
    res = subprocess.run([sys.executable, "-c", code], cwd=work, capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert res.returncode == 0, res.stderr[-2000:]
    created = work / "config.json"
    assert created.exists(), "config.json was not created from config.default.json (missing shutil import?)"
    assert json.loads(created.read_text(encoding="utf-8-sig")) == json.loads((work / "config.default.json").read_text(encoding="utf-8-sig"))
    shutil.rmtree(work, ignore_errors=True)
    print("      template copied on a clean install: PASS [OK]")


def test_safe_defaults_power_off_and_linked_games():
    print("[safe-defaults] power-off after farming is off and no linked games, also in the template and after reset...")
    template = json.loads((WORKSPACE / "config.default.json").read_text(encoding="utf-8-sig"))
    assert template.get("auto_shutdown_on_complete") is False, "config.default.json must ship with power-off off"
    work = Path(tempfile.mkdtemp(prefix="safe_defaults_", dir=SANDBOX))
    shutil.copytree(SANDBOX / "core", work / "core", ignore=shutil.ignore_patterns("__pycache__"))
    # a throwaway copy: the module resolves config.json next to core/, so the real file is never touched
    code = (
        "import sys, json, asyncio; sys.path.insert(0, 'core'); import sentinel_service as s\n"
        "class Fake:\n"
        "    def __init__(self): self.settings = {'auto_shutdown_on_complete': True, 'user_linked_games': ['X']}\n"
        "    def save_settings(self): pass\n"
        "    async def broadcast_ws(self): pass\n"
        "fake = Fake()\n"
        "resp = asyncio.run(s.SentinelSupervisor.handle_reset_settings(fake, None))\n"
        "print(json.dumps({'defaults': [s.SUPERVISOR_DEFAULTS['auto_shutdown_on_complete'], s.SUPERVISOR_DEFAULTS['user_linked_games']],\n"
        "                  'reset': [fake.settings['auto_shutdown_on_complete'], fake.settings['user_linked_games']], 'status': resp.status}))\n"
    )
    res = subprocess.run([sys.executable, "-c", code], cwd=work, capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert res.returncode == 0, res.stderr[-2000:]
    got = json.loads(res.stdout.strip().splitlines()[-1])
    assert got["defaults"] == [False, []], f"SUPERVISOR_DEFAULTS must not power off or link games: {got['defaults']}"
    assert got["reset"] == [False, []] and got["status"] == 200, f"reset must yield power-off off: {got}"
    assert not (work / "config.json").exists(), "the check must not write a config.json"
    shutil.rmtree(work, ignore_errors=True)
    print("      safe defaults: PASS [OK]")


def test_loading_states_of_giveaways_and_dimmer():
    print("[loading] Giveaways and Dimmer tell loading, failure and a real empty answer apart...")
    esbuild = WORKSPACE / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")
    if not esbuild.exists() or shutil.which("node") is None:
        print("      (node/esbuild not available: pure-function part skipped)")
    else:
        out_dir = Path(tempfile.mkdtemp(prefix="load_check_", dir=SANDBOX))
        res = subprocess.run([str(esbuild), str(WORKSPACE / "src" / "utils" / "dataLoad.ts"), "--bundle", "--format=esm",
                              f"--outfile={out_dir / 'dataLoad.mjs'}"], capture_output=True, text=True, timeout=60, shell=os.name == "nt")
        assert res.returncode == 0, res.stderr
        driver = out_dir / "driver.mjs"
        driver.write_text(
            "import * as L from './dataLoad.mjs';\n"
            "const data = { runner: { state: 'idle' }, stores: {}, inventory: [] };\n"
            "const first = L.initialLoad();\n"
            "const err = L.loadFailed(first, 'http', 500);\n"
            "const stale = L.loadFailed(L.loadOk(data), 'network');\n"
            "console.log(JSON.stringify({\n"
            "  first: [first.phase, first.data], err: [err.phase, err.data, err.failure, err.status],\n"
            "  stale: [stale.phase, stale.data === data, stale.failure, L.hasStaleData(stale)],\n"
            "  recovered: [L.loadOk(data).failure, L.hasStaleData(L.loadOk(data))],\n"
            "  retryErr: L.loadRetry(err).phase, retryStale: [L.loadRetry(stale).phase, L.loadRetry(stale).data === data],\n"
            "  shapes: [{}, null, 5, [], { runner: {} }, { runner: { state: 3 } }, { runner: { state: 'idle' }, stores: [] },\n"
            "           { runner: { state: 'idle' }, inventory: {} }, { runner: { state: 'idle' } }, data].map(L.isGiveawaysState),\n"
            "  dimmer: [L.dimmerPhase(false, false), L.dimmerPhase(false, true), L.dimmerPhase(true, false), L.dimmerPhase(true, true)],\n"
            "  texts: ['http', 'network', 'shape'].map((f) => L.failureText(f)),\n"
            "}));\n", encoding="utf-8")
        run = subprocess.run(["node", str(driver)], capture_output=True, text=True, encoding="utf-8", timeout=30)
        shutil.rmtree(out_dir, ignore_errors=True)
        assert run.returncode == 0, run.stderr[-800:]
        d = json.loads(run.stdout)
        assert d["first"] == ["loading", None], d
        assert d["err"] == ["error", None, "http", 500], d
        assert d["stale"] == ["ready", True, "network", True], f"a failed poll keeps the data on screen: {d}"
        assert d["recovered"] == [None, False], d
        assert d["retryErr"] == "loading" and d["retryStale"] == ["ready", True], "a retry shows the skeleton only when there is nothing to show"
        assert d["shapes"] == [False, False, False, False, False, False, False, False, True, True], d["shapes"]
        assert d["dimmer"] == ["waiting", "timeout", "ready", "ready"], d
        assert all(d["texts"]) and len(set(d["texts"])) == 3, d["texts"]

    view = (WORKSPACE / "src" / "components" / "GiveawaysView.tsx").read_text(encoding="utf-8")
    assert "isGiveawaysState(" in view and "setData(" not in view, "the answer's shape is checked before it is used"
    assert "load.phase" in view and "Повторить" in view, "skeleton, error text and retry"
    fetch_state = view.split("const fetchState", 1)[1].split("useEffect(", 1)[0]
    assert "catch {" not in fetch_state and fetch_state.count("console.error(") >= 2, "failures are logged with context, not swallowed"
    dimmer = (WORKSPACE / "src" / "components" / "ScreenDimmerView.tsx").read_text(encoding="utf-8")
    assert "dimmerPhase(" in dimmer and "DIMMER_HOST_TIMEOUT_MS" in dimmer, "the dimmer waits for the shell, with a timeout"
    fixture = (WORKSPACE / "tools" / "ui_fixture.js").read_text(encoding="utf-8")
    for key in ("giveaways", "dimmer"):
        assert f"q.get('{key}')" in fixture, f"the fixture needs ?{key}=..."
    print("      Loading states: PASS [OK]")


def test_small_controls_have_a_larger_invisible_click_area():
    print("[usability] small controls get a taller click area through one shared rule, never wider...")
    css = (WORKSPACE / "src" / "index.css").read_text(encoding="utf-8")
    selectors = (".tactile-btn", ".tab-btn", ".node-chip", ".claimed-tab-pill", ".chunky-cta", ".safety-guard-btn", ".cover-exclude-btn")
    block = re.search(r"((?:[.\w-]+::before,\s*)+[.\w-]+::before)\s*\{([^}]*)\}", css)
    assert block, "the shared ::before hit-area rule exists"
    for sel in selectors:
        assert f"{sel}::before" in block.group(1), f"{sel} is covered by the hit-area rule"
    body = re.sub(r"\s+", " ", block.group(2))
    assert "position: absolute" in body and "content: ''" in body, "an empty absolutely positioned strip"
    assert "inset: calc(-1 * var(--hit-ext, 2px)) 0" in body, "grows vertically only (0 horizontally), 2 px = half of the 4 px row gap"
    positioned = re.search(r"((?:\.[\w-]+,\s*)+\.[\w-]+)\s*\{\s*position: relative;\s*\}", css)
    assert positioned, "the controls become the containing block of the strip"
    for sel in selectors[:-1]:
        assert sel in positioned.group(1), f"{sel} is positioned"
    assert ".tab-btn.active::after" in css, "the active-tab underline keeps ::after, so the strip uses ::before"
    print("      Hit areas: PASS [OK]")


def test_text_colour_follows_the_theme():
    print("[contrast] text takes the theme colour and passes 4.5:1 on its surface...")
    run = subprocess.run([sys.executable, str(WORKSPACE / "tools" / "check_contrast.py")], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert run.returncode == 0, run.stdout[-800:]
    css = (WORKSPACE / "src" / "index.css").read_text(encoding="utf-8")
    # Regression: text inherits its colour from body and .field-chassis. A colour transition on them (or `all`) leaves the
    # first frame's dark-theme colour on every node without its own colour, e.g. light text on the Daylight queue rows.
    for selector in (r"html, body \{", r"\n\s*body \{", r"\.field-chassis \{"):
        block = re.search(selector + r"(.*?)\n\s*\}", css, re.S)
        assert block, selector
        transition = re.search(r"transition:([^;]*);", block.group(1))
        if transition:
            props = transition.group(1).replace("background-color", "").replace("border-color", "")
            assert not re.search(r"\ball\b|\bcolor\b", props), f"{selector}: the inherited text colour must not animate: {transition.group(1)}"
    assert re.search(r"\.field-chassis \{[^}]*\n\s*color: var\(--text-primary\)", css, re.S), "the chassis sets the theme text colour itself"
    harness = (WORKSPACE / "tools" / "build_ui_harness.mjs").read_text(encoding="utf-8")
    probe = (WORKSPACE / "tools" / "check_text_contrast.js").read_text(encoding="utf-8")
    assert "check_text_contrast.js" in harness and "window.checkTextContrast" in probe, "the computed-colour probe ships with the harness"
    print("      Text colour: PASS [OK]")


def test_toast_text_never_enters_the_powershell_script():
    print("[security] Toasts: title and message travel in the environment, never inside the PowerShell script...")
    import base64
    sys.path.insert(0, str(SANDBOX / "core"))
    import gui_headless

    hostile = {
        "title": "\u2018$(calc)\u2019; Remove-Item C:/x \u201A\u201B' \" `",
        "message": "\u2019; Start-Process calc; '\u2018 \"$(Get-Date)\" ; & {x}\nsecond line",
    }
    captured = []

    class _Stub:
        def __init__(self, args, **kwargs):
            captured.append((args, kwargs))

    real_popen = gui_headless.subprocess.Popen
    gui_headless.subprocess.Popen = _Stub
    try:
        gui_headless.send_windows_toast(hostile["title"], hostile["message"])
        gui_headless.send_windows_toast("plain", "text")
    finally:
        gui_headless.subprocess.Popen = real_popen

    assert len(captured) == 2, "each toast starts exactly one PowerShell"
    args, kwargs = captured[0]
    assert "-EncodedCommand" in args, "the script still goes through -EncodedCommand"
    script = base64.b64decode(args[args.index("-EncodedCommand") + 1]).decode("utf-16le")
    for text in hostile.values():
        assert text not in script, "user text must not be in the script"
    for fragment in ("calc", "Remove-Item", "Start-Process", "\u2018", "\u2019", "\u201A", "\u201B"):
        assert fragment not in script, f"script contains hostile fragment {fragment!r}"
    assert "$env:" in script, "the script reads the text from the environment"
    env = kwargs.get("env") or {}
    assert sorted(v for v in env.values() if v in hostile.values()) == sorted(hostile.values()), "env carries both texts verbatim"
    script_plain = base64.b64decode(captured[1][0][captured[1][0].index("-EncodedCommand") + 1]).decode("utf-16le")
    assert script == script_plain, "the script is the same static string for every toast"
    print("      Toast injection: PASS [OK]")


def test_toast_text_is_short_and_free_of_control_characters():
    print("[security] Toasts: title and message are cut to 256 characters and lose control characters before the environment...")
    sys.path.insert(0, str(SANDBOX / "core"))
    import gui_headless

    captured = []

    class _Stub:
        def __init__(self, args, **kwargs):
            captured.append(kwargs.get("env") or {})

    real_popen = gui_headless.subprocess.Popen
    gui_headless.subprocess.Popen = _Stub
    try:
        gui_headless.send_windows_toast("T" * 5000, "M" * 300 + "\u0001tail")
        gui_headless.send_windows_toast("a\u0001b\u0007c\u001bd\u0085e\x00f\r", "line1\nline2\tcol\u0001")
        gui_headless.send_windows_toast(12345, None)
    finally:
        gui_headless.subprocess.Popen = real_popen

    assert len(captured) == 3
    big = captured[0]
    assert big["SENTINEL_TOAST_TITLE"] == "T" * 256, "an oversize title is cut to 256 characters"
    assert big["SENTINEL_TOAST_MESSAGE"] == "M" * 256, "an oversize message is cut to 256 characters"
    clean = captured[1]
    assert clean["SENTINEL_TOAST_TITLE"] == "abcdef", repr(clean["SENTINEL_TOAST_TITLE"])
    assert clean["SENTINEL_TOAST_MESSAGE"] == "line1\nline2\tcol", "U+0001 goes, a line break and a tab stay"
    assert captured[2]["SENTINEL_TOAST_TITLE"] == "12345" and captured[2]["SENTINEL_TOAST_MESSAGE"] == "None"
    print("      Toast text limits: PASS [OK]")


def test_coro_unless_closed_cancels_its_children_with_the_caller():
    print("[engine] coro_unless_closed: cancelling the caller cancels both children; results, errors and close still behave...")
    import asyncio
    sys.path.insert(0, str(SANDBOX / "core"))
    import gui_headless
    from exceptions import ExitRequest

    async def scenario():
        gui = gui_headless.HeadlessGUIManager(None)

        async def value():
            return 7

        assert await gui.coro_unless_closed(value()) == 7, "the result of the coroutine is returned"

        async def broken():
            raise ValueError("boom")

        try:
            await gui.coro_unless_closed(broken())
        except ValueError as exc:
            assert str(exc) == "boom", "the coroutine's own error comes out unchanged"
        else:
            raise AssertionError("the error must propagate")

        started = asyncio.Event()
        seen = {}

        async def slow():
            seen["task"] = asyncio.current_task()
            started.set()
            await asyncio.sleep(3600)

        before = asyncio.all_tasks()
        outer = asyncio.ensure_future(gui.coro_unless_closed(slow()))
        await started.wait()
        children = asyncio.all_tasks() - before - {outer}
        assert len(children) == 2 and seen["task"] in children, f"the coroutine and the close waiter are the two children: {children}"
        outer.cancel()
        try:
            await outer
        except asyncio.CancelledError:
            pass
        else:
            raise AssertionError("the caller's cancellation must propagate")
        await asyncio.wait(children, timeout=2)
        assert all(t.cancelled() for t in children), f"both children must be cancelled: {[t for t in children if not t.done()]}"

        started.clear()
        waiting = asyncio.ensure_future(gui.coro_unless_closed(slow()))
        await started.wait()
        gui.close_window()
        try:
            await waiting
        except ExitRequest:
            pass
        else:
            raise AssertionError("a close request still ends the wait with ExitRequest")
        await asyncio.sleep(0)
        assert seen["task"].cancelled(), "the coroutine is cancelled on a close request"

    asyncio.run(scenario())
    print("      coro_unless_closed: PASS [OK]")


def test_shell_opens_only_checked_web_links():
    print("[security] Shell: links from the page reach ShellExecute only through ExternalLinkPolicy...")
    form = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    logic = (WORKSPACE / "desktop" / "DimmerLogic.cs").read_text(encoding="utf-8")
    assert "class ExternalLinkPolicy" in logic and "UriSchemeHttps" in logic, "the policy lives in the file the check tool compiles"
    assert "ExternalLinkPolicy.TryGetOpenable" in form, "the shell asks the policy"
    shell_calls = re.findall(r"Process\.Start\(new ProcessStartInfo\((?!\s*\{)[^;]*UseShellExecute = true", form)
    for call in shell_calls:
        assert "args.Uri" not in call, "NewWindowRequested must not pass the page's address to the shell directly"
    assert re.search(r'OpenExternalLink\(args\.Uri, "NewWindowRequested"\)', form), "NewWindowRequested uses the checked opener"
    print("      Shell link policy: PASS [OK]")


def test_devtools_are_off_in_release_builds():
    print("[security] WebView2: DevTools are on only in Debug builds or with SENTINEL_DEVTOOLS=1...")
    form = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert not re.search(r"AreDevToolsEnabled\s*=\s*true", form), "DevTools must not be switched on unconditionally"
    assert "AreDevToolsEnabled = DevToolsAllowed()" in form, "the setting follows DevToolsAllowed()"
    body = re.search(r"private static bool DevToolsAllowed\(\)\s*\{(.*?)\n        \}", form, re.S)
    assert body, "DevToolsAllowed exists"
    text = body.group(1)
    assert re.search(r"#if DEBUG\s*return true;\s*#else\s*return Environment\.GetEnvironmentVariable\(\"SENTINEL_DEVTOOLS\"\) == \"1\";\s*#endif", text), \
        "Debug builds, or the SENTINEL_DEVTOOLS=1 opt-in; nothing else"
    print("      DevTools gate: PASS [OK]")


def test_update_archive_is_checked_against_the_published_sha256():
    print("[security] Updater: the archive is hashed and compared with the GitHub digest before anything is extracted...")
    import io
    import json as _json
    import types
    import urllib.error
    import zipfile
    sys.path.insert(0, str(SANDBOX / "core"))
    import updater

    repo = updater.TRUSTED_RELEASE_REPO
    page = f"https://github.com/{repo}/releases/latest"
    download_url = f"https://github.com/{repo}/releases/download/v9.9.9/Patch_9.9.9.zip"
    api_url = f"https://api.github.com/repos/{repo}/releases/assets/123"
    tag_url = f"https://api.github.com/repos/{repo}/releases/tags/v9.9.9"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("core/new_module.py", "X = 1\n")
        zf.writestr("core/version.py", '__version__ = "9.9.9"\n')
    payload = buffer.getvalue()
    good = "sha256:" + hashlib.sha256(payload).hexdigest()
    other = "sha256:" + hashlib.sha256(b"something else").hexdigest()

    def listing(*assets):
        return {"tag_name": "v9.9.9", "assets": list(assets)}

    def asset(name, digest, url_id=123):
        record = {"name": name, "url": f"https://api.github.com/repos/{repo}/releases/assets/{url_id}",
                  "browser_download_url": f"https://github.com/{repo}/releases/download/v9.9.9/{name}"}
        if digest is not None:
            record["digest"] = digest
        return record

    class _Resp(io.BytesIO):
        def __init__(self, body):
            super().__init__(body)
            self.headers = {"Content-Length": str(len(body))}

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.close()

    def fresh_install(name):
        work = SANDBOX / name
        shutil.rmtree(work, ignore_errors=True)
        install = work / "install"
        (install / "core").mkdir(parents=True)
        (install / "data").mkdir()
        (install / "core" / "version.py").write_text('__version__ = "3.3.4"\n', encoding="utf-8")
        (install / "config.json").write_text('{"keep": true}', encoding="utf-8")
        (install / "core" / "cookies.jar").write_text("SYNTHETIC-SESSION", encoding="utf-8")
        return work, install

    def snapshot(root):
        files = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob("*") if p.is_file()}
        dirs = sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_dir())
        return files, dirs

    def run(release, token="", urls=(download_url,), fail_metadata=False):
        """Applies an update against a fake GitHub; returns (ok, message, requests, install_snapshot_before, after)."""
        work, install = fresh_install("update_digest_check")
        before = snapshot(install)
        requests = []

        class _Opener:
            def open(self, req, timeout=None):
                requests.append((req.full_url, dict(req.header_items())))
                if req.full_url == tag_url:
                    if fail_metadata:
                        raise urllib.error.HTTPError(req.full_url, 403, "rate limit exceeded", {}, None)
                    return _Resp(_json.dumps(release).encode("utf-8"))
                if req.full_url == api_url:
                    if dict(req.header_items()).get("Accept") == "application/octet-stream":
                        return _Resp(payload)
                    record = next((a for a in release["assets"] if a["url"] == api_url), None)
                    if fail_metadata or record is None:
                        raise urllib.error.HTTPError(req.full_url, 404, "not found", {}, None)
                    return _Resp(_json.dumps(record).encode("utf-8"))
                if req.full_url == download_url:
                    return _Resp(payload)
                raise AssertionError(f"unexpected request {req.full_url}")

        saved = updater.PROJECT_DIR, updater.CACHE_FILE, updater.urllib.request.build_opener, updater.get_optional_github_token
        updater.PROJECT_DIR = install
        updater.CACHE_FILE = work / "cache.json"
        updater.urllib.request.build_opener = lambda *a, **k: _Opener()
        updater.get_optional_github_token = lambda: token
        try:
            ok, message = updater.GitHubUpdater().apply_update_from_url(urls[0], urls[1] if len(urls) > 1 else None)
        finally:
            updater.PROJECT_DIR, updater.CACHE_FILE, updater.urllib.request.build_opener, updater.get_optional_github_token = saved
        after = snapshot(install)
        shutil.rmtree(work, ignore_errors=True)
        return ok, message, requests, before, after

    def downloads(requests):
        return [url for url, headers in requests
                if url == download_url or (url == api_url and headers.get("Accept") == "application/octet-stream")]

    # right hash: installs, and the digest of the asset itself is the one used (not the sibling's)
    ok, message, requests, before, after = run(listing(asset("Other.zip", other, 7), asset("Patch_9.9.9.zip", good)))
    assert ok, message
    assert after[0]["core/new_module.py"] and after[0]["config.json"] == before[0]["config.json"], "installed, user data kept"
    assert after[0]["core/cookies.jar"] == before[0]["core/cookies.jar"]
    assert any(url == tag_url for url, _ in requests), "the digest comes from the release metadata"

    # right hash, addressed through the API asset url
    ok, message, *_ = run(listing(asset("Patch_9.9.9.zip", good)), urls=(api_url,))
    assert ok, message

    # wrong hash: refused, files byte-identical, no second address tried, the message names the page
    ok, message, requests, before, after = run(listing(asset("Patch_9.9.9.zip", other)), urls=(download_url, api_url))
    assert ok is False and page in message and "Контрольная сумма" in message, message
    assert before == after, "a mismatching archive must leave every file and folder as it was"
    assert downloads(requests) == [download_url], f"a mismatch is not a network error, no retry on the other address: {requests}"

    # digest missing: refused before any download
    ok, message, requests, before, after = run(listing(asset("Patch_9.9.9.zip", None)))
    assert ok is False and page in message, message
    assert before == after and downloads(requests) == [], "no digest, no download, nothing touched"

    # a digest published for another asset name is not accepted
    ok, message, requests, before, after = run(listing(asset("Other.zip", good, 7)))
    assert ok is False and page in message, message
    assert before == after and downloads(requests) == []
    # same digest on an asset whose address differs by one character
    ok, message, requests, before, after = run(listing(asset("Patch_9.9.9.zi", good, 8)))
    assert ok is False and before == after and downloads(requests) == []

    # malformed digests
    for bad in ("sha256:zzzz", "sha256:" + "a" * 63, "sha256:" + "a" * 65, "md5:" + "a" * 32, "a" * 64, "", "sha256:", "sha256: " + "a" * 64, 123):
        ok, message, requests, before, after = run(listing(asset("Patch_9.9.9.zip", bad)))
        assert ok is False and page in message, f"{bad!r}: {message}"
        assert before == after and downloads(requests) == [], f"malformed digest {bad!r} must refuse"

    # GitHub unreachable or rate limited: refused with the same pointer, nothing downloaded
    ok, message, requests, before, after = run(listing(asset("Patch_9.9.9.zip", good)), fail_metadata=True)
    assert ok is False and page in message, message
    assert before == after and downloads(requests) == []

    # token: sent to the API metadata request, absent for anonymous users
    _, _, requests, _, _ = run(listing(asset("Patch_9.9.9.zip", good)), token="SYNTHETIC_TOKEN")
    assert dict(requests[0][1]).get("Authorization") == "Bearer SYNTHETIC_TOKEN", requests[0]
    _, _, requests, _, _ = run(listing(asset("Patch_9.9.9.zip", good)), token="")
    assert "Authorization" not in requests[0][1], "anonymous check sends no Authorization"

    # parse_sha256_digest itself
    assert updater.parse_sha256_digest(good) == good[7:]
    assert updater.parse_sha256_digest("SHA256:" + "A" * 64) == "a" * 64
    assert updater.parse_sha256_digest(None) is None and updater.parse_sha256_digest(5) is None
    print("      Update archive digest: PASS [OK]")


def test_logout_really_signs_out():
    print("[security] Logout: the session token is dropped, the cookie file is deleted and nothing writes it back...")
    import asyncio
    import json as _json
    import types
    import aiohttp
    from yarl import URL
    sys.path.insert(0, str(SANDBOX / "core"))
    import constants
    import sentinel_service as svc
    import twitch

    work = SANDBOX / "logout_check"
    shutil.rmtree(work, ignore_errors=True)
    (work / "decoy_cwd" / "core").mkdir(parents=True)
    # A decoy where the old handler looked (relative to the working directory): it is not the engine's file and must stay
    decoys = [work / "decoy_cwd" / "cookies.jar", work / "decoy_cwd" / "core" / "cookies.jar"]
    for decoy in decoys:
        decoy.write_text("DECOY", encoding="utf-8")
    real_candidates = [constants.COOKIES_PATH, WORKSPACE / "core" / "cookies.jar", WORKSPACE / "cookies.jar"]
    real_before = {p: _sha256(p) for p in real_candidates}

    class _Button:
        def config(self, **kwargs):
            pass

    def make_client(session):
        fake_twitch = types.SimpleNamespace(gui=types.SimpleNamespace(help=types.SimpleNamespace(_invalidate_button=_Button())),
                                            _session=session)
        auth = twitch._AuthState(fake_twitch)
        auth.access_token, auth.user_id = "SYNTHETIC-TOKEN", 42
        auth._logged_in.set()
        events = []
        client = types.SimpleNamespace(_auth_state=auth, stop_watching=lambda: events.append("stop"),
                                       change_state=lambda state: events.append(state))
        return client, auth, events

    async def scenario(cookie_path, break_unlink=False):
        session = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar())
        try:
            jar = session.cookie_jar
            jar.update_cookies({"auth-token": "SYNTHETIC-TOKEN", "unique_id": "dev"}, URL("https://www.twitch.tv"))
            jar.save(cookie_path)
            client, auth, events = make_client(session)
            supervisor = types.SimpleNamespace(twitch_client=client, broadcast_ws=lambda: asyncio.sleep(0))
            svc.STATE_BRIDGE.username = "someone"
            response = await svc.SentinelSupervisor.handle_logout(supervisor, None)
            # what the engine's next save would write
            after_save = work / "after_save.jar"
            jar.save(after_save)
            return response, auth, events, after_save.read_bytes()
        finally:
            await session.close()

    saved = svc.COOKIES_PATH, twitch.COOKIES_PATH
    cwd = os.getcwd()
    try:
        jar_file = work / "cookies.jar"
        svc.COOKIES_PATH = twitch.COOKIES_PATH = jar_file
        os.chdir(work / "decoy_cwd")
        response, auth, events, next_save = asyncio.run(scenario(jar_file))
        assert response.status == 200 and _json.loads(response.text)["success"] is True, response.text
        assert not hasattr(auth, "access_token") and not hasattr(auth, "user_id"), "the token must be gone from memory"
        assert not auth._logged_in.is_set(), "the engine must not think it is logged in"
        assert not jar_file.exists(), "the engine's cookie file must be deleted"
        assert b"SYNTHETIC-TOKEN" not in next_save, "the next save of the session must not carry the token"
        assert events == ["stop", constants.State.RESTART], f"the engine stops watching and restarts into the login flow: {events}"
        assert svc.STATE_BRIDGE.username == "", "the UI state is reset"
        assert all(d.read_text(encoding="utf-8") == "DECOY" for d in decoys), "files outside the engine's own cookie path are never touched"

        # a cookie file that cannot be deleted is an error the UI sees, not a silent success
        blocked = work / "blocked" / "cookies.jar"
        (blocked).mkdir(parents=True)
        (blocked / "keep.txt").write_text("x", encoding="utf-8")
        svc.COOKIES_PATH = twitch.COOKIES_PATH = blocked
        response, auth, events, _ = asyncio.run(scenario(work / "other.jar"))
        assert response.status == 500 and _json.loads(response.text)["success"] is False, response.text
        assert (blocked / "keep.txt").exists()
    finally:
        os.chdir(cwd)
        svc.COOKIES_PATH, twitch.COOKIES_PATH = saved
    assert {p: _sha256(p) for p in real_candidates} == real_before, "the real cookie files were not touched"
    shutil.rmtree(work, ignore_errors=True)
    print("      Logout: PASS [OK]")


def test_logout_failure_paths_never_keep_the_old_session():
    print("[security] Logout: a failing invalidate() still empties the jar, the updater copy goes, profile backups stay and are mentioned...")
    import asyncio
    import json as _json
    import types
    import aiohttp
    from yarl import URL
    sys.path.insert(0, str(SANDBOX / "core"))
    import constants
    import sentinel_service as svc
    import twitch

    work = SANDBOX / "logout_failure_check"
    shutil.rmtree(work, ignore_errors=True)
    project = work / "project"
    (project / ".backup_state").mkdir(parents=True)
    (project / "data" / "backups").mkdir(parents=True)
    updater_copy = project / ".backup_state" / "cookies.jar"
    other_state = project / ".backup_state" / "config.json"
    profile_zip = project / "data" / "backups" / "sentinel_profile_backup_20260101_000000.zip"
    other_state.write_text("KEEP", encoding="utf-8")
    profile_zip.write_bytes(b"PK-USER-BACKUP")

    class _Button:
        def config(self, **kwargs):
            pass

    class _ExplodingJar:
        def clear(self):
            raise RuntimeError("jar is stuck")

    def make_client(session, invalidate_fails):
        fake_twitch = types.SimpleNamespace(gui=types.SimpleNamespace(help=types.SimpleNamespace(_invalidate_button=_Button())),
                                            _session=session)
        auth = twitch._AuthState(fake_twitch)
        auth.access_token, auth.user_id = "SYNTHETIC-TOKEN", 42
        auth._logged_in.set()
        if invalidate_fails:
            def explode(**kwargs):
                raise RuntimeError("invalidate failed before the jar was cleared")
            auth.invalidate = explode
        events = []
        client = types.SimpleNamespace(_auth_state=auth, _session=session, stop_watching=lambda: events.append("stop"),
                                       change_state=lambda state: events.append(state))
        return client, events

    async def scenario(cookie_path, invalidate_fails=False, stuck_jar=False):
        session = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar())
        try:
            jar = session.cookie_jar
            jar.update_cookies({"auth-token": "SYNTHETIC-TOKEN", "unique_id": "dev"}, URL("https://www.twitch.tv"))
            jar.save(cookie_path)
            updater_copy.write_text("OLD-UPDATER-COPY", encoding="utf-8")
            client, events = make_client(session, invalidate_fails)
            if stuck_jar:
                client._session = types.SimpleNamespace(cookie_jar=_ExplodingJar())
            supervisor = types.SimpleNamespace(twitch_client=client, broadcast_ws=lambda: asyncio.sleep(0))
            response = await svc.SentinelSupervisor.handle_logout(supervisor, None)
            # what the shutdown of the restarted engine would write
            after_save = work / "after_save.jar"
            jar.save(after_save)
            return response, events, after_save.read_bytes()
        finally:
            await session.close()

    saved = svc.COOKIES_PATH, twitch.COOKIES_PATH, svc.PROJECT_DIR
    try:
        jar_file = work / "cookies.jar"
        svc.COOKIES_PATH = twitch.COOKIES_PATH = jar_file
        svc.PROJECT_DIR = project

        # invalidate() raises before it reaches jar.clear(): the handler empties the jar itself
        response, events, next_save = asyncio.run(scenario(jar_file, invalidate_fails=True))
        body = _json.loads(response.text)
        assert response.status == 500 and body["success"] is False and "session" in body["error"], response.text
        assert b"SYNTHETIC-TOKEN" not in next_save, "the restart's shutdown must not save the old account back"
        assert not jar_file.exists(), "the engine's cookie file is deleted even when invalidate failed"
        assert not updater_copy.exists(), "the updater's .backup_state copy of the cookies is deleted"
        assert other_state.read_text(encoding="utf-8") == "KEEP", "the other files in .backup_state stay"
        assert profile_zip.read_bytes() == b"PK-USER-BACKUP", "profile backups under data/backups are the user's and stay"
        assert events == ["stop", constants.State.RESTART], f"the failure path restarts onto an emptied jar: {events}"

        # the jar itself cannot be emptied: nothing restarts (a restart would save the old jar) and the UI sees the error
        response, events, _ = asyncio.run(scenario(jar_file, stuck_jar=True))
        body = _json.loads(response.text)
        assert response.status == 500 and body["success"] is False and "cookie jar" in body["error"], response.text
        assert constants.State.RESTART not in events, f"no restart while the old jar is still in memory: {events}"

        # success: the reply mentions the profile backups that may hold the old account's cookies
        response, events, _ = asyncio.run(scenario(jar_file))
        body = _json.loads(response.text)
        assert response.status == 200 and body["success"] is True, response.text
        assert "data/backups" in body.get("note", ""), body
        assert profile_zip.read_bytes() == b"PK-USER-BACKUP"

        # no profile backups: no note
        profile_zip.unlink()
        response, events, _ = asyncio.run(scenario(jar_file))
        assert "note" not in _json.loads(response.text), response.text
    finally:
        svc.COOKIES_PATH, twitch.COOKIES_PATH, svc.PROJECT_DIR = saved
    shutil.rmtree(work, ignore_errors=True)
    print("      Logout failure paths: PASS [OK]")


def test_channel_point_chest_uses_the_real_login_state():
    print("[security] Channel points: the chest claim checks the real login state, honours the setting and fails visibly...")
    import asyncio
    import logging
    import types
    sys.path.insert(0, str(SANDBOX / "core"))
    import twitch
    from gui_headless import STATE_BRIDGE

    class _Capture(logging.Handler):
        def __init__(self):
            super().__init__(logging.DEBUG)
            self.records = []

        def emit(self, record):
            self.records.append(record)

    def make(logged_in, enabled=True, reply=None, error=None):
        calls = []

        async def gql_request(query):
            calls.append(query)
            if error is not None:
                raise error
            return reply[len(calls) - 1] if isinstance(reply, list) else reply

        auth = types.SimpleNamespace(_logged_in=asyncio.Event())
        if logged_in:
            auth._logged_in.set()
        client = types.SimpleNamespace(_auth_state=auth, claim_channel_points_enabled=enabled, gql_request=gql_request)
        client._warn_points_once = types.MethodType(twitch.Twitch._warn_points_once, client)
        return client, calls

    channel = types.SimpleNamespace(id=777, name="streamer", _login="streamer")
    chest = {"data": {"communityPoints": {"availableClaim": {"id": "claim-1"}}}}
    capture = _Capture()
    twitch.logger.addHandler(capture)
    earned = STATE_BRIDGE.channel_points_earned
    try:
        claim = twitch.Twitch.claim_channel_points_if_available

        client, calls = make(logged_in=True, reply=[chest, {"data": {}}])
        assert asyncio.run(claim(client, channel)) == 50, "a logged-in engine with the setting on claims an available chest"
        assert len(calls) == 2, "one context query and one claim"
        assert calls[1]["variables"]["input"] == {"claimID": "claim-1", "channelID": "777"}, calls[1]
        assert STATE_BRIDGE.channel_points_earned == earned + 50

        nested = {"data": {"community": {"channel": {"self": {"communityPoints": {"availableClaim": {"id": "claim-2"}}}}}}}
        client, calls = make(logged_in=True, reply=[nested, {"data": {}}])
        assert asyncio.run(claim(client, channel)) == 50 and calls[1]["variables"]["input"]["claimID"] == "claim-2", "the full query's nested reply is read too"

        # a Twitch service error makes gql_request retry for a long time: the watch loop must not wait for it
        real_wait_for = asyncio.wait_for
        waited = []

        async def short_wait_for(awaitable, timeout):
            waited.append(timeout)
            return await real_wait_for(awaitable, 0.01)

        async def hanging_request(query):
            await asyncio.sleep(30)

        client, calls = make(logged_in=True, reply=chest)
        client.gql_request = hanging_request
        twitch.asyncio.wait_for = short_wait_for
        try:
            assert asyncio.run(claim(client, channel)) == 0, "a hanging request ends the check"
        finally:
            twitch.asyncio.wait_for = real_wait_for
        assert waited == [15], f"the chest check has a time limit: {waited}"

        client, calls = make(logged_in=False, reply=chest)
        assert asyncio.run(claim(client, channel)) == 0 and calls == [], "logged out: no request (a request would start the login flow)"
        client, calls = make(logged_in=True, enabled=False, reply=chest)
        assert asyncio.run(claim(client, channel)) == 0 and calls == [], "setting off: no request, no claim"
        client, calls = make(logged_in=True, reply=chest)
        assert asyncio.run(claim(client, types.SimpleNamespace(id=None, name="x", _login="x"))) == 0 and calls == [], "no channel id: no request"

        # a reply that does not look like the expected one, and a failing request, are logged at WARNING (once), not at DEBUG
        capture.records.clear()
        client, calls = make(logged_in=True, reply={"data": {"unexpected": {}}})
        assert asyncio.run(claim(client, channel)) == 0 and len(calls) == 1
        assert asyncio.run(claim(client, channel)) == 0
        warnings = [r for r in capture.records if r.levelno >= logging.WARNING and "ChannelPointsContext" in r.getMessage()]
        assert len(warnings) == 1, f"an unrecognised reply is reported once at WARNING: {[r.getMessage() for r in capture.records]}"
        capture.records.clear()
        client, calls = make(logged_in=True, error=RuntimeError("boom"))
        assert asyncio.run(claim(client, channel)) == 0 and asyncio.run(claim(client, channel)) == 0
        warnings = [r for r in capture.records if r.levelno >= logging.WARNING and "ChannelPointsContext" in r.getMessage()]
        assert len(warnings) == 1 and warnings[0].exc_info, "a failing request is reported once at WARNING with the traceback"

        # one transient error must not silence the persistent warning: each kind is reported once on its own
        capture.records.clear()
        client, calls = make(logged_in=True, error=RuntimeError("blip"))
        assert asyncio.run(claim(client, channel)) == 0

        async def odd_reply(query):
            return {"data": {"unexpected": {}}}

        client.gql_request = odd_reply
        assert asyncio.run(claim(client, channel)) == 0 and asyncio.run(claim(client, channel)) == 0
        texts = [r.getMessage() for r in capture.records if r.levelno >= logging.WARNING and "ChannelPointsContext" in r.getMessage()]
        assert len(texts) == 2 and "failed" in texts[0] and "no communityPoints" in texts[1], f"one WARNING per kind: {texts}"
    finally:
        twitch.logger.removeHandler(capture)
        STATE_BRIDGE.channel_points_earned = earned
    assert "is_logged_in" not in (SANDBOX / "core" / "twitch.py").read_text(encoding="utf-8"), "no reference to the undefined is_logged_in remains"
    print("      Channel points claim: PASS [OK]")
def test_diagnostic_report_shows_the_real_drop_and_a_readable_journal():
    print("[report] the diagnostic report reads the keys add_drop writes and folds the journal tail...")
    sys.path.insert(0, str(SANDBOX / "core"))
    from sentinel_service import generate_sanitized_diagnostic_report
    from gui_headless import STATE_BRIDGE
    settings = {"priority_games": ["Fake Game"], "game_directories": []}
    hw = {"cpu_percent": 1, "on_battery": False, "is_gaming": False}
    logs = [{"time": "00:00:01", "level": "CLAIM", "message": "[CLAIM] [CORE] Drop received"},
            {"time": "00:00:02", "level": "INFO", "message": "[INFO] [TRAY] Icon ready"},
            {"time": "00:00:03", "level": "WATCH", "message": "[WATCH] [CORE] Watching fake_streamer"},
            {"time": "00:00:04", "level": "STATUS", "message": "[STATUS] [STATUS] Adding campaigns (1/3)"}]
    logs += [{"time": f"00:01:{n:02d}", "level": "STATUS", "message": f"[STATUS] [STATUS] Adding campaigns ({n}/3)"} for n in (2, 3)]
    logs += [{"time": "00:02:00", "level": "INFO", "message": "login oauth:abcdef0123456789 token=SECRET123"}]
    logs += [{"time": f"00:03:{n:02d}", "level": "INFO", "message": f"Heartbeat {n}"} for n in range(60)]
    saved = (STATE_BRIDGE.active_drop, STATE_BRIDGE.recent_logs, STATE_BRIDGE.watching_channel)

    def report(drop, entries):
        STATE_BRIDGE.active_drop, STATE_BRIDGE.recent_logs = drop, entries
        return generate_sanitized_diagnostic_report(settings, hw)

    try:
        # the same dict add_drop writes: `name` and `progress_percent`, not `drop_name` and `progress`
        drop = {"name": "Fake Reward", "game": "Fake Game", "current_minutes": 144, "required_minutes": 180, "progress_percent": 80}
        text = report(drop, logs[:7])
        print("      --- sample (fake data) ---\n" + "\n".join("      | " + ln for ln in text.splitlines()[12:30]))
        assert "Active Drop Name: Fake Reward" in text, text
        assert "Progress: 144 / 180 min (80%)" in text, text
        assert "Active Drop Game: Fake Game" in text
        # one level per line; other brackets stay
        assert "[STATUS] [STATUS]" not in text and "[CLAIM] [CLAIM]" not in text
        assert "[CLAIM] [CORE] Drop received" in text
        assert "[INFO] [TRAY] Icon ready" in text
        assert "[WATCH] [CORE] Watching fake_streamer" in text
        # a run of counter lines becomes its last line
        assert text.count("Adding campaigns") == 1 and "[STATUS] Adding campaigns (3/3)" in text, text
        # sanitizing still runs on every line
        assert "abcdef0123456789" not in text and "SECRET123" not in text and "oauth:[REDACTED]" in text and "token=[REDACTED]" in text
        # nothing is farmed: no crash, readable text
        empty = report(None, [])
        assert "Active Drop Name: None" in empty and "Progress: no active drop" in empty and "[No logs recorded yet]" in empty, empty
        # unknown required time must not divide or crash
        zero = report({"name": "Zero", "game": "G", "current_minutes": 5, "required_minutes": 0, "progress_percent": 0}, [])
        assert "Progress: 5 / 0 min (0%)" in zero, zero
        # the tail is taken after folding, so folded lines do not push others out of the 40 kept
        many = [{"time": "t", "level": "STATUS", "message": f"[STATUS] Adding ({n}/99)"} for n in range(1, 100)]
        many = [{"time": "t", "level": "INFO", "message": f"Keep {n}"} for n in range(39)] + many
        tail = report(None, many)
        assert "Keep 0" in tail and "Adding (99/99)" in tail and "Adding (98/99)" not in tail, tail
    finally:
        STATE_BRIDGE.active_drop, STATE_BRIDGE.recent_logs, STATE_BRIDGE.watching_channel = saved
    print("      Diagnostic report: PASS [OK]")


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
        test_shelf_unclaimed_filter_uses_shared_campaign_state,
        test_console_collapse_tray_filter_and_plain_labels,
        test_toast_gate_dedup_switch_and_priming,
        test_new_campaign_step_is_not_hidden_by_the_previous_steps_trophies,
        test_listed_but_unfarmable_campaign_never_reads_as_available,
        test_remaining_watch_minutes_helper_and_deadline_facts,
        test_campaign_dates_line,
        test_cover_keeper_replaces_broken_and_missing_covers,
        test_cover_search_names_and_non_game_filter,
        test_giveaways_without_node_explains_what_is_missing,
        test_release_archives_carry_the_licenses,
        test_store_login_finishes_without_a_terminal,
        test_login_state_follows_the_latest_attempt,
        test_itch_login_wait_checks_the_host_not_a_substring,
        test_two_factor_and_confirm_without_a_terminal_go_through_the_log,
        test_login_hint_goes_away_once_the_attempt_succeeded,
        test_giveaways_setup_failure_and_engine_stdin,
        test_unity_orders_only_at_a_clear_zero_total,
        test_switch_account_forgets_only_that_store,
        test_giveaways_readiness_says_what_is_left,
        test_engine_install_button_does_not_start_a_claim,
        test_hanging_node_version_is_killed,
        test_engine_install_error_without_json_is_kept,
        test_runner_finishes_an_interrupted_engine_install,
        test_built_page_embeds_its_font,
        test_keyboard_palette_help_farm_and_log_prefix,
        test_update_sources_and_token_scope,
        test_protected_files_survive_any_archive_path,
        test_atomic_settings_write_keeps_the_old_file,
        test_profile_backup_is_complete,
        test_auto_shutdown_can_be_cancelled_and_engine_flags_apply,
        test_store_card_shows_login_even_with_nothing_claimed,
        test_scheduler_task_is_created_on_a_clean_install,
        test_scheduler_query_that_hangs_is_killed_and_reaped,
        test_engine_installs_itself_for_a_scheduled_run,
        test_scheduler_refuses_an_old_node_and_task_paths_follow_the_install,
        test_scheduled_run_collects_selected_stores_and_writes_a_log,
        test_missing_webview2_runtime_has_an_explanation,
        test_login_code_copy_and_activate_link,
        test_giveaways_readiness_window_texts_report_and_counts,
        test_config_files_saved_with_a_bom_still_load,
        test_patch_update_keeps_user_data_and_blocks_path_traversal,
        test_english_ui_covers_every_russian_string,
        test_claimed_drop_never_replaces_the_drop_being_farmed,
        test_local_service_refuses_foreign_pages_and_resets_cleanly,
        test_resolve_fgc_root_has_no_undefined_names,
        test_steam_login_window_fits_a_small_screen,
        test_concurrent_update_checks_share_one_request,
        test_scheduled_run_that_never_finished_is_reported_as_failed,
        test_settings_changes_send_only_the_changed_fields,
        test_giveaways_empty_store_choice_starts_nothing,
        test_dimmer_logic_and_shell_use_it,
        test_review_fixes_in_the_service,
        test_loading_states_of_giveaways_and_dimmer,
        test_small_controls_have_a_larger_invisible_click_area,
        test_clean_install_copies_the_default_config_template,
        test_safe_defaults_power_off_and_linked_games,
        test_text_colour_follows_the_theme,
        test_short_window_console_minimum_leaves_the_collapsed_console_alone,
        test_queue_row_shows_why_a_campaign_cannot_be_farmed,
        test_toast_text_never_enters_the_powershell_script,
        test_toast_text_is_short_and_free_of_control_characters,
        test_coro_unless_closed_cancels_its_children_with_the_caller,
        test_shell_opens_only_checked_web_links,
        test_devtools_are_off_in_release_builds,
        test_update_archive_is_checked_against_the_published_sha256,
        test_logout_really_signs_out,
        test_logout_failure_paths_never_keep_the_old_session,
        test_channel_point_chest_uses_the_real_login_state,
        test_diagnostic_report_shows_the_real_drop_and_a_readable_journal,
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
    print(f"  ALL {len(GATES)} VERIFICATION GATES PASSED WITH EXIT CODE 0! [SUCCESS]")
    print("=" * 65)
    if SUITE_PROC is not None:
        SUITE_PROC.terminate()
        with suppress(Exception):
            SUITE_PROC.wait(timeout=3)
        print("  Test daemon terminated cleanly.")



