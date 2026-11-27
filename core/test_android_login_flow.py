"""How twitch.py uses the android login: the client follows the saved login, a dead android token falls back to the TV client,
and a new login handed over while a device code is waiting ends that wait."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import asyncio
import logging
import shutil
import tempfile
import unittest
from contextlib import asynccontextmanager
from http.cookies import SimpleCookie
from pathlib import Path
from time import monotonic
from types import SimpleNamespace
from unittest import mock

import aiohttp

import android_login as al
import twitch
from constants import ClientType, State
from exceptions import ReloadRequest

TOKEN = "tok4android7secret9value1234"
TV_TOKEN = "tvtoken123456789012345"


def run(coro):
    return asyncio.run(coro)


class ClientFollowsTheSavedLogin(unittest.TestCase):
    def _session_client(self, prepare):
        tmp = Path(tempfile.mkdtemp(prefix="android_flow_"))
        self.addCleanup(shutil.rmtree, tmp, True)
        path = tmp / "cookies.jar"

        async def go():
            jar = aiohttp.CookieJar()
            prepare(jar, path)
            fake = SimpleNamespace(_session=None, settings=SimpleNamespace(connection_quality=1, proxy=None), _client_type=ClientType.SMARTBOX)
            with mock.patch.object(twitch, "COOKIES_PATH", path):
                session = await twitch.Twitch.get_session(fake)
            try:
                return fake._client_type, session.headers["User-Agent"]
            finally:
                await session.close()
        return run(go())

    def test_a_saved_android_login_starts_the_android_client(self):
        def prepare(jar, path):
            al.apply_android_token(jar, TOKEN)
            twitch.save_cookie_jar(jar, path)
        client, agent = self._session_client(prepare)
        self.assertIs(client, ClientType.ANDROID_APP)
        self.assertEqual(agent, ClientType.ANDROID_APP.USER_AGENT)

    def test_without_a_file_or_with_a_tv_login_the_tv_client_stays(self):
        def tv(jar, path):
            jar.update_cookies({"auth-token": TV_TOKEN}, response_url=ClientType.SMARTBOX.CLIENT_URL)
            twitch.save_cookie_jar(jar, path)
        for prepare in (lambda jar, path: None, tv):
            client, agent = self._session_client(prepare)
            self.assertIs(client, ClientType.SMARTBOX)
            self.assertEqual(agent, ClientType.SMARTBOX.USER_AGENT)

    def test_a_real_tv_login_with_a_twitch_tv_wide_token_cookie_stays_tv(self):
        # a real device-code cookie file (2026-11-27) also holds auth-token for the whole twitch.tv domain, which www.twitch.tv sees
        def tv_real(jar, path):
            jar.update_cookies({"auth-token": TV_TOKEN}, response_url=ClientType.SMARTBOX.CLIENT_URL)
            wide = SimpleCookie()
            wide["auth-token"] = TV_TOKEN
            wide["auth-token"]["domain"] = "twitch.tv"
            jar.update_cookies(wide, response_url=ClientType.SMARTBOX.CLIENT_URL)
            twitch.save_cookie_jar(jar, path)
        client, agent = self._session_client(tv_real)
        self.assertIs(client, ClientType.SMARTBOX)
        self.assertEqual(agent, ClientType.SMARTBOX.USER_AGENT)


class FakeResponse:
    def __init__(self, status, payload=None, text=""):
        self.status, self._payload, self._text = status, payload, text

    async def json(self):
        return self._payload

    async def text(self, encoding=None):
        return self._text


def make_auth(jar, validate_answers):
    """An _AuthState wired to fakes: GET of the client page answers 200, /oauth2/validate answers from the list in order."""
    calls = []
    answers = list(validate_answers)

    @asynccontextmanager
    async def request(method, url, **kwargs):
        calls.append((method, str(url)))
        yield FakeResponse(200, text="<html>") if "validate" not in str(url) else answers.pop(0)

    session = SimpleNamespace(cookie_jar=jar, headers={})
    fake_twitch = SimpleNamespace(
        _client_type=ClientType.ANDROID_APP,
        get_session=mock.AsyncMock(return_value=session),
        request=request,
        gui=SimpleNamespace(login=SimpleNamespace(update=mock.Mock()), help=SimpleNamespace(_invalidate_button=mock.Mock())),
    )
    auth = twitch._AuthState(fake_twitch)
    auth.device_id = "dev"
    auth._oauth_login = mock.AsyncMock(return_value=TV_TOKEN)
    return auth, fake_twitch, calls


def good(client):
    return FakeResponse(200, {"client_id": client.CLIENT_ID, "user_id": "5", "login": "mort"})


class DeadAndroidTokenFallsBackToTv(unittest.TestCase):
    def _validate(self, answers):
        tmp = Path(tempfile.mkdtemp(prefix="android_flow_"))
        self.addCleanup(shutil.rmtree, tmp, True)

        async def go():
            jar = aiohttp.CookieJar()
            al.apply_android_token(jar, TOKEN)
            auth, fake_twitch, calls = make_auth(jar, answers)
            with mock.patch.object(twitch, "save_cookie_jar", return_value=True), mock.patch.object(twitch, "COOKIES_PATH", tmp / "cookies.jar"):
                await auth._validate()
            return auth, fake_twitch
        return run(go())

    def test_an_android_token_twitch_refuses_falls_back_to_the_tv_login(self):
        auth, fake_twitch = self._validate([FakeResponse(401), good(ClientType.SMARTBOX)])
        self.assertIs(fake_twitch._client_type, ClientType.SMARTBOX)
        auth._oauth_login.assert_awaited_once()
        self.assertEqual(auth.user_id, 5)

    def test_a_token_of_an_unknown_client_falls_back_to_the_tv_login(self):
        web = FakeResponse(200, {"client_id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "user_id": "5", "login": "mort"})
        auth, fake_twitch = self._validate([web, good(ClientType.SMARTBOX)])
        self.assertIs(fake_twitch._client_type, ClientType.SMARTBOX)
        auth._oauth_login.assert_awaited_once()

    def test_a_token_that_belongs_to_the_tv_client_switches_to_it_and_keeps_the_login(self):
        # the saved login was taken for android but Twitch says it is the TV client's: no new code, nothing wiped
        auth, fake_twitch = self._validate([good(ClientType.SMARTBOX)])
        self.assertIs(fake_twitch._client_type, ClientType.SMARTBOX)
        auth._oauth_login.assert_not_awaited()
        self.assertEqual(auth.access_token, TOKEN)
        self.assertEqual(fake_twitch.get_session.return_value.headers["User-Agent"], ClientType.SMARTBOX.USER_AGENT)

    def test_a_good_android_token_keeps_the_android_client_and_asks_for_no_code(self):
        auth, fake_twitch = self._validate([good(ClientType.ANDROID_APP)])
        self.assertIs(fake_twitch._client_type, ClientType.ANDROID_APP)
        auth._oauth_login.assert_not_awaited()
        self.assertEqual(auth.access_token, TOKEN)


class NewLoginEndsTheCodeWait(unittest.TestCase):
    def test_a_restart_asked_while_a_device_code_waits_reloads_the_client(self):
        @asynccontextmanager
        async def request(method, url, **kwargs):
            yield FakeResponse(200, {"device_code": "d", "user_code": "ABCD", "interval": 0, "expires_in": 600,
                                     "verification_uri": "https://www.twitch.tv/activate?device-code=ABCD"})

        async def ask_enter_code(uri, code):
            fake_twitch._state = State.RESTART  # the android sign-in arrives while the code is shown

        fake_twitch = SimpleNamespace(_client_type=ClientType.SMARTBOX, _state=State.IDLE, _state_change=asyncio.Event(), request=request,
                                      gui=SimpleNamespace(login=SimpleNamespace(ask_enter_code=ask_enter_code)))
        auth = twitch._AuthState(fake_twitch)
        auth.device_id = "dev"
        with self.assertRaises(ReloadRequest):
            run(asyncio.wait_for(auth._oauth_login(), timeout=5))

    def test_oauth_login_wakes_immediately_on_restart(self):
        @asynccontextmanager
        async def request(method, url, **kwargs):
            yield FakeResponse(200, {"device_code": "d", "user_code": "ABCD", "interval": 30, "expires_in": 600,
                                     "verification_uri": "https://www.twitch.tv/activate?device-code=ABCD"})

        async def go():
            entered = asyncio.Event()

            async def ask_enter_code(uri, code):
                entered.set()

            fake_twitch = SimpleNamespace(
                _client_type=ClientType.SMARTBOX, _state=State.IDLE, _state_change=asyncio.Event(),
                request=request, gui=SimpleNamespace(login=SimpleNamespace(ask_enter_code=ask_enter_code)),
            )
            auth = twitch._AuthState(fake_twitch)
            auth.device_id = "dev"

            async def trigger_restart():
                await entered.wait()
                await asyncio.sleep(0.02)
                twitch.Twitch.change_state(fake_twitch, State.RESTART)

            started = monotonic()
            task = asyncio.create_task(trigger_restart())
            try:
                with self.assertRaises(ReloadRequest):
                    await asyncio.wait_for(auth._oauth_login(), timeout=2)
            finally:
                await task
            self.assertLess(monotonic() - started, 1.0)

        run(go())


class ReloadResetsTheRestartState(unittest.TestCase):
    def test_the_restart_that_reloaded_the_client_is_not_left_behind(self):
        fake = SimpleNamespace(settings=SimpleNamespace(dump=False), _state=State.RESTART, shutdown=mock.AsyncMock())
        fake._run = mock.AsyncMock(side_effect=[ReloadRequest(), None])
        run(twitch.Twitch.run(fake))
        self.assertIs(fake._state, State.IDLE)

    def test_restart_is_not_overwritten_by_routine_state_changes(self):
        fake = SimpleNamespace(_state=State.IDLE, _state_change=asyncio.Event())
        twitch.Twitch.change_state(fake, State.RESTART)
        twitch.Twitch.change_state(fake, State.INVENTORY_FETCH)
        self.assertIs(fake._state, State.RESTART)
        twitch.Twitch.change_state(fake, State.EXIT)
        self.assertIs(fake._state, State.EXIT)


class RequestDebugRedaction(unittest.TestCase):
    def test_request_debug_log_redacts_oauth_header(self):
        async def go():
            resp = SimpleNamespace(status=200, read=mock.AsyncMock(return_value=b""), release=mock.Mock())
            session = SimpleNamespace(
                timeout=SimpleNamespace(total=10),
                request=lambda m, u, **kw: resp,
            )
            fake = SimpleNamespace(
                get_session=mock.AsyncMock(return_value=session),
                settings=SimpleNamespace(proxy=None),
                gui=SimpleNamespace(close_requested=False, coro_unless_closed=lambda coro: asyncio.sleep(0, result=coro)),
            )
            with self.assertLogs("TwitchDrops", level=logging.DEBUG) as logs:
                async with twitch.Twitch.request(fake, "GET", "https://id.twitch.tv/oauth2/validate", headers={"Authorization": f"OAuth {TOKEN}"}):
                    pass
            self.assertNotIn(TOKEN, "\n".join(logs.output))
            self.assertIn("[REDACTED]", "\n".join(logs.output))

        run(go())


if __name__ == "__main__":
    unittest.main()
