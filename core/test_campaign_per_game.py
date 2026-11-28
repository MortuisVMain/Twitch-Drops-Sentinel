"""A game can have several campaigns in the engine (Albion: two active weeks and two expired ones). The shelf showed whichever came
last; it now shows the one that matters: farmable first, then active, then not finished."""
import unittest
from datetime import datetime
from types import SimpleNamespace

import sentinel_service as s


def camp(name, earn=False, active=False, finished=False):
    return SimpleNamespace(name=name, active=active, finished=finished, can_earn_within=lambda _stamp, e=earn: e)


class BestCampaignPerGame(unittest.TestCase):
    def test_farmable_beats_active_beats_unfinished_beats_the_rest(self):
        expired = camp("expired", finished=True)
        old = camp("old unfinished")
        active = camp("active", active=True)
        farmable = camp("farmable", earn=True, active=True)
        for order in ([expired, old, active, farmable], [farmable, active, old, expired], [active, farmable, expired, old]):
            best = None
            for c in order:
                best = s.better_campaign(best, c, datetime(2026, 11, 28))
            self.assertIs(best, farmable, [c.name for c in order])
        self.assertIs(s.better_campaign(s.better_campaign(None, expired, datetime(2026, 11, 28)), active, datetime(2026, 11, 28)), active)


def drops(total, claimed, active=True, left=None):
    return SimpleNamespace(total_drops=total, claimed_drops=claimed, active=active, finished=claimed >= total, left=left)


class DropTotalsPerGame(unittest.TestCase):
    def test_active_campaigns_of_a_game_add_up(self):
        # Albion 2026-11-28: two active weeks of one drop each, two expired ones
        best = drops(1, 0, left=180)
        summary = s.game_drop_summary(best, [best, drops(1, 0, left=240), drops(1, 1, active=False), drops(1, 0, active=False)],
                                      remaining=lambda c: c.left)
        self.assertEqual(summary, {"total": 2, "claimed": 0, "finished": False, "remaining_minutes": 420})

    def test_finished_only_when_every_active_campaign_is(self):
        a, b = drops(1, 1), drops(2, 1)
        self.assertFalse(s.game_drop_summary(a, [a, b], remaining=lambda c: None)["finished"])
        self.assertTrue(s.game_drop_summary(a, [a, drops(2, 2)], remaining=lambda c: None)["finished"])

    def test_without_active_siblings_the_best_campaign_alone_counts(self):
        best = drops(3, 1, active=False)
        summary = s.game_drop_summary(best, [best], remaining=lambda c: None)
        self.assertEqual((summary["total"], summary["claimed"], summary["remaining_minutes"]), (3, 1, None))

    def test_the_shelf_no_longer_reads_last_polls_values(self):
        import inspect
        source = inspect.getsource(s.SentinelSupervisor.get_full_state)
        self.assertNotIn('g.get("is_finished") is True', source, "a cached catalog dict keeps last poll's verdict")
        self.assertIn("game_drop_summary(", source)


if __name__ == "__main__":
    unittest.main()
