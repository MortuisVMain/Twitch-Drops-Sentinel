"""Reward campaigns: the daily slot (a queued campaign runs before drops until today's goal), the 15 minute backoff, the
auto-queue, daily badges that never close a multi-day campaign, and the daily-goal notification. Synthetic data, fakes only.

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

import reward_campaigns as rc
import reward_watch as rw
from test_reward_watch import FakeChannel, NOW, campaign, run  # noqa: F401  (helpers only)
import test_reward_watch as base
import twitch
from gui_headless import STATE_BRIDGE
from utils import Game

GROUPS = [{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": [{"name": "Daily Purple Chain"}]},
          {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Grand Final Prize"}]}]
SUMMARY = "Unlock six badges by watching GTAVI streamers for one hour each day on six different days between November 18-30."
LIVE_DAILY = {"type": "quests_viewer_reward_campaign_earned_badge", "id": "n1",
              "body": "Вы заработали значок «Purple Chain»! Похвастайтесь им в чате на своем любимом канале!",
              "actions": [], "body_md": "x", "category": "quests", "created_at": "t", "thumbnail_url": "https://x.test/p.png", "user_id": "42"}


def camp(**over):
    base_ = {"id": "a", "name": "A Campaign", "summary": SUMMARY, "groups": GROUPS, "rewards": [{"name": "Daily Purple Chain"}, {"name": "Grand Final Prize"}]}
    base_.update(over)
    return campaign(**base_)


class SlotEngine(base.FakeEngine):
    _reward_skip_for_a_while = twitch.Twitch._reward_skip_for_a_while
    _notify_daily_goal = twitch.Twitch._notify_daily_goal

    def __init__(self):
        super().__init__()
        self._reward_backoff = {}


class DaysTests(unittest.TestCase):
    def test_days_of_a_campaign_from_its_summary(self):
        self.assertEqual(rw.campaign_days(SUMMARY), 6)
        self.assertEqual(rw.campaign_days("Watch for 1 hour on 6 days to earn it"), 6)
        self.assertEqual(rw.campaign_days("on seven separate days"), 7)
        self.assertEqual(rw.campaign_days("Watch streamers for 3 days to earn it"), 3)
        for none in (None, "", "Watch for an hour", "watch each day", "on 1 day only", "for 400 days", 5,
                     "Watch streamers; the offer is valid within 14 days of launch", "The campaign is available for 30 days.",
                     "Offer ends within 7 days. Watch an hour today"):
            self.assertIsNone(rw.campaign_days(none), none)


class ChooseSlotTests(unittest.TestCase):
    def pick(self, campaigns, **kw):
        kw.setdefault("forced_id", None)
        kw.setdefault("priority", [])
        kw.setdefault("drops_available", True)
        got, reason = rw.choose(campaigns, now=NOW, **kw)
        return (got or {}).get("id"), reason

    def test_the_slot_takes_precedence_over_wanted_drops(self):
        v = base.viewed(id="a")
        self.assertEqual(self.pick([v], priority=["reward:a"], daily_slot=True)[0], "a")
        self.assertEqual(self.pick([v], priority=["reward:a"], daily_slot=False)[0], None, "slot off: drops first as before")

    def test_a_done_campaign_gives_the_slot_back_to_drops(self):
        self.assertIsNone(self.pick([base.viewed(id="a", doneToday=True)], priority=["reward:a"], daily_slot=True)[0])

    def test_queue_order_one_at_a_time_and_ineligible_ones_are_skipped(self):
        camps = [base.viewed(id="a", hidden=True), base.viewed(id="b", earned=True), base.viewed(id="c"), base.viewed(id="d"),
                 base.viewed(id="e", endsAt="2026-11-19T11:00:00Z"), base.viewed(id="f", farmable=False)]
        self.assertEqual(self.pick(camps, priority=["Rust", "reward:a", "reward:b", "reward:d", "reward:c", "reward:e", "reward:f"], daily_slot=True)[0], "d")

    def test_skipped_campaigns_wait_but_forced_ignores_the_skip(self):
        camps = [base.viewed(id="a"), base.viewed(id="b")]
        self.assertEqual(self.pick(camps, priority=["reward:a", "reward:b"], daily_slot=True, skip={"a"})[0], "b")
        self.assertIsNone(self.pick(camps, priority=["reward:a"], daily_slot=True, skip={"a"})[0])
        self.assertEqual(self.pick(camps, forced_id="a", skip={"a"})[0], "a")

    def test_a_forced_game_leaves_no_slot_at_all(self):
        v = base.viewed(id="a")
        self.assertEqual(self.pick([v], priority=["reward:a"], daily_slot=True, forced_game=True), (None, None))
        self.assertEqual(self.pick([v], priority=["reward:a"], daily_slot=True, forced_game=True, drops_available=False), (None, None))
        self.assertEqual(self.pick([v], forced_id="a", forced_game=True)[0], "a", "a forced reward is its own request")

    def test_a_spent_slot_budget_leaves_only_the_queue_fallback(self):
        v = base.viewed(id="a")
        self.assertIsNone(self.pick([v], priority=["reward:a"], daily_slot=True, slot_exhausted=True)[0])
        self.assertEqual(self.pick([v], priority=["reward:a"], daily_slot=True, slot_exhausted=True, drops_available=False)[0], "a")

    def test_without_drops_the_queue_works_as_before(self):
        self.assertEqual(self.pick([base.viewed(id="a")], priority=["reward:a"], drops_available=False, daily_slot=False)[0], "a")


class DaysExhaustedTests(unittest.TestCase):
    def test_all_days_done_makes_a_campaign_ineligible(self):
        c = base.viewed(id="a", daysDone=6, daysTotal=6)
        self.assertIn("все дни выполнены", rw.ineligible_reason(c, NOW))
        self.assertIsNone(rw.ineligible_reason(base.viewed(id="a", daysDone=5, daysTotal=6), NOW))
        self.assertIsNone(rw.ineligible_reason(base.viewed(id="a", daysDone=9, daysTotal=None), NOW), "no known total: no limit")
        self.assertEqual(rw.choose([c], forced_id=None, priority=["reward:a"], drops_available=False, now=NOW)[0], None)
        got, reason = rw.choose([c], forced_id="a", priority=[], drops_available=False, now=NOW)
        self.assertEqual(got, None)
        self.assertIn("все дни выполнены", reason)

    def test_the_auto_queue_still_lists_it_as_queueable_only_while_days_remain(self):
        camps = [base.viewed(id="a", daysDone=6, daysTotal=6), base.viewed(id="b", daysDone=2, daysTotal=6)]
        self.assertEqual(rw.auto_queue_additions(camps, [], [], NOW), ["b"])


class SlotBudgetTests(unittest.TestCase):
    def test_the_budget_is_the_largest_goal_of_queued_campaigns_capped_at_an_hour(self):
        camps = [base.viewed(id="a", dailyGoal=30), base.viewed(id="b", dailyGoal=45), base.viewed(id="c", dailyGoal=120), base.viewed(id="d", dailyGoal=50)]
        self.assertEqual(rw.slot_budget(camps, ["reward:a", "reward:b"], NOW), 45)
        self.assertEqual(rw.slot_budget(camps, ["reward:a", "reward:c"], NOW), 60, "capped")
        self.assertEqual(rw.slot_budget(camps, ["Rust"], NOW), 0)
        self.assertEqual(rw.slot_budget([], ["reward:a"], NOW), 0)

    def test_a_done_campaign_still_counts_so_the_budget_is_stable_through_the_day(self):
        camps = [base.viewed(id="a", dailyGoal=60, doneToday=True), base.viewed(id="b", dailyGoal=30)]
        self.assertEqual(rw.slot_budget(camps, ["reward:a", "reward:b"], NOW), 60)

    def test_hidden_earned_ended_unfarmable_and_finished_campaigns_do_not_count(self):
        camps = [base.viewed(id="a", dailyGoal=60, hidden=True), base.viewed(id="b", dailyGoal=60, earned=True),
                 base.viewed(id="c", dailyGoal=60, endsAt="2026-11-19T11:00:00Z"), base.viewed(id="d", dailyGoal=60, farmable=False),
                 base.viewed(id="e", dailyGoal=60, daysDone=6, daysTotal=6), base.viewed(id="f", dailyGoal=20)]
        self.assertEqual(rw.slot_budget(camps, [f"reward:{x}" for x in "abcdef"], NOW), 20)


class LedgerSlotTests(base.TempDir):
    def test_slot_minutes_are_per_day_and_persist(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.add_slot_seconds(1800, NOW)
        ledger.add_slot_seconds(900, NOW)
        self.assertEqual(ledger.slot_minutes_today(NOW), 45)
        self.assertEqual(ledger.slot_minutes_today(NOW + timedelta(days=1)), 0)
        self.assertEqual(rw.WatchLedger(self.dir / "l.json").slot_minutes_today(NOW), 45)

    def test_old_slot_days_are_pruned_and_odd_values_ignored(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.add_slot_seconds(600, NOW - timedelta(days=45))
        ledger.add_slot_seconds(float("nan"), NOW)
        ledger.add_seconds("x", 1, NOW)
        self.assertEqual(list(ledger.slot_seconds), [NOW.strftime("%Y-%m-%d")])
        self.assertEqual(ledger.slot_minutes_today(NOW), 0)

    def test_every_queue_entry_ever_seen_is_remembered(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        self.assertTrue(ledger.mark_queued(["a", "b"]))
        self.assertFalse(ledger.mark_queued(["a"]), "nothing new: no write")
        self.assertEqual(rw.WatchLedger(self.dir / "l.json").queued, ["a", "b"])

    def test_daily_reward_is_per_day_and_campaign_and_survives_a_restart(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.mark_daily_reward("a", NOW)
        self.assertTrue(ledger.daily_reward_today("a", NOW))
        self.assertFalse(ledger.daily_reward_today("b", NOW))
        self.assertFalse(ledger.daily_reward_today("a", NOW + timedelta(days=1)))
        self.assertTrue(rw.WatchLedger(self.dir / "l.json").daily_reward_today("a", NOW))
        saved = json.loads((self.dir / "l.json").read_text(encoding="utf-8"))
        self.assertEqual(saved["daily_rewards"], {"2026-11-19": {"a": True}})

    def test_daily_rewards_are_pruned_with_the_days(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.mark_daily_reward("a", NOW - timedelta(days=45))
        ledger.add_seconds("x", 1, NOW)
        self.assertEqual(ledger.daily_rewards, {})

    def test_days_with_the_goal_reached(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        for d in range(3):
            ledger.add_seconds("a", 3600, NOW - timedelta(days=d))
        ledger.add_seconds("a", 1800, NOW - timedelta(days=3))
        ledger.add_seconds("b", 7200, NOW)
        self.assertEqual(ledger.days_done("a", 60), 3)
        self.assertEqual(ledger.days_done("a", 30), 4)
        self.assertEqual(ledger.days_done("zzz", 60), 0)

    def test_queued_ids_are_remembered_and_capped(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.mark_queued(["a", "b", "a"])
        self.assertEqual(rw.WatchLedger(self.dir / "l.json").queued, ["a", "b"])
        ledger.mark_queued([f"x{i}" for i in range(500)])
        self.assertLessEqual(len(ledger.queued), rw.QUEUED_LIMIT)
        self.assertEqual(ledger.queued[-1], "x499")


class ViewSlotTests(base.TempDir):
    def test_view_carries_the_day_fields(self):
        resolver, ledger = rw.CategoryResolver(self.dir / "c.json"), rw.WatchLedger(self.dir / "l.json")
        c = camp(game="Some Game")
        ledger.add_seconds("a", 3600, NOW - timedelta(days=1))
        ledger.add_seconds("a", 3600, NOW)
        ledger.mark_daily_reward("a", NOW)
        got = rw.view([c], [], {}, resolver, ledger, NOW)[0]
        self.assertEqual((got["daysDone"], got["daysTotal"], got["dailyRewardToday"], got["doneToday"]), (2, 6, True, True))
        other = rw.view([camp(id="z", game="G", summary=None)], [], {}, resolver, ledger, NOW)[0]
        self.assertEqual((other["daysDone"], other["daysTotal"], other["dailyRewardToday"]), (0, None, False))


class AutoQueueTests(unittest.TestCase):
    def test_which_campaigns_are_appended(self):
        camps = [base.viewed(id="a"), base.viewed(id="b"), base.viewed(id="c", hidden=True), base.viewed(id="d", earned=True),
                 base.viewed(id="e", farmable=False), base.viewed(id="f", endsAt="2026-11-19T11:00:00Z"), base.viewed(id="g"),
                 base.viewed(id="h", doneToday=True)]
        got = rw.auto_queue_additions(camps, ["Rust", "reward:b"], {"g"}, NOW)
        self.assertEqual(got, ["a", "h"], "done today still counts: it is farmable tomorrow; queued and already-added ones do not")


class FinalRewardTests(unittest.TestCase):
    def test_final_group_is_the_last_of_several(self):
        self.assertEqual(rw.final_reward_names(camp()), ["Grand Final Prize"])

    def test_a_single_group_of_a_multi_day_campaign_has_no_identifiable_final_reward(self):
        one = camp(groups=[GROUPS[0]])
        self.assertEqual(rw.final_reward_names(one), [])
        self.assertEqual(rw.final_reward_names(camp(groups=[GROUPS[0]], summary="Watch an hour")), ["Daily Purple Chain"])
        self.assertEqual(rw.final_reward_names({"id": "x"}), [])


class EarnedRuleTests(unittest.TestCase):
    def test_a_daily_badge_notification_never_names_the_campaign(self):
        self.assertIsNone(rw.match_earned(LIVE_DAILY, [camp()]))
        self.assertIsNone(rw.match_earned({**LIVE_DAILY, "body": "Вы заработали Daily Purple Chain!"}, [camp()]), "a daily reward is not the final one")

    def test_the_final_reward_or_an_explicit_id_closes_the_campaign(self):
        self.assertEqual(rw.match_earned({**LIVE_DAILY, "body": "You earned Grand Final Prize!"}, [camp()]), "a")
        self.assertEqual(rw.match_earned({**LIVE_DAILY, "campaignId": "a"}, [camp()]), "a")

    def test_the_campaign_name_alone_does_not_match(self):
        self.assertIsNone(rw.match_earned({**LIVE_DAILY, "title": "A Campaign"}, [camp(name="A Campaign Name Long")]))


class SlotEngineTests(base.TempDir):
    def setUp(self):
        super().setUp()
        self.saved = (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
                      STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, getattr(STATE_BRIDGE, "reward_daily_slot", True))
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_daily_slot = True, True
        STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.forced_game = [], {}, None
        STATE_BRIDGE.reward_campaigns = [camp(id="a", name="Alpha"),
                                         camp(id="b", name="Beta", groups=[GROUPS[0], {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Another Final Prize"}]}])]
        for c in STATE_BRIDGE.reward_campaigns:
            rw.REWARD_WATCH.resolver.entries[c["id"]] = {"sig": rw.CategoryResolver.signature(c), "at": 1e12, "seen": 1e12,
                                                         "category": {"name": "Grand Theft Auto VI", "slug": "gta6", "source": "guess"}}
        self.addCleanup(self.restore)
        self.engine = SlotEngine()
        self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]

    def restore(self):
        (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
         STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.reward_daily_slot) = self.saved
        STATE_BRIDGE.reward_watching = None

    def test_the_slot_runs_before_drops_and_replaces_them(self):
        self.engine._choose_reward_target(None, ["Rust", "reward:b", "reward:a"])
        self.assertEqual(self.engine.reward_target["id"], "b")
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Grand Theft Auto VI"])

    def test_with_the_slot_off_drops_stay_first(self):
        STATE_BRIDGE.reward_daily_slot = False
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Rust"])

    def test_after_the_goal_drops_resume(self):
        rw.REWARD_WATCH.ledger.add_seconds("a", 3600)
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Rust"])

    # no wasted slot
    def tick_time(self, at):
        saved = twitch.time
        twitch.time = lambda: at
        return saved

    def test_no_streams_skips_the_slot_for_fifteen_minutes_then_retries(self):
        self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
        self.assertEqual(self.engine.reward_target["id"], "a")
        saved = self.tick_time(10000.0)
        try:
            with self.assertLogs("TwitchDrops", level="INFO") as logs:
                self.assertTrue(self.engine._reward_skip_for_a_while("нет стримов"))
            self.assertIn("[НАГРАДА] В категории «Grand Theft Auto VI» нет стримов, вернёмся через 15 мин", "\n".join(logs.output))
            self.assertIsNone(self.engine.reward_target)
            self.assertEqual(self.engine._reward_backoff["a"], 10000.0 + 900)
            self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]
            twitch.time = lambda: 10000.0 + 600
            self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
            self.assertEqual(self.engine.reward_target["id"], "b", "meanwhile the next queued campaign (or drops) goes")
            self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]
            twitch.time = lambda: 10000.0 + 901
            self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
            self.assertEqual(self.engine.reward_target["id"], "a", "retried after 15 minutes")
            self.assertNotIn("a", self.engine._reward_backoff)
        finally:
            twitch.time = saved

    def test_drops_run_meanwhile(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.engine._reward_skip_for_a_while("x")
        self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Rust"])

    def test_a_forced_campaign_is_never_skipped(self):
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        self.engine._choose_reward_target("a", [])
        self.assertFalse(self.engine._reward_skip_for_a_while("x"))
        self.assertEqual(self.engine.reward_target["id"], "a")

    def test_the_stall_watchdog_also_backs_off(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.engine.stop_watching = lambda: None
        self.engine._reward_last_success = 1000.0
        saved = self.tick_time(1000.0 + 901)
        try:
            run(self.engine._reward_tick(FakeChannel(sends=False)))
        finally:
            twitch.time = saved
        self.assertIn("a", self.engine._reward_backoff)

    def test_the_wiring_of_the_no_channel_branch(self):
        import inspect
        self.assertIn("_reward_skip_for_a_while", inspect.getsource(twitch.Twitch._run))

    # daily badges
    def test_a_daily_badge_while_the_target_is_watched_is_todays_reward_not_the_end(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned(LIVE_DAILY)
        ledger = rw.REWARD_WATCH.ledger
        self.assertTrue(ledger.daily_reward_today("a"))
        self.assertFalse(ledger.is_earned("a"))
        view = rw.REWARD_WATCH.view(STATE_BRIDGE.reward_campaigns, [], {})[0]
        self.assertTrue(view["dailyRewardToday"])
        self.assertFalse(view["earned"])

    def test_a_daily_badge_without_a_watched_campaign_only_logs(self):
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned(LIVE_DAILY)
        self.assertEqual((rw.REWARD_WATCH.ledger.daily_rewards, rw.REWARD_WATCH.ledger.earned), ({}, {}))

    def test_the_final_reward_closes_the_campaign(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned({**LIVE_DAILY, "body": "Вы заработали Grand Final Prize!"})
        self.assertTrue(rw.REWARD_WATCH.ledger.is_earned("a"))

    # the daily goal notification
    def sent_toasts(self):
        import notifications
        sent = []
        saved = notifications.NOTIFIER
        notifications.NOTIFIER = notifications.ToastGate(lambda t, m: sent.append((t, m)), lambda: True, None)
        self.addCleanup(setattr, notifications, "NOTIFIER", saved)
        return sent

    def reach_goal(self, at):
        self.engine._choose_reward_target(None, ["reward:a"])  # chosen while today's minutes are still short of the goal
        rw.REWARD_WATCH.ledger.add_seconds("a", 3600)
        self.engine.stop_watching = lambda: None
        saved = self.tick_time(at)
        try:
            self.engine._reward_goal_reached(self.engine.reward_target, 60)
        finally:
            twitch.time = saved

    def test_the_goal_notifies_with_the_day_number_and_total(self):
        sent = self.sent_toasts()
        for d in (2, 1):
            rw.REWARD_WATCH.ledger.add_seconds("a", 3600, datetime.now(timezone.utc) - timedelta(days=d))
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            self.reach_goal(1.0)
        self.assertEqual(sent, [("Twitch Drops Sentinel", "Alpha: дневная цель выполнена (день 3 из 6)")])
        self.assertIn("день 3 из 6", "\n".join(logs.output))

    def test_the_total_is_left_out_when_the_summary_has_none(self):
        sent = self.sent_toasts()
        STATE_BRIDGE.reward_campaigns[0]["summary"] = "Watch for an hour."
        rw.REWARD_WATCH.resolver.entries["a"]["sig"] = rw.CategoryResolver.signature(STATE_BRIDGE.reward_campaigns[0])
        self.reach_goal(1.0)
        self.assertEqual(sent[0][1], "Alpha: дневная цель выполнена (день 1)")

    def test_one_toast_per_campaign_and_day(self):
        sent = self.sent_toasts()
        self.reach_goal(1.0)
        self.engine._notify_daily_goal(self.engine.reward_target or rw.REWARD_WATCH.view(STATE_BRIDGE.reward_campaigns, [], {})[0], 60)
        self.assertEqual(len(sent), 1)


    # forced games, mid-watch ineligibility, the slot budget, plausible daily badges
    def test_a_forced_game_keeps_the_reward_slot_out(self):
        rust = Game({"id": 1, "displayName": "Rust"})
        self.engine.forced_game = STATE_BRIDGE.forced_game = "Rust"
        self.engine.wanted_games = [rust]
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual(self.engine.wanted_games, [rust], "the forced isolation is not overwritten")

    def test_a_forced_game_with_no_drops_at_all_gets_no_reward_either(self):
        self.engine.forced_game = "Rust"
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)

    def tick(self, channel, at):
        saved = twitch.time
        twitch.time = lambda: at
        try:
            return run(self.engine._reward_tick(channel))
        finally:
            twitch.time = saved

    def stopped(self):
        calls = []
        self.engine.stop_watching = lambda: calls.append(1)
        return calls

    def test_a_campaign_that_turned_ineligible_mid_watch_stops_at_the_next_beat(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        calls = self.stopped()
        rw.REWARD_WATCH.ledger.mark_earned("a")
        self.tick(FakeChannel(), 1000.0)
        self.assertEqual((self.engine.reward_target, calls), (None, [1]))
        self.assertIn(twitch.State.GAMES_UPDATE, self.engine.states)

    def test_hidden_ended_and_finished_days_stop_too(self):
        for label, change in (("hidden", lambda: setattr(STATE_BRIDGE, "reward_hidden", ["a"])),
                              ("ended", lambda: STATE_BRIDGE.reward_campaigns[0].update(endsAt="2026-11-19T00:00:01Z")),
                              ("days", lambda: [rw.REWARD_WATCH.ledger.add_seconds("a", 3600, datetime.now(timezone.utc) - timedelta(days=d)) for d in range(1, 7)])):
            with self.subTest(label):
                STATE_BRIDGE.reward_hidden = []
                STATE_BRIDGE.reward_campaigns[0].pop("endsAt", None)
                self.engine.states.clear()
                self.engine.wanted_games = []
                self.engine._choose_reward_target(None, ["reward:a"])
                self.assertIsNotNone(self.engine.reward_target, label)
                calls = self.stopped()
                change()
                self.tick(FakeChannel(), 1000.0)
                self.assertEqual((self.engine.reward_target, calls), (None, [1]), label)
                rw.REWARD_WATCH.ledger.days.clear()

    def test_turning_the_slot_off_stops_a_slot_pick_but_not_a_forced_or_queue_only_one(self):
        self.engine._choose_reward_target(None, ["reward:a"])  # drops wanted: a slot pick
        self.assertTrue(self.engine._reward_slot_pick)
        calls = self.stopped()
        STATE_BRIDGE.reward_daily_slot = False
        self.engine.settings.priority = ["reward:a"]
        self.engine.reward_settings_changed()
        self.assertEqual((self.engine.reward_target, calls), (None, [1]))
        # queue-only pick (nothing else wanted): not a slot pick
        STATE_BRIDGE.reward_daily_slot = True
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertFalse(self.engine._reward_slot_pick)
        STATE_BRIDGE.reward_daily_slot = False
        self.engine.reward_settings_changed()
        self.assertIsNotNone(self.engine.reward_target)
        # forced
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        self.engine.wanted_games = []
        self.engine._choose_reward_target("a", [])
        self.engine.reward_settings_changed()
        self.assertIsNotNone(self.engine.reward_target)

    def test_a_tick_notices_the_slot_switch_too(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        calls = self.stopped()
        STATE_BRIDGE.reward_daily_slot = False
        self.tick(FakeChannel(), 1000.0)
        self.assertEqual((self.engine.reward_target, calls), (None, [1]))

    def test_removing_the_watched_campaign_from_the_queue_stops_it_unless_forced(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        calls = self.stopped()
        self.engine.settings.priority = ["Rust", "reward:a"]
        self.engine.reward_settings_changed()
        self.assertEqual(calls, [], "still queued")
        self.engine.settings.priority = ["Rust"]
        self.engine.reward_settings_changed()
        self.assertEqual((self.engine.reward_target, calls), (None, [1]))
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        self.engine.wanted_games = []
        self.engine._choose_reward_target("a", [])
        self.engine.reward_settings_changed()
        self.assertIsNotNone(self.engine.reward_target, "forced: the queue does not matter")

    def test_an_earned_notification_for_the_watched_campaign_stops_it_at_once(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        calls = self.stopped()
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned({**LIVE_DAILY, "campaignId": "a"})
        self.assertEqual((self.engine.reward_target, calls), (None, [1]))
        self.assertTrue(rw.REWARD_WATCH.ledger.is_earned("a"))

    # the budget
    def test_the_slot_budget_stops_further_slot_picks_and_says_so_once(self):
        self.engine.settings.priority = ["reward:a", "reward:b"]
        rw.REWARD_WATCH.ledger.add_slot_seconds(3600)
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
        self.assertIsNone(self.engine.reward_target)
        self.assertIn("[НАГРАДА] Дневной лимит слота исчерпан, остальные награды — когда нет дропов", "\n".join(logs.output))
        self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]
        with self.assertNoLogs("TwitchDrops", level="INFO"):
            self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
        self.assertEqual(self.engine.reward_target["id"], "a", "the queue-only fallback is still allowed")
        self.assertFalse(self.engine._reward_slot_pick)

    def test_slot_beats_count_toward_the_budget_but_queue_only_beats_do_not(self):
        self.engine.settings.priority = ["reward:a"]
        self.engine._choose_reward_target(None, ["reward:a"])
        self.tick(FakeChannel(), 1000.0)
        self.tick(FakeChannel(), 1020.0)
        self.assertEqual(rw.REWARD_WATCH.ledger.slot_seconds[next(iter(rw.REWARD_WATCH.ledger.slot_seconds))], 20.0)
        rw.REWARD_WATCH.ledger.slot_seconds.clear()
        self.engine._set_reward_target(None)
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertFalse(self.engine._reward_slot_pick)
        self.tick(FakeChannel(), 2000.0)
        self.tick(FakeChannel(), 2020.0)
        self.assertEqual(rw.REWARD_WATCH.ledger.slot_seconds, {})

    def test_a_slot_pick_stops_when_the_day_budget_is_reached_mid_watch(self):
        self.engine.settings.priority = ["reward:a"]
        self.engine._choose_reward_target(None, ["reward:a"])
        calls = self.stopped()
        rw.REWARD_WATCH.ledger.add_slot_seconds(3590)
        self.tick(FakeChannel(), 1000.0)
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            self.tick(FakeChannel(), 1020.0)
        self.assertEqual((self.engine.reward_target, calls), (None, [1]))
        self.assertIn("Дневной лимит слота исчерпан", "\n".join(logs.output))

    def test_the_slot_status_for_the_page(self):
        bridge = SimpleNamespace(reward_campaigns=STATE_BRIDGE.reward_campaigns)
        settings = {"reward_campaigns_enabled": True, "priority_games": ["reward:a", "reward:b"]}
        rw.REWARD_WATCH.ledger.add_slot_seconds(1800)
        self.assertEqual(rc.slot_status(bridge, settings), (30, 60))
        self.assertEqual(rc.slot_status(bridge, {**settings, "reward_daily_slot": False}), (30, 0), "slot off: no budget")
        self.assertEqual(rc.slot_status(bridge, {"priority_games": ["reward:a"]}), (0, 0), "rewards off")

    # plausible daily badges
    def test_a_badge_that_names_another_campaign_is_not_this_ones(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned({**LIVE_DAILY, "campaignId": "b"})
        self.assertFalse(rw.REWARD_WATCH.ledger.daily_reward_today("a"))
        self.assertTrue(rw.REWARD_WATCH.ledger.is_earned("b"), "an explicit id still closes that other campaign")
        final = [GROUPS[0], {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Shared Prize Name"}]}]
        STATE_BRIDGE.reward_campaigns += [camp(id="c", name="Gamma", groups=final), camp(id="d", name="Delta", groups=final)]
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned({**LIVE_DAILY, "body": "You earned Shared Prize Name"})
        self.assertFalse(rw.REWARD_WATCH.ledger.daily_reward_today("a"), "another campaign's final reward, even when two share the name")
        self.assertFalse(rw.REWARD_WATCH.ledger.earned.get("c") or rw.REWARD_WATCH.ledger.earned.get("d"), "ambiguous: neither is closed")

    def test_a_badge_that_names_nothing_still_counts_for_the_watched_one(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned(LIVE_DAILY)
        self.assertTrue(rw.REWARD_WATCH.ledger.daily_reward_today("a"))


class SlotSettingsTests(unittest.TestCase):
    def test_the_new_switches_are_bools_only(self):
        for key in ("reward_daily_slot", "reward_auto_queue"):
            ok = {key: False}
            rc.drop_invalid_setting(ok)
            self.assertEqual(ok, {key: False})
            for bad in ("yes", 1, None, [True]):
                data = {key: bad, "keep": 1}
                with self.assertLogs("TwitchDrops.RewardCampaigns", level="WARNING"):
                    rc.drop_invalid_setting(data)
                self.assertEqual(data, {"keep": 1})

    def test_defaults_the_slot_on_and_the_auto_queue_off(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=False, reward_campaigns=[])
        rc.apply_setting(bridge, {})
        self.assertEqual((bridge.reward_daily_slot, bridge.reward_auto_queue), (True, False))
        rc.apply_setting(bridge, {"reward_daily_slot": False, "reward_auto_queue": True})
        self.assertEqual((bridge.reward_daily_slot, bridge.reward_auto_queue), (False, True))


class QueueMemoryTests(base.TempDir):
    def setUp(self):
        super().setUp()
        self.saved = rw.REWARD_WATCH
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        self.addCleanup(setattr, rw, "REWARD_WATCH", self.saved)

    def test_apply_setting_remembers_every_reward_entry_of_the_queue(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=False, reward_campaigns=[])
        rc.apply_setting(bridge, {"priority_games": ["Rust", "reward:a", "reward:b"]})
        self.assertEqual(rw.REWARD_WATCH.ledger.queued, ["a", "b"])
        rc.apply_setting(bridge, {"priority_games": ["Rust"]})
        self.assertEqual(rw.REWARD_WATCH.ledger.queued, ["a", "b"], "removing it does not forget it")

    def test_nothing_is_written_for_a_queue_without_reward_entries(self):
        rc.apply_setting(SimpleNamespace(reward_campaigns_enabled=False, reward_campaigns=[]), {"priority_games": ["Rust"]})
        self.assertFalse((self.dir / "reward_watch.json").exists())

    def test_a_manually_queued_then_removed_campaign_is_not_auto_added(self):
        c = camp(id="a")
        rw.REWARD_WATCH.resolver.entries["a"] = {"sig": rw.CategoryResolver.signature(c), "at": 1e12, "seen": 1e12,
                                                 "category": {"name": "Cat", "slug": "cat", "source": "guess"}}
        bridge = SimpleNamespace(reward_campaigns_enabled=True, reward_campaigns=[c])
        on = {"reward_campaigns_enabled": True, "reward_auto_queue": True}
        rc.apply_setting(bridge, {**on, "priority_games": ["reward:a"]})
        rc.apply_setting(bridge, {**on, "priority_games": []})
        self.assertEqual(rc.auto_queue_plan(bridge, {**on, "priority_games": []}), (None, []))

    def test_queue_pending_ignores_a_campaign_in_backoff(self):
        c = camp(id="a", game="G")
        bridge = SimpleNamespace(reward_campaigns=[c], reward_backoff={})
        settings = {"reward_campaigns_enabled": True, "priority_games": ["reward:a"]}
        self.assertTrue(rc.queue_pending(bridge, settings))
        import time as _t
        bridge.reward_backoff = {"a": _t.time() + 600}
        self.assertFalse(rc.queue_pending(bridge, settings), "waiting 15 minutes: the auto shutdown must not wait for it")
        bridge.reward_backoff = {"a": _t.time() - 1}
        self.assertTrue(rc.queue_pending(bridge, settings), "backoff over")

    def test_a_skip_is_mirrored_for_the_service(self):
        engine = SlotEngine()
        STATE_BRIDGE.reward_backoff = {}
        engine._reward_backoff = {"x": 1e12}
        saved = (STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories)
        try:
            STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns = True, [camp(id="a")]
            STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories = [], {}
            rw.REWARD_WATCH.resolver.entries["a"] = {"sig": rw.CategoryResolver.signature(STATE_BRIDGE.reward_campaigns[0]), "at": 1e12, "seen": 1e12,
                                                     "category": {"name": "Cat", "slug": "cat", "source": "guess"}}
            engine._choose_reward_target(None, ["reward:a"])
            engine.stop_watching = lambda: None
            engine._reward_skip_for_a_while()
            self.assertIn("a", STATE_BRIDGE.reward_backoff)
        finally:
            (STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories) = saved
            STATE_BRIDGE.reward_backoff = {}
            STATE_BRIDGE.reward_watching = None


class AutoQueuePlanTests(base.TempDir):
    def plan(self, settings, camps):
        saved = rw.REWARD_WATCH
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        try:
            for c in camps:
                rw.REWARD_WATCH.resolver.entries[c["id"]] = {"sig": rw.CategoryResolver.signature(c), "at": 1e12, "seen": 1e12,
                                                             "category": {"name": "Cat", "slug": "cat", "source": "guess"}}
            return rc.auto_queue_plan(SimpleNamespace(reward_campaigns=camps), settings), rw.REWARD_WATCH
        finally:
            rw.REWARD_WATCH = saved

    def test_farmable_campaigns_go_to_the_end_of_the_queue_once(self):
        on = {"reward_campaigns_enabled": True, "reward_auto_queue": True, "priority_games": ["Rust", "reward:b"]}
        subs = camp(id="s", minutesGoal=None, groups=[GROUPS[1]])
        (new, added), _ = self.plan(on, [camp(id="a"), camp(id="b"), subs])
        self.assertEqual((new, added), (["Rust", "reward:b", "reward:a"], ["a"]), "queued and subs-only ones are left out")

    def test_off_or_nothing_new_changes_nothing(self):
        camps = [camp(id="a")]
        for settings in ({"reward_campaigns_enabled": True, "priority_games": []}, {"reward_auto_queue": True, "priority_games": []},
                         {"reward_campaigns_enabled": True, "reward_auto_queue": True, "priority_games": ["reward:a"]}):
            (new, added), _ = self.plan(settings, camps)
            self.assertEqual((new, added), (None, []))

    def test_a_removed_campaign_is_not_added_again(self):
        saved = rw.REWARD_WATCH
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        try:
            c = camp(id="a")
            rw.REWARD_WATCH.resolver.entries["a"] = {"sig": rw.CategoryResolver.signature(c), "at": 1e12, "seen": 1e12,
                                                     "category": {"name": "Cat", "slug": "cat", "source": "guess"}}
            rw.REWARD_WATCH.ledger.mark_queued(["a"])
            bridge = SimpleNamespace(reward_campaigns=[c])
            self.assertEqual(rc.auto_queue_plan(bridge, {"reward_campaigns_enabled": True, "reward_auto_queue": True, "priority_games": []}), (None, []))
        finally:
            rw.REWARD_WATCH = saved


if __name__ == "__main__":
    unittest.main()
