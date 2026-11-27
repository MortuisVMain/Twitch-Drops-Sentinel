"""Sign-in with the Android app client: the token from the twitch.tv window is checked, stored with its client and picked up on start."""
import asyncio
import logging
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import aiohttp
from aiohttp import web
from aiohttp.test_utils import TestServer

import android_login as al
import dpapi
from constants import ClientType

TOKEN = "tok4android7secret9value1234"
TV_TOKEN = "tvtoken123456789012345"


def run(coro):
    return asyncio.run(coro)


async def _validate_via(status, payload, token=TOKEN):
    """Runs validate_android_token against a local stand-in for id.twitch.tv; returns (result or error, what the server saw)."""
    seen = {}

    async def handler(request):
        seen["auth"] = request.headers.get("Authorization")
        return web.json_response(payload, status=status)

    app = web.Application()
    app.router.add_get("/oauth2/validate", handler)
    async with TestServer(app) as server, aiohttp.ClientSession() as session:
        try:
            return await al.validate_android_token(token, session, url=str(server.make_url("/oauth2/validate"))), seen
        except al.TokenError as err:
            return err, seen


class ValidateTests(unittest.TestCase):
    def test_a_token_issued_for_the_android_client_is_accepted(self):
        result, seen = run(_validate_via(200, {"client_id": ClientType.ANDROID_APP.CLIENT_ID, "user_id": "123", "login": "mort"}))
        self.assertEqual(result, {"user_id": 123, "login": "mort"})
        self.assertEqual(seen["auth"], f"OAuth {TOKEN}")

    def test_a_token_of_another_client_is_rejected(self):
        result, _ = run(_validate_via(200, {"client_id": ClientType.SMARTBOX.CLIENT_ID, "user_id": "123", "login": "mort"}))
        self.assertIsInstance(result, al.TokenRejected)

    def test_an_invalid_token_is_rejected(self):
        result, _ = run(_validate_via(401, {"status": 401, "message": "invalid access token"}))
        self.assertIsInstance(result, al.TokenRejected)

    def test_a_server_error_is_a_failed_check_not_a_rejection(self):
        result, _ = run(_validate_via(503, {}))
        self.assertIsInstance(result, al.TokenCheckFailed)
        self.assertNotIsInstance(result, al.TokenRejected)

    def test_a_malformed_token_is_rejected_without_a_request(self):
        for bad in ("", "short", "has space in it 123456", "x" * 500, None, 12345):
            with self.subTest(bad=bad):
                result, seen = run(_validate_via(200, {}, token=bad))
                self.assertIsInstance(result, al.TokenRejected)
                self.assertEqual(seen, {})

    def test_the_token_is_never_logged_or_put_in_an_error_message(self):
        with self.assertLogs("TwitchDrops", level=logging.DEBUG) as logs:
            logging.getLogger("TwitchDrops").debug("start")
            for status, payload in ((200, {"client_id": "other", "user_id": "1"}), (401, {}), (503, {}),
                                    (200, {"client_id": ClientType.ANDROID_APP.CLIENT_ID, "user_id": "1", "login": "m"})):
                result, _ = run(_validate_via(status, payload))
                self.assertNotIn(TOKEN, str(result))
        self.assertNotIn(TOKEN, "\n".join(logs.output))


class ClientFromJarTests(unittest.TestCase):
    def test_a_jar_with_an_android_token_selects_the_android_client(self):
        async def go():
            jar = aiohttp.CookieJar()
            al.apply_android_token(jar, TOKEN)
            return al.client_for_jar(jar)
        self.assertIs(run(go()), ClientType.ANDROID_APP)

    def test_a_tv_token_or_an_empty_jar_keeps_the_tv_client(self):
        async def go():
            jar = aiohttp.CookieJar()
            empty = al.client_for_jar(jar)
            # what the device-code login stores: the cookies of android.tv.twitch.tv
            jar.update_cookies({"auth-token": TV_TOKEN, "persistent": "1"}, response_url=ClientType.SMARTBOX.CLIENT_URL)
            return empty, al.client_for_jar(jar)
        empty, tv = run(go())
        self.assertIs(empty, ClientType.SMARTBOX)
        self.assertIs(tv, ClientType.SMARTBOX)

    def test_applying_a_token_replaces_the_old_account(self):
        async def go():
            jar = aiohttp.CookieJar()
            jar.update_cookies({"auth-token": TV_TOKEN}, response_url=ClientType.SMARTBOX.CLIENT_URL)
            al.apply_android_token(jar, TOKEN)
            return [c.value for c in jar if c.key == "auth-token"]
        self.assertEqual(run(go()), [TOKEN])


class SignInTests(unittest.TestCase):
    """Persistence round trip with the client type, fail-closed DPAPI, and the order validate -> save -> live jar."""

    def setUp(self):
        tmp = Path(tempfile.mkdtemp(prefix="android_login_"))
        self.addCleanup(shutil.rmtree, tmp, True)
        self.path = tmp / "cookies.jar"

    def test_the_round_trip_restores_the_android_client_from_the_file(self):
        async def go():
            jar = aiohttp.CookieJar()
            with mock.patch.object(al, "validate_android_token", mock.AsyncMock(return_value={"user_id": 7, "login": "mort"})):
                info = await al.sign_in_with_token(TOKEN, mock.Mock(), jar, self.path)
            fresh = aiohttp.CookieJar()
            dpapi.load_cookie_jar(fresh, self.path)
            return info, al.client_for_jar(fresh), [c.value for c in fresh if c.key == "auth-token"], al.client_for_jar(jar)
        info, client, tokens, live = run(go())
        self.assertEqual(info, {"user_id": 7, "login": "mort"})
        self.assertIs(client, ClientType.ANDROID_APP)
        self.assertEqual(tokens, [TOKEN])
        self.assertIs(live, ClientType.ANDROID_APP, "the running session's jar is switched too, so its shutdown does not save the old account")

    def test_a_rejected_token_changes_nothing(self):
        async def go():
            jar = aiohttp.CookieJar()
            jar.update_cookies({"auth-token": TV_TOKEN}, response_url=ClientType.SMARTBOX.CLIENT_URL)
            self.path.write_bytes(b"OLD")
            with mock.patch.object(al, "validate_android_token", mock.AsyncMock(side_effect=al.TokenRejected("no"))):
                with self.assertRaises(al.TokenRejected):
                    await al.sign_in_with_token(TOKEN, mock.Mock(), jar, self.path)
            return al.client_for_jar(jar), self.path.read_bytes()
        client, content = run(go())
        self.assertIs(client, ClientType.SMARTBOX)
        self.assertEqual(content, b"OLD")

    def test_a_failed_encryption_keeps_the_old_file_and_the_live_session(self):
        async def go():
            jar = aiohttp.CookieJar()
            self.path.write_bytes(b"OLD")
            with mock.patch.object(al, "validate_android_token", mock.AsyncMock(return_value={"user_id": 7, "login": "m"})), \
                    mock.patch.object(al, "save_cookie_jar", return_value=False):
                with self.assertRaises(al.CookieSaveFailed):
                    await al.sign_in_with_token(TOKEN, mock.Mock(), jar, self.path)
            return al.client_for_jar(jar), self.path.read_bytes()
        client, content = run(go())
        self.assertIs(client, ClientType.SMARTBOX)
        self.assertEqual(content, b"OLD")

    def test_on_windows_the_file_is_protected_and_never_holds_the_token(self):
        async def go():
            with mock.patch.object(al, "validate_android_token", mock.AsyncMock(return_value={"user_id": 7, "login": "m"})):
                await al.sign_in_with_token(TOKEN, mock.Mock(), aiohttp.CookieJar(), self.path)
        run(go())
        if dpapi.os.name == "nt":
            data = self.path.read_bytes()
            self.assertTrue(data.startswith(dpapi.DPAPI_MAGIC))
            self.assertNotIn(TOKEN.encode(), data)


class LogRedactionTests(unittest.TestCase):
    def test_state_bridge_redacts_oauth_and_bearer_headers(self):
        from gui_headless import SentinelStateBridge
        bridge = SentinelStateBridge()
        bridge.add_log("DEBUG", f"headers={{'Authorization': 'OAuth {TOKEN}'}}")
        bridge.add_log("DEBUG", f"headers={{'Authorization': 'Bearer {TOKEN}'}}")
        joined = "\n".join(entry["message"] for entry in bridge.recent_logs)
        self.assertNotIn(TOKEN, joined)
        self.assertIn("OAuth [REDACTED]", joined)
        self.assertIn("Bearer [REDACTED]", joined)


if __name__ == "__main__":
    unittest.main()
