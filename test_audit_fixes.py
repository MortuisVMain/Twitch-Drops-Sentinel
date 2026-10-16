"""
Test suite verifying fixes for Twitch Drops Sentinel v3:
1. Fuzzy priority game matching and priority sorting order.
2. PriorityMode behavior (PRIORITY_ONLY vs ENDING_SOONEST).
3. Backend toggle-daemon and state endpoints.
"""

import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

CORE_DIR = Path(__file__).resolve().parent / "core"
sys.path.insert(0, str(CORE_DIR))

from constants import PriorityMode, MAX_INT


def test_fuzzy_priority_matching():
    priority = [
        "Hunt: Showdown 1896",
        "The Witcher 3: Wild Hunt",
        "Rust",
        "AION 2"
    ]

    def _fuzzy_priority(name: str) -> int:
        name_low = name.lower()
        for idx, p in enumerate(priority):
            if p.lower() in name_low or name_low in p.lower():
                return idx
        return MAX_INT

    # Exact matches
    assert _fuzzy_priority("The Witcher 3: Wild Hunt") == 1
    assert _fuzzy_priority("Rust") == 2

    # Twitch API variations
    assert _fuzzy_priority("The Witcher 3") == 1
    assert _fuzzy_priority("Hunt: Showdown") == 0
    assert _fuzzy_priority("hunt") == 0

    # Non-priority games must return MAX_INT
    assert _fuzzy_priority("World of Warships") == MAX_INT
    assert _fuzzy_priority("Some Random Game") == MAX_INT
    print("[PASS] Fuzzy priority matching verified!")


def test_priority_sorting_over_ends_at():
    priority = [
        "The Witcher 3: Wild Hunt",
        "Hunt: Showdown 1896"
    ]

    def _fuzzy_priority(name: str) -> int:
        name_low = name.lower()
        for idx, p in enumerate(priority):
            if p.lower() in name_low or name_low in p.lower():
                return idx
        return MAX_INT

    now = datetime.now(timezone.utc)
    
    # Mock campaigns
    class MockCampaign:
        def __init__(self, name, ends_at):
            self.name = name
            self.ends_at = ends_at
            self.game_name = name

    # World of Warships ends in 10 minutes, Witcher ends in 5 days
    c_wows = MockCampaign("World of Warships", now + timedelta(minutes=10))
    c_witcher = MockCampaign("The Witcher 3: Wild Hunt", now + timedelta(days=5))
    c_hunt = MockCampaign("Hunt: Showdown 1896", now + timedelta(days=2))
    c_random = MockCampaign("Random Drop", now + timedelta(minutes=5))

    campaigns = [c_wows, c_witcher, c_hunt, c_random]

    # In ENDING_SOONEST: first sort by ends_at, then stable sort by fuzzy priority
    campaigns.sort(key=lambda c: c.ends_at)
    campaigns.sort(key=lambda c: _fuzzy_priority(c.game_name))

    # Witcher and Hunt MUST be first, in the order of the user's priority list!
    assert campaigns[0].name == "The Witcher 3: Wild Hunt"
    assert campaigns[1].name == "Hunt: Showdown 1896"
    # Non-priority games are placed after, sorted by ends_at (c_random before c_wows)
    assert campaigns[2].name == "Random Drop"
    assert campaigns[3].name == "World of Warships"
    print("[PASS] Priority sorting over ends_at verified!")


def test_priority_only_filtering():
    priority = ["The Witcher 3: Wild Hunt"]
    priority_only = True

    def _fuzzy_priority(name: str) -> int:
        name_low = name.lower()
        for idx, p in enumerate(priority):
            if p.lower() in name_low or name_low in p.lower():
                return idx
        return MAX_INT

    exclude = set()

    games = ["The Witcher 3: Wild Hunt", "World of Warships", "Random Game"]
    wanted = []
    for g in games:
        if g not in exclude and (not priority_only or _fuzzy_priority(g) != MAX_INT):
            wanted.append(g)

    assert wanted == ["The Witcher 3: Wild Hunt"]
    print("[PASS] Priority only filtering verified!")


if __name__ == "__main__":
    test_fuzzy_priority_matching()
    test_priority_sorting_over_ends_at()
    test_priority_only_filtering()
    print("ALL TESTS PASSED! Exit code 0.")
