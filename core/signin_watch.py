"""Tells the user when a sign-in the app relies on is lost: Twitch, a giveaways store, Steam Community for Steam IDLE.

The service looks at what it knows every few minutes: source -> account name (signed in), None (known to be signed
out) or absent (unknown, for example a store never used). A source that had an account and now is None is a lost
sign-in, announced once through the notification gate (Windows toast, Telegram/Discord). The last state is kept on
disk, so a session that ran out while the app was closed is still reported at the next start.
"""
from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("TwitchDrops")

DEFAULT_STORE = Path(__file__).resolve().parent.parent / "data" / "signin_state.json"

LABELS = {
    "twitch": ("Twitch", "фарм дропов стоит"),
    "steam_idle": ("Steam Community", "Steam IDLE остановлен"),
    "epic": ("Epic Games", "раздачи Epic не забираются"),
    "fab": ("Fab", "раздачи Fab не забираются"),
    "gog": ("GOG", "раздачи GOG не забираются"),
    "itch": ("itch.io", "раздачи itch.io не забираются"),
    "prime": ("Prime Gaming", "раздачи Prime Gaming не забираются"),
    "steam": ("Steam", "раздачи Steam не забираются"),
    "unity": ("Unity Asset Store", "раздачи Unity не забираются"),
}


def lost_signins(previous: Dict[str, Optional[str]], current: Dict[str, Optional[str]]) -> List[Tuple[str, str]]:
    """(source, account) for every source that had an account and is now known to be signed out."""
    return sorted((src, acc) for src, acc in previous.items() if acc and src in current and current[src] is None)


def lost_text(source: str, account: str) -> str:
    label, consequence = LABELS.get(source, (source, "часть функций не работает"))
    return f"Слетел вход в {label} ({account}): {consequence}. Войдите снова."


class SignInWatch:
    def __init__(self, store_path: Optional[Path] = DEFAULT_STORE) -> None:
        self._store_path = store_path
        self._lock = threading.Lock()
        self._known: Dict[str, Optional[str]] = {}
        if store_path is not None and store_path.exists():
            try:
                data = json.loads(store_path.read_text(encoding="utf-8"))
                self._known = {str(k): (str(v) if v else None) for k, v in dict(data).items()}
            except (OSError, ValueError, TypeError) as exc:
                logger.warning("Sign-in state %s is unreadable, starting empty: %s", store_path, exc)

    def observe(self, current: Dict[str, Optional[str]]) -> List[Tuple[str, str]]:
        """Records what is known now (absent sources keep their last value) and returns the sign-ins lost since."""
        with self._lock:
            lost = lost_signins(self._known, current)
            merged = {**self._known, **current}
            if merged != self._known:
                self._known = merged
                self._save()
            return lost

    def _save(self) -> None:
        if self._store_path is None:
            return
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            self._store_path.write_text(json.dumps(self._known, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as exc:
            logger.warning("Could not save the sign-in state %s: %s", self._store_path, exc, exc_info=True)
