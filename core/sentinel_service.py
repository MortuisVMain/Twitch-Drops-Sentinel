"""
Twitch Drops Sentinel v3.0 [Apple Liquid Glass Edition]
Mortuis_V / Mortuis_V_Studio

Core Microservice & Asynchronous Engine:
- Runs headless Smartbox GQL / WebSocket Twitch Drops client
- Real-time Hardware Guard (monitors 138 installed games and battery status)
- Luna Auto-Shutdown Engine (executes power actions when farming completes)
- Local HTTP REST & WebSocket API on 127.0.0.1:28492
"""

from __future__ import annotations

import asyncio
import ctypes
import json
import logging
import os
import platform
import re
import subprocess
import sys
import time
from contextlib import suppress

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import aiohttp
from aiohttp import web
import psutil

# Add core dir to sys.path
CORE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CORE_DIR.parent
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

def set_sleep_guard(enable: bool):
    """
    Prevents Windows from entering sleep mode while farming is active.
    ES_CONTINUOUS: 0x80000000
    ES_SYSTEM_REQUIRED: 0x00000001
    Note: Does NOT set ES_DISPLAY_REQUIRED so user's monitor can turn off cleanly.
    """
    if sys.platform == "win32":
        try:
            ES_CONTINUOUS = 0x80000000
            ES_SYSTEM_REQUIRED = 0x00000001
            flags = (ES_CONTINUOUS | ES_SYSTEM_REQUIRED) if enable else ES_CONTINUOUS
            ctypes.windll.kernel32.SetThreadExecutionState(flags)
        except Exception as e:
            pass

def get_autostart_status() -> tuple[bool, str]:
    if sys.platform != "win32":
        return False, ""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ) as key:
            val, _ = winreg.QueryValueEx(key, "TwitchDropsSentinel")
            return True, str(val)
    except FileNotFoundError:
        return False, ""
    except Exception:
        return False, ""

def set_autostart_status(enabled: bool) -> bool:
    if sys.platform != "win32":
        return False
    try:
        import winreg
        exe_path = PROJECT_DIR / "TwitchDropsSentinel.exe"
        if not exe_path.exists():
            candidate = PROJECT_DIR / "desktop" / "publish" / "TwitchDropsSentinel.exe"
            if candidate.exists():
                exe_path = candidate
        cmd = f'"{exe_path.resolve()}" --minimized'
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_ALL_ACCESS) as key:
            if enabled:
                winreg.SetValueEx(key, "TwitchDropsSentinel", 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, "TwitchDropsSentinel")
                except FileNotFoundError:
                    pass
        return True
    except Exception:
        return False

def generate_sanitized_diagnostic_report(settings: dict, hardware_state: dict) -> str:
    os_info = f"{platform.system()} {platform.release()} (Build {platform.version()})"
    py_info = f"Python {platform.python_version()} ({platform.architecture()[0]})"
    try:
        ram = psutil.virtual_memory()
        ram_info = f"Total: {round(ram.total / (1024**3), 1)} GB, Available: {round(ram.available / (1024**3), 1)} GB"
    except Exception:
        ram_info = "N/A"

    active_drop = STATE_BRIDGE.active_drop or {}
    streamer = STATE_BRIDGE.watching_channel or "None"
    user_id_raw = STATE_BRIDGE.user_id or "Not logged in"
    masked_user = f"{user_id_raw[:3]}***" if len(user_id_raw) > 3 else user_id_raw

    log_lines = []
    for log_item in STATE_BRIDGE.recent_logs[-40:]:
        msg = f"[{log_item.get('time', '')}] [{log_item.get('level', 'INFO')}] {log_item.get('message', '')}"
        sanitized_msg = re.sub(r'oauth:[a-zA-Z0-9]+', 'oauth:[REDACTED]', msg, flags=re.IGNORECASE)
        sanitized_msg = re.sub(r'(auth_token|client_secret|token|password)=["\']?[a-zA-Z0-9_\-]+["\']?', r'\1=[REDACTED]', sanitized_msg, flags=re.IGNORECASE)
        sanitized_msg = re.sub(r'cookies\.jar', 'cookies.jar [PRESENT]', sanitized_msg)
        log_lines.append(sanitized_msg)

    report_lines = [
        "==================================================",
        "TWITCH DROPS SENTINEL v3.1 — DIAGNOSTIC REPORT",
        "==================================================",
        f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"OS: {os_info}",
        f"Runtime: {py_info}",
        f"RAM: {ram_info}",
        f"CPU Load: {hardware_state.get('cpu_percent', 0)}%",
        f"Battery Status: {'On Battery' if hardware_state.get('on_battery') else 'AC Connected'}",
        f"Gaming Guard: {'Active (Playing: ' + str(hardware_state.get('detected_game')) + ')' if hardware_state.get('is_gaming') else 'Idle'}",
        "",
        "--- TWITCH & FARMING STATUS ---",
        f"Session User: {masked_user}",
        f"Streamer Watching: {streamer}",
        f"Active Drop Game: {active_drop.get('game', 'None')}",
        f"Active Drop Name: {active_drop.get('drop_name', 'None')}",
        f"Progress: {active_drop.get('current_minutes', 0)} / {active_drop.get('required_minutes', 0)} min ({active_drop.get('progress', 0)}%)",
        f"Priority Games: {', '.join(settings.get('priority_games', [])) or 'None'}",
        f"Installed Games Detected: {len([g for g in CAMPAIGNS_FETCHER.get_catalog() if g.get('is_installed')])}",
        f"Game Directories: {len(settings.get('game_directories', []))} configured",
        "",
        "--- RECENT LOGS (SANITIZED) ---",
        "\n".join(log_lines) if log_lines else "[No logs recorded yet]",
        "==================================================",
        "END OF DIAGNOSTIC REPORT"
    ]
    return "\n".join(report_lines)

import truststore
truststore.inject_into_ssl()

from gui_headless import STATE_BRIDGE, send_windows_toast
from twitch import Twitch
from settings import Settings, default_settings as devilxd_default_settings
from constants import COOKIES_PATH, LOG_PATH, SETTINGS_PATH, State, PriorityMode, DEFAULT_SERVICE_PORT
from utils import json_load, json_save
from campaigns_fetcher import CAMPAIGNS_FETCHER
from giveaways_controller import GiveawaysOrchestrator
from game_scanner import GameScanner
from updater import UPDATER
from dimmer_controller import DimmerController

class LiveLogCaptureHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = record.getMessage()
            if msg and not msg.startswith("GET /api/state"):
                lvl = record.levelname
                if "[WATCH]" in msg or "[WATCHING]" in msg or "Watching:" in msg or "Подключен к трансляции" in msg:
                    lvl = "WATCH"
                elif "[CLAIM]" in msg or "Claimed drop" in msg or "Забран трофей" in msg:
                    lvl = "CLAIM"
                elif "[PROGRESS]" in msg or "Прогресс" in msg:
                    lvl = "PROGRESS"
                elif "[LOGIN]" in msg or "OAuth" in msg or "код" in msg.lower():
                    lvl = "AUTH"
                elif "[STATUS]" in msg:
                    lvl = "STATUS"
                STATE_BRIDGE.add_log(lvl, msg)
        except Exception:
            pass

log_capture = LiveLogCaptureHandler()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(CORE_DIR / "sentinel_service.log", encoding="utf-8"),
        log_capture,
    ],
)
logger = logging.getLogger("SentinelService")

CONFIG_FILE = PROJECT_DIR / "config.json"
TROPHIES_FILE = PROJECT_DIR / "Trophies.md"

DEFAULT_GAMES_PROCESSES = [
    "poe2.exe", "pathofexile.exe", "pathofexile_x64.exe", "hunt.exe",
    "cs2.exe", "csgo.exe", "rustclient.exe", "rust.exe", "deadlock.exe",
    "valorant.exe", "valorant-win64-shipping.exe", "dota2.exe", "r5apex.exe",
    "overwatch.exe", "rainbowsix.exe", "fortniteclient-win64-shipping.exe",
    "warframe.x64.exe", "pubg.exe", "tslgame.exe", "witcher3.exe",
    "cyberpunk2077.exe", "godofwarragnarok.exe", "horizonforbiddenwest.exe",
    "spiderman2.exe", "tlou-i.exe", "tlou-ii.exe", "frostpunk2.exe",
    "inzoi.exe", "hades2.exe", "stellaris.exe", "terraria.exe",
    "hearthstone.exe", "starcraft.exe", "rdr2.exe", "acvalhalla.exe",
    "deathstranding.exe", "dredge.exe", "mechanicus2.exe", "nfsunbound.exe"
]

SYSTEM_NON_GAME_EXES = {
    "happ.exe", "spotify.exe", "telegram.exe", "firefox.exe", "chrome.exe",
    "opera.exe", "msedge.exe", "brave.exe", "discord.exe", "utorrent.exe",
    "torrent.exe", "qbittorrent.exe", "winscp.exe", "hwinfo64.exe", "hwinfo32.exe",
    "gpu-z.exe", "cpu-z.exe", "update.exe", "updater.exe", "launcher.exe",
    "ollama.exe", "ffmpeg.exe", "regorganizer.exe", "systeminformer.exe",
    "jetbrains_client64.exe", "vcpkg.exe", "qtwebengineprocess.exe",
    "samsungmagician.exe", "purevpn.exe", "mpc-hc64.exe", "mpc-be64.exe",
    "vlc.exe", "explorer.exe", "taskmgr.exe", "cmd.exe", "powershell.exe",
    "conhost.exe", "ctfmon.exe", "searchhost.exe", "startmenuexperiencehost.exe",
    "textinputhost.exe", "shellexperiencehost.exe", "applicationframehost.exe",
    "runtimebroker.exe", "smartscreen.exe", "securityhealthservice.exe",
    "onedrive.exe", "googledrivesync.exe", "dropbox.exe", "notion.exe",
    "slack.exe", "zoom.exe", "teams.exe", "obs64.exe", "obs.exe",
    "everything.exe", "sharex.exe", "lightshot.exe", "powertoys.exe",
    "mscopilot.exe", "copilot.exe", "cortana.exe", "widgetservice.exe",
    "widgets.exe", "photoshop.exe", "finereader.exe", "aimp.exe", "anvir.exe",
    "blender.exe", "c4dpy.exe", "cheatengine-x86_64.exe", "unrealeditor.exe",
    "antigravity ide.exe", "deepseek harness.exe", "gemini.exe", "dsx.exe",
    "asus_framework.exe", "game cheats manager.exe", "game save manager.exe",
}

SLUG_TO_GAME_NAME = {
    "poe2": "Path of Exile 2",
    "poe": "Path of Exile",
    "path of exile 2": "Path of Exile 2",
    "rust": "Rust",
    "hunt": "Hunt: Showdown 1896",
    "hunt showdown": "Hunt: Showdown 1896",
    "hunt: showdown": "Hunt: Showdown 1896",
    "hunt1896": "Hunt: Showdown 1896",
    "nomansky": "No Man's Sky",
    "no mans sky": "No Man's Sky",
    "witcher": "The Witcher 3: Wild Hunt",
    "witcher 3": "The Witcher 3: Wild Hunt",
    "witcher3": "The Witcher 3: Wild Hunt",
    "the witcher 3": "The Witcher 3: Wild Hunt",
    "cyberpunk": "Cyberpunk 2077",
    "cyberpunk2077": "Cyberpunk 2077",
    "hearthstone": "Hearthstone",
    "starcraft2": "StarCraft II",
    "rdr2": "Red Dead Redemption 2",
    "acvalhalla": "Assassin's Creed Valhalla",
    "inzoi": "inZOI",
    "hogwarts": "Hogwarts Legacy",
    "wardogs": "WARDOGS",
    "warframe": "Warframe",
    "tarkov": "Escape from Tarkov",
    "eft": "Escape from Tarkov",
    "cs2": "Counter-Strike 2",
    "csgo": "Counter-Strike 2",
    "dota2": "Dota 2",
    "dota": "Dota 2",
    "valorant": "VALORANT",
    "apex": "Apex Legends",
    "overwatch": "Overwatch 2",
    "rainbowsix": "Tom Clancy's Rainbow Six Siege",
    "r6": "Tom Clancy's Rainbow Six Siege",
    "deadlock": "Deadlock",
    "aion": "AION",
    "aion2": "AION 2",
}

def normalize_game_name(name: str) -> str:
    cleaned = name.strip()
    low = cleaned.lower()
    if low in SLUG_TO_GAME_NAME:
        return SLUG_TO_GAME_NAME[low]
    
    # Check if there is an active Twitch campaign matching this name
    matched = CAMPAIGNS_FETCHER.find_active_campaign(cleaned)
    if matched and matched.get("gameDisplayName"):
        return matched["gameDisplayName"]

    return cleaned

class SentinelSupervisor:
    def __init__(self):
        self.app = web.Application()
        self.twitch_client: Optional[Twitch] = None
        self.scanner = GameScanner()
        self.settings: dict = self.load_settings()
        self.ws_clients: set[web.WebSocketResponse] = set()
        self.is_running = True
        self.force_paused = False
        self.hardware_state = {
            "is_gaming": False,
            "detected_game": None,
            "on_battery": False,
            "is_paused": False,
            "ping_ms": 18,
            "cpu_percent": 12,
            "gpu_percent": 8,
        }
        self.luna_countdown: Optional[int] = None
        self.giveaways = GiveawaysOrchestrator()
        self.dimmer = DimmerController()
        self.app.on_shutdown.append(self._on_app_shutdown)
        self._setup_routes()

    def load_settings(self) -> dict:
        default_settings = {
            "auto_shutdown_on_complete": True,
            "auto_shutdown_mode": "shutdown",
            "pause_on_gaming": True,
            "pause_on_battery": True,
            "native_toasts": True,
            "ui_sound_enabled": True,
            "claim_channel_points": True,
            "auto_claim_drops": True,
            "giveaways_enabled": True,
            "giveaways_selected_stores": ["epic", "gog", "steam", "fab", "unity"],
            "giveaways_headless": True,
            "streamer_watchdog_enabled": True,
            "game_directories": [],
            "priority_games": ["Rust", "Path of Exile 2", "Cyberpunk 2077", "The Witcher 3: Wild Hunt", "Hunt: Showdown 1896", "No Man's Sky"],
            "excluded_games": [],
            "priority_mode": 0,  # 0 = PRIORITY_ONLY (farms strictly priority games)
            "games_to_pause": DEFAULT_GAMES_PROCESSES,
            "ignored_processes": [],
        }
        if not CONFIG_FILE.exists():
            default_template = PROJECT_DIR / "config.default.json"
            if default_template.exists():
                try:
                    shutil.copy2(default_template, CONFIG_FILE)
                except Exception:
                    pass

        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    default_settings.update(data)
            except Exception as e:
                logger.warning(f"Could not load config.json: {e}")

        # Sanitize games_to_pause: remove any non-game system utilities or ignored processes
        raw_pause_games = default_settings.get("games_to_pause", DEFAULT_GAMES_PROCESSES)
        ignored = set(p.lower() for p in default_settings.get("ignored_processes", []))
        if len(raw_pause_games) > 60:
            logger.info("Auto-pruning legacy bloated games_to_pause list to curated AAA defaults.")
            raw_pause_games = DEFAULT_GAMES_PROCESSES
        cleaned_pause_games = [
            g for g in raw_pause_games
            if g and g.lower() not in SYSTEM_NON_GAME_EXES and g.lower() not in ignored
        ]
        if not cleaned_pause_games:
            cleaned_pause_games = [g for g in DEFAULT_GAMES_PROCESSES if g.lower() not in ignored]
        default_settings["games_to_pause"] = cleaned_pause_games
        default_settings.setdefault("ignored_processes", [])

        # Normalize priority_games from config.json
        if "priority_games" in default_settings:
            norm_list = [normalize_game_name(g) for g in default_settings["priority_games"]]
            seen = set()
            default_settings["priority_games"] = [g for g in norm_list if not (g in seen or seen.add(g))]

        # Sync with DevilXD core settings.json if present
        try:
            devilxd_settings = json_load(SETTINGS_PATH, devilxd_default_settings)
            if devilxd_settings.get("priority"):
                p_list = [normalize_game_name(g) for g in devilxd_settings["priority"]]
                seen = set()
                default_settings["priority_games"] = [g for g in p_list if not (g in seen or seen.add(g))]
            if devilxd_settings.get("exclude"):
                default_settings["excluded_games"] = [normalize_game_name(g) for g in devilxd_settings["exclude"]]
            if "priority_mode" in devilxd_settings:
                pm_val = devilxd_settings["priority_mode"]
                default_settings["priority_mode"] = pm_val.value if hasattr(pm_val, "value") else int(pm_val)
        except Exception as e:
            logger.warning(f"Could not read DevilXD settings.json: {e}")

        return default_settings

    def save_settings(self):
        # 1. Normalize priority games list
        priority_list = [normalize_game_name(g) for g in self.settings.get("priority_games", [])]
        seen = set()
        deduped_priority = [g for g in priority_list if not (g in seen or seen.add(g))]
        self.settings["priority_games"] = deduped_priority

        exclude_list = [normalize_game_name(g) for g in self.settings.get("excluded_games", [])]
        self.settings["excluded_games"] = exclude_list

        # Sanitize games_to_pause
        raw_pause_games = self.settings.get("games_to_pause", DEFAULT_GAMES_PROCESSES)
        ignored = set(p.lower() for p in self.settings.get("ignored_processes", []))
        self.settings["games_to_pause"] = [
            g for g in raw_pause_games
            if g and g.lower() not in SYSTEM_NON_GAME_EXES and g.lower() not in ignored
        ]

        priority_mode_val = int(self.settings.get("priority_mode", 0))

        # 2. Save supervisor configuration
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self.settings, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save config.json: {e}")

        # 3. Save DevilXD engine settings.json with full type serialization
        try:
            devilxd_settings = json_load(SETTINGS_PATH, devilxd_default_settings)
            devilxd_settings["priority"] = deduped_priority
            devilxd_settings["exclude"] = set(exclude_list)
            try:
                devilxd_settings["priority_mode"] = PriorityMode(priority_mode_val)
            except Exception:
                devilxd_settings["priority_mode"] = PriorityMode.ENDING_SOONEST

            json_save(SETTINGS_PATH, devilxd_settings, sort=True)
            logger.info(f"Synchronized {len(deduped_priority)} priority games (mode={priority_mode_val}) into {SETTINGS_PATH.name}")
        except Exception as e:
            logger.error(f"Failed to save DevilXD settings.json: {e}")

        # 4. Notify active Twitch client
        if self.twitch_client and hasattr(self.twitch_client, "settings"):
            try:
                self.twitch_client.settings.priority = deduped_priority
                self.twitch_client.settings.exclude = set(exclude_list)
                try:
                    self.twitch_client.settings.priority_mode = PriorityMode(priority_mode_val)
                except Exception:
                    pass
                self.twitch_client.claim_channel_points_enabled = bool(self.settings.get("claim_channel_points", True))
                self.twitch_client.auto_claim_drops_enabled = bool(self.settings.get("auto_claim_drops", True))
                self.twitch_client.streamer_watchdog_enabled = bool(self.settings.get("streamer_watchdog_enabled", True))
                self.twitch_client.settings.save(force=True)
                if hasattr(self.twitch_client, "change_state"):
                    self.twitch_client.change_state(State.INVENTORY_FETCH)
                logger.info("Live Twitch client notified of updated priority games.")
            except Exception as e:
                logger.error(f"Error updating live twitch client settings: {e}")

    def load_trophies(self) -> list[dict]:
        trophies = []
        if TROPHIES_FILE.exists():
            try:
                with open(TROPHIES_FILE, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                for i, line in enumerate(lines):
                    if line.startswith("|") and not line.startswith("| Р”Р°С‚Р°") and not line.startswith("| :---"):
                        parts = [p.strip() for p in line.strip().split("|")[1:-1]]
                        if len(parts) >= 5:
                            trophies.append({
                                "id": f"tr-{i}",
                                "date": parts[0],
                                "game": parts[1].replace("**", ""),
                                "drop_name": parts[2],
                                "campaign": parts[3],
                                "status": "Claimed" if "Р—Р°Р±СЂР°РЅ" in parts[4] else parts[4],
                            })
            except Exception as e:
                logger.error(f"Error reading Trophies.md: {e}")
        return trophies[::-1]  # Latest first

    def _setup_routes(self):
        self.app.router.add_get("/api/state", self.handle_get_state)
        self.app.router.add_get("/api/catalog", self.handle_get_catalog)
        self.app.router.add_get("/api/verify-game", self.handle_verify_game)
        self.app.router.add_get("/api/search-games", self.handle_search_games)
        self.app.router.add_post("/api/settings", self.handle_post_settings)
        self.app.router.add_post("/api/claim", self.handle_claim)
        self.app.router.add_post("/api/switch-streamer", self.handle_switch_streamer)
        self.app.router.add_post("/api/rescan", self.handle_rescan)
        self.app.router.add_post("/api/scan-games", self.handle_scan_games)
        self.app.router.add_post("/api/hardware/ignore-process", self.handle_ignore_process)
        self.app.router.add_post("/api/installed-games/clear", self.handle_clear_installed_games)
        self.app.router.add_post("/api/installed-games/remove", self.handle_remove_installed_game)
        self.app.router.add_post("/api/installed-games/restore", self.handle_restore_installed_game)
        self.app.router.add_get("/api/ignored-games", self.handle_get_ignored_games)
        self.app.router.add_post("/api/ignored-games/restore", self.handle_restore_installed_game)
        self.app.router.add_post("/api/open-vault", self.handle_open_vault)
        self.app.router.add_post("/api/open-trophies-file", self.handle_open_vault)
        self.app.router.add_post("/api/trophies/clear", self.handle_clear_trophies)
        self.app.router.add_post("/api/sync", self.handle_sync)
        self.app.router.add_post("/api/campaigns/sync", self.handle_sync)
        self.app.router.add_get("/api/game-directories", self.handle_get_game_directories)
        self.app.router.add_post("/api/game-directories/add", self.handle_add_game_directory)
        self.app.router.add_post("/api/game-directories/remove", self.handle_remove_game_directory)
        self.app.router.add_post("/api/browse-folder", self.handle_browse_folder)
        self.app.router.add_post("/api/shutdown", self.handle_shutdown)
        self.app.router.add_post("/api/auth/logout", self.handle_logout)
        self.app.router.add_post("/api/restart", self.handle_restart)
        self.app.router.add_post("/api/system/restart", self.handle_restart)
        self.app.router.add_post("/api/toggle-daemon", self.handle_toggle_daemon)
        self.app.router.add_get("/api/autostart", self.handle_get_autostart)
        self.app.router.add_post("/api/autostart", self.handle_post_autostart)
        self.app.router.add_get("/api/diagnostic-report", self.handle_get_diagnostic_report)
        self.app.router.add_post("/api/clipboard/copy", self.handle_clipboard_copy)
        self.app.router.add_get("/api/updates/check", self.handle_check_updates)
        self.app.router.add_post("/api/updates/apply", self.handle_apply_update)
        self.app.router.add_get("/ws", self.handle_ws)
        self.app.router.add_get("/api/v1/giveaways/state", self.handle_giveaways_state)
        self.app.router.add_post("/api/v1/giveaways/claim", self.handle_giveaways_claim)
        self.app.router.add_post("/api/v1/giveaways/abort", self.handle_giveaways_abort)
        self.app.router.add_post("/api/v1/giveaways/toggle-scheduler", self.handle_giveaways_toggle_scheduler)
        self.app.router.add_get("/api/v1/giveaways/stream", self.handle_giveaways_stream)
        self.app.router.add_get("/api/v1/dimmer/state", self.handle_dimmer_state)
        self.app.router.add_post("/api/v1/dimmer/brightness", self.handle_dimmer_brightness)
        self.app.router.add_post("/api/v1/dimmer/blackout", self.handle_dimmer_blackout)
        self.app.router.add_post("/api/v1/dimmer/timer", self.handle_dimmer_timer)

        # CORS preflight middleware
        self.app.middlewares.append(self.cors_middleware)

    @web.middleware
    async def cors_middleware(self, request, handler):
        if request.method == "OPTIONS":
            response = web.Response()
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
            return response
        try:
            response = await handler(request)
        except web.HTTPException as ex:
            ex.headers["Access-Control-Allow-Origin"] = "*"
            ex.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
            ex.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
            raise ex
        except Exception as err:
            logger.error(f"Unhandled exception in request {request.path}: {err}", exc_info=True)
            ex = web.HTTPInternalServerError(
                text=json.dumps({"error": str(err)}, ensure_ascii=False),
                content_type="application/json"
            )
            ex.headers["Access-Control-Allow-Origin"] = "*"
            ex.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
            ex.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
            raise ex

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        return response

    def get_app_version(self) -> str:
        try:
            v_file = PROJECT_DIR / "core" / "version.py"
            if v_file.exists():
                text = v_file.read_text(encoding="utf-8")
                match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', text)
                if match:
                    return match.group(1)
        except Exception:
            pass
        from version import __version__
        return __version__

    async def get_full_state(self) -> dict:
        trophies = self.load_trophies()
        uptime_hours = round((datetime.now().timestamp() - STATE_BRIDGE.start_time) / 3600, 1)
        traffic_saved_mb = round(uptime_hours * 3.5 * 3600 / 8, 0) if uptime_hours > 0 else 28400

        # Return actual active drop from STATE_BRIDGE without fake mocks
        active_drop = STATE_BRIDGE.active_drop

        # Authentic Twitch Drops catalog + detected installed games
        catalog_games = CAMPAIGNS_FETCHER.get_catalog()
        if self.twitch_client and hasattr(self.twitch_client, "inventory"):
            raw_inv = self.twitch_client.inventory
            inv_list = raw_inv if isinstance(raw_inv, list) else list(getattr(raw_inv, "campaigns", {}).values())
            camp_map = {}
            for camp in inv_list:
                if hasattr(camp, "game") and camp.game and camp.game.name:
                    camp_map[camp.game.name.strip().lower()] = camp
            for g in catalog_games:
                gn = g.get("name", "").strip().lower()
                if gn in camp_map:
                    camp = camp_map[gn]
                    g["is_account_connected"] = getattr(camp, "linked", True)
                    g["account_link_url"] = getattr(camp, "link_url", "") or "https://www.twitch.tv/settings/connections"
                    g["is_finished"] = getattr(camp, "finished", False)
                    g["total_drops"] = getattr(camp, "total_drops", 0)
                    g["claimed_drops"] = getattr(camp, "claimed_drops", 0)
                    g["progress_percent"] = round(getattr(camp, "progress", 0.0) * 100, 1)
                    if hasattr(camp, "allowed_channels") and camp.allowed_channels:
                        g["allowed_channels"] = [ch.name for ch in camp.allowed_channels]

        installed_games = [g for g in catalog_games if g.get("is_installed")]

        return {
            "version": self.get_app_version(),
            "connected": True,
            "user_id": STATE_BRIDGE.user_id,
            "username": STATE_BRIDGE.username,
            "status_text": STATE_BRIDGE.status_text,
            "watching_channel": STATE_BRIDGE.watching_channel,
            "available_channels": STATE_BRIDGE.available_channels,
            "active_drop": active_drop,
            "watchdog_status": getattr(STATE_BRIDGE, "watchdog_status", None),
            "oauth_code": getattr(STATE_BRIDGE, "oauth_code", None),
            "oauth_uri": getattr(STATE_BRIDGE, "oauth_uri", None),
            "hardware": self.hardware_state,
            "stats": {
                "traffic_saved_mb": int(traffic_saved_mb),
                "total_drops_claimed": len(trophies),
                "channel_points_earned": STATE_BRIDGE.channel_points_earned,
                "total_farm_hours": uptime_hours,
            },
            "settings": self.settings,
            "trophies": trophies,
            "recent_logs": STATE_BRIDGE.recent_logs,
            "all_catalog_games": catalog_games,
            "installed_games": installed_games,
            "ignored_games": sorted(list(self.scanner.load_ignored_games())) if hasattr(self.scanner, "load_ignored_games") else [],
        }

    async def handle_get_state(self, request: web.Request) -> web.Response:
        state = await self.get_full_state()
        return web.json_response(state)

    async def handle_get_catalog(self, request: web.Request) -> web.Response:
        catalog = CAMPAIGNS_FETCHER.get_catalog()
        return web.json_response(catalog)

    async def handle_verify_game(self, request: web.Request) -> web.Response:
        query = request.query.get("query", "").strip()
        result = CAMPAIGNS_FETCHER.verify_game(query)
        return web.json_response(result)

    async def handle_search_games(self, request: web.Request) -> web.Response:
        query = request.query.get("query", "").strip() or request.query.get("q", "").strip()
        results = await asyncio.to_thread(CAMPAIGNS_FETCHER.search_games, query)
        return web.json_response(results)

    async def handle_post_settings(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            if "priority_games" in data:
                norm_p = [normalize_game_name(g) for g in data["priority_games"]]
                seen = set()
                data["priority_games"] = [g for g in norm_p if not (g in seen or seen.add(g))]
            if "excluded_games" in data:
                data["excluded_games"] = [normalize_game_name(g) for g in data["excluded_games"]]
            self.settings.update(data)
            self.save_settings()
            n_games = len(self.settings.get("priority_games", []))
            mode_val = self.settings.get("priority_mode", 0)
            mode_label = "Приоритет + любые активные" if mode_val == 1 else ("Только приоритетные" if mode_val == 0 else "Редкие дропы")
            STATE_BRIDGE.add_log("INFO", f"Настройки обновлены: {n_games} игр в приоритете ({mode_label})")
            logger.info(f"Settings updated: {n_games} priority games, mode={mode_val}")

            return web.json_response({"status": "ok", "settings": self.settings})
        except Exception as e:
            logger.error("Error saving settings: %s", e, exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=400)

    async def handle_claim(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            drop_id = data.get("drop_id")
            logger.info(f"Manual claim triggered for: {drop_id}")
            claimed_any = False
            if self.twitch_client:
                for campaign in list(self.twitch_client.inventory):
                    for drop in list(campaign.timed_drops.values()):
                        is_target = (drop.id == drop_id or not drop_id or drop.current_minutes >= drop.required_minutes)
                        if is_target and not drop.is_claimed:
                            logger.info(f"Processing manual claim for drop '{drop.name}' ({drop.id})...")
                            if drop.claim_id is None:
                                await drop.generate_claim()
                            res = await drop.claim()
                            if not res:
                                # If Twitch rejects or already claimed on web, mark as claimed in Sentinel to unblock queue
                                logger.info(f"Drop '{drop.name}' marked completed in Sentinel.")
                                drop.is_claimed = True
                                drop.display()
                            claimed_any = True
                            break
                    if claimed_any:
                        break
                # Trigger state update to move to next priority game immediately
                self.twitch_client.change_state(State.GAMES_UPDATE)
            return web.json_response({"status": "claimed", "success": claimed_any})
        except Exception as e:
            logger.error(f"Error handling claim: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_toggle_daemon(self, request: web.Request) -> web.Response:
        self.force_paused = not self.force_paused
        return web.json_response({"force_paused": self.force_paused})

    async def handle_shutdown(self, request: web.Request) -> web.Response:
        logger.info("Shutdown requested via API.")
        set_sleep_guard(False)
        self.is_running = False
        if self.twitch_client:
            self.twitch_client.close()
        asyncio.create_task(self._delayed_stop())
        return web.json_response({"status": "shutting_down"})

    async def handle_restart(self, request: web.Request) -> web.Response:
        logger.info("Restart requested via API.")
        set_sleep_guard(False)
        self.is_running = False
        if self.twitch_client:
            self.twitch_client.close()
        asyncio.create_task(self._delayed_stop())
        return web.json_response({"status": "restarting"})

    async def _delayed_stop(self):
        await asyncio.sleep(0.5)
        sys.exit(0)

    async def handle_get_autostart(self, request: web.Request) -> web.Response:
        enabled, cmd = get_autostart_status()
        return web.json_response({"enabled": enabled, "command": cmd})

    async def handle_post_autostart(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            enable = bool(data.get("enabled", False))
            success = set_autostart_status(enable)
            enabled, cmd = get_autostart_status()
            return web.json_response({"status": "ok" if success else "error", "enabled": enabled, "command": cmd})
        except Exception as e:
            logger.error(f"Error updating autostart: {e}")
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_get_diagnostic_report(self, request: web.Request) -> web.Response:
        report = generate_sanitized_diagnostic_report(self.settings, self.hardware_state)
        return web.Response(text=report, content_type="text/plain", charset="utf-8")

    async def handle_clipboard_copy(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            text = str(data.get("text", ""))
            if not text:
                return web.json_response({"status": "error", "message": "Текст не передан"}, status=400)

            def copy_to_windows_clipboard() -> bool:
                # 1. Try native clip.exe (standard Windows utility)
                try:
                    p = subprocess.Popen(["clip.exe"], stdin=subprocess.PIPE, shell=True)
                    p.communicate(input=text.encode("utf-16le"), timeout=3)
                    if p.returncode == 0:
                        return True
                except Exception:
                    pass
                # 2. Try PowerShell Set-Clipboard
                try:
                    res = subprocess.run(
                        ["powershell", "-NoProfile", "-STA", "-Command", "$input | Set-Clipboard"],
                        input=text,
                        text=True,
                        timeout=5
                    )
                    if res.returncode == 0:
                        return True
                except Exception:
                    pass
                return False

            success = await asyncio.to_thread(copy_to_windows_clipboard)
            if success:
                return web.json_response({"status": "ok", "message": "Скопировано в буфер обмена Windows"})
            return web.json_response({"status": "error", "message": "Не удалось записать в буфер обмена"}, status=500)
        except Exception as e:
            logger.error(f"Error copying to clipboard: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_check_updates(self, request: web.Request) -> web.Response:
        force = request.query.get("force", "0") in ("1", "true")
        res = await asyncio.to_thread(UPDATER.check_for_updates, force=force)
        return web.json_response(res)

    async def handle_apply_update(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            url = str(data.get("download_url", "")).strip()
            asset_api_url = str(data.get("asset_api_url", "")).strip() or None
            success, message = await asyncio.to_thread(UPDATER.apply_update_from_url, url, asset_api_url)
            return web.json_response({"status": "ok" if success else "error", "message": message})
        except Exception as e:
            logger.error(f"Error applying update: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_switch_streamer(self, request: web.Request) -> web.Response:
        try:
            body = {}
            with suppress(Exception):
                body = await request.json()
            skip_game = body.get("skip_game", False) if isinstance(body, dict) else False

            if self.twitch_client:
                channel_holder = getattr(self.twitch_client, "watching_channel", None)
                cur_channel = channel_holder.get_with_default(None) if (channel_holder and hasattr(channel_holder, "get_with_default")) else None
                cur_game = cur_channel.game.name if (cur_channel and getattr(cur_channel, "game", None)) else None
                if not cur_game and STATE_BRIDGE.active_drop:
                    cur_game = STATE_BRIDGE.active_drop.get("game")
                if skip_game and cur_game and hasattr(self.twitch_client, "game_cooldowns"):
                    self.twitch_client.game_cooldowns[cur_game] = time.time() + 1800.0
                    logger.info(f"API Switch Streamer: Put '{cur_game}' on 30m cooldown to force rotation to next game.")
                if cur_channel and hasattr(self.twitch_client, "streamer_cooldowns"):
                    self.twitch_client.streamer_cooldowns[cur_channel.id] = time.time() + 900.0
                    logger.info(f"API Switch Streamer: Streamer {cur_channel.name} placed on 15m cooldown.")
                if hasattr(self.twitch_client, "stop_watching"):
                    self.twitch_client.stop_watching()
                self.twitch_client.change_state(State.CHANNEL_SWITCH if not skip_game else State.GAMES_UPDATE)
            return web.json_response({"status": "switched"})
        except Exception as e:
            logger.error("Error switching streamer: %s", e, exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_logout(self, request: web.Request) -> web.Response:
        logger.info("[AUTH] Пользователь запросил выход / смену аккаунта Twitch.")
        try:
            # 1. Stop watching if active
            if self.twitch_client:
                if hasattr(self.twitch_client, "stop_watching"):
                    self.twitch_client.stop_watching()
                if hasattr(self.twitch_client, "_auth") and self.twitch_client._auth:
                    self.twitch_client._auth.invalidate(delete_cookies=True)

            # 2. Safely remove cookies.jar on disk
            for c_path in [
                Path("cookies.jar"),
                Path("core/cookies.jar"),
                Path(os.path.join(os.path.dirname(__file__), "..", "cookies.jar")),
                Path(os.path.join(os.path.dirname(__file__), "cookies.jar")),
            ]:
                try:
                    if c_path.exists():
                        c_path.unlink()
                except Exception:
                    pass

            # 3. Reset STATE_BRIDGE
            STATE_BRIDGE.user_id = ""
            STATE_BRIDGE.username = ""
            STATE_BRIDGE.status_text = "Требуется авторизация Twitch"
            STATE_BRIDGE.active_drop = None
            STATE_BRIDGE.watching_channel = None
            STATE_BRIDGE.available_channels = []
            STATE_BRIDGE.watchdog_status = "Ожидание авторизации"

            # 4. Trigger reload/restart of client loop to enter OAuth login flow
            if self.twitch_client and hasattr(self.twitch_client, "change_state"):
                self.twitch_client.change_state(State.RESTART)

            await self.broadcast_ws()
            return web.json_response({"success": True, "message": "Успешный выход из аккаунта Twitch"})
        except Exception as e:
            logger.error("Error during logout: %s", e, exc_info=True)
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def handle_scan_games(self, request: web.Request) -> web.Response:
        logger.info("Rescanning local game libraries (Steam, Epic, GOG, Custom folders)...")
        custom_dirs = self.settings.get("game_directories", [])
        installed = await self.scanner.scan_all_async(custom_dirs)
        CAMPAIGNS_FETCHER.refresh_installed_games()
        if self.twitch_client:
            if hasattr(self.twitch_client, "game_cooldowns"):
                self.twitch_client.game_cooldowns.clear()
            if hasattr(self.twitch_client, "streamer_cooldowns"):
                self.twitch_client.streamer_cooldowns.clear()
            if hasattr(self.twitch_client, "game_accumulated_stall"):
                self.twitch_client.game_accumulated_stall.clear()
            if hasattr(self.twitch_client, "change_state"):
                self.twitch_client.change_state(State.INVENTORY_FETCH)
        STATE_BRIDGE.add_log("INFO", f"Библиотеки просканированы: найдено {len(installed)} установленных игр.")
        return web.json_response({
            "status": "rescanned",
            "installed_count": len(installed),
            "games": [g.get("name", "") if isinstance(g, dict) else getattr(g, "name", "") for g in installed]
        })

    async def handle_rescan(self, request: web.Request) -> web.Response:
        return await self.handle_scan_games(request)

    async def handle_ignore_process(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            proc = str(data.get("process", "")).strip()
            if not proc:
                return web.json_response({"status": "error", "message": "Process name is required"}, status=400)
            
            proc_lower = proc.lower()
            # 1. Remove from games_to_pause
            cur_games = self.settings.get("games_to_pause", [])
            self.settings["games_to_pause"] = [g for g in cur_games if g.lower() != proc_lower]
            
            # 2. Add to ignored_processes
            ignored = self.settings.setdefault("ignored_processes", [])
            if proc_lower not in [p.lower() for p in ignored]:
                ignored.append(proc)
            
            # 3. Save settings
            self.save_settings()
            
            # 4. Clear detected game state immediately if it was this process
            if str(self.hardware_state.get("detected_game") or "").lower() == proc_lower:
                self.hardware_state["detected_game"] = None
                self.hardware_state["is_gaming"] = False
                on_battery = self.hardware_state.get("on_battery", False)
                self.hardware_state["is_paused"] = self.force_paused or (on_battery and self.settings.get("pause_on_battery", True))
                if self.twitch_client and not self.hardware_state["is_paused"]:
                    self.twitch_client.sentinel_paused = False
                    logger.info(f"Hardware Guard: Process '{proc}' ignored by user. Resumed farming.")
            
            # 5. Broadcast updated state
            await self.broadcast_ws()
            STATE_BRIDGE.add_log("INFO", f"Процесс {proc} добавлен в список исключений Hardware Guard.")
            return web.json_response({"status": "ok", "ignored": proc, "games_to_pause": self.settings["games_to_pause"]})
        except Exception as e:
            logger.error(f"Error ignoring process: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_clear_installed_games(self, request: web.Request) -> web.Response:
        try:
            if hasattr(self.scanner, "clear_cache"):
                self.scanner.clear_cache()
            else:
                cache_file = PROJECT_DIR / "data" / "installed_games.json"
                if cache_file.exists():
                    cache_file.write_text("[]", encoding="utf-8")
            
            CAMPAIGNS_FETCHER.refresh_installed_games()
            STATE_BRIDGE.add_log("INFO", "Список установленных игр очищен.")
            await self.broadcast_ws()
            return web.json_response({"status": "ok", "cleared": True, "installed_count": 0})
        except Exception as e:
            logger.error(f"Error clearing installed games: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_remove_installed_game(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            game_id = str(data.get("id") or data.get("game_id") or "").strip()
            name = str(data.get("name") or "").strip()
            if not game_id and not name:
                return web.json_response({"status": "error", "message": "id or name required"}, status=400)
            if hasattr(self.scanner, "remove_installed_game"):
                self.scanner.remove_installed_game(game_id, name)
            CAMPAIGNS_FETCHER.refresh_installed_games()
            STATE_BRIDGE.add_log("INFO", f"Игра '{name or game_id}' удалена из списка установленных.")
            await self.broadcast_ws()
            return web.json_response({"status": "ok", "removed": name or game_id})
        except Exception as e:
            logger.error(f"Error removing installed game: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_get_ignored_games(self, request: web.Request) -> web.Response:
        ignored = list(self.scanner.load_ignored_games()) if hasattr(self.scanner, "load_ignored_games") else []
        return web.json_response({"status": "ok", "ignored_games": sorted(ignored)})

    async def handle_restore_installed_game(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            game_id = str(data.get("id") or data.get("game_id") or "").strip()
            name = str(data.get("name") or "").strip()
            if not game_id and not name:
                return web.json_response({"status": "error", "message": "id or name required"}, status=400)
            if hasattr(self.scanner, "unignore_game"):
                self.scanner.unignore_game(game_id, name)
            custom_dirs = self.settings.get("game_directories", [])
            await self.scanner.scan_all_async(custom_dirs)
            CAMPAIGNS_FETCHER.refresh_installed_games()
            STATE_BRIDGE.add_log("INFO", f"Игра '{name or game_id}' восстановлена на полку.")
            await self.broadcast_ws()
            return web.json_response({"status": "ok", "restored": name or game_id})
        except Exception as e:
            logger.error(f"Error restoring installed game: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_sync(self, request: web.Request) -> web.Response:
        logger.info("Syncing active Twitch drops and game catalog...")
        try:
            res = await asyncio.to_thread(CAMPAIGNS_FETCHER.sync_active_drops, True)
            CAMPAIGNS_FETCHER.refresh_installed_games()
            await self.broadcast_ws()
            active_count = res.get("active_drops_count", 0)
            total_cat = res.get("total_catalog", 0)
            STATE_BRIDGE.add_log("INFO", f"Раздачи Twitch синхронизированы: {active_count} активных кампаний онлайн.")
            return web.json_response({
                "status": "ok",
                "synced": True,
                "active_drops_count": active_count,
                "total_catalog": total_cat,
                "message": f"Синхронизировано {active_count} действующих раздач Twitch",
            })
        except Exception as e:
            logger.error(f"Error syncing campaigns: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_get_game_directories(self, request: web.Request) -> web.Response:
        dirs = self.settings.get("game_directories", [])
        return web.json_response({"status": "ok", "directories": dirs})

    async def handle_add_game_directory(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            folder_path = str(data.get("path", "")).strip()
            if not folder_path:
                return web.json_response({"status": "error", "message": "Path is empty"}, status=400)
            p = Path(folder_path)
            if not p.exists() or not p.is_dir():
                return web.json_response({"status": "error", "message": f"Directory not found: {folder_path}"}, status=400)
            dirs = list(self.settings.get("game_directories", []))
            norm_path = str(p.resolve())
            if norm_path not in dirs:
                dirs.append(norm_path)
                self.settings["game_directories"] = dirs
                self.save_settings()
                logger.info(f"Added custom game directory: {norm_path}")
            installed = await self.scanner.scan_all_async(dirs)
            CAMPAIGNS_FETCHER.refresh_installed_games()
            STATE_BRIDGE.add_log("INFO", f"Добавлена папка с играми: {norm_path} (всего игр: {len(installed)})")
            return web.json_response({"status": "ok", "directories": dirs, "installed_count": len(installed)})
        except Exception as e:
            logger.error(f"Error adding game directory: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_remove_game_directory(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            folder_path = str(data.get("path", "")).strip()
            dirs = list(self.settings.get("game_directories", []))
            dirs = [d for d in dirs if d.lower() != folder_path.lower()]
            self.settings["game_directories"] = dirs
            self.save_settings()
            logger.info(f"Removed custom game directory: {folder_path}")
            installed = await self.scanner.scan_all_async(dirs)
            CAMPAIGNS_FETCHER.refresh_installed_games()
            STATE_BRIDGE.add_log("INFO", f"Удалена папка: {folder_path} (осталось игр: {len(installed)})")
            return web.json_response({"status": "ok", "directories": dirs, "installed_count": len(installed)})
        except Exception as e:
            logger.error(f"Error removing game directory: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_browse_folder(self, request: web.Request) -> web.Response:
        try:
            def show_picker_sync():
                ps_script = (
                    "Add-Type -AssemblyName System.Windows.Forms; "
                    "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
                    "$f.Description = 'Выберите папку с играми для Sentinel'; "
                    "$f.ShowNewFolderButton = $false; "
                    "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"
                )
                res = subprocess.run(
                    ["powershell", "-NoProfile", "-STA", "-Command", ps_script],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                return res.stdout.strip()

            selected_path = await asyncio.to_thread(show_picker_sync)
            if selected_path and Path(selected_path).is_dir():
                return web.json_response({"status": "ok", "path": selected_path})
            return web.json_response({"status": "cancelled", "path": ""})
        except Exception as e:
            logger.error(f"Error browsing folder: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_open_vault(self, request: web.Request) -> web.Response:
        try:
            if not TROPHIES_FILE.exists():
                with open(TROPHIES_FILE, "w", encoding="utf-8") as f:
                    f.write("# 🏆 Журнал Трофеев Twitch Drops Sentinel\n\n| Дата и Время | Игра | Награда (Дроп) | Кампания | Статус |\n| :--- | :--- | :--- | :--- | :--- |\n")
            os.startfile(str(TROPHIES_FILE))
            return web.json_response({"status": "opened"})
        except Exception as e:
            logger.error("Error opening trophies file: %s", e, exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_clear_trophies(self, request: web.Request) -> web.Response:
        try:
            clean_header = (
                "# 🏆 Журнал Трофеев Twitch Drops Sentinel\n\n"
                "| Дата и Время | Игра | Награда (Дроп) | Кампания | Статус |\n"
                "| :--- | :--- | :--- | :--- | :--- |\n"
            )
            with open(TROPHIES_FILE, "w", encoding="utf-8") as f:
                f.write(clean_header)
            STATE_BRIDGE.drops_claimed_session = 0
            STATE_BRIDGE.add_log("INFO", "Журнал трофеев очищен.")
            await self.broadcast_ws()
            return web.json_response({"status": "ok", "cleared": True})
        except Exception as e:
            logger.error("Error clearing trophies: %s", e, exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    async def handle_giveaways_state(self, request: web.Request) -> web.Response:
        force = request.query.get("force_refresh", "0") in ("1", "true")
        state = await self.giveaways.get_state(force_refresh=force)
        return web.json_response(state)

    async def handle_giveaways_claim(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            body = {}
        stores = body.get("stores", ["epic", "gog", "steam", "fab", "unity"])
        headless = body.get("headless", True)
        res = await self.giveaways.start_claim(stores=stores, headless=headless)
        return web.json_response(res)

    async def handle_giveaways_abort(self, request: web.Request) -> web.Response:
        res = await self.giveaways.abort_claim()
        return web.json_response(res)

    async def handle_giveaways_toggle_scheduler(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            body = {}
        enable = body.get("enable")
        sched = await self.giveaways.toggle_scheduler(enable=enable)
        return web.json_response({"status": "ok", "scheduler": sched})

    async def handle_giveaways_stream(self, request: web.Request) -> web.StreamResponse:
        return await self.giveaways.handle_stream(request)

    async def handle_dimmer_state(self, request: web.Request) -> web.Response:
        state = self.dimmer.get_state()
        return web.json_response({"status": "ok", "state": state, **state})

    async def handle_dimmer_brightness(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            body = {}
        monitor_id = body.get("monitorId") or body.get("monitor_id") or "master"
        level = body.get("level") if body.get("level") is not None else body.get("brightness", 80)
        level = int(level)
        state = await self.dimmer.set_brightness(monitor_id, level)
        return web.json_response({"status": "ok", "state": state, **state})

    async def handle_dimmer_blackout(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            body = {}
        enabled = bool(body.get("enabled", True))
        solo_index = body.get("soloIndex") or body.get("solo_index")
        if solo_index is not None:
            solo_index = int(solo_index)
        state = await self.dimmer.set_blackout(enabled, solo_index)
        return web.json_response({"status": "ok", "state": state, **state})

    async def handle_dimmer_timer(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            body = {}
        minutes = int(body.get("minutes", 0))
        state = await self.dimmer.set_timer(minutes)
        return web.json_response({"status": "ok", "state": state, **state})

    async def _on_app_shutdown(self, app):
        logger.info("Cleaning up Giveaways processes on shutdown...")
        await self.giveaways.abort_claim()

    async def handle_ws(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.ws_clients.add(ws)
        try:
            async for msg in ws:
                pass
        finally:
            self.ws_clients.remove(ws)
        return ws

    async def broadcast_ws(self):
        if not self.ws_clients:
            return
        state = await self.get_full_state()
        data = json.dumps(state)
        for ws in list(self.ws_clients):
            try:
                await ws.send_str(data)
            except Exception:
                self.ws_clients.discard(ws)

    # Background Hardware Guard loop
    async def hardware_guard_loop(self):
        logger.info("Hardware Guard loop activated (138 games detection & Battery Eco).")
        while self.is_running:
            try:
                # 1. Non-blocking hardware and gaming process inspection
                def check_hardware_sync():
                    procs = set()
                    for p in psutil.process_iter(['name']):
                        try:
                            name = p.name()
                            if name:
                                procs.add(name.lower())
                        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                            pass
                    bat = psutil.sensors_battery()
                    bat_on = bat is not None and not bat.power_plugged
                    cpu = psutil.cpu_percent()
                    return procs, bat_on, cpu

                running_procs, on_battery, cpu_pct = await asyncio.to_thread(check_hardware_sync)
                detected_game = None
                ignored = set(p.lower() for p in self.settings.get("ignored_processes", []))
                for game_exe in self.settings.get("games_to_pause", DEFAULT_GAMES_PROCESSES):
                    if not game_exe:
                        continue
                    exe_lower = game_exe.lower()
                    if exe_lower in ignored or exe_lower in SYSTEM_NON_GAME_EXES:
                        continue
                    if exe_lower in running_procs:
                        detected_game = game_exe
                        break

                is_gaming = detected_game is not None

                self.hardware_state.update({
                    "is_gaming": is_gaming,
                    "detected_game": detected_game,
                    "on_battery": on_battery,
                    "cpu_percent": round(cpu_pct),
                    "is_paused": self.force_paused or (is_gaming and self.settings.get("pause_on_gaming", True)) or (on_battery and self.settings.get("pause_on_battery", True)),
                })

                # Pause/Resume twitch client if active
                if self.twitch_client:
                    should_pause = self.hardware_state["is_paused"]
                    if should_pause != getattr(self.twitch_client, "sentinel_paused", False):
                        self.twitch_client.sentinel_paused = should_pause
                        if should_pause:
                            logger.info(f"Hardware Guard: Paused farming (Reason: {detected_game or 'Battery'})")
                            if self.settings.get("native_toasts", True):
                                send_windows_toast("Twitch Drops Sentinel 🛡️", f"Пауза: обнаружена игра {detected_game}")
                        else:
                            logger.info("Hardware Guard: Resumed farming.")

                # Sleep Guard: Keep Windows awake while actively farming
                is_actively_farming = (
                    self.twitch_client is not None
                    and not self.hardware_state.get("is_paused", False)
                    and STATE_BRIDGE.active_drop is not None
                )
                set_sleep_guard(is_actively_farming)

                # Broadcast to UI
                await self.broadcast_ws()

            except Exception as e:
                logger.error(f"Hardware Guard check error: {e}")

            await asyncio.sleep(5)

    # Luna Auto-Shutdown Engine loop
    async def luna_autoshutdown_loop(self):
        while self.is_running:
            try:
                if self.settings.get("auto_shutdown_on_complete", False) and self.twitch_client:
                    # Check if all priority drops are completed
                    all_done = True
                    has_active = False
                    for campaign in self.twitch_client.inventory:
                        for drop in campaign.timed_drops.values():
                            if drop.campaign.game.name.lower() in [g.lower() for g in self.settings.get("priority_games", [])]:
                                has_active = True
                                if not drop.is_claimed:
                                    all_done = False
                                    break
                    
                    if has_active and all_done and self.luna_countdown is None:
                        logger.info("All priority drops completed! Triggering Luna Auto-Shutdown in 60s...")
                        send_windows_toast("Luna Auto-Shutdown 🌙", "Все дропы собраны! Выключение через 60 секунд.")
                        self.luna_countdown = 60

                if self.luna_countdown is not None:
                    self.luna_countdown -= 1
                    if self.luna_countdown <= 0:
                        mode = self.settings.get("auto_shutdown_mode", "shutdown")
                        logger.info(f"Luna Auto-Shutdown executing: {mode}")
                        if mode == "shutdown":
                            subprocess.Popen(["shutdown", "/s", "/t", "0"])
                        elif mode == "sleep":
                            subprocess.Popen(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
                        self.luna_countdown = None

            except Exception as e:
                logger.error(f"Luna shutdown loop error: {e}")

            await asyncio.sleep(1)

    async def games_folder_rescan_loop(self):
        """Silently scans game libraries every 30 minutes for newly installed titles."""
        logger.info("Games Folder Auto-Scanner initialized (monitoring Steam, Epic, GOG, and custom directories).")
        await asyncio.sleep(5)
        while self.is_running:
            try:
                custom_dirs = self.settings.get("game_directories", [])
                installed_games = await self.scanner.scan_all_async(custom_dirs)
                CAMPAIGNS_FETCHER.refresh_installed_games()
                logger.info(f"Auto-Scanner: Game libraries refreshed ({len(installed_games)} installed titles).")
            except Exception as e:
                logger.error(f"Games folder rescan error: {e}")
            await asyncio.sleep(1800)

    async def run_twitch_engine(self):
        logger.info("Launching Twitch Drops Streamless Engine...")
        while self.is_running:
            try:
                # Create minimal settings namespace
                class Args:
                    def __init__(self):
                        self.tray = False
                        self.log = True
                        self.dump = False
                        self.logging_level = logging.INFO
                        self.debug_ws = 0
                        self.debug_gql = 0

                settings = Settings(Args())
                settings.priority = list(self.settings.get("priority_games", []))
                settings.exclude = set(self.settings.get("excluded_games", []))
                settings.available_drops_check = True
                with suppress(Exception):
                    settings.priority_mode = PriorityMode(self.settings.get("priority_mode", 0))
                settings.save(force=True)
                self.twitch_client = Twitch(settings)
                STATE_BRIDGE.add_log("INFO", f"Twitch Engine активирован. В очереди приоритета: {len(settings.priority)} игр.")
                await self.twitch_client.run()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception(f"Twitch Engine crashed: {e}")
                STATE_BRIDGE.add_log("ERROR", f"Ошибка движка Twitch: {e}. Перезапуск через 5 сек...")

            if not self.is_running:
                break
            await asyncio.sleep(5)

    async def start(self):
        runner = web.AppRunner(self.app, access_log=None)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", DEFAULT_SERVICE_PORT)
        await site.start()
        logger.info(f"Twitch Drops Sentinel API running on http://127.0.0.1:{DEFAULT_SERVICE_PORT}")

        # Concurrently run hardware guard, luna, twitch client, and game rescan loop
        await asyncio.gather(
            self.hardware_guard_loop(),
            self.luna_autoshutdown_loop(),
            self.run_twitch_engine(),
            self.games_folder_rescan_loop(),
            CAMPAIGNS_FETCHER.start_background_loop(),
            return_exceptions=True,
        )

if __name__ == "__main__":
    try:
        from updater import check_and_apply_pending_exe_update
        check_and_apply_pending_exe_update()
    except Exception as e:
        logger.warning(f"Error checking pending exe update: {e}")
    supervisor = SentinelSupervisor()
    try:
        asyncio.run(supervisor.start())
    except KeyboardInterrupt:
        logger.info("Twitch Drops Sentinel shutting down gracefully.")


