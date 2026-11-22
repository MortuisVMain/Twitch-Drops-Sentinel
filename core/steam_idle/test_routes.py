"""Handler checks for the /api/v1/steam-idle routes: a fake request and a stub controller, no server."""
import json
import unittest

from steam_idle.activity import ActivityLog
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

    def set_farm_settings(self, **given):
        self.calls.append(("set_farm_settings", given))
        return self.refusal

    def release_held(self, app_id):
        self.calls.append(("release_held", app_id))
        return self.refusal

    def deny_add(self, app_id):
        self.calls.append(("deny_add", app_id))
        return self.refusal

    def deny_remove(self, app_id):
        self.calls.append(("deny_remove", app_id))
        return self.refusal

    def __getattr__(self, name):
        def command():
            self.calls.append((name, None))
            return self.refusal
        return command


class FakeRequest:
    def __init__(self, body=None, error=None, query=None):
        self.body, self.error, self.query = body, error, query or {}

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

    async def test_denylist_add_and_remove_take_exactly_one_app_id(self):
        self.assertEqual(reply(await self.routes.denylist_add(FakeRequest({"appId": 5}))), (200, {"ok": True}))
        self.assertEqual(reply(await self.routes.denylist_remove(FakeRequest({"appId": 6}))), (200, {"ok": True}))
        self.assertEqual(self.controller.calls, [("deny_add", 5), ("deny_remove", 6)])
        for bad in (None, [], {}, {"appId": "5"}, {"appId": True}, {"appId": 0}, {"appId": 2 ** 32}, {"appId": 5, "x": 1}):
            for call in (self.routes.denylist_add, self.routes.denylist_remove):
                self.assertEqual(reply(await call(FakeRequest(bad))), (400, {"error": "invalid_request"}))
        self.assertEqual(len(self.controller.calls), 2)

    async def test_denylist_refusals_answer_409_with_the_code(self):
        routes = SteamIdleRoutes(StubController("denylist_full"))
        self.assertEqual(reply(await routes.denylist_add(FakeRequest({"appId": 5}))), (409, {"error": "denylist_full"}))

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

    async def test_farm_settings_pass_the_hours_through(self):
        for body in ({"hoursUntilDrops": 2.5}, {"hoursUntilDrops": 0}):
            self.assertEqual(reply(await self.routes.farm_settings(FakeRequest(body))), (200, {"ok": True}))
        self.assertEqual(self.controller.calls, [("set_farm_settings", {"hours_until_drops": 2.5}),
                                                 ("set_farm_settings", {"hours_until_drops": 0})])

    async def test_farm_settings_take_any_known_subset_of_the_three_settings(self):
        bodies = [{"pauseWhilePlaying": False}, {"notify": True},
                  {"hoursUntilDrops": 1, "pauseWhilePlaying": True, "notify": False}]
        for body in bodies:
            self.assertEqual(reply(await self.routes.farm_settings(FakeRequest(body))), (200, {"ok": True}))
        self.assertEqual(self.controller.calls, [
            ("set_farm_settings", {"pause_while_playing": False}), ("set_farm_settings", {"notify": True}),
            ("set_farm_settings", {"hours_until_drops": 1, "pause_while_playing": True, "notify": False})])

    async def test_farm_settings_reject_malformed_bodies_with_400(self):
        bad = [FakeRequest(error=json.JSONDecodeError("x", "", 0)), FakeRequest(None), FakeRequest([]), FakeRequest({}),
               FakeRequest({"hoursUntilDrops": 1, "extra": 1}), FakeRequest({"hours": 1}),
               FakeRequest({"pauseWhilePlaying": True, "extra": 1}), FakeRequest({"Notify": True})]
        for request in bad:
            self.assertEqual(reply(await self.routes.farm_settings(request)), (400, {"error": "invalid_request"}))
        self.assertEqual(self.controller.calls, [])

    async def test_farm_settings_invalid_value_answers_400_and_a_refusal_409(self):
        routes = SteamIdleRoutes(StubController("invalid_request"))
        self.assertEqual(reply(await routes.farm_settings(FakeRequest({"hoursUntilDrops": -1}))),
                         (400, {"error": "invalid_request"}))
        routes = SteamIdleRoutes(StubController("module_disabled"))
        self.assertEqual(reply(await routes.farm_settings(FakeRequest({"hoursUntilDrops": 1}))),
                         (409, {"error": "module_disabled"}))

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


class ActivityRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.log = ActivityLog()
        self.controller = StubController("module_disabled")  # the log must work with the module off
        self.routes = SteamIdleRoutes(self.controller, self.log)
        for text in ("a", "b", "c"):
            self.log.add("info", text)

    async def test_log_returns_all_entries_and_the_last_seq_without_after(self):
        status, body = reply(await self.routes.log(FakeRequest()))
        self.assertEqual(status, 200)
        self.assertEqual([e["text"] for e in body["entries"]], ["a", "b", "c"])
        self.assertEqual((body["lastSeq"], set(body["entries"][0])), (3, {"seq", "ts", "level", "text"}))
        self.assertEqual(self.controller.calls, [])

    async def test_log_after_returns_only_newer_entries(self):
        status, body = reply(await self.routes.log(FakeRequest(query={"after": "2"})))
        self.assertEqual((status, [e["text"] for e in body["entries"]], body["lastSeq"]), (200, ["c"], 3))
        status, body = reply(await self.routes.log(FakeRequest(query={"after": "3"})))
        self.assertEqual((status, body), (200, {"entries": [], "lastSeq": 3}))

    async def test_log_rejects_a_non_integer_after_with_400(self):
        for bad in ("x", "1.5", "", "-1", "1e3", "99999999999999999999999"):
            self.assertEqual(reply(await self.routes.log(FakeRequest(query={"after": bad}))),
                             (400, {"error": "invalid_request"}), bad)

    async def test_clear_empties_the_log_and_keeps_the_seq(self):
        self.assertEqual(reply(await self.routes.log_clear(FakeRequest())), (200, {"ok": True}))
        self.assertEqual(reply(await self.routes.log(FakeRequest())), (200, {"entries": [], "lastSeq": 3}))


if __name__ == "__main__":
    unittest.main()
