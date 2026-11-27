"""POST /api/auth/android-token: the host hands over the token from the twitch.tv window; the service checks, stores and restarts the client."""
import asyncio
import inspect
import logging
import types as _t
import unittest
from unittest import mock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import android_login as al
import sentinel_service as s
from constants import ClientType, State

SECRET = "secret-token-123"
TOKEN = "tok4android7secret9value1234"
HEADERS = {"X-Sentinel-Token": SECRET, "Content-Type": "application/json"}


def run(coro):
    return asyncio.run(coro)


def make_fake(client=True):
    twitch_client = mock.Mock(_session=None) if client else None
    return _t.SimpleNamespace(api_token=SECRET, twitch_client=twitch_client, broadcast_ws=mock.AsyncMock())


def post(fake, body, headers=HEADERS, sign_in=None, raw=None):
    async def go():
        app = web.Application(middlewares=[_t.MethodType(s.SentinelSupervisor.cors_middleware, fake)])
        app.router.add_post("/api/auth/android-token", _t.MethodType(s.SentinelSupervisor.handle_android_token, fake))
        async with TestClient(TestServer(app)) as client:
            with mock.patch.object(s, "sign_in_with_token", sign_in or mock.AsyncMock(return_value={"user_id": 7, "login": "mort"})):
                resp = await client.post("/api/auth/android-token", data=raw if raw is not None else body, headers=headers)
                return resp.status, await resp.json()
    return run(go())


class AndroidLoginRouteTests(unittest.TestCase):
    def test_the_route_is_registered_and_needs_the_token(self):
        self.assertIn('add_post("/api/auth/android-token", self.handle_android_token)', inspect.getsource(s.SentinelSupervisor._setup_routes))
        fake = make_fake()
        sign_in = mock.AsyncMock()
        status, _ = post(fake, '{"token": "%s"}' % TOKEN, headers={"Content-Type": "application/json"}, sign_in=sign_in)
        self.assertEqual(status, 401)
        sign_in.assert_not_awaited()
        fake.twitch_client.change_state.assert_not_called()

    def test_a_good_token_is_stored_and_the_client_restarts_without_echoing_the_token(self):
        fake = make_fake()
        s.STATE_BRIDGE.oauth_code = "CODE"
        s.STATE_BRIDGE.oauth_uri = "https://www.twitch.tv/activate"
        sign_in = mock.AsyncMock(return_value={"user_id": 7, "login": "mort"})
        status, body = post(fake, '{"token": "%s"}' % TOKEN, sign_in=sign_in)
        self.assertEqual(status, 200)
        self.assertTrue(body["success"])
        self.assertEqual(body["login"], "mort")
        self.assertNotIn(TOKEN, str(body))
        self.assertEqual(sign_in.await_args.args[0], TOKEN)
        self.assertIsNone(s.STATE_BRIDGE.oauth_code)
        self.assertIsNone(s.STATE_BRIDGE.oauth_uri)
        fake.twitch_client.stop_watching.assert_called_once()
        fake.twitch_client.change_state.assert_called_once_with(State.RESTART)
        fake.broadcast_ws.assert_awaited()

    def test_a_rejected_token_is_a_400_and_nothing_restarts(self):
        fake = make_fake()
        status, body = post(fake, '{"token": "%s"}' % TOKEN, sign_in=mock.AsyncMock(side_effect=al.TokenRejected("other client")))
        self.assertEqual(status, 400)
        self.assertFalse(body["success"])
        self.assertNotIn(TOKEN, str(body))
        fake.twitch_client.change_state.assert_not_called()

    def test_a_twitch_outage_is_a_502_and_a_failed_save_a_500_and_nothing_restarts(self):
        for error, expected in ((al.TokenCheckFailed("down"), 502), (al.CookieSaveFailed("dpapi"), 500)):
            fake = make_fake()
            status, body = post(fake, '{"token": "%s"}' % TOKEN, sign_in=mock.AsyncMock(side_effect=error))
            self.assertEqual(status, expected)
            self.assertFalse(body["success"])
            fake.twitch_client.change_state.assert_not_called()

    def test_a_body_without_a_token_is_a_400(self):
        for raw in ("not json", "[]", "{}", '{"token": 5}'):
            sign_in = mock.AsyncMock(side_effect=al.TokenRejected("bad"))
            status, _ = post(make_fake(), None, raw=raw, sign_in=sign_in)
            self.assertEqual(status, 400, raw)
            sign_in.assert_not_awaited()

    def test_the_token_is_not_logged(self):
        with self.assertLogs(level=logging.DEBUG) as logs:
            logging.getLogger("TwitchDrops").debug("start")
            post(make_fake(), '{"token": "%s"}' % TOKEN)
            post(make_fake(), '{"token": "%s"}' % TOKEN, sign_in=mock.AsyncMock(side_effect=al.TokenRejected("no")))
        self.assertNotIn(TOKEN, "\n".join(logs.output))

    def test_the_state_names_the_login_client(self):
        self.assertIsNone(al.auth_client_name(None))
        self.assertEqual(al.auth_client_name(_t.SimpleNamespace(_client_type=ClientType.ANDROID_APP)), "android")
        self.assertEqual(al.auth_client_name(_t.SimpleNamespace(_client_type=ClientType.SMARTBOX)), "tv")
        self.assertIn('"auth_client"', inspect.getsource(s.SentinelSupervisor.get_full_state))


if __name__ == "__main__":
    unittest.main()
