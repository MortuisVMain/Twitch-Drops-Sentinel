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


if __name__ == "__main__":
    unittest.main()
