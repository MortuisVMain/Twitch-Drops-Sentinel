"""Cumulative Steam IDLE statistics: farm time, cards and achievements per game and per local day, per Steam account.

One JSON file next to the other Steam IDLE files, keyed by the same account hash as the daily drop counter (never the
account id). Per account: lifetime totals per game (`games`), the wall-clock farm time of the account (`farmSeconds`),
per-day totals (`days`) and per-day numbers of each game (`gameDays`), the last two kept for a year.

Time is credited between two ticks to the games held at the earlier tick; a gap over five minutes (the computer slept)
is dropped. The account's day gets those seconds once however many games were held, each game gets them in full, so
per-game times can add up to more than the day. The file is rewritten at most once a minute, and at once when the last
game is released, on a reset and on shutdown; the slow write runs outside the lock.
"""
import datetime
import json
import logging
import threading
from collections.abc import Callable, Mapping
from pathlib import Path

from atomic_json import atomic_write_json

from .drops_daily import _key as account_key

logger = logging.getLogger(__name__)

STATS_FILE_NAME = "steam_idle_stats.json"
MAX_GAP_SECONDS = 300.0
FLUSH_SECONDS = 60.0
KEEP_DAYS = 365
WEEKS = 12
_PERIOD_DAYS = {"7": 7, "30": 30}
_GAME_NUMBERS = ("farmSeconds", "cardsDropped", "achievements", "firstAt", "lastAt")
_DAY_NUMBERS = ("farmSeconds", "cards", "achievements")
_GAME_DAY_NUMBERS = ("farmSeconds", "cardsDropped", "achievements")


def _number(value: object) -> bool:
    return type(value) in (int, float) and value >= 0


def _numbers(row: object, fields: tuple) -> bool:
    return isinstance(row, dict) and all(_number(row.get(field)) for field in fields)


def _app_id(key: object) -> bool:
    return isinstance(key, str) and key.isdigit()


def _day(key: object) -> bool:
    try:
        datetime.date.fromisoformat(key)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return True


def _name(value: object, app_id: int) -> str:
    return value if isinstance(value, str) and value else str(app_id)


def _blank_account() -> dict:
    return {"games": {}, "days": {}, "gameDays": {}, "farmSeconds": 0.0}


def _salvage_account(label: str, raw: object) -> "dict | None":
    """The valid part of one stored account; every dropped entry is logged. None when the account is not a mapping."""
    if not isinstance(raw, dict):
        logger.warning("statistics: account %s is malformed and is dropped", label)
        return None
    account = _blank_account()
    games, days, game_days = raw.get("games"), raw.get("days"), raw.get("gameDays", {})
    for app_id, game in (games if isinstance(games, dict) else {}).items():
        if not _app_id(app_id) or not _numbers(game, _GAME_NUMBERS):
            logger.warning("statistics: game %r of account %s is malformed and is dropped", app_id, label)
            continue
        account["games"][int(app_id)] = {"name": _name(game.get("name"), int(app_id)), **{f: game[f] for f in _GAME_NUMBERS}}
    for day, row in (days if isinstance(days, dict) else {}).items():
        if not _day(day) or not _numbers(row, _DAY_NUMBERS):
            logger.warning("statistics: day %r of account %s is malformed and is dropped", day, label)
            continue
        account["days"][day] = {f: row[f] for f in _DAY_NUMBERS}
    for day, rows in (game_days if isinstance(game_days, dict) else {}).items():
        if not _day(day) or not isinstance(rows, dict):
            logger.warning("statistics: per-game day %r of account %s is malformed and is dropped", day, label)
            continue
        good = {int(app_id): {f: row[f] for f in _GAME_DAY_NUMBERS} for app_id, row in rows.items()
                if _app_id(app_id) and _numbers(row, _GAME_DAY_NUMBERS)}
        if len(good) != len(rows):
            logger.warning("statistics: %d malformed game entries of day %s of account %s are dropped", len(rows) - len(good), day, label)
        account["gameDays"][day] = good
    stored = raw.get("farmSeconds")
    account["farmSeconds"] = stored if _number(stored) else sum(row["farmSeconds"] for row in account["days"].values())
    return account


def _salvage(data: object) -> "dict[str, dict]":
    """The accounts of a stats file; ValueError when the file as a whole is not one this module wrote."""
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("accounts"), dict):
        raise ValueError("not a statistics file")
    accounts = {}
    for key, raw in data["accounts"].items():
        if (account := _salvage_account(str(key), raw)) is not None:
            accounts[str(key)] = account
    return accounts


class StatsRecorder:
    def __init__(self, path: Path | None, clock: Callable[[], float], wall_clock: Callable[[], float]):
        """`path` None keeps the numbers in memory only; `clock` is monotonic, `wall_clock` gives local dates."""
        self._path, self._clock, self._wall = path, clock, wall_clock
        self._lock = threading.RLock()  # the numbers; never held while the file is written
        self._write_lock = threading.Lock()  # one file write at a time
        self._last: "tuple[int, dict[int, str], float] | None" = None  # account, games held, monotonic time
        self._dirty = False
        self._last_flush = clock()
        self._seq = self._written_seq = 0
        self._accounts = self._load()

    # storage
    def _load(self) -> "dict[str, dict]":
        path = self._path
        if path is None or not path.is_file():
            return {}
        try:
            accounts = _salvage(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            logger.warning("statistics file %s is unreadable and is set aside; counting starts empty", path.name, exc_info=True)
            self._set_aside(path)
            return {}
        for account in accounts.values():
            self._prune(account)
        return accounts

    def _set_aside(self, path: Path) -> None:
        """Rename the unreadable file to .bad-<time>, never onto an earlier backup."""
        stamp = datetime.datetime.fromtimestamp(self._wall()).strftime("%Y%m%d-%H%M%S")
        target, number = path.with_name(f"{path.name}.bad-{stamp}"), 1
        while target.exists():
            number += 1
            target = path.with_name(f"{path.name}.bad-{stamp}-{number}")
        try:
            path.replace(target)
        except OSError:
            logger.error("statistics file %s could not be set aside", path.name, exc_info=True)

    def _prune(self, account: dict) -> None:
        oldest = (self._today() - datetime.timedelta(days=KEEP_DAYS - 1)).isoformat()
        for table in (account["days"], account["gameDays"]):
            for day in [day for day in table if day < oldest]:
                del table[day]

    def _snapshot(self) -> dict:
        """Lock held: a copy of everything, in the stored shape."""
        return {"version": 1, "accounts": {key: {
            "farmSeconds": account["farmSeconds"],
            "games": {str(app_id): dict(game) for app_id, game in account["games"].items()},
            "days": {day: dict(row) for day, row in account["days"].items()},
            "gameDays": {day: {str(app_id): dict(row) for app_id, row in rows.items()} for day, rows in account["gameDays"].items()},
        } for key, account in self._accounts.items()}}

    def flush(self, force: bool = False) -> None:
        """Write the file when something changed and a minute passed since the last write (or `force`)."""
        with self._lock:
            if self._path is None or not self._dirty or (not force and self._clock() - self._last_flush < FLUSH_SECONDS):
                return
            for account in self._accounts.values():
                self._prune(account)
            data, self._seq = self._snapshot(), self._seq + 1
            seq, self._dirty, self._last_flush = self._seq, False, self._clock()
        with self._write_lock:
            if seq < self._written_seq:  # a newer snapshot was written while this one waited
                return
            try:
                atomic_write_json(self._path, data)
            except OSError:
                logger.error("statistics file %s could not be written", self._path.name, exc_info=True)
                with self._lock:
                    self._dirty = True
                return
            self._written_seq = seq

    # recording
    def _today(self) -> datetime.date:
        return datetime.datetime.fromtimestamp(self._wall()).date()

    def _account(self, account: int) -> dict:
        return self._accounts.setdefault(account_key(account), _blank_account())

    def _game(self, account: int, app_id: int, name: "str | None") -> dict:
        now = int(self._wall())
        game = self._account(account)["games"].setdefault(
            app_id, {"name": _name(name, app_id), "farmSeconds": 0.0, "cardsDropped": 0, "achievements": 0, "firstAt": now, "lastAt": now})
        if isinstance(name, str) and name:
            game["name"] = name
        game["lastAt"] = now
        return game

    def _day(self, account: int) -> dict:
        return self._account(account)["days"].setdefault(self._today().isoformat(), dict.fromkeys(_DAY_NUMBERS, 0))

    def _game_day(self, account: int, app_id: int) -> dict:
        rows = self._account(account)["gameDays"].setdefault(self._today().isoformat(), {})
        return rows.setdefault(app_id, dict.fromkeys(_GAME_DAY_NUMBERS, 0))

    def restart_clock(self) -> None:
        """A new run begins: whatever was held before is forgotten, so the time in between is never credited."""
        with self._lock:
            self._last = None

    def tick(self, account: int, held: Mapping[int, str]) -> None:
        """Called whenever the farm loop turns, with the games held right now ({app id: name})."""
        with self._lock:
            now, last = self._clock(), self._last
            if last is not None and last[1] and 0 < now - last[2] <= MAX_GAP_SECONDS:
                seconds = round(now - last[2], 3)
                owner = self._account(last[0])
                owner["farmSeconds"] = round(owner["farmSeconds"] + seconds, 3)
                day = self._day(last[0])
                day["farmSeconds"] = round(day["farmSeconds"] + seconds, 3)  # once, however many games were held
                for app_id, name in last[1].items():
                    game = self._game(last[0], app_id, name)
                    game["farmSeconds"] = round(game["farmSeconds"] + seconds, 3)
                    row = self._game_day(last[0], app_id)
                    row["farmSeconds"] = round(row["farmSeconds"] + seconds, 3)
                self._dirty = True
            self._last = (account, dict(held), now)
            force = bool(last and last[1] and not held)
        self.flush(force=force)

    def add_cards(self, account: int, app_id: int, name: "str | None", count: int) -> None:
        self._add(account, app_id, name, count, "cardsDropped", "cards")

    def add_achievements(self, account: int, app_id: int, name: "str | None", count: int) -> None:
        self._add(account, app_id, name, count, "achievements", "achievements")

    def _add(self, account: int, app_id: int, name: "str | None", count: int, game_field: str, day_field: str) -> None:
        if count <= 0:
            return
        with self._lock:
            self._game(account, app_id, name)[game_field] += count
            self._game_day(account, app_id)[game_field] += count
            self._day(account)[day_field] += count
            self._dirty = True

    def reset(self, account: int) -> None:
        """Forget one account's numbers, written at once."""
        with self._lock:
            self._accounts.pop(account_key(account), None)
            self._dirty = True
        self.flush(force=True)

    # reading
    def days(self, account: int) -> dict:
        with self._lock:
            return {day: dict(row) for day, row in self._account(account)["days"].items()}

    def report(self, account: int, period: str) -> dict:
        """totals, the last twelve Monday-based weeks and the game rows for `period` ("7", "30" or "all").

        The tiles use the account's wall-clock farm time; a game row of a period holds only that period's numbers
        (all time: the lifetime numbers), so cards and achievements of the rows add up to the tiles.
        """
        if period != "all" and period not in _PERIOD_DAYS:
            raise ValueError(f"unknown period {period!r}")
        with self._lock:
            data = self._accounts.get(account_key(account)) or _blank_account()
            today = self._today()
            if period == "all":
                games = [self._row(app_id, game, game) for app_id, game in data["games"].items()]
                totals = {"farmSeconds": data["farmSeconds"], "cards": sum(g["cardsDropped"] for g in games),
                          "achievements": sum(g["achievements"] for g in games)}
            else:
                first = (today - datetime.timedelta(days=_PERIOD_DAYS[period] - 1)).isoformat()
                totals = {f: sum(row[f] for day, row in data["days"].items() if day >= first) for f in _DAY_NUMBERS}
                games = self._period_rows(data, first)
            games.sort(key=lambda g: g["lastAt"], reverse=True)
            return {"period": period,
                    "totals": {"farmSeconds": round(totals["farmSeconds"]), "games": len(games), "cards": totals["cards"],
                               "achievements": totals["achievements"]},
                    "weeks": self._weeks(data["days"], today), "games": games}

    def _period_rows(self, data: dict, first: str) -> "list[dict]":
        sums: dict[int, dict] = {}
        for day, rows in data["gameDays"].items():
            if day < first:
                continue
            for app_id, row in rows.items():
                into = sums.setdefault(app_id, dict.fromkeys(_GAME_DAY_NUMBERS, 0))
                for field in _GAME_DAY_NUMBERS:
                    into[field] += row[field]
        lifetime = data["games"]
        return [self._row(app_id, lifetime.get(app_id, {"name": str(app_id), "firstAt": 0, "lastAt": 0}), row)
                for app_id, row in sums.items() if any(row[f] for f in _GAME_DAY_NUMBERS)]

    @staticmethod
    def _row(app_id: int, identity: dict, numbers: dict) -> dict:
        return {"appId": app_id, "name": identity["name"], "farmSeconds": round(numbers["farmSeconds"]),
                "cardsDropped": numbers["cardsDropped"], "achievements": numbers["achievements"],
                "firstAt": int(identity["firstAt"]), "lastAt": int(identity["lastAt"])}

    @staticmethod
    def _weeks(days: dict, today: datetime.date) -> "list[dict]":
        monday = today - datetime.timedelta(days=today.weekday())
        weeks = [{"weekStart": (monday - datetime.timedelta(weeks=i)).isoformat(), "farmSeconds": 0, "cards": 0, "achievements": 0}
                 for i in range(WEEKS - 1, -1, -1)]
        starts = [week["weekStart"] for week in weeks]
        for day, row in days.items():
            if day < starts[0] or day > today.isoformat():
                continue
            week = weeks[max(i for i, start in enumerate(starts) if start <= day)]
            for field in _DAY_NUMBERS:
                week[field] += row[field]
        for week in weeks:
            week["farmSeconds"] = round(week["farmSeconds"])
        return weeks
