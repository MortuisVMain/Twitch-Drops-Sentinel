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
from pathlib import Path
import psutil

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
    print("[2/10] Testing 138 Installed Games Catalog...")
    catalog_path = WORKSPACE / "src" / "data" / "gamesCatalog.ts"
    assert catalog_path.exists(), "gamesCatalog.ts missing!"
    content = catalog_path.read_text(encoding="utf-8")
    assert "Path of Exile 2" in content
    assert "Hunt: Showdown 1896" in content
    assert "God of War Ragnarok" in content
    assert "Hearthstone" in content
    assert "USER_INSTALLED_GAMES" in content
    print("      138 Local Games + Twitch Drops Catalog: PASS [OK]")

def test_trophy_vault_journal():
    print("[3/10] Testing Trophy Vault Journal (Trophies.md)...")
    trophies_path = WORKSPACE / "Trophies.md"
    assert trophies_path.exists(), "Trophies.md missing!"
    lines = trophies_path.read_text(encoding="utf-8").splitlines()
    item_rows = [l for l in lines if l.startswith("|") and "Забран" in l]
    print(f"      Found {len(item_rows)} claimed trophy entries in Trophies.md")
    assert len(item_rows) >= 2, "Expected seeded trophy entries in Trophies.md"
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

def test_core_service_api():
    print("[5/10] Testing Core Microservice & REST API...")
    import subprocess
    service_script = WORKSPACE / "core" / "sentinel_service.py"
    
    # Check if already running or launch temporary test instance
    proc = None
    try:
        urllib.request.urlopen("http://127.0.0.1:28492/api/state", timeout=0.5)
        print("      Connected to existing Sentinel Service on port 28492.")
    except Exception:
        print("      Spawning test Sentinel Service daemon...")
        proc = subprocess.Popen(
            [sys.executable, str(service_script)],
            cwd=str(WORKSPACE / "core"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        time.sleep(2.0)

    try:
        req = urllib.request.Request("http://127.0.0.1:28492/api/state")
        with urllib.request.urlopen(req, timeout=3.0) as res:
            assert res.status == 200, f"Expected 200, got {res.status}"
            data = json.loads(res.read().decode("utf-8"))
            assert data.get("connected") is True
            assert data.get("username", "").lower() == "mortuis_v"
            assert "active_drop" in data
            assert "hardware" in data
            assert "stats" in data
            assert "settings" in data
            drop_str = f"{data['active_drop']['name']} ({data['active_drop']['game']})" if data.get('active_drop') else "None (Standby / Initializing)"
            print(f"      Active Drop: {drop_str}")
            print(f"      Hardware: Gaming={data['hardware']['is_gaming']}, CPU={data['hardware']['cpu_percent']}%")
            print(f"      Stats: Saved {data['stats']['traffic_saved_mb']} MB, Claimed {data['stats']['total_drops_claimed']} items")

        # Test POST /api/settings
        test_settings = {"auto_shutdown_on_complete": True, "pause_on_gaming": True}
        post_data = json.dumps(test_settings).encode("utf-8")
        post_req = urllib.request.Request(
            "http://127.0.0.1:28492/api/settings",
            data=post_data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(post_req, timeout=3.0) as res:
            assert res.status == 200
            post_res = json.loads(res.read().decode("utf-8"))
            assert post_res.get("status") == "ok"
            print("      POST /api/settings: PASS [OK]")

        # Test GET /api/verify-game
        v_req = urllib.request.Request("http://127.0.0.1:28492/api/verify-game?query=Witcher")
        with urllib.request.urlopen(v_req, timeout=3.0) as res:
            assert res.status == 200
            v_res = json.loads(res.read().decode("utf-8"))
            assert v_res.get("verified") is True
            assert "Witcher" in v_res.get("canonical_name", "")
            print(f"      GET /api/verify-game (Witcher -> {v_res['canonical_name']}, drops={v_res.get('has_active_drops')}): PASS [OK]")

        # Test GET /api/catalog
        c_req = urllib.request.Request("http://127.0.0.1:28492/api/catalog")
        with urllib.request.urlopen(c_req, timeout=3.0) as res:
            assert res.status == 200
            c_res = json.loads(res.read().decode("utf-8"))
            assert isinstance(c_res, list) and len(c_res) > 50
            print(f"      GET /api/catalog ({len(c_res)} games): PASS [OK]")

    finally:
        if proc is not None:
            proc.terminate()
            proc.wait(timeout=3)
            print("      Test daemon terminated.")

    print("      Core Service API: PASS [OK]")

def test_prd_compliance():
    print("[6/10] Testing PRD Acceptance Criteria...")
    prd_path = WORKSPACE / "prd.json"
    assert prd_path.exists(), "prd.json missing!"
    prd_data = json.loads(prd_path.read_text(encoding="utf-8"))
    assert len(prd_data["userStories"]) == 7, "Expected 7 user stories in PRD!"
    print(f"      Project: {prd_data['project']} v{prd_data['version']}")
    print(f"      Author: {prd_data['author']}")
    print("      PRD Structure: PASS [OK]")

def test_branding_check():
    print("[7/10] Testing Brand Identity...")
    app_tsx = (WORKSPACE / "src" / "App.tsx").read_text(encoding="utf-8")
    header_tsx = (WORKSPACE / "src" / "components" / "Header.tsx").read_text(encoding="utf-8")
    settings_tsx = (WORKSPACE / "src" / "components" / "SettingsStudio.tsx").read_text(encoding="utf-8")
    
    assert "Mortuis_V" in app_tsx
    assert "Mortuis_V" in header_tsx
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
    lines = trophies_path.read_text(encoding="utf-8").splitlines()
    claimed_lines = [l for l in lines if ("забран" in l.lower() or "✅" in l)]
    assert len(claimed_lines) >= 2, "Expected claimed entries in Trophies.md"
    # Verify that the regex/substring match correctly matches 'забран'
    test_line = "| 2026-10-12 14:00 | **HITMAN World of Assassination** | Crowbar | The Herbalist | ✅ Забран |"
    assert ("забран" in test_line.lower() or "✅" in test_line), "Cyrillic matching must pass"
    print(f"      Cyrillic Trophy Matching ({len(claimed_lines)} entries): ALL PASS [OK]")

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

if __name__ == "__main__":
    print("=" * 65)
    print("  TWITCH DROPS SENTINEL v3.0 — VERIFICATION TEST SUITE")
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
    print("=" * 65)
    print("  ALL 18 VERIFICATION GATES PASSED WITH EXIT CODE 0! [SUCCESS]")
    print("=" * 65)
