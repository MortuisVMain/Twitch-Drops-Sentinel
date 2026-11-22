"""Offline checks for the cheap rechecks (only the farmed games' card pages), the drop counter and the estimate."""
import unittest

from steam_idle.community import CommunityError, GameDrops
from steam_idle.farm import CardFarm, FarmRules
from steam_idle.test_batch import BatchHarness, gp
from steam_idle.test_farm import Harness, gd

RULES = FarmRules(recheck_seconds=600, full_read_seconds=3600)


class Targeted(BatchHarness):
    """`reads` answer full reads, `games` answer targeted ones; every targeted request is recorded."""

    def __init__(self, reads, games, rules=RULES):
        super().__init__(reads, rules)
        self.games, self.asked, self.counted = list(games), [], []
        self.farm = CardFarm(rules, self.read, self.make, lambda: self.now, read_games=self.read_games,
                             on_drops=self.counted.append)

    def read_games(self, ids):
        self.asked.append(list(ids))
        item = self.games.pop(0) if len(self.games) > 1 else self.games[0]
        if isinstance(item, Exception):
            raise item
        return item

    def cards(self):
        return self.farm.status()["droppedThisRun"]


class TargetedRecheckTests(unittest.TestCase):
    def test_a_recheck_reads_only_the_held_game(self):
        h = Targeted([[gd(10, 3), gd(20, 4)]], [[gd(10, 2)]])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.asked, h.read_calls), ([[10]], 1))
        self.assertEqual(h.status()["current"]["dropsRemaining"], 2)
        self.assertEqual([g["appId"] for g in h.status()["queue"]], [20])

    def test_a_finished_game_moves_on_with_the_queue_of_the_last_full_read(self):
        h = Targeted([[gd(10, 1), gd(20, 2)]], [[gd(10, 0)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual([g["appId"] for g in h.status()["done"]], [10])
        self.assertEqual((h.asked, h.read_calls), ([[10]], 1))

    def test_an_unnamed_card_page_keeps_the_name_of_the_full_read(self):
        h = Targeted([[gd(10, 3)]], [[GameDrops(10, "", 2, 1.5)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.status()["current"]["name"], "Game 10")

    def test_a_full_read_is_due_after_full_read_seconds(self):
        rules = FarmRules(recheck_seconds=600, full_read_seconds=1000)
        h = Targeted([[gd(10, 5)], [gd(10, 4)]], [[gd(10, 5)]], rules)
        h.up(1)
        h.tick(600)
        self.assertEqual((h.asked, h.read_calls), ([[10]], 1))
        h.tick(600)  # 1200 s since the full read
        self.assertEqual((h.asked, h.read_calls), ([[10]], 2))
        h.tick(600)  # 600 s since the second full read: targeted again
        self.assertEqual((h.asked, h.read_calls), ([[10], [10]], 2))

    def test_a_full_read_confirms_the_end_before_done(self):
        h = Targeted([[gd(10, 1)], [gd(10, 0)]], [[gd(10, 0)]])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.state, h.read_calls), ("done", 2))

    def test_the_full_read_before_done_can_find_more_games(self):
        h = Targeted([[gd(10, 1)], [gd(10, 0), gd(30, 2)]], [[gd(10, 0)]])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.state, h.held_ids()), ("farming", [30]))

    def test_no_extra_read_when_the_last_read_was_a_full_one(self):
        h = Targeted([[gd(10, 0)]], [[gd(10, 0)]])
        h.up(1)
        self.assertEqual((h.state, h.read_calls, h.asked), ("done", 1, []))

    def test_a_failed_full_read_before_done_waits_and_retries_instead_of_finishing(self):
        h = Targeted([[gd(10, 1)], CommunityError("timeout"), [gd(10, 0)]], [[gd(10, 0)]])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.state, h.status()["lastError"]), ("waiting", "timeout"))
        h.tick(300)
        self.assertEqual(h.state, "done")

    def test_a_failed_targeted_read_falls_back_to_a_full_read(self):
        h = Targeted([[gd(10, 3)], [gd(10, 2)]], [CommunityError("failed:gamecards_unparsed")])
        h.up(1)
        with self.assertLogs("steam_idle.farm", level="WARNING") as logged:
            h.tick(600)
        self.assertEqual((h.read_calls, h.status()["current"]["dropsRemaining"]), (2, 2))
        self.assertTrue(any("gamecards_unparsed" in line for line in logged.output))

    def test_signed_out_on_a_card_page_is_confirmed_by_a_full_read(self):
        h = Targeted([[gd(10, 3)], [gd(10, 2)]], [CommunityError("signed_out")])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.state, h.read_calls, h.held_ids()), ("farming", 2, [10]))

    def test_signed_out_on_both_reads_needs_login(self):
        h = Targeted([[gd(10, 3)], CommunityError("signed_out")], [CommunityError("signed_out")])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.state, h.read_calls, h.held_ids()), ("needs_login", 2, []))

    def test_a_game_missing_from_the_answer_counts_as_gone(self):
        h = Targeted([[gd(10, 1), gd(20, 2)]], [[]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.held_ids(), [20])

    def test_a_batch_recheck_is_one_call_for_every_held_game(self):
        first = [gp(10, 1, 0.5), gp(20, 2, 0.5), gp(30, 3, 0.5)]
        rules = FarmRules(recheck_seconds=600, full_read_seconds=3600, hours_until_drops=3.0)
        h = Targeted([first], [[gp(10, 1, 1.0), gp(20, 2, 1.0), gp(30, 3, 1.0)]], rules)
        h.up(3)
        h.tick(600)
        self.assertEqual((h.asked, h.read_calls), ([[10, 20, 30]], 1))
        self.assertEqual([g["playtimeHours"] for g in h.status()["batch"]], [1.0, 1.0, 1.0])


class DropCountTests(unittest.TestCase):
    def test_a_decrease_is_counted_and_a_finish_counts_what_was_left(self):
        h = Targeted([[gd(10, 5)]], [[gd(10, 3)], [gd(10, 3)], [gd(10, 0)]])
        h.up(1)
        self.assertEqual(h.cards(), 0)
        h.tick(600)
        self.assertEqual((h.cards(), h.counted), (2, [2]))
        h.tick(600)
        self.assertEqual(h.cards(), 2, "an unchanged read counts nothing")
        h.tick(600)
        self.assertEqual((h.cards(), h.counted), (5, [2, 3]))

    def test_a_higher_count_is_not_a_drop(self):
        h = Targeted([[gd(10, 2)]], [[gd(10, 4)]])
        h.up(1)
        h.tick(600)
        self.assertEqual((h.cards(), h.counted), (0, []))

    def test_a_game_vanishing_from_the_list_counts_its_remaining_cards(self):
        h = Targeted([[gd(10, 2), gd(20, 3)]], [[]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.counted, [2])

    def test_batch_rechecks_count_decreases_and_finished_games(self):
        first = [gp(10, 1, 0.5), gp(20, 4, 0.5), gp(30, 3, 0.5)]
        later = [gp(10, 0, 1.0), gp(20, 3, 1.0), gp(30, 3, 1.0)]
        rules = FarmRules(recheck_seconds=600, full_read_seconds=3600, hours_until_drops=3.0)
        h = Targeted([first], [later], rules)
        h.up(3)
        h.tick(600)
        self.assertEqual((h.cards(), h.counted), (2, [1, 1]))

    def test_the_run_counter_starts_from_zero_with_each_run(self):
        h = Targeted([[gd(10, 3)]], [[gd(10, 1)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.cards(), 2)
        h.do(h.farm.stop)
        h.do(h.farm.start)
        self.assertEqual(h.cards(), 0)

    def test_each_counted_drop_is_one_log_line(self):
        h = Targeted([[gd(10, 5)]], [[gd(10, 3)], [gd(10, 0)]])
        h.up(1)
        with self.assertLogs("steam_idle.farm", level="INFO") as logged:
            h.tick(600)
            h.tick(600)
        lines = [line.split(":", 2)[2] for line in logged.output if "drops" in line and "->" in line]
        self.assertEqual(lines, ["Game 10: drops 5 -> 3", "Game 10: drops 3 -> 0"])


class StatusEstimateTests(unittest.TestCase):
    def test_status_carries_the_estimate_of_the_games_still_to_do(self):
        h = Targeted([[gd(10, 3), gd(20, 2)]], [[gd(10, 3)]])
        h.up(1)
        self.assertEqual(h.status()["estimate"], {"dropsRemaining": 5, "hours": 2.5})

    def test_the_hours_phase_adds_the_wait_of_the_batch_and_of_the_queue(self):
        reads = [[gp(10, 1, 0.5), gp(20, 1, 1.0), gp(30, 2, 0.0)]]
        h = Targeted(reads, [[]], FarmRules(recheck_seconds=600, hours_until_drops=3.0, batch_size=2))
        h.up(2)
        # batch 10 and 20 wait max(2.5, 2.0); game 30 needs another batch of 3 h; 4 cards = 2 h
        self.assertEqual(h.status()["estimate"], {"dropsRemaining": 4, "hours": 2.0 + 2.5 + 3.0})

    def test_the_estimate_is_zero_when_nothing_is_left(self):
        h = Targeted([[gd(10, 0)]], [[]])
        h.up(1)
        self.assertEqual(h.status()["estimate"], {"dropsRemaining": 0, "hours": 0.0})


class DefaultReaderTests(unittest.TestCase):
    def test_without_a_games_reader_every_recheck_is_a_full_read(self):
        h = Harness([[gd(10, 3)], [gd(10, 2)], [gd(10, 2)]])
        h.begin()
        h.tick(600)
        h.tick(600)
        self.assertEqual(h.read_calls, 3)
        self.assertEqual(h.farm.status()["droppedThisRun"], 1)


if __name__ == "__main__":
    unittest.main()
