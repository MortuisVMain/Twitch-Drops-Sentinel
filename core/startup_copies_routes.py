"""aiohttp handlers for /api/startup-copies: thin adapters over StartupCopies and copy_import. Strict input, blocking work off the loop."""
from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Callable

from aiohttp import web

import copy_import
import startup_copies as sc

logger = logging.getLogger("SentinelService")
_ID_RE = re.compile(r"[0-9a-f]{12}")
_SYSTEM_ERROR = "системная ошибка, подробности в журнале"


def _error(message: str, status: int) -> web.Response:
    return web.json_response({"status": "error", "message": message}, status=status)


class StartupCopiesRoutes:
    def __init__(self, manager, project_dir: Path, defaults: dict, hint_dismissed: Callable[[], bool], dismiss_hint: Callable[[], None],
                 downloads: Path, this_version: str, releases_url: str = ""):
        self._m, self._project, self._defaults = manager, Path(project_dir), defaults
        self._hint_dismissed, self._dismiss_hint, self._downloads = hint_dismissed, dismiss_hint, Path(downloads)
        self._version, self._releases_url = this_version, releases_url

    def _payload(self, state: dict) -> dict:
        copies = {}
        for finding in state["findings"]:
            if not finding["copyDir"]:
                continue
            entry = copies.setdefault(sc.norm(finding["copyDir"]), {"dir": finding["copyDir"], "version": finding["version"], "running": False, "exists": bool(finding["dirExists"])})
            entry["running"] = entry["running"] or finding["kind"] == "process"
            entry["version"] = entry["version"] or finding["version"]
        for entry in copies.values():
            entry["importable"] = entry["exists"] and not entry["running"] and copy_import.is_sentinel_copy(Path(entry["dir"])) and copy_import.has_importable_data(Path(entry["dir"]))
        return {
            "status": "ok", **state, "copies": list(copies.values()), "thisVersion": self._version, "thisDir": str(self._project),
            "ownData": copy_import.own_data_state(self._project, self._defaults),
            "installerHint": {"show": sc.installer_hint_visible(self._project, bool(state["findings"]), self._hint_dismissed(), self._downloads),
                              "url": self._releases_url},
        }

    async def _body(self, request: web.Request):
        try:
            body = await request.json()
        except ValueError:
            return None
        return body if isinstance(body, dict) else None

    async def _act(self, name: str, work: Callable[[], object], shape: Callable[[object], dict] = lambda result: {"result": result}) -> web.Response:
        """Runs one manager action; unknown id -> 404, a refusal -> 409, anything else -> 500 with a fixed text (the trace goes to the log)."""
        try:
            result = await asyncio.to_thread(work)
        except sc.NotFound:
            return _error("запись не найдена, обновите список", 404)
        except sc.Refusal as exc:
            logger.warning("Startup copies %s refused: %s", name, exc)
            return _error(str(exc) or "это действие недоступно для выбранной записи", 409)
        except Exception as exc:
            logger.error("Startup copies %s failed: %s", name, exc, exc_info=True)
            return _error(_SYSTEM_ERROR, 500)
        return web.json_response({**self._payload(self._m.state()), **shape(result)})

    async def get_state(self, request: web.Request) -> web.Response:
        state = await asyncio.to_thread(self._m.rescan if request.query.get("rescan") == "1" else self._m.state)
        return web.json_response(self._payload(state))

    async def remove(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if body is None:
            return _error("ожидался объект", 400)
        if set(body) == {"all"} and body["all"] is True:
            return await self._act("remove-all", self._m.remove_all, lambda outcome: {"removed": outcome["removed"], "results": outcome["results"]})
        if set(body) == {"id"} and isinstance(body["id"], str) and _ID_RE.fullmatch(body["id"]):
            return await self._act("remove", lambda: self._m.remove(body["id"]))
        return _error('ожидалось {"id": "..."} или {"all": true}', 400)

    async def move_autostart(self, request: web.Request) -> web.Response:
        return await self._act("move-autostart", self._m.move_autostart)

    async def close(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if body is None or set(body) != {"id"} or not isinstance(body["id"], str) or not _ID_RE.fullmatch(body["id"]):
            return _error('ожидалось {"id": "..."}', 400)
        return await self._act("close", lambda: self._m.close(body["id"]))

    async def import_data(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if body is None or not set(body) <= {"dir", "confirm"} or not isinstance(body.get("dir"), str) or not isinstance(body.get("confirm", False), bool):
            return _error('ожидалось {"dir": "...", "confirm": true|false}', 400)
        state = await asyncio.to_thread(self._m.state)
        wanted = sc.norm(body["dir"])
        match = [f for f in state["findings"] if f["copyDir"] and sc.norm(f["copyDir"]) == wanted]
        if not match:
            return _error("такой копии нет в списке, обновите список", 404)
        if any(f["kind"] == "process" for f in match):
            return _error("эта копия сейчас запущена: сначала закройте её", 409)
        folder = Path(match[0]["copyDir"])
        if not copy_import.is_sentinel_copy(folder) or not copy_import.has_importable_data(folder):
            return _error("в этой копии нечего переносить", 400)
        own = copy_import.own_data_state(self._project, self._defaults)
        if (own["nonDefaultConfig"] or own["signedIn"]) and body.get("confirm") is not True:
            return web.json_response({"status": "confirm_required", "ownData": own}, status=409)
        try:
            await asyncio.to_thread(copy_import.stage_import, self._project, folder)
        except copy_import.ImportRefused as exc:
            return _error(str(exc), 400)
        except Exception as exc:
            logger.error("Staging the import from %s failed: %s", folder, exc, exc_info=True)
            return _error(_SYSTEM_ERROR, 500)
        logger.info("Import of the data of %s staged; it is applied at the next start", match[0]["copyDir"])
        return web.json_response({"status": "ok", "restart_required": True})

    async def dismiss_hint(self, request: web.Request) -> web.Response:
        try:
            await asyncio.to_thread(self._dismiss_hint)
        except Exception as exc:
            logger.error("Saving the installer hint dismissal failed: %s", exc, exc_info=True)
            return _error(_SYSTEM_ERROR, 500)
        return web.json_response({"status": "ok"})
