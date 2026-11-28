"""TV-client fallback: Twitch's dashboard answers an empty campaign list to the TV client, so campaigns are discovered through live channels."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import asyncio
import logging
import unittest
from types import SimpleNamespace
from unittest import mock

import twitch
from constants import ClientType

NOW = 10_000.0


def run(coro):
    return asyncio.run(coro)


def make_twitch(client=ClientType.SMARTBOX, games=("Alpha", "Beta"), channels=None, campaigns=None, fail_on=None, redirects=None, statuses=None, none_campaigns=()):
    """A real Twitch object without __init__: gql_request is answered per operation name from the given tables.

    channels: game name -> list of channel ids; campaigns: channel id -> list of campaign ids.
    """
    tw = object.__new__(twitch.Twitch)
    tw._client_type = client
    tw._tv_discovery_at = None
    tw._tv_discovery_games = lambda: list(games)
    tw.get_auth = mock.AsyncMock(return_value=SimpleNamespace(user_id=5))
    batches: list[list[str]] = []
    channels = channels if channels is not None else {}
    campaigns = campaigns if campaigns is not None else {}
    redirects = redirects if redirects is not None else {}
    statuses = statuses if statuses is not None else {}
    none_campaigns = set(none_campaigns)

    async def gql_request(ops):
        batch = ops if isinstance(ops, list) else [ops]
        batches.append([op["operationName"] for op in batch])
        out = []
        for op in batch:
            name, variables = op["operationName"], op["variables"]
            if fail_on == name:
                raise twitch.GQLException("boom")
            if name == "DirectoryPage_Game":
                slug = variables["slug"]
                if slug in redirects.values():
                    ids = next((v for k, v in channels.items() if redirects.get(k) == slug), [])
                    out.append({"data": {"game": {"streams": {"edges": [{"node": {"broadcaster": {"id": i}}} for i in ids]}}}})
                else:
                    matched = next(((k, v) for k, v in channels.items() if twitch.Game({"id": 1, "name": k}).slug == slug and k not in redirects), None)
                    if matched is None:
                        out.append({"data": {"game": None}})
                    else:
                        out.append({"data": {"game": {"streams": {"edges": [{"node": {"broadcaster": {"id": i}}} for i in matched[1]]}}}})
            elif name == "DirectoryGameRedirect":
                real_slug = redirects.get(variables["name"])
                out.append({"data": {"game": {"slug": real_slug} if real_slug else None}})
            elif name == "DropsHighlightService_AvailableDrops":
                cids = campaigns.get(variables["channelID"], [])
                out.append({"data": {"channel": {"id": variables["channelID"], "viewerDropCampaigns": [{"id": c} for c in cids]}}})
            elif name == "DropCampaignDetails":
                cid = variables["dropID"]
                if cid in none_campaigns:
                    out.append({"data": {"user": {"dropCampaign": None}}})
                else:
                    camp = {"id": cid, "name": "n-" + cid, "game": {"id": "1", "name": "G"}}
                    if cid in statuses:
                        camp["status"] = statuses[cid]
                    out.append({"data": {"user": {"dropCampaign": camp}}})
        return out if isinstance(ops, list) else out[0]

    tw.gql_request = gql_request
    tw.batches = batches
    return tw


def discover(tw, inventory=None, dashboard=(), now=NOW):
    inventory = {} if inventory is None else inventory
    with mock.patch.object(twitch, "monotonic", return_value=now):
        run(tw._maybe_discover_via_channels(inventory, list(dashboard)))
    return inventory


class WhenItRuns(unittest.TestCase):
    def setUp(self):
        self.args = dict(channels={"Alpha": ["1", "2"]}, campaigns={"1": ["c1"], "2": ["c2"]})

    def test_tv_client_with_an_empty_dashboard_merges_campaign_details(self):
        inv = discover(make_twitch(**self.args))
        self.assertEqual(set(inv), {"c1", "c2"})
        self.assertEqual(inv["c1"]["name"], "n-c1")

    def test_the_found_campaigns_are_returned_for_the_catalog(self):
        tw = make_twitch(**self.args)
        with mock.patch.object(twitch, "monotonic", return_value=NOW):
            found = run(tw._maybe_discover_via_channels({}, []))
        self.assertEqual(set(found), {"c1", "c2"})
        tw2 = make_twitch(**self.args)
        with mock.patch.object(twitch, "monotonic", return_value=NOW):
            self.assertEqual(run(tw2._maybe_discover_via_channels({}, [{"id": "x"}])), {})

    def test_a_dashboard_that_returned_campaigns_means_no_discovery(self):
        tw = make_twitch(**self.args)
        inv = discover(tw, dashboard=[{"id": "x"}])
        self.assertEqual(inv, {})
        self.assertEqual(tw.batches, [])

    def test_the_android_client_never_discovers(self):
        tw = make_twitch(ClientType.ANDROID_APP, **self.args)
        inv = discover(tw)
        self.assertEqual(inv, {})
        self.assertEqual(tw.batches, [])

    def test_campaigns_already_in_the_inventory_are_not_fetched_again(self):
        tw = make_twitch(**self.args)
        inv = discover(tw, inventory={"c1": {"id": "c1", "name": "mine"}})
        self.assertEqual(inv["c1"]["name"], "mine")
        self.assertIn("c2", inv)
        details = [op for batch in tw.batches for op in batch if op == "DropCampaignDetails"]
        self.assertEqual(len(details), 1)


class DedupeAndCaps(unittest.TestCase):
    def test_a_campaign_seen_on_many_channels_and_games_is_fetched_once(self):
        tw = make_twitch(channels={"Alpha": ["1", "2"], "Beta": ["2", "3"]}, campaigns={"1": ["c"], "2": ["c"], "3": ["c"]})
        inv = discover(tw)
        self.assertEqual(set(inv), {"c"})
        self.assertEqual(sum(b.count("DropCampaignDetails") for b in tw.batches), 1)
        # channel 2 is on two games but asked once
        self.assertEqual(sum(b.count("DropsHighlightService_AvailableDrops") for b in tw.batches), 3)

    def test_games_and_channels_per_pass_are_capped(self):
        games = [f"Game{i}" for i in range(10)]
        tw = make_twitch(games=games, channels={g: [f"{i}{j}" for j in range(6)] for i, g in enumerate(games)})
        with mock.patch.object(twitch, "TV_DISCOVERY_MAX_GAMES", 3), mock.patch.object(twitch, "TV_DISCOVERY_MAX_CHANNELS", 2):
            discover(tw)
        self.assertEqual(sum(b.count("DirectoryPage_Game") for b in tw.batches), 3)
        self.assertEqual(sum(b.count("DropsHighlightService_AvailableDrops") for b in tw.batches), 6)

    def test_gql_calls_are_batched_not_one_per_item(self):
        tw = make_twitch(channels={"Alpha": ["1", "2"], "Beta": ["3"]}, campaigns={"1": ["a"], "2": ["b"], "3": ["c"]})
        discover(tw)
        self.assertEqual([len(b) for b in tw.batches], [2, 3, 3])  # directories, available drops, details


class Throttle(unittest.TestCase):
    def test_at_most_once_every_thirty_minutes(self):
        tw = make_twitch(channels={"Alpha": ["1"]}, campaigns={"1": ["c1"]})
        discover(tw, now=NOW)
        calls = len(tw.batches)
        discover(tw, now=NOW + twitch.TV_DISCOVERY_INTERVAL - 1)
        self.assertEqual(len(tw.batches), calls)
        discover(tw, now=NOW + twitch.TV_DISCOVERY_INTERVAL + 1)
        self.assertGreater(len(tw.batches), calls)

    def test_the_interval_is_thirty_minutes(self):
        self.assertEqual(twitch.TV_DISCOVERY_INTERVAL, 30 * 60)


class Failures(unittest.TestCase):
    def test_a_gql_error_is_logged_with_context_and_swallowed(self):
        for failing in ("DirectoryPage_Game", "DropsHighlightService_AvailableDrops", "DropCampaignDetails"):
            tw = make_twitch(channels={"Alpha": ["1"]}, campaigns={"1": ["c1"]}, fail_on=failing)
            with self.assertLogs("TwitchDrops", level=logging.WARNING) as logs:
                inv = discover(tw, inventory={"keep": {"id": "keep"}})
            self.assertEqual(inv, {"keep": {"id": "keep"}}, failing)
            self.assertIn("discovery", logs.output[0].lower())

    def test_slug_redirect_resolves_mismatched_game_slugs(self):
        tw = make_twitch(
            games=("Hunt: Showdown 1896",),
            channels={"Hunt: Showdown 1896": ["10"]},
            redirects={"Hunt: Showdown 1896": "hunt-showdown"},
            campaigns={"10": ["c_hunt"]},
        )
        inv = discover(tw)
        self.assertEqual(set(inv), {"c_hunt"})
        self.assertIn(["DirectoryGameRedirect"], tw.batches)

    def test_none_campaign_and_expired_status_do_not_break_or_pollute_results(self):
        tw = make_twitch(
            games=("Alpha",),
            channels={"Alpha": ["1"]},
            campaigns={"1": ["c_active", "c_none", "c_expired"]},
            statuses={"c_active": "ACTIVE", "c_expired": "EXPIRED"},
            none_campaigns={"c_none"},
        )
        inv = discover(tw)
        self.assertEqual(set(inv), {"c_active"})

    def test_nothing_is_merged_when_the_details_fetch_fails_midway(self):
        tw = make_twitch(channels={"Alpha": ["1"]}, campaigns={"1": ["c1"]}, fail_on="DropCampaignDetails")
        with self.assertLogs("TwitchDrops", level=logging.WARNING):
            inv = discover(tw)
        self.assertEqual(inv, {})

    def test_transient_failure_does_not_lock_out_discovery_for_thirty_minutes(self):
        tw = make_twitch(channels={"Alpha": ["1"]}, campaigns={"1": ["c1"]}, fail_on="DirectoryPage_Game")
        with self.assertLogs("TwitchDrops", level=logging.WARNING):
            discover(tw, now=NOW)
        self.assertIsNone(tw._tv_discovery_at)


class PartialFailures(unittest.TestCase):
    def _failing_first(self, tw, name):
        inner = tw.gql_request
        state = {"failed": False}

        async def gql(ops):
            batch = ops if isinstance(ops, list) else [ops]
            if not state["failed"] and batch[0]["operationName"] == name:
                state["failed"] = True
                raise twitch.GQLException("first batch down")
            return await inner(ops)
        tw.gql_request = gql

    def test_a_failed_channel_batch_keeps_the_others_and_retries_soon(self):
        # 25 channels = two AvailableDrops batches (20 + 5); the first one fails
        channels = [str(i) for i in range(25)]
        tw = make_twitch(games=("Alpha",), channels={"Alpha": channels}, campaigns={"24": ["late"], "0": ["early"]})
        self._failing_first(tw, "DropsHighlightService_AvailableDrops")
        with mock.patch.object(twitch, "TV_DISCOVERY_MAX_CHANNELS", 30), self.assertLogs("TwitchDrops", level=logging.WARNING):
            inv = discover(tw)
        self.assertEqual(set(inv), {"late"}, "the batch that answered still counts")
        self.assertEqual(tw._tv_discovery_at, NOW - twitch.TV_DISCOVERY_INTERVAL + twitch.DISCOVERY_RETRY_AFTER,
                         "an incomplete pass is retried after the short delay, not in 30 minutes and not every sync")

    def test_a_failed_details_batch_keeps_the_other_batch(self):
        ids = [f"c{i}" for i in range(25)]
        tw = make_twitch(games=("Alpha",), channels={"Alpha": ["1"]}, campaigns={"1": ids})
        self._failing_first(tw, "DropCampaignDetails")
        with self.assertLogs("TwitchDrops", level=logging.WARNING):
            inv = discover(tw)
        self.assertEqual(len(inv), 5)
        self.assertEqual(tw._tv_discovery_at, NOW - twitch.TV_DISCOVERY_INTERVAL + twitch.DISCOVERY_RETRY_AFTER)


class GamesOfInterest(unittest.TestCase):
    def test_priority_games_come_first_then_installed_without_duplicates_or_rewards(self):
        tw = object.__new__(twitch.Twitch)
        tw.settings = SimpleNamespace(priority=["Alpha", "reward:123", "Beta"])
        fetcher = SimpleNamespace(get_installed_game_names=lambda: ["beta", "Gamma"])
        with mock.patch.dict("sys.modules", {"campaigns_fetcher": SimpleNamespace(CAMPAIGNS_FETCHER=fetcher)}), \
                mock.patch.object(twitch.reward_watch, "is_reward_key", side_effect=lambda g: g.startswith("reward:")):
            self.assertEqual(tw._tv_discovery_games(), ["Alpha", "Beta", "Gamma"])


if __name__ == "__main__":
    unittest.main()
