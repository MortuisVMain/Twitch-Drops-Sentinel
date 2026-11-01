"""Keeps game covers alive.

Twitch and Steam covers disappear (new Steam games have no direct library_600x900.jpg, old IGDB art goes 404) and
installed Epic/GOG/disk games have none at all. The keeper remembers which cover URLs work, finds a replacement
(Steam header/capsule, appdetails, or a verified Steam search by name) and answers pick() from memory, so building
the UI state never waits for the network.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from pathlib import Path
from typing import Awaitable, Callable, Iterable, Optional

logger = logging.getLogger("TwitchDropsSentinel.CoverKeeper")

DEFAULT_STORE = Path(__file__).resolve().parent.parent / "data" / "box_art_verified.json"
STEAM_APP_RE = re.compile(r"/steam/apps/(\d+)/")
CDNS = (
    "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{app}/{file}",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app}/{file}",
)
STEAM_FILES = ("header.jpg", "capsule_616x353.jpg")


def steam_fallback_urls(url: str) -> list:
    """Other pictures of the same Steam app: header and capsule on both CDNs (library_600x900 is missing for new games)."""
    match = STEAM_APP_RE.search(url or "")
    if not match:
        return []
    app = match.group(1)
    return [cdn.format(app=app, file=name) for name in STEAM_FILES for cdn in CDNS]


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9а-я]+", " ", (name or "").lower()).strip()


HeadCheck = Callable[[str], Awaitable[bool]]
NameSearch = Callable[[str], Awaitable[list]]


class CoverKeeper:
    def __init__(self, store_path: Optional[Path] = DEFAULT_STORE) -> None:
        self._store_path = store_path
        self._bad: set = set()
        self._checked_ok: set = set()
        self._missed: dict = {}  # name key -> when nothing was found; not retried for a day
        self._by_name: dict = {}
        self._load()

    def _load(self) -> None:
        if self._store_path is None or not self._store_path.exists():
            return
        try:
            data = json.loads(self._store_path.read_text(encoding="utf-8"))
            self._bad = set(data.get("bad", []))
            self._by_name = {str(k): str(v) for k, v in dict(data.get("by_name", {})).items()}
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            logger.warning("Cover memory %s is unreadable, starting empty: %s", self._store_path, exc)

    def _save(self) -> None:
        if self._store_path is None:
            return
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            self._store_path.write_text(
                json.dumps({"bad": sorted(self._bad), "by_name": self._by_name}, ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Could not save cover memory %s: %s", self._store_path, exc, exc_info=True)

    def pick(self, name: str, url: Optional[str]) -> Optional[str]:
        """The cover to show: the given one unless it is known to be broken or missing and a replacement is known."""
        if url and url not in self._bad:
            return url
        return self._by_name.get(_key(name)) or (None if url in self._bad else url)

    async def refresh(self, games: Iterable[dict], head: HeadCheck, search: NameSearch, limit: int = 12) -> int:
        """Verify covers of games that have not been judged yet and find replacements. Returns how many replacements were found."""
        todo = []
        for g in games:
            name, url = g.get("name", ""), g.get("box_art")
            key = _key(name)
            if not key or key in self._by_name or time.time() - self._missed.get(key, 0) < 86400:
                continue
            if url and url not in self._bad and url in self._checked_ok:
                continue
            todo.append((name, url))
        gate = asyncio.Semaphore(limit)
        found = 0

        async def work(name: str, url: Optional[str]) -> None:
            nonlocal found
            async with gate:
                if url and url not in self._bad:
                    if await head(url):
                        self._checked_ok.add(url)
                        return
                    self._bad.add(url)
                candidates = steam_fallback_urls(url or "")
                for candidate in candidates:
                    if await head(candidate):
                        self._by_name[_key(name)] = candidate
                        found += 1
                        return
                for candidate in await search(name):
                    if await head(candidate):
                        self._by_name[_key(name)] = candidate
                        found += 1
                        return
                self._missed[_key(name)] = time.time()

        await asyncio.gather(*(work(n, u) for n, u in todo))
        if todo:
            self._save()
        return found




COVER_KEEPER = CoverKeeper()
