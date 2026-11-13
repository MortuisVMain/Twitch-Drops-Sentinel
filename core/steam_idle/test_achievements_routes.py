"""Handler checks for the achievements routes: a fake request and a stub controller, no server."""
import json
import unittest

from steam_idle.achievement_queue import GamePlan, LibraryPlan, SelectedPlan
from steam_idle.achievements import AchievementsError
from steam_idle.routes import SteamIdleRoutes


class Stub:
    def __init__(self, refusal=None):
        self.refusal, self.calls = refusal, []
        self.games, self.achievements, self.read_error = [{"appId": 1, "name": "a", "playtimeMinutes": 3}], [{"apiName": "A"}], None

    def _record(self, name, *args):
        self.calls.append((name, *args))
        return self.refusal

    def acknowledge_achievements(self, accepted):
        self.calls.append(("ack", accepted))

    def set_achievements_settings(self, low, high, skip):
        self.calls.append(("settings", low, high, skip))
        return self.refusal

    def library_scan(self):
        return self._record("library_scan")

    def library_games(self):
        return None if self.refusal == "not_ready" else self.games

    async def achievements_of(self, app_id):
        self.calls.append(("read", app_id))
        if self.read_error:
            raise self.read_error
        return self.refusal if self.refusal else self.achievements

    def start_achievements(self, plan):
        return self._record("start", plan)

    def stop_achievements(self):
        return self._record("stop")

    def pause_achievements(self):
        return self._record("pause")

    def resume_achievements(self):
        return self._record("resume")

    def skip_achievements(self):
        return self._record("skip")


class FakeRequest:
    def __init__(self, body=None, error=None, query=None):
        self.body, self.error, self.query = body, error, query or {}

    async def json(self):
        if self.error:
            raise self.error
        return self.body


def reply(response):
    return response.status, json.loads(response.text)


INVALID = (400, {"error": "invalid_request"})


class AchievementsRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.stub = Stub()
        self.routes = SteamIdleRoutes(self.stub)

    async def test_ack(self):
        self.assertEqual(reply(await self.routes.achievements_ack(FakeRequest({"accepted": True}))), (200, {"ok": True}))
        await self.routes.achievements_ack(FakeRequest({"accepted": False}))
        self.assertEqual(self.stub.calls, [("ack", True), ("ack", False)])

    async def test_ack_malformed_bodies_are_400(self):
        for request in (FakeRequest(error=json.JSONDecodeError("x", "", 0)), FakeRequest([]), FakeRequest({}), FakeRequest(None),
                        FakeRequest({"accepted": "yes"}), FakeRequest({"accepted": 1}), FakeRequest({"accepted": True, "x": 1})):
            self.assertEqual(reply(await self.routes.achievements_ack(request)), INVALID)
        self.assertEqual(self.stub.calls, [])

    async def test_settings_pass_through_and_invalid_values_are_400(self):
        body = {"minMinutes": 1, "maxMinutes": 2, "skipHidden": False}
        self.assertEqual(reply(await self.routes.achievements_settings(FakeRequest(body))), (200, {"ok": True}))
        self.assertEqual(self.stub.calls, [("settings", 1, 2, False)])
        for bad in ([], None, {}, {"minMinutes": 1, "maxMinutes": 2}, {**body, "x": 1}):
            self.assertEqual(reply(await self.routes.achievements_settings(FakeRequest(bad))), INVALID)
        self.assertEqual(reply(await self.routes.achievements_settings(FakeRequest(error=ValueError()))), INVALID)
        self.stub.refusal = "invalid_request"  # the controller's range validation
        self.assertEqual(reply(await self.routes.achievements_settings(FakeRequest(body))), INVALID)

    async def test_library_scan_202_and_library_list(self):
        self.assertEqual(reply(await self.routes.library_scan(FakeRequest())), (202, {"ok": True}))
        self.assertEqual(reply(await self.routes.library(FakeRequest())), (200, {"games": self.stub.games}))
        self.stub.refusal = "not_ready"
        self.assertEqual(reply(await self.routes.library(FakeRequest())), (409, {"error": "not_ready"}))

    async def test_read_happy_path_and_refusal_and_failure(self):
        self.assertEqual(reply(await self.routes.achievements_read(FakeRequest(query={"appId": "730"}))),
                         (200, {"appId": 730, "achievements": [{"apiName": "A"}]}))
        self.stub.refusal = "achievements_not_acknowledged"
        self.assertEqual(reply(await self.routes.achievements_read(FakeRequest(query={"appId": "730"}))),
                         (409, {"error": "achievements_not_acknowledged"}))
        self.stub.refusal, self.stub.read_error = None, AchievementsError("stats_unavailable")
        self.assertEqual(reply(await self.routes.achievements_read(FakeRequest(query={"appId": "730"}))),
                         (502, {"error": "read_failed", "reason": "stats_unavailable"}))

    async def test_read_rejects_a_bad_app_id_without_calling_the_controller(self):
        for value in ("", "abc", "0", "-1", "1.5", "007", " 7", "4294967296", "99999999999", "1e3"):
            self.assertEqual(reply(await self.routes.achievements_read(FakeRequest(query={"appId": value}))), INVALID, value)
        self.assertEqual(reply(await self.routes.achievements_read(FakeRequest())), INVALID)
        self.assertEqual(self.stub.calls, [])

    async def test_start_shapes_build_the_matching_plan(self):
        shapes = [({"appId": 7, "names": ["A", "B"]}, SelectedPlan(7, ["A", "B"])),
                  ({"appId": 7, "all": True}, GamePlan(7)),
                  ({"library": True, "exclude": [1, 2], "confirm": "ALL"}, LibraryPlan((), [1, 2])),
                  ({"library": True, "confirm": "ALL"}, LibraryPlan((), []))]
        for body, plan in shapes:
            self.assertEqual(reply(await self.routes.achievements_start(FakeRequest(body))), (200, {"ok": True}))
            self.assertEqual(self.stub.calls[-1], ("start", plan))

    async def test_start_malformed_bodies_are_400(self):
        names = lambda n: {"appId": 7, "names": n}  # noqa: E731
        bad = [None, [], "x", {}, {"appId": 7}, {"appId": "7", "all": True}, {"appId": 0, "all": True},
               {"appId": True, "all": True}, {"appId": 2 ** 32, "all": True}, {"appId": 7, "all": False},
               {"appId": 7, "all": 1}, {"appId": 7, "all": True, "names": ["A"]}, {"appId": 7, "all": True, "x": 1},
               names([]), names("A"), names(None), names([1]), names([None]), names([""]), names(["a\nb"]),
               names(["x" * 300]), names([f"N{i}" for i in range(201)]), names({"A": 1}),
               {"library": True, "exclude": [], "confirm": "all"}, {"library": True, "exclude": []},
               {"library": True, "confirm": "ALL", "exclude": [0]}, {"library": True, "confirm": "ALL", "exclude": ["1"]},
               {"library": True, "confirm": "ALL", "exclude": 5}, {"library": True, "confirm": "ALL", "exclude": [True]},
               {"library": False, "confirm": "ALL"}, {"library": 1, "confirm": "ALL"}, {"confirm": "ALL"},
               {"library": True, "confirm": "ALL", "appId": 7}]
        for body in bad:
            with self.subTest(body=str(body)[:60]):
                self.assertEqual(reply(await self.routes.achievements_start(FakeRequest(body))), INVALID)
        self.assertEqual(reply(await self.routes.achievements_start(FakeRequest(error=ValueError()))), INVALID)
        self.assertEqual(self.stub.calls, [])

    async def test_200_names_are_accepted(self):
        body = {"appId": 7, "names": [f"N{i}" for i in range(200)]}
        self.assertEqual(reply(await self.routes.achievements_start(FakeRequest(body))), (200, {"ok": True}))

    async def test_commands_answer_200_and_call_the_matching_method(self):
        for name in ("stop", "pause", "resume", "skip"):
            self.assertEqual(reply(await getattr(self.routes, f"achievements_{name}")(FakeRequest())), (200, {"ok": True}))
        self.assertEqual([call[0] for call in self.stub.calls], ["stop", "pause", "resume", "skip"])

    async def test_refusals_answer_409_with_the_code_for_every_route(self):
        for code in ("risk_not_acknowledged", "achievements_not_acknowledged", "unavailable", "steam_not_running",
                     "steam_signed_out", "community_signed_out", "account_mismatch", "busy"):
            routes = SteamIdleRoutes(Stub(code))
            requests = {
                routes.library_scan: FakeRequest(), routes.achievements_stop: FakeRequest(),
                routes.achievements_pause: FakeRequest(), routes.achievements_resume: FakeRequest(),
                routes.achievements_skip: FakeRequest(),
                routes.achievements_start: FakeRequest({"appId": 7, "all": True}),
                routes.achievements_read: FakeRequest(query={"appId": "7"}),
            }
            for handler, request in requests.items():
                self.assertEqual(reply(await handler(request)), (409, {"error": code}), (code, handler.__name__))


if __name__ == "__main__":
    unittest.main()
