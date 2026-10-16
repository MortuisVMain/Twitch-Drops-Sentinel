"""
Unit test suite verifying intelligent game matching, version gating, and PriorityMode logic
for Twitch Drops Sentinel v3.
"""
import unittest
import sys
from pathlib import Path

CORE_DIR = Path(__file__).resolve().parent
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

from twitch import smart_game_match
from campaigns_fetcher import smart_game_match as fetcher_match
from constants import PriorityMode, MAX_INT

class TestSmartGameMatch(unittest.TestCase):
    def test_exact_and_case(self):
        self.assertTrue(smart_game_match("Rust", "rust"))
        self.assertTrue(smart_game_match("Hearthstone", "HEARTHSTONE"))
        self.assertTrue(smart_game_match("Cyberpunk 2077", "cyberpunk 2077"))

    def test_version_isolation(self):
        # Path of Exile 2 must NEVER match Path of Exile (1)
        self.assertFalse(smart_game_match("Path of Exile 2", "Path of Exile"))
        self.assertFalse(smart_game_match("Path of Exile", "Path of Exile 2"))
        self.assertTrue(smart_game_match("Path of Exile 2", "Path of Exile 2"))
        self.assertTrue(smart_game_match("Path of Exile", "Path of Exile"))

        # Overwatch 2 vs Overwatch
        self.assertFalse(smart_game_match("Overwatch 2", "Overwatch"))
        self.assertTrue(smart_game_match("Overwatch 2", "Overwatch 2"))

        # AION 2 vs AION
        self.assertFalse(smart_game_match("AION 2", "AION"))
        self.assertTrue(smart_game_match("AION 2", "AION 2"))

    def test_subtitle_tolerance(self):
        # Hunt: Showdown 1896 vs Hunt: Showdown
        self.assertTrue(smart_game_match("Hunt: Showdown 1896", "Hunt: Showdown"))
        self.assertTrue(smart_game_match("Hunt: Showdown", "Hunt: Showdown 1896"))

        # The Witcher 3: Wild Hunt vs The Witcher 3
        self.assertTrue(smart_game_match("The Witcher 3: Wild Hunt", "The Witcher 3"))
        self.assertTrue(smart_game_match("The Witcher 3", "The Witcher 3: Wild Hunt"))

        # HITMAN World of Assassination vs HITMAN
        self.assertTrue(smart_game_match("HITMAN World of Assassination", "HITMAN"))

    def test_roman_numerals(self):
        # Space Marine II vs Space Marine 2
        self.assertTrue(smart_game_match("Warhammer 40,000: Space Marine II", "Space Marine 2"))
        self.assertTrue(smart_game_match("Space Marine 2", "Space Marine II"))

    def test_priority_ranking(self):
        priority = ["Hunt: Showdown", "Rust", "The Witcher 3", "Path of Exile 2"]

        def get_rank(name: str) -> int:
            for idx, p in enumerate(priority):
                if smart_game_match(name, p):
                    return idx
            return MAX_INT

        self.assertEqual(get_rank("Hunt: Showdown 1896"), 0)
        self.assertEqual(get_rank("Rust"), 1)
        self.assertEqual(get_rank("The Witcher 3: Wild Hunt"), 2)
        self.assertEqual(get_rank("Path of Exile 2"), 3)
        self.assertEqual(get_rank("Path of Exile"), MAX_INT)  # PoE 1 is not in priority
        self.assertEqual(get_rank("Some Random Game"), MAX_INT)

if __name__ == "__main__":
    unittest.main()
