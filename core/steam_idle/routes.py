"""aiohttp handlers for /api/v1/steam-idle: thin adapters that map controller refusals to HTTP 409."""
from aiohttp import web


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
        self._c.acknowledge(accepted)
        return web.json_response({"ok": True})

    async def login(self, request: web.Request) -> web.Response:
        return self._reply(self._c.login(), 202)

    async def check(self, request: web.Request) -> web.Response:
        return self._reply(self._c.check(), 202)

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
