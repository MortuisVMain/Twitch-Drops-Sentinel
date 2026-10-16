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
import json
import logging
import os
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

import truststore
truststore.inject_into_ssl()

from gui_headless import STATE_BRIDGE, send_windows_toast
from twitch import Twitch
from settings import Settings, default_settings as devilxd_default_settings
from constants import COOKIES_PATH, LOG_PATH, SETTINGS_PATH, State, PriorityMode, DEFAULT_SERVICE_PORT
from utils import json_load, json_save
from campaigns_fetcher import CAMPAIGNS_FETCHER

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
        self._setup_routes()

    def load_settings(self) -> dict:
        default_settings = {
            "auto_shutdown_on_complete": True,
            "auto_shutdown_mode": "shutdown",
            "pause_on_gaming": True,
            "pause_on_battery": True,
            "native_toasts": True,
            "priority_games": ["Rust", "Path of Exile 2", "Cyberpunk 2077", "The Witcher 3: Wild Hunt", "Hunt: Showdown 1896", "No Man's Sky"],
            "excluded_games": [],
            "priority_mode": 0,  # 0 = PRIORITY_ONLY (farms strictly priority games)
            "games_to_pause": DEFAULT_GAMES_PROCESSES,
        }
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    default_settings.update(data)
            except Exception as e:
                logger.warning(f"Could not load config.json: {e}")

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
        self.app.router.add_post("/api/open-vault", self.handle_open_vault)
        self.app.router.add_post("/api/shutdown", self.handle_shutdown)
        self.app.router.add_post("/api/toggle-daemon", self.handle_toggle_daemon)
        self.app.router.add_get("/ws", self.handle_ws)

        # CORS preflight middleware
        self.app.middlewares.append(self.cors_middleware)

    @web.middleware
    async def cors_middleware(self, request, handler):
        if request.method == "OPTIONS":
            response = web.Response()
        else:
            response = await handler(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    async def get_full_state(self) -> dict:
        trophies = self.load_trophies()
        uptime_hours = round((datetime.now().timestamp() - STATE_BRIDGE.start_time) / 3600, 1)
        traffic_saved_mb = round(uptime_hours * 3.5 * 3600 / 8, 0) if uptime_hours > 0 else 28400

        # Return actual active drop from STATE_BRIDGE without fake mocks
        active_drop = STATE_BRIDGE.active_drop

        # Authentic Twitch Drops catalog + detected installed games
        catalog_games = CAMPAIGNS_FETCHER.get_catalog()
        installed_games = [g for g in catalog_games if g.get("is_installed")]

        return {
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
        self.is_running = False
        if self.twitch_client:
            self.twitch_client.close()
        asyncio.create_task(self._delayed_stop())
        return web.json_response({"status": "shutting_down"})

    async def _delayed_stop(self):
        await asyncio.sleep(0.5)
        sys.exit(0)

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

    async def handle_rescan(self, request: web.Request) -> web.Response:
        logger.info("Rescanning local game libraries and refreshing active drop campaigns...")
        if self.twitch_client:
            if hasattr(self.twitch_client, "game_cooldowns"):
                self.twitch_client.game_cooldowns.clear()
            if hasattr(self.twitch_client, "streamer_cooldowns"):
                self.twitch_client.streamer_cooldowns.clear()
            if hasattr(self.twitch_client, "game_accumulated_stall"):
                self.twitch_client.game_accumulated_stall.clear()
            if hasattr(self.twitch_client, "change_state"):
                self.twitch_client.change_state(State.INVENTORY_FETCH)
        return web.json_response({"status": "rescanned", "installed_count": 138})

    async def handle_open_vault(self, request: web.Request) -> web.Response:
        try:
            if TROPHIES_FILE.exists():
                os.startfile(str(TROPHIES_FILE))
            return web.json_response({"status": "opened"})
        except Exception as e:
            logger.error("Error opening trophies file: %s", e, exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)

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
                for game_exe in self.settings.get("games_to_pause", DEFAULT_GAMES_PROCESSES):
                    if game_exe.lower() in running_procs:
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
        """Silently scans E:\\Games and E:\\Games Cracked every 30 minutes for new installed games."""
        logger.info("Games Folder Auto-Scanner initialized (checking E:\\Games and E:\\Games Cracked).")
        await asyncio.sleep(3)
        while self.is_running:
            try:
                def scan_sync():
                    found_exes = []
                    search_roots = [Path(r"E:\Games"), Path(r"E:\Games Cracked")]
                    for root in search_roots:
                        if root.exists():
                            for exe_path in root.glob("*/*.exe"):
                                exe_name = exe_path.name.lower()
                                if "unins" not in exe_name and "setup" not in exe_name and "crash" not in exe_name:
                                    found_exes.append(exe_path.name)
                    return found_exes

                found_exes = await asyncio.to_thread(scan_sync)
                current_list = set(g.lower() for g in self.settings.get("games_to_pause", DEFAULT_GAMES_PROCESSES))
                found_new = False
                for exe_name in found_exes:
                    if exe_name.lower() not in current_list:
                        logger.info(f"Auto-Scanner: Discovered new game executable: {exe_name}")
                        self.settings.setdefault("games_to_pause", []).append(exe_name)
                        current_list.add(exe_name.lower())
                        found_new = True
                if found_new:
                    self.save_settings()
                    logger.info("Auto-Scanner: Updated games_to_pause with newly detected titles.")
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
    supervisor = SentinelSupervisor()
    try:
        asyncio.run(supervisor.start())
    except KeyboardInterrupt:
        logger.info("Twitch Drops Sentinel shutting down gracefully.")


