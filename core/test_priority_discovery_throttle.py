"""The v3 per-game discovery (directory + AvailableDrops of up to 20 channels for every priority game without a campaign) ran on
every inventory sync, i.e. every 2 minutes in idle: now at most once per TV_DISCOVERY_INTERVAL, its finds reused in between."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

import twitch

NOW = 50_000.0


def make(priority=("Alpha", "Beta")):
    tw = object.__new__(twitch.Twitch)
    tw.settings = SimpleNamespace(priority=list(priority))
    tw.gui = SimpleNamespace(status=SimpleNamespace(update=lambda *_: None))
    tw._priority_discovery_at = None
    tw._priority_discovered = {}
    tw._priority_searched = set()
    calls = []

    async def discover(game):
        calls.append(game)
        return [{"id": "c-" + game, "name": game, "game": {"id": "1", "name": game}}]

    tw.discover_campaigns_for_game = discover
    tw.calls = calls
    return tw


def run(tw, inventory, now):
    with mock.patch.object(twitch, "monotonic", return_value=now):
        asyncio.run(tw._discover_missing_priority(inventory))
    return inventory


class Throttle(unittest.TestCase):
    def test_runs_once_per_interval_and_reuses_its_finds(self):
        tw = make()
        first = run(tw, {}, NOW)
        self.assertEqual(set(first), {"c-Alpha", "c-Beta"})
        self.assertEqual(len(tw.calls), 2)
        again = run(tw, {}, NOW + 120)
        self.assertEqual(set(again), {"c-Alpha", "c-Beta"}, "the cached finds are merged between passes")
        self.assertEqual(len(tw.calls), 2, "no new Twitch requests within the interval")
        run(tw, {}, NOW + twitch.TV_DISCOVERY_INTERVAL + 1)
        self.assertEqual(len(tw.calls), 4)

    def test_a_campaign_twitch_already_listed_is_not_overwritten(self):
        tw = make(priority=("Alpha",))
        real = {"id": "c-Alpha", "name": "real", "game": {"id": "1", "name": "Other"}}
        inv = run(tw, {"c-Alpha": real}, NOW)
        self.assertIs(inv["c-Alpha"], real)

    def test_a_failed_pass_is_logged_keeps_the_old_finds_and_retries_soon(self):
        tw = make(priority=("Alpha",))
        run(tw, {}, NOW)

        async def broken(game):
            raise RuntimeError("twitch down")
        tw.discover_campaigns_for_game = broken
        failed_at = NOW + twitch.TV_DISCOVERY_INTERVAL + 1
        with self.assertLogs("TwitchDrops", level="WARNING"):
            inv = run(tw, {}, failed_at)
        self.assertIn("c-Alpha", inv, "the last good finds stay")
        good = make(priority=("Alpha",))
        tw.discover_campaigns_for_game = good.discover_campaigns_for_game
        run(tw, {}, failed_at + twitch.DISCOVERY_RETRY_AFTER - 10)
        self.assertEqual(good.calls, [], "not on every sync")
        run(tw, {}, failed_at + twitch.DISCOVERY_RETRY_AFTER + 1)
        self.assertEqual(good.calls, ["Alpha"], "but again after the short retry delay")

    def test_an_ended_campaign_in_the_cache_is_not_merged(self):
        tw = make(priority=("Alpha",))
        tw._priority_discovery_at = NOW
        tw._priority_discovered = {"old": {"id": "old", "endAt": "2020-01-01T00:00:00Z", "game": {"name": "Alpha"}}}
        self.assertNotIn("old", run(tw, {}, NOW + 60))

    def test_an_empty_answer_does_not_wipe_the_last_finds(self):
        # discover_campaigns_for_game swallows its own errors and returns [], so a failing pass looks like "nothing found"
        tw = make(priority=("Alpha",))
        run(tw, {}, NOW)

        async def silent_failure(game):
            return []
        tw.discover_campaigns_for_game = silent_failure
        inv = run(tw, {}, NOW + twitch.TV_DISCOVERY_INTERVAL + 1)
        self.assertIn("c-Alpha", inv)

    def test_a_game_newly_added_to_the_queue_is_searched_at_the_next_sync(self):
        tw = make(priority=("Alpha",))
        run(tw, {}, NOW)
        tw.settings.priority.append("Beta")
        inv = run(tw, {}, NOW + 120)
        self.assertEqual(tw.calls, ["Alpha", "Beta"], "only the new game, not the whole list again")
        self.assertIn("c-Beta", inv)

    def test_games_that_already_have_a_campaign_are_not_searched(self):
        tw = make(priority=("Alpha", "Beta"))
        run(tw, {"x": {"id": "x", "game": {"name": "Alpha"}}}, NOW)
        self.assertEqual(tw.calls, ["Beta"])


if __name__ == "__main__":
    unittest.main()
