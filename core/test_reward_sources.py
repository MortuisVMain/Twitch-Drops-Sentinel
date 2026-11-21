"""Reward campaigns: Twitch's per-drop minutes reach the link from EVERY source - the pubsub drop-progress event, the CurrentDrop
GQL answer and the inventory refetch - through one adapter; the hero shows the linked drop (or the watch status before a link);
the link is logged with its source; and a reward watched for 10 minutes without any Twitch progress is reported once.

Everything here is fake: login, network and claims are stubbed, so a test can never reach Twitch or open a browser.
Run: python -m unittest discover -s core -p "test_reward*.py" -t core
"""
from __future__ import annotations

import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"  # never open the Twitch activation page from tests
import unittest
from datetime import datetime, timezone

import reward_watch as rw
import twitch
from gui_headless import STATE_BRIDGE
from inventory import DropsCampaign
from settings import Settings
from test_reward_progress import Args, _empty_session, _no_network, _no_network_sync, _stub_claim, _stub_generate_claim, camp
from test_reward_watch import FakeChannel, TempDir, run

NAMES = ["GTAVI Launch Celebration", "GTA DVD Chest", "GTA Sub Emote Chest"]
DAY = "2026-11-20"


class FeedTests(unittest.TestCase):
    def feed(self, link, drop_id="dx", name="GTA DVD Drops", game=("Special Events", 509663), current=1, required=60, source="pubsub"):
        return link.feed(NAMES, drop_id, name, game[0], game[1], current, required, source, DAY)

    def test_special_by_game_id_or_name_and_similar_by_name(self):
        for game in (("Special Events", 509663), ("Special Events", 0), ("Something", 509672)):
            link = rw.DropLink()
            self.assertEqual(self.feed(link, name="Final Trophy", game=game), "new", game)
        link = rw.DropLink()
        self.assertEqual(self.feed(link, name="GTA DVD Drops", game=("Rust", 1)), "new", "similar to a reward: any game")
        link = rw.DropLink()
        self.assertIsNone(self.feed(link, name="Rust Skin", game=("Rust", 1)))

    def test_the_source_of_the_link_is_kept_and_follows_a_relink(self):
        link = rw.DropLink()
        self.feed(link, drop_id="dy", name="Final Trophy", source="inventory")
        self.assertEqual(link.source, "inventory")
        self.feed(link, drop_id="dy", name="Final Trophy", current=5, source="pubsub")
        self.assertEqual(link.source, "inventory", "the same drop reporting again does not change how it was linked")
        self.feed(link, drop_id="dx", name="GTA DVD Drops", source="current_drop")
        self.assertEqual((link.drop_id, link.source), ("dx", "current_drop"))
        link.reset()
        self.assertIsNone(link.source)


def special_inventory(engine, cid="special-1", drops=(("dx", "GTA DVD Drops", 0, False), ("dy", "Final Trophy", 0, False)),
                      game=None, name="GTA DVD Drops"):
    data = {"id": cid, "name": name, "status": "ACTIVE", "game": game or {"id": 509663, "name": "Special Events"},
            "startAt": "2026-10-01T00:00:00Z", "endAt": "2099-10-30T00:00:00Z",
            "timeBasedDrops": [{"id": did, "name": dname, "requiredMinutesWatched": 60,
                                "self": {"currentMinutesWatched": minutes, "isClaimed": claimed},
                                "benefitEdges": [{"benefit": {"id": f"b-{did}", "name": dname, "distributionType": "DIRECT_ENTITLEMENT"}}]}
                               for did, dname, minutes, claimed in drops]}
    c = DropsCampaign(engine, data, {})
    for d in c.drops:
        engine._drops[d.id] = d
        d.claim, d.generate_claim = _stub_claim(d), _stub_generate_claim(d)
    engine.inventory.append(c)
    return c


class SourceBase(TempDir):
    def setUp(self):
        super().setUp()
        self.saved = (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
                      STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.reward_daily_slot, STATE_BRIDGE.active_drop)
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        import notifications
        muted = notifications.NOTIFIER
        notifications.NOTIFIER = notifications.ToastGate(lambda t, m: None, lambda: True, None)
        self.addCleanup(setattr, notifications, "NOTIFIER", muted)
        STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_daily_slot = True, False
        STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.forced_game = [], {}, None
        STATE_BRIDGE.active_drop = None
        STATE_BRIDGE.reward_campaigns = [camp(id="a", name="GTAVI Launch Celebration")]
        rw.REWARD_WATCH.resolver.entries["a"] = {"sig": rw.CategoryResolver.signature(STATE_BRIDGE.reward_campaigns[0]), "at": 1e12, "seen": 1e12,
                                                 "category": {"name": "Grand Theft Auto VI", "slug": "gta6", "source": "guess"}}
        self.addCleanup(self.restore)
        self.engine = twitch.Twitch(Settings(Args()))
        self.engine.get_auth, self.engine.gql_request, self.engine.request = _no_network, _empty_session, _no_network_sync
        self.engine.settings.priority = ["reward:a"]
        self.channel = FakeChannel()
        self.engine.watching_channel.set(self.channel)
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNotNone(self.engine.reward_target)

    def restore(self):
        (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
         STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.reward_daily_slot, STATE_BRIDGE.active_drop) = self.saved
        STATE_BRIDGE.reward_watching = None
        STATE_BRIDGE.reward_drop_id = None

    def hero(self):
        return (STATE_BRIDGE.active_drop or {}).get("current_minutes")

    def tick(self, at, channel=None):
        saved = twitch.time
        twitch.time = lambda: at
        try:
            return run(self.engine._reward_tick(channel or self.channel))
        finally:
            twitch.time = saved


class InventoryPathTests(SourceBase):
    def test_a_refetch_links_the_special_drop_in_progress_and_the_hero_shows_it(self):
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 1, False), ("dy", "Final Trophy", 0, False)))
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            self.engine._reward_scan_inventory()
        self.assertEqual((STATE_BRIDGE.reward_drop_id, self.hero()), ("dx", 1))
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a"), {"minutes": 1, "required": 60, "done": False})
        line = next(x for x in logs.output if "прогресс берём у Twitch" in x)
        self.assertIn("источник: inventory", line)
        self.assertIn("GTA DVD Drops", line)
        self.assertIn("1/60", line)

    def test_the_largest_minutes_among_the_special_drops_wins_but_a_similar_name_beats_it(self):
        special_inventory(self.engine, drops=(("dy", "Final Trophy", 30, False), ("dz", "Other Special", 12, False)))
        self.engine._reward_scan_inventory()
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "dy", "no resemblance: the special drop with the most minutes")
        self.engine._set_reward_target(None)
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:a"])
        self.engine._drops.clear()
        self.engine.inventory.clear()
        special_inventory(self.engine, drops=(("dy", "Final Trophy", 30, False), ("dx", "GTA DVD Drops", 2, False)))
        self.engine._reward_scan_inventory()
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "dx", "a drop named like the reward wins over a special one with more minutes")

    def test_claimed_zero_minute_and_unrelated_drops_do_not_link(self):
        special_inventory(self.engine, cid="old", drops=(("dold", "GTA DVD Drops", 60, True),))
        special_inventory(self.engine, cid="fresh", drops=(("dnew", "Final Trophy", 0, False),))
        rust = special_inventory(self.engine, cid="rust", drops=(("rd", "Rust Skin", 40, False),), game={"id": 1, "name": "Rust"})
        self.assertTrue(rust.timed_drops)
        self.engine._reward_scan_inventory()
        self.assertIsNone(STATE_BRIDGE.reward_drop_id)
        self.assertIsNone(rw.REWARD_WATCH.ledger.twitch_today("a"))

    def test_after_a_refetch_the_linked_drop_is_refreshed_from_the_new_objects(self):
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 5, False),))
        self.engine._reward_scan_inventory()
        self.assertEqual(self.hero(), 5)
        self.engine._drops.clear()
        self.engine.inventory.clear()
        fresh = special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 9, False),))
        self.engine._reward_scan_inventory()
        self.assertEqual(self.hero(), 9)
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a")["minutes"], 9)
        self.assertEqual(STATE_BRIDGE.active_drop["id"], fresh.timed_drops["dx"].id)
        # a stale (lower) copy never lowers it
        self.engine._drops.clear()
        self.engine.inventory.clear()
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 3, False),))
        self.engine._reward_scan_inventory()
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a")["minutes"], 9)
        self.assertGreaterEqual(self.hero(), 9)

    def test_a_refetch_that_brings_the_linked_drop_claimed_closes_the_day(self):
        # Twitch counted the last minutes and claimed the drop itself between our reports: the day is done, not left at 55/60
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 55, False),))
        self.engine._reward_scan_inventory()
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a"), {"minutes": 55, "required": 60, "done": False})
        self.engine._drops.clear()
        self.engine.inventory.clear()
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 60, True),))
        self.engine._reward_scan_inventory()
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a"), {"minutes": 60, "required": 60, "done": True})
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "dx")
        self.assertTrue(self.engine._reward_current_view()["doneToday"], "the watch beat sees the day as done and stops")

    def test_a_claimed_drop_that_is_not_linked_still_does_not_link_or_close(self):
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 5, False),))
        self.engine._reward_scan_inventory()
        self.engine._drops.clear()
        self.engine.inventory.clear()
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 5, False), ("dy", "Final Trophy", 60, True)))
        self.engine._reward_scan_inventory()
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a"), {"minutes": 5, "required": 60, "done": False})

    def test_the_scan_without_a_reward_target_does_nothing(self):
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 5, False),))
        self.engine._set_reward_target(None)
        self.engine._reward_scan_inventory()
        self.assertIsNone(STATE_BRIDGE.reward_drop_id)

    def test_an_inventory_refetch_runs_the_scan(self):
        import inspect
        self.assertIn("_reward_scan_inventory", inspect.getsource(twitch.Twitch.fetch_inventory))


class CurrentDropPathTests(SourceBase):
    def answer(self, drop_id="dx", minutes=3, required=60):
        return {"data": {"currentUser": {"dropCurrentSession": {"dropID": drop_id, "currentMinutesWatched": minutes, "requiredMinutesWatched": required,
                                                                "channel": {"id": "1"}}}}}

    def stub(self, payload):
        self.calls = []

        async def gql(ops):
            self.calls.append(ops)
            return payload
        self.engine.gql_request = gql

    def test_the_current_drop_answer_links_and_logs_its_source(self):
        special_inventory(self.engine)
        self.stub(self.answer(minutes=3))
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            run(self.engine._reward_poll_current_drop(self.channel))
        self.assertEqual((STATE_BRIDGE.reward_drop_id, self.hero()), ("dx", 3))
        self.assertIn("источник: current_drop", "\n".join(logs.output))
        self.assertEqual(len(self.calls), 1)

    def test_no_session_an_unknown_drop_and_odd_answers_are_counted_not_linked(self):
        special_inventory(self.engine)
        for payload in ({"data": {"currentUser": {"dropCurrentSession": None}}}, self.answer(drop_id="nope"), {}, {"data": None}, "oops", None):
            self.stub(payload)
            run(self.engine._reward_poll_current_drop(self.channel))
        self.assertIsNone(STATE_BRIDGE.reward_drop_id)
        self.assertEqual(len(self.engine._reward_seen["current_drop"]), 6)

    def test_a_failing_request_is_logged_and_does_not_raise(self):
        async def boom(ops):
            raise RuntimeError("net down")
        self.engine.gql_request = boom
        with self.assertLogs("TwitchDrops", level="WARNING"):
            run(self.engine._reward_poll_current_drop(self.channel))

    def test_the_watch_beat_asks_for_the_current_drop_every_third_good_beat(self):
        special_inventory(self.engine)
        self.stub(self.answer(minutes=4))
        for step in range(6):
            self.tick(1000.0 + 20 * step)
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a")["minutes"], 4)

    def test_a_failed_beat_does_not_poll(self):
        special_inventory(self.engine)
        self.stub(self.answer())
        for step in range(4):
            self.tick(1000.0 + 20 * step, FakeChannel(sends=False))
        self.assertEqual(self.calls, [])


class PubsubPathTests(SourceBase):
    def test_pubsub_links_with_its_source_and_unknown_drops_are_counted(self):
        special_inventory(self.engine)
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            run(self.engine.process_drops(1, {"type": "drop-progress", "data": {"drop_id": "dx", "current_progress_min": 2, "required_progress_min": 60}}))
        self.assertIn("источник: pubsub", "\n".join(logs.output))
        run(self.engine.process_drops(1, {"type": "drop-progress", "data": {"drop_id": "mystery", "current_progress_min": 7, "required_progress_min": 60}}))
        self.assertEqual(len(self.engine._reward_seen["pubsub"]), 2)


class HeroTests(SourceBase):
    def test_before_a_link_the_hero_shows_the_reward_watch_status(self):
        self.tick(1000.0)
        hero = STATE_BRIDGE.active_drop
        self.assertEqual((hero["name"], hero["game"], hero["required_minutes"], hero["source"]), ("GTAVI Launch Celebration", "Grand Theft Auto VI", 60, "local"))
        self.tick(1020.0)
        self.assertIn("progress_percent", STATE_BRIDGE.active_drop)

    def test_other_displays_cannot_replace_it_and_the_linked_drop_takes_over(self):
        special = special_inventory(self.engine)
        self.tick(1000.0)
        special.timed_drops["dy"].display()
        self.assertEqual(STATE_BRIDGE.active_drop["source"], "local")
        run(self.engine.process_drops(1, {"type": "drop-progress", "data": {"drop_id": "dx", "current_progress_min": 4, "required_progress_min": 60}}))
        self.assertEqual((STATE_BRIDGE.active_drop["id"], self.hero()), ("dx", 4))
        self.tick(1020.0)
        self.assertEqual((STATE_BRIDGE.active_drop["id"], self.hero()), ("dx", 4), "a beat does not put the status back over the linked drop")


class NoProgressWarningTests(SourceBase):
    def test_ten_minutes_without_any_twitch_progress_are_reported_once_with_what_was_seen(self):
        special_inventory(self.engine, drops=(("dx", "GTA DVD Drops", 0, False),))
        run(self.engine.process_drops(1, {"type": "drop-progress", "data": {"drop_id": "mystery", "current_progress_min": 7, "required_progress_min": 60}}))
        self.engine._reward_started_at = 0.0
        self.tick(300.0)
        with self.assertLogs("TwitchDrops", level="WARNING") as logs:
            self.tick(601.0)
        text = "\n".join(logs.output)
        self.assertIn("drop-progress событий: 1", text)
        self.assertIn("ответов CurrentDrop: 0", text)
        self.assertIn("GTA DVD Drops 0/60", text)
        with self.assertNoLogs("TwitchDrops", level="WARNING"):
            self.tick(700.0)

    def test_no_warning_when_a_link_exists_or_before_ten_minutes(self):
        special_inventory(self.engine)
        self.engine._reward_started_at = 0.0
        with self.assertNoLogs("TwitchDrops", level="WARNING"):
            self.tick(599.0)
        run(self.engine.process_drops(1, {"type": "drop-progress", "data": {"drop_id": "dx", "current_progress_min": 1, "required_progress_min": 60}}))
        with self.assertNoLogs("TwitchDrops", level="WARNING"):
            self.tick(900.0)

    def test_a_new_target_starts_the_count_afresh(self):
        self.engine._reward_started_at = 0.0
        self.engine._reward_warned = True
        self.engine._set_reward_target(None)
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertFalse(self.engine._reward_warned)
        self.assertGreater(self.engine._reward_started_at, 0)


if __name__ == "__main__":
    unittest.main()
