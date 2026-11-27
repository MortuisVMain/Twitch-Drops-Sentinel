"""Farm schedule: which moments are inside the farming window, and when it next opens or closes."""
import unittest
from datetime import datetime

from farm_schedule import in_window, next_change, normalize

# 2026-11-20 is a Friday (weekday 4)
FRI = lambda h, m=0: datetime(2026, 11, 20, h, m)
SAT = lambda h, m=0: datetime(2026, 11, 21, h, m)
MON = lambda h, m=0: datetime(2026, 11, 23, h, m)


class FarmSchedule(unittest.TestCase):
    def test_off_means_always_allowed(self):
        self.assertTrue(in_window(normalize({"enabled": False, "days": []}), FRI(12)))
        self.assertIsNone(next_change(normalize({}), FRI(12)))

    def test_daytime_window(self):
        s = normalize({"enabled": True, "days": [4], "start": "09:00", "end": "17:30"})
        self.assertFalse(in_window(s, FRI(8, 59)))
        self.assertTrue(in_window(s, FRI(9)))
        self.assertTrue(in_window(s, FRI(17, 29)))
        self.assertFalse(in_window(s, FRI(17, 30)))
        self.assertFalse(in_window(s, SAT(10)), "Saturday is not chosen")
        self.assertEqual(next_change(s, FRI(12)), FRI(17, 30))
        self.assertEqual(next_change(s, FRI(18)), datetime(2026, 11, 27, 9, 0), "next Friday")

    def test_night_window_belongs_to_the_day_it_starts(self):
        s = normalize({"enabled": True, "days": [4], "start": "23:00", "end": "07:00"})
        self.assertTrue(in_window(s, SAT(3)), "Friday night runs into Saturday morning")
        self.assertFalse(in_window(s, FRI(3)), "Thursday night is not chosen")
        self.assertEqual(next_change(s, SAT(3)), SAT(7))
        self.assertEqual(next_change(s, FRI(20)), FRI(23))

    def test_equal_start_and_end_is_the_whole_day(self):
        s = normalize({"enabled": True, "days": [5, 6], "start": "00:00", "end": "00:00"})
        self.assertTrue(in_window(s, SAT(15)))
        self.assertFalse(in_window(s, MON(15)))
        self.assertEqual(next_change(s, SAT(15)), MON(0), "Saturday and Sunday merge into one stretch")

    def test_no_days_never_farms(self):
        s = normalize({"enabled": True, "days": []})
        self.assertFalse(in_window(s, FRI(12)))
        self.assertIsNone(next_change(s, FRI(12)))

    def test_normalize_repairs_broken_input(self):
        s = normalize({"enabled": 1, "days": [7, -1, "2", True, 3, 3], "start": "25:00", "end": "x"})
        self.assertEqual(s, {"enabled": True, "days": [3], "start": "01:00", "end": "09:00"})
        self.assertEqual(normalize("nonsense")["days"], [0, 1, 2, 3, 4, 5, 6])


if __name__ == "__main__":
    unittest.main()
