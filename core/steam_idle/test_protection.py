"""Offline checks for the anti-cheat checker: the fetch function and the clock are injected, no request is ever made."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path

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

    async def test_no_cache_path_works_in_memory(self):
        checker = self.checker((200, body(5)), path=None)
        self.assertEqual(await checker.classify(5), CLEAR)
        self.assertEqual(await checker.classify(5), CLEAR)
        self.assertEqual(len(self.net.calls), 1)


if __name__ == "__main__":
    unittest.main()
