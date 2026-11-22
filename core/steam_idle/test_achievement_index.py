"""Offline checks for the achievement index: the fetch, the clock and the sleep are injected, no request is ever made."""
import asyncio
import json
import tempfile
import unittest
import urllib.parse
from pathlib import Path

from steam_idle.achievement_index import BATCH, HAS_TTL_SECONDS, NONE_TTL_SECONDS, AchievementIndex, parse_items


def items(*entries):
    """entries: (appid, feature ids) or (appid, None) for an app the store does not know."""
    return json.dumps({"response": {"store_items": [
        {"appid": a, "success": 1, "categories": {"feature_categoryids": list(f)}} if f is not None else {"id": a, "success": 42}
        for a, f in entries]}})


class Net:
    def __init__(self, *script):
        self.script, self.calls = list(script), []

    async def __call__(self, url):
        self.calls.append(url)
        item = self.script.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


class Clock:
    def __init__(self):
        self.now, self.sleeps = 1_000_000.0, []

    def __call__(self):
        return self.now

    async def sleep(self, seconds):
        self.sleeps.append(seconds)


def asked_ids(url):
    body = json.loads(urllib.parse.unquote(url.split("input_json=", 1)[1]))
    return [entry["appid"] for entry in body["ids"]]


class AchievementIndexTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.clock = Clock()

    def make(self, net):
        return AchievementIndex(self.dir / "index.json", net, self.clock, self.clock.sleep)

    def test_category_22_means_achievements_and_unknown_apps_stay_unknown(self):
        net = Net((200, items((440, [22, 29]), (730, [29, 8]), (999, None))))
        index = self.make(net)
        asyncio.run(index.fill([440, 730, 999]))
        self.assertEqual((index.known(440), index.known(730), index.known(999)), (True, False, None))
        self.assertEqual(asked_ids(net.calls[0]), [440, 730, 999])
        # an unknown app is not asked again in this session, a known one never until it expires
        self.assertEqual(index.missing([440, 730, 999]), [])

    def test_cache_survives_a_restart_and_expires(self):
        asyncio.run(self.make(Net((200, items((1, [22]), (2, []))))).fill([1, 2]))
        index = self.make(Net())
        self.assertEqual((index.known(1), index.known(2)), (True, False))
        self.clock.now += NONE_TTL_SECONDS
        self.assertEqual((index.known(1), index.known(2)), (True, None))
        self.clock.now += HAS_TTL_SECONDS
        self.assertIsNone(index.known(1))

    def test_batches_with_a_gap_and_a_failed_batch_does_not_stop_the_rest(self):
        ids = list(range(1, BATCH * 2 + 6))
        net = Net(asyncio.TimeoutError(), (500, ""), (200, items((ids[-1], [22]))))
        index = self.make(net)
        with self.assertLogs("steam_idle.achievement_index", "WARNING") as logs:
            asyncio.run(index.fill(ids))
        self.assertEqual([len(asked_ids(url)) for url in net.calls], [BATCH, BATCH, 5])
        self.assertEqual(self.clock.sleeps, [1.0, 1.0])
        self.assertTrue(index.known(ids[-1]))
        self.assertIsNone(index.known(1))
        self.assertEqual(len(logs.records), 2)

    def test_a_live_read_overrides_the_store(self):
        index = self.make(Net((200, items((5, [22])))))
        asyncio.run(index.fill([5]))
        index.record(5, 0, 0)
        self.assertFalse(self.make(Net()).known(5))
        index.record(6, 3, 10)
        self.assertEqual(self.make(Net()).progress(6), {"achieved": 3, "total": 10})
        self.assertIsNone(index.progress(7))

    def test_a_store_refresh_keeps_the_progress_of_a_live_read(self):
        index = self.make(Net((200, items((6, [22])))))
        index.record(6, 3, 10)
        self.clock.now += HAS_TTL_SECONDS
        asyncio.run(index.fill([6]))
        self.assertEqual((index.known(6), index.progress(6)), (True, {"achieved": 3, "total": 10}))

    def test_broken_cache_is_ignored_with_an_error(self):
        (self.dir / "index.json").write_text("{nope", encoding="utf-8")
        with self.assertLogs("steam_idle.achievement_index", "ERROR"):
            self.assertIsNone(self.make(Net()).known(1))

    def test_parse_rejects_a_body_without_items(self):
        with self.assertRaises(ValueError):
            parse_items(json.dumps({"response": {}}))


if __name__ == "__main__":
    unittest.main()
