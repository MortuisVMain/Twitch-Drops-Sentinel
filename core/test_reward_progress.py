"""Reward campaigns follow Twitch's real progress: one stable hero value, the link to the Twitch drop being progressed, the daily
stop decided by Twitch (the local count is only a fallback), and the safety cap. Synthetic data; fakes for the network.

Run: python -m unittest discover -s core -p "test_reward*.py" -t core
"""
from __future__ import annotations

import json
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"  # never open the Twitch activation page from tests
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import reward_watch as rw
import twitch
from gui_headless import STATE_BRIDGE
from inventory import DropsCampaign
from settings import Settings
from test_reward_watch import FakeChannel, NOW, TempDir, campaign, run
from utils import Game

GROUPS = [{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": [{"name": "GTA DVD Chest"}]},
          {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "GTA Sub Emote Chest"}]}]


def camp(**over):
    base = {"id": "a", "name": "GTAVI Launch Celebration", "groups": GROUPS, "game": None,
            "summary": "Unlock badges by watching GTAVI streamers on six different days."}
    base.update(over)
    return campaign(**base)


class NamesTests(unittest.TestCase):
    def test_similar_names(self):
        self.assertTrue(rw.names_similar("GTA DVD Drops", ["GTA DVD Chest", "Other"]))
        self.assertTrue(rw.names_similar("gta dvd chest", ["GTA DVD Chest"]))
        for no in (("Final Trophy", ["GTA DVD Chest"]), ("Chest", ["GTA DVD Chest"]), ("Drops", ["Drops"]),
                   ("", ["GTA DVD Chest"]), (None, ["GTA DVD Chest"]), ("GTA", ["GTA DVD Chest"])):
            self.assertFalse(rw.names_similar(*no), no)


class DropLinkTests(unittest.TestCase):
    def link(self, link, drop, minutes, *, special=False, similar=False, day="2026-11-20", required=60):
        return link.observe(drop, f"name-{drop}", minutes, required, special=special, similar=similar, day=day)

    def test_a_similar_or_special_drop_is_linked_others_are_ignored(self):
        link = rw.DropLink()
        self.assertIsNone(self.link(link, "other", 5))
        self.assertIsNone(link.drop_id)
        self.assertEqual(self.link(link, "dx", 1, similar=True), "new")
        self.assertEqual((link.drop_id, link.minutes), ("dx", 1))

    def test_the_link_is_sticky_and_monotonic(self):
        link = rw.DropLink()
        self.link(link, "dx", 3, special=True)
        self.assertIsNone(self.link(link, "dy", 9, special=True), "another special drop does not take the link over")
        self.assertEqual(self.link(link, "dx", 2, special=True), "linked")
        self.assertEqual(link.minutes, 3, "a lower counter never lowers it")
        self.assertEqual(self.link(link, "dx", 4, special=True), "linked")
        self.assertEqual(link.minutes, 4)

    def test_a_similar_drop_takes_over_from_a_merely_special_one(self):
        link = rw.DropLink()
        self.link(link, "dy", 7, special=True)
        self.assertEqual(self.link(link, "dx", 1, special=True, similar=True), "new")
        self.assertEqual((link.drop_id, link.minutes), ("dx", 1))
        self.assertIsNone(self.link(link, "dy", 8, special=True), "and it stays")

    def test_a_new_day_starts_over(self):
        link = rw.DropLink()
        self.link(link, "dx", 60, similar=True, day="2026-11-19")
        self.assertEqual(self.link(link, "dx", 1, similar=True, day="2026-11-20"), "new")
        self.assertEqual(link.minutes, 1)

    def test_reset_forgets(self):
        link = rw.DropLink()
        self.link(link, "dx", 5, similar=True)
        link.reset()
        self.assertEqual((link.drop_id, link.minutes), (None, 0))


class LedgerTwitchTests(TempDir):
    def test_twitch_progress_is_per_day_monotonic_and_persisted(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        self.assertIsNone(ledger.twitch_today("a", NOW))
        ledger.set_twitch_progress("a", 3, 60, False, NOW)
        ledger.set_twitch_progress("a", 2, 60, False, NOW)
        self.assertEqual(ledger.twitch_today("a", NOW), {"minutes": 3, "required": 60, "done": False})
        ledger.set_twitch_progress("a", 5, 60, False, NOW, replace=True)
        self.assertEqual(ledger.twitch_today("a", NOW)["minutes"], 5)
        ledger.set_twitch_progress("a", 1, 60, False, NOW, replace=True)
        self.assertEqual(ledger.twitch_today("a", NOW)["minutes"], 1, "replace is for a new link")
        self.assertIsNone(ledger.twitch_today("a", NOW + timedelta(days=1)))
        ledger.set_twitch_progress("a", 60, 60, True, NOW)
        self.assertTrue(rw.WatchLedger(self.dir / "l.json").twitch_today("a", NOW)["done"])

    def test_old_days_are_pruned_and_odd_values_ignored(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.set_twitch_progress("a", 5, 60, False, NOW - timedelta(days=45))
        ledger.set_twitch_progress("a", float("nan"), 60, False, NOW)
        ledger.set_twitch_progress("b", -3, "x", False, NOW)
        ledger.add_seconds("z", 1, NOW)
        self.assertEqual(list(ledger.twitch_progress), [], "the old day is pruned and the odd values were never stored")

    def test_days_done_follows_twitch_where_it_has_a_record(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        d0, d1, d2 = NOW, NOW - timedelta(days=1), NOW - timedelta(days=2)
        ledger.add_seconds("a", 3600, d0)  # local 60, Twitch only 40: not a goal day
        ledger.set_twitch_progress("a", 40, 60, False, d0)
        ledger.add_seconds("a", 1800, d1)  # local 30, Twitch done: a goal day
        ledger.set_twitch_progress("a", 60, 60, True, d1)
        ledger.add_seconds("a", 3600, d2)  # no Twitch record: local decides
        self.assertEqual(ledger.days_done("a", 60), 2)


class ViewTwitchTests(TempDir):
    def setUp(self):
        super().setUp()
        self.resolver = rw.CategoryResolver(self.dir / "c.json")
        self.ledger = rw.WatchLedger(self.dir / "l.json")

    def one(self, c=None, now=NOW):
        return rw.view([c or camp(game="Some Game")], [], {}, self.resolver, self.ledger, now)[0]

    def test_without_twitch_progress_the_local_count_decides(self):
        self.ledger.add_seconds("a", 3600, NOW)
        got = self.one()
        self.assertEqual((got["watchedToday"], got["progressSource"], got["twitchMinutes"], got["doneToday"], got["cappedToday"]), (60, "local", None, True, False))

    def test_twitch_progress_is_authoritative_even_when_the_local_count_is_ahead(self):
        self.ledger.add_seconds("a", 3600, NOW)
        self.ledger.set_twitch_progress("a", 1, 60, False, NOW)
        got = self.one()
        self.assertEqual((got["watchedToday"], got["progressSource"], got["twitchMinutes"], got["doneToday"]), (1, "twitch", 1, False))

    def test_twitch_reaching_the_requirement_or_claiming_finishes_the_day(self):
        self.ledger.add_seconds("a", 600, NOW)
        self.ledger.set_twitch_progress("a", 60, 60, False, NOW)
        self.assertTrue(self.one()["doneToday"])
        self.ledger.set_twitch_progress("a", 30, 60, True, NOW, replace=True)
        got = self.one()
        self.assertEqual((got["doneToday"], got["watchedToday"]), (True, 30))

    def test_a_stuck_twitch_counter_is_capped_by_the_local_time(self):
        self.ledger.set_twitch_progress("a", 5, 60, False, NOW)
        self.ledger.add_seconds("a", 89 * 60, NOW)
        self.assertEqual((self.one()["doneToday"], self.one()["cappedToday"]), (False, False))
        self.ledger.add_seconds("a", 60, NOW)
        got = self.one()
        self.assertEqual((got["doneToday"], got["cappedToday"], got["watchedToday"]), (True, True, 5))
        self.assertEqual(rw.local_cap(60), 90)
        self.assertEqual(rw.local_cap(120), 150)

    def test_a_capped_day_is_not_a_goal_day(self):
        self.ledger.set_twitch_progress("a", 5, 60, False, NOW)
        self.ledger.add_seconds("a", 95 * 60, NOW)
        self.assertEqual(self.one()["daysDone"], 0)

    def test_status_line_names_the_source(self):
        self.assertEqual(rw.status_line("ch", "Cat", "Camp", 1, 60, "twitch"), "[НАГРАДА] Смотрим ch (Cat) для «Camp»: 1/60 мин сегодня (Twitch)")
        self.assertEqual(rw.status_line("ch", "Cat", "Camp", 8, 60, "local"), "[НАГРАДА] Смотрим ch (Cat) для «Camp»: 8/60 мин сегодня")
        self.assertEqual(rw.status_line("ch", "Cat", "Camp", 8, 60), "[НАГРАДА] Смотрим ch (Cat) для «Camp»: 8/60 мин сегодня")


# ------------------------------------------------------------------ the engine, with real drops
class Args:
    tray = False
    log = False
    dump = False
    logging_level = 20
    debug_ws = 0
    debug_gql = 0


def special_campaign(engine, cid="special-1", drops=(("dx", "GTA DVD Drops"), ("dy", "Final Trophy")), game=None):
    data = {"id": cid, "name": "GTA DVD Drops", "status": "ACTIVE", "game": game or {"id": 509663, "name": "Special Events"},
            "startAt": "2026-10-01T00:00:00Z", "endAt": "2099-10-30T00:00:00Z",
            "timeBasedDrops": [{"id": did, "name": name, "requiredMinutesWatched": 60, "self": {"currentMinutesWatched": 0},
                                "benefitEdges": [{"benefit": {"id": f"b-{did}", "name": name, "distributionType": "DIRECT_ENTITLEMENT"}}]}
                               for did, name in drops]}
    c = DropsCampaign(engine, data, {})
    for d in c.drops:
        engine._drops[d.id] = d
        d.claim, d.generate_claim = _stub_claim(d), _stub_generate_claim(d)  # a claim must never reach Twitch (or its login) from a test
    engine.inventory.append(c)
    return c


def _stub_claim(drop):
    async def claim(completed_live=False):
        drop.is_claimed = True
        return True
    return claim


def _stub_generate_claim(drop):
    async def generate_claim():
        drop.claim_id = f"test-claim-{drop.id}"
    return generate_claim


async def _no_network(*args, **kwargs):
    raise AssertionError("a test must never reach Twitch, its login or the network")


async def _empty_session(*args, **kwargs):
    """The CurrentDrop answer while Twitch has no session: the only request a watched reward may make in a test."""
    return {"data": {"currentUser": {"dropCurrentSession": None}}}


def _no_network_sync(*args, **kwargs):
    raise AssertionError("a test must never reach Twitch, its login or the network")


def progress(engine, drop_id, current, required=60):
    run(engine.process_drops(1, {"type": "drop-progress", "data": {"drop_id": drop_id, "current_progress_min": current, "required_progress_min": required}}))


class EngineProgressTests(TempDir):
    def setUp(self):
        super().setUp()
        self.saved = (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
                      STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.reward_daily_slot, STATE_BRIDGE.active_drop)
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        import notifications
        muted = notifications.NOTIFIER
        self.toasts = []
        notifications.NOTIFIER = notifications.ToastGate(lambda t, m: self.toasts.append(m), lambda: True, None)
        self.addCleanup(setattr, notifications, "NOTIFIER", muted)
        STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_daily_slot = True, False
        STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.forced_game = [], {}, None
        STATE_BRIDGE.active_drop = None
        STATE_BRIDGE.reward_campaigns = [camp(id="a", name="GTAVI Launch Celebration")]
        rw.REWARD_WATCH.resolver.entries["a"] = {"sig": rw.CategoryResolver.signature(STATE_BRIDGE.reward_campaigns[0]), "at": 1e12, "seen": 1e12,
                                                 "category": {"name": "Grand Theft Auto VI", "slug": "gta6", "source": "guess"}}
        self.addCleanup(self.restore)
        self.engine = twitch.Twitch(Settings(Args()))
        # login and network are cut off for good: anything that reaches them fails loudly instead of starting a device-code login
        self.engine.get_auth, self.engine.gql_request, self.engine.request = _no_network, _empty_session, _no_network_sync
        self.engine.settings.priority = ["reward:a"]
        self.channel = FakeChannel()
        self.engine.watching_channel.set(self.channel)
        self.special = special_campaign(self.engine)
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNotNone(self.engine.reward_target)

    def restore(self):
        (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
         STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.reward_daily_slot, STATE_BRIDGE.active_drop) = self.saved
        STATE_BRIDGE.reward_watching = None
        STATE_BRIDGE.reward_drop_id = None

    def hero(self):
        return (STATE_BRIDGE.active_drop or {}).get("current_minutes")

    # --- the jump
    def test_two_drops_with_different_counters_do_not_make_the_hero_jump(self):
        seen = []
        for drop_id, minutes in (("dx", 1), ("dy", 0), ("dx", 2), ("dy", 0), ("dx", 3), ("dy", 1)):
            progress(self.engine, drop_id, minutes)
            seen.append(self.hero())
        self.assertEqual(seen, [1, 1, 2, 2, 3, 3], "one stable, never decreasing value: the linked drop's own minutes")
        self.assertEqual(STATE_BRIDGE.active_drop["id"], "dx")
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "dx")

    def test_watch_in_reward_mode_does_not_show_a_stale_inventory_drop(self):
        self.engine.watch(self.channel, update_status=False)
        self.assertIsNone(STATE_BRIDGE.active_drop, "the hero waits for Twitch's own progress")

    def test_other_displays_cannot_take_the_hero_over_from_the_linked_drop(self):
        progress(self.engine, "dx", 4)
        self.special.timed_drops["dy"].display()
        self.assertEqual(STATE_BRIDGE.active_drop["id"], "dx")

    # --- the link
    def test_an_unrelated_drop_is_not_linked_and_leaves_the_hero_and_ledger_alone(self):
        other = special_campaign(self.engine, cid="rust", drops=(("rd", "Rust Skin"),), game={"id": 1, "name": "Rust"})
        progress(self.engine, "rd", 7)
        self.assertIsNone(STATE_BRIDGE.active_drop)
        self.assertIsNone(STATE_BRIDGE.reward_drop_id)
        self.assertIsNone(rw.REWARD_WATCH.ledger.twitch_today("a"))
        self.assertEqual(other.timed_drops["rd"].current_minutes, 7, "its own minutes still follow Twitch")

    def test_a_similar_name_links_a_drop_of_any_game(self):
        special_campaign(self.engine, cid="elsewhere", drops=(("ds", "GTA DVD Drops"),), game={"id": 7, "name": "Elsewhere"})
        progress(self.engine, "ds", 3)
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "ds")
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a")["minutes"], 3)

    def test_a_special_drop_links_when_nothing_is_similar_and_a_similar_one_replaces_it(self):
        progress(self.engine, "dy", 7)
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "dy")
        progress(self.engine, "dx", 2)
        self.assertEqual(STATE_BRIDGE.reward_drop_id, "dx")
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a")["minutes"], 2, "the record follows the link, not the old drop")

    def test_progress_is_recorded_as_twitch_minutes_for_the_campaign(self):
        for m in (1, 2, 3):
            progress(self.engine, "dx", m)
        self.assertEqual(rw.REWARD_WATCH.ledger.twitch_today("a"), {"minutes": 3, "required": 60, "done": False})
        view = rw.REWARD_WATCH.view(STATE_BRIDGE.reward_campaigns, [], {})[0]
        self.assertEqual((view["watchedToday"], view["progressSource"]), (3, "twitch"))

    def test_the_link_is_dropped_with_the_reward_target(self):
        progress(self.engine, "dx", 1)
        self.engine.stop_watching = lambda: None
        self.engine._reward_stop_target("test")
        self.assertIsNone(STATE_BRIDGE.reward_drop_id)

    def test_without_a_reward_target_the_old_campaign_wide_update_still_applies(self):
        self.engine._set_reward_target(None)
        progress(self.engine, "dx", 1)
        self.assertEqual((self.special.timed_drops["dy"].current_minutes, STATE_BRIDGE.reward_drop_id), (1, None))

    # --- the daily stop
    def tick(self, at):
        saved = twitch.time
        twitch.time = lambda: at
        try:
            return run(self.engine._reward_tick(self.channel))
        finally:
            twitch.time = saved

    def local_watch(self, minutes, start=1000.0):
        self.tick(start)
        for step in range(1, minutes * 3 + 1):
            if self.tick(start + 20 * step):
                return start + 20 * step
        return None

    def test_the_local_count_does_not_stop_the_slot_while_twitch_is_behind(self):
        progress(self.engine, "dx", 1)
        stopped = self.local_watch(65)
        self.assertIsNone(stopped, "local passed 60 but Twitch says 1")
        self.assertIsNotNone(self.engine.reward_target)
        self.assertIn("1/60 мин сегодня (Twitch)", STATE_BRIDGE.status_text)
        self.assertEqual(self.toasts, [])

    def test_twitch_reaching_the_requirement_ends_the_day_with_the_toast(self):
        progress(self.engine, "dx", 30)
        self.tick(1000.0)
        progress(self.engine, "dx", 60)
        self.assertTrue(self.tick(1020.0))
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual(len(self.toasts), 1)
        self.assertIn("дневная цель выполнена", self.toasts[0])

    def test_without_any_twitch_progress_the_local_count_is_the_fallback(self):
        done_at = self.local_watch(61)
        self.assertIsNotNone(done_at)
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual(len(self.toasts), 1)

    def test_a_stuck_twitch_counter_is_capped_by_the_local_time_without_a_goal_toast(self):
        progress(self.engine, "dx", 5)
        with self.assertLogs("TwitchDrops", level="WARNING") as logs:
            done_at = self.local_watch(95)
        self.assertIsNotNone(done_at)
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual(self.toasts, [], "the goal was not reached: no «цель выполнена»")
        self.assertIn("Twitch", "\n".join(logs.output))
        self.assertTrue(rw.REWARD_WATCH.view(STATE_BRIDGE.reward_campaigns, [], {})[0]["doneToday"])

    def test_a_claimable_drop_is_claimed_by_the_existing_path(self):
        claims = []
        drop = self.special.timed_drops["dx"]

        async def claim(completed_live=False):
            claims.append(completed_live)
            drop.is_claimed = True
            return True

        async def no_claim_id():
            drop.claim_id = "claim-1"
        drop.claim, drop.generate_claim = claim, no_claim_id
        progress(self.engine, "dx", 60)
        self.assertEqual(claims, [True])
        self.assertTrue(rw.REWARD_WATCH.ledger.twitch_today("a")["done"], "reaching the requirement ends the day")

    def test_a_claim_message_finishes_the_day(self):
        progress(self.engine, "dx", 10)
        drop = self.special.timed_drops["dx"]

        async def claim(completed_live=False):
            drop.is_claimed = True
            return True
        drop.claim = claim

        async def no_network(ops):
            return {"data": {"currentUser": {"dropCurrentSession": None}}}

        async def no_wait(seconds):
            return None
        self.engine.gql_request = no_network
        import asyncio
        real_sleep, asyncio.sleep = asyncio.sleep, no_wait
        try:
            run(self.engine.process_drops(1, {"type": "drop-claim", "data": {"drop_id": "dx", "drop_instance_id": "inst-1"}}))
        finally:
            asyncio.sleep = real_sleep
        self.assertTrue(rw.REWARD_WATCH.ledger.twitch_today("a")["done"])


if __name__ == "__main__":
    unittest.main()
