"""Offline checks for the anti-cheat checker: the fetch function and the clock are injected, no request is ever made."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from steam_idle import protection
from steam_idle.protection import BUILTIN, CLEAR, PROTECTED, UNKNOWN, ProtectionChecker


def body(app_id, categories=(1,), success=True):
    data = {"name": "x", "categories": [{"id": c, "description": "d"} for c in categories]}
    return json.dumps({str(app_id): {"success": success, "data": data} if success else {"success": False}})


class Net:
    """Scripted fetch: pops one (status, text) or exception per call and records every url and call time."""

    def __init__(self, clock, *script):
        self.clock, self.script, self.calls = clock, list(script), []

    async def __call__(self, url):
        self.calls.append((url, self.clock.now))
        item = self.script.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


class Clock:
    def __init__(self):
        self.now = 1_000_000.0
        self.sleeps = []

    def __call__(self):
        return self.now

    async def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class TableTests(unittest.TestCase):
    def test_table_has_names_and_only_positive_ids(self):
        self.assertIn(730, BUILTIN)
        self.assertEqual(BUILTIN[730], "Counter-Strike 2")
        self.assertTrue(all(type(k) is int and k > 0 and v for k, v in BUILTIN.items()))

    def test_is_builtin(self):
        self.assertTrue(protection.is_builtin(730))
        self.assertFalse(protection.is_builtin(100))


    def test_third_party_anti_cheat_games_are_listed_with_the_store_names(self):
        expected = {252950: "Rocket League®", 1097150: "Fall Guys", 2767030: "Marvel Rivals",
                    1517290: "Battlefield™ 2042", 976730: "Halo: The Master Chief Collection",
                    3240220: "Grand Theft Auto V Enhanced", 1665460: "eFootball™", 1623730: "Palworld",
                    2073850: "THE FINALS", 1240440: "Halo Infinite"}
        for app_id, name in expected.items():
            with self.subTest(app_id=app_id):
                self.assertEqual(BUILTIN.get(app_id), name)


class UserDenylistCleanTests(unittest.TestCase):
    def test_valid_ids_are_kept_in_order_without_duplicates(self):
        self.assertEqual(protection.clean_user_denylist([5, 6, 5, 4294967295]), [5, 6, 4294967295])
        self.assertEqual(protection.clean_user_denylist([]), [])
        self.assertEqual(protection.clean_user_denylist(None), [])

    def test_bad_entries_are_dropped_with_one_warning(self):
        with self.assertLogs("steam_idle.protection", level="WARNING") as logged:
            result = protection.clean_user_denylist(["abc", True, 0, -1, 2 ** 32, 1.5, None, "7", 8, 8])
        self.assertEqual(result, [7, 8])  # a plain digit string from a hand-edited file is still an app id: fail closed
        self.assertEqual(len(logged.records), 1)
        self.assertIn("7 invalid", logged.records[0].getMessage())  # the count of ignored entries

    def test_a_value_that_is_not_a_list_is_ignored_with_a_warning(self):
        with self.assertLogs("steam_idle.protection", level="WARNING"):
            self.assertEqual(protection.clean_user_denylist("5"), [])

    def test_the_list_is_capped_at_500(self):
        with self.assertLogs("steam_idle.protection", level="WARNING") as logged:
            result = protection.clean_user_denylist([*range(1, 601), "x"])  # invalid and over the cap: still one warning
        self.assertEqual(result, list(range(1, 501)))
        self.assertEqual(len(logged.records), 1)
        self.assertEqual(protection.MAX_USER_DENYLIST, 500)


class FakeResponse:
    def __init__(self, status=200, chunks=(b"{}",), content_length=None):
        self.status, self.content_length = status, content_length
        self.content = self
        self._chunks = chunks
        self.read_bytes = 0

    async def iter_chunked(self, size):
        for chunk in self._chunks:
            self.read_bytes += len(chunk)
            yield chunk


class Yields:
    """An async context manager that yields `value`."""

    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, *exc):
        return False


class FakeSession(Yields):
    """Stands in for aiohttp.ClientSession: records the get() arguments and serves one scripted response."""

    def __init__(self, response):
        super().__init__(self)
        self.response, self.get_calls = response, []

    def get(self, url, **kwargs):
        self.get_calls.append((url, kwargs))
        return Yields(self.response)


class HttpFetchTests(unittest.IsolatedAsyncioTestCase):
    def serve(self, response):
        self.session = FakeSession(response)
        patcher = mock.patch.object(protection.aiohttp, "ClientSession", lambda *a, **k: self.session)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_redirects_are_not_followed(self):
        self.serve(FakeResponse(chunks=(b"{}",)))
        await protection.http_fetch("https://store.steampowered.com/x")
        self.assertIs(self.session.get_calls[0][1].get("allow_redirects"), False)

    async def test_a_status_other_than_200_is_returned_without_reading_the_body(self):
        response = FakeResponse(status=302, chunks=(b"x" * 10,))
        self.serve(response)
        status, text = await protection.http_fetch("u")
        self.assertEqual((status, text, response.read_bytes), (302, "", 0))

    async def test_a_body_is_read_and_decoded(self):
        self.serve(FakeResponse(chunks=(b'{"a":', b' 1}')))
        self.assertEqual(await protection.http_fetch("u"), (200, '{"a": 1}'))

    async def test_a_body_over_one_megabyte_is_refused_without_reading_all_of_it(self):
        response = FakeResponse(chunks=[b"x" * 400_000] * 10)
        self.serve(response)
        with self.assertRaises(ValueError):
            await protection.http_fetch("u")
        self.assertLess(response.read_bytes, 1_500_000)

    async def test_a_declared_length_over_one_megabyte_is_refused_before_reading(self):
        response = FakeResponse(chunks=(b"{}",), content_length=5_000_000)
        self.serve(response)
        with self.assertRaises(ValueError):
            await protection.http_fetch("u")
        self.assertEqual(response.read_bytes, 0)

    async def test_a_body_of_exactly_one_megabyte_is_accepted(self):
        self.serve(FakeResponse(chunks=[b"x" * 500_000] * 2))
        status, text = await protection.http_fetch("u")
        self.assertEqual((status, len(text)), (200, 1_000_000))


class CheckerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "cache.json"
        self.clock = Clock()

    def checker(self, *script, path="default"):
        self.net = Net(self.clock, *script)
        return ProtectionChecker(self.path if path == "default" else path, self.net, self.clock, self.clock.sleep)

    async def test_builtin_is_protected_without_a_request(self):
        checker = self.checker()
        self.assertEqual(await checker.classify(730), PROTECTED)
        self.assertEqual(self.net.calls, [])

    async def test_category_8_is_protected_and_cached_without_expiry(self):
        checker = self.checker((200, body(5, (1, 8))))
        self.assertEqual(await checker.classify(5), PROTECTED)
        self.clock.now += 400 * 86400
        self.assertEqual(await self.checker().classify(5), PROTECTED)  # a new checker reads the disk cache
        self.assertEqual(len(self.net.calls), 0)

    async def test_request_url_has_the_app_id_and_the_filters_only(self):
        checker = self.checker((200, body(5)))
        await checker.classify(5)
        self.assertEqual(self.net.calls[0][0],
                         "https://store.steampowered.com/api/appdetails?appids=5&filters=basic,categories")

    async def test_clear_is_cached_then_expires_after_30_days(self):
        checker = self.checker((200, body(5)), (200, body(5, (1, 8))))
        self.assertEqual(await checker.classify(5), CLEAR)
        self.clock.now += 29 * 86400
        self.assertEqual(await checker.classify(5), CLEAR)
        self.assertEqual(len(self.net.calls), 1)
        self.clock.now += 2 * 86400
        self.assertEqual(await checker.classify(5), PROTECTED)
        self.assertEqual(len(self.net.calls), 2)

    async def test_cache_file_is_written_with_the_verdicts_only(self):
        checker = self.checker((200, body(5)), (200, body(6, (8,))))
        await checker.classify(5)
        await checker.classify(6)
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual({k: v["status"] for k, v in data["entries"].items()}, {"5": "clear", "6": "protected"})

    async def test_failures_are_unknown_and_not_cached(self):
        cases = [(500, "x"), (429, "slow down"), (200, "not json"), (200, "[]"), (200, json.dumps({"5": []})),
                 (200, body(5, success=False)), (200, json.dumps({"5": {"success": True, "data": {"categories": 3}}})),
                 asyncio.TimeoutError(), OSError("down")]
        for case in cases:
            with self.subTest(case=repr(case)):
                checker = self.checker(case, (200, body(5)))
                with self.assertLogs("steam_idle.protection", level="WARNING") as logs:
                    self.assertEqual(await checker.classify(5), UNKNOWN)
                self.assertIn("5", logs.output[0])
                self.assertEqual(await checker.classify(5), CLEAR)  # not cached: the next call asks again
                self.assertEqual(len(self.net.calls), 2)
                self.path.unlink(missing_ok=True)

    async def test_a_hanging_fetch_times_out_as_unknown(self):
        async def hang(url):
            await asyncio.sleep(30)
        checker = ProtectionChecker(self.path, hang, self.clock, self.clock.sleep, timeout=0.05)
        with self.assertLogs("steam_idle.protection", level="WARNING"):
            self.assertEqual(await checker.classify(5), UNKNOWN)

    async def test_requests_are_spaced_at_least_1_5_seconds(self):
        checker = self.checker((200, body(1)), (200, body(2)), (200, body(3)))
        for app_id in (1, 2, 3):
            await checker.classify(app_id)
        times = [t for _, t in self.net.calls]
        self.assertGreaterEqual(times[1] - times[0], 1.5)
        self.assertGreaterEqual(times[2] - times[1], 1.5)
        self.assertLessEqual(max(self.clock.sleeps), 1.5)

    async def test_one_request_at_a_time(self):
        running, peak = 0, 0

        async def slow(url):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1
            return 200, body(int(url.split("appids=")[1].split("&")[0]))
        checker = ProtectionChecker(self.path, slow, self.clock, self.clock.sleep)
        results = await asyncio.gather(*(checker.classify(i) for i in (1, 2, 3)))
        self.assertEqual(results, [CLEAR] * 3)
        self.assertEqual(peak, 1)

    async def test_corrupt_cache_is_logged_and_ignored(self):
        self.path.write_text("{broken", encoding="utf-8")
        checker = self.checker((200, body(5)))
        with self.assertLogs("steam_idle.protection", level="ERROR"):
            self.assertEqual(await checker.classify(5), CLEAR)

    async def test_a_cache_of_another_version_is_logged_set_aside_and_ignored(self):
        self.path.write_text(json.dumps({"version": 2, "entries": {"5": {"status": "protected", "checkedAt": 1}}}),
                             encoding="utf-8")
        checker = self.checker((200, body(5)))
        with self.assertLogs("steam_idle.protection", level="ERROR"):
            self.assertEqual(await checker.classify(5), CLEAR)  # the entry of the unknown version is not trusted
        self.assertTrue(self.path.with_name(self.path.name + ".corrupt").exists())

    async def test_a_cache_without_a_version_is_ignored_too(self):
        self.path.write_text(json.dumps({"entries": {"5": {"status": "protected", "checkedAt": 1}}}), encoding="utf-8")
        checker = self.checker((200, body(5)))
        with self.assertLogs("steam_idle.protection", level="ERROR"):
            self.assertEqual(await checker.classify(5), CLEAR)

    async def test_after_a_429_or_a_5xx_the_next_request_waits_30_seconds(self):
        for status in (429, 500, 503):
            with self.subTest(status=status):
                self.clock.sleeps.clear()
                checker = self.checker((status, "x"), (200, body(5)), path=None)
                with self.assertLogs("steam_idle.protection", level="WARNING"):
                    self.assertEqual(await checker.classify(5), UNKNOWN)
                self.assertEqual(await checker.classify(5), CLEAR)
                self.assertEqual(self.clock.sleeps, [30.0])
                self.assertGreaterEqual(self.net.calls[1][1] - self.net.calls[0][1], 30.0)

    async def test_other_failures_keep_the_normal_spacing_and_the_back_off_is_paid_once(self):
        checker = self.checker((404, "x"), (200, body(1)), (429, "x"), (200, body(2)), (200, body(3)), path=None)
        with self.assertLogs("steam_idle.protection", level="WARNING"):
            await checker.classify(5)
            await checker.classify(1)
            await checker.classify(6)
            await checker.classify(2)
            await checker.classify(3)
        self.assertEqual(self.clock.sleeps, [1.5, 1.5, 30.0, 1.5])

    async def test_no_cache_path_works_in_memory(self):
        checker = self.checker((200, body(5)), path=None)
        self.assertEqual(await checker.classify(5), CLEAR)
        self.assertEqual(await checker.classify(5), CLEAR)
        self.assertEqual(len(self.net.calls), 1)


if __name__ == "__main__":
    unittest.main()
