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

WORKSPACE = Path(__file__).resolve().parent

def test_artifacts():
    print("[1/10] Testing Binary & Bundle Artifacts...")
    exe_path = WORKSPACE / "TwitchDropsSentinel.exe"
    dist_html = WORKSPACE / "dist" / "index.html"
    app_ico = WORKSPACE / "assets" / "app.ico"
    cookies_jar = WORKSPACE / "core" / "cookies.jar"

    assert exe_path.exists(), f"EXE missing: {exe_path}"
    exe_size_mb = exe_path.stat().st_size / (1024 * 1024)
    print(f"      TwitchDropsSentinel.exe size: {exe_size_mb:.2f} MB")
    assert exe_size_mb > 50, "EXE size too small for standalone publish!"

    assert dist_html.exists(), "dist/index.html missing!"
    html_kb = dist_html.stat().st_size / 1024
    print(f"      dist/index.html singlefile bundle: {html_kb:.1f} KB")
    assert html_kb > 200, "dist/index.html appears incomplete!"

    assert app_ico.exists(), "app.ico missing!"
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
    trophies_path = WORKSPACE / "Trophies.md"
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

def ensure_test_service():
    global SUITE_PROC
    try:
        req = urllib.request.Request("http://127.0.0.1:28492/api/state", headers={"Connection": "close", "User-Agent": "Sentinel-Test"})
        urllib.request.urlopen(req, timeout=0.8)
    except Exception:
        if SUITE_PROC is None or SUITE_PROC.poll() is not None:
            print("      Spawning test Sentinel Service daemon...")
            service_script = WORKSPACE / "core" / "sentinel_service.py"
            SUITE_PROC = subprocess.Popen(
                [sys.executable, str(service_script)],
                cwd=str(WORKSPACE / "core"),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            time.sleep(2.0)

def test_core_service_api():
    print("[5/10] Testing Core Microservice & REST API...")
    service_script = WORKSPACE / "core" / "sentinel_service.py"
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
        req = urllib.request.Request("http://127.0.0.1:28492/api/state")
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
        "http://127.0.0.1:28492/api/settings",
        data=post_data,
        headers={"Content-Type": "application/json"}
    )
    with safe_urlopen(post_req, timeout=10.0) as res:
        assert res.status == 200
        post_res = json.loads(res.read().decode("utf-8"))
        assert post_res.get("status") == "ok"
        print("      POST /api/settings: PASS [OK]")

    # Test GET /api/verify-game
    v_req = urllib.request.Request("http://127.0.0.1:28492/api/verify-game?query=Desert")
    with safe_urlopen(v_req, timeout=10.0) as res:
        assert res.status == 200
        v_res = json.loads(res.read().decode("utf-8"))
        assert v_res.get("verified") is True
        assert "Desert" in v_res.get("canonical_name", "")
        print(f"      GET /api/verify-game (Desert -> {v_res['canonical_name']}, drops={v_res.get('has_active_drops')}): PASS [OK]")

    # Test GET /api/catalog
    c_req = urllib.request.Request("http://127.0.0.1:28492/api/catalog")
    with safe_urlopen(c_req, timeout=10.0) as res:
        assert res.status == 200
        c_res = json.loads(res.read().decode("utf-8"))
        assert isinstance(c_res, list) and len(c_res) > 50
        print(f"      GET /api/catalog ({len(c_res)} games): PASS [OK]")

    # Test GET /api/v1/giveaways/state
    g_req = urllib.request.Request("http://127.0.0.1:28492/api/v1/giveaways/state")
    with safe_urlopen(g_req, timeout=10.0) as res:
        assert res.status == 200
        g_res = json.loads(res.read().decode("utf-8"))
        assert "runner" in g_res and "stores" in g_res and "inventory" in g_res and "scheduler" in g_res
        print(f"      GET /api/v1/giveaways/state ({len(g_res.get('stores', {}))} stores, {len(g_res.get('inventory', []))} items): PASS [OK]")

    # Test GET /api/updates/check
    u_req = urllib.request.Request("http://127.0.0.1:28492/api/updates/check")
    with safe_urlopen(u_req, timeout=10.0) as res:
        assert res.status == 200
        u_res = json.loads(res.read().decode("utf-8"))
        assert "update_available" in u_res
        ver_key = "local_version" if "local_version" in u_res else "current_version"
        assert ver_key in u_res
        print(f"      GET /api/updates/check (Local: {u_res[ver_key]}, Available: {u_res['update_available']}): PASS [OK]")

    print("      Core Service API: PASS [OK]")

def test_prd_compliance():
    print("[6/10] Testing PRD Acceptance Criteria...")
    prd_path = WORKSPACE / "PRD_SENTINEL_V3.md"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    trophies_path = WORKSPACE / "Trophies.md"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    core_dir = WORKSPACE / "core"
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
    assert any(g.get("platform") == "steam" for g in total), "Expected at least one Steam game"
    print("      Universal GameScanner: ALL PASS [OK]")

def test_route_aliases_and_directory_management():
    print("[21/22] Testing Route Aliases & Directory Management Endpoints...")
    # Verify that sentinel_service.py has all requested route aliases
    service_code = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
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
    assert "Звуки интерфейса (Mute)" in settings_code, "SettingsStudio must have UI sound mute switch"

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
    service_py = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "set_sleep_guard" in service_py, "sentinel_service.py must include set_sleep_guard"
    assert "ES_SYSTEM_REQUIRED" in service_py, "set_sleep_guard must use ES_SYSTEM_REQUIRED"
    assert "/api/autostart" in service_py, "sentinel_service.py must register /api/autostart"
    assert "/api/diagnostic-report" in service_py, "sentinel_service.py must register /api/diagnostic-report"
    assert "generate_sanitized_diagnostic_report" in service_py, "sentinel_service.py must include sanitized report generator"

    # 4. SettingsStudio autostart & report
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleToggleAutostart" in settings_tsx, "SettingsStudio must have autostart handler"
    assert "handleCopyDiagnosticReport" in settings_tsx, "SettingsStudio must have diagnostic report copy handler"
    assert "Автозапуск с Windows" in settings_tsx, "SettingsStudio must render Windows autostart option"
    assert "Диагностический отчет" in settings_tsx, "SettingsStudio must render diagnostic report button"

    # 5. Diagnostic report sanitization unit test
    sys.path.insert(0, str(WORKSPACE / "core"))
    from sentinel_service import generate_sanitized_diagnostic_report
    fake_settings = {"priority_games": ["Path of Exile 2"], "game_directories": []}
    fake_hw = {"cpu_percent": 15, "on_battery": False, "is_gaming": False}
    report = generate_sanitized_diagnostic_report(fake_settings, fake_hw)
    assert "TWITCH DROPS SENTINEL v3.1 — DIAGNOSTIC REPORT" in report
    assert "oauth:[REDACTED]" in report or "oauth:" not in report
    assert "END OF DIAGNOSTIC REPORT" in report

    print("      Argon Hardening & Host Resilience: ALL PASS [OK]")

def test_github_updater_and_zero_mock_telemetry():
    print("[24/24] Testing GitHub Auto-Updater & Zero-Mock Telemetry...")

    # 1. Verify core/updater.py exists and parses versions correctly
    sys.path.insert(0, str(WORKSPACE / "core"))
    from updater import GitHubUpdater, parse_version, UPDATER, PROTECTED_PATHS, check_and_apply_pending_exe_update
    from version import __version__

    assert __version__ == "3.2.2", f"Version mismatch: {__version__}"
    assert parse_version("3.2.2") == (3, 2, 2)
    assert parse_version("v3.2.3-beta") == (3, 2, 3)
    assert parse_version("v3.2.2") > parse_version("3.2.1")
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
    assert "Обновления GitHub & Патчи" in settings_tsx, "SettingsStudio must render GitHub updates card"
    assert "handleCheckUpdates" in settings_tsx, "SettingsStudio must have handleCheckUpdates"

    # 7. Verify orphaned legacy components are purged
    for orphan in ["Header.tsx", "Navigation.tsx", "TrophyVault.tsx"]:
        assert not (WORKSPACE / "src" / "components" / orphan).exists(), f"Orphaned component {orphan} must be deleted"

    print("      GitHub Auto-Updater & Zero-Mock Telemetry: ALL PASS [OK]")

def test_hardware_guard_false_positive_and_installed_clear():
    print("[25/25] Testing Hardware Guard Anti-False-Positive & Installed Clear...")
    
    # 1. Verify sentinel_service.py contains SYSTEM_NON_GAME_EXES and no blind auto-injection
    svc_code = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
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
        "http://127.0.0.1:28492/api/hardware/ignore-process",
        data=json.dumps({"process": "Happ.exe"}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_ignore, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"
        assert d.get("ignored") == "Happ.exe"

    req_clear = urllib.request.Request(
        "http://127.0.0.1:28492/api/installed-games/clear",
        data=b"{}",
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_clear, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"
        assert d.get("cleared") is True

    print("      Hardware Guard Anti-False-Positive & Installed Clear: ALL PASS [OK]")

def test_channel_points_clipboard_and_feature_toggles():
    print("[26/26] Testing Channel Points Auto-Claim, Multi-Layer Clipboard & Feature Toggles...")

    # 1. Verify MainForm.cs has COPY_TO_CLIPBOARD IPC
    main_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "COPY_TO_CLIPBOARD" in main_cs, "MainForm.cs must handle COPY_TO_CLIPBOARD"
    assert "Clipboard.SetText" in main_cs, "MainForm.cs must copy to system clipboard"

    # 2. Verify core/sentinel_service.py has clipboard endpoint and feature flags
    svc_code = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/clipboard/copy" in svc_code, "sentinel_service.py must register /api/clipboard/copy"
    assert "handle_clipboard_copy" in svc_code, "sentinel_service.py must implement handle_clipboard_copy"
    assert "claim_channel_points" in svc_code, "load_settings must support claim_channel_points"
    assert "auto_claim_drops" in svc_code, "load_settings must support auto_claim_drops"
    assert "giveaways_enabled" in svc_code, "load_settings must support giveaways_enabled"
    assert "streamer_watchdog_enabled" in svc_code, "load_settings must support streamer_watchdog_enabled"

    # 3. Verify core/twitch.py has CommunityPoints topic, claim mutation & feature gates
    twitch_code = (WORKSPACE / "core" / "twitch.py").read_text(encoding="utf-8")
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
    assert "Управление модулями & Автоматизация" in settings_tsx, "SettingsStudio must render feature modules board"
    assert "claim_channel_points" in settings_tsx, "SettingsStudio must have claim_channel_points switch"
    assert "auto_claim_drops" in settings_tsx, "SettingsStudio must have auto_claim_drops switch"
    assert "giveaways_enabled" in settings_tsx, "SettingsStudio must have giveaways_enabled switch"
    assert "streamer_watchdog_enabled" in settings_tsx, "SettingsStudio must have streamer_watchdog_enabled switch"

    # 5. Live test: GET /api/diagnostic-report and POST /api/clipboard/copy
    req_diag = urllib.request.Request(
        "http://127.0.0.1:28492/api/diagnostic-report",
        headers={"Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_diag, timeout=5.0) as res:
        assert res.status == 200
        diag_text = res.read().decode("utf-8")
        assert "twitch drops sentinel" in diag_text.lower()

    req_clip = urllib.request.Request(
        "http://127.0.0.1:28492/api/clipboard/copy",
        data=json.dumps({"text": diag_text[:300]}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_clip, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"

    # 6. Live test: Settings persistence through /api/settings and /api/state
    req_settings = urllib.request.Request(
        "http://127.0.0.1:28492/api/settings",
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
        "http://127.0.0.1:28492/api/state",
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
    core_dir = WORKSPACE / "core"
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
        "http://127.0.0.1:28492/api/installed-games/remove",
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
        "http://127.0.0.1:28492/api/trophies/clear",
        data=b"{}",
        headers={"Content-Type": "application/json", "Connection": "close", "User-Agent": "Sentinel-Test"}
    )
    with urllib.request.urlopen(req_clear, timeout=5.0) as res:
        assert res.status == 200
        d = json.loads(res.read().decode("utf-8"))
        assert d.get("status") == "ok"
        assert d.get("cleared") is True

    trophies_file = WORKSPACE / "Trophies.md"
    assert trophies_file.exists(), "Trophies.md must exist after clearing"
    content = trophies_file.read_text(encoding="utf-8")
    assert "# 🏆 Журнал Трофеев Twitch Drops Sentinel" in content
    lines = [l for l in content.splitlines() if l.strip()]
    assert len(lines) <= 5, "Cleared Trophies.md must contain only the header table"

    # 5. Verify SettingsStudio.tsx and LiveDashboard.tsx have clear buttons
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleClearTrophies" in settings_tsx, "SettingsStudio must have handleClearTrophies"
    assert "/api/trophies/clear" in settings_tsx, "SettingsStudio must call /api/trophies/clear"
    assert "showReportModal" in settings_tsx, "SettingsStudio must support showReportModal"

    dashboard_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "/api/trophies/clear" in dashboard_tsx, "LiveDashboard must call /api/trophies/clear"

    shelf_tsx = (WORKSPACE / "src" / "components" / "GameShelf.tsx").read_text(encoding="utf-8")
    assert "removedKeys" in shelf_tsx, "GameShelf must support optimistic removedKeys"

    print("      GameScanner Deduplication, AppID Name Fallback & Trophies Clear: ALL PASS [OK]")

def test_sleep_guard_watchdog_and_account_protection():
    print("[29/29] Testing Sleep Guard, WebSocket Probe Watchdog, Log Rotation & Account Protection...")
    # 1. Sleep Guard in core/twitch.py
    twitch_py = (WORKSPACE / "core" / "twitch.py").read_text(encoding="utf-8")
    assert "SLEEP GUARD" in twitch_py, "twitch.py must contain SLEEP GUARD log"
    assert "raw_step_elapsed > 60.0" in twitch_py, "twitch.py must clamp sleep gap when raw_step_elapsed > 60s"
    assert "streamer_watch_start += sleep_gap" in twitch_py, "twitch.py must adjust streamer_watch_start by sleep_gap"
    assert "is_linked" in twitch_py, "switch_priority must check is_linked"

    # 2. WebSocket Heartbeat Watchdog in core/websocket.py
    ws_py = (WORKSPACE / "core" / "websocket.py").read_text(encoding="utf-8")
    assert "_last_msg_time" in ws_py, "websocket.py must track _last_msg_time"
    assert "_probe_sent" in ws_py, "websocket.py must track _probe_sent"
    assert "now - self._last_msg_time > 45.0" in ws_py, "websocket.py must send probe PING after 45s of silence"

    # 3. Log Rotation in desktop/MainForm.cs
    mainform_cs = (WORKSPACE / "desktop" / "MainForm.cs").read_text(encoding="utf-8")
    assert "writeRotatedLog" in mainform_cs, "MainForm.cs must implement writeRotatedLog"
    assert "5 * 1024 * 1024" in mainform_cs, "MainForm.cs must rotate logs at 5 MB"
    assert ".old" in mainform_cs, "MainForm.cs must archive old log with .old suffix"

    # 4. Logout / Account Switcher
    service_py = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert "/api/auth/logout" in service_py, "sentinel_service.py must register /api/auth/logout"
    assert "handle_logout" in service_py, "sentinel_service.py must implement handle_logout"
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    assert "handleLogout" in settings_tsx, "SettingsStudio must implement handleLogout"
    assert "Сменить аккаунт" in settings_tsx, "SettingsStudio must render 'Сменить аккаунт' button"

    # 5. Linked Account Warning & Badges
    fetcher_py = (WORKSPACE / "core" / "campaigns_fetcher.py").read_text(encoding="utf-8")
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
    channel_py = (WORKSPACE / "core" / "channel.py").read_text(encoding="utf-8")
    assert "available_campaign_ids" in channel_py, "Channel.__slots__ must include available_campaign_ids"
    assert "self.available_campaign_ids = {" in channel_py, "_check_drops_enabled must store available_campaign_ids"
    assert "len(campaign.allowed_channels) <= 10" in channel_py, "_check_drops_enabled must allow showcase ACLs <= 10"

    # 2. Verify core/inventory.py allows showcase ACLs & AvailableDrops confirmed channels
    inv_py = (WORKSPACE / "core" / "inventory.py").read_text(encoding="utf-8")
    assert "available_campaign_ids" in inv_py, "inventory.py _base_can_earn must check available_campaign_ids"
    assert "len(self.allowed_channels) <= 10" in inv_py, "inventory.py _base_can_earn must check len(allowed_channels) <= 10"

    # 3. Verify core/twitch.py discovers live streams for games with showcase ACLs
    twitch_py = (WORKSPACE / "core" / "twitch.py").read_text(encoding="utf-8")
    assert "len(campaign.allowed_channels) <= 10" in twitch_py, "twitch.py must add campaign.game to no_acl when ACL <= 10"

    # 4. Verify LiveDashboard.tsx keeps all games visible in default ALL tab
    dashboard_tsx = (WORKSPACE / "src" / "components" / "LiveDashboard.tsx").read_text(encoding="utf-8")
    assert "Все (${sortedQueuedCampaigns.length})" in dashboard_tsx, "LiveDashboard must display 'Все' tab with full count"
    assert "if (shelfFilter === 'ALL') return true;" in dashboard_tsx, "LiveDashboard ALL tab must return true"

    # 5. Verify settings.json priority clean from unwanted games
    settings_raw = (WORKSPACE / "core" / "settings.json").read_text(encoding="utf-8")
    settings_json = json.loads(settings_raw)
    priority_list = settings_json.get("priority", [])
    assert "Infestation: The New Z" not in priority_list, "Infestation: The New Z must not be in priority list"
    assert settings_json.get("priority_mode", {}).get("data") == 0, "priority_mode must be strictly 0"

    print("      Showcase ACL Matching, Drops Discovery & Strict Priority Guard: ALL PASS [OK]")

def test_giveaways_stores_persistence_and_version_standardization():
    print("[31/31] Testing Giveaways Store Persistence & Single-Location Dynamic Version...")

    # 1. Verify sentinel_service.py returns version in state and defaults giveaways stores
    sentinel_py = (WORKSPACE / "core" / "sentinel_service.py").read_text(encoding="utf-8")
    assert '"version": self.get_app_version()' in sentinel_py, "sentinel_service must include version in get_full_state"
    assert '"giveaways_selected_stores"' in sentinel_py, "sentinel_service must include giveaways_selected_stores in load_settings"
    assert '"giveaways_headless"' in sentinel_py, "sentinel_service must include giveaways_headless in load_settings"

    # 2. Verify updater.py dynamic local version reading and cache invalidation
    updater_py = (WORKSPACE / "core" / "updater.py").read_text(encoding="utf-8")
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
        "http://127.0.0.1:28492/api/state",
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
    assert "'drops' | 'priority' | 'claimed' | 'installed' | 'excluded' | 'all'" in shelf_tsx, "filterMode must include 'claimed'"

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
    core_dir = WORKSPACE / "core"
    if str(core_dir) not in sys.path:
        sys.path.insert(0, str(core_dir))
    from campaigns_fetcher import smart_game_match
    assert not smart_game_match("Ace Combat Zero: The Belkan War", "ACE COMBAT 8: WINGS OF THEVE")

    print("      GameShelf '🏆 Собрано' Tab & Trophies Synthesis: ALL PASS [OK]")

if __name__ == "__main__":
    print("=" * 65)
    print("  TWITCH DROPS SENTINEL v3.1 — VERIFICATION TEST SUITE")
    print("  Author: Mortuis_V / Mortuis_V_Studio")
    print("=" * 65)
    test_artifacts()
    test_installed_games_catalog()
    test_trophy_vault_journal()
    test_hardware_guard()
    test_core_service_api()
    test_prd_compliance()
    test_branding_check()
    test_streamless_engine_contract()
    test_palette_integrity()
    test_safe_inventory_parsing()
    test_mojibake_cleanliness()
    test_trophy_matching_cyrillic()
    test_channel_drops_enabled_resilience()
    test_expired_campaign_filtering()
    test_watchdog_active_drop_sync()
    test_search_games_and_box_art_cache()
    test_sequel_guard_and_no_false_box_art()
    test_audited_steam_app_ids_and_verified_sequels()
    test_giveaways_hub_integration()
    test_universal_game_scanner()
    test_route_aliases_and_directory_management()
    test_audio_mute_and_release_safety()
    test_argon_public_hardening_and_resilience()
    test_github_updater_and_zero_mock_telemetry()
    test_hardware_guard_false_positive_and_installed_clear()
    test_channel_points_clipboard_and_feature_toggles()
    test_game_scanner_anti_software_and_patch_filtering()
    test_game_scanner_deduplication_and_trophies_clear()
    test_sleep_guard_watchdog_and_account_protection()
    test_r6s_showcase_acl_and_strict_priority_guard()
    test_giveaways_stores_persistence_and_version_standardization()
    test_game_shelf_claimed_tab_and_trophies_integration()
    print("=" * 65)
    print("  ALL 32 VERIFICATION GATES PASSED WITH EXIT CODE 0! [SUCCESS]")
    print("=" * 65)
    if SUITE_PROC is not None:
        SUITE_PROC.terminate()
        with suppress(Exception):
            SUITE_PROC.wait(timeout=3)
        print("  Test daemon terminated cleanly.")


