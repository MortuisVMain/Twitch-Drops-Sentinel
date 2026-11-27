"""Offline checks for the cumulative Steam IDLE statistics: accrual rules, persistence, hooks and the two routes."""
import asyncio
import datetime
import json
import tempfile
import unittest
from pathlib import Path

from local_access import token_allowed
from steam_idle.achievement_queue import AchievementQueue, GamePlan
from steam_idle.farm import CardFarm, FarmRules
from steam_idle.routes import SteamIdleRoutes
from steam_idle.stats import STATS_FILE_NAME, StatsRecorder
from steam_idle.test_achievement_queue import Env as QueueEnv, missing, outcome
from steam_idle.test_batch import BatchHarness, gp
from steam_idle.test_controller import ACCOUNT, Env as ControllerEnv, gd
from steam_idle.test_farm import Harness
from steam_idle.test_routes import FakeRequest, StubController, reply

DAY1 = datetime.datetime(2026, 11, 25, 12, 0).timestamp()


class Clocks:
    def __init__(self):
        self.mono, self.wall = 100.0, DAY1

    def advance(self, seconds):
        self.mono += seconds
        self.wall += seconds


class RecorderCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / STATS_FILE_NAME
        self.clocks = Clocks()
        self.rec = self.make()

    def make(self, path="default"):
        return StatsRecorder(self.path if path == "default" else path, lambda: self.clocks.mono, lambda: self.clocks.wall)

    def stored(self):
        return json.loads(self.path.read_text(encoding="utf-8"))

    def games(self, rec=None, account=1, period="all"):
        return {g["appId"]: g for g in (rec or self.rec).report(account, period)["games"]}


class AccrualTests(RecorderCase):
    def test_time_between_two_ticks_goes_to_the_held_game(self):
        self.rec.tick(1, {10: "Ten"})
        self.clocks.advance(60)
        self.rec.tick(1, {10: "Ten"})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 60)
        self.assertEqual(self.games()[10]["name"], "Ten")

    def test_a_game_only_just_held_earns_nothing_yet(self):
        self.rec.tick(1, {})
        self.clocks.advance(30)
        self.rec.tick(1, {10: "Ten"})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 0)

    def test_a_gap_over_five_minutes_is_not_counted(self):
        self.rec.tick(1, {10: "Ten"})
        self.clocks.advance(301)  # the computer slept
        self.rec.tick(1, {10: "Ten"})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 0)
        self.clocks.advance(60)  # counting resumes from the late tick
        self.rec.tick(1, {10: "Ten"})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 60)

    def test_a_gap_of_exactly_five_minutes_still_counts(self):
        self.rec.tick(1, {10: "Ten"})
        self.clocks.advance(300)
        self.rec.tick(1, {10: "Ten"})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 300)

    def test_every_game_held_at_once_accrues_on_its_own(self):
        held = {10: "Ten", 20: "Twenty", 30: "Thirty"}
        self.rec.tick(1, held)
        self.clocks.advance(60)
        self.rec.tick(1, held)
        self.assertEqual({app: g["farmSeconds"] for app, g in self.games().items()}, {10: 60, 20: 60, 30: 60})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 60, "the tile counts wall-clock time once")

    def test_three_games_held_for_an_hour_add_an_hour_to_the_day_and_to_each_game(self):
        held = {10: "Ten", 20: "Twenty", 30: "Thirty"}
        self.rec.tick(1, held)
        for _ in range(12):
            self.clocks.advance(300)
            self.rec.tick(1, held)
        self.assertEqual(self.rec.days(1)["2026-11-25"]["farmSeconds"], 3600)
        self.assertEqual({app: g["farmSeconds"] for app, g in self.games().items()}, {10: 3600, 20: 3600, 30: 3600})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 3600)
        self.assertEqual(self.rec.report(1, "7")["totals"]["farmSeconds"], 3600)
        self.assertEqual(sum(w["farmSeconds"] for w in self.rec.report(1, "all")["weeks"]), 3600)

    def test_restarting_the_clock_never_credits_the_gap(self):
        self.rec.tick(1, {10: "Ten"})
        self.clocks.advance(10)
        self.rec.restart_clock()
        self.clocks.advance(10)
        self.rec.tick(1, {10: "Ten"})
        self.assertEqual(self.rec.report(1, "all")["totals"]["farmSeconds"], 0)

    def test_a_released_game_keeps_earning_until_the_tick_that_saw_it_gone(self):
        self.rec.tick(1, {10: "Ten", 20: "Twenty"})
        self.clocks.advance(40)
        self.rec.tick(1, {10: "Ten"})  # 20 was released within these 40 s
        self.clocks.advance(20)
        self.rec.tick(1, {10: "Ten"})
        games = self.games()
        self.assertEqual((games[10]["farmSeconds"], games[20]["farmSeconds"]), (60, 40))

    def test_time_lands_on_the_local_day_of_the_accrual(self):
        self.clocks.wall = datetime.datetime(2026, 11, 26, 0, 0).timestamp() - 30
        self.rec.tick(1, {10: "Ten"})
        self.clocks.advance(30)
        self.rec.tick(1, {10: "Ten"})  # credited at 00:00 of the 26th
        self.clocks.advance(30)
        self.rec.tick(1, {10: "Ten"})
        days = self.rec.days(1)
        self.assertEqual(days["2026-11-26"]["farmSeconds"], 60)
        self.assertNotIn("2026-11-25", days)


class CountsAndPersistenceTests(RecorderCase):
    def test_cards_and_achievements_add_up_per_game_and_per_day(self):
        self.rec.add_cards(1, 10, "Ten", 2)
        self.rec.add_cards(1, 10, "Ten", 1)
        self.rec.add_achievements(1, 10, "Ten", 4)
        self.rec.add_achievements(1, 20, "Twenty", 1)
        totals = self.rec.report(1, "all")["totals"]
        self.assertEqual((totals["cards"], totals["achievements"], totals["games"]), (3, 5, 2))
        self.assertEqual(self.rec.days(1)["2026-11-25"], {"farmSeconds": 0, "cards": 3, "achievements": 5})
        self.assertEqual(self.games()[10]["cardsDropped"], 3)

    def test_zero_or_negative_counts_change_nothing(self):
        self.rec.add_cards(1, 10, "Ten", 0)
        self.rec.add_achievements(1, 10, "Ten", -2)
        self.assertEqual(self.rec.report(1, "all")["games"], [])

    def test_first_and_last_seen_follow_the_wall_clock(self):
        self.rec.add_cards(1, 10, "Ten", 1)
        first = self.clocks.wall
        self.clocks.advance(3600)
        self.rec.add_cards(1, 10, "Ten", 1)
        game = self.games()[10]
        self.assertEqual((game["firstAt"], game["lastAt"]), (int(first), int(self.clocks.wall)))

    def test_a_stop_flushes_at_once_and_a_restart_reads_it_back(self):
        self.rec.tick(1, {10: "Ten"})
        self.clocks.advance(20)
        self.rec.tick(1, {10: "Ten"})
        self.assertFalse(self.path.exists(), "the first flush is not yet due")
        self.clocks.advance(5)
        self.rec.tick(1, {})  # released: flushed now
        again = self.make()
        self.assertEqual(again.report(1, "all")["totals"]["farmSeconds"], 25)
        self.assertEqual(self.games(again)[10]["name"], "Ten")

    def test_flushes_come_at_most_once_a_minute(self):
        self.rec.add_cards(1, 10, "Ten", 1)
        self.rec.flush()
        self.assertFalse(self.path.exists(), "a minute has not passed since the recorder started")
        self.clocks.advance(60)
        self.rec.flush()
        self.rec.add_cards(1, 10, "Ten", 5)
        self.clocks.advance(59)
        self.rec.flush()
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 1)
        self.clocks.advance(2)
        self.rec.flush()
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 6)

    def test_a_forced_flush_ignores_the_minute(self):
        self.rec.add_cards(1, 10, "Ten", 1)
        self.rec.flush()
        self.rec.add_cards(1, 10, "Ten", 1)
        self.rec.flush(force=True)
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 2)

    def test_accounts_never_mix_and_the_file_holds_no_account_id(self):
        self.rec.add_cards(ACCOUNT, 10, "Ten", 2)
        self.rec.add_cards(7, 10, "Ten", 5)
        self.rec.flush(force=True)
        self.assertEqual(self.rec.report(ACCOUNT, "all")["totals"]["cards"], 2)
        self.assertEqual(self.rec.report(7, "all")["totals"]["cards"], 5)
        self.assertEqual(self.rec.report(8, "all")["totals"]["cards"], 0)
        self.assertNotIn(str(ACCOUNT), self.path.read_text(encoding="utf-8"))

    def test_without_a_path_nothing_is_written_but_counting_works(self):
        rec = self.make(None)
        rec.add_cards(1, 10, "Ten", 2)
        rec.flush(force=True)
        self.assertEqual(rec.report(1, "all")["totals"]["cards"], 2)
        self.assertFalse(self.path.exists())

    def test_days_older_than_a_year_are_pruned_but_the_game_totals_stay(self):
        self.clocks.wall = DAY1 - 400 * 86400
        self.rec.add_cards(1, 10, "Ten", 3)
        old_day = datetime.datetime.fromtimestamp(self.clocks.wall).strftime("%Y-%m-%d")
        self.clocks.wall = DAY1 - 364 * 86400
        self.rec.add_cards(1, 10, "Ten", 1)
        recent_day = datetime.datetime.fromtimestamp(self.clocks.wall).strftime("%Y-%m-%d")
        self.clocks.wall = DAY1
        self.rec.flush(force=True)
        days = self.make().days(1)
        self.assertNotIn(old_day, days)
        self.assertIn(recent_day, days)
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 4)

    def bad_copies(self):
        return sorted(p for p in self.path.parent.iterdir() if ".bad-" in p.name)

    def test_a_corrupt_file_is_logged_kept_as_bad_and_counting_starts_empty(self):
        self.path.write_text("{not json", encoding="utf-8")
        with self.assertLogs("steam_idle.stats", level="WARNING"):
            rec = self.make()
        self.assertEqual(rec.report(1, "all")["totals"]["cards"], 0)
        self.assertEqual([p.read_text(encoding="utf-8") for p in self.bad_copies()], ["{not json"])
        rec.add_cards(1, 10, "Ten", 1)
        rec.flush(force=True)
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 1)

    def test_a_file_of_the_wrong_shape_is_treated_like_a_corrupt_one(self):
        self.path.write_text(json.dumps({"version": 1, "accounts": [1, 2]}), encoding="utf-8")
        with self.assertLogs("steam_idle.stats", level="WARNING"):
            rec = self.make()
        self.assertEqual(rec.report(1, "all")["games"], [])
        self.assertEqual(len(self.bad_copies()), 1)

    def test_a_second_corrupt_file_never_overwrites_the_first_backup(self):
        for text in ("{first", "{second"):
            self.path.write_text(text, encoding="utf-8")
            with self.assertLogs("steam_idle.stats", level="WARNING"):
                self.make()
        self.assertEqual(sorted(p.read_text(encoding="utf-8") for p in self.bad_copies()), ["{first", "{second"])

    def test_one_malformed_game_or_day_is_dropped_and_the_rest_is_kept(self):
        self.rec.add_cards(1, 10, "Ten", 2)
        self.rec.add_cards(1, 20, "Twenty", 3)
        self.rec.add_cards(2, 30, "Thirty", 4)
        self.rec.flush(force=True)
        data = self.stored()
        first, second = list(data["accounts"].values())
        first["games"]["10"]["cardsDropped"] = "many"
        first["games"]["x"] = {"name": "Bad key"}
        first["days"]["not-a-date"] = {"farmSeconds": 1, "cards": 1, "achievements": 1}
        second["days"]["2026-11-25"] = "broken"
        self.path.write_text(json.dumps(data), encoding="utf-8")
        with self.assertLogs("steam_idle.stats", level="WARNING") as logged:
            again = self.make()
        self.assertGreaterEqual(len(logged.records), 4, "each dropped entry is logged")
        self.assertEqual(sorted(self.games(again)), [20])
        self.assertEqual(self.games(again)[20]["cardsDropped"], 3)
        self.assertEqual(again.report(2, "all")["totals"]["cards"], 4)
        self.assertEqual(self.bad_copies(), [], "a salvaged file is not a corrupt one")

    def test_a_missing_name_is_stored_as_the_app_id_text_and_a_real_one_replaces_it(self):
        self.rec.add_cards(1, 10, None, 1)
        self.assertEqual(self.games()[10]["name"], "10")
        self.rec.add_cards(1, 10, "Ten", 1)
        self.assertEqual(self.games()[10]["name"], "Ten")
        self.rec.add_cards(1, 10, "", 1)
        self.assertEqual(self.games()[10]["name"], "Ten", "an empty name never overwrites a real one")

    def test_a_stored_null_name_loads_as_the_app_id_text(self):
        self.rec.add_cards(1, 10, "Ten", 1)
        self.rec.flush(force=True)
        data = self.stored()
        next(iter(data["accounts"].values()))["games"]["10"]["name"] = None
        self.path.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.games(self.make())[10]["name"], "10")

    def test_the_slow_write_does_not_hold_the_lock(self):
        import threading
        from unittest import mock
        self.rec.add_cards(1, 10, "Ten", 1)
        got = []

        def slow_write(path, data):
            def other():
                got.append(self.rec._lock.acquire(timeout=2))
                if got[-1]:
                    self.rec._lock.release()
            worker = threading.Thread(target=other)
            worker.start()
            worker.join()

        with mock.patch("steam_idle.stats.atomic_write_json", slow_write):
            self.rec.flush(force=True)
        self.assertEqual(got, [True])

    def test_a_failed_write_is_retried_at_the_next_flush(self):
        from unittest import mock
        self.rec.add_cards(1, 10, "Ten", 1)
        with mock.patch("steam_idle.stats.atomic_write_json", side_effect=OSError("disk full")):
            with self.assertLogs("steam_idle.stats", level="ERROR"):
                self.rec.flush(force=True)
        self.rec.flush(force=True)
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 1)

    def test_reset_clears_only_the_given_account(self):
        self.rec.add_cards(1, 10, "Ten", 2)
        self.rec.add_cards(2, 10, "Ten", 3)
        self.rec.reset(1)
        self.assertEqual(self.rec.report(1, "all")["totals"], {"farmSeconds": 0, "games": 0, "cards": 0, "achievements": 0})
        self.assertEqual(self.rec.report(2, "all")["totals"]["cards"], 3)
        self.assertEqual(self.make().report(2, "all")["totals"]["cards"], 3, "the reset is written at once")
        self.assertEqual(self.make().report(1, "all")["totals"]["cards"], 0)


class ReportTests(RecorderCase):
    def fill(self):
        """Today: 100 s + 1 card on game 10; 10 days ago: 200 s + 2 cards on game 20; 40 days ago: 280 s on game 30."""
        for ago, app, seconds, cards in ((40, 30, 280, 0), (10, 20, 200, 2), (0, 10, 100, 1)):
            self.clocks.wall = DAY1 - ago * 86400
            self.clocks.mono += 1000
            self.rec.tick(1, {app: f"G{app}"})
            self.clocks.advance(seconds)
            self.rec.tick(1, {app: f"G{app}"})
            self.rec.tick(1, {})
            self.rec.add_cards(1, app, f"G{app}", cards)
        self.clocks.wall = DAY1

    def test_totals_follow_the_period(self):
        self.fill()
        totals = {p: self.rec.report(1, p)["totals"] for p in ("7", "30", "all")}
        self.assertEqual(totals["7"], {"farmSeconds": 100, "games": 1, "cards": 1, "achievements": 0})
        self.assertEqual(totals["30"], {"farmSeconds": 300, "games": 2, "cards": 3, "achievements": 0})
        self.assertEqual(totals["all"], {"farmSeconds": 580, "games": 3, "cards": 3, "achievements": 0})

    def test_the_game_list_holds_the_games_active_in_the_period(self):
        self.fill()
        self.assertEqual(sorted(self.games(period="7")), [10])
        self.assertEqual(sorted(self.games(period="30")), [10, 20])
        self.assertEqual(sorted(self.games(period="all")), [10, 20, 30])

    def test_the_rows_add_up_to_the_tiles_for_the_week_and_the_month(self):
        self.fill()
        self.rec.add_achievements(1, 20, "G20", 4)  # today, on a game that also has older activity
        self.rec.add_cards(1, 20, "G20", 5)
        for period in ("7", "30"):
            report = self.rec.report(1, period)
            rows, totals = report["games"], report["totals"]
            self.assertEqual(sum(g["farmSeconds"] for g in rows), totals["farmSeconds"], period)
            self.assertEqual(sum(g["cardsDropped"] for g in rows), totals["cards"], period)
            self.assertEqual(sum(g["achievements"] for g in rows), totals["achievements"], period)
            self.assertEqual(len(rows), totals["games"], period)
        week = {g["appId"]: g for g in self.rec.report(1, "7")["games"]}
        self.assertEqual((week[20]["cardsDropped"], week[20]["achievements"], week[20]["farmSeconds"]), (5, 4, 0), "only this week's part of game 20")
        month = {g["appId"]: g for g in self.rec.report(1, "30")["games"]}
        self.assertEqual((month[20]["cardsDropped"], month[20]["farmSeconds"]), (7, 200))
        life = {g["appId"]: g for g in self.rec.report(1, "all")["games"]}
        self.assertEqual((life[20]["cardsDropped"], life[20]["farmSeconds"]), (7, 200), "all time uses the lifetime totals")

    def test_per_game_days_are_pruned_like_the_day_totals_and_survive_a_restart(self):
        self.clocks.wall = DAY1 - 400 * 86400
        self.rec.add_cards(1, 10, "Ten", 3)
        self.clocks.wall = DAY1
        self.rec.add_cards(1, 10, "Ten", 1)
        self.rec.flush(force=True)
        again = self.make()
        self.assertEqual(again.report(1, "30")["games"][0]["cardsDropped"], 1)
        self.assertEqual(again.report(1, "all")["games"][0]["cardsDropped"], 4)
        stored = next(iter(self.stored()["accounts"].values()))
        self.assertEqual(len(stored["gameDays"]), 1)

    def test_a_game_entry_has_exactly_the_documented_fields(self):
        self.fill()
        self.assertEqual(set(self.games()[10]), {"appId", "name", "farmSeconds", "cardsDropped", "achievements", "firstAt", "lastAt"})

    def test_twelve_weekly_buckets_oldest_first_starting_on_mondays(self):
        self.fill()
        weeks = self.rec.report(1, "all")["weeks"]
        self.assertEqual(len(weeks), 12)
        starts = [datetime.date.fromisoformat(w["weekStart"]) for w in weeks]
        self.assertTrue(all(s.weekday() == 0 for s in starts))
        self.assertEqual([(b - a).days for a, b in zip(starts, starts[1:])], [7] * 11)
        today = datetime.date(2026, 11, 25)
        self.assertEqual(starts[-1], today - datetime.timedelta(days=today.weekday()))
        self.assertEqual(weeks[-1]["farmSeconds"], 100)
        self.assertEqual(sum(w["farmSeconds"] for w in weeks), 580)  # 40 days ago is still inside 12 weeks
        self.assertEqual(set(weeks[0]), {"weekStart", "farmSeconds", "cards", "achievements"})

    def test_the_weeks_do_not_depend_on_the_period(self):
        self.fill()
        self.assertEqual(self.rec.report(1, "7")["weeks"], self.rec.report(1, "all")["weeks"])

    def test_an_empty_account_reports_zeros(self):
        report = self.rec.report(1, "all")
        self.assertEqual(report["totals"], {"farmSeconds": 0, "games": 0, "cards": 0, "achievements": 0})
        self.assertEqual((report["games"], len(report["weeks"])), ([], 12))


class CardCountingTests(unittest.TestCase):
    """Only a decrease seen between two successful reads of the same game is a card for the statistics."""

    def hook(self):
        self.seen = []
        return lambda game, count: self.seen.append((game.app_id, count))

    def test_a_confirmed_decrease_is_reported_per_game(self):
        h = Harness([[gd(10, 3)], [gd(10, 1)], [gd(10, 1)]])
        h.farm = CardFarm(FarmRules(recheck_seconds=600), h.read, h.make, lambda: h.now, on_game_drops=self.hook())
        h.begin()
        h.tick(600)
        self.assertEqual(self.seen, [(10, 2)])

    def test_a_game_missing_from_the_reread_is_not_counted_for_the_statistics(self):
        h = Harness([[gd(10, 1), gd(20, 2)], [gd(20, 2)], [gd(20, 2)]])
        counted = []
        h.farm = CardFarm(FarmRules(recheck_seconds=600), h.read, h.make, lambda: h.now, on_drops=counted.append,
                          on_game_drops=self.hook())
        h.begin()
        h.tick(600)
        self.assertEqual(self.seen, [])
        self.assertEqual(counted, [1], "the daily counter keeps its old behaviour")

    def test_a_finished_game_that_is_still_listed_counts_its_last_cards(self):
        h = Harness([[gd(10, 2)], [gd(10, 0)]])
        h.farm = CardFarm(FarmRules(recheck_seconds=600), h.read, h.make, lambda: h.now, on_game_drops=self.hook())
        h.begin()
        h.tick(600)
        self.assertEqual(self.seen, [(10, 2)])

    def test_the_hours_phase_counts_only_games_present_in_the_reread(self):
        rules = FarmRules(hours_until_drops=3.0, recheck_seconds=600)
        h = BatchHarness([[gp(10, 3, 0.5), gp(20, 2, 0.5)], [gp(10, 2, 0.5)], [gp(10, 2, 0.5)]], rules)
        h.farm = CardFarm(rules, h.read, h.make, lambda: h.now, on_game_drops=self.hook())
        h.up(2)
        h.tick(600)
        self.assertEqual(self.seen, [(10, 1)])

    def test_held_games_lists_the_single_game_and_the_started_batch(self):
        h = BatchHarness([[gp(10, 3, 5.0), gp(20, 2, 5.0)]], FarmRules())
        h.up(1)
        self.assertEqual(h.farm.held_games(), {20: "Game 20"})  # the fewest cards left go first
        b = BatchHarness([[gp(10, 3, 0.5), gp(20, 2, 0.5)]], FarmRules(hours_until_drops=3.0))
        b.up(2)
        self.assertEqual(b.farm.held_games(), {10: "Game 10", 20: "Game 20"})
        b.do(b.farm.stop)
        self.assertEqual(b.farm.held_games(), {})


class AchievementCountingTests(unittest.TestCase):
    def run_queue(self, env, seen):
        env.q = AchievementQueue(env.read, env.unlock, lambda: env.now, lambda a, b: a, env.guard,
                                 on_unlocked=lambda app_id, name, count: seen.append((app_id, name, count)))
        env.start(GamePlan(100, "Hundred"))
        for _ in range(10):
            env.q.step()

    def test_every_unlock_the_queue_confirms_is_reported(self):
        seen = []
        self.run_queue(QueueEnv({100: missing(3)}), seen)
        self.assertEqual(seen, [(100, "Hundred", 3)])

    def test_already_unlocked_ones_are_not_reported(self):
        env, seen = QueueEnv({100: missing(2)}), []
        env.on_unlock = lambda app_id, names, call: outcome(names, ["unlocked", "already"])
        self.run_queue(env, seen)
        self.assertEqual(seen, [(100, "Hundred", 1)])


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_stats_passes_the_period_and_returns_the_report(self):
        stub = StubController()
        stub.stats_report = lambda period: {"period": period, "totals": {}}
        routes = SteamIdleRoutes(stub)
        for period in ("7", "30", "all"):
            status, body = reply(await routes.stats(FakeRequest(query={"period": period})))
            self.assertEqual((status, body["period"]), (200, period))

    async def test_a_missing_period_means_thirty_days_and_a_bad_one_is_refused(self):
        stub = StubController()
        stub.stats_report = lambda period: {"period": period}
        routes = SteamIdleRoutes(stub)
        self.assertEqual(reply(await routes.stats(FakeRequest()))[1]["period"], "30")
        for bad in ("", "1", "7 ", "ALL", "30;", "-1", "all,7"):
            self.assertEqual(reply(await routes.stats(FakeRequest(query={"period": bad})))[0], 400, bad)

    async def test_reset_calls_the_controller_and_keeps_the_409_mapping(self):
        stub = StubController()
        routes = SteamIdleRoutes(stub)
        self.assertEqual(reply(await routes.stats_reset(FakeRequest(body={}))), (200, {"ok": True}))
        self.assertEqual(stub.calls, [("stats_reset", None)])
        stub.refusal = "busy"
        self.assertEqual(reply(await routes.stats_reset(FakeRequest(body={}))), (409, {"error": "busy"}))

    def test_both_paths_need_the_api_token_like_every_other_route(self):
        for path in ("/api/v1/steam-idle/stats", "/api/v1/steam-idle/stats/reset"):
            self.assertFalse(token_allowed("secret", path, {}, {"token": "secret"}))
            self.assertFalse(token_allowed("secret", path, {"X-Sentinel-Token": "wrong"}, {}))
            self.assertTrue(token_allowed("secret", path, {"X-Sentinel-Token": "secret"}, {}))

    def test_the_service_registers_both_routes(self):
        source = (Path(__file__).resolve().parent.parent / "sentinel_service.py").read_text(encoding="utf-8")
        self.assertIn('add_get("/api/v1/steam-idle/stats", steam_idle.stats)', source)
        self.assertIn('add_post("/api/v1/steam-idle/stats/reset", steam_idle.stats_reset)', source)


class ControllerStatsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)

    async def asyncTearDown(self):
        await self.env.ctl.shutdown()

    def make(self, **over):
        self.env = ControllerEnv(data_dir=self.dir, **over)
        self.env.signed_in()
        return self.env.ctl

    async def test_a_farm_run_records_time_cards_and_the_game_name(self):
        ctl = self.make(drops=[[gd(100, 3)], [gd(100, 1)], [gd(100, 0)]])
        self.assertIsNone(ctl.start())
        await self.env.settle()
        report = ctl.stats_report("all")
        self.assertEqual(report["totals"]["cards"], 3)
        self.assertGreater(report["totals"]["farmSeconds"], 0)
        self.assertEqual([g["appId"] for g in report["games"]], [100])
        self.assertTrue((self.dir / STATS_FILE_NAME).is_file(), "the end of the run is flushed")

    async def test_statistics_survive_a_new_controller(self):
        ctl = self.make(drops=[[gd(100, 2)], [gd(100, 0)]])
        ctl.start()
        await self.env.settle()
        await ctl.shutdown()
        again = ControllerEnv(data_dir=self.dir)
        try:
            self.assertEqual(again.ctl.stats_report("all")["totals"]["cards"], 2)
        finally:
            await again.ctl.shutdown()

    async def test_an_achievements_run_records_the_unlocks(self):
        ctl = self.make()
        self.env.settings["steam_idle_achievements_ack"] = True
        self.assertIsNone(ctl.start_achievements(GamePlan(100, "Hundred")))
        await self.env.settle()
        report = ctl.stats_report("all")
        self.assertEqual(report["totals"]["achievements"], 2)
        self.assertEqual(report["games"][0]["name"], "Hundred")

    async def test_reset_forgets_the_current_account(self):
        ctl = self.make(drops=[[gd(100, 2)], [gd(100, 0)]])
        ctl.start()
        await self.env.settle()
        self.assertIsNone(ctl.stats_reset())
        self.assertEqual(ctl.stats_report("all")["totals"]["cards"], 0)

    async def test_a_crashed_run_closes_the_clock_and_writes_the_file(self):
        ctl = self.make(drops=[[gd(100, 5)]])
        self.assertIsNone(ctl.start())
        await self.env.wait_running()
        await asyncio.sleep(0.05)
        await ctl._abort_run()
        self.assertEqual(ctl._stats._last[1], {}, "nothing is held after the crash")
        self.assertTrue((self.dir / STATS_FILE_NAME).is_file())

    async def test_a_new_run_never_credits_the_time_since_the_last_one(self):
        ctl = self.make(drops=[[gd(100, 2)], [gd(100, 0)]])
        ctl._stats._last = (ACCOUNT, {100: "Game 100"}, self.env.now - 10)
        self.assertIsNone(ctl.start())
        self.assertIsNone(ctl._stats._last, "start() forgot the held games of the old run")
        await self.env.settle()

    async def test_the_module_off_refuses_the_reset(self):
        ctl = self.make(module_enabled=False)
        self.assertEqual(ctl.stats_reset(), "module_disabled")


if __name__ == "__main__":
    unittest.main()
