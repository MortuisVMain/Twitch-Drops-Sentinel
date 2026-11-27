"""Offline checks for the first-drop samples and the threshold verdict (restricted or not)."""
import unittest

from steam_idle.first_drop import (KEY, MAX_SAMPLES, FirstDropSamples, drop_hours, verdict)


class VerdictTests(unittest.TestCase):
    def test_fewer_than_three_samples_say_nothing(self):
        self.assertIsNone(verdict([], 3.0))
        self.assertIsNone(verdict([0.5, 0.5], 3.0))

    def test_a_median_under_one_hour_is_unrestricted_and_suggests_zero(self):
        self.assertEqual(verdict([0.4, 0.5, 0.9], 3.0), {"kind": "unrestricted", "suggestedHours": 0})

    def test_a_median_of_one_hour_or_more_is_restricted_and_rounds_to_half_hours(self):
        self.assertEqual(verdict([1.0, 1.0, 1.0], 3.0), {"kind": "restricted", "suggestedHours": 1.0})
        self.assertEqual(verdict([1.6, 1.7, 1.8], 3.0), {"kind": "restricted", "suggestedHours": 1.5})
        self.assertEqual(verdict([1.9, 2.1, 2.2], 3.0), {"kind": "restricted", "suggestedHours": 2.0})

    def test_the_suggestion_is_clamped_to_half_an_hour_up_to_ten(self):
        self.assertEqual(verdict([12, 14, 30], 3.0)["suggestedHours"], 10)
        self.assertEqual(verdict([1.0, 1.0, 1.0], 3.0)["suggestedHours"], 1.0)

    def test_the_median_ignores_one_outlier(self):
        self.assertEqual(verdict([0.3, 0.4, 40.0], 3.0)["kind"], "unrestricted")

    def test_no_suggestion_when_it_equals_the_current_setting(self):
        self.assertIsNone(verdict([0.4, 0.5, 0.9], 0))
        self.assertIsNone(verdict([1.9, 2.1, 2.2], 2.0))
        self.assertIsNone(verdict([1.9, 2.1, 2.2], 2))

    def test_the_median_of_an_even_count_is_the_mean_of_the_middle_two(self):
        self.assertEqual(verdict([0.5, 0.9, 1.1, 1.3], 3.0)["kind"], "restricted")  # (0.9 + 1.1) / 2 = 1.0


class HugeNumberTests(unittest.TestCase):
    def test_a_huge_stored_int_is_dropped_not_a_crash(self):
        store = {KEY: {"a": [10 ** 400, 1.0], "b": [2.0]}}
        samples = FirstDropSamples(lambda key, default=None: store.get(key, default), store.__setitem__)
        self.assertEqual(samples._load(), ({"b": [2.0]}, True))

    def test_a_huge_new_sample_is_ignored(self):
        store = {}
        samples = FirstDropSamples(lambda key, default=None: store.get(key, default), store.__setitem__)
        self.assertEqual(samples.add(1, 10 ** 400), 0)


class DropHoursTests(unittest.TestCase):
    def test_the_playtime_of_the_read_that_showed_the_drop_wins(self):
        self.assertEqual(drop_hours(0.75, 7200), 0.75)

    def test_a_missing_or_zero_playtime_falls_back_to_the_hold_duration(self):
        self.assertEqual(drop_hours(None, 5400), 1.5)
        self.assertEqual(drop_hours(0, 1800), 0.5)
        self.assertEqual(drop_hours(0.0, 3600), 1.0)


class SamplesStoreTests(unittest.TestCase):
    def setUp(self):
        self.settings: dict = {}
        self.store = FirstDropSamples(lambda key, default=None: self.settings.get(key, default), self.settings.__setitem__)

    def test_key_name(self):
        self.assertEqual(KEY, "steam_idle_first_drop_samples")

    def test_samples_are_kept_per_account_and_counted(self):
        self.assertEqual(self.store.add(1, 0.5), 1)
        self.assertEqual(self.store.add(1, 0.7), 2)
        self.assertEqual(self.store.add(2, 2.0), 1)
        self.assertEqual((self.store.samples(1), self.store.samples(2), self.store.samples(3)), ([0.5, 0.7], [2.0], []))

    def test_the_stored_key_is_a_hash_not_the_account_id(self):
        self.store.add(76561198000000001, 0.5)
        self.assertNotIn("76561198000000001", "".join(self.settings[KEY]))

    def test_only_the_newest_ten_samples_are_kept(self):
        for index in range(MAX_SAMPLES + 3):
            self.store.add(1, float(index))
        kept = self.store.samples(1)
        self.assertEqual((len(kept), kept[0], kept[-1]), (MAX_SAMPLES, 3.0, 12.0))

    def test_bad_values_are_not_stored(self):
        for bad in (-1.0, float("nan"), float("inf"), "x", None, True):
            self.assertEqual(self.store.add(1, bad), 0, bad)
        self.assertEqual(self.store.samples(1), [])

    def test_unreadable_stored_data_is_dropped_with_a_warning(self):
        for bad in ("text", [1], {"x": "y"}, {"x": [1, "a", -2, None]}):
            self.settings[KEY] = bad
            with self.assertLogs("steam_idle.first_drop", level="WARNING"):
                count = self.store.add(1, 0.5)
            self.assertEqual(self.store.samples(1), [0.5], bad)
            self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
