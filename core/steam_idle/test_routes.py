"""Handler checks for the /api/v1/steam-idle routes: a fake request and a stub controller, no server."""
import json
import unittest

from steam_idle.routes import SteamIdleRoutes


class StubController:
    def __init__(self, refusal=None):
        self.refusal, self.calls = refusal, []

    def state(self):
        return {"available": True}

    def acknowledge(self, accepted):
        self.calls.append(("acknowledge", accepted))
        return self.refusal

    def acknowledge_achievements(self, accepted):
        self.calls.append(("acknowledge_achievements", accepted))
        return self.refusal

    def release_held(self, app_id):
        self.calls.append(("release_held", app_id))
        return self.refusal

    def __getattr__(self, name):
        def command():
            self.calls.append((name, None))
            return self.refusal
        return command


class FakeRequest:
    def __init__(self, body=None, error=None):
        self.body, self.error = body, error

    async def json(self):
        if self.error:
            raise self.error
        return self.body


def reply(response):
    return response.status, json.loads(response.text)


class RoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.controller = StubController()
        self.routes = SteamIdleRoutes(self.controller)

    async def test_state_is_the_controller_payload(self):
        self.assertEqual(reply(await self.routes.state(FakeRequest())), (200, {"available": True}))

    async def test_ack_stores_the_choice(self):
        self.assertEqual(reply(await self.routes.ack(FakeRequest({"accepted": True}))), (200, {"ok": True}))
        await self.routes.ack(FakeRequest({"accepted": False}))
        self.assertEqual(self.controller.calls, [("acknowledge", True), ("acknowledge", False)])

    async def test_a_refused_ack_answers_409_with_the_code(self):
        routes = SteamIdleRoutes(StubController("module_disabled"))
        self.assertEqual(reply(await routes.ack(FakeRequest({"accepted": True}))), (409, {"error": "module_disabled"}))
        self.assertEqual(reply(await routes.achievements_ack(FakeRequest({"accepted": True}))),
                         (409, {"error": "module_disabled"}))

    async def test_ack_rejects_malformed_bodies_with_400(self):
        bad = [FakeRequest(error=json.JSONDecodeError("x", "", 0)), FakeRequest([]), FakeRequest({}),
               FakeRequest({"accepted": "yes"}), FakeRequest({"accepted": 1}), FakeRequest(None)]
        for request in bad:
            self.assertEqual(reply(await self.routes.ack(request)), (400, {"error": "bad_request"}))
        self.assertEqual(self.controller.calls, [])

    async def test_login_and_check_answer_202(self):
        self.assertEqual(reply(await self.routes.login(FakeRequest())), (202, {"ok": True}))
        self.assertEqual(reply(await self.routes.check(FakeRequest())), (202, {"ok": True}))

    async def test_scan_answers_202(self):
        self.assertEqual(reply(await self.routes.scan(FakeRequest())), (202, {"ok": True}))
        self.assertEqual(self.controller.calls, [("scan", None)])

    async def test_farm_commands_answer_200_and_call_the_matching_method(self):
        for name in ("start", "stop", "pause", "resume", "skip"):
            self.assertEqual(reply(await getattr(self.routes, f"farm_{name}")(FakeRequest())), (200, {"ok": True}))
        self.assertEqual([name for name, _ in self.controller.calls], ["start", "stop", "pause", "resume", "skip"])

    async def test_refusals_answer_409_with_the_code(self):
        routes = SteamIdleRoutes(StubController("risk_not_acknowledged"))
        for handler in (routes.login, routes.check, routes.scan, routes.farm_start, routes.farm_stop, routes.farm_pause,
                        routes.farm_resume, routes.farm_skip):
            self.assertEqual(reply(await handler(FakeRequest())), (409, {"error": "risk_not_acknowledged"}))

    async def test_release_answers_200_and_passes_the_app_id(self):
        self.assertEqual(reply(await self.routes.farm_release(FakeRequest({"appId": 20}))), (200, {"ok": True}))
        self.assertEqual(self.controller.calls, [("release_held", 20)])

    async def test_release_refusal_is_the_usual_409_shape(self):
        routes = SteamIdleRoutes(StubController("not_held"))
        self.assertEqual(reply(await routes.farm_release(FakeRequest({"appId": 20}))), (409, {"error": "not_held"}))

    async def test_release_rejects_bad_bodies_with_400(self):
        bad = [FakeRequest(error=json.JSONDecodeError("x", "", 0)), FakeRequest(None), FakeRequest([]), FakeRequest({}),
               FakeRequest({"appId": "20"}), FakeRequest({"appId": True}), FakeRequest({"appId": 0}),
               FakeRequest({"appId": 2 ** 32}), FakeRequest({"appId": 1.5}), FakeRequest({"appId": 20, "extra": 1})]
        for request in bad:
            self.assertEqual(reply(await self.routes.farm_release(request)), (400, {"error": "invalid_request"}))
        self.assertEqual(self.controller.calls, [])


if __name__ == "__main__":
    unittest.main()
