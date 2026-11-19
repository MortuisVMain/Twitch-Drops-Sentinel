"""aiohttp handlers for /api/v1/steam-idle: thin adapters that map controller refusals to HTTP 409."""
import re

from aiohttp import web

from .achievement_queue import GamePlan, LibraryPlan, SelectedPlan
from .achievements import MAX_UNLOCK_NAMES, AchievementsError, valid_api_name

_UINT32_MAX = 0xFFFFFFFF
_MAX_EXCLUDE = 100000
_INVALID = {"error": "invalid_request"}


def _app_id(value: object) -> bool:
    return type(value) is int and 1 <= value <= _UINT32_MAX


def _start_plan(body: object):
    """The plan of one of the three start shapes, or None for anything else (exact key sets, no mixing)."""
    if not isinstance(body, dict):
        return None
    keys = set(body)
    if keys == {"appId", "names"}:
        names = body["names"]
        if (_app_id(body["appId"]) and isinstance(names, list) and 1 <= len(names) <= MAX_UNLOCK_NAMES
                and all(valid_api_name(name) for name in names)):
            return SelectedPlan(body["appId"], names)
    elif keys == {"appId", "all"}:
        if _app_id(body["appId"]) and body["all"] is True:
            return GamePlan(body["appId"])
    elif keys <= {"library", "exclude", "confirm"} and {"library", "confirm"} <= keys:
        exclude = body.get("exclude", [])
        if (body["library"] is True and body["confirm"] == "ALL" and isinstance(exclude, list)
                and len(exclude) <= _MAX_EXCLUDE and all(_app_id(app_id) for app_id in exclude)):
            return LibraryPlan((), exclude)
    return None


class SteamIdleRoutes:
    def __init__(self, controller):
        self._c = controller

    @staticmethod
    def _reply(refusal: str | None, status: int = 200) -> web.Response:
        if refusal is not None:
            return web.json_response({"error": refusal}, status=409)
        return web.json_response({"ok": True}, status=status)

    async def state(self, request: web.Request) -> web.Response:
        return web.json_response(self._c.state())

    async def ack(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            body = None
        accepted = body.get("accepted") if isinstance(body, dict) else None
        if type(accepted) is not bool:
            return web.json_response({"error": "bad_request"}, status=400)
        return self._reply(self._c.acknowledge(accepted))

    async def login(self, request: web.Request) -> web.Response:
        return self._reply(self._c.login(), 202)

    async def check(self, request: web.Request) -> web.Response:
        return self._reply(self._c.check(), 202)

    async def scan(self, request: web.Request) -> web.Response:
        return self._reply(self._c.scan(), 202)

    async def farm_start(self, request: web.Request) -> web.Response:
        return self._reply(self._c.start())

    async def farm_stop(self, request: web.Request) -> web.Response:
        return self._reply(self._c.stop())

    async def farm_pause(self, request: web.Request) -> web.Response:
        return self._reply(self._c.pause())

    async def farm_resume(self, request: web.Request) -> web.Response:
        return self._reply(self._c.resume())

    async def farm_skip(self, request: web.Request) -> web.Response:
        return self._reply(self._c.skip())

    async def farm_release(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if not isinstance(body, dict) or set(body) != {"appId"} or not _app_id(body["appId"]):
            return web.json_response(_INVALID, status=400)
        return self._reply(self._c.release_held(body["appId"]))

    async def denylist_add(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if not isinstance(body, dict) or set(body) != {"appId"} or not _app_id(body["appId"]):
            return web.json_response(_INVALID, status=400)
        return self._reply(self._c.deny_add(body["appId"]))

    async def denylist_remove(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if not isinstance(body, dict) or set(body) != {"appId"} or not _app_id(body["appId"]):
            return web.json_response(_INVALID, status=400)
        return self._reply(self._c.deny_remove(body["appId"]))

    # achievements
    @staticmethod
    async def _body(request: web.Request) -> object:
        try:
            return await request.json()
        except ValueError:
            return None

    async def achievements_ack(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        accepted = body.get("accepted") if isinstance(body, dict) and set(body) == {"accepted"} else None
        if type(accepted) is not bool:
            return web.json_response(_INVALID, status=400)
        return self._reply(self._c.acknowledge_achievements(accepted))

    async def achievements_settings(self, request: web.Request) -> web.Response:
        body = await self._body(request)
        if not isinstance(body, dict) or set(body) != {"minMinutes", "maxMinutes", "skipHidden"}:
            return web.json_response(_INVALID, status=400)
        refusal = self._c.set_achievements_settings(body["minMinutes"], body["maxMinutes"], body["skipHidden"])
        if refusal == "invalid_request":
            return web.json_response(_INVALID, status=400)
        return self._reply(refusal)

    async def library_scan(self, request: web.Request) -> web.Response:
        return self._reply(self._c.library_scan(), 202)

    async def library(self, request: web.Request) -> web.Response:
        games = self._c.library_games()
        if games is None:
            return web.json_response({"error": "not_ready"}, status=409)
        return web.json_response({"games": games})

    async def achievements_read(self, request: web.Request) -> web.Response:
        raw = request.query.get("appId", "")
        if not re.fullmatch(r"[1-9][0-9]{0,9}", raw) or not _app_id(int(raw)):
            return web.json_response(_INVALID, status=400)
        try:
            result = await self._c.achievements_of(int(raw))
        except AchievementsError as error:
            return web.json_response({"error": "read_failed", "reason": error.code}, status=502)
        if isinstance(result, str):
            return web.json_response({"error": result}, status=409)
        return web.json_response({"appId": int(raw), "achievements": result})

    async def achievements_start(self, request: web.Request) -> web.Response:
        plan = _start_plan(await self._body(request))
        if plan is None:
            return web.json_response(_INVALID, status=400)
        return self._reply(self._c.start_achievements(plan))

    async def achievements_resume_interrupted(self, request: web.Request) -> web.Response:
        """Body: none, `{}` or `{"confirm": "ALL"}`; the word is what a library resume needs."""
        body = await self._body(request)
        if body is not None and not (isinstance(body, dict) and (not body or body == {"confirm": "ALL"})):
            return web.json_response(_INVALID, status=400)
        refusal = self._c.resume_interrupted(body == {"confirm": "ALL"})
        if refusal == "invalid_request":
            return web.json_response(_INVALID, status=400)
        return self._reply(refusal)

    async def achievements_discard_interrupted(self, request: web.Request) -> web.Response:
        return self._reply(self._c.discard_interrupted())

    async def achievements_stop(self, request: web.Request) -> web.Response:
        return self._reply(self._c.stop_achievements())

    async def achievements_pause(self, request: web.Request) -> web.Response:
        return self._reply(self._c.pause_achievements())

    async def achievements_resume(self, request: web.Request) -> web.Response:
        return self._reply(self._c.resume_achievements())

    async def achievements_skip(self, request: web.Request) -> web.Response:
        return self._reply(self._c.skip_achievements())
