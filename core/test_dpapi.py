"""DPAPI protection fails closed: a failed encrypt never turns into a plaintext cookie file."""
import asyncio
import logging
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import aiohttp
from yarl import URL

import dpapi


def _failing_windll():
    return mock.Mock(crypt32=mock.Mock(CryptProtectData=mock.Mock(return_value=0)))


class ProtectFailsClosed(unittest.TestCase):
    def test_api_failure_raises_and_logs_error(self):
        with mock.patch.object(dpapi.os, "name", "nt"), \
                mock.patch.object(dpapi.ctypes, "windll", _failing_windll(), create=True), \
                self.assertLogs("TwitchDrops", level=logging.ERROR):
            with self.assertRaises(dpapi.DpapiError):
                dpapi.protect_bytes(b"secret")

    def test_exception_inside_api_call_raises(self):
        windll = mock.Mock(crypt32=mock.Mock(CryptProtectData=mock.Mock(side_effect=OSError("boom"))))
        with mock.patch.object(dpapi.os, "name", "nt"), \
                mock.patch.object(dpapi.ctypes, "windll", windll, create=True), \
                self.assertLogs("TwitchDrops", level=logging.ERROR):
            with self.assertRaises(dpapi.DpapiError):
                dpapi.protect_bytes(b"secret")

    def test_non_windows_returns_plaintext_and_warns_once(self):
        dpapi._warned_unprotected = False
        with mock.patch.object(dpapi.os, "name", "posix"):
            with self.assertLogs("TwitchDrops", level=logging.WARNING) as logs:
                self.assertEqual(dpapi.protect_bytes(b"a"), b"a")
                self.assertEqual(dpapi.protect_bytes(b"b"), b"b")
        self.assertEqual(len(logs.records), 1)


class SaveCookieJarKeepsPreviousFile(unittest.TestCase):
    def test_failed_protect_leaves_old_file_and_does_not_raise(self):
        path = Path(tempfile.mkdtemp(prefix="dpapi_")) / "cookies.jar"
        path.write_bytes(b"OLD-CONTENT")

        async def run():
            jar = aiohttp.CookieJar()
            jar.update_cookies({"auth-token": "tok_plain_999"}, response_url=URL("https://www.twitch.tv"))
            with mock.patch.object(dpapi.os, "name", "nt"), \
                    mock.patch.object(dpapi.ctypes, "windll", _failing_windll(), create=True), \
                    self.assertLogs("TwitchDrops", level=logging.ERROR):
                return dpapi.save_cookie_jar(jar, path)

        self.assertFalse(asyncio.run(run()))
        self.assertEqual(path.read_bytes(), b"OLD-CONTENT")
        self.assertEqual([p.name for p in path.parent.iterdir()], ["cookies.jar"])


if __name__ == "__main__":
    unittest.main()
