"""Offline checks for the per-account daily drop counter kept in the settings store."""
import datetime
import unittest

from steam_idle.drops_daily import KEY, DailyDrops


class DailyDropsTests(unittest.TestCase):
    def setUp(self):
        self.settings: dict = {}
        self.day = datetime.datetime(2026, 11, 22, 23, 59).timestamp()
        self.daily = DailyDrops(lambda key, default=None: self.settings.get(key, default), self.settings.__setitem__,
                                lambda: self.day)

    def test_key_name(self):
        self.assertEqual(KEY, "steam_idle_drops_daily")

    def test_nothing_counted_is_zero(self):
        self.assertEqual(self.daily.today(76561198000000001), 0)

    def test_counts_add_up_per_account_and_store_the_local_date(self):
        self.daily.add(1, 2)
        self.daily.add(1, 1)
        self.daily.add(2, 5)
        self.assertEqual((self.daily.today(1), self.daily.today(2), self.daily.today(3)), (3, 5, 0))
        dates = {bucket["date"] for bucket in self.settings[KEY].values()}
        self.assertEqual(dates, {"2026-11-22"})

    def test_the_stored_key_is_not_the_account_id(self):
        self.daily.add(76561198000000001, 1)
        self.assertNotIn("76561198000000001", "".join(self.settings[KEY]))

    def test_the_count_starts_again_when_the_date_changes(self):
        self.daily.add(1, 4)
        self.day += 120  # past midnight, local time
        self.assertEqual(self.daily.today(1), 0)
        self.daily.add(1, 1)
        self.assertEqual(self.daily.today(1), 1)

    def test_an_unknown_account_has_a_shared_bucket(self):
        self.daily.add(0, 2)
        self.assertEqual(self.daily.today(0), 2)

    def test_zero_or_negative_counts_write_nothing(self):
        self.daily.add(1, 0)
        self.daily.add(1, -3)
        self.assertNotIn(KEY, self.settings)

    def test_unreadable_stored_data_is_ignored_and_replaced_with_a_warning(self):
        for bad in ("text", [1], {"x": 5}, {"x": {"date": "2026-11-22", "count": -1}}, {"x": {"date": 3, "count": 1}}):
            self.settings[KEY] = bad
            self.assertEqual(self.daily.today(1), 0)
            with self.assertLogs("steam_idle.drops_daily", level="WARNING"):
                self.daily.add(1, 1)
            self.assertEqual(self.daily.today(1), 1)
            self.assertEqual(len(self.settings[KEY]), 1, bad)


if __name__ == "__main__":
    unittest.main()
