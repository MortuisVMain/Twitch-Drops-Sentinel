"""Watching a category for reward campaigns: category resolution, the daily watch ledger, selection and earned matching.

Everything here is pure or injectable (the Twitch lookup is a callable, files take a path), the engine only glues it in.
Nothing here ever buys, subscribes or gifts: subscription goals are display-only.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import time
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
NEGATIVE_RETRY_SECONDS = 6 * 3600
BACKOFF_SECONDS = 900.0  # a campaign without streams (or that stalled) waits this long before the slot tries it again
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


def parse_moment(value: Any) -> Optional[datetime]:
    """An ISO moment (with or without Z) as an aware datetime, None when unreadable."""
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _read_json(path: Path, what: str) -> dict:
    """The JSON object in the file; a file that cannot be read as one is kept aside as `<name>.corrupt-<time>` (never
    overwritten by the fresh start) and an empty dict is returned."""
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict):
            raise ValueError("the top level is not an object")
    except (OSError, ValueError) as exc:
        aside = path.with_name(f"{path.name}.corrupt-{datetime.now().strftime('%Y%m%d%H%M%S')}")
        try:
            path.replace(aside)
            logger.error("Cannot read %s (%s): %s. Kept as %s, starting empty", what, path, exc, aside.name, exc_info=True)
        except OSError:
            logger.error("Cannot read %s (%s): %s. Starting empty (it could not be set aside)", what, path, exc, exc_info=True)
        return {}
    return data


def _write_json(path: Path, data: dict, what: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(path, data)
    except (OSError, TypeError, ValueError) as exc:
        logger.error("Cannot save %s to %s: %s", what, path, exc, exc_info=True)


def _seconds(value: Any) -> Optional[float]:
    """A stored number of seconds: finite and not negative, otherwise None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    return float(value)


class WatchLedger:
    """Seconds watched per campaign per UTC day (counted as whole minutes, 40 days kept) and the campaigns known to be
    earned (until the campaign ends, or 40 days when its end is unknown)."""

    def __init__(self, path: Path):
        self.path = path
        raw = _read_json(path, "reward watch ledger")
        days = raw.get("days") if isinstance(raw.get("days"), dict) else {}
        self.days: dict[str, dict[str, float]] = {}
        for day, per_campaign in days.items():
            if isinstance(per_campaign, dict):
                self.days[day] = {k: v for k, v in ((k, _seconds(v)) for k, v in per_campaign.items()) if v is not None}
        earned = raw.get("earned") if isinstance(raw.get("earned"), dict) else {}
        daily = raw.get("daily_rewards") if isinstance(raw.get("daily_rewards"), dict) else {}
        self.daily_rewards: dict[str, dict[str, bool]] = {
            d: {k: True for k, v in m.items() if v is True} for d, m in daily.items() if isinstance(m, dict)}
        queued = raw.get("queued_ids")
        self.queued: list[str] = [q for q in queued if isinstance(q, str)][-EARNED_LIMIT:] if isinstance(queued, list) else []
        self.earned: dict[str, dict] = {}
        for key, value in earned.items():
            if isinstance(value, dict) and isinstance(value.get("at"), str):
                self.earned[key] = {"at": value["at"], "until": value.get("until") if isinstance(value.get("until"), str) else None}
            elif isinstance(value, str):
                self.earned[key] = {"at": value, "until": None}  # the first format: only the moment
        self._prune(datetime.now(timezone.utc))

    def _prune(self, now: datetime) -> None:
        now = now.astimezone(timezone.utc)
        oldest = (now - timedelta(days=LEDGER_KEEP_DAYS)).strftime("%Y-%m-%d")
        for day in [d for d in self.days if d < oldest]:
            del self.days[day]
        for day in [d for d in self.daily_rewards if d < oldest]:
            del self.daily_rewards[day]
        for key in [k for k in self.earned if self._earned_over(self.earned[k], now)]:
            del self.earned[key]

    @staticmethod
    def _earned_over(entry: dict, now: datetime) -> bool:
        until = parse_moment(entry.get("until"))
        if until is not None:
            return until <= now
        at = parse_moment(entry.get("at"))
        return at is None or at <= now - timedelta(days=LEDGER_KEEP_DAYS)

    def minutes_today(self, campaign_id: str, now: Optional[datetime] = None) -> int:
        now = now or datetime.now(timezone.utc)
        return int(self.days.get(_utc_day(now), {}).get(campaign_id, 0.0) // 60)

    def add_seconds(self, campaign_id: str, seconds: float, now: Optional[datetime] = None) -> int:
        """Adds watched time; returns the whole minutes of today. The file is written when a whole minute passes."""
        now = now or datetime.now(timezone.utc)
        seconds = seconds if isinstance(seconds, (int, float)) and math.isfinite(seconds) else 0.0
        today = self.days.setdefault(_utc_day(now), {})
        before = int(today.get(campaign_id, 0.0) // 60)
        today[campaign_id] = today.get(campaign_id, 0.0) + max(0.0, seconds)
        self._prune(now)
        after = int(today[campaign_id] // 60)
        if after != before:
            self.save()
        return after

    def mark_earned(self, campaign_id: str, now: Optional[datetime] = None, until: Optional[datetime] = None) -> None:
        now = now or datetime.now(timezone.utc)
        self.earned[campaign_id] = {"at": now.isoformat(), "until": until.isoformat() if until else None}
        while len(self.earned) > EARNED_LIMIT:
            del self.earned[next(iter(self.earned))]
        self.save()

    def mark_daily_reward(self, campaign_id: str, now: Optional[datetime] = None) -> None:
        """Today's (UTC) daily reward of a multi-day campaign was received."""
        now = now or datetime.now(timezone.utc)
        self.daily_rewards.setdefault(_utc_day(now), {})[campaign_id] = True
        self._prune(now)
        self.save()

    def daily_reward_today(self, campaign_id: str, now: Optional[datetime] = None) -> bool:
        return self.daily_rewards.get(_utc_day(now or datetime.now(timezone.utc)), {}).get(campaign_id) is True

    def days_done(self, campaign_id: str, goal: int) -> int:
        """In how many (kept) UTC days the watch goal of the campaign was reached."""
        return sum(1 for per_campaign in self.days.values() if goal and int(per_campaign.get(campaign_id, 0.0) // 60) >= goal)

    def mark_queued(self, campaign_ids: Iterable[str]) -> None:
        """Remembers campaigns the auto-queue appended, so one the user removes again is not added a second time."""
        for cid in campaign_ids:
            if cid not in self.queued:
                self.queued.append(cid)
        del self.queued[:-EARNED_LIMIT]
        self.save()

    def is_earned(self, campaign_id: str, now: Optional[datetime] = None) -> bool:
        entry = self.earned.get(campaign_id)
        return entry is not None and not self._earned_over(entry, (now or datetime.now(timezone.utc)).astimezone(timezone.utc))

    def save(self) -> None:
        _write_json(self.path, {"days": self.days, "earned": self.earned, "daily_rewards": self.daily_rewards, "queued_ids": self.queued}, "reward watch ledger")


class CategoryResolver:
    """Guessed categories per campaign id, validated with Twitch and remembered in a small file.
    "No category" is remembered too (6 hours, or until the campaign's texts change), so a restart does not ask again;
    entries of campaigns not seen for 40 days are dropped."""

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

    def _known(self, campaign: dict, now: float) -> bool:
        entry = self.entries.get(campaign.get("id"))
        if not entry or entry.get("sig") != self.signature(campaign):
            return False
        if isinstance(entry.get("category"), dict):
            return True
        at = entry.get("at")
        return isinstance(at, (int, float)) and now - at < NEGATIVE_RETRY_SECONDS

    def _prune(self, now: float) -> bool:
        stale = [k for k, e in self.entries.items() if now - (e.get("seen") if isinstance(e.get("seen"), (int, float)) else e.get("at") if isinstance(e.get("at"), (int, float)) else 0) > LEDGER_KEEP_DAYS * 86400]
        for key in stale:
            del self.entries[key]
        return bool(stale)

    async def resolve(self, campaigns: Iterable[dict], overrides: dict, validator: Validator, *, max_lookups: int = 3,
                      lookup_timeout: float = 8.0, now: Optional[float] = None) -> int:
        """Validates a guess for every watch campaign that has no game, no user category and no answer worth keeping.
        At most `max_lookups` Twitch lookups, one at a time, each with its own timeout and no retry; a campaign left
        without a decision (budget, timeout, error) is asked again next time. Returns the categories found."""
        now = time.time() if now is None else now
        campaigns = list(campaigns)
        for campaign in campaigns:
            if campaign.get("id") in self.entries:
                self.entries[campaign["id"]]["seen"] = now
        changed, found_count, lookups = self._prune(now), 0, 0
        for campaign in campaigns:
            if campaign.get("game") or overrides.get(campaign.get("id")) or not _watch_minutes(campaign) or self._known(campaign, now):
                continue
            category, undecided = None, False
            for candidate in guess_candidates(campaign.get("name"), campaign.get("summary"), campaign.get("instructions")):
                if lookups >= max_lookups:
                    undecided = True
                    break
                lookups += 1
                try:
                    found = await asyncio.wait_for(validator(candidate), lookup_timeout)
                except Exception as exc:
                    logger.warning("Category lookup for %r failed (%s), will retry later", candidate, exc or type(exc).__name__, exc_info=True)
                    undecided = True
                    break
                if found and found.get("slug") and _same_title(found.get("name") or candidate, candidate):
                    category = {"name": found.get("name") or candidate, "slug": found["slug"], "source": "guess"}
                    break
            if undecided:
                if lookups >= max_lookups:
                    break
                continue
            self.entries[campaign["id"]] = {"sig": self.signature(campaign), "category": category, "at": now, "seen": now}
            changed = True
            if category is None:
                logger.info("Reward campaign %r: no category could be found, it cannot be farmed (asked again in 6 hours)", campaign.get("name"))
            else:
                found_count += 1
                logger.info("Reward campaign %r: category guessed as %r", campaign.get("name"), category["name"])
            _write_json(self.path, self.entries, "reward category cache")
            changed = False
        if changed:
            _write_json(self.path, self.entries, "reward category cache")
        return found_count


def _same_title(found: str, wanted: str) -> bool:
    return smart_game_match(_fold(found), _fold(wanted))


_NUMBER_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}
_DAYS_RE = re.compile(r"\b(\d{1,2}|" + "|".join(_NUMBER_WORDS) + r")\s+(?:different\s+|separate\s+|consecutive\s+)?days\b", re.I)


def campaign_days(summary: Any) -> Optional[int]:
    """How many days a multi-day campaign runs ("on six different days", "6 days"), None when the text does not say."""
    if not isinstance(summary, str):
        return None
    for match in _DAYS_RE.finditer(summary):
        word = match.group(1).lower()
        days = _NUMBER_WORDS.get(word) or int(word)
        if 2 <= days <= 31:
            return days
    return None


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
            "earned": ledger.is_earned(cid, now),
            "dailyRewardToday": ledger.daily_reward_today(cid, now),
            "daysDone": ledger.days_done(cid, goal) if goal else 0,
            "daysTotal": campaign_days(campaign.get("summary")),
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
           now: Optional[datetime] = None, daily_slot: bool = False, skip: Iterable[str] = ()) -> tuple[Optional[dict], Optional[str]]:
    """The campaign to watch, and the reason a forced one was refused. A forced campaign always wins (the skip list does not
    apply to it). Otherwise the queue (`reward:<id>` entries of priority_games) decides the order: with the daily slot an
    eligible queued campaign goes before the drops until today's goal is done (then drops resume); without it nothing is
    chosen while the engine has drops to farm. Campaigns in `skip` (no streams, stalled) wait their turn."""
    now = now or datetime.now(timezone.utc)
    by_id = {c.get("id"): c for c in viewed}
    if forced_id:
        campaign = by_id.get(forced_id)
        if campaign is None:
            return None, "кампании нет в списке"
        reason = ineligible_reason(campaign, now)
        return (None, reason) if reason else (campaign, None)
    if drops_available and not daily_slot:
        return None, None
    skip = set(skip)
    for entry in priority:
        campaign = by_id.get(reward_id(entry))
        if campaign is not None and campaign.get("id") not in skip and ineligible_reason(campaign, now) is None:
            return campaign, None
    return None, None


def auto_queue_additions(viewed: list[dict], priority: Iterable[str], already: Iterable[str], now: Optional[datetime] = None) -> list[str]:
    """Ids of campaigns the auto-queue appends: farmable (a watch goal and a category), not hidden, ended or earned,
    not queued and never appended before. "Done today" does not matter: it is farmable again tomorrow."""
    now = now or datetime.now(timezone.utc)
    queued = {reward_id(p) for p in priority if is_reward_key(p)} | set(already)
    out = []
    for campaign in viewed:
        if campaign.get("id") in queued:
            continue
        if campaign.get("farmable") and not campaign.get("hidden") and not campaign.get("earned") and not _ended(campaign, now):
            out.append(campaign["id"])
    return out


LOG_KEYS = {"type", "id", "campaignid", "campaign_id", "questid", "quest_id", "rewardcampaignid", "reward_campaign_id", "title", "name", "body"}
ID_KEYS = {"campaignid", "campaign_id", "questid", "quest_id", "rewardcampaignid", "reward_campaign_id"}
TEXT_KEYS = {"title", "name", "body"}
LOG_VALUE_LIMIT = 120
_URL_LIKE = re.compile(r"https?:|www\.|://", re.I)
# Words a reward or campaign name must not consist of alone: they appear in many campaigns
GENERIC_WORDS = {"badge", "badges", "emote", "emotes", "chest", "chests", "reward", "rewards", "drop", "drops", "twitch", "bling",
                 "celebration", "campaign", "launch", "event", "quest", "quests", "gift", "pack", "bundle", "skin", "skins"}
MIN_NAME_LENGTH = 6


def is_earned_type(value: Any) -> bool:
    """True for a notification type that says a reward was earned (the emote one, or any quest type with "earned")."""
    return isinstance(value, str) and (value == "quests_viewer_reward_campaign_earned_emote" or ("quest" in value and "earned" in value))


def notification_fields(notification: Any, limit: int = LOG_VALUE_LIMIT) -> dict[str, str]:
    """The allowlisted top-level text fields of a notification (type, id, campaign/quest ids, title, name, body), cut to
    `limit` characters; a value that looks like a URL is never included."""
    if not isinstance(notification, dict):
        return {}
    return {k: v[:limit] for k, v in notification.items()
            if isinstance(k, str) and k.lower() in LOG_KEYS and isinstance(v, str) and not _URL_LIKE.search(v)}


def _matchable(name: Any) -> bool:
    if not isinstance(name, str) or len(name.strip()) < MIN_NAME_LENGTH:
        return False
    return not all(word in GENERIC_WORDS for word in re.findall(r"\w+", name.lower()))


def final_reward_names(campaign: dict) -> list[str]:
    """Names of the rewards of the campaign's final group: the last of several groups. A single group of a multi-day campaign
    (its rewards are probably the daily ones) has no identifiable final reward; a one-day campaign's only group is final."""
    groups = [g for g in campaign.get("groups") or [] if isinstance(g, dict)]
    if not groups:
        return []
    if len(groups) == 1 and (campaign_days(campaign.get("summary")) or 1) > 1:
        return []
    return [r["name"] for r in groups[-1].get("rewards") or [] if isinstance(r, dict) and isinstance(r.get("name"), str)]


def match_earned(notification: Any, campaigns: Iterable[dict]) -> Optional[str]:
    """The id of the campaign an "earned" notification closes, or None. Only an explicit campaign id (in an id field or
    inside the text) or the name of a reward of the campaign's FINAL group (6+ characters, not made of generic words, as a
    whole phrase, naming exactly one campaign) closes it: a daily badge or a campaign name never does."""
    fields = notification_fields(notification, limit=500)
    if not fields:
        return None
    campaigns = [c for c in campaigns if isinstance(c, dict) and isinstance(c.get("id"), str)]
    id_values = [v.strip().lower() for k, v in fields.items() if k.lower() in ID_KEYS]
    texts = [v.lower() for k, v in fields.items() if k.lower() in TEXT_KEYS]
    for campaign in campaigns:
        cid = campaign["id"].lower()
        if cid in id_values or (len(cid) >= 8 and any(cid in t for t in texts)):
            return campaign["id"]
    hits = set()
    for campaign in campaigns:
        for name in filter(_matchable, final_reward_names(campaign)):
            if any(re.search(rf"(?<!\w){re.escape(name.strip().lower())}(?!\w)", t) for t in texts):
                hits.add(campaign["id"])
    return hits.pop() if len(hits) == 1 else None


def game_entries(priority: Iterable[Any]) -> list[str]:
    """The queue entries that are games (without the `reward:<id>` ones)."""
    return [p for p in priority if isinstance(p, str) and not is_reward_key(p)]


def daily_goal_text(campaign: str, days_done: int, days_total: Optional[int]) -> str:
    """«<campaign>: дневная цель выполнена (день N из M)»; without a known total: «(день N)»."""
    tail = f"день {days_done} из {days_total}" if days_total else f"день {days_done}"
    return f"{campaign}: дневная цель выполнена ({tail})"


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
