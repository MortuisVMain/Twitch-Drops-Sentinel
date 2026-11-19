"""Watching a category for reward campaigns: category resolution, the daily watch ledger, selection and earned matching.

Everything here is pure or injectable (the Twitch lookup is a callable, files take a path), the engine only glues it in.
Nothing here ever buys, subscribes or gifts: subscription goals are display-only.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable, Optional

from atomic_json import atomic_write_json
from utils import Game, smart_game_match

logger = logging.getLogger("TwitchDrops.RewardWatch")

PREFIX = "reward:"
HIDDEN_LIMIT = 200
CATEGORY_MAP_LIMIT = 100
ID_LIMIT = 200
CATEGORY_NAME_LIMIT = 100
CANDIDATE_LIMIT = 6
LEDGER_KEEP_DAYS = 40
EARNED_LIMIT = 200
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

Validator = Callable[[str], Awaitable[Optional[dict]]]

# Shorthand a campaign text may use for a category, turned into the name Twitch lists. Tiny on purpose: add a line
# (pattern, replacement) when a new campaign uses a nickname. Order matters (the longer title first).
ALIASES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bGTA\s?(?:VI|6)\b", re.I), "Grand Theft Auto VI"),
    (re.compile(r"\bGTA\s?(?:V|5)\b", re.I), "Grand Theft Auto V"),
    (re.compile(r"\bLoL\b"), "League of Legends"),
    (re.compile(r"\bWoW\b"), "World of Warcraft"),
    (re.compile(r"\bCoD\b"), "Call of Duty"),
]

_WORD = r"[^\s.,;:!?()\"“”]+"
_PHRASE = rf"({_WORD}(?:\s+{_WORD}){{0,4}}?)"
_TEXT_PATTERNS = [
    re.compile(rf"\bin the {_PHRASE}\s+category\b", re.I),
    re.compile(rf"\bwatch(?:ing)?\s+{_PHRASE}\s+(?:streamers|streams|channels|broadcasters)\b", re.I),
    re.compile(rf"\b(?:streamers|streams|channels)\s+(?:playing|streaming|in)\s+(?:the\s+)?{_PHRASE}\s+(?:category|game)\b", re.I),
]
_GENERIC_NAME_WORDS = re.compile(r"\b(launch|celebration|campaign|night out|event|promo|promotion|rewards?|drops?|sweepstakes)\b", re.I)
_STOP = {"live", "any", "all", "the", "your", "favorite", "favourite", "eligible", "participating", "partnered", "different",
         "new", "twitch", "streamers", "these", "those", "some", "other", "more", "one", "each"}


def is_reward_key(value: Any) -> bool:
    """True for a `reward:<campaignId>` entry (queue and forced target)."""
    return isinstance(value, str) and value.startswith(PREFIX) and len(value) > len(PREFIX)


def reward_key(campaign_id: str) -> str:
    return PREFIX + campaign_id


def reward_id(value: Any) -> Optional[str]:
    return value[len(PREFIX):] if is_reward_key(value) else None


def clean_key(value: str) -> str:
    """A queue entry `reward:<id>` kept as it is (game names are normalised elsewhere, which would destroy it)."""
    return PREFIX + value.strip()[len(PREFIX):][:ID_LIMIT]


def _fold(text: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))


def _clean_candidate(text: str) -> Optional[str]:
    for pattern, replacement in ALIASES:
        text = pattern.sub(replacement, text)
    text = text.strip(" \t\r\n'\"‘’“”-").strip()
    text = re.sub(r"[’']s$", "", text)
    words = text.lower().split()
    if not 2 <= len(text) <= 60 or not words or all(w in _STOP for w in words) or words[0] in _STOP:
        return None
    return text


def guess_candidates(name: Optional[str], summary: Optional[str], instructions: Optional[str]) -> list[str]:
    """Possible category names found in a campaign's texts, best first (phrases around "streamers" and "Category",
    then the campaign name without generic words); shorthand like GTAVI is turned into the listed title."""
    found: list[str] = []
    for text in (summary, instructions):
        for pattern in _TEXT_PATTERNS:
            for match in pattern.finditer(text or ""):
                found.append(match.group(1))
    if name:
        trimmed = re.sub(r"\s{2,}", " ", _GENERIC_NAME_WORDS.sub(" ", name)).strip()
        if trimmed:
            found.append(trimmed)
    out: list[str] = []
    for raw in found:
        cleaned = _clean_candidate(raw)
        if cleaned and cleaned.lower() not in (c.lower() for c in out):
            out.append(cleaned)
        if len(out) >= CANDIDATE_LIMIT:
            break
    return out


def _slug(name: str) -> str:
    return Game({"displayName": name}).slug


def sanitize_hidden(value: Any) -> Optional[list[str]]:
    """A list of campaign ids, trimmed, unique and capped; None when the value is not a list of strings."""
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        return None
    seen, out = set(), []
    for item in value:
        item = item.strip()[:ID_LIMIT]
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out[:HIDDEN_LIMIT]


def sanitize_categories(value: Any) -> Optional[dict[str, str]]:
    """{campaignId: category name}: names trimmed and capped, an empty name removes the entry; None when not str -> str."""
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
        return None
    out: dict[str, str] = {}
    for key, name in value.items():
        key, name = key.strip()[:ID_LIMIT], name.strip()[:CATEGORY_NAME_LIMIT]
        if key and name:
            out[key] = name
        if len(out) >= CATEGORY_MAP_LIMIT:
            break
    return out


def _utc_day(now: datetime) -> str:
    return now.astimezone(timezone.utc).strftime("%Y-%m-%d")


def _read_json(path: Path, what: str) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        logger.error("Cannot read %s (%s): starting empty", what, path, exc_info=True)
        return {}
    return data if isinstance(data, dict) else {}


def _write_json(path: Path, data: dict, what: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(path, data)
    except (OSError, TypeError, ValueError) as exc:
        logger.error("Cannot save %s to %s: %s", what, path, exc, exc_info=True)


class WatchLedger:
    """Seconds watched per campaign per UTC day (counted as whole minutes) (40 days kept) and the campaigns known to be earned."""

    def __init__(self, path: Path):
        self.path = path
        raw = _read_json(path, "reward watch ledger")
        days = raw.get("days") if isinstance(raw.get("days"), dict) else {}
        self.days: dict[str, dict[str, float]] = {
            d: {k: float(v) for k, v in m.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
            for d, m in days.items() if isinstance(m, dict)}
        earned = raw.get("earned") if isinstance(raw.get("earned"), dict) else {}
        self.earned: dict[str, str] = {k: str(v) for k, v in earned.items()}
        self._prune(datetime.now(timezone.utc))

    def _prune(self, now: datetime) -> None:
        oldest = (now.astimezone(timezone.utc) - timedelta(days=LEDGER_KEEP_DAYS)).strftime("%Y-%m-%d")
        for day in [d for d in self.days if d < oldest]:
            del self.days[day]

    def minutes_today(self, campaign_id: str, now: Optional[datetime] = None) -> int:
        now = now or datetime.now(timezone.utc)
        return int(self.days.get(_utc_day(now), {}).get(campaign_id, 0.0) // 60)

    def add_seconds(self, campaign_id: str, seconds: float, now: Optional[datetime] = None) -> int:
        """Adds watched time; returns the whole minutes of today. The file is written when a whole minute passes."""
        now = now or datetime.now(timezone.utc)
        today = self.days.setdefault(_utc_day(now), {})
        before = int(today.get(campaign_id, 0.0) // 60)
        today[campaign_id] = today.get(campaign_id, 0.0) + max(0.0, seconds)
        self._prune(now)
        after = int(today[campaign_id] // 60)
        if after != before:
            self.save()
        return after

    def mark_earned(self, campaign_id: str, now: Optional[datetime] = None) -> None:
        self.earned[campaign_id] = (now or datetime.now(timezone.utc)).isoformat()
        while len(self.earned) > EARNED_LIMIT:
            del self.earned[next(iter(self.earned))]
        self.save()

    def is_earned(self, campaign_id: str) -> bool:
        return campaign_id in self.earned

    def save(self) -> None:
        _write_json(self.path, {"days": self.days, "earned": self.earned}, "reward watch ledger")


class CategoryResolver:
    """Guessed categories per campaign id, validated with Twitch and remembered in a small file.
    An unresolvable campaign is remembered too (until its texts change), so a restart does not ask again."""

    def __init__(self, path: Path):
        self.path = path
        raw = _read_json(path, "reward category cache")
        self.entries: dict[str, dict] = {k: v for k, v in raw.items() if isinstance(v, dict)}

    @staticmethod
    def signature(campaign: dict) -> str:
        text = "|".join(str(campaign.get(k) or "") for k in ("name", "summary", "instructions"))
        return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]

    def cached(self, campaign: dict) -> Optional[dict]:
        entry = self.entries.get(campaign.get("id"))
        if entry and entry.get("sig") == self.signature(campaign) and isinstance(entry.get("category"), dict):
            return entry["category"]
        return None

    def _known(self, campaign: dict) -> bool:
        entry = self.entries.get(campaign.get("id"))
        return bool(entry and entry.get("sig") == self.signature(campaign))

    async def resolve(self, campaigns: Iterable[dict], overrides: dict, validator: Validator) -> None:
        """Validates a guess for every watch campaign that has no game, no user category and no remembered answer."""
        changed = False
        for campaign in campaigns:
            if campaign.get("game") or overrides.get(campaign.get("id")) or not _watch_minutes(campaign) or self._known(campaign):
                continue
            category, transient = None, False
            for candidate in guess_candidates(campaign.get("name"), campaign.get("summary"), campaign.get("instructions")):
                try:
                    found = await validator(candidate)
                except Exception as exc:
                    logger.warning("Category lookup for %r failed, will retry later: %s", candidate, exc, exc_info=True)
                    transient = True
                    break
                if found and found.get("slug") and _same_title(found.get("name") or candidate, candidate):
                    category = {"name": found.get("name") or candidate, "slug": found["slug"], "source": "guess"}
                    break
            if transient:
                continue
            self.entries[campaign["id"]] = {"sig": self.signature(campaign), "category": category}
            changed = True
            if category is None:
                logger.info("Reward campaign %r: no category could be found, it cannot be farmed", campaign.get("name"))
            else:
                logger.info("Reward campaign %r: category guessed as %r", campaign.get("name"), category["name"])
        if changed:
            _write_json(self.path, self.entries, "reward category cache")


def _same_title(found: str, wanted: str) -> bool:
    return smart_game_match(_fold(found), _fold(wanted))


def _watch_minutes(campaign: dict) -> Optional[int]:
    for group in campaign.get("groups") or []:
        if group.get("goalKind") == "watch" and group.get("minutes"):
            return group["minutes"]
    if campaign.get("groups"):
        return None
    return campaign.get("minutesGoal") or None


def _ended(campaign: dict, now: datetime) -> bool:
    text = campaign.get("endsAt")
    if not isinstance(text, str):
        return False
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return False
    return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)) <= now


def view(campaigns: Iterable[dict], hidden: Iterable[str], categories: dict, resolver: CategoryResolver,
         ledger: WatchLedger, now: Optional[datetime] = None) -> list[dict]:
    """The parsed campaigns with the fields the page and the engine need: category (game > user > guess), farmable,
    watchedToday, dailyGoal, doneToday, earned, hidden. Never changes its input."""
    now = now or datetime.now(timezone.utc)
    hidden = set(hidden or [])
    out = []
    for campaign in campaigns:
        cid = campaign.get("id")
        if campaign.get("game"):
            category = {"name": campaign["game"], "slug": _slug(campaign["game"]), "source": "game"}
        elif isinstance(categories.get(cid), str) and categories[cid].strip():
            category = {"name": categories[cid].strip(), "slug": _slug(categories[cid].strip()), "source": "user"}
        else:
            category = resolver.cached(campaign)
        goal = _watch_minutes(campaign)
        watched = ledger.minutes_today(cid, now)
        out.append({
            **campaign,
            "groups": campaign.get("groups") or [],
            "sitewide": campaign.get("sitewide") is True,
            "category": category,
            "farmable": bool(goal) and category is not None,
            "watchedToday": watched,
            "dailyGoal": goal,
            "doneToday": bool(goal) and watched >= goal,
            "earned": ledger.is_earned(cid),
            "hidden": cid in hidden,
        })
    return out


def ineligible_reason(campaign: dict, now: datetime) -> Optional[str]:
    """Why a viewed campaign must not be farmed now (None when it may)."""
    if campaign.get("hidden"):
        return "кампания скрыта"
    if _ended(campaign, now):
        return "кампания закончилась"
    if not campaign.get("farmable"):
        return "для неё нет времени просмотра или категории"
    if campaign.get("earned"):
        return "награда уже получена"
    if campaign.get("doneToday"):
        return "дневная цель выполнена"
    return None


def choose(viewed: list[dict], *, forced_id: Optional[str], priority: Iterable[str], drops_available: bool,
           now: Optional[datetime] = None) -> tuple[Optional[dict], Optional[str]]:
    """The campaign to watch, and the reason a forced one was refused. Drops win: without a forced campaign nothing is
    chosen while the engine has drops to farm; the queue (`reward:<id>` entries of priority_games) decides the order."""
    now = now or datetime.now(timezone.utc)
    by_id = {c.get("id"): c for c in viewed}
    if forced_id:
        campaign = by_id.get(forced_id)
        if campaign is None:
            return None, "кампании нет в списке"
        reason = ineligible_reason(campaign, now)
        return (None, reason) if reason else (campaign, None)
    if drops_available:
        return None, None
    for entry in priority:
        campaign = by_id.get(reward_id(entry))
        if campaign is not None and ineligible_reason(campaign, now) is None:
            return campaign, None
    return None, None


_SECRET_KEY = re.compile(r"token|secret|auth|password|cookie|session|key", re.I)
_USEFUL_KEY = re.compile(r"id|name|title|body|text|campaign|reward", re.I)


def notification_fields(notification: Any) -> dict[str, str]:
    """The id/name-like top-level text fields of a notification, safe to log (anything token-like is skipped)."""
    if not isinstance(notification, dict):
        return {}
    return {k: v[:200] for k, v in notification.items()
            if isinstance(k, str) and isinstance(v, str) and _USEFUL_KEY.search(k) and not _SECRET_KEY.search(k)}


def match_earned(notification: Any, campaigns: Iterable[dict]) -> Optional[str]:
    """The id of the campaign an "earned" notification belongs to (its id, name or a reward name appears in the
    notification's text fields), or None."""
    texts = [v.lower() for v in notification_fields(notification).values()]
    if not texts:
        return None
    for campaign in campaigns:
        cid = campaign.get("id")
        names = [campaign.get("name")] + [r.get("name") for r in campaign.get("rewards") or [] if isinstance(r, dict)]
        wanted = [n.lower() for n in names if isinstance(n, str) and len(n) >= 3]
        if any((isinstance(cid, str) and cid.lower() in t) or any(w in t for w in wanted) for t in texts):
            return cid
    return None


def status_line(channel: str, category: str, campaign: str, minutes: int, goal: int) -> str:
    return f"[НАГРАДА] Смотрим {channel} ({category}) для «{campaign}»: {minutes}/{goal} мин сегодня"


class RewardWatch:
    """The process-wide ledger and category cache, created on first use."""

    def __init__(self, data_dir: Optional[Path] = None):
        self._dir = data_dir
        self._ledger: Optional[WatchLedger] = None
        self._resolver: Optional[CategoryResolver] = None

    @property
    def ledger(self) -> WatchLedger:
        if self._ledger is None:
            self._ledger = WatchLedger((self._dir or DATA_DIR) / "reward_watch.json")
        return self._ledger

    @property
    def resolver(self) -> CategoryResolver:
        if self._resolver is None:
            self._resolver = CategoryResolver((self._dir or DATA_DIR) / "reward_categories.json")
        return self._resolver

    def view(self, campaigns: Iterable[dict], hidden: Iterable[str], categories: dict, now: Optional[datetime] = None) -> list[dict]:
        return view(campaigns, hidden, categories, self.resolver, self.ledger, now)


REWARD_WATCH = RewardWatch()
