"""Telegram and Discord copies of the app's notifications.

Every event that goes through the notification gate (drop claimed, queue campaign started or waiting for a link,
queue deadline, daily reward goal, giveaway claimed) is also posted to the configured channels, whether or not
Windows toasts are on. Secrets (bot token, webhook URL) live in data/webhooks.json, encrypted with Windows DPAPI
for the current user, and never leave the service: the UI only sees whether they are set.
"""
from __future__ import annotations

import base64
import json
import logging
import queue
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

from dpapi import protect_bytes, unprotect_bytes

logger = logging.getLogger("TwitchDrops")

DEFAULT_STORE = Path(__file__).resolve().parent.parent / "data" / "webhooks.json"
TELEGRAM_TOKEN_RE = re.compile(r"^\d{5,}:[A-Za-z0-9_-]{30,}$")
TELEGRAM_CHAT_RE = re.compile(r"^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$")
DISCORD_HOSTS = {"discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"}
SEND_TIMEOUT = 10
APP_NAME = "Hell Harvest"


class WebhookError(ValueError):
    """A setting or a delivery the user has to fix; the message is shown in the UI."""


def valid_discord_url(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    return parts.scheme == "https" and parts.hostname in DISCORD_HOSTS and parts.path.startswith("/api/webhooks/")


def _seal(secret: str) -> str:
    return base64.b64encode(protect_bytes(secret.encode("utf-8"))).decode("ascii") if secret else ""


def _open(sealed: str) -> str:
    return unprotect_bytes(base64.b64decode(sealed)).decode("utf-8") if sealed else ""


def telegram_request(token: str, chat_id: str, title: str, message: str) -> urllib.request.Request:
    body = json.dumps({"chat_id": chat_id, "text": f"{title}\n{message}", "disable_web_page_preview": True}).encode("utf-8")
    return urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body, method="POST",
                                  headers={"Content-Type": "application/json", "User-Agent": APP_NAME})


def discord_request(url: str, title: str, message: str) -> urllib.request.Request:
    body = json.dumps({"username": APP_NAME, "content": f"**{title}**\n{message}"[:1900],
                       "allowed_mentions": {"parse": []}}).encode("utf-8")
    return urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": APP_NAME})


class Webhooks:
    def __init__(self, store_path: Optional[Path] = DEFAULT_STORE,
                 opener: Callable[..., Any] = urllib.request.urlopen) -> None:
        self._store_path = store_path
        self._opener = opener
        self._lock = threading.Lock()
        self._config = {"telegram": {"enabled": False, "chat_id": "", "token": ""},
                        "discord": {"enabled": False, "url": ""}}
        self._queue: "queue.Queue[tuple[str, str]]" = queue.Queue(maxsize=100)
        self._worker: Optional[threading.Thread] = None
        self._load()

    # --- settings ---------------------------------------------------------------------------------------------------
    def _load(self) -> None:
        if self._store_path is None or not self._store_path.exists():
            return
        try:
            data = json.loads(self._store_path.read_text(encoding="utf-8"))
            tg, dc = data.get("telegram", {}), data.get("discord", {})
            self._config["telegram"] = {"enabled": bool(tg.get("enabled")), "chat_id": str(tg.get("chat_id", "")),
                                        "token": _open(tg.get("token", ""))}
            self._config["discord"] = {"enabled": bool(dc.get("enabled")), "url": _open(dc.get("url", ""))}
        except Exception as exc:
            logger.warning("Webhook settings %s are unreadable, notifications to Telegram/Discord are off: %s",
                           self._store_path, exc, exc_info=True)

    def _save(self, tg: dict, dc: dict) -> None:
        if self._store_path is None:
            return
        data = {"telegram": {"enabled": tg["enabled"], "chat_id": tg["chat_id"], "token": _seal(tg["token"])},
                "discord": {"enabled": dc["enabled"], "url": _seal(dc["url"])}}
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self._store_path.with_name(self._store_path.name + ".tmp")
        temp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temp.replace(self._store_path)

    def public(self) -> dict:
        with self._lock:
            tg, dc = self._config["telegram"], self._config["discord"]
            return {"telegram": {"enabled": tg["enabled"], "chat_id": tg["chat_id"], "token_set": bool(tg["token"])},
                    "discord": {"enabled": dc["enabled"], "url_set": bool(dc["url"])}}

    def update(self, patch: Any) -> dict:
        """patch: {"telegram": {"enabled", "chat_id", "token"}, "discord": {"enabled", "url"}}, every part optional.
        An empty token or url keeps the saved one; "clear": true removes it. A channel can only be on when complete."""
        if not isinstance(patch, dict):
            raise WebhookError("ожидался объект")
        with self._lock:
            tg = dict(self._config["telegram"])
            dc = dict(self._config["discord"])
            p = patch.get("telegram")
            if isinstance(p, dict):
                if p.get("clear"):
                    tg.update(token="", chat_id="", enabled=False)
                if p.get("token"):
                    token = str(p["token"]).strip()
                    if not TELEGRAM_TOKEN_RE.match(token):
                        raise WebhookError("токен бота Telegram выглядит неверно: ожидается 123456789:ABC… от @BotFather")
                    tg["token"] = token
                if "chat_id" in p:
                    chat = str(p["chat_id"]).strip()
                    if chat and not TELEGRAM_CHAT_RE.match(chat):
                        raise WebhookError("chat_id Telegram: число (например, 123456789 или -100…) или @имя_канала")
                    tg["chat_id"] = chat
                if "enabled" in p:
                    tg["enabled"] = bool(p["enabled"])
                if tg["enabled"] and not (tg["token"] and tg["chat_id"]):
                    raise WebhookError("для Telegram нужны токен бота и chat_id")
            p = patch.get("discord")
            if isinstance(p, dict):
                if p.get("clear"):
                    dc.update(url="", enabled=False)
                if p.get("url"):
                    url = str(p["url"]).strip()
                    if not valid_discord_url(url):
                        raise WebhookError("адрес вебхука Discord должен начинаться с https://discord.com/api/webhooks/")
                    dc["url"] = url
                if "enabled" in p:
                    dc["enabled"] = bool(p["enabled"])
                if dc["enabled"] and not dc["url"]:
                    raise WebhookError("для Discord нужен адрес вебхука")
            self._save(tg, dc)  # first: a save that fails (DPAPI) must leave the old settings in use
            self._config["telegram"], self._config["discord"] = tg, dc
        return self.public()

    # --- delivery ---------------------------------------------------------------------------------------------------
    def _requests(self, title: str, message: str, only: Optional[str] = None) -> list:
        with self._lock:
            tg, dc = self._config["telegram"], self._config["discord"]
            out = []
            if (only == "telegram" or (only is None and tg["enabled"])) and tg["token"] and tg["chat_id"]:
                out.append(("telegram", telegram_request(tg["token"], tg["chat_id"], title, message)))
            if (only == "discord" or (only is None and dc["enabled"])) and dc["url"]:
                out.append(("discord", discord_request(dc["url"], title, message)))
            return out

    def _post(self, channel: str, req: urllib.request.Request) -> None:
        try:
            with self._opener(req, timeout=SEND_TIMEOUT) as resp:
                resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300] if exc.fp else ""
            raise WebhookError(f"{channel}: HTTP {exc.code} {detail}".strip()) from exc
        except (urllib.error.URLError, OSError) as exc:
            raise WebhookError(f"{channel}: нет соединения ({exc})") from exc

    def send_test(self, channel: str) -> None:
        """Sends a test message right away to one channel, enabled or not; raises WebhookError with the reason."""
        if channel not in ("telegram", "discord"):
            raise WebhookError("неизвестный канал")
        reqs = self._requests(APP_NAME, "Проверка: уведомления доходят.", only=channel)
        if not reqs:
            raise WebhookError("канал не настроен: сначала сохраните токен и chat_id или адрес вебхука")
        for name, req in reqs:
            self._post(name, req)

    def deliver(self, title: str, message: str) -> None:
        """Called for every gated notification: queued, posted by one background thread, never blocks the caller."""
        from constants import TEST_MODE
        if TEST_MODE or not self._requests(title, message):
            return
        try:
            self._queue.put_nowait((title, message))
        except queue.Full:
            logger.warning("Webhook queue is full, dropped: %s", message)
            return
        with self._lock:
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._drain, name="webhooks", daemon=True)
                self._worker.start()

    def _drain(self) -> None:
        while True:
            try:
                title, message = self._queue.get(timeout=30)
            except queue.Empty:
                return
            for name, req in self._requests(title, message):
                try:
                    self._post(name, req)
                except WebhookError as exc:
                    logger.warning("Webhook delivery failed: %s", exc, exc_info=True)


WEBHOOKS = Webhooks()
