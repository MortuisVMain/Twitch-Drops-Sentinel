"""Offline checks for the first-drop observation: a game farmed alone from (almost) zero hours that drops a card."""
import unittest

from steam_idle.community import GameDrops
from steam_idle.farm import CardFarm, FarmRules
from steam_idle.test_batch import BatchHarness, gp

RULES = FarmRules(recheck_seconds=600)


class Observed(BatchHarness):
    def __init__(self, reads, rules=RULES):
        super().__init__(reads, rules)
        self.first = []
        self.farm = CardFarm(rules, self.read, self.make, lambda: self.now,
                             on_first_drop=lambda game, hours: self.first.append((game.app_id, hours)))


class FirstDropTests(unittest.TestCase):
    def test_the_first_drop_of_a_game_held_from_zero_hours_reports_the_playtime_of_that_read(self):
        h = Observed([[gp(10, 3, 0.0)], [gp(10, 2, 0.5)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.first, [(10, 0.5)])

    def test_a_game_that_started_with_hours_does_not_qualify(self):
        h = Observed([[gp(10, 3, 1.0)], [gp(10, 2, 1.5)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.first, [])

    def test_only_the_first_decrease_counts(self):
        h = Observed([[gp(10, 4, 0.0)], [gp(10, 3, 0.5)], [gp(10, 2, 1.0)]])
        h.up(1)
        h.tick(600)
        h.tick(600)
        self.assertEqual(h.first, [(10, 0.5)])

    def test_a_missing_playtime_falls_back_to_the_hold_duration_in_hours(self):
        h = Observed([[gp(10, 3, 0.0)], [gp(10, 2, 0.0)]])
        h.up(1)
        h.tick(1800)
        self.assertEqual(h.first, [(10, 0.5)])

    def test_a_game_finished_by_the_read_that_shows_the_drop_still_counts(self):
        h = Observed([[gp(10, 1, 0.0)], [gp(10, 0, 0.6)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.first, [(10, 0.6)])

    def test_no_decrease_no_sample(self):
        h = Observed([[gp(10, 3, 0.0)], [gp(10, 3, 0.2)]])
        h.up(1)
        h.tick(600)
        self.assertEqual(h.first, [])

    def test_each_new_game_gets_its_own_observation(self):
        h = Observed([[gp(10, 1, 0.0), gp(20, 2, 0.0)], [gp(10, 0, 0.4), gp(20, 2, 0.0)],
                      [gp(10, 0, 0.4), gp(20, 1, 0.7)]])
        h.up(1)
        h.tick(600)
        h.tick(600)
        self.assertEqual(h.first, [(10, 0.4), (20, 0.7)])

    def test_games_of_the_hours_phase_never_report(self):
        h = Observed([[gp(10, 2, 0.5), gp(20, 2, 0.5)], [gp(10, 1, 0.5), gp(20, 2, 0.5)]], FarmRules(
            recheck_seconds=600, hours_until_drops=3.0))
        h.up(2)
        h.tick(600)
        self.assertEqual(h.first, [])


class HeldIdsTests(unittest.TestCase):
    def test_held_ids_cover_a_solo_game_and_every_batched_game_and_empty_when_released(self):
        h = Observed([[gp(10, 2, 0.0)]])
        self.assertEqual(h.farm.held_ids(), frozenset())
        h.up(1)
        self.assertEqual(h.farm.held_ids(), frozenset({10}))
        h.do(h.farm.stop)
        self.assertEqual(h.farm.held_ids(), frozenset())
        batch = Observed([[gp(10, 2, 0.5), gp(20, 2, 0.5)]], FarmRules(recheck_seconds=600, hours_until_drops=3.0))
        batch.up(2)
        self.assertEqual(batch.farm.held_ids(), frozenset({10, 20}))


if __name__ == "__main__":
    unittest.main()
