"""Windows toasts for the events the user wants to hear about.

One gate for all of them: the "Windows notifications" switch is honoured, every campaign or event
notifies once (remembered across restarts, so a restart does not repeat old news), and kinds derived
from state ("a queue campaign is running", "a queue campaign waits for the account link") are primed
silently the first time, so switching this on does not flood the user with what is already true.
"""
import json
import logging
import threading
import time
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger("TwitchDrops")

DEFAULT_STORE = Path(__file__).resolve().parent.parent / "data" / "notified_toasts.json"
MAX_REMEMBERED = 2000
MAX_TOASTS_PER_BATCH = 3


def _default_sender(title: str, message: str) -> None:
    from constants import TEST_MODE
    if TEST_MODE:
        return
    from gui_headless import send_windows_toast
    send_windows_toast(title, message)


class ToastGate:
    def __init__(
        self,
        sender: Callable[[str, str], None],
        enabled: Callable[[], bool],
        store_path: Optional[Path],
    ) -> None:
        self._sender = sender
        self._enabled = enabled
        self._store_path = store_path
        self._lock = threading.Lock()
        self._seen: Dict[str, float] = {}
        self._primed: set = set()
        self._load()

    def _load(self) -> None:
        if self._store_path is None or not self._store_path.exists():
            return
        try:
            data = json.loads(self._store_path.read_text(encoding="utf-8"))
            self._seen = {str(k): float(v) for k, v in dict(data.get("seen", {})).items()}
            self._primed = set(data.get("primed", []))
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            logger.warning("Toast memory %s is unreadable, starting empty: %s", self._store_path, exc)

    def _save(self) -> None:
        if self._store_path is None:
            return
        if len(self._seen) > MAX_REMEMBERED:
            newest = sorted(self._seen.items(), key=lambda kv: kv[1], reverse=True)[:MAX_REMEMBERED]
            self._seen = dict(newest)
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            self._store_path.write_text(
                json.dumps({"seen": self._seen, "primed": sorted(self._primed)}, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Could not save toast memory %s: %s", self._store_path, exc, exc_info=True)

    def notify(self, kind: str, key: str, title: str, message: str) -> bool:
        """One toast per (kind, key). Remembered even while toasts are off, so switching them on later
        does not replay old events. Returns True when a toast was actually sent."""
        token = f"{kind}:{key}"
        with self._lock:
            if token in self._seen:
                return False
            self._seen[token] = time.time()
            self._save()
        if not self._enabled():
            return False
        self._sender(title, message)
        return True

    def notify_new(
        self,
        kind: str,
        items: Iterable[Tuple[str, str]],
        title: str,
        one: Callable[[str], str],
        many: Callable[[List[str]], str],
    ) -> int:
        """State-derived events. items = (key, label). The first call for a kind only remembers the
        current state; later calls toast what is new: up to MAX_TOASTS_PER_BATCH one by one, more than
        that as a single summary. Returns the number of toasts sent."""
        with self._lock:
            first = kind not in self._primed
            self._primed.add(kind)
            now = time.time()
            fresh: List[Tuple[str, str]] = []
            for key, label in items:
                token = f"{kind}:{key}"
                if token not in self._seen:
                    self._seen[token] = now
                    fresh.append((key, label))
            if first or fresh:
                self._save()
        if first or not fresh or not self._enabled():
            return 0
        labels = [label for _, label in fresh]
        if len(labels) <= MAX_TOASTS_PER_BATCH:
            for label in labels:
                self._sender(title, one(label))
            return len(labels)
        self._sender(title, many(labels))
        return 1


_state = {"enabled": True}


def set_enabled(flag: bool) -> None:
    _state["enabled"] = bool(flag)


NOTIFIER = ToastGate(_default_sender, lambda: _state["enabled"], DEFAULT_STORE)
