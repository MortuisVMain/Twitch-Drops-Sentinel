"""Windows and diagnostics helpers of the local service: sleep guard, autostart, the sanitized diagnostic report and the
log handlers. Split out of sentinel_service.py without behavior change; sentinel_service re-exports every name."""

from __future__ import annotations

import ctypes
import logging
import logging.handlers
import platform
import re
import sys
from datetime import datetime
from pathlib import Path

import psutil

from campaigns_fetcher import CAMPAIGNS_FETCHER
from gui_headless import STATE_BRIDGE
from version import __version__ as APP_VERSION

PROJECT_DIR = Path(__file__).resolve().parent.parent
logger = logging.getLogger("SentinelService")


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
            logger.debug("SetThreadExecutionState failed: %s", e)

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
                except FileNotFoundError as e:
                    logger.debug("Autostart registry key not present on delete: %s", e)
        return True
    except Exception:
        return False

_PROGRESS_COUNTER_RE = re.compile(r'^(.*?)\s*\((\d+)\s*/\s*(\d+)\)\s*$')


def report_log_tail(logs: list, limit: int = 120) -> list:
    """Journal entries for the report: level prefix shown once, counter runs folded, then the last `limit`."""
    entries = []
    for item in logs:
        level = str(item.get('level') or 'INFO')
        text = str(item.get('message', ''))
        stripped = re.sub(r'^\s*(\[' + re.escape(level) + r'\]\s*)+', '', text, flags=re.IGNORECASE)
        entries.append({'time': item.get('time', ''), 'level': level, 'message': stripped or text})
    folded = []
    for entry in entries:
        match = _PROGRESS_COUNTER_RE.match(entry['message'])
        if folded and match:
            prev = _PROGRESS_COUNTER_RE.match(folded[-1]['message'])
            if prev and prev.group(1) == match.group(1) and folded[-1]['level'] == entry['level']:
                folded[-1] = entry
                continue
        folded.append(entry)
    return folded[-limit:]


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
    for log_item in report_log_tail(STATE_BRIDGE.recent_logs):
        msg = f"[{log_item.get('time', '')}] [{log_item.get('level', 'INFO')}] {log_item.get('message', '')}"
        sanitized_msg = re.sub(r'oauth:[a-zA-Z0-9]+', 'oauth:[REDACTED]', msg, flags=re.IGNORECASE)
        sanitized_msg = re.sub(r'(auth_token|client_secret|token|password)=["\']?[a-zA-Z0-9_\-]+["\']?', r'\1=[REDACTED]', sanitized_msg, flags=re.IGNORECASE)
        sanitized_msg = re.sub(r'cookies\.jar', 'cookies.jar [PRESENT]', sanitized_msg)
        log_lines.append(sanitized_msg)

    report_lines = [
        "==================================================",
        f"TWITCH DROPS SENTINEL v{APP_VERSION} — DIAGNOSTIC REPORT",
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
        f"Active Drop Name: {active_drop.get('name', 'None')}",
        f"Progress: {active_drop.get('current_minutes', 0)} / {active_drop.get('required_minutes', 0)} min ({active_drop.get('progress_percent', 0)}%)" if active_drop else "Progress: no active drop",
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


# One file grows without limit (70 MB seen: Notepad cannot open it). The current file plus 5 backups
# (sentinel_service.log.1 ... .5), 10 MB each, 60 MB at most, is plenty for support. Only this process writes them.
LOG_FILE_MAX_BYTES = 10 * 1024 * 1024
LOG_FILE_BACKUPS = 5


def make_file_log_handler(path, max_bytes: int = LOG_FILE_MAX_BYTES, backups: int = LOG_FILE_BACKUPS) -> logging.Handler:
    return logging.handlers.RotatingFileHandler(path, maxBytes=max_bytes, backupCount=backups, encoding="utf-8")


class LiveLogCaptureHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = record.getMessage()
            if msg and not msg.startswith("GET /api/state"):
                lvl = record.levelname
                if "[WATCH]" in msg or "[WATCHING]" in msg or "Watching:" in msg or "Просмотр канала:" in msg or "Подключен к трансляции" in msg:
                    lvl = "WATCH"
                elif "[CLAIM]" in msg or "Claimed drop" in msg or "Drop получено" in msg or "Забран трофей" in msg:
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
