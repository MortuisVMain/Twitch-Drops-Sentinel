"""queue_deadline_risks: which queue campaigns close before the queue gets to finish them."""
import unittest
from datetime import datetime, timedelta, timezone

from utils import format_minutes_ru, queue_deadline_risks

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)


def row(key, game, hours_left, watch):
    return {"key": key, "game": game, "ends_at": NOW + timedelta(hours=hours_left), "watch_minutes": watch}


class QueueDeadlineRisks(unittest.TestCase):
    def test_enough_time_for_everyone(self):
        rows = [row("a", "A", 10, 60), row("b", "B", 10, 120)]
        self.assertEqual(queue_deadline_risks(rows, NOW), [])

    def test_lower_game_is_late_because_of_the_games_above(self):
        rows = [row("a", "A", 48, 300), row("b", "B", 6, 120)]
        risks = queue_deadline_risks(rows, NOW)
        self.assertEqual(len(risks), 1)
        self.assertEqual(risks[0]["key"], "b")
        self.assertEqual(risks[0]["ahead_minutes"], 300)
        self.assertFalse(risks[0]["alone"], "it would make it if moved up")

    def test_late_even_when_started_now(self):
        risks = queue_deadline_risks([row("a", "A", 1, 120)], NOW)
        self.assertEqual(len(risks), 1)
        self.assertTrue(risks[0]["alone"])

    def test_one_games_campaigns_accrue_together(self):
        # two campaigns of A count once (the longer one) for the game below
        rows = [row("a1", "A", 48, 100), row("a2", "A", 48, 200), row("b", "B", 5, 90)]
        self.assertEqual(queue_deadline_risks(rows, NOW), [], "200 + 90 min fit into 5 h")
        rows[-1] = row("b", "B", 4, 90)
        self.assertEqual([r["key"] for r in queue_deadline_risks(rows, NOW)], ["b"])

    def test_unknown_or_done_watching_adds_nothing_and_is_never_flagged(self):
        rows = [row("a", "A", 1, None), row("z", "Z", 1, 0), row("b", "B", 2, 90)]
        self.assertEqual(queue_deadline_risks(rows, NOW), [])

    def test_closed_campaign_is_ignored_and_holds_nobody_up(self):
        self.assertEqual(queue_deadline_risks([row("a", "A", -1, 600), row("b", "B", 2, 90)], NOW), [])

    def test_minutes_wording(self):
        self.assertEqual(format_minutes_ru(45), "45 мин")
        self.assertEqual(format_minutes_ru(125), "2 ч 05 мин")
        self.assertEqual(format_minutes_ru(3 * 1440 + 250), "3 дн 4 ч")
        self.assertEqual(format_minutes_ru(-5), "0 мин")


if __name__ == "__main__":
    unittest.main()
