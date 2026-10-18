import asyncio
import json
import logging
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("TwitchDropsSentinel.CampaignsFetcher")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CACHE_FILE = DATA_DIR / "active_campaigns_cache.json"
INSTALLED_GAMES_FILE = DATA_DIR / "installed_games.json"
BOX_ART_CACHE_FILE = DATA_DIR / "box_art_cache.json"

API_URL = "https://twitch-drops-api.sunkwi.com/v2/drops"

def clean_title(title: str) -> str:
    """Normalize title for safe matching: lowercase, strip punctuation and extra spaces."""
    t = re.sub(r'[\':;!?,.\-_/\\()\[\]]', ' ', title.lower())
    return ' '.join(t.split())

_ROMAN_MAP = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7"}
_SEQUEL_NUMS = {"2", "3", "4", "5", "6", "7"}

def smart_game_match(candidate: str, target: str) -> bool:
    """
    Intelligent fuzzy matcher for game names:
    - Case-insensitive & punctuation agnostic
    - Strict version guard: 'Path of Exile' NEVER matches 'Path of Exile 2'
    - Subtitle friendly: 'Hunt: Showdown' matches 'Hunt: Showdown 1896'
    - Roman numeral normalization: 'Space Marine II' matches 'Space Marine 2'
    """
    if not candidate or not target:
        return False
    c_clean = clean_title(candidate)
    t_clean = clean_title(target)
    if c_clean == t_clean:
        return True
    c_tokens = [_ROMAN_MAP.get(tok, tok) for tok in c_clean.split()]
    t_tokens = [_ROMAN_MAP.get(tok, tok) for tok in t_clean.split()]
    c_ver = next((tok for tok in c_tokens if tok in _SEQUEL_NUMS), None)
    t_ver = next((tok for tok in t_tokens if tok in _SEQUEL_NUMS), None)
    if c_ver != t_ver:
        return False
    c_norm = " ".join(c_tokens)
    t_norm = " ".join(t_tokens)
    if c_norm.startswith(t_norm) or t_norm.startswith(c_norm):
        return True
    if re.search(r"\b" + re.escape(t_norm) + r"\b", c_norm) or re.search(r"\b" + re.escape(c_norm) + r"\b", t_norm):
        return True
    return False

class CampaignsFetcher:
    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._cached_campaigns: list[dict[str, Any]] = []
        self._cached_catalog: list[dict[str, Any]] = []
        self._last_fetch_time: float = 0
        self._installed_games: list[dict[str, Any]] = self._load_installed_games()
        self._box_art_cache: dict[str, str] = self._load_box_art_cache()
        self._load_cache()

    def _load_box_art_cache(self) -> dict[str, str]:
        if BOX_ART_CACHE_FILE.exists():
            try:
                with open(BOX_ART_CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return data
            except Exception as e:
                logger.error(f"Failed to load box_art_cache.json: {e}")
        return {}

    def _save_box_art_cache(self) -> None:
        try:
            with open(BOX_ART_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(self._box_art_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save box_art_cache: {e}")

    def _load_installed_games(self) -> list[dict[str, Any]]:
        if INSTALLED_GAMES_FILE.exists():
            try:
                with open(INSTALLED_GAMES_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load installed_games.json: {e}")
        return []

    def _load_cache(self) -> None:
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self._cached_campaigns = data
                        self._build_catalog()
                        logger.info(f"Loaded {len(self._cached_campaigns)} campaigns from local cache.")
            except Exception as e:
                logger.error(f"Failed to read campaigns cache: {e}")

    def _save_cache(self, campaigns: list[dict[str, Any]]) -> None:
        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(campaigns, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save campaigns cache: {e}")

    def fetch_sync(self) -> list[dict[str, Any]]:
        """Synchronously fetch active campaigns from the public Twitch drops API."""
        req = urllib.request.Request(
            API_URL,
            headers={
                "User-Agent": "TwitchDropsSentinel/3.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                campaigns = data.get("data", [])
                if campaigns:
                    self._cached_campaigns = campaigns
                    self._last_fetch_time = datetime.now(timezone.utc).timestamp()
                    self._save_cache(campaigns)
                    self._build_catalog()
                    logger.info(f"Successfully fetched {len(campaigns)} live campaigns from Twitch.")
                    return campaigns
        except Exception as e:
            logger.warning(f"Failed to fetch live campaigns from {API_URL}: {e}")
        return self._cached_campaigns

    async def fetch_async(self) -> list[dict[str, Any]]:
        """Fetch active campaigns without blocking the async event loop."""
        return await asyncio.to_thread(self.fetch_sync)

    def _build_catalog(self) -> None:
        """
        Merge user's installed games with live Twitch campaigns to form the
        authentic all_catalog_games dataset.
        """
        # Map cleaned titles to campaign objects
        campaign_map: dict[str, dict[str, Any]] = {}
        exact_campaign_map: dict[str, dict[str, Any]] = {}
        for c in self._cached_campaigns:
            gname = c.get("gameDisplayName")
            if not gname:
                continue
            norm_name = clean_title(gname)
            campaign_map[norm_name] = c
            exact_campaign_map[gname.strip().lower()] = c

        catalog: list[dict[str, Any]] = []
        matched_campaign_keys: set[str] = set()

        # 1. Process installed games
        for ig in self._installed_games:
            name = ig.get("name", "").strip()
            norm = clean_title(name)
            exact_norm = name.lower()

            matched_c = exact_campaign_map.get(exact_norm) or campaign_map.get(norm)
            matched_key = None

            if matched_c:
                matched_key = matched_c.get("gameDisplayName", "").strip().lower()

            if matched_c:
                if matched_key:
                    matched_campaign_keys.add(matched_key)
                    matched_campaign_keys.add(clean_title(matched_key))
                
                box_art = matched_c.get("gameBoxArtURL") or ig.get("box_art")
                if box_art and "120x160" in box_art:
                    box_art = box_art.replace("120x160", "285x380")

                catalog.append({
                    "id": ig.get("id") or str(matched_c.get("gameId")),
                    "name": name,
                    "is_installed": True,
                    "has_drops": True,
                    "category": ig.get("category") or "Установлено / Drops",
                    "box_art": box_art,
                    "drops_end_at": matched_c.get("endAt"),
                    "rewards_count": len(matched_c.get("rewards", [])),
                })
            else:
                catalog.append({
                    "id": ig.get("id"),
                    "name": name,
                    "is_installed": True,
                    "has_drops": False,
                    "category": ig.get("category") or "Установлено",
                    "box_art": ig.get("box_art"),
                })

        # 2. Add remaining active Twitch Drop games (not installed locally)
        for c in self._cached_campaigns:
            gname = c.get("gameDisplayName")
            if not gname:
                continue
            norm_exact = gname.strip().lower()
            norm_clean = clean_title(gname)

            if norm_exact in matched_campaign_keys or norm_clean in matched_campaign_keys:
                continue
            
            matched_campaign_keys.add(norm_exact)
            matched_campaign_keys.add(norm_clean)

            gid = str(c.get("gameId") or norm_clean.replace(" ", "-"))
            box_art = c.get("gameBoxArtURL")
            if box_art and "120x160" in box_art:
                box_art = box_art.replace("120x160", "285x380")

            catalog.append({
                "id": f"twitch-{gid}",
                "name": gname,
                "is_installed": False,
                "has_drops": True,
                "category": "Twitch Drops",
                "box_art": box_art,
                "drops_end_at": c.get("endAt"),
                "rewards_count": len(c.get("rewards", [])),
            })

        # Sort: Active drops on installed games first, then all other active drops, then remaining installed games
        def sort_key(item: dict[str, Any]) -> tuple[int, str]:
            has_drops = item.get("has_drops", False)
            is_installed = item.get("is_installed", False)
            if has_drops and is_installed:
                priority_rank = 0
            elif has_drops:
                priority_rank = 1
            elif is_installed:
                priority_rank = 2
            else:
                priority_rank = 3
            return (priority_rank, item.get("name", "").lower())

        catalog.sort(key=sort_key)
        self._cached_catalog = catalog
        logger.info(f"Built catalog with {len(catalog)} games ({sum(1 for g in catalog if g.get('has_drops'))} with active drops).")

    def find_active_campaign(self, query: str) -> dict[str, Any] | None:
        """Find active Twitch drop campaign matching a query string."""
        q_raw = query.strip().lower()
        q_clean = clean_title(query)
        if not q_clean:
            return None

        # 1. Exact match
        for c in self._cached_campaigns:
            gname = c.get("gameDisplayName", "")
            if gname.strip().lower() == q_raw:
                return c

        # 2. Smart match (with version guard & subtitle support)
        for c in self._cached_campaigns:
            gname = c.get("gameDisplayName", "")
            if smart_game_match(gname, query):
                return c

        return None

    def verify_game(self, query: str) -> dict[str, Any]:
        """
        3-Tier verification of a game for guaranteed drops:
        Tier 1: Active drops on Twitch right now (Guaranteed rewards).
        Tier 2: Installed PC game with or without drops.
        Tier 3: Unverified / Custom entry.
        """
        q_raw = query.strip()
        if not q_raw:
            return {
                "verified": False,
                "status": "EMPTY",
                "message": "Введите название игры",
            }

        matched_campaign = self.find_active_campaign(q_raw)
        if matched_campaign:
            box_art = matched_campaign.get("gameBoxArtURL") or ""
            if "120x160" in box_art:
                box_art = box_art.replace("120x160", "285x380")

            rewards = matched_campaign.get("rewards") or []
            rewards_summary = []
            for r in rewards[:6]:
                tb = r.get("timeBasedDrops") or []
                d_name = tb[0].get("name") if tb else r.get("name")
                req_min = tb[0].get("requiredMinutesWatched", 0) if tb else 0
                rewards_summary.append({
                    "id": r.get("id"),
                    "name": d_name or r.get("name"),
                    "minutes": req_min,
                })

            end_at = matched_campaign.get("endAt")
            return {
                "verified": True,
                "status": "ACTIVE_DROPS_NOW",
                "canonical_name": matched_campaign.get("gameDisplayName"),
                "game_id": str(matched_campaign.get("gameId")),
                "box_art": box_art,
                "has_active_drops": True,
                "drops_end_at": end_at,
                "rewards_count": len(rewards),
                "rewards": rewards_summary,
                "message": f"🔥 Кампания АКТИВНА на Twitch! Доступно {len(rewards)} наград.",
            }

        # Check installed games
        q_clean = clean_title(q_raw)
        for ig in self._installed_games:
            ig_name = ig.get("name", "")
            if clean_title(ig_name) == q_clean or q_clean in clean_title(ig_name):
                return {
                    "verified": True,
                    "status": "NO_ACTIVE_DROPS",
                    "canonical_name": ig_name,
                    "game_id": str(ig.get("id", "")),
                    "box_art": ig.get("box_art"),
                    "has_active_drops": False,
                    "is_installed": True,
                    "message": "💾 Игра установлена на ПК, но на Twitch прямо сейчас нет активных Drops. Sentinel встанет в очередь авто-ожидания.",
                }

        # Not found in active drops
        return {
            "verified": False,
            "status": "NO_ACTIVE_DROPS",
            "canonical_name": q_raw,
            "has_active_drops": False,
            "is_installed": False,
            "message": "⚠️ На Twitch прямо сейчас нет активных кампаний Drops для этой игры. При добавлении Sentinel будет ожидать старта официальной раздачи.",
        }

    def search_games(self, query: str) -> list[dict[str, Any]]:
        """
        Unified multi-source game search:
        1. Live Twitch Drops campaigns (Guaranteed active rewards & canonical IGDB name)
        2. Installed PC games (Local games with or without drops)
        3. Steam Store Search API (Canonical English titles & 600x900 library posters)
        """
        q = query.strip()
        if not q or len(q) < 2:
            return []

        q_clean = clean_title(q)
        results: list[dict[str, Any]] = []
        seen_names = set()

        # 1. Match from cached live Twitch drop campaigns
        for c in self._cached_campaigns:
            gname = c.get("gameDisplayName") or ""
            if not gname:
                continue
            if q_clean in clean_title(gname) or smart_game_match(gname, q):
                norm_key = gname.lower()
                if norm_key not in seen_names:
                    seen_names.add(norm_key)
                    box_art = c.get("gameBoxArtURL") or ""
                    if "120x160" in box_art:
                        box_art = box_art.replace("120x160", "285x380")
                    rewards = c.get("rewards") or []
                    results.append({
                        "name": gname,
                        "canonical_name": gname,
                        "box_art": box_art or self._box_art_cache.get(norm_key),
                        "has_active_drops": True,
                        "is_installed": any(clean_title(ig.get("name", "")) == clean_title(gname) for ig in self._installed_games),
                        "status": "ACTIVE_DROPS",
                        "drops_end_at": c.get("endAt"),
                        "rewards_count": len(rewards),
                    })

        # 2. Match from installed PC games
        for ig in self._installed_games:
            ign = ig.get("name", "")
            if not ign:
                continue
            if q_clean in clean_title(ign):
                norm_key = ign.lower()
                if norm_key not in seen_names:
                    seen_names.add(norm_key)
                    results.append({
                        "name": ign,
                        "canonical_name": ign,
                        "box_art": ig.get("box_art") or self._box_art_cache.get(norm_key),
                        "has_active_drops": False,
                        "is_installed": True,
                        "status": "INSTALLED",
                        "drops_end_at": None,
                        "rewards_count": 0,
                    })

        # 3. Query Steam Store Search API (Canonical English titles & 600x900 posters)
        try:
            steam_url = f"https://store.steampowered.com/api/storesearch/?term={urllib.parse.quote(q)}&l=english&cc=US"
            req = urllib.request.Request(
                steam_url,
                headers={"User-Agent": "TwitchDropsSentinel/3.0", "Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                items = data.get("items", [])
                has_new_cache = False
                for item in items[:6]:
                    app_id = item.get("id")
                    s_name = item.get("name")
                    if not app_id or not s_name:
                        continue
                    norm_key = s_name.lower()
                    poster = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
                    if self._box_art_cache.get(norm_key) != poster:
                        self._box_art_cache[norm_key] = poster
                        has_new_cache = True

                    if norm_key not in seen_names:
                        seen_names.add(norm_key)
                        results.append({
                            "name": s_name,
                            "canonical_name": s_name,
                            "box_art": poster,
                            "has_active_drops": False,
                            "is_installed": any(clean_title(ig.get("name", "")) == clean_title(s_name) for ig in self._installed_games),
                            "status": "STEAM",
                            "drops_end_at": None,
                            "rewards_count": 0,
                        })
                if has_new_cache:
                    self._save_box_art_cache()
        except Exception as e:
            logger.debug(f"Steam store search failed: {e}")

        return results[:10]

    def refresh_installed_games(self, scanned_games: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
        """Reloads installed_games.json (or takes fresh list) and rebuilds the merged catalog."""
        if scanned_games is not None:
            self._installed_games = [dict(g) for g in scanned_games]
        else:
            self._installed_games = self._load_installed_games()
        self._build_catalog()
        logger.info(f"CampaignsFetcher refreshed: {len(self._installed_games)} installed games, catalog size: {len(self._cached_catalog)}")
        return self._installed_games

    def fetch_active_campaigns_and_cache(self) -> list[dict[str, Any]]:
        """Alias for fetch_sync to support background and API synchronization."""
        return self.fetch_sync()

    def get_catalog(self) -> list[dict[str, Any]]:
        if not self._cached_catalog:
            self._build_catalog()
        return self._cached_catalog

    def get_installed_game_names(self) -> list[str]:
        return [g["name"] for g in self.get_catalog() if g.get("is_installed")]

    def get_raw_campaigns(self) -> list[dict[str, Any]]:
        return self._cached_campaigns

    async def start_background_loop(self, interval_seconds: int = 900) -> None:
        """Periodic background refresh (default every 15 minutes)."""
        while True:
            try:
                await self.fetch_async()
            except Exception as e:
                logger.error(f"Error in background campaigns refresh loop: {e}")
            await asyncio.sleep(interval_seconds)

CAMPAIGNS_FETCHER = CampaignsFetcher()

