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
QUEUED_LIMIT = 500  # queue entries ever seen are remembered (so the auto-queue never re-adds a removed one)
LOCAL_CAP_MINUTES = 90  # safety: a stuck Twitch counter cannot hold a campaign longer than this much local watch time a day
SLOT_CAP_MINUTES = 60  # the daily slot never takes more than an hour in total
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


def _twitch_record(value: Any) -> Optional[dict]:
    if not isinstance(value, dict):
        return None
    minutes, required = value.get("minutes"), value.get("required")
    if isinstance(minutes, bool) or not isinstance(minutes, (int, float)) or not math.isfinite(minutes) or minutes < 0:
        return None
    required = int(required) if isinstance(required, (int, float)) and not isinstance(required, bool) and math.isfinite(required) and required > 0 else 0
    return {"minutes": int(minutes), "required": required, "done": value.get("done") is True}


def _name_tokens(name: Any) -> set[str]:
    if not isinstance(name, str):
        return set()
    return {t for t in re.findall(r"[a-z0-9\u0430-\u044f]+", name.lower()) if len(t) >= 2 and t not in GENERIC_WORDS}


def names_similar(drop_name: Any, names: Iterable[Any]) -> bool:
    """True when a Twitch drop's name shares at least two meaningful words with one of the reward names ("GTA DVD Drops" ~
    "GTA DVD Chest"); generic words (drop, chest, badge...) do not count, and a single shared word only when both are that word."""
    drop = _name_tokens(drop_name)
    for name in names:
        other = _name_tokens(name)
        common = drop & other
        if len(common) >= 2 or (common and common == drop == other):
            return True
    return False


class DropLink:
    """The Twitch drop whose progress counts for the reward campaign being watched. A drop whose name resembles a reward of the
    campaign, or a sitewide "special" drop, is linked; the link is sticky (other drops' counters are ignored), a resembling drop
    replaces a merely special one, the minutes never go down, and a new UTC day starts over."""

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.drop_id: Optional[str] = None
        self.name: Optional[str] = None
        self.minutes = 0
        self.required = 0
        self.day: Optional[str] = None
        self._preferred = False

    def observe(self, drop_id: str, name: str, minutes: int, required: int, *, special: bool, similar: bool, day: str) -> Optional[str]:
        """None: not this campaign's drop. "linked": the linked drop reported. "new": this drop became the link."""
        if self.drop_id is not None and self.day != day:
            self.reset()
        if drop_id == self.drop_id:
            self.minutes = max(self.minutes, minutes)
            self.required = required or self.required
            return "linked"
        if not (similar or special):
            return None
        if self.drop_id is not None and not (similar and not self._preferred):
            return None
        self.drop_id, self.name, self.minutes, self.required, self.day, self._preferred = drop_id, name, max(0, minutes), max(0, required), day, similar
        return "new"


def local_cap(goal: int) -> int:
    """Local watch minutes after which a campaign is given up for the day even if Twitch's counter did not finish."""
    return max(LOCAL_CAP_MINUTES, goal + 30)


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
        twitch_raw = raw.get("twitch_progress") if isinstance(raw.get("twitch_progress"), dict) else {}
        self.twitch_progress: dict[str, dict[str, dict]] = {}
        for day, per_campaign in twitch_raw.items():
            if isinstance(per_campaign, dict):
                clean = {k: r for k, r in ((k, _twitch_record(v)) for k, v in per_campaign.items()) if r is not None}
                if clean:
                    self.twitch_progress[day] = clean
        slot = raw.get("slot_seconds") if isinstance(raw.get("slot_seconds"), dict) else {}
        self.slot_seconds: dict[str, float] = {d: v for d, v in ((d, _seconds(v)) for d, v in slot.items()) if v is not None}
        queued = raw.get("queued_ids")
        self.queued: list[str] = [q for q in queued if isinstance(q, str)][-QUEUED_LIMIT:] if isinstance(queued, list) else []
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
        for day in [d for d in self.slot_seconds if d < oldest]:
            del self.slot_seconds[day]
        for day in [d for d in self.twitch_progress if d < oldest]:
            del self.twitch_progress[day]
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

    def set_twitch_progress(self, campaign_id: str, minutes: Any, required: Any, done: bool = False,
                            now: Optional[datetime] = None, replace: bool = False) -> None:
        """What Twitch itself reports for the drop being progressed for this campaign today: minutes, required minutes and
        whether it is finished. Monotonic within the day unless `replace` (a different drop was linked)."""
        record = _twitch_record({"minutes": minutes, "required": required, "done": done})
        if record is None:
            return
        now = now or datetime.now(timezone.utc)
        today = self.twitch_progress.setdefault(_utc_day(now), {})
        old = today.get(campaign_id)
        if old and not replace:
            record["minutes"] = max(record["minutes"], old["minutes"])
            record["done"] = record["done"] or old["done"]
            record["required"] = record["required"] or old["required"]
        changed = old != record
        today[campaign_id] = record
        self._prune(now)
        if changed and (old is None or old["minutes"] != record["minutes"] or old["done"] != record["done"]):
            self.save()

    def twitch_today(self, campaign_id: str, now: Optional[datetime] = None) -> Optional[dict]:
        record = self.twitch_progress.get(_utc_day(now or datetime.now(timezone.utc)), {}).get(campaign_id)
        return dict(record) if record else None

    def days_done(self, campaign_id: str, goal: int) -> int:
        """In how many (kept) UTC days the watch goal of the campaign was reached: Twitch's word where it reported progress
        that day, otherwise the local count."""
        if not goal:
            return 0
        count = 0
        for day in set(self.days) | set(self.twitch_progress):
            record = self.twitch_progress.get(day, {}).get(campaign_id)
            if record:
                count += record["done"] or record["minutes"] >= (record["required"] or goal)
            else:
                count += int(self.days.get(day, {}).get(campaign_id, 0.0) // 60) >= goal
        return count

    def add_slot_seconds(self, seconds: float, now: Optional[datetime] = None) -> None:
        """Time watched today in the daily slot (before drops), all campaigns together; counts toward the day's slot budget."""
        now = now or datetime.now(timezone.utc)
        seconds = seconds if isinstance(seconds, (int, float)) and math.isfinite(seconds) else 0.0
        day = _utc_day(now)
        before = int(self.slot_seconds.get(day, 0.0) // 60)
        self.slot_seconds[day] = self.slot_seconds.get(day, 0.0) + max(0.0, seconds)
        self._prune(now)
        if int(self.slot_seconds[day] // 60) != before:
            self.save()

    def slot_minutes_today(self, now: Optional[datetime] = None) -> int:
        return int(self.slot_seconds.get(_utc_day(now or datetime.now(timezone.utc)), 0.0) // 60)

    def mark_queued(self, campaign_ids: Iterable[str]) -> bool:
        """Remembers every reward campaign that was ever in the queue (appended by the auto-queue or by the user), so one the
        user removes is not added a second time. True (and written) only when something was new."""
        new = [cid for cid in dict.fromkeys(campaign_ids) if cid not in self.queued]
        if not new:
            return False
        self.queued.extend(new)
        del self.queued[:-QUEUED_LIMIT]
        self.save()
        return True

    def is_earned(self, campaign_id: str, now: Optional[datetime] = None) -> bool:
        entry = self.earned.get(campaign_id)
        return entry is not None and not self._earned_over(entry, (now or datetime.now(timezone.utc)).astimezone(timezone.utc))

    def save(self) -> None:
        _write_json(self.path, {"days": self.days, "earned": self.earned, "daily_rewards": self.daily_rewards,
                                  "slot_seconds": self.slot_seconds, "twitch_progress": self.twitch_progress, "queued_ids": self.queued}, "reward watch ledger")


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
_NUMBER = r"(\d{1,2}|" + "|".join(_NUMBER_WORDS) + r")"
_DIFFERENT_DAYS = re.compile(rf"\b{_NUMBER}\s+(?:different|separate|distinct)\s+days\b", re.I)
_WATCH_ON_DAYS = re.compile(rf"\b(?:on|for)\s+{_NUMBER}\s+(?:consecutive\s+)?days\b", re.I)


def _day_count(word: str) -> Optional[int]:
    days = _NUMBER_WORDS.get(word.lower()) or (int(word) if word.isdigit() else 0)
    return days if 2 <= days <= 31 else None


def campaign_days(summary: Any) -> Optional[int]:
    """How many days a multi-day campaign runs, only from a phrase about watching on days: "on six different days" /
    "N different days", or "on/for N days" in a sentence that talks about watching. "within 7 days of launch" or "available
    for 30 days" say nothing about it. None when the text does not say."""
    if not isinstance(summary, str):
        return None
    for sentence in re.split(r"(?<=[.!?])\s+|\n", summary):
        for pattern, needs_watch in ((_DIFFERENT_DAYS, False), (_WATCH_ON_DAYS, True)):
            if needs_watch and not re.search(r"\b(?:watch|watching|view|viewing)\b", sentence, re.I):
                continue
            for match in pattern.finditer(sentence):
                days = _day_count(match.group(1))
                if days:
                    return days
    return None


def _days_exhausted(campaign: dict) -> bool:
    total, done = campaign.get("daysTotal"), campaign.get("daysDone")
    return isinstance(total, int) and isinstance(done, int) and not isinstance(total, bool) and total > 0 and done >= total


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
        local = ledger.minutes_today(cid, now)
        twitch = ledger.twitch_today(cid, now)
        done, capped = False, False
        if goal and twitch:
            twitch_done = twitch["done"] or twitch["minutes"] >= (twitch["required"] or goal)
            capped = not twitch_done and local >= local_cap(goal)
            done = twitch_done or capped
        elif goal:
            done = local >= goal
        watched = twitch["minutes"] if twitch else local
        out.append({
            **campaign,
            "groups": campaign.get("groups") or [],
            "sitewide": campaign.get("sitewide") is True,
            "category": category,
            "farmable": bool(goal) and category is not None,
            "watchedToday": watched,
            "dailyGoal": goal,
            "doneToday": done,
            "cappedToday": capped,
            "twitchMinutes": twitch["minutes"] if twitch else None,
            "progressSource": "twitch" if twitch else "local",
            "earned": ledger.is_earned(cid, now),
            "dailyRewardToday": ledger.daily_reward_today(cid, now),
            "daysDone": ledger.days_done(cid, goal) if goal else 0,
            "daysTotal": campaign_days(campaign.get("summary")),
            "hidden": cid in hidden,
        })
    return out


def ineligible_reason(campaign: dict, now: datetime, ignore_done: bool = False) -> Optional[str]:
    """Why a viewed campaign must not be farmed now (None when it may). `ignore_done`: not "the day's goal is done"."""
    if campaign.get("hidden"):
        return "кампания скрыта"
    if _ended(campaign, now):
        return "кампания закончилась"
    if not campaign.get("farmable"):
        return "для неё нет времени просмотра или категории"
    if campaign.get("earned"):
        return "награда уже получена"
    if _days_exhausted(campaign):
        return "все дни выполнены"
    if campaign.get("doneToday") and not ignore_done:
        return "дневная цель выполнена"
    return None


def choose(viewed: list[dict], *, forced_id: Optional[str], priority: Iterable[str], drops_available: bool,
           now: Optional[datetime] = None, daily_slot: bool = False, skip: Iterable[str] = (), forced_game: bool = False,
           slot_exhausted: bool = False) -> tuple[Optional[dict], Optional[str]]:
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
    if forced_game:
        return None, None  # the user forced a game: no reward slot and no queue pick over it
    if drops_available and not (daily_slot and not slot_exhausted):
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
        if (campaign.get("farmable") and not campaign.get("hidden") and not campaign.get("earned") and not _ended(campaign, now)
                and not _days_exhausted(campaign)):
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


def slot_budget(viewed: list[dict], priority: Iterable[str], now: Optional[datetime] = None) -> int:
    """Minutes the daily slot may take in total today: the largest daily goal among the queued campaigns that can still be
    farmed (a campaign done today still counts, so the budget stays the same through the day), at most an hour. 0 without any."""
    now = now or datetime.now(timezone.utc)
    queued = {reward_id(p) for p in priority if is_reward_key(p)}
    goals = [c["dailyGoal"] for c in viewed
             if c.get("id") in queued and c.get("farmable") and not c.get("hidden") and not c.get("earned") and not _ended(c, now)
             and not _days_exhausted(c) and isinstance(c.get("dailyGoal"), int) and c["dailyGoal"] > 0]
    return min(max(goals), SLOT_CAP_MINUTES) if goals else 0


def final_reward_names(campaign: dict) -> list[str]:
    """Names of the rewards of the campaign's final group: the last of several groups. A single group of a multi-day campaign
    (its rewards are probably the daily ones) has no identifiable final reward; a one-day campaign's only group is final."""
    groups = [g for g in campaign.get("groups") or [] if isinstance(g, dict)]
    if not groups:
        return []
    if len(groups) == 1 and (campaign_days(campaign.get("summary")) or 1) > 1:
        return []
    return [r["name"] for r in groups[-1].get("rewards") or [] if isinstance(r, dict) and isinstance(r.get("name"), str)]


def _mentions(notification: Any, campaigns: Iterable[dict]) -> tuple[Optional[str], set[str]]:
    """(the first campaign whose id the notification states, the campaigns whose final reward it names)."""
    fields = notification_fields(notification, limit=500)
    if not fields:
        return None, set()
    campaigns = [c for c in campaigns if isinstance(c, dict) and isinstance(c.get("id"), str)]
    id_values = [v.strip().lower() for k, v in fields.items() if k.lower() in ID_KEYS]
    texts = [v.lower() for k, v in fields.items() if k.lower() in TEXT_KEYS]
    for campaign in campaigns:
        cid = campaign["id"].lower()
        if cid in id_values or (len(cid) >= 8 and any(cid in t for t in texts)):
            return campaign["id"], set()
    hits = set()
    for campaign in campaigns:
        for name in filter(_matchable, final_reward_names(campaign)):
            if any(re.search(rf"(?<!\w){re.escape(name.strip().lower())}(?!\w)", t) for t in texts):
                hits.add(campaign["id"])
    return None, hits


def match_earned(notification: Any, campaigns: Iterable[dict]) -> Optional[str]:
    """The id of the campaign an "earned" notification closes, or None. Only an explicit campaign id (in an id field or
    inside the text) or the name of a reward of the campaign's FINAL group (6+ characters, not made of generic words, as a
    whole phrase, naming exactly one campaign) closes it: a daily badge or a campaign name never does."""
    by_id, hits = _mentions(notification, campaigns)
    if by_id is not None:
        return by_id
    return next(iter(hits)) if len(hits) == 1 else None


def mentions_other_campaign(notification: Any, target_id: str, campaigns: Iterable[dict]) -> bool:
    """True when the notification states the id of another known campaign or names a final reward of another one (even when
    several share the name): then it is not the watched campaign's daily reward."""
    by_id, hits = _mentions(notification, [c for c in campaigns if isinstance(c, dict) and c.get("id") != target_id])
    return by_id is not None or bool(hits)


def game_entries(priority: Iterable[Any]) -> list[str]:
    """The queue entries that are games (without the `reward:<id>` ones)."""
    return [p for p in priority if isinstance(p, str) and not is_reward_key(p)]


def daily_goal_text(campaign: str, days_done: int, days_total: Optional[int]) -> str:
    """«<campaign>: дневная цель выполнена (день N из M)»; without a known total: «(день N)»."""
    tail = f"день {days_done} из {days_total}" if days_total else f"день {days_done}"
    return f"{campaign}: дневная цель выполнена ({tail})"


def status_line(channel: str, category: str, campaign: str, minutes: int, goal: int, source: Optional[str] = None) -> str:
    suffix = " (Twitch)" if source == "twitch" else ""
    return f"[НАГРАДА] Смотрим {channel} ({category}) для «{campaign}»: {minutes}/{goal} мин сегодня{suffix}"


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
