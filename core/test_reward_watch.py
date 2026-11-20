"""Watching a category for reward campaigns: candidates, category resolution, the daily ledger, selection, earned
matching, the settings, and the engine glue (with fakes). Synthetic data only; nothing here talks to Twitch.

Run: python -m unittest discover -s core -p "test_reward*.py" -t core
"""
from __future__ import annotations

import asyncio
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"  # never open the Twitch activation page from tests
import json
import logging
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import reward_campaigns as rc
import reward_watch as rw

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)
GTA_SUMMARY = ("Unlock six Bling Badge viewership badges by watching GTAVI streamers for one hour each day on six different "
               "days between November 18-30. Subscribe three times to streamers in the GTAVI Category between ...")


def campaign(**over):
    base = {"id": "c1", "name": "GTAVI Launch Celebration", "summary": GTA_SUMMARY, "instructions": None, "game": None,
            "sitewide": True, "endsAt": "2026-12-01T07:59:59Z", "minutesGoal": 60, "subsGoal": 1, "rewards": [{"name": "GTA DVD Chest"}],
            "groups": [{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": [{"name": "GTA DVD Chest"}]},
                       {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "GTA Sub Emote Chest"}]}]}
    base.update(over)
    return base


def fake_validator(known: dict, calls: list | None = None):
    async def validator(name: str):
        if calls is not None:
            calls.append(name)
        return known.get(name)
    return validator


def run(coro):
    return asyncio.run(coro)


class TempDir(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)


class CandidateTests(unittest.TestCase):
    def test_shorthand_in_the_summary_becomes_the_listed_title(self):
        got = rw.guess_candidates("GTAVI Launch Celebration", GTA_SUMMARY, "")
        self.assertEqual(got[0], "Grand Theft Auto VI")
        self.assertEqual(got.count("Grand Theft Auto VI"), 1, "the same title from three phrases is listed once")

    def test_name_alone_is_enough_when_the_texts_say_nothing(self):
        self.assertEqual(rw.guess_candidates("GTAVI Launch Celebration", None, None), ["Grand Theft Auto VI"])

    def test_alias_spellings(self):
        for spelling in ("GTAVI", "GTA VI", "GTA6", "gta 6"):
            with self.subTest(spelling=spelling):
                self.assertEqual(rw.guess_candidates(None, f"Watch {spelling} streamers today", None), ["Grand Theft Auto VI"])
        self.assertEqual(rw.guess_candidates(None, "watching GTA V streamers", None), ["Grand Theft Auto V"])

    def test_phrase_in_the_x_category(self):
        self.assertEqual(rw.guess_candidates(None, "Subscribe to streamers in the Pokémon Legends Category now.", None), ["Pokémon Legends"])

    def test_generic_words_are_not_categories(self):
        self.assertEqual(rw.guess_candidates(None, "Watch live streamers for an hour. Watch any streamers too.", None), [])
        self.assertEqual(rw.guess_candidates("Drops Campaign", None, None), [])

    def test_name_loses_generic_words(self):
        self.assertEqual(rw.guess_candidates("Pokemon Evolutions Campaign", None, None), ["Pokemon Evolutions"])

    def test_empty_and_garbage_input(self):
        self.assertEqual(rw.guess_candidates(None, None, None), [])
        self.assertEqual(rw.guess_candidates("", "", ""), [])

    def test_candidates_are_capped(self):
        text = " ".join(f"watching Game{i} streamers." for i in range(20))
        self.assertLessEqual(len(rw.guess_candidates(None, text, None)), rw.CANDIDATE_LIMIT)


class KeyTests(unittest.TestCase):
    def test_reward_keys(self):
        self.assertTrue(rw.is_reward_key("reward:abc"))
        for bad in ("reward:", "Reward:abc", "rewardabc", "", None, 5, ["reward:a"]):
            self.assertFalse(rw.is_reward_key(bad), bad)
        self.assertEqual(rw.reward_id("reward:abc-1"), "abc-1")
        self.assertIsNone(rw.reward_id("Rust"))
        self.assertEqual(rw.reward_key("x"), "reward:x")


class SanitizeTests(unittest.TestCase):
    def test_hidden_list(self):
        self.assertEqual(rw.sanitize_hidden([" a ", "b", "a", "", "  "]), ["a", "b"])
        self.assertEqual(len(rw.sanitize_hidden([str(i) for i in range(500)])), rw.HIDDEN_LIMIT)
        self.assertEqual(rw.sanitize_hidden(["x" * 1000])[0], "x" * rw.ID_LIMIT)
        for bad in (None, "a", {"a": 1}, [1], ["a", None]):
            self.assertIsNone(rw.sanitize_hidden(bad), bad)

    def test_category_overrides(self):
        got = rw.sanitize_categories({"a": "  Just Chatting ", "b": "", "c": "   ", " d ": "X" * 500})
        self.assertEqual(got, {"a": "Just Chatting", "d": "X" * rw.CATEGORY_NAME_LIMIT})
        self.assertEqual(rw.sanitize_categories({}), {})
        for bad in (None, [], "x", {"a": 1}, {1: "a"}, {"a": None}):
            self.assertIsNone(rw.sanitize_categories(bad), bad)
        self.assertEqual(len(rw.sanitize_categories({str(i): "n" for i in range(300)})), rw.CATEGORY_MAP_LIMIT)

    def test_a_queue_key_survives_trimming(self):
        self.assertEqual(rw.clean_key("  reward:abc  "), "reward:abc")
        self.assertEqual(len(rw.clean_key("reward:" + "x" * 1000)), len("reward:") + rw.ID_LIMIT)


class LedgerTests(TempDir):
    def test_minutes_accumulate_and_persist(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        self.assertEqual(ledger.add_seconds("c1", 20, NOW), 0)
        for _ in range(8):
            ledger.add_seconds("c1", 20, NOW)
        self.assertEqual(ledger.minutes_today("c1", NOW), 3)
        self.assertEqual(rw.WatchLedger(self.dir / "l.json").minutes_today("c1", NOW), 3, "written when a whole minute passed")

    def test_utc_rollover_starts_a_new_day(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.add_seconds("c1", 3600, NOW)
        self.assertEqual(ledger.minutes_today("c1", NOW), 60)
        before_midnight = datetime(2026, 11, 19, 23, 59, 59, tzinfo=timezone.utc)
        after_midnight = datetime(2026, 11, 20, 0, 0, 1, tzinfo=timezone.utc)
        self.assertEqual(ledger.minutes_today("c1", before_midnight), 60)
        self.assertEqual(ledger.minutes_today("c1", after_midnight), 0)
        self.assertEqual(ledger.add_seconds("c1", 90, after_midnight), 1)

    def test_a_local_time_zone_does_not_move_the_day(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        late = datetime(2026, 11, 19, 23, 30, tzinfo=timezone(timedelta(hours=-5)))  # 04:30 UTC on the 20th
        ledger.add_seconds("c1", 120, late)
        self.assertEqual(ledger.minutes_today("c1", datetime(2026, 11, 20, 5, 0, tzinfo=timezone.utc)), 2)

    def test_days_older_than_forty_are_pruned(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        old = NOW - timedelta(days=41)
        recent = NOW - timedelta(days=39)
        ledger.add_seconds("c1", 120, old)
        ledger.add_seconds("c1", 120, recent)
        ledger.add_seconds("c1", 120, NOW)
        self.assertNotIn(old.strftime("%Y-%m-%d"), ledger.days)
        self.assertIn(recent.strftime("%Y-%m-%d"), ledger.days)
        saved = json.loads((self.dir / "l.json").read_text(encoding="utf-8"))
        self.assertNotIn(old.strftime("%Y-%m-%d"), saved["days"])

    def test_earned_is_remembered(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.mark_earned("c1", NOW)
        self.assertTrue(rw.WatchLedger(self.dir / "l.json").is_earned("c1"))
        self.assertFalse(ledger.is_earned("other"))

    def test_earned_expires_with_the_campaign_and_is_pruned(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.mark_earned("c1", NOW, until=NOW + timedelta(days=2))
        ledger.mark_earned("c2", NOW)
        self.assertTrue(ledger.is_earned("c1", NOW + timedelta(days=1)))
        self.assertFalse(ledger.is_earned("c1", NOW + timedelta(days=2, seconds=1)), "earned stops at the campaign end")
        self.assertTrue(ledger.is_earned("c2", NOW + timedelta(days=39)))
        self.assertFalse(ledger.is_earned("c2", NOW + timedelta(days=41)), "no end known: kept as long as the ledger days")
        ledger.add_seconds("x", 1, NOW + timedelta(days=45))
        self.assertEqual(ledger.earned, {})

    def test_old_earned_strings_still_load(self):
        (self.dir / "l.json").write_text(json.dumps({"days": {}, "earned": {"c1": NOW.isoformat()}}), encoding="utf-8")
        self.assertTrue(rw.WatchLedger(self.dir / "l.json").is_earned("c1", NOW + timedelta(days=1)))

    def test_non_finite_numbers_are_ignored(self):
        (self.dir / "l.json").write_text('{"days": {"2026-11-19": {"a": NaN, "b": Infinity, "c": -5, "d": 120}}, "earned": {}}', encoding="utf-8")
        ledger = rw.WatchLedger(self.dir / "l.json")
        self.assertEqual([ledger.minutes_today(k, NOW) for k in "abcd"], [0, 0, 0, 2])

    def test_a_corrupt_file_is_kept_aside_not_overwritten(self):
        (self.dir / "l.json").write_text("{not json", encoding="utf-8")
        with self.assertLogs("TwitchDrops.RewardWatch", level="ERROR"):
            rw.WatchLedger(self.dir / "l.json")
        kept = list(self.dir.glob("l.json.corrupt-*"))
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].read_text(encoding="utf-8"), "{not json")
        self.assertFalse((self.dir / "l.json").exists())

    def test_the_file_is_utf8_json_without_bom(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.add_seconds("c1", 60, NOW)
        self.assertFalse((self.dir / "l.json").read_bytes().startswith(b"\xef\xbb\xbf"))

    def test_a_broken_file_is_reported_and_starts_empty(self):
        (self.dir / "l.json").write_text("{not json", encoding="utf-8")
        with self.assertLogs("TwitchDrops.RewardWatch", level="ERROR"):
            ledger = rw.WatchLedger(self.dir / "l.json")
        self.assertEqual(ledger.minutes_today("c1", NOW), 0)

    def test_odd_values_in_the_file_are_ignored(self):
        (self.dir / "l.json").write_text(json.dumps({"days": {"2026-11-19": {"c1": "x", "c2": True, "c3": 300}, "bad": 1}, "earned": []}), encoding="utf-8")
        ledger = rw.WatchLedger(self.dir / "l.json")
        self.assertEqual((ledger.minutes_today("c1", NOW), ledger.minutes_today("c2", NOW), ledger.minutes_today("c3", NOW)), (0, 0, 5))

    def test_negative_time_is_ignored(self):
        ledger = rw.WatchLedger(self.dir / "l.json")
        ledger.add_seconds("c1", -500, NOW)
        self.assertEqual(ledger.minutes_today("c1", NOW), 0)


class ResolverTests(TempDir):
    def resolver(self):
        return rw.CategoryResolver(self.dir / "cats.json")

    def test_a_validated_guess_becomes_the_category(self):
        calls: list = []
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "grand-theft-auto-vi"}}
        resolver, camp = self.resolver(), campaign()
        run(resolver.resolve([camp], {}, fake_validator(known, calls)))
        self.assertEqual(resolver.cached(camp), {"name": "Grand Theft Auto VI", "slug": "grand-theft-auto-vi", "source": "guess"})
        self.assertEqual(calls, ["Grand Theft Auto VI"])

    def test_a_rejected_candidate_falls_back_to_the_next_one(self):
        calls: list = []
        camp = campaign(summary="Watch Foo Bar streamers. Also in the Real Game Category.", name="x")
        known = {"Foo Bar": {"name": "Foo Bar", "slug": "foo-bar"}}
        resolver = self.resolver()
        run(resolver.resolve([camp], {}, fake_validator(known, calls)))
        self.assertEqual(calls, ["Real Game", "Foo Bar"], "the Category phrase is tried first, the next candidate when it is refused")
        self.assertEqual(resolver.cached(camp)["name"], "Foo Bar")

    def test_a_different_game_in_the_answer_is_not_accepted(self):
        camp = campaign(summary=None, name="Foo Bar Campaign")
        known = {"Foo Bar": {"name": "Something Else Entirely", "slug": "something-else"}}
        resolver = self.resolver()
        run(resolver.resolve([camp], {}, fake_validator(known)))
        self.assertIsNone(resolver.cached(camp))

    def test_accents_do_not_defeat_the_check(self):
        camp = campaign(summary="watching Pokemon Legends streamers", name="x")
        known = {"Pokemon Legends": {"name": "Pokémon Legends", "slug": "pokemon-legends"}}
        resolver = self.resolver()
        run(resolver.resolve([camp], {}, fake_validator(known)))
        self.assertEqual(resolver.cached(camp)["slug"], "pokemon-legends")

    def test_unresolvable_is_logged_once_and_not_asked_again(self):
        calls: list = []
        resolver, camp = self.resolver(), campaign()
        with self.assertLogs("TwitchDrops.RewardWatch", level="INFO") as logs:
            run(resolver.resolve([camp], {}, fake_validator({}, calls)))
        self.assertEqual(len(logs.records), 1)
        self.assertIn(camp["name"], logs.output[0])
        self.assertIsNone(resolver.cached(camp))
        asked = len(calls)
        with self.assertNoLogs("TwitchDrops.RewardWatch", level="INFO"):
            run(resolver.resolve([camp], {}, fake_validator({}, calls)))
        self.assertEqual(len(calls), asked)

    def test_answers_survive_a_restart(self):
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "g"}}
        camp, dead = campaign(), campaign(id="c2", name="Nothing", summary=None)
        run(self.resolver().resolve([camp, dead], {}, fake_validator(known)))
        calls: list = []
        again = self.resolver()
        run(again.resolve([camp, dead], {}, fake_validator(known, calls)))
        self.assertEqual(calls, [], "neither the good nor the failed answer is asked again after a restart")
        self.assertEqual(again.cached(camp)["name"], "Grand Theft Auto VI")

    def test_changed_texts_are_asked_again(self):
        run(self.resolver().resolve([campaign()], {}, fake_validator({})))
        calls: list = []
        run(self.resolver().resolve([campaign(summary="watching Zed Game streamers")], {}, fake_validator({}, calls)))
        self.assertIn("Zed Game", calls)

    def test_a_lookup_error_is_logged_and_retried_next_time(self):
        async def broken(name):
            raise RuntimeError("network down")
        resolver, camp = self.resolver(), campaign()
        with self.assertLogs("TwitchDrops.RewardWatch", level="WARNING"):
            run(resolver.resolve([camp], {}, broken))
        calls: list = []
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "g"}}
        run(resolver.resolve([camp], {}, fake_validator(known, calls)))
        self.assertEqual(resolver.cached(camp)["slug"], "g")

    def test_game_user_and_subs_only_campaigns_are_not_looked_up(self):
        calls: list = []
        camps = [campaign(id="g", game="Some Game"), campaign(id="u"), campaign(id="s", minutesGoal=None, groups=[{"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": []}])]
        run(self.resolver().resolve(camps, {"u": "My Category"}, fake_validator({}, calls)))
        self.assertEqual(calls, [])


class ResolverBudgetTests(TempDir):
    def resolver(self):
        return rw.CategoryResolver(self.dir / "cats.json")

    def test_at_most_three_lookups_per_cycle_and_nothing_cached_for_the_rest(self):
        calls: list = []
        camps = [campaign(id=f"c{i}", name=f"Game{i} Campaign", summary=None) for i in range(5)]
        resolver = self.resolver()
        run(resolver.resolve(camps, {}, fake_validator({}, calls), max_lookups=3, now=1000.0))
        self.assertEqual(len(calls), 3)
        run(resolver.resolve(camps, {}, fake_validator({}, calls), max_lookups=3, now=1001.0))
        self.assertEqual(len(calls), 5, "the next cycle takes the remaining ones, the answered ones are not asked again")

    def test_a_slow_lookup_times_out_and_is_retried_not_cached(self):
        async def slow(name):
            await asyncio.sleep(5)
        resolver, camp = self.resolver(), campaign()
        with self.assertLogs("TwitchDrops.RewardWatch", level="WARNING"):
            run(resolver.resolve([camp], {}, slow, lookup_timeout=0.05, now=1000.0))
        calls: list = []
        run(resolver.resolve([camp], {}, fake_validator({}, calls), now=1001.0))
        self.assertTrue(calls, "asked again right away: a timeout is not an answer")

    def test_resolve_reports_how_many_categories_were_found(self):
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "g"}}
        self.assertEqual(run(self.resolver().resolve([campaign()], {}, fake_validator(known), now=1.0)), 1)
        self.assertEqual(run(self.resolver().resolve([campaign(id="z", name="Nothing", summary=None)], {}, fake_validator({}), now=1.0)), 0)

    def test_a_negative_answer_is_retried_after_six_hours(self):
        calls: list = []
        resolver, camp = self.resolver(), campaign()
        run(resolver.resolve([camp], {}, fake_validator({}, calls), now=1000.0))
        n = len(calls)
        run(resolver.resolve([camp], {}, fake_validator({}, calls), now=1000.0 + 5 * 3600))
        self.assertEqual(len(calls), n)
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "g"}}
        run(resolver.resolve([camp], {}, fake_validator(known, calls), now=1000.0 + 6 * 3600 + 1))
        self.assertGreater(len(calls), n)
        self.assertEqual(resolver.cached(camp)["slug"], "g")

    def test_a_positive_answer_does_not_expire(self):
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "g"}}
        resolver, camp = self.resolver(), campaign()
        run(resolver.resolve([camp], {}, fake_validator(known), now=1000.0))
        calls: list = []
        run(resolver.resolve([camp], {}, fake_validator(known, calls), now=1000.0 + 30 * 86400))
        self.assertEqual(calls, [])

    def test_entries_of_campaigns_not_seen_for_forty_days_are_dropped(self):
        known = {"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "g"}}
        resolver = self.resolver()
        run(resolver.resolve([campaign(id="old")], {}, fake_validator(known), now=1000.0))
        run(resolver.resolve([campaign(id="new")], {}, fake_validator(known), now=1000.0 + 41 * 86400))
        self.assertEqual(sorted(resolver.entries), ["new"])
        self.assertEqual(sorted(json.loads((self.dir / "cats.json").read_text(encoding="utf-8"))), ["new"])


def view_one(resolver, ledger, camp, hidden=(), categories=None, now=NOW):
    return rw.view([camp], hidden, categories or {}, resolver, ledger, now)[0]


class ViewTests(TempDir):
    def setUp(self):
        super().setUp()
        self.resolver = rw.CategoryResolver(self.dir / "cats.json")
        self.ledger = rw.WatchLedger(self.dir / "l.json")
        run(self.resolver.resolve([campaign()], {}, fake_validator({"Grand Theft Auto VI": {"name": "Grand Theft Auto VI", "slug": "gta6"}})))

    def test_guessed_category_makes_a_watch_campaign_farmable(self):
        got = view_one(self.resolver, self.ledger, campaign())
        self.assertEqual(got["category"], {"name": "Grand Theft Auto VI", "slug": "gta6", "source": "guess"})
        self.assertEqual((got["farmable"], got["dailyGoal"], got["watchedToday"], got["doneToday"], got["earned"], got["hidden"]),
                         (True, 60, 0, False, False, False))
        self.assertTrue(got["sitewide"])

    def test_precedence_game_over_user_over_guess(self):
        camp = campaign()
        self.assertEqual(view_one(self.resolver, self.ledger, camp, categories={"c1": "My Pick"})["category"]["source"], "user")
        self.assertEqual(view_one(self.resolver, self.ledger, camp, categories={"c1": "My Pick"})["category"]["name"], "My Pick")
        with_game = campaign(game="Real Game")
        got = view_one(self.resolver, self.ledger, with_game, categories={"c1": "My Pick"})["category"]
        self.assertEqual((got["name"], got["source"], got["slug"]), ("Real Game", "game", "real-game"))

    def test_no_category_means_not_farmable(self):
        got = view_one(self.resolver, self.ledger, campaign(id="other", name="Nothing", summary=None))
        self.assertIsNone(got["category"])
        self.assertFalse(got["farmable"])
        self.assertEqual(got["dailyGoal"], 60)

    def test_subs_only_is_never_farmable_even_with_a_category(self):
        subs_only = campaign(game="Real Game", minutesGoal=None, groups=[{"goalKind": "subs", "minutes": 0, "subs": 2, "rewards": []}])
        got = view_one(self.resolver, self.ledger, subs_only)
        self.assertFalse(got["farmable"])
        self.assertIsNone(got["dailyGoal"])
        self.assertFalse(got["doneToday"])

    def test_the_ledger_drives_done_today_and_rollover(self):
        self.ledger.add_seconds("c1", 59 * 60, NOW)
        self.assertEqual((view_one(self.resolver, self.ledger, campaign())["watchedToday"], view_one(self.resolver, self.ledger, campaign())["doneToday"]), (59, False))
        self.ledger.add_seconds("c1", 60, NOW)
        self.assertTrue(view_one(self.resolver, self.ledger, campaign())["doneToday"])
        tomorrow = NOW + timedelta(days=1)
        got = view_one(self.resolver, self.ledger, campaign(), now=tomorrow)
        self.assertEqual((got["watchedToday"], got["doneToday"]), (0, False))

    def test_earned_and_hidden_flags(self):
        self.ledger.mark_earned("c1", NOW)
        got = view_one(self.resolver, self.ledger, campaign(), hidden=["c1"])
        self.assertTrue(got["earned"] and got["hidden"])

    def test_input_is_not_changed_and_entries_without_fields_do_not_raise(self):
        camp = campaign()
        before = json.dumps(camp, sort_keys=True)
        view_one(self.resolver, self.ledger, camp)
        self.assertEqual(json.dumps(camp, sort_keys=True), before)
        got = rw.view([{"id": "bare"}], [], {}, self.resolver, self.ledger, NOW)[0]
        self.assertEqual((got["farmable"], got["groups"], got["sitewide"]), (False, [], False))


def viewed(**over):
    base = {"id": "c1", "name": "A", "farmable": True, "hidden": False, "earned": False, "doneToday": False,
            "endsAt": "2026-12-01T00:00:00Z", "category": {"name": "Cat", "slug": "cat", "source": "guess"}, "dailyGoal": 60}
    base.update(over)
    return base


class ChooseTests(unittest.TestCase):
    def pick(self, campaigns, **kw):
        kw.setdefault("forced_id", None)
        kw.setdefault("priority", [])
        kw.setdefault("drops_available", False)
        got, reason = rw.choose(campaigns, now=NOW, **kw)
        return (got or {}).get("id"), reason

    def test_drops_win_over_the_queue(self):
        self.assertEqual(self.pick([viewed()], priority=["reward:c1"], drops_available=True), (None, None))
        self.assertEqual(self.pick([viewed()], priority=["reward:c1"], drops_available=False)[0], "c1")

    def test_forced_wins_even_when_drops_exist_and_without_queue_entry(self):
        self.assertEqual(self.pick([viewed()], forced_id="c1", drops_available=True)[0], "c1")

    def test_queue_order_decides(self):
        camps = [viewed(id="a"), viewed(id="b"), viewed(id="c")]
        self.assertEqual(self.pick(camps, priority=["Rust", "reward:c", "reward:a", "reward:b"])[0], "c")

    def test_the_queue_skips_ineligible_and_takes_the_next(self):
        camps = [viewed(id="a", hidden=True), viewed(id="b", doneToday=True), viewed(id="c", earned=True),
                 viewed(id="d", endsAt="2026-11-19T11:00:00Z"), viewed(id="e", farmable=False), viewed(id="f")]
        order = [f"reward:{c}" for c in "abcdef"]
        self.assertEqual(self.pick(camps, priority=order)[0], "f")

    def test_only_reward_entries_count_and_unknown_ids_are_ignored(self):
        self.assertEqual(self.pick([viewed()], priority=["Rust", "reward:zzz", "c1"]), (None, None))

    def test_forced_ineligible_gives_a_reason(self):
        for over, word in ((dict(hidden=True), "скрыта"), (dict(earned=True), "получена"), (dict(doneToday=True), "дневная"),
                           (dict(farmable=False), "нет"), (dict(endsAt="2026-11-19T11:59:00Z"), "закончилась")):
            with self.subTest(over=over):
                got, reason = self.pick([viewed(**over)], forced_id="c1")
                self.assertIsNone(got)
                self.assertIn(word, reason)
        self.assertIsNone(self.pick([viewed()], forced_id="nope")[0])

    def test_nothing_in_the_list(self):
        self.assertEqual(self.pick([], priority=["reward:c1"]), (None, None))


class EarnedTests(unittest.TestCase):
    CAMPS = [campaign(id="11111111-aaaa-bbbb-cccc-000000000001", name="GTAVI Launch Celebration",
                      groups=[{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": [{"name": "Daily Chest Item"}]},
                              {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "GTA Sub Emote Chest"}, {"name": "Chest"}]}]),
             campaign(id="22222222-aaaa-bbbb-cccc-000000000002", name="Pokemon Evolutions",
                      groups=[{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": [{"name": "Pikachu Daily Badge"}]},
                              {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Pikachu Grand Prize"}, {"name": "Emote"}, {"name": "Badge"}]}])]
    C1, C2 = CAMPS[0]["id"], CAMPS[1]["id"]
    EARNED = "quests_viewer_reward_campaign_earned_emote"

    def test_which_types_mean_earned(self):
        for good in (self.EARNED, "quests_viewer_reward_campaign_earned_badge", "quest_reward_earned"):
            self.assertTrue(rw.is_earned_type(good), good)
        for bad in ("quests_viewer_reward_campaign_started", "user_drop_reward_reminder_notification", "quests_viewer_progress", "earned_but_not_a_q", None, 5, ""):
            self.assertFalse(rw.is_earned_type(bad), bad)

    def test_campaign_id_in_an_id_field_wins(self):
        self.assertEqual(rw.match_earned({"type": self.EARNED, "campaignID": self.C2, "body": "GTAVI Launch Celebration"}, self.CAMPS), self.C2)
        self.assertEqual(rw.match_earned({"type": self.EARNED, "campaign_id": self.C1.upper()}, self.CAMPS), self.C1)

    def test_campaign_id_inside_the_text(self):
        self.assertEqual(rw.match_earned({"type": self.EARNED, "body": f"quest {self.C2} done"}, self.CAMPS), self.C2)

    def test_the_notification_id_alone_is_not_a_campaign_id(self):
        self.assertIsNone(rw.match_earned({"type": self.EARNED, "id": self.C1}, self.CAMPS))

    def test_names_need_word_boundaries_length_and_a_non_generic_word(self):
        self.assertEqual(rw.match_earned({"type": self.EARNED, "body": "You earned the Pikachu Grand Prize!"}, self.CAMPS), self.C2)
        self.assertIsNone(rw.match_earned({"type": self.EARNED, "title": "gtavi launch celebration"}, self.CAMPS), "a campaign name is not a reward")
        self.assertIsNone(rw.match_earned({"type": self.EARNED, "body": "You earned a Pikachu Daily Badge"}, self.CAMPS), "a daily reward is not the final one")
        for generic in ("Badge", "You got an Emote", "A new Chest for you", "emote chest badge"):
            self.assertIsNone(rw.match_earned({"type": self.EARNED, "body": generic}, self.CAMPS), generic)
        self.assertIsNone(rw.match_earned({"type": self.EARNED, "body": "SuperPikachu Grand PrizeX"}, self.CAMPS), "no match inside a longer word")

    def test_a_name_shared_by_two_campaigns_is_not_a_match(self):
        final = [{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": []}, {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Shared Reward Name"}]}]
        twins = [campaign(id="a", name="One", groups=final), campaign(id="b", name="Two", groups=final)]
        self.assertIsNone(rw.match_earned({"type": self.EARNED, "body": "Shared Reward Name"}, twins))

    def test_no_match_and_odd_input(self):
        self.assertIsNone(rw.match_earned({"type": self.EARNED, "body": "something else"}, self.CAMPS))
        for odd in (None, 5, "x", [], {}):
            self.assertIsNone(rw.match_earned(odd, self.CAMPS))

    def test_logged_fields_are_an_allowlist_without_urls(self):
        got = rw.notification_fields({"id": "1", "type": "t", "body": "b" * 300, "title": "see https://x.test/a?token=SECRET", "name": "ok",
                                      "campaignId": "c", "accessToken": "SECRET", "auth_id": "SECRET2", "url": "https://x.test", "icon": "x", "n": 5,
                                      "link": "www.example.test/x", "text": "free text"})
        self.assertEqual(sorted(got), ["body", "campaignId", "id", "name", "type"])
        self.assertEqual(len(got["body"]), 120)
        self.assertNotIn("SECRET", json.dumps(got))
        self.assertNotIn("x.test", json.dumps(got))

    def test_game_entries_leave_out_reward_keys(self):
        self.assertEqual(rw.game_entries(["Rust", "reward:a", "Path of Exile 2", None]), ["Rust", "Path of Exile 2"])


class StatusTests(unittest.TestCase):
    def test_line(self):
        self.assertEqual(rw.status_line("ch", "Cat", "Camp", 23, 60), "[НАГРАДА] Смотрим ch (Cat) для «Camp»: 23/60 мин сегодня")


class SettingsHelperTests(unittest.TestCase):
    def test_invalid_lists_are_dropped_valid_ones_cleaned(self):
        data = {"hidden_reward_campaigns": [" a ", "a", "b"], "reward_campaign_categories": {"x": " Name ", "y": ""}}
        rc.drop_invalid_setting(data)
        self.assertEqual(data, {"hidden_reward_campaigns": ["a", "b"], "reward_campaign_categories": {"x": "Name"}})
        for key, bad in (("hidden_reward_campaigns", "a"), ("hidden_reward_campaigns", [1]), ("reward_campaign_categories", ["x"]),
                         ("reward_campaign_categories", {"a": 1})):
            data = {key: bad, "keep": 1}
            with self.assertLogs("TwitchDrops.RewardCampaigns", level="WARNING"):
                rc.drop_invalid_setting(data)
            self.assertEqual(data, {"keep": 1})

    def test_apply_setting_mirrors_the_lists_for_the_engine(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=False, reward_campaigns=[])
        rc.apply_setting(bridge, {"reward_campaigns_enabled": True, "hidden_reward_campaigns": ["a"], "reward_campaign_categories": {"b": "C"}})
        self.assertEqual((bridge.reward_hidden, bridge.reward_categories), (["a"], {"b": "C"}))
        rc.apply_setting(bridge, {})
        self.assertEqual((bridge.reward_hidden, bridge.reward_categories), ([], {}))

    def test_apply_setting_tells_the_engine(self):
        seen = []
        engine = SimpleNamespace(reward_settings_changed=lambda: seen.append(1))
        bridge = SimpleNamespace(reward_campaigns_enabled=True, reward_campaigns=[])
        rc.apply_setting(bridge, {"reward_campaigns_enabled": False}, engine)
        self.assertEqual(seen, [1])
        rc.apply_setting(bridge, {}, None)

    def test_state_list_carries_the_new_fields_and_hides_nothing(self):
        saved = rw.REWARD_WATCH
        with tempfile.TemporaryDirectory() as tmp:
            rw.REWARD_WATCH = rw.RewardWatch(Path(tmp))
            try:
                bridge = SimpleNamespace(reward_campaigns_enabled=True, reward_campaigns=[campaign(id="a"), campaign(id="b")])
                settings = {"reward_campaigns_enabled": True, "hidden_reward_campaigns": ["b"], "reward_campaign_categories": {"a": "Mine"}}
                got = rc.state_list(bridge, settings)
            finally:
                rw.REWARD_WATCH = saved
        self.assertEqual([c["id"] for c in got], ["a", "b"])
        self.assertEqual((got[0]["category"]["source"], got[0]["farmable"], got[1]["hidden"]), ("user", True, True))
        for key in ("groups", "sitewide", "category", "farmable", "watchedToday", "dailyGoal", "doneToday", "earned", "hidden"):
            self.assertIn(key, got[0])


class ForceProblemTests(TempDir):
    def problem(self, settings, campaigns, cid="a"):
        saved = rw.REWARD_WATCH
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        try:
            for camp in campaigns:
                rw.REWARD_WATCH.resolver.entries[camp["id"]] = {"sig": rw.CategoryResolver.signature(camp),
                                                                "category": {"name": "Cat", "slug": "cat", "source": "guess"}}
            bridge = SimpleNamespace(reward_campaigns=campaigns)
            return rc.force_problem(bridge, settings, cid)
        finally:
            rw.REWARD_WATCH = saved

    def test_a_farmable_visible_campaign_can_be_forced(self):
        self.assertIsNone(self.problem({"reward_campaigns_enabled": True}, [campaign(id="a")]))

    def test_refusals_say_why(self):
        on = {"reward_campaigns_enabled": True}
        self.assertIn("отключ", self.problem({}, [campaign(id="a")]))
        self.assertIn("нет в списке", self.problem(on, [campaign(id="b")]))
        self.assertIn("скрыта", self.problem({**on, "hidden_reward_campaigns": ["a"]}, [campaign(id="a")]))
        self.assertIn("нет времени просмотра", self.problem(on, [campaign(id="a", minutesGoal=None, groups=[{"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": []}])]))


class ParseGroupTests(unittest.TestCase):
    def test_live_shape_groups_and_sitewide(self):
        raw = {"id": "g", "name": "GTAVI Launch Celebration", "isSitewide": True, "game": None, "summary": GTA_SUMMARY, "unlockRequirements": None,
               "rewardGroups": [
                   {"id": "1", "unlockRequirements": {"subsGoal": 0, "minuteWatchedGoal": 60, "turboSubsGoal": 0, "eventTriggerGoal": 0},
                    "rewards": [{"id": "r", "name": "GTA DVD Chest", "thumbnailImage": {"image1xURL": "https://cdn.example.test/a.png"}, "earnableUntil": "2026-12-01T00:00:00Z"}]},
                   {"id": "2", "unlockRequirements": {"subsGoal": 1, "minuteWatchedGoal": 0}, "rewards": [{"id": "s", "name": "GTA Sub Emote Chest"}]},
                   {"id": "3", "unlockRequirements": {"eventTriggerGoal": 5}, "rewards": []},
                   "junk"]}
        got = rc.parse_reward_campaigns({"data": {"rewardCampaignsAvailableToUser": [raw]}}, now=NOW)[0]
        self.assertTrue(got["sitewide"])
        self.assertEqual([(g["goalKind"], g["minutes"], g["subs"], [r["name"] for r in g["rewards"]]) for g in got["groups"]],
                         [("watch", 60, 0, ["GTA DVD Chest"]), ("subs", 0, 1, ["GTA Sub Emote Chest"]), ("other", 0, 0, [])])
        self.assertEqual(got["groups"][0]["rewards"][0], {"name": "GTA DVD Chest", "image": "https://cdn.example.test/a.png", "earnableUntil": "2026-12-01T00:00:00Z"})

    def test_sitewide_must_be_exactly_true(self):
        for value in (1, "true", None):
            got = rc.parse_reward_campaigns({"data": {"rewardCampaignsAvailableToUser": [{"id": "g", "name": "n", "isSitewide": value}]}}, now=NOW)
            self.assertIs(got[0]["sitewide"], False)


# ---------------------------------------------------------------- engine glue, with fakes
import twitch  # noqa: E402  (after the plain modules so a failure there names the engine)
from gui_headless import STATE_BRIDGE  # noqa: E402
from utils import Game  # noqa: E402


class FakeChannel:
    def __init__(self, cid=1, name="streamer", game="Grand Theft Auto VI", online=True, viewers=10, sends=True):
        self.id, self.name, self.online, self.viewers, self.sends = cid, name, online, viewers, sends
        self.game = Game({"id": 7, "displayName": game}) if game else None

    async def send_watch(self):
        return self.sends


class FakeEngine:
    """Borrows the real engine methods, so what runs is the engine's own code."""
    _forced_drop_game = twitch.Twitch._forced_drop_game
    _choose_reward_target = twitch.Twitch._choose_reward_target
    _clear_forced_reward = twitch.Twitch._clear_forced_reward
    _set_reward_target = twitch.Twitch._set_reward_target
    reward_settings_changed = twitch.Twitch.reward_settings_changed
    _reward_tick = twitch.Twitch._reward_tick
    _reward_goal_reached = twitch.Twitch._reward_goal_reached
    _in_wanted = twitch.Twitch._in_wanted
    can_watch = twitch.Twitch.can_watch
    should_switch = twitch.Twitch.should_switch
    _note_reward_earned = twitch.Twitch._note_reward_earned
    stop_watching = twitch.Twitch.stop_watching
    _pick_reward_target = twitch.Twitch._pick_reward_target
    _clear_reward_watching = twitch.Twitch._clear_reward_watching
    _schedule_category_resolution = twitch.Twitch._schedule_category_resolution
    _resolve_categories = twitch.Twitch._resolve_categories
    _validate_category = twitch.Twitch._validate_category
    _reward_skip_for_a_while = twitch.Twitch._reward_skip_for_a_while
    _notify_daily_goal = twitch.Twitch._notify_daily_goal
    _run_auto_queue_hook = twitch.Twitch._run_auto_queue_hook
    _reward_stop_target = twitch.Twitch._reward_stop_target
    _reward_ineligible_reason = twitch.Twitch._reward_ineligible_reason
    _slot_budget_and_minutes = twitch.Twitch._slot_budget_and_minutes
    _log_slot_limit_once = twitch.Twitch._log_slot_limit_once
    _reward_current_view = twitch.Twitch._reward_current_view
    _reward_apply_progress = twitch.Twitch._reward_apply_progress
    _reward_note_claim = twitch.Twitch._reward_note_claim

    def __init__(self):
        self._reward_backoff = {}
        self._reward_slot_pick = False
        self._reward_link = rw.DropLink()
        self._slot_limit_logged_day = None
        self.forced_game = None
        self.reward_target = None
        self._reward_last_tick = None
        self._reward_logged_minutes = None
        self._reward_failed_beats = 0
        self._reward_last_success = None
        self._category_task = None
        self._state = twitch.State.IDLE
        self.answer = {"data": {"game": None}}
        self.wanted_games = []
        self.inventory = []
        self.streamer_cooldowns = {}
        self.game_cooldowns = {}
        self.settings = SimpleNamespace(ignored_channels=[], priority=["reward:a", "reward:b"])
        self.states = []
        self._active_mining_drop = None
        self.gui = SimpleNamespace(clear_drop=lambda: None, channels=SimpleNamespace(clear_watching=lambda: None),
                                   status=SimpleNamespace(update=lambda text: self.status_texts.append(text)))
        self.status_texts = []
        self.watching_channel = SimpleNamespace(clear=lambda: None, get_with_default=lambda d=None: None)

    def change_state(self, state):
        self.states.append(state)

    def is_channel_ignored(self, channel):
        return False

    async def gql_request(self, ops):
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


class EngineTests(TempDir):
    def setUp(self):
        super().setUp()
        self.saved = (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns,
                      STATE_BRIDGE.forced_game, getattr(STATE_BRIDGE, "reward_hidden", []), getattr(STATE_BRIDGE, "reward_categories", {}),
                      getattr(STATE_BRIDGE, "reward_daily_slot", True))
        rw.REWARD_WATCH = rw.RewardWatch(self.dir)
        import notifications
        muted = notifications.NOTIFIER
        notifications.NOTIFIER = notifications.ToastGate(lambda t, m: None, lambda: True, None)
        self.addCleanup(setattr, notifications, "NOTIFIER", muted)
        STATE_BRIDGE.reward_daily_slot = False  # these tests describe the order without the daily slot: drops first
        STATE_BRIDGE.reward_campaigns_enabled = True
        STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories = [], {}
        STATE_BRIDGE.forced_game = None
        STATE_BRIDGE.reward_campaigns = [campaign(id="a", name="A"), campaign(id="b", name="B")]
        self.addCleanup(self.restore)
        self.engine = FakeEngine()
        for camp in STATE_BRIDGE.reward_campaigns:
            rw.REWARD_WATCH.resolver.entries[camp["id"]] = {"sig": rw.CategoryResolver.signature(camp),
                                                            "category": {"name": "Grand Theft Auto VI", "slug": "gta6", "source": "guess"}}

    def restore(self):
        (rw.REWARD_WATCH, STATE_BRIDGE.reward_campaigns_enabled, STATE_BRIDGE.reward_campaigns, STATE_BRIDGE.forced_game,
         STATE_BRIDGE.reward_hidden, STATE_BRIDGE.reward_categories, STATE_BRIDGE.reward_daily_slot) = self.saved
        STATE_BRIDGE.reward_watching = None

    # selection
    def test_nothing_is_chosen_while_drops_are_wanted(self):
        self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Rust"], "the drops list is left alone")

    def test_queue_picks_in_order_when_nothing_else_to_farm(self):
        self.engine._choose_reward_target(None, ["Rust", "reward:b", "reward:a"])
        self.assertEqual(self.engine.reward_target["id"], "b")
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Grand Theft Auto VI"])
        self.assertEqual(STATE_BRIDGE.reward_watching["id"], "b")

    def test_forced_overrides_drops_and_isolates(self):
        self.engine.wanted_games = [Game({"id": 1, "displayName": "Rust"})]
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        self.engine._choose_reward_target("a", [])
        self.assertEqual(self.engine.reward_target["id"], "a")
        self.assertEqual([g.name for g in self.engine.wanted_games], ["Grand Theft Auto VI"])
        self.assertEqual(self.engine.forced_game, "reward:a", "stays forced")

    def test_forced_but_hidden_returns_to_auto(self):
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        STATE_BRIDGE.reward_hidden = ["a"]
        self.engine._choose_reward_target("a", [])
        self.assertIsNone(self.engine.reward_target)
        self.assertIsNone(self.engine.forced_game)
        self.assertIsNone(STATE_BRIDGE.forced_game)

    def test_hidden_queue_entries_are_never_chosen(self):
        STATE_BRIDGE.reward_hidden = ["a"]
        self.engine._choose_reward_target(None, ["reward:a", "reward:b"])
        self.assertEqual(self.engine.reward_target["id"], "b")

    def test_setting_off_chooses_nothing_and_drops_a_forced_reward(self):
        STATE_BRIDGE.reward_campaigns_enabled = False
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        self.engine._choose_reward_target("a", ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        self.assertIsNone(self.engine.forced_game)

    # the setting switched off or a campaign hidden while watching
    def test_turning_the_setting_off_stops_watching_at_once(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        stopped = []
        self.engine.stop_watching = lambda: stopped.append(1)
        STATE_BRIDGE.reward_campaigns_enabled = False
        self.engine.reward_settings_changed()
        self.assertEqual((self.engine.reward_target, self.engine.forced_game, STATE_BRIDGE.forced_game, stopped), (None, None, None, [1]))
        self.assertIsNone(STATE_BRIDGE.reward_watching)

    def test_hiding_the_watched_campaign_stops_it_but_not_another(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        stopped = []
        self.engine.stop_watching = lambda: stopped.append(1)
        STATE_BRIDGE.reward_hidden = ["b"]
        self.engine.reward_settings_changed()
        self.assertEqual((self.engine.reward_target["id"], stopped), ("a", []))
        STATE_BRIDGE.reward_hidden = ["a"]
        self.engine.reward_settings_changed()
        self.assertEqual((self.engine.reward_target, stopped), (None, [1]))

    def test_settings_change_without_reward_watching_does_nothing(self):
        stopped = []
        self.engine.stop_watching = lambda: stopped.append(1)
        self.engine.reward_settings_changed()
        self.assertEqual(stopped, [])

    # forced-name helper keeps the drops code away from reward keys
    def test_reward_keys_never_reach_the_drop_game_matching(self):
        self.engine.forced_game = "reward:a"
        self.assertIsNone(self.engine._forced_drop_game())
        self.engine.forced_game = "Rust"
        self.assertEqual(self.engine._forced_drop_game(), "Rust")
        self.engine.forced_game = None
        self.assertIsNone(self.engine._forced_drop_game())

    def test_can_watch_in_reward_mode_follows_the_category_not_drops(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.engine.forced_game = "reward:a"
        self.assertTrue(self.engine.can_watch(FakeChannel()))
        self.assertTrue(self.engine.can_watch(FakeChannel(game="grand theft auto vi")))
        self.assertFalse(self.engine.can_watch(FakeChannel(game="Grand Theft Auto V")), "version guard")
        self.assertFalse(self.engine.can_watch(FakeChannel(game="Just Chatting")))
        self.assertFalse(self.engine.can_watch(FakeChannel(game=None)))
        self.assertFalse(self.engine.can_watch(FakeChannel(online=False)))
        self.engine.streamer_cooldowns[1] = 2 ** 60
        self.assertFalse(self.engine.can_watch(FakeChannel()))

    def test_can_watch_outside_reward_mode_ignores_a_reward_forced_key(self):
        self.engine.forced_game = "reward:a"
        self.assertFalse(self.engine.can_watch(FakeChannel()), "no drops campaigns, nothing to earn")

    def test_in_wanted_by_category_name_in_reward_mode(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertTrue(self.engine._in_wanted(FakeChannel()))
        self.assertFalse(self.engine._in_wanted(FakeChannel(game="Rust")))
        self.engine.reward_target = None
        self.engine.wanted_games = [Game({"id": 7, "displayName": "Rust"})]
        self.assertTrue(self.engine._in_wanted(FakeChannel(game="Rust")))

    # watch ticks and the daily goal
    def tick(self, channel, at):
        saved = twitch.time
        twitch.time = lambda: at
        try:
            return run(self.engine._reward_tick(channel))
        finally:
            twitch.time = saved

    def test_ticks_count_real_time_and_the_first_tick_counts_nothing(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        channel = FakeChannel()
        self.assertFalse(self.tick(channel, 1000.0))
        self.assertEqual(rw.REWARD_WATCH.ledger.minutes_today("a"), 0)
        for step in range(1, 7):
            self.tick(channel, 1000.0 + 20 * step)
        self.assertEqual(rw.REWARD_WATCH.ledger.minutes_today("a"), 2)
        self.assertEqual(self.engine.status_texts[-1], "[НАГРАДА] Смотрим streamer (Grand Theft Auto VI) для «A»: 2/60 мин сегодня")

    def test_a_failed_send_and_a_long_gap_count_nothing(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.tick(FakeChannel(), 1000.0)
        self.tick(FakeChannel(sends=False), 1020.0)
        self.tick(FakeChannel(), 1040.0 + 600)  # the machine slept: the gap is not watch time
        self.assertEqual(rw.REWARD_WATCH.ledger.days, {}, "no time was credited")

    def test_the_daily_goal_stops_watching_and_returns_a_forced_run_to_auto(self):
        self.engine._choose_reward_target(None, [])
        self.engine.forced_game = STATE_BRIDGE.forced_game = "reward:a"
        self.engine._choose_reward_target("a", [])
        stopped = []
        self.engine.stop_watching = lambda: stopped.append(1)
        rw.REWARD_WATCH.ledger.add_seconds("a", 59 * 60 + 50)
        self.tick(FakeChannel(), 5000.0)
        done = self.tick(FakeChannel(), 5020.0)
        self.assertTrue(done)
        self.assertEqual((self.engine.reward_target, self.engine.forced_game, STATE_BRIDGE.forced_game, stopped), (None, None, None, [1]))
        self.assertIn(twitch.State.GAMES_UPDATE, self.engine.states)

    def test_the_queue_does_not_pick_a_done_campaign_until_tomorrow(self):
        rw.REWARD_WATCH.ledger.add_seconds("a", 3600)
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNone(self.engine.reward_target)
        later = datetime.now(timezone.utc) + timedelta(days=1)
        viewed_tomorrow = rw.REWARD_WATCH.view(STATE_BRIDGE.reward_campaigns, [], {}, later)
        self.assertEqual(rw.choose(viewed_tomorrow, forced_id=None, priority=["reward:a"], drops_available=False, now=later)[0]["id"], "a")

    # earned notifications
    def test_an_earned_notification_marks_the_campaign_until_its_end_and_logs_only_allowed_fields(self):
        STATE_BRIDGE.reward_campaigns[0]["groups"] = [{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": []},
                                                      {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Unique Pikachu Chest"}]}]
        STATE_BRIDGE.reward_campaigns[0]["endsAt"] = "2026-12-01T00:00:00Z"
        with self.assertLogs("TwitchDrops", level="INFO") as logs:
            self.engine._note_reward_earned({"type": "quests_viewer_reward_campaign_earned_emote", "id": "n1", "body": "You got Unique Pikachu Chest",
                                             "token": "SECRET", "url": "https://x.test/SECRET"})
        text = "\n".join(logs.output)
        self.assertNotIn("SECRET", text)
        self.assertIn("body", text)
        ledger = rw.REWARD_WATCH.ledger
        self.assertTrue(ledger.is_earned("a", datetime(2026, 11, 30, tzinfo=timezone.utc)))
        self.assertFalse(ledger.is_earned("a", datetime(2026, 12, 2, tzinfo=timezone.utc)))
        self.assertFalse(ledger.is_earned("b"))

    def test_an_unmatched_notification_only_logs(self):
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned({"type": "quests_viewer_reward_campaign_earned_emote", "id": "n1", "body": "nothing known"})
        self.assertFalse(rw.REWARD_WATCH.ledger.earned)

    def test_a_quest_notification_that_is_not_earned_only_logs(self):
        STATE_BRIDGE.reward_campaigns[0]["groups"] = [{"goalKind": "watch", "minutes": 60, "subs": 0, "rewards": []},
                                                      {"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": [{"name": "Unique Pikachu Chest"}]}]
        with self.assertLogs("TwitchDrops", level="INFO"):
            self.engine._note_reward_earned({"type": "quests_viewer_reward_campaign_started", "campaignId": "a", "body": "Unique Pikachu Chest"})
        self.assertFalse(rw.REWARD_WATCH.ledger.earned)

    # failed beats, stall, same-target reselection, tick edges
    def test_three_failed_beats_cool_the_channel_down_and_switch(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        stopped = []
        self.engine.stop_watching = lambda: stopped.append(1)
        bad = FakeChannel(cid=5, sends=False)
        self.tick(bad, 1000.0)
        self.tick(bad, 1020.0)
        self.assertEqual((stopped, self.engine.states), ([], []))
        self.tick(bad, 1040.0)
        self.assertEqual(stopped, [1])
        self.assertIn(twitch.State.CHANNEL_SWITCH, self.engine.states)
        self.assertGreater(self.engine.streamer_cooldowns[5], 1040.0 + 800)
        self.assertEqual(self.engine._reward_failed_beats, 0)

    def test_a_good_beat_resets_the_failure_count(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.tick(FakeChannel(sends=False), 1000.0)
        self.tick(FakeChannel(sends=False), 1020.0)
        self.tick(FakeChannel(), 1040.0)
        self.tick(FakeChannel(sends=False), 1060.0)
        self.tick(FakeChannel(sends=False), 1080.0)
        self.assertNotIn(twitch.State.CHANNEL_SWITCH, self.engine.states)

    def test_no_good_beat_for_fifteen_minutes_drops_the_reward_target(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        stopped = []
        self.engine.stop_watching = lambda: stopped.append(1)
        self.engine._reward_last_success = 1000.0
        self.tick(FakeChannel(sends=False), 1000.0 + 901)
        self.assertEqual((self.engine.reward_target, stopped), (None, [1]))
        self.assertIn(twitch.State.GAMES_UPDATE, self.engine.states)
        self.assertIsNone(STATE_BRIDGE.reward_watching)

    def test_the_same_pick_keeps_the_tick_bookkeeping(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.tick(FakeChannel(), 1000.0)
        self.engine._reward_logged_minutes = 7
        first_started = self.engine._reward_last_success
        self.engine.wanted_games = []  # the engine rebuilds the drops list before every choice
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertEqual((self.engine._reward_last_tick, self.engine._reward_logged_minutes, self.engine._reward_last_success), (1000.0, 7, first_started))
        self.engine.wanted_games = []
        self.engine._choose_reward_target(None, ["reward:b"])
        self.assertEqual((self.engine._reward_last_tick, self.engine._reward_logged_minutes), (None, None))

    def test_a_beat_that_finishes_after_the_target_changed_counts_nothing(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        engine = self.engine

        class Switching(FakeChannel):
            async def send_watch(self):
                engine.reward_target = None
                return True

        self.tick(FakeChannel(), 1000.0)
        self.assertFalse(self.tick(Switching(), 1020.0))
        self.assertEqual(rw.REWARD_WATCH.ledger.days, {})
        self.assertEqual(self.engine._reward_last_tick, 1000.0)

    def test_the_last_tick_moves_only_on_a_good_beat(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.tick(FakeChannel(), 1000.0)
        self.tick(FakeChannel(sends=False), 1020.0)
        self.assertEqual(self.engine._reward_last_tick, 1000.0)

    def test_a_picker_error_is_logged_and_means_no_reward(self):
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNotNone(self.engine.reward_target)
        saved = rw.choose
        rw.choose = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        try:
            with self.assertLogs("TwitchDrops", level="ERROR") as logs:
                self.engine._choose_reward_target(None, ["reward:a"])
        finally:
            rw.choose = saved
        self.assertIsNone(self.engine.reward_target)
        self.assertTrue(logs.records[0].exc_info)

    def test_shutdown_and_pause_clear_what_the_page_sees(self):
        import inspect
        self.engine._choose_reward_target(None, ["reward:a"])
        self.assertIsNotNone(STATE_BRIDGE.reward_watching)
        self.engine._clear_reward_watching()
        self.assertIsNone(STATE_BRIDGE.reward_watching)
        self.assertIsNone(self.engine._reward_last_tick)
        self.assertIn("_clear_reward_watching", inspect.getsource(twitch.Twitch.shutdown))
        self.assertIn("_clear_reward_watching", inspect.getsource(twitch.Twitch._watch_loop))

    def test_the_queue_message_counts_games_only(self):
        import inspect
        self.assertIn("reward_watch.game_entries(priority)", inspect.getsource(twitch.Twitch._run))

    # category lookup: validated strictly, resolved in the background
    def test_validation_distinguishes_no_such_game_from_a_bad_answer(self):
        self.engine.answer = {"data": {"game": {"slug": "grand-theft-auto-vi", "displayName": "Grand Theft Auto VI"}}}
        self.assertEqual(run(self.engine._validate_category("x")), {"name": "Grand Theft Auto VI", "slug": "grand-theft-auto-vi"})
        self.engine.answer = {"data": {"game": None}}
        self.assertIsNone(run(self.engine._validate_category("x")), "a clean answer: there is no such game")
        for bad in ({}, {"data": None}, {"data": {}}, {"errors": [{"message": "x"}], "data": {"game": None}}, {"data": {"game": {}}},
                    {"data": {"game": "text"}}, "oops", None, RuntimeError("net")):
            self.engine.answer = bad
            with self.subTest(bad=bad), self.assertRaises(Exception):
                run(self.engine._validate_category("x"))

    def test_resolution_runs_in_the_background_one_at_a_time(self):
        gate = {}

        async def scenario():
            started = asyncio.Event()
            release = asyncio.Event()

            async def slow(name):
                started.set()
                await release.wait()
                return {"name": name, "slug": "s"}
            self.engine._validate_category = slow
            STATE_BRIDGE.reward_campaigns = [campaign(id="z", name="Nothing", summary="watching Zed Game streamers")]
            self.engine._schedule_category_resolution()
            first = self.engine._category_task
            self.engine._schedule_category_resolution()
            gate["same_task"] = self.engine._category_task is first
            await asyncio.wait_for(started.wait(), 2)
            gate["scheduling_returned_before_the_lookup_finished"] = not first.done()
            release.set()
            await first
            gate["found"] = rw.REWARD_WATCH.resolver.cached(STATE_BRIDGE.reward_campaigns[0])
            gate["woke"] = list(self.engine.states)
        run(scenario())
        self.assertTrue(gate["same_task"] and gate["scheduling_returned_before_the_lookup_finished"])
        self.assertEqual(gate["found"]["name"], "Zed Game")
        self.assertIn(twitch.State.GAMES_UPDATE, gate["woke"], "an idle engine re-evaluates when a category turns up")

    def test_the_budget_stops_a_stuck_cycle_and_nothing_is_raised(self):
        async def scenario():
            async def stuck(name):
                await asyncio.sleep(60)
            self.engine._validate_category = stuck
            STATE_BRIDGE.reward_campaigns = [campaign(id="z", name="Nothing", summary="watching Zed Game streamers")]
            saved = twitch.CATEGORY_CYCLE_BUDGET, twitch.CATEGORY_LOOKUP_TIMEOUT
            twitch.CATEGORY_CYCLE_BUDGET, twitch.CATEGORY_LOOKUP_TIMEOUT = 0.1, 5.0
            try:
                with self.assertLogs("TwitchDrops", level="WARNING"):
                    await self.engine._resolve_categories()
            finally:
                twitch.CATEGORY_CYCLE_BUDGET, twitch.CATEGORY_LOOKUP_TIMEOUT = saved
        run(scenario())

    def test_nothing_is_scheduled_while_the_setting_is_off(self):
        STATE_BRIDGE.reward_campaigns_enabled = False
        self.engine._schedule_category_resolution()
        self.assertIsNone(self.engine._category_task)


class PriorityConsumersTests(unittest.TestCase):
    def test_queue_entries_with_reward_keys_do_not_break_the_matchers(self):
        from utils import smart_game_match
        self.assertFalse(smart_game_match("Rust", "reward:abc"))
        self.assertFalse(smart_game_match("Grand Theft Auto VI", "reward:abc-def"))
        from auto_shutdown import priority_drops_done
        self.assertFalse(priority_drops_done([], ["reward:abc"]))

    def test_auto_shutdown_waits_for_queued_rewards_that_can_still_be_farmed(self):
        from auto_shutdown import priority_drops_done
        drop = SimpleNamespace(is_claimed=True, campaign=SimpleNamespace(game=SimpleNamespace(name="Rust")))
        inventory = [SimpleNamespace(timed_drops={"d": drop})]
        self.assertTrue(priority_drops_done(inventory, ["Rust"]))
        self.assertFalse(priority_drops_done(inventory, ["Rust"], rewards_pending=True))

    def test_queue_pending_means_queued_farmable_and_not_done_today(self):
        saved = rw.REWARD_WATCH
        with tempfile.TemporaryDirectory() as tmp:
            rw.REWARD_WATCH = rw.RewardWatch(Path(tmp))
            try:
                camps = [campaign(id="a", game="G"), campaign(id="b", game="G"), campaign(id="s", game="G", minutesGoal=None, groups=[{"goalKind": "subs", "minutes": 0, "subs": 1, "rewards": []}])]
                bridge = SimpleNamespace(reward_campaigns=camps)
                on = {"reward_campaigns_enabled": True}
                self.assertTrue(rc.queue_pending(bridge, {**on, "priority_games": ["Rust", "reward:a"]}))
                self.assertFalse(rc.queue_pending(bridge, {**on, "priority_games": ["Rust"]}), "not queued")
                self.assertFalse(rc.queue_pending(bridge, {**on, "priority_games": ["reward:s"]}), "subs-only is not farmable")
                self.assertFalse(rc.queue_pending(bridge, {"priority_games": ["reward:a"]}), "setting off")
                self.assertFalse(rc.queue_pending(bridge, {**on, "priority_games": ["reward:a"], "hidden_reward_campaigns": ["a"]}))
                rw.REWARD_WATCH.ledger.add_seconds("a", 3600)
                self.assertFalse(rc.queue_pending(bridge, {**on, "priority_games": ["reward:a"]}), "done today")
                self.assertTrue(rc.queue_pending(bridge, {**on, "priority_games": ["reward:a", "reward:b"]}))
            finally:
                rw.REWARD_WATCH = saved

    def test_the_shelf_and_cover_lists_skip_reward_entries(self):
        import cover_keeper
        names = cover_keeper.shelf_names({"priority_games": ["Rust", "reward:abc"], "excluded_games": [], "user_linked_games": []}, [], [])
        self.assertEqual(names, ["Rust"])
        self.assertEqual([t["name"] for t in cover_keeper.cover_targets([], ["Rust", "reward:abc"])], ["Rust"])


if __name__ == "__main__":
    unittest.main()
