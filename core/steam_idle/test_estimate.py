"""Offline checks for the farm's time estimate: a pure function of the games still to do."""
import unittest

from steam_idle.community import GameDrops
from steam_idle.estimate import HOURS_PER_DROP, estimate


def gp(app_id, drops, hours=10.0):
    return GameDrops(app_id, f"Game {app_id}", drops, hours)


class EstimateTests(unittest.TestCase):
    def test_nothing_left_is_zero(self):
        self.assertEqual(estimate([], [], 0.0, 32), {"dropsRemaining": 0, "hours": 0.0})

    def test_without_the_hours_phase_a_drop_is_half_an_hour(self):
        self.assertEqual(HOURS_PER_DROP, 0.5)
        self.assertEqual(estimate([gp(1, 3)], [gp(2, 1)], 0.0, 32), {"dropsRemaining": 4, "hours": 2.0})

    def test_games_over_the_threshold_add_no_hours_time(self):
        self.assertEqual(estimate([gp(1, 2, 5.0)], [gp(2, 2, 3.0)], 3.0, 32), {"dropsRemaining": 4, "hours": 2.0})

    def test_the_batch_needs_the_longest_wait_among_its_games(self):
        batch = [gp(1, 1, 2.5), gp(2, 1, 0.5), gp(3, 1, 4.0)]
        self.assertEqual(estimate(batch, [], 3.0, 32), {"dropsRemaining": 3, "hours": 1.5 + 2.5})

    def test_queued_games_under_the_threshold_cost_one_threshold_per_full_batch(self):
        queue = [gp(n, 1, 0.0) for n in range(5)]
        # 5 games, 2 per batch: ceil(5 / 2) = 3 batches of 3 h
        self.assertEqual(estimate([], queue, 3.0, 2), {"dropsRemaining": 5, "hours": 2.5 + 9.0})

    def test_batch_and_queue_add_up(self):
        batch = [gp(1, 1, 1.0), gp(2, 1, 2.0)]
        queue = [gp(3, 2, 0.0), gp(4, 2, 5.0), gp(5, 1, 0.5)]
        # drops 7 -> 3.5 h; batch waits max(2.0, 1.0) = 2.0 h; two queued games under 3 h, one batch of 2 -> 3 h
        self.assertEqual(estimate(batch, queue, 3.0, 2),
                         {"dropsRemaining": 7, "hours": 3.5 + 2.0 + 3.0})

    def test_the_held_game_counts_its_drops_and_never_waits(self):
        self.assertEqual(estimate([], [], 3.0, 32, held=gp(1, 4, 0.0)), {"dropsRemaining": 4, "hours": 2.0})

    def test_a_batch_size_below_one_is_treated_as_one(self):
        self.assertEqual(estimate([], [gp(1, 1, 0.0), gp(2, 1, 0.0)], 3.0, 0), {"dropsRemaining": 2, "hours": 1.0 + 6.0})

    def test_hours_are_rounded_to_a_tenth(self):
        self.assertEqual(estimate([], [gp(1, 1, 2.96)], 3.0, 32)["hours"], round(0.5 + 3.0, 1))


if __name__ == "__main__":
    unittest.main()
