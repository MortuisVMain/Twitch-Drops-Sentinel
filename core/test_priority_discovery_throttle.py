"""Campaigns of priority games Twitch did not list come from the same channel search as the TV fallback (directory -> live
channels -> AvailableDrops -> CampaignDetails), so each one is Twitch's own full campaign: the v3 code built campaigns by hand
(guessed account link, status always ACTIVE, journal text matching) and ran every 2 minutes. Now at most once per
TV_DISCOVERY_INTERVAL, its finds reused in between."""
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
    tw._client_type = twitch.ClientType.SMARTBOX  # the search runs for the TV login only
    calls, batches = [], []

    async def channels(inventory, games=None):
        batches.append(list(games))
        calls.extend(games)
        return {"c-" + g: {"id": "c-" + g, "name": g, "game": {"id": "1", "name": g}} for g in games}, True

    tw._discover_via_channels = channels
    tw.calls, tw.batches = calls, batches
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

        async def broken(inventory, games=None):
            raise RuntimeError("twitch down")
        tw._discover_via_channels = broken
        failed_at = NOW + twitch.TV_DISCOVERY_INTERVAL + 1
        with self.assertLogs("TwitchDrops", level="WARNING"):
            inv = run(tw, {}, failed_at)
        self.assertIn("c-Alpha", inv, "the last good finds stay")
        good = make(priority=("Alpha",))
        tw._discover_via_channels = good._discover_via_channels
        run(tw, {}, failed_at + twitch.DISCOVERY_RETRY_AFTER - 10)
        self.assertEqual(good.calls, [], "not on every sync")
        run(tw, {}, failed_at + twitch.DISCOVERY_RETRY_AFTER + 1)
        self.assertEqual(good.calls, ["Alpha"], "but again after the short retry delay")

    def test_an_incomplete_pass_retries_soon_too(self):
        tw = make(priority=("Alpha",))

        async def partial(inventory, games=None):
            tw.calls.extend(games)
            return {}, False
        tw._discover_via_channels = partial
        run(tw, {}, NOW)
        self.assertEqual(tw._priority_discovery_at, NOW - twitch.TV_DISCOVERY_INTERVAL + twitch.DISCOVERY_RETRY_AFTER)

    def test_an_ended_campaign_in_the_cache_is_not_merged(self):
        tw = make(priority=("Alpha",))
        tw._priority_discovery_at = NOW
        tw._priority_discovered = {"old": {"id": "old", "endAt": "2020-01-01T00:00:00Z", "game": {"name": "Alpha"}}}
        self.assertNotIn("old", run(tw, {}, NOW + 60))

    def test_an_empty_answer_does_not_wipe_the_last_finds(self):
        # no live channel right now is no reason to forget a campaign that has not ended
        tw = make(priority=("Alpha",))
        run(tw, {}, NOW)

        async def nothing_live(inventory, games=None):
            return {}, True
        tw._discover_via_channels = nothing_live
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

    def test_a_long_queue_is_asked_in_batches(self):
        games = [f"Game{i}" for i in range(30)]
        tw = make(priority=games)
        run(tw, {}, NOW)
        self.assertEqual(sorted(tw.calls), sorted(games))
        self.assertTrue(all(len(b) <= twitch.TV_DISCOVERY_MAX_GAMES for b in tw.batches), tw.batches)


class OnlyForTheTvLogin(unittest.TestCase):
    def test_the_android_login_sees_the_full_dashboard_and_never_searches(self):
        # live 2026-11-28 on the android login: 74 games, 49 s of requests, 0 game campaigns the dashboard lacked
        tw = make()
        tw._client_type = twitch.ClientType.ANDROID_APP
        inv = run(tw, {}, NOW)
        self.assertEqual((tw.calls, inv), ([], {}))

    def test_the_tv_login_searches(self):
        tw = make(priority=("Alpha",))
        tw._client_type = twitch.ClientType.SMARTBOX
        run(tw, {}, NOW)
        self.assertEqual(tw.calls, ["Alpha"])


class OneSearchForBothLogins(unittest.TestCase):
    def test_the_hand_built_v3_campaigns_are_gone(self):
        self.assertFalse(hasattr(twitch.Twitch, "discover_campaigns_for_game"))

    def test_the_channel_search_takes_the_games_it_is_given(self):
        tw = object.__new__(twitch.Twitch)
        tw._tv_discovery_games = lambda: ["Default"]
        asked = []

        async def gql(ops):
            asked.extend(op["variables"].get("slug") for op in ops if op["operationName"] == "DirectoryPage_Game")
            return [{"data": {"game": None}} for _ in ops]
        tw.gql_request = gql
        asyncio.run(tw._discover_via_channels({}, ["Given Game"]))
        self.assertEqual(asked, ["given-game"])


if __name__ == "__main__":
    unittest.main()
