"""Health checks behind GET /api/v1/health, and the whitelist of one-click fixes behind POST /api/v1/health/fix.

Every check returns rows {id, area, status: ok|warn|fail, title, detail, advice, fix?}. The checks are read-only: they sign in nothing,
install nothing, write nothing and open no browser (Twitch sign-in is read from the service's memory, since validating the token could
start a new sign-in; Steam from its cached state; the Windows registry is only read). A row may offer a fix {id, label, confirm?}; the
fix itself runs only through run_fix, from FIXES, and only with the actions the service hands in (FixActions). Texts follow ?lang= (ru by
default, en on request), kept here because the service has no translation table for user-facing texts of this kind.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import sys
import stat as stat_mod
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Awaitable, Callable, NamedTuple, Optional
from urllib.parse import urlsplit

import aiohttp

logger = logging.getLogger("sentinel.health")

AREAS = ("twitch", "steam", "giveaways", "network", "updates", "settings", "system")
RUN_BUDGET_SECONDS = 10.0
NET_PROBE_SECONDS = 5.0
REUSE_SECONDS = 3.0
NET_SLOW_MS = 2000
CODE_LOOP_WINDOW_SECONDS = 600
CODE_LOOP_COUNT = 3
DISK_FAIL_BYTES = 1 * 1024 ** 3
DISK_WARN_BYTES = 5 * 1024 ** 3
LOGS_WARN_BYTES = 200 * 1024 * 1024
LOG_TAIL_BYTES = 512 * 1024
LOG_ERRORS_SHOWN = 5
AUTOSTART_VALUE = "TwitchDropsSentinel"
NET_TARGETS = (
    ("net_twitch", "https://www.twitch.tv", "twitch.tv"),
    ("net_gql", "https://gql.twitch.tv", "gql.twitch.tv"),
    ("net_steam", "https://steamcommunity.com", "steamcommunity.com"),
    ("net_github", "https://api.github.com", "api.github.com"),
)


def _t(lang: str, ru: str, en: str) -> str:
    return en if lang == "en" else ru


def row(check_id: str, area: str, status: str, title: str, detail: str = "", advice: str = "", fix: Optional[dict] = None) -> dict:
    out = {"id": check_id, "area": area, "status": status, "title": title, "detail": sanitize(detail), "advice": advice}
    if fix:
        out["fix"] = fix
    return out


def fix_spec(lang: str, fix_id: str, label: tuple[str, str], confirm: Optional[tuple[str, str]] = None, **extra: Any) -> dict:
    """What a row shows for its fix: id, button label and, for anything that erases, the text naming exactly what is lost."""
    spec: dict[str, Any] = {"id": fix_id, "label": sanitize(_t(lang, *label))}
    if confirm:
        spec["confirm"] = _t(lang, *confirm)
    spec.update(extra)
    return spec


CONFIRM_RELOGIN = ("Вход в Twitch будет сброшен, понадобится ввести новый код", "Twitch sign-in will be reset, you will need to enter a new code")
CONFIRM_SETTINGS = (
    "Текущий config.json сохранится в резервную копию. Затем настройки заменит последняя пригодная резервная копия (она применится после перезапуска, "
    "вместе с ней вернутся входы и данные из копии), а если копий нет, настройки сбросятся к заводским. Всё, что менялось после той копии, пропадёт.",
    "The current config.json is saved to a backup first. Then the settings are replaced by the newest usable backup (applied after a restart, together "
    "with the sign-ins and data stored in it), or reset to factory values if there is no backup. Anything changed after that backup is lost.")
CONFIRM_LOGS = (
    "Будут удалены старые журналы: sentinel_service.log.1, .2 и так далее, а также ClaimOutput_*.log старше 7 дней. Текущий журнал не затрагивается.",
    "Old logs will be deleted: sentinel_service.log.1, .2 and so on, and ClaimOutput_*.log older than 7 days. The current log is not touched.")
ACTIVATE_URI = "https://www.twitch.tv/activate"
_CODE_TEXT = re.compile(r"^[A-Za-z0-9-]{1,32}$")


def activation_uri(raw: Any) -> str:
    """The sign-in page the panel may open: the address from the state when it is https on twitch.tv, otherwise the usual one."""
    text = str(raw or "").strip()
    if not text or any(ch.isspace() or ord(ch) < 32 for ch in text):
        return ACTIVATE_URI
    if "://" not in text:
        text = "https://" + text
    try:
        parts = urlsplit(text)
        host, port = parts.hostname or "", parts.port
    except ValueError:
        return ACTIVATE_URI
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        return ACTIVATE_URI
    return text if host == "twitch.tv" or host.endswith(".twitch.tv") else ACTIVATE_URI


# ---- state the service feeds in from where it happens ----

class CodeTracker:
    """New Twitch sign-in codes with the moment each was first seen: a code that keeps changing means the sign-in restarts."""

    def __init__(self) -> None:
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()  # the sign-in writes from the service loop, the health run reads from its own

    def note(self, code: Any, now: Optional[float] = None) -> None:
        code = str(code)
        stamp = time.time() if now is None else now
        with self._lock:
            self._seen.setdefault(code, stamp)
            for old in [c for c, at in self._seen.items() if stamp - at > 6 * CODE_LOOP_WINDOW_SECONDS]:
                del self._seen[old]

    def recent(self, now: Optional[float] = None, window: float = CODE_LOOP_WINDOW_SECONDS) -> int:
        stamp = time.time() if now is None else now
        with self._lock:
            return sum(1 for at in self._seen.values() if stamp - at <= window)

    def clear(self) -> None:
        with self._lock:
            self._seen.clear()


OAUTH_CODES = CodeTracker()
_settings_error: Optional[str] = None


def note_settings_error(message: Optional[str]) -> None:
    """load_settings reports here: the parse error when config.json fell back to defaults, None when it was read."""
    global _settings_error
    _settings_error = message


def settings_error() -> Optional[str]:
    return _settings_error


@dataclass
class HealthContext:
    project_dir: Path
    log_dir: Path
    bridge: Any
    steam_state: Callable[[], dict]
    giveaways_readiness: Callable[[], Awaitable[dict]]
    giveaways_marker: Callable[[], bool]
    cached_update: Callable[[], Optional[dict]]
    version: str
    lang: str = "ru"
    now: Callable[[], datetime] = datetime.now


# ---- things tests replace ----

def disk_free_bytes(path: Path) -> int:
    return shutil.disk_usage(path).free


def read_autostart() -> tuple[bool, str]:
    """(enabled, command) of the Run value; read only."""
    if sys.platform != "win32":
        return False, ""
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ) as key:
            value, _kind = winreg.QueryValueEx(key, AUTOSTART_VALUE)
            return True, str(value)
    except FileNotFoundError:
        return False, ""


async def _http_probe(url: str, timeout: float) -> int:
    """Milliseconds to any HTTP answer (a 403 from bot protection counts); raises when nothing answers."""
    started = time.perf_counter()

    async def attempt() -> None:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout), trust_env=True) as session:
            try:
                async with session.head(url, allow_redirects=False):
                    pass
            except asyncio.TimeoutError:
                raise  # HEAD already used the whole budget: a GET would only run past the check's own limit
            except aiohttp.ClientError:
                async with session.get(url, allow_redirects=False):
                    pass

    await asyncio.wait_for(attempt(), timeout)  # one deadline for HEAD and GET together
    return int((time.perf_counter() - started) * 1000)


def mask_name(value: Any) -> str:
    """First character and ***; an e-mail keeps its domain (a***@mail.com). Accounts never appear in full in a row."""
    text = str(value or "")
    if not text:
        return ""
    local, at, domain = text.rpartition("@")
    return f"{local[:1]}***@{domain}" if at and local else f"{text[:1]}***"


_SECRET_KEYS = r"access_token|refresh_token|id_token|token|client_secret|password"


def sanitize(text: str) -> str:
    """Profile path, Steam IDs, tokens, auth headers and cookies out of anything shown or copied into a report."""
    home = str(Path.home())
    if home:  # plain, JSON-escaped (doubled backslashes) and forward-slash spellings of the same path
        for spelling in (home.replace("\\", "\\\\"), home.replace("\\", "/"), home):
            text = re.sub(re.escape(spelling), "%USERPROFILE%", text, flags=re.IGNORECASE)
    text = re.sub(r"\b7656\d{13}\b", lambda m: m.group(0)[:4] + "*" * 13, text)
    text = re.sub(r"\b(Authorization|Set-Cookie|Cookie)\s*:\s*[^\r\n]+", r"\1: [REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(r"\bBearer\s+[A-Za-z0-9._~+/=\-]+", "Bearer [REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(r"oauth:[A-Za-z0-9]+", "oauth:[REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(rf'("(?:{_SECRET_KEYS})"\s*:\s*)"(?:[^"\\]|\\.)*"', r'\1"[REDACTED]"', text, flags=re.IGNORECASE)
    text = re.sub(rf"\b({_SECRET_KEYS})\s*:\s*['\"]?[^\s'\",;}}]+", r"\1: [REDACTED]", text, flags=re.IGNORECASE)
    return re.sub(r"""(auth_token|client_secret|token|password)=['"]?[A-Za-z0-9_\-]+['"]?""", r"\1=[REDACTED]", text, flags=re.IGNORECASE)


# ---- twitch ----

async def check_twitch_login(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Вход в Twitch", "Twitch sign-in")
    if ctx.bridge.user_id:
        name = mask_name(ctx.bridge.username or ctx.bridge.user_id)
        return [row("twitch_login", "twitch", "ok", title,
                    t(f"Вход выполнен: {name}. Состояние взято из памяти службы, токен запросом к Twitch не проверялся.",
                      f"Signed in as {name}. Read from the service's memory; the token was not checked with a request to Twitch."))]
    fix = None if ctx.bridge.oauth_code else fix_spec(ctx.lang, "twitch_relogin", ("Войти в Twitch заново", "Sign in to Twitch again"), CONFIRM_RELOGIN)
    return [row("twitch_login", "twitch", "warn", title, t("Вход в Twitch не выполнен.", "Not signed in to Twitch."),
                t("Подождите несколько секунд после запуска. Если не проходит, войдите по коду на панели.",
                  "Wait a few seconds after the start. If it stays, sign in with the code shown on the dashboard."), fix)]


async def check_twitch_code(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Код входа Twitch", "Twitch sign-in code")
    code = ctx.bridge.oauth_code
    if not code:
        return [row("twitch_code", "twitch", "ok", title, t("Ввод кода не требуется.", "No code is waiting."))]
    uri = ctx.bridge.oauth_uri or "twitch.tv/activate"
    extra: dict[str, Any] = {"client": True, "uri": activation_uri(ctx.bridge.oauth_uri)}  # the page opens it through the host and copies the code
    if _CODE_TEXT.match(str(code)):
        extra["code"] = str(code)
    return [row("twitch_code", "twitch", "warn", title, t(f"Служба ждёт ввода кода {code} на странице {uri}.", f"The service waits for code {code} on {uri}."),
                t("Откройте страницу и введите код. Код действует ограниченное время.", "Open the page and enter the code. The code expires after a while."),
                fix_spec(ctx.lang, "twitch_open_code", ("Открыть страницу и скопировать код", "Open the page and copy the code"), **extra))]


async def check_twitch_code_loop(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Код входа не меняется по кругу", "The sign-in code is stable")
    count = OAUTH_CODES.recent()
    if count >= CODE_LOOP_COUNT:
        return [row("twitch_code_loop", "twitch", "fail", t("Код входа меняется по кругу", "The sign-in code keeps changing"),
                    t(f"За последние 10 минут выдано новых кодов: {count}.", f"New codes in the last 10 minutes: {count}."),
                    t("Так бывает, когда служба на медленном ПК перезапускается, не дождавшись ответа. Обновитесь до 4.0.1 или новее, "
                      "введите последний код и отправьте отчёт («Скопировать отчёт»), если не помогло.",
                      "This happens when the service restarts on a slow PC before it answers. Update to 4.0.1 or newer, enter the latest code "
                      "and send the report (Copy report) if it does not help."),
                    fix_spec(ctx.lang, "twitch_relogin", ("Войти в Twitch заново", "Sign in to Twitch again"), CONFIRM_RELOGIN))]
    return [row("twitch_code_loop", "twitch", "ok", title, t(f"Новых кодов за 10 минут: {count}.", f"New codes in 10 minutes: {count}."))]


# ---- steam ----

async def check_steam(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    state = await asyncio.to_thread(ctx.steam_state)
    if not state.get("available"):
        reason = state.get("unavailableReason") or "unknown"
        if reason == "module_disabled":
            return [row("steam_module", "steam", "ok", t("Модуль Steam IDLE", "Steam IDLE module"), t("Выключен в настройках.", "Turned off in settings."))]
        return [row("steam_module", "steam", "warn", t("Модуль Steam IDLE", "Steam IDLE module"), t(f"Недоступен: {reason}.", f"Unavailable: {reason}."),
                    t("Откройте вкладку Steam IDLE и установите недостающие компоненты.", "Open the Steam IDLE tab and install the missing components."))]
    rows = [row("steam_module", "steam", "ok", t("Модуль Steam IDLE", "Steam IDLE module"), t("Доступен.", "Available."))]
    client = state.get("steam") or {}
    client_title = t("Клиент Steam", "Steam client")
    if not client.get("running"):
        rows.append(row("steam_client", "steam", "warn", client_title, t("Steam не запущен.", "Steam is not running."), t("Запустите Steam.", "Start Steam.")))
    elif not client.get("signedIn"):
        rows.append(row("steam_client", "steam", "warn", client_title, t("Steam запущен, но вход не выполнен.", "Steam is running but not signed in."),
                        t("Войдите в аккаунт Steam.", "Sign in to Steam.")))
    else:
        rows.append(row("steam_client", "steam", "ok", client_title, t("Запущен, вход выполнен.", "Running and signed in.")))
    session = (state.get("community") or {}).get("session")
    session_title = t("Сессия сообщества Steam", "Steam community session")
    if session in ("signed_out", "account_mismatch", "engine_missing"):
        fix = fix_spec(ctx.lang, "steam_login", ("Войти в Steam", "Sign in to Steam")) if session != "engine_missing" else None
        rows.append(row("steam_session", "steam", "warn", session_title, t(f"Состояние: {session}.", f"State: {session}."),
                        t("Войдите в Steam во вкладке Steam IDLE.", "Sign in to Steam on the Steam IDLE tab."), fix))
    else:
        rows.append(row("steam_session", "steam", "ok", session_title, t(f"Состояние: {session or 'unknown'}.", f"State: {session or 'unknown'}.")))
    last_error = (state.get("farm") or {}).get("lastError")
    if last_error:
        rows.append(row("steam_farm", "steam", "warn", t("Последний запуск фарма", "Last card farm run"), t(f"Остановился с ошибкой: {last_error}.", f"Stopped with an error: {last_error}."),
                        t("Откройте журнал Steam IDLE и запустите фарм снова.", "Open the Steam IDLE log and start the farm again.")))
    return rows


# ---- giveaways ----

_GIVEAWAY_TITLES = {
    "module": ("Модуль раздач", "Giveaways module"), "node": ("Node.js", "Node.js"), "engine": ("Движок раздач", "Giveaways engine"),
    "browser": ("Браузер для раздач", "Browser for giveaways"), "selection": ("Выбор магазинов", "Store selection"),
    "login": ("Вход в магазин", "Store sign-in"), "scheduler": ("Запуск по расписанию", "Scheduled run"), "site": ("Доступность магазина", "Store reachable"),
}
_GIVEAWAY_STATUS = {"ok": "ok", "todo": "warn", "warning": "warn", "info": "ok"}


def _giveaway_detail(ctx: HealthContext, entry: dict) -> str:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    params = entry.get("params") or {}
    kind = entry.get("id")
    if kind == "login":
        return mask_name(params.get("account")) or t("Вход не выполнен.", "Not signed in.")
    if kind == "node" and params.get("version"):
        return f"{params['version']}"
    if kind == "scheduler" and params.get("lastRunTime"):
        return t(f"Последний запуск: {params['lastRunTime']}.", f"Last run: {params['lastRunTime']}.")
    reason = params.get("reason")
    if reason:
        return str(reason)
    return "" if entry.get("status") in ("ok", "info") else t("Шаг не выполнен.", "Step not done.")


async def check_giveaways(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    readiness = await ctx.giveaways_readiness()
    marker = await asyncio.to_thread(ctx.giveaways_marker)
    rows = []
    logins = []
    for entry in readiness.get("items") or []:
        kind = entry.get("id")
        if kind == "site":
            continue
        if kind == "login":
            logins.append(entry)
            continue
        status = _GIVEAWAY_STATUS.get(entry.get("status"), "warn")
        advice = t("Откройте вкладку «Раздачи»: там есть кнопка для этого шага.", "Open the Giveaways tab: it has a button for this step.") if status != "ok" else ""
        if kind == "selection" and (entry.get("params") or {}).get("reason") == "disabled":
            status, advice = "ok", ""
        title_ru, title_en = _GIVEAWAY_TITLES.get(kind, (str(kind), str(kind)))
        title = t(title_ru, title_en)
        check_id = f"giveaways_{kind}"
        detail = _giveaway_detail(ctx, entry)
        if kind == "engine" and marker:
            status = "fail"
            detail = t("Установка движка не завершилась: остался маркер .engine-install-incomplete.", "The engine install did not finish: the .engine-install-incomplete marker is left.")
            advice = t("Во вкладке «Раздачи» нажмите «Установить движок» ещё раз.", "On the Giveaways tab press Install engine again.")
        fix = fix_spec(ctx.lang, "giveaways_reinstall", ("Переустановить движок раздач", "Reinstall the giveaways engine")) if kind == "engine" and status != "ok" else None
        rows.append(row(check_id, "giveaways", status, title, detail, advice, fix))
    if logins:
        missing = [e.get("store") or "?" for e in logins if e.get("status") != "ok"]
        signed = [e.get("store") or "?" for e in logins if e.get("status") == "ok"]
        detail = t(f"Вход не выполнен: {', '.join(missing)}. ", f"Not signed in: {', '.join(missing)}. ") if missing else ""
        detail += t(f"Вход выполнен: {', '.join(signed)}.", f"Signed in: {', '.join(signed)}.") if signed else ""
        rows.append(row("giveaways_login", "giveaways", "warn" if missing else "ok", t("Вход в магазины", "Store sign-ins"), detail.strip(),
                        t("Откройте вкладку «Раздачи» и войдите в нужные магазины; остальные можно не трогать.", "Open the Giveaways tab and sign in to the stores you need; leave the others.") if missing else ""))
    if marker and not any(r["id"] == "giveaways_engine" for r in rows):
        rows.append(row("giveaways_engine", "giveaways", "fail", t("Движок раздач", "Giveaways engine"),
                        t("Установка движка не завершилась.", "The engine install did not finish."), t("Установите движок ещё раз.", "Install the engine again."),
                        fix_spec(ctx.lang, "giveaways_reinstall", ("Переустановить движок раздач", "Reinstall the giveaways engine"))))
    return rows


# ---- network ----

async def _net_check(ctx: HealthContext, check_id: str, url: str, host: str) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t(f"Доступность {host}", f"{host} reachable")
    advice_fail = t("Проверьте интернет, VPN или прокси и настройки DNS; антивирус и фаервол тоже могут блокировать.",
                    "Check the internet, VPN or proxy and the DNS settings; an antivirus or firewall may block it too.")
    try:
        ms = await _http_probe(url, NET_PROBE_SECONDS)
    except (aiohttp.ClientError, asyncio.TimeoutError, OSError, ValueError) as exc:
        reason = f"{type(exc).__name__}: {exc}".rstrip(": ")
        return [row(check_id, "network", "fail", title, t(f"Не отвечает ({reason}).", f"No answer ({reason})."), advice_fail)]
    if ms > NET_SLOW_MS:
        return [row(check_id, "network", "warn", title, t(f"Отвечает медленно: {ms} мс.", f"Slow answer: {ms} ms."),
                    t("Медленный канал, VPN или прокси; на загрузке сети проверки могут не успевать.", "A slow link, VPN or proxy; checks may time out on a busy network."))]
    return [row(check_id, "network", "ok", title, t(f"Отвечает за {ms} мс.", f"Answers in {ms} ms."))]


def _net_fn(check_id: str, url: str, host: str) -> Callable[[HealthContext], Awaitable[list[dict]]]:
    async def check(ctx: HealthContext) -> list[dict]:
        return await _net_check(ctx, check_id, url, host)
    check.__name__ = f"check_{check_id}"
    return check


# ---- updates ----

async def check_updates_version(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Версия приложения", "App version")
    cached = ctx.cached_update()
    if cached and cached.get("update_available"):
        latest = cached.get("latest_version") or "?"
        return [row("updates_version", "updates", "warn", title, t(f"Установлена {ctx.version}, доступна {latest}.", f"Installed {ctx.version}, available {latest}."),
                    t("Обновите приложение в настройках.", "Update the app in Settings."))]
    return [row("updates_version", "updates", "ok", title, t(f"Версия {ctx.version}.", f"Version {ctx.version}."))]


def _path_exists(path: Path) -> bool:
    return path.exists()


async def check_updates_pending(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Обновление применено до конца", "Update fully applied")
    if await asyncio.to_thread(_path_exists, ctx.project_dir / "TwitchDropsSentinel.update"):
        return [row("updates_pending", "updates", "warn", title, t("Рядом с программой лежит неприменённый файл TwitchDropsSentinel.update.", "An unapplied TwitchDropsSentinel.update file sits next to the app."),
                    t("Полностью закройте приложение (в том числе из трея) и запустите снова: файл применится при старте.", "Close the app completely (also from the tray) and start it again: the file is applied at the start."))]
    return [row("updates_pending", "updates", "ok", title, t("Застрявших обновлений нет.", "No stuck update."))]


# ---- settings ----

async def check_settings(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Файл настроек config.json", "Settings file config.json")
    error = settings_error()
    if error:
        return [row("settings_config", "settings", "fail", title, t(f"Файл не прочитан, взяты значения по умолчанию: {error}", f"The file could not be read, defaults are used: {error}"),
                    t("Восстановите настройки из резервной копии (Настройки, раздел резервных копий) или удалите повреждённый config.json.",
                      "Restore the settings from a backup (Settings, backups section) or delete the damaged config.json."),
                    fix_spec(ctx.lang, "settings_restore", ("Восстановить настройки", "Restore the settings"), CONFIRM_SETTINGS))]
    return [row("settings_config", "settings", "ok", title, t("Читается без ошибок.", "Read without errors."))]


# ---- system ----

async def check_disk(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Свободное место на диске", "Free disk space")
    free = await asyncio.to_thread(disk_free_bytes, ctx.project_dir)
    gb = free / 1024 ** 3
    detail = t(f"Свободно {gb:.1f} ГБ на диске программы.", f"{gb:.1f} GB free on the app's drive.")
    if free < DISK_FAIL_BYTES:
        return [row("system_disk", "system", "fail", title, detail, t("Освободите место: службе и обновлениям нужен хотя бы 1 ГБ.", "Free some space: the service and updates need at least 1 GB."))]
    if free < DISK_WARN_BYTES:
        return [row("system_disk", "system", "warn", title, detail, t("Места мало: освободите хотя бы 5 ГБ.", "Space is low: free at least 5 GB."))]
    return [row("system_disk", "system", "ok", title, detail)]


def _logs_total_bytes(log_dir: Path, project_dir: Path) -> int:
    files = list(log_dir.glob("sentinel_service.log*")) + [project_dir / "sentinel_stdout.log", project_dir / "sentinel_stderr.log"]
    return sum(f.stat().st_size for f in files if f.is_file())


async def check_logs_size(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Размер журналов", "Log size")
    total = await asyncio.to_thread(_logs_total_bytes, ctx.log_dir, ctx.project_dir)
    detail = t(f"Всего {total / 1024 ** 2:.1f} МБ.", f"{total / 1024 ** 2:.1f} MB in total.")
    if total > LOGS_WARN_BYTES:
        rotated = await asyncio.to_thread(_rotated_bytes, ctx.log_dir)
        advice = t("Журналы разрослись: удалите старые файлы sentinel_*.log в папке программы.", "The logs have grown: delete the old sentinel_*.log files in the app folder.")
        if rotated > 0 and total - rotated <= LOGS_WARN_BYTES:  # the fix is offered only when it really ends the warning
            return [row("system_logs", "system", "warn", title, detail, advice, fix_spec(ctx.lang, "logs_trim", ("Удалить старые журналы", "Delete old logs"), CONFIRM_LOGS))]
        return [row("system_logs", "system", "warn", title,
                    detail + " " + t("Основной объём в sentinel_stdout.log и sentinel_stderr.log: их держит открытыми работающая служба, поэтому приложение их не урезает.",
                                     "Most of it is in sentinel_stdout.log and sentinel_stderr.log: the running service keeps them open, so the app does not trim them."),
                    t("Закройте приложение полностью (в том числе из трея) и удалите эти файлы вручную; ротированные журналы можно удалить сразу.",
                      "Close the app completely (also from the tray) and delete those files by hand; the rotated logs can go at once."))]
    return [row("system_logs", "system", "ok", title, detail)]


def _autostart_exe(command: str) -> str:
    match = re.match(r'\s*"([^"]+)"', command) or re.match(r"\s*(\S+)", command)
    return match.group(1) if match else ""


def _same_dir(a: Path, b: Path) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def _points_here(command: str, project_dir: Path) -> bool:
    folder = Path(_autostart_exe(command)).parent
    return _same_dir(folder, project_dir) or _same_dir(folder, project_dir / "desktop" / "publish")


def _autostart_target(project_dir: Path) -> Path:
    """The program autostart would start for this copy (the same choice service_system.set_autostart_status makes)."""
    exe = project_dir / "TwitchDropsSentinel.exe"
    published = project_dir / "desktop" / "publish" / "TwitchDropsSentinel.exe"
    return published if not exe.exists() and published.exists() else exe


async def check_autostart(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Автозапуск с Windows", "Autostart with Windows")
    enabled, command = await asyncio.to_thread(read_autostart)
    if not enabled:
        return [row("system_autostart", "system", "ok", title, t("Выключен.", "Turned off."))]
    exe = Path(_autostart_exe(command))
    if not _points_here(command, ctx.project_dir):
        target = _autostart_target(ctx.project_dir)
        return [row("system_autostart", "system", "warn", title, t(f"Автозапуск указывает на другую копию: {exe}", f"Autostart points to another copy: {exe}"),
                    t("В настройках выключите и снова включите автозапуск в этой копии.", "In Settings turn autostart off and on again in this copy."),
                    fix_spec(ctx.lang, "autostart_repair", (f"Включить автозапуск этой копии ({target})", f"Turn on autostart for this copy ({target})")))]
    return [row("system_autostart", "system", "ok", title, t("Указывает на эту копию.", "Points to this copy."))]


_LOG_LINE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3} \[(\w+)\]")


def _read_tail(path: Path) -> str:
    with open(path, "rb") as f:
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(max(0, size - LOG_TAIL_BYTES))
        return f.read().decode("utf-8", errors="replace")


def _recent_error_lines(log: Path, since: datetime) -> Optional[list[str]]:
    """ERROR lines newer than `since` from the log's tail; None when there is no log."""
    if not log.is_file():
        return None
    errors = []
    for line in _read_tail(log).splitlines():
        match = _LOG_LINE.match(line)
        if match and match.group(2) == "ERROR" and datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S") >= since:
            errors.append(line)
    return errors


async def check_log_errors(ctx: HealthContext) -> list[dict]:
    t = lambda ru, en: _t(ctx.lang, ru, en)
    title = t("Ошибки в журнале за час", "Errors in the log, last hour")
    errors = await asyncio.to_thread(_recent_error_lines, ctx.log_dir / "sentinel_service.log", ctx.now() - timedelta(hours=1))
    if errors is None:
        return [row("system_errors", "system", "ok", title, t("Журнала ещё нет.", "No log yet."))]
    if not errors:
        return [row("system_errors", "system", "ok", title, t("Ошибок нет.", "No errors."))]
    shown = "\n".join(sanitize(line)[:300] for line in errors[-LOG_ERRORS_SHOWN:])
    return [row("system_errors", "system", "warn", t(f"Ошибок в журнале за час: {len(errors)}", f"Errors in the log, last hour: {len(errors)}"),
                shown, t("Скопируйте отчёт и отправьте разработчику, если что-то не работает.", "Copy the report and send it to the developer if something does not work."))]


# ---- the catalog and the run ----

@dataclass(frozen=True)
class Check:
    id: str
    area: str
    title: tuple[str, str]
    fn: Callable[[HealthContext], Awaitable[list[dict]]]
    timeout: float


CATALOG: list[Check] = [
    Check("twitch_login", "twitch", ("Вход в Twitch", "Twitch sign-in"), check_twitch_login, 3.0),
    Check("twitch_code", "twitch", ("Код входа Twitch", "Twitch sign-in code"), check_twitch_code, 3.0),
    Check("twitch_code_loop", "twitch", ("Код входа не меняется по кругу", "The sign-in code is stable"), check_twitch_code_loop, 3.0),
    Check("steam", "steam", ("Steam IDLE", "Steam IDLE"), check_steam, 6.0),
    Check("giveaways", "giveaways", ("Раздачи", "Giveaways"), check_giveaways, 8.0),
    *(Check(cid, "network", (f"Доступность {host}", f"{host} reachable"), _net_fn(cid, url, host), NET_PROBE_SECONDS + 1.0) for cid, url, host in NET_TARGETS),
    Check("updates_version", "updates", ("Версия приложения", "App version"), check_updates_version, 3.0),
    Check("updates_pending", "updates", ("Обновление применено до конца", "Update fully applied"), check_updates_pending, 3.0),
    Check("settings_config", "settings", ("Файл настроек config.json", "Settings file config.json"), check_settings, 3.0),
    Check("system_disk", "system", ("Свободное место на диске", "Free disk space"), check_disk, 3.0),
    Check("system_logs", "system", ("Размер журналов", "Log size"), check_logs_size, 3.0),
    Check("system_autostart", "system", ("Автозапуск с Windows", "Autostart with Windows"), check_autostart, 3.0),
    Check("system_errors", "system", ("Ошибки в журнале за час", "Errors in the log, last hour"), check_log_errors, 4.0),
]


def _unfinished(entry: Check, lang: str, detail: str, status: str = "warn") -> dict:
    return row(entry.id, entry.area, status, entry.title[1 if lang == "en" else 0], detail,
               _t(lang, "Нажмите «Проверить снова». Если повторяется, скопируйте отчёт.", "Press Check again. If it repeats, copy the report."))


async def _guarded(entry: Check, ctx: HealthContext) -> list[dict]:
    try:
        rows = await asyncio.wait_for(entry.fn(ctx), timeout=entry.timeout)
    except asyncio.TimeoutError:
        return [_unfinished(entry, ctx.lang, _t(ctx.lang, "Проверка не успела.", "The check did not finish in time."))]
    except Exception as exc:  # noqa: BLE001 - one broken check must not hide the others
        logger.warning("Health check %s failed: %s", entry.id, exc, exc_info=True)
        return [_unfinished(entry, ctx.lang, f"{type(exc).__name__}: {exc}")]
    return [r if r["area"] == entry.area else {**r, "area": entry.area} for r in rows]


_flight: Optional[tuple[tuple, asyncio.Task]] = None
_last: Optional[tuple[tuple, float, dict]] = None
_generation = 0  # bumped when a fix changes things: a run that began before it must not store its result


async def run_health(ctx: HealthContext, checks: Optional[list[Check]] = None, budget: float = RUN_BUDGET_SECONDS) -> dict:
    """One run at a time: callers that arrive while it is in progress share it, and a result younger than REUSE_SECONDS is handed out again.
    Repeated "Check again" clicks therefore cannot pile up (a check's worker thread outlives its timeout)."""
    global _flight
    entries = list(CATALOG if checks is None else checks)
    key = (ctx.lang, tuple(entry.id for entry in entries))
    if _last and _last[0] == key and time.monotonic() - _last[1] < REUSE_SECONDS:
        return _last[2]
    loop = asyncio.get_running_loop()
    if _flight and _flight[0] == key and not _flight[1].done() and _flight[1].get_loop() is loop:
        task = _flight[1]
    else:
        task = loop.create_task(_shared_run(key, ctx, entries, budget, _generation))
        _flight = (key, task)
    return await asyncio.shield(task)  # a caller that goes away must not cancel the run the others wait for


async def _shared_run(key: tuple, ctx: HealthContext, entries: list[Check], budget: float, generation: int) -> dict:
    global _last
    result = await _run_checks(ctx, entries, budget)
    if generation == _generation:
        _last = (key, time.monotonic(), result)
    return result


async def _run_checks(ctx: HealthContext, entries: list[Check], budget: float) -> dict:
    """All checks at once, each with its own timeout; whatever is still running when the budget ends is reported as unfinished."""
    tasks = {entry.id: asyncio.create_task(_guarded(entry, ctx)) for entry in entries}
    await asyncio.wait(tasks.values(), timeout=budget)
    rows: list[dict] = []
    for entry in entries:
        task = tasks[entry.id]
        if task.done():
            rows.extend(task.result())
        else:
            task.cancel()
            rows.append(_unfinished(entry, ctx.lang, _t(ctx.lang, "Проверка не успела: общее время вышло.", "The check did not finish: the run budget ended.")))
    for task in tasks.values():
        if not task.done():
            await asyncio.gather(task, return_exceptions=True)
    return {"checks": rows, "version": ctx.version, "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds")}


# ---- one-click fixes (POST /api/v1/health/fix) ----

class FixFailed(Exception):
    """A fix action could not do its job; the text is shown to the user."""


class Outcome(NamedTuple):
    message: str
    restart: bool = False  # the result takes effect only after the app restarts


@dataclass
class FixActions:
    """What a fix may do. The service hands in its own functions, so nothing here knows about the service or calls it over HTTP.
    The sync ones run in a worker thread; every one raises FixFailed (or anything else, which is logged) when it fails."""
    sign_out_twitch: Callable[[], Awaitable[None]]
    steam_login: Callable[[], Awaitable[None]]
    install_engine: Callable[[], Awaitable[str]]
    enable_autostart: Callable[[], bool]
    reset_settings: Callable[[], Awaitable[None]]
    save_profile_backup: Callable[[], Path]
    list_backups: Callable[[], list[Path]]  # newest first
    stage_restore: Callable[[Path], list[str]]  # ValueError for an archive that cannot be used


@dataclass
class FixContext:
    health: HealthContext
    actions: FixActions
    claim_log_dirs: Callable[[], list[Path]] = lambda: []


@dataclass(frozen=True)
class Fix:
    id: str
    checks: tuple[str, ...]  # the catalog checks to run again afterwards
    applicable: Callable[[FixContext], Awaitable[Optional[str]]]  # None when it applies now, otherwise why it does not
    run: Callable[[FixContext], Awaitable[Outcome]]


ROTATED_LOG = re.compile(r"^sentinel_service\.log\.\d+$")  # what the rotating handler leaves; never the active sentinel_service.log
CLAIM_LOG_DAYS = 7


def _plain_file(f: Path) -> Optional[os.stat_result]:
    """The file's stat when it is a regular file that is not a link; None for anything else, or when it vanished (logged at debug)."""
    try:
        st = f.stat()
        return st if stat_mod.S_ISREG(st.st_mode) and not f.is_symlink() else None
    except OSError as exc:
        logger.debug("health fix logs_trim: skipped %s: %s", f.name, exc)
        return None


def _rotated_logs(log_dir: Path) -> list[Path]:
    try:
        names = list(log_dir.iterdir())
    except OSError as exc:
        logger.debug("health fix logs_trim: cannot list %s: %s", log_dir.name, exc)
        return []
    return [f for f in names if ROTATED_LOG.match(f.name) and _plain_file(f)]


def _rotated_bytes(log_dir: Path) -> int:
    return sum(st.st_size for st in (_plain_file(f) for f in _rotated_logs(log_dir)) if st)


def _trim_candidates(log_dir: Path, claim_dirs: list[Path], now: datetime) -> list[Path]:
    found = _rotated_logs(log_dir)
    cutoff = (now - timedelta(days=CLAIM_LOG_DAYS)).timestamp()
    seen: set[Path] = set()
    for folder in claim_dirs:
        try:
            key = folder.resolve()
            if key in seen or not folder.is_dir():
                continue
            seen.add(key)
            listing = list(folder.glob("ClaimOutput_*.log"))
        except OSError as exc:
            logger.debug("health fix logs_trim: cannot list %s: %s", folder.name, exc)
            continue
        found.extend(f for f in listing if (st := _plain_file(f)) and st.st_mtime < cutoff)
    return found


def _trim(files: list[Path]) -> tuple[int, int, int]:
    """(deleted, bytes freed, failed): one file that cannot be deleted does not stop the rest."""
    deleted = freed = failed = 0
    for f in files:
        try:
            size = f.stat().st_size
            f.unlink()
            deleted, freed = deleted + 1, freed + size
        except OSError as exc:
            failed += 1
            logger.warning("health fix logs_trim: could not delete %s: %s", f.name, exc, exc_info=True)
    return deleted, freed, failed


async def _can_relogin(fc: FixContext) -> Optional[str]:
    if not fc.health.bridge.user_id or OAUTH_CODES.recent() >= CODE_LOOP_COUNT:
        return None
    return _t(fc.health.lang, "Вход в Twitch уже выполнен: сбрасывать нечего.", "Twitch is already signed in: nothing to reset.")


async def _relogin(fc: FixContext) -> Outcome:
    await fc.actions.sign_out_twitch()
    OAUTH_CODES.clear()
    return Outcome(_t(fc.health.lang, "Вход сброшен. Служба запросит новый код, он появится через несколько секунд: нажмите «Проверить снова».",
                      "Sign-in reset. The service will ask for a new code in a few seconds: press Check again."))


async def _can_steam_login(fc: FixContext) -> Optional[str]:
    state = await asyncio.to_thread(fc.health.steam_state)
    if state.get("available") and (state.get("community") or {}).get("session") in ("signed_out", "account_mismatch"):
        return None
    return _t(fc.health.lang, "Сессия Steam в порядке или вход сейчас недоступен.", "The Steam session is fine or sign-in is not available now.")


async def _steam_login(fc: FixContext) -> Outcome:
    await fc.actions.steam_login()
    return Outcome(_t(fc.health.lang, "Окно входа в Steam открывается. Войдите и нажмите «Проверить снова».", "The Steam sign-in window is opening. Sign in and press Check again."))


async def _can_reinstall(fc: FixContext) -> Optional[str]:
    if await asyncio.to_thread(fc.health.giveaways_marker):
        return None
    engine = [e for e in (await fc.health.giveaways_readiness()).get("items") or [] if e.get("id") == "engine"]
    if any(e.get("status") != "ok" for e in engine):
        return None
    return _t(fc.health.lang, "Движок раздач установлен.", "The giveaways engine is installed.")


async def _reinstall(fc: FixContext) -> Outcome:
    started = await fc.actions.install_engine()
    if started == "already_running":
        return Outcome(_t(fc.health.lang, "Установка движка уже идёт.", "The engine install is already running."))
    return Outcome(_t(fc.health.lang, "Установка движка запущена, это займёт несколько минут. Проверьте позже кнопкой «Проверить снова».",
                      "The engine install is started and takes a few minutes. Check later with Check again."))


async def _can_repair_autostart(fc: FixContext) -> Optional[str]:
    enabled, command = await asyncio.to_thread(read_autostart)
    if enabled and not _points_here(command, fc.health.project_dir):
        return None
    return _t(fc.health.lang, "Автозапуск выключен или уже указывает на эту копию.", "Autostart is off or already points to this copy.")


async def _repair_autostart(fc: FixContext) -> Outcome:
    if not await asyncio.to_thread(fc.actions.enable_autostart):
        raise FixFailed(_t(fc.health.lang, "Windows не дала записать автозапуск.", "Windows refused to write the autostart entry."))
    return Outcome(_t(fc.health.lang, "Автозапуск теперь указывает на эту копию.", "Autostart now points to this copy."))


async def _can_restore_settings(fc: FixContext) -> Optional[str]:
    if settings_error():
        return None
    return _t(fc.health.lang, "Файл настроек читается без ошибок.", "The settings file is read without errors.")


async def _restore_settings(fc: FixContext) -> Outcome:
    t = lambda ru, en: _t(fc.health.lang, ru, en)
    backups = await asyncio.to_thread(fc.actions.list_backups)  # before ours is written, or the newest one would be the damaged file itself
    try:
        saved = await asyncio.to_thread(fc.actions.save_profile_backup)
    except Exception as exc:
        logger.error("health fix settings_restore: the backup of the current settings failed: %s", exc, exc_info=True)
        raise FixFailed(t(f"Копия текущих настроек не сохранилась, ничего не менялось: {exc}", f"The backup of the current settings was not saved, nothing was changed: {exc}")) from exc
    for path in backups:
        try:
            await asyncio.to_thread(fc.actions.stage_restore, path)
        except ValueError as exc:
            logger.warning("health fix settings_restore: %s cannot be used: %s", path.name, exc)
            continue
        return Outcome(t(f"Копия {path.name} подготовлена и применится при перезапуске приложения. Прежние настройки сохранены в {saved.name}.",
                         f"Backup {path.name} is ready and will be applied when the app restarts. The previous settings are saved as {saved.name}."), restart=True)
    await fc.actions.reset_settings()
    note_settings_error(None)  # config.json was just written again
    return Outcome(t(f"Пригодных резервных копий нет: настройки сброшены к заводским. Прежний файл сохранён в {saved.name}.",
                     f"No usable backup: the settings were reset to factory values. The previous file is saved as {saved.name}."))


async def _can_trim_logs(fc: FixContext) -> Optional[str]:
    if await asyncio.to_thread(_trim_candidates, fc.health.log_dir, fc.claim_log_dirs(), fc.health.now()):
        return None
    return _t(fc.health.lang, "Старых журналов нет: нечего удалять.", "There are no old logs to delete.")


async def _trim_logs(fc: FixContext) -> Outcome:
    t = lambda ru, en: _t(fc.health.lang, ru, en)
    files = await asyncio.to_thread(_trim_candidates, fc.health.log_dir, fc.claim_log_dirs(), fc.health.now())
    deleted, freed, failed = await asyncio.to_thread(_trim, files)
    if failed and not deleted:
        raise FixFailed(t("Ни один файл не удалось удалить: они заняты другой программой.", "No file could be deleted: they are in use by another program."))
    tail = t(f" Не удалось удалить: {failed}.", f" Could not delete: {failed}.") if failed else ""
    return Outcome(t(f"Удалено файлов: {deleted}, освобождено {freed / 1024 ** 2:.1f} МБ.", f"Files deleted: {deleted}, {freed / 1024 ** 2:.1f} MB freed.") + tail)


FIXES: dict[str, Fix] = {fix.id: fix for fix in (
    Fix("twitch_relogin", ("twitch_login", "twitch_code", "twitch_code_loop"), _can_relogin, _relogin),
    Fix("steam_login", ("steam",), _can_steam_login, _steam_login),
    Fix("giveaways_reinstall", ("giveaways",), _can_reinstall, _reinstall),
    Fix("autostart_repair", ("system_autostart",), _can_repair_autostart, _repair_autostart),
    Fix("settings_restore", ("settings_config",), _can_restore_settings, _restore_settings),
    Fix("logs_trim", ("system_logs",), _can_trim_logs, _trim_logs),
)}

_fix_running = False


def _log_text(value: Any) -> str:
    """An id from the page, flattened to one short quoted line so it cannot forge a log entry."""
    return repr(str(value)[:40])


async def _recheck(fix: Fix, ctx: HealthContext) -> list[dict]:
    """The related checks again, straight away (not from the 3 s reuse cache), and the cache dropped so the next GET is fresh too."""
    global _last, _flight, _generation
    _generation += 1  # a read already in flight began before the fix: it must not store, and later callers must not join it
    _flight = None
    _last = None
    entries = [entry for entry in CATALOG if entry.id in fix.checks]
    result = await _run_checks(ctx, entries, RUN_BUDGET_SECONDS)
    _last = None
    return result["checks"]


async def run_fix(fix_id: Any, fc: FixContext) -> tuple[int, dict]:
    """(HTTP status, body {ok, message, checks, restart?}): 400 unknown id, 409 not applicable now or another fix running, 500 failed, else 200."""
    global _fix_running
    lang = fc.health.lang
    t = lambda ru, en: _t(lang, ru, en)
    fix = FIXES.get(fix_id) if isinstance(fix_id, str) else None
    if fix is None:
        logger.warning("health fix %s: unknown id", _log_text(fix_id))
        return 400, {"ok": False, "message": t("Такого исправления нет.", "No such fix."), "checks": []}
    if _fix_running:  # no await between this test and the assignment: two clicks cannot both pass
        logger.info("health fix %s: refused (another fix is running)", fix.id)
        return 409, {"ok": False, "message": t("Другое исправление ещё выполняется.", "Another fix is still running."), "checks": []}
    _fix_running = True
    try:
        refusal = await fix.applicable(fc)
        if refusal:
            logger.info("health fix %s: refused (%s)", fix.id, refusal)
            return 409, {"ok": False, "message": refusal, "checks": []}
        ok, restart = True, False
        try:
            outcome = await fix.run(fc)
            message, restart = sanitize(outcome.message), outcome.restart
            logger.info("health fix %s: ok (%s)", fix.id, message)
        except FixFailed as exc:
            ok, message = False, sanitize(str(exc))
            logger.warning("health fix %s: failed (%s)", fix.id, message, exc_info=True)
        except Exception as exc:  # noqa: BLE001 - the panel must get an answer, the log gets the traceback
            ok, message = False, sanitize(t(f"Не удалось: {type(exc).__name__}: {exc}", f"Failed: {type(exc).__name__}: {exc}"))
            logger.error("health fix %s: failed (%s)", fix.id, message, exc_info=True)
        checks = await _recheck(fix, fc.health)
        return (200 if ok else 500), {"ok": ok, "message": message, "checks": checks, "restart": restart}
    except Exception as exc:  # noqa: BLE001 - a crash in the applicability test or the recheck
        logger.error("health fix %s: crashed: %s", fix.id, exc, exc_info=True)
        return 500, {"ok": False, "message": sanitize(t(f"Исправление не выполнено: {type(exc).__name__}: {exc}", f"The fix did not run: {type(exc).__name__}: {exc}")), "checks": []}
    finally:
        _fix_running = False
