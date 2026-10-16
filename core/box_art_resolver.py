"""
Box Art Resolver for Twitch Drops Sentinel v3
Automated Steam Store Search & AppDetails asset hydrator.
Verifies AppIDs, resolves V2 SHA-1 URLs, and populates box_art_cache.json & installed_games.json.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import unicodedata
import urllib.parse
from pathlib import Path
from typing import Any
import aiohttp

logger = logging.getLogger("TwitchDropsSentinel.BoxArtResolver")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CACHE_PATH = DATA_DIR / "box_art_cache.json"
INSTALLED_PATH = DATA_DIR / "installed_games.json"

ROMAN_MAP = {
    "ii": "2", "iii": "3", "iv": "4", "v": "5",
    "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10",
}

EDITION_NOISE = re.compile(
    r"\b(director'?s cut|remake|remastered|definitive edition|complete edition|"
    r"goty|game of the year|edition|playtest|classic)\b",
    re.IGNORECASE,
)

SEQUEL_TOKENS = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "1896", "2077"}


def canonicalize(title: str) -> str:
    """Canonicalize title: normalize unicode, strip accents, noise, roman numerals."""
    if not title:
        return ""
    norm = unicodedata.normalize("NFD", title)
    norm = "".join(c for c in norm if unicodedata.category(c) != "Mn").lower()
    norm = EDITION_NOISE.sub("", norm)
    norm = re.sub(r"[':;!?,.\-_/\\()\[\]&™®©]", " ", norm)
    tokens = [t for t in norm.split() if t]
    tokens = [ROMAN_MAP.get(t, t) for t in tokens]
    return " ".join(tokens)


def is_verified_match(query_title: str, candidate_title: str) -> bool:
    """Enforces token overlap and strict Sequel Guard between query and Steam result."""
    q_canon = canonicalize(query_title)
    c_canon = canonicalize(candidate_title)
    if not q_canon or not c_canon:
        return False
    if q_canon == c_canon:
        return True
    # Handle optional "1"
    if re.sub(r"\s+1$", "", q_canon) == re.sub(r"\s+1$", "", c_canon):
        return True

    q_toks = q_canon.split()
    c_toks = c_canon.split()

    q_seq = next((t for t in q_toks if t in SEQUEL_TOKENS and t != "1"), None)
    c_seq = next((t for t in c_toks if t in SEQUEL_TOKENS and t != "1"), None)
    if q_seq != c_seq:
        return False  # Sequel Guard triggered

    q_tokens = set(q_toks)
    c_tokens = set(c_toks)
    overlap = len(q_tokens & c_tokens)
    return overlap >= min(len(q_tokens), len(c_tokens))


async def resolve_game_assets(
    session: aiohttp.ClientSession, game_name: str
) -> dict[str, Any] | None:
    """
    Searches Steam Store API (US/English locale) with strict title verification.
    Returns verified AppID and valid CDN URL cascade.
    """
    search_term = EDITION_NOISE.sub("", game_name).strip()
    url = f"https://store.steampowered.com/api/storesearch/?term={urllib.parse.quote(search_term)}&l=english&cc=US"

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            if resp.status != 200:
                return None
            data = await resp.json(content_type=None)
    except Exception as e:
        logger.debug(f"Search failed for {game_name}: {e}")
        return None

    items = data.get("items", []) if isinstance(data, dict) else []
    for item in items[:6]:
        candidate_name = item.get("name", "")
        app_id = str(item.get("id", ""))
        if not app_id or not is_verified_match(game_name, candidate_name):
            continue

        verified_urls: list[str] = []

        # Candidate paths on Steam CDNs
        v2_lib = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg"
        cf_lib = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
        v2_hdr = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{app_id}/header.jpg"
        cf_hdr = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg"

        # Check vertical library poster availability
        for candidate_url in (v2_lib, cf_lib, v2_hdr, cf_hdr):
            try:
                async with session.head(candidate_url, timeout=aiohttp.ClientTimeout(total=3)) as head_resp:
                    if head_resp.status == 200 and candidate_url not in verified_urls:
                        verified_urls.append(candidate_url)
            except Exception:
                continue

        # If standard paths failed, fetch appdetails to extract exact hashed header_image
        if not verified_urls:
            try:
                details_url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=english&cc=US"
                async with session.get(details_url, timeout=aiohttp.ClientTimeout(total=6)) as det_resp:
                    if det_resp.status == 200:
                        det_data = await det_resp.json(content_type=None)
                        app_data = det_data.get(app_id, {})
                        if app_data.get("success"):
                            hdr = app_data.get("data", {}).get("header_image")
                            if hdr and hdr not in verified_urls:
                                verified_urls.append(hdr)
            except Exception as e:
                logger.debug(f"Appdetails fallback failed for {app_id}: {e}")

        # Tiny image fallback
        tiny_img = item.get("tiny_image", "")
        if not verified_urls and tiny_img:
            verified_urls.append(re.sub(r"capsule_\d+x\d+\.jpg", "header.jpg", tiny_img))

        if verified_urls:
            return {
                "app_id": app_id,
                "steam_name": candidate_name,
                "urls": verified_urls,
            }

    return None


async def hydrate_installed_games() -> dict[str, Any]:
    """Hydrates data/installed_games.json & data/box_art_cache.json with verified Steam assets."""
    cache: dict[str, Any] = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    installed: list[dict[str, Any]] = []
    if INSTALLED_PATH.exists():
        try:
            installed = json.loads(INSTALLED_PATH.read_text(encoding="utf-8"))
        except Exception:
            installed = []

    resolved_count = 0
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        for entry in installed:
            name = entry.get("name")
            if not name:
                continue
            norm = name.strip().lower()
            canon = canonicalize(name)

            if canon not in cache and norm not in cache:
                resolved = await resolve_game_assets(session, name)
                if resolved:
                    cache[canon] = resolved["urls"][0]
                    cache[norm] = resolved["urls"][0]
                    resolved_count += 1
                await asyncio.sleep(0.2)  # Respect Steam rate limits

            cached_url = cache.get(canon) or cache.get(norm)
            if cached_url and not entry.get("box_art"):
                entry["box_art"] = cached_url

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
    if installed:
        INSTALLED_PATH.write_text(json.dumps(installed, indent=2, ensure_ascii=False), encoding="utf-8")

    logger.info(f"Hydration complete: resolved {resolved_count} new box arts.")
    return {"resolved_count": resolved_count, "total_installed": len(installed)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    res = asyncio.run(hydrate_installed_games())
    print(f"Result: {res}")
