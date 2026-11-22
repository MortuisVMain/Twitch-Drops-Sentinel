"""What the Steam IDLE module is doing, kept for the user: a bounded in-memory log fed from the `steam_idle` loggers.

Every entry text is masked before it is stored (Steam IDs, absolute paths, cookies and tokens), so the log can be
copied into a bug report as it is. Nothing here touches the disk.
"""
import logging
import re
import threading
from collections import deque
from datetime import datetime, timezone

MAX_ENTRIES = 500
LOGGER_NAME = "steam_idle"

_COOKIE_HEADER = re.compile(r"(?i)\b(?:set-cookie|cookie|authorization)\s*:.*")
_SECRET_PAIR = re.compile(
    r"(?i)[\"']?[\w-]*(?:token|secret|passw(?:or)?d|api[_-]?key|sessionid|steamloginsecure)[\w-]*[\"']?\s*[=:]\s*"
    r"(?:\"[^\"]*\"|'[^']*'|[^;\s\"']+)")
_BEARER = re.compile(r"(?i)\bBearer\s+[\w.~+/=-]+")
_JWT = re.compile(r"\beyJ[\w-]+\.[\w-]+\.[\w-]+")
_STEAM_ID = re.compile(r"\b7656\d{13}\b")
# C:\Users\<name> is consumed up to the next separator, so a name with spaces cannot leak
_PATH = re.compile(r"(?<!\w)(?:[A-Za-z]:[\\/](?i:users)[\\/](?:[^\\/\"'\r\n]+?(?=[\\/])|[^\s\"']+)(?:[\\/][^\s\"']*)?"
                   r"|(?:[A-Za-z]:[\\/]|\\\\)[^\s\"']*)")


def sanitize(text: str) -> str:
    """The text with cookies and tokens, SteamID64s and absolute Windows paths replaced by placeholders."""
    text = _COOKIE_HEADER.sub("<redacted>", text)
    text = _SECRET_PAIR.sub("<redacted>", text)
    text = _BEARER.sub("<redacted>", text)
    text = _JWT.sub("<redacted>", text)
    text = _STEAM_ID.sub("<steamid>", text)
    return _PATH.sub("<path>", text)


class ActivityLog:
    """Thread-safe ring buffer; `seq` grows for the whole process and survives clear()."""

    def __init__(self, maxlen: int = MAX_ENTRIES):
        self._lock = threading.Lock()
        self._entries: deque[dict] = deque(maxlen=maxlen)
        self._seq = 0

    def add(self, level: str, text: str) -> None:
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        text = sanitize(text)
        with self._lock:
            self._seq += 1
            self._entries.append({"seq": self._seq, "ts": stamp, "level": level, "text": text})

    def since(self, after: int | None) -> list[dict]:
        with self._lock:
            return [dict(entry) for entry in self._entries if after is None or entry["seq"] > after]

    @property
    def last_seq(self) -> int:
        with self._lock:
            return self._seq

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


LOG = ActivityLog()


class ActivityHandler(logging.Handler):
    """Copies INFO and above from the logging tree into an ActivityLog; a traceback is reduced to type and message."""

    def __init__(self, log: ActivityLog):
        super().__init__(logging.INFO)
        self._log = log

    def emit(self, record: logging.LogRecord) -> None:
        try:
            text = record.getMessage()
            if record.exc_info and record.exc_info[1] is not None:
                error = record.exc_info[1]
                text += f" ({type(error).__name__}: {error})"
            level = "error" if record.levelno >= logging.ERROR else "warning" if record.levelno >= logging.WARNING else "info"
            self._log.add(level, text)
        except Exception:
            self.handleError(record)


def attach() -> ActivityHandler:
    """Hook the shared log to the `steam_idle` logger once; later calls return the handler already there."""
    parent = logging.getLogger(LOGGER_NAME)
    for handler in parent.handlers:
        if isinstance(handler, ActivityHandler):
            return handler
    handler = ActivityHandler(LOG)
    parent.addHandler(handler)
    if parent.getEffectiveLevel() > logging.INFO:  # INFO lines would otherwise never reach the handler
        parent.setLevel(logging.INFO)
    return handler
