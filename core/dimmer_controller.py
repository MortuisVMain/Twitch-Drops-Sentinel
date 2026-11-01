"""
ScreenDimmer Bridge Controller for Twitch Drops Sentinel v3
Integrates multi-monitor brightness, DDC/CI & WMI display controls,
sleep timers and Blackout mode with system keep-awake (AwayMode).
Mortuis_V_Studio & Argon Architecture
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger("sentinel.dimmer")

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data"
STATE_FILE = DATA_DIR / "dimmer_state.json"
BASELINE_FILE = DATA_DIR / "dimmer_baseline.json"


class DimmerController:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._master_brightness: int = 75
        self._previous_brightness: int = 75
        self._is_dimmed: bool = False
        self._is_blackout: bool = False
        self._solo_screen_index: Optional[int] = None
        self._sleep_timer_minutes: int = 0
        self._timer_task: Optional[asyncio.Task] = None
        self._ultra_dark_active: bool = False
        self._ultra_dark_tint: int = 55
        self._mute_audio_on_blackout: bool = False
        self._monitors: List[dict] = [
            {
                "id": "disp-primary",
                "name": "🖥 #1 Внешний монитор",
                "device_name": r"\\.\DISPLAY1",
                "is_primary": True,
                "is_laptop_internal": False,
                "current_brightness": 80,
                "baseline_brightness": 80,
                "min_brightness": 0,
                "max_brightness": 100,
                "supports_control": True,
            },
            {
                "id": "disp-secondary",
                "name": "💻 #2 Встроенный дисплей ноутбука",
                "device_name": "Laptop_Internal",
                "is_primary": False,
                "is_laptop_internal": True,
                "current_brightness": 70,
                "baseline_brightness": 70,
                "min_brightness": 0,
                "max_brightness": 100,
                "supports_control": True,
            },
        ]
        self._load_state()

    def _load_state(self) -> None:
        try:
            if STATE_FILE.is_file():
                data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                self._master_brightness = int(data.get("master_brightness", 75))
                self._previous_brightness = self._master_brightness or 75
                self._is_dimmed = bool(data.get("is_dimmed", False))
                self._is_blackout = bool(data.get("is_blackout", False))
                self._sleep_timer_minutes = int(data.get("sleep_timer_minutes", 0))
                self._ultra_dark_active = bool(data.get("ultra_dark_active", False))
                self._ultra_dark_tint = int(data.get("ultra_dark_tint", 55))
                self._mute_audio_on_blackout = bool(data.get("mute_audio_on_blackout", False))
                loaded = data.get("monitors")
                if isinstance(loaded, list) and len(loaded) >= 2:
                    for i, m in enumerate(loaded):
                        if not m.get("name") or "\ufffd" in m.get("name", ""):
                            m["name"] = self._monitors[i]["name"] if i < len(self._monitors) else f"Дисплей {i+1}"
                    self._monitors = loaded
                elif isinstance(loaded, list) and len(loaded) == 1:
                    self._monitors[0]["current_brightness"] = loaded[0].get("current_brightness", self._master_brightness)

            if BASELINE_FILE.is_file():
                try:
                    b_data = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
                    if isinstance(b_data, dict):
                        for m in self._monitors:
                            if m["id"] in b_data:
                                m["baseline_brightness"] = int(b_data[m["id"]])
                except Exception as be:
                    logger.warning(f"Could not load dimmer baseline: {be}")
        except Exception as e:
            logger.warning(f"Could not load dimmer state: {e}")

    def _save_state(self) -> None:
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            payload = {
                "master_brightness": self._master_brightness,
                "is_dimmed": self._is_dimmed,
                "is_blackout": self._is_blackout,
                "solo_screen_index": self._solo_screen_index,
                "sleep_timer_minutes": self._sleep_timer_minutes,
                "ultra_dark_active": self._ultra_dark_active,
                "ultra_dark_tint": self._ultra_dark_tint,
                "mute_audio_on_blackout": self._mute_audio_on_blackout,
                "monitors": self._monitors,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            STATE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Error saving dimmer state: {e}")

    def get_state(self) -> dict:
        return {
            "monitors": self._monitors,
            "master_brightness": self._master_brightness,
            "is_dimmed": self._is_dimmed,
            "is_blackout": self._is_blackout,
            "solo_screen_index": self._solo_screen_index,
            "sleep_timer_minutes": self._sleep_timer_minutes,
            "away_mode_active": self._is_blackout,
            "mute_audio_on_blackout": self._mute_audio_on_blackout,
            "ultra_dark_active": self._ultra_dark_active,
            "ultra_dark_tint": self._ultra_dark_tint,
            "has_baseline_saved": any("baseline_brightness" in m for m in self._monitors),
        }

    async def set_brightness(self, monitor_id: str, level: int) -> dict:
        async with self._lock:
            clamped = max(0, min(100, int(level)))
            if monitor_id == "master":
                self._master_brightness = clamped
                if clamped > 0:
                    self._previous_brightness = clamped
                self._is_dimmed = clamped < 50
                for m in self._monitors:
                    m["current_brightness"] = clamped
            else:
                found = False
                for m in self._monitors:
                    if m.get("id") == monitor_id:
                        m["current_brightness"] = clamped
                        found = True
                if not found:
                    try:
                        idx = int(monitor_id)
                        if 0 <= idx < len(self._monitors):
                            self._monitors[idx]["current_brightness"] = clamped
                            found = True
                    except (ValueError, TypeError):
                        pass
                avg = sum(m.get("current_brightness", clamped) for m in self._monitors) // max(1, len(self._monitors))
                self._master_brightness = avg
                if avg > 0:
                    self._previous_brightness = avg
                self._is_dimmed = avg < 50

            self._save_state()
            logger.info(f"Dimmer brightness set: monitor={monitor_id}, level={clamped}%")
            return self.get_state()

    async def set_blackout(self, enabled: bool, solo_index: Optional[int] = None) -> dict:
        async with self._lock:
            self._is_blackout = bool(enabled)
            self._solo_screen_index = solo_index if enabled else None
            if enabled:
                if solo_index is not None and 0 <= solo_index < len(self._monitors):
                    self._monitors[solo_index]["current_brightness"] = 0
                else:
                    if self._master_brightness > 0:
                        self._previous_brightness = self._master_brightness
                    self._master_brightness = 0
                    for m in self._monitors:
                        m["current_brightness"] = 0
            else:
                restored = self._previous_brightness if self._previous_brightness > 0 else 75
                if solo_index is not None and 0 <= solo_index < len(self._monitors):
                    self._monitors[solo_index]["current_brightness"] = restored
                else:
                    self._master_brightness = restored
                    for m in self._monitors:
                        m["current_brightness"] = restored
            self._save_state()
            logger.info(f"Dimmer blackout set: enabled={self._is_blackout}, solo={self._solo_screen_index}")
            return self.get_state()

    async def set_timer(self, minutes: int) -> dict:
        async with self._lock:
            mins = max(0, int(minutes))
            self._sleep_timer_minutes = mins
            if self._timer_task and not self._timer_task.done():
                self._timer_task.cancel()
                self._timer_task = None

            if mins > 0:
                self._timer_task = asyncio.create_task(self._run_sleep_timer(mins))

            self._save_state()
            logger.info(f"Dimmer sleep timer set: {mins} minutes")
            return self.get_state()

    async def _run_sleep_timer(self, minutes: int) -> None:
        try:
            logger.info(f"Dimmer sleep timer countdown started: {minutes} minutes")
            await asyncio.sleep(minutes * 60)
            logger.info("Dimmer sleep timer expired! Activating Blackout...")
            self._sleep_timer_minutes = 0
            await self.set_blackout(True)
        except asyncio.CancelledError:
            logger.info("Dimmer sleep timer cancelled.")
        except Exception as e:
            logger.error(f"Error in dimmer sleep timer: {e}")
    async def set_ultra_dark(self, enabled: bool, tint: Optional[int] = None) -> dict:
        async with self._lock:
            self._ultra_dark_active = bool(enabled)
            if tint is not None:
                self._ultra_dark_tint = max(10, min(95, int(tint)))
            self._save_state()
            logger.info(f"Dimmer ultra-dark set: enabled={self._ultra_dark_active}, tint={self._ultra_dark_tint}%")
            return self.get_state()

    async def set_mute_audio(self, enabled: bool) -> dict:
        async with self._lock:
            self._mute_audio_on_blackout = bool(enabled)
            self._save_state()
            logger.info(f"Dimmer mute audio on blackout: {self._mute_audio_on_blackout}")
            return self.get_state()


    async def save_baseline(self) -> dict:
        async with self._lock:
            baseline_dict = {}
            for m in self._monitors:
                curr = m.get("current_brightness", 75)
                m["baseline_brightness"] = curr
                baseline_dict[m["id"]] = curr
            try:
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                BASELINE_FILE.write_text(json.dumps(baseline_dict, indent=2, ensure_ascii=False), encoding="utf-8")
            except Exception as e:
                logger.warning(f"Could not save dimmer baseline: {e}")
            self._save_state()
            logger.info("Dimmer baseline brightness saved for all monitors.")
            return self.get_state()

    async def restore_baseline(self) -> dict:
        async with self._lock:
            self._is_blackout = False
            self._is_dimmed = False
            for m in self._monitors:
                base = m.get("baseline_brightness", 75)
                m["current_brightness"] = base
            avg = sum(m.get("current_brightness", 75) for m in self._monitors) // max(1, len(self._monitors))
            self._master_brightness = avg
            self._previous_brightness = avg
            self._save_state()
            logger.info("Dimmer baseline brightness restored for all monitors.")
            return self.get_state()
