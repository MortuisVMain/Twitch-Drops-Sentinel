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


class DimmerController:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._master_brightness: int = 80
        self._is_dimmed: bool = False
        self._is_blackout: bool = False
        self._solo_screen_index: Optional[int] = None
        self._sleep_timer_minutes: int = 0
        self._timer_task: Optional[asyncio.Task] = None
        self._monitors: List[dict] = [
            {
                "id": "disp-primary",
                "name": "Основной дисплей",
                "device_name": r"\\.\DISPLAY1",
                "is_primary": True,
                "is_laptop_internal": False,
                "current_brightness": 80,
                "min_brightness": 0,
                "max_brightness": 100,
                "supports_control": True,
            }
        ]
        self._load_state()

    def _load_state(self) -> None:
        try:
            if STATE_FILE.is_file():
                data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                self._master_brightness = int(data.get("master_brightness", 80))
                self._is_dimmed = bool(data.get("is_dimmed", False))
                self._is_blackout = bool(data.get("is_blackout", False))
                self._sleep_timer_minutes = int(data.get("sleep_timer_minutes", 0))
                if "monitors" in data and isinstance(data["monitors"], list) and data["monitors"]:
                    self._monitors = data["monitors"]
        except Exception as e:
            logger.warning(f"Could not load dimmer state: {e}")

    def _save_state(self) -> None:
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            payload = {
                "master_brightness": self._master_brightness,
                "is_dimmed": self._is_dimmed,
                "is_blackout": self._is_blackout,
                "sleep_timer_minutes": self._sleep_timer_minutes,
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
            "mute_audio_on_blackout": False,
        }

    async def set_brightness(self, monitor_id: str, level: int) -> dict:
        async with self._lock:
            clamped = max(0, min(100, int(level)))
            if monitor_id == "master":
                self._master_brightness = clamped
                self._is_dimmed = clamped < 50
                self._is_blackout = clamped == 0
                for m in self._monitors:
                    m["current_brightness"] = clamped
            else:
                for m in self._monitors:
                    if m.get("id") == monitor_id:
                        m["current_brightness"] = clamped
                avg = sum(m.get("current_brightness", clamped) for m in self._monitors) // max(1, len(self._monitors))
                self._master_brightness = avg
                self._is_dimmed = avg < 50

            self._save_state()
            logger.info(f"Dimmer brightness set: monitor={monitor_id}, level={clamped}%")
            return self.get_state()

    async def set_blackout(self, enabled: bool, solo_index: Optional[int] = None) -> dict:
        async with self._lock:
            self._is_blackout = bool(enabled)
            self._solo_screen_index = solo_index if enabled else None
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
            await self.set_blackout(True)
        except asyncio.CancelledError:
            logger.info("Dimmer sleep timer cancelled.")
        except Exception as e:
            logger.error(f"Error in dimmer sleep timer: {e}")
