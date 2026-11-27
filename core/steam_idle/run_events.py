"""Announces the farm's milestones through the app's notifier (Windows toast, plus the Telegram/Discord copies).

`notify(kind, key, title, message)` is the notifier's own call, which shows each (kind, key) once and remembers it
across restarts; this class only decides what happened, and keeps one in-memory note per run so a step loop does not
ask again every tick. Everything is gated by the `steam_idle_notify` setting.
"""
import logging
from collections.abc import Callable

from .drops_daily import DailyDrops

logger = logging.getLogger(__name__)

NOTIFY_KEY = "steam_idle_notify"
KIND_ALL = "steam_idle_all_collected"
KIND_ERROR = "steam_idle_error"
KIND_NO_HOURS = "steam_idle_no_hours"
KIND_DAILY = "steam_idle_daily"
_STOPPED = frozenset({"needs_login", "stopped"})
_ERROR_TEXT = {
    "signed_out": "Вход в Steam Community слетел. Войдите заново во вкладке Steam IDLE.",
    "account_changed": "В клиенте Steam сменился аккаунт.",
    "account_mismatch": "Вход в Steam Community относится к другому аккаунту.",
    "internal_error": "Внутренняя ошибка, подробности в журнале.",
}


class RunEvents:
    def __init__(self, notify: Callable[[str, str, str, str], object], enabled: Callable[[], bool], daily: DailyDrops):
        self._notify, self._enabled, self._daily = notify, enabled, daily
        self._run = ""
        self._sent: set[str] = set()

    def begin_run(self, run_key: str) -> None:
        self._run, self._sent = run_key, set()

    def observe(self, status: dict, run_error: str | None, account: int) -> None:
        """After a farm step: announce what `status` (the farm's payload) shows. `run_error` is the controller's note."""
        state = status["state"]
        if state == "done" and (status["done"] or status["droppedThisRun"]):
            self._send(KIND_ALL, self._run, "Steam IDLE: все карточки собраны",
                       f"Игр: {len(status['done'])}, карточек за запуск: {status['droppedThisRun']}")
        code = status.get("lastError") or run_error
        if state in _STOPPED and code:
            self._send(KIND_ERROR, f"{self._run}:{code}", "Steam IDLE: фарм остановлен",
                       _ERROR_TEXT.get(code, f"Фарм остановлен из-за ошибки: {code}"))
        if status.get("batchDisabled") == "no_hours":
            self._send(KIND_NO_HOURS, self._run, "Steam IDLE: фаза набора часов отключена",
                       "Ни одна игра не набирала время, дальше фарм идёт по одной игре.")
        self.daily_summary(account)

    def daily_summary(self, account: int) -> None:
        """Yesterday's drops, once per account and date; asked before every step, so the first one after midnight wins."""
        previous = self._daily.previous_day(account)
        if previous is not None:
            key, date, count = previous
            self._send(KIND_DAILY, f"{key}:{date}", f"Steam IDLE за {date}", f"Выпало карточек: {count}")

    def _send(self, kind: str, key: str, title: str, message: str) -> None:
        token = f"{kind}:{key}"
        if token in self._sent or not self._enabled():
            return
        try:
            self._notify(kind, key, title, message)
        except Exception:
            logger.error("steam idle notification %s failed", kind, exc_info=True)
        self._sent.add(token)
