from __future__ import annotations

import asyncio
import logging
import os
import re
import subprocess
import sys
import unicodedata
import uuid
from time import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from translate import _

logger = logging.getLogger("TwitchDrops.HeadlessGUI")

# Journal kept for the console, "copy logs" and the diagnostic report. Counter runs are folded on write (one hourly sync
# alone writes ~104 "(n/104)" lines). Lines are kept by age: the console must show at least the last 5 hours of farming,
# so they live 6 h (a margin, so a line is never dropped at 4 h 59 min).
LOG_RETENTION_SECONDS = 6 * 3600
# Safety net only, for a runaway logger inside the window: 5000 lines is a few MB of dicts and ~830 lines/hour sustained over the full 6 h.
LOG_HARD_CAP = 5000
# /api/state is polled every 3 s, so it carries only this tail; the whole journal comes from /api/logs?after=<seq>.
STATE_LOG_TAIL = 50
_COUNTER_RE = re.compile(r"^(.*?)\s*\(\d+\s*/\s*\d+\)\s*$")

# Shared state singleton accessible by HTTP / WebSocket API
class SentinelStateBridge:
    def __init__(self):
        self.connected: bool = True
        self.user_id: str = ""
        self.username: str = ""
        self.active_drop: Optional[dict] = None
        self.status_text: str = "Инициализация Sentinel..."
        self.tray_icon: str = "idle"
        self.watching_channel: Optional[str] = None
        self.available_channels: list[dict] = []
        self.games_with_drops: list[str] = []
        self.start_time: float = datetime.now().timestamp()
        self.farm_minutes: int = 0
        self.channel_points_earned: int = 0
        self.drops_claimed_session: int = 0
        self.is_paused: bool = False
        self.paused_reason: Optional[str] = None
        self.watchdog_status: Optional[str] = None
        self.forced_game: Optional[str] = None
        self.oauth_code: Optional[str] = None
        self.oauth_uri: Optional[str] = None
        self.recent_logs: list[dict] = []
        # Entries are numbered (seq) so a client asks only for what is newer; a new service run is a new session, because
        # its numbers start again and a client holding the old ones must start over.
        self.log_seq: int = 0
        self.log_session: str = uuid.uuid4().hex[:12]
        self.lock = asyncio.Lock()

    def add_log(self, level: str, msg: str):
        now = time()
        now_str = datetime.now().strftime("%H:%M:%S")
        clean_msg = re.sub(r'oauth:[a-zA-Z0-9]+', 'oauth:[REDACTED]', msg, flags=re.IGNORECASE)
        clean_msg = re.sub(r"""(auth_token|client_secret|token|password)=['"]?[a-zA-Z0-9_\-]+['"]?""", r"\1=[REDACTED]", clean_msg, flags=re.IGNORECASE)
        entry = {
            "time": now_str,
            "level": level.upper(),
            "message": clean_msg,
            "ts": now,
        }
        last = self.recent_logs[-1] if self.recent_logs else None
        if last:
            if last["message"] == clean_msg:
                return
            # "... (7/104)" then "... (8/104)": only the newest of a counter run is kept; `replaces` tells a client that
            # already holds the older line to swap it
            new_run, old_run = _COUNTER_RE.match(clean_msg), _COUNTER_RE.match(last["message"])
            if new_run and old_run and new_run.group(1) == old_run.group(1) and last["level"] == entry["level"]:
                self.log_seq += 1
                entry["seq"], entry["replaces"] = self.log_seq, last.get("seq")
                self.recent_logs[-1] = entry
                return
        self.log_seq += 1
        entry["seq"] = self.log_seq
        self.recent_logs.append(entry)
        cutoff = now - LOG_RETENTION_SECONDS
        stale = 0
        while stale < len(self.recent_logs) and self.recent_logs[stale].get("ts", now) < cutoff:
            stale += 1
        drop = max(stale, len(self.recent_logs) - LOG_HARD_CAP)
        if drop:
            del self.recent_logs[:drop]

    def state_log_fields(self) -> dict:
        """What /api/state carries: a short tail plus the cursor that tells the console whether it is behind."""
        return {
            "recent_logs": self.recent_logs[-STATE_LOG_TAIL:],
            "log_seq": self.log_seq,
            "log_session": self.log_session,
        }

    def logs_after(self, after: int, session: Optional[str]) -> dict:
        """Entries newer than `after`. `reset` means the client's copy is void (another run of the service, or a cursor
        from the future) and `entries` is the whole journal."""
        reset = (session is not None and session != self.log_session) or after > self.log_seq
        if reset:
            after = 0
        return {
            "session": self.log_session,
            "last_seq": self.log_seq,
            "reset": reset,
            "entries": [e for e in self.recent_logs if e.get("seq", 0) > after],
        }

STATE_BRIDGE = SentinelStateBridge()


TOAST_SCRIPT = (
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; "
    "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); "
    "$n = $t.GetElementsByTagName('text'); "
    "$n.Item(0).InnerText = $env:SENTINEL_TOAST_TITLE; "
    "$n.Item(1).InnerText = $env:SENTINEL_TOAST_MESSAGE; "
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($t); "
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Twitch Drops Sentinel').Show($toast);"
)


TOAST_TEXT_LIMIT = 256


def _toast_text(value) -> str:
    """Campaign text for a toast: control characters out (a line break and a tab stay), cut to TOAST_TEXT_LIMIT characters."""
    text = "".join(ch for ch in str(value) if ch in "\n\t" or unicodedata.category(ch) != "Cc")
    return text[:TOAST_TEXT_LIMIT]


def send_windows_toast(title: str, message: str):
    """Sends a native Windows 10/11 toast via PowerShell WinRT.

    The script is a constant: title and message come from campaign authors, so they travel in the child's
    environment and are read with $env:, never spliced into code (PowerShell also treats U+2018..U+201B as quotes).
    """
    import base64
    encoded_ps = base64.b64encode(TOAST_SCRIPT.encode("utf-16le")).decode("ascii")
    env = dict(os.environ)
    env["SENTINEL_TOAST_TITLE"] = _toast_text(title)
    env["SENTINEL_TOAST_MESSAGE"] = _toast_text(message)
    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded_ps],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
        )
    except Exception:
        logger.warning("Could not start the toast notification: %s", title, exc_info=True)


send_toast_msg = send_windows_toast


class HeadlessStatus:
    def update(self, text: str):
        # Translate technical / English / archaic status strings into clear Russian
        friendly_text = text
        lower_t = text.lower()
        if "idle" in lower_t or "вхолостую" in lower_t:
            friendly_text = "Режим ожидания: поиск стримов для приоритетных игр"
        elif "fetching inventory" in lower_t or "получение инвентаря" in lower_t:
            friendly_text = "Синхронизация инвентаря наград Twitch..."
        elif "fetching campaigns" in lower_t or "получение кампаний" in lower_t:
            friendly_text = "Загрузка доступных Twitch Drops кампаний..."
        elif "cleaning up" in lower_t or "очистка" in lower_t:
            friendly_text = "Анализ стримов: фильтрация каналов с дропами..."
        elif "gathering" in lower_t or "сбор" in lower_t:
            friendly_text = "Поиск активных онлайн-стримеров..."
        elif "switching" in lower_t or "переключение" in lower_t:
            friendly_text = "Переключение на лучший активный стрим..."

        STATE_BRIDGE.status_text = friendly_text
        logger.info(f"[STATUS] {friendly_text}")


class HeadlessTray:
    def change_icon(self, icon_name: str):
        STATE_BRIDGE.tray_icon = icon_name
        logger.info(f"[TRAY] Icon: {icon_name}")

    def notify(self, text: str, title: str = "Twitch Drops Sentinel"):
        send_windows_toast(title, text)

    def stop(self):
        pass


class HeadlessProgress:
    ALMOST_DONE_SECONDS = 15

    def __init__(self):
        self._seconds: int = 60
        self._timer_task: Optional[asyncio.Task] = None
        self._drop: Any = None

    async def _timer_loop(self):
        while self._seconds > 0:
            await asyncio.sleep(1)
            self._seconds -= 1
            if STATE_BRIDGE.active_drop:
                rem = STATE_BRIDGE.active_drop.get("remaining_seconds", 0)
                if rem > 0:
                    STATE_BRIDGE.active_drop["remaining_seconds"] = rem - 1
        self._timer_task = None

    def start_timer(self):
        if self._timer_task is None:
            self._seconds = 60
            try:
                loop = asyncio.get_running_loop()
                self._timer_task = loop.create_task(self._timer_loop())
            except RuntimeError:
                pass

    def stop_timer(self):
        if self._timer_task is not None:
            self._timer_task.cancel()
            self._timer_task = None

    def minute_almost_done(self) -> bool:
        return self._timer_task is None or self._seconds <= self.ALMOST_DONE_SECONDS

    def display(self, drop: Any = None, *, countdown: bool = True, subone: bool = False):
        self._drop = drop
        self.stop_timer()
        if drop is None:
            self._seconds = 0
            return
        if countdown:
            self.start_timer()
        elif subone:
            self._seconds = 0
        else:
            self._seconds = 60

    def update(self, current: int, total: int):
        self._seconds = 60
        if STATE_BRIDGE.active_drop:
            STATE_BRIDGE.active_drop["current_minutes"] = current
            STATE_BRIDGE.active_drop["required_minutes"] = total
            if total > 0:
                pct = round((current / total) * 100)
                STATE_BRIDGE.active_drop["progress_percent"] = pct
                STATE_BRIDGE.active_drop["remaining_seconds"] = max(0, (total - current) * 60)
                STATE_BRIDGE.add_log("PROGRESS", f"Прогресс: {current}/{total} мин ({pct}%)")

    def set(self, val: float):
        pass


class HeadlessChannels:
    def __init__(self):
        self.channels = []
        self.watching = None

    def clear(self):
        self.channels.clear()
        STATE_BRIDGE.available_channels.clear()

    def set_watching(self, channel):
        self.watching = channel
        name = getattr(channel, "name", str(channel))
        STATE_BRIDGE.watching_channel = name
        if STATE_BRIDGE.active_drop:
            STATE_BRIDGE.active_drop["channel_name"] = name
        STATE_BRIDGE.status_text = f"Просмотр стримера: {name}"
        STATE_BRIDGE.add_log("WATCH", f"Подключен к трансляции стримера: {name}")
        logger.info(f"[WATCHING] Streamer: {name}")

    def clear_watching(self):
        self.watching = None
        STATE_BRIDGE.watching_channel = None

    def get_selection(self):
        return None

    def _sync_bridge_channels(self):
        result = []
        for ch in self.channels:
            if getattr(ch, "online", False):
                game_name = ch.game.name if getattr(ch, "game", None) else ""
                result.append({
                    "id": str(ch.id),
                    "name": getattr(ch, "name", str(ch)),
                    "game": game_name,
                    "viewers": getattr(ch, "viewers", 0) or 0,
                    "drops_enabled": getattr(ch, "drops_enabled", False),
                    "online": True,
                    "acl_based": getattr(ch, "acl_based", False),
                })
        STATE_BRIDGE.available_channels = result

    def add_channel(self, channel):
        if channel not in self.channels:
            self.channels.append(channel)
        self._sync_bridge_channels()

    def remove_channel(self, channel):
        if channel in self.channels:
            self.channels.remove(channel)
        self._sync_bridge_channels()

    def display(self, channel, add: bool = True):
        if add:
            self.add_channel(channel)
        else:
            self.remove_channel(channel)

    def remove(self, channel):
        self.remove_channel(channel)

    def set_status(self, channel, status):
        self._sync_bridge_channels()


class HeadlessInventory:
    def __init__(self):
        self.campaigns = []
        self.drops = []

    def clear(self):
        self.campaigns.clear()
        self.drops.clear()

    def update_drop(self, drop):
        # Fires for every drop of a campaign when minutes change: only the drop on screen may refresh the counter
        current = STATE_BRIDGE.active_drop
        if current and current["id"] == drop.id:
            self.add_drop(drop)

    def add_drop(self, drop):
        name = getattr(drop, "name", "Награда Twitch")
        game = getattr(drop.campaign.game, "name", "Игра") if hasattr(drop, "campaign") else "Игра"
        current = getattr(drop, "current_minutes", 0)
        required = getattr(drop, "required_minutes", 60)
        pct = round((current / required) * 100) if required > 0 else 0
        rem_sec = max(0, (required - current) * 60)
        is_claimed = getattr(drop, "is_claimed", False)
        can_claim = getattr(drop, "can_claim", False)

        STATE_BRIDGE.active_drop = {
            "id": getattr(drop, "id", f"drop-{name}"),
            "name": name,
            "game": game,
            "current_minutes": current,
            "required_minutes": required,
            "progress_percent": pct,
            "remaining_seconds": rem_sec,
            "channel_name": STATE_BRIDGE.watching_channel or "Smartbox Streamless",
            "channel_id": "twitch-streamless",
            "is_claimed": is_claimed,
            "can_claim": can_claim,
        }

    async def add_campaign(self, campaign):
        self.campaigns.append(campaign)
        game_name = getattr(campaign.game, "name", str(campaign.game))
        if game_name and game_name not in STATE_BRIDGE.games_with_drops:
            STATE_BRIDGE.games_with_drops.append(game_name)


class HeadlessLoginForm:
    def update(self, text: str, user_id: Any = None, username: Any = None):
        logger.info(f"[LOGIN] {text} (User ID: {user_id}, Username: {username})")
        if user_id:
            STATE_BRIDGE.user_id = str(user_id)
            STATE_BRIDGE.oauth_code = None
            STATE_BRIDGE.oauth_uri = None
        if username:
            STATE_BRIDGE.username = str(username)
            STATE_BRIDGE.oauth_code = None
            STATE_BRIDGE.oauth_uri = None

    def clear(self, **kwargs):
        STATE_BRIDGE.oauth_code = None
        STATE_BRIDGE.oauth_uri = None

    async def ask_enter_code(self, uri, code):
        logger.info(f"[LOGIN] OAuth Device Code needed: {code} at {uri}")
        STATE_BRIDGE.oauth_code = str(code)
        STATE_BRIDGE.oauth_uri = str(uri)
        STATE_BRIDGE.status_text = _("sentinel", "login_required_status").format(code=code)
        STATE_BRIDGE.add_log("AUTH", _("sentinel", "login_code_log").format(code=code, uri=uri))
        send_windows_toast("Twitch Drops Sentinel — Авторизация", f"Код авторизации: {code}\nОткройте Twitch в браузере для подтверждения")
        try:
            import webbrowser
            webbrowser.open(str(uri))
        except Exception as e:
            logger.debug(f"Failed to auto-open browser: {e}")

    def config(self, **kwargs):
        pass


class HeadlessWebsockets:
    def update(self, idx: int, status: Any, **kwargs):
        pass

    def remove(self, idx: int):
        pass

    def clear(self):
        pass


class HeadlessTrophies:
    def load_trophies(self):
        pass


class HeadlessMockWidget:
    def config(self, **kwargs):
        pass

    def after(self, ms, func, *args):
        if asyncio.get_event_loop().is_running():
            asyncio.get_event_loop().call_later(ms / 1000.0, func, *args)


class HeadlessGUIManager:
    """
    Headless GUI Manager for Twitch Drops Sentinel.
    Implements the exact interface required by TwitchDrops core without opening Tkinter.
    Provides live telemetry to the React UI.
    """
    def __init__(self, twitch: Any):
        self._twitch = twitch
        self._close_requested = asyncio.Event()
        self.status = HeadlessStatus()
        self.tray = HeadlessTray()
        self.progress = HeadlessProgress()
        self.channels = HeadlessChannels()
        self.inv = HeadlessInventory()
        self.websockets = HeadlessWebsockets()
        self.login = HeadlessLoginForm()
        self.trophies = HeadlessTrophies()
        self.help = HeadlessMockWidget()
        self.help._invalidate_button = HeadlessMockWidget()
        self._root = HeadlessMockWidget()

    @property
    def close_requested(self) -> bool:
        return self._close_requested.is_set()

    def prevent_close(self):
        self._close_requested.clear()

    def print(self, message: str):
        clean_msg = message.strip()
        if clean_msg:
            logger.info(f"[CORE] {clean_msg}")

    def save(self, force: bool = False):
        pass

    def start(self):
        logger.info("[HEADLESS GUI] Started headless supervisor bridge.")

    def stop(self):
        logger.info("[HEADLESS GUI] Stopped headless supervisor bridge.")

    def close(self, *args) -> int:
        self._close_requested.set()
        if hasattr(self._twitch, "close"):
            self._twitch.close()
        return 0

    def close_window(self):
        self._close_requested.set()

    async def wait_until_closed(self):
        await self._close_requested.wait()

    async def coro_unless_closed(self, coro):
        task = asyncio.ensure_future(coro)
        close_task = asyncio.ensure_future(self._close_requested.wait())
        try:
            done, pending = await asyncio.wait([task, close_task], return_when=asyncio.FIRST_COMPLETED)
        except BaseException:
            # The caller was cancelled: asyncio.wait leaves its children running, so stop both before passing it on
            task.cancel()
            close_task.cancel()
            raise
        for t in pending:
            t.cancel()
        if self._close_requested.is_set():
            from exceptions import ExitRequest
            raise ExitRequest()
        return await next(iter(done))

    def set_games(self, games):
        game_names = [getattr(g, "name", str(g)) for g in games]
        STATE_BRIDGE.games_with_drops = game_names
        logger.info("[GAMES] " + _("sentinel", "games_active").format(count=len(game_names), names=", ".join(game_names[:5])))

    def clear_drop(self):
        STATE_BRIDGE.active_drop = None
        self.progress.stop_timer()

    def display_drop(self, drop, countdown=True, subone=False):
        # Twitch's session can still name a claimed drop of another campaign: it must not replace the one being farmed
        current = STATE_BRIDGE.active_drop
        if drop.is_claimed and not (current and current["id"] == drop.id):
            return
        self.inv.add_drop(drop)
        self.progress.display(drop, countdown=countdown, subone=subone)

    def grab_attention(self, sound=False):
        if sound:
            send_windows_toast("Twitch Drops Sentinel 🔔", "Требуется внимание пользователя.")
