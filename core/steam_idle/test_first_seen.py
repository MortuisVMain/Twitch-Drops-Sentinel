"""Offline checks for the refund-window store and rule: real files in a temporary directory, an injected clock."""
import json
import tempfile
import unittest
from pathlib import Path

from steam_idle.community import GameDrops
from steam_idle.first_seen import (FILE_NAME, REFUND_MAX_HOURS, REFUND_WINDOW_SECONDS, FirstSeenStore, days_left,
                                   is_held)

DAY = 86400.0
NOW = 1_800_000_000.0


def game(app_id, hours=0.0):
    return GameDrops(app_id, f"Game {app_id}", 3, hours)


class RuleTests(unittest.TestCase):
    def test_window_and_playtime_constants(self):
        self.assertEqual(REFUND_WINDOW_SECONDS, 14 * DAY)
        self.assertEqual(REFUND_MAX_HOURS, 2.0)

    def test_held_only_inside_the_window_and_under_two_hours(self):
        self.assertTrue(is_held(NOW - 13.9 * DAY, 0.0, NOW))
        self.assertFalse(is_held(NOW - 14 * DAY, 0.0, NOW))
        self.assertTrue(is_held(NOW - DAY, 1.9, NOW))
        self.assertFalse(is_held(NOW - DAY, 2.0, NOW))

    def test_released_by_hand_is_never_held(self):
        self.assertFalse(is_held(NOW - DAY, 0.0, NOW, released=True))

    def test_missing_playtime_counts_as_zero(self):
        self.assertTrue(is_held(NOW - DAY, None, NOW))

    def test_days_left_rounds_up_and_is_at_least_one(self):
        self.assertEqual(days_left(NOW - 13.9 * DAY, NOW), 1)
        self.assertEqual(days_left(NOW - 13 * DAY, NOW), 1)
        self.assertEqual(days_left(NOW - 12.5 * DAY, NOW), 2)
        self.assertEqual(days_left(NOW, NOW), 14)
        self.assertEqual(days_left(NOW - 14.5 * DAY, NOW), 1)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / FILE_NAME
        self.now = NOW
        self.store = FirstSeenStore(self.path, lambda: self.now)

    def reopen(self):
        return FirstSeenStore(self.path, lambda: self.now)

    def test_first_ever_preview_is_recorded_as_seen_long_ago(self):
        self.store.observe([game(1), game(2)])
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")),
                         {"version": 2, "accounts": {}, "shared": {"firstSeen": {"1": 0, "2": 0}, "released": []}})
        self.assertEqual(self.store.held([game(1), game(2)]), [])

    def test_a_later_new_game_is_recorded_with_the_current_time(self):
        self.store.observe([game(1)])
        self.now += DAY
        self.store.observe([game(1), game(2)])
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(data["shared"]["firstSeen"], {"1": 0, "2": NOW + DAY})
        self.assertEqual([(g.app_id, d) for g, d in self.store.held([game(1), game(2)])], [(2, 14)])

    def test_an_empty_first_preview_still_sets_the_baseline(self):
        self.store.observe([])
        self.now += DAY
        self.store.observe([game(5)])
        self.assertEqual([g.app_id for g, _ in self.store.held([game(5)])], [5])

    def test_known_games_keep_their_first_time_and_vanished_ones_are_kept(self):
        self.store.observe([game(1)])
        self.now += DAY
        self.store.observe([game(2)])
        self.now += DAY
        self.store.observe([game(1), game(2)])
        self.assertEqual(self.reopen()._buckets["shared"].first_seen, {1: 0, 2: NOW + DAY})

    def test_persistence_round_trip_including_released(self):
        self.store.observe([])
        self.now += DAY
        self.store.observe([game(7)])
        self.store.release(7)
        again = self.reopen()
        self.assertTrue(again.is_released(7))
        self.assertEqual(again.held([game(7)]), [])
        again.observe([game(8)])  # an existing file means no baseline again
        self.assertEqual([g.app_id for g, _ in again.held([game(8)])], [8])

    def test_held_ignores_unknown_games_and_old_playtime(self):
        self.store.observe([])
        self.now += DAY
        self.store.observe([game(1), game(2)])
        held = self.store.held([game(1, 2.5), game(2, 1.0), game(3)])
        self.assertEqual([g.app_id for g, _ in held], [2])

    def test_corrupt_file_is_logged_set_aside_and_holds_new_games(self):
        for text in ("{broken", "[]", json.dumps({"version": 2, "firstSeen": {}, "released": []}),
                     json.dumps({"version": 1, "firstSeen": {"x": 1}, "released": []}),
                     json.dumps({"version": 1, "firstSeen": {"1": "no"}, "released": []}),
                     json.dumps({"version": 1, "firstSeen": {}, "released": ["1"]})):
            with self.subTest(text=text[:30]):
                self.path.write_text(text, encoding="utf-8")
                with self.assertLogs("steam_idle.first_seen", level="ERROR"):
                    store = self.reopen()
                self.assertFalse(self.path.exists())
                aside = self.path.with_name(FILE_NAME + ".corrupt")
                self.assertEqual(aside.read_text(encoding="utf-8"), text)
                aside.unlink()
                store.observe([game(1)])  # no baseline: a lost file must not free a recent purchase
                self.assertEqual([g.app_id for g, _ in store.held([game(1)])], [1])
                self.path.unlink()

    def test_two_accounts_keep_separate_first_seen_baselines_and_releases(self):
        a, b = 10_000_001, 10_000_002
        self.store.observe([game(1)], a)
        self.now += DAY
        self.store.observe([game(1), game(2)], a)
        self.assertEqual([g.app_id for g, _ in self.store.held([game(1), game(2)], a)], [2])
        self.now += DAY
        self.store.observe([game(1), game(2)], b)  # the other account's first preview is its own baseline
        self.assertEqual(self.store.held([game(1), game(2)], b), [])
        self.store.release(2, a)
        self.assertTrue(self.store.is_released(2, a))
        self.assertFalse(self.store.is_released(2, b))
        self.now += DAY
        self.store.observe([game(3)], b)  # a game b gets later is held for b only
        self.assertEqual([g.app_id for g, _ in self.store.held([game(1), game(3)], b)], [3])
        self.assertEqual(self.store.held([game(3)], a), [])
        again = self.reopen()
        self.assertEqual([g.app_id for g, _ in again.held([game(3)], b)], [3])
        self.assertTrue(again.is_released(2, a) and not again.is_released(2, b))

    def test_the_account_provider_is_used_when_no_account_is_given(self):
        current = [10_000_001]
        store = FirstSeenStore(None, lambda: self.now, account=lambda: current[0])
        store.observe([])
        self.now += DAY
        store.observe([game(4)])
        self.assertEqual([g.app_id for g, _ in store.held([game(4)])], [4])
        current[0] = 10_000_002
        self.assertEqual(store.held([game(4)]), [])

    def test_the_old_shared_record_moves_to_the_first_account_that_uses_it(self):
        a, b = 10_000_001, 10_000_002
        self.path.write_text(json.dumps({"version": 1, "firstSeen": {"1": 0, "2": NOW}, "released": [2]}), encoding="utf-8")
        store = self.reopen()
        self.assertEqual([g.app_id for g, _ in store.held([game(1), game(2)], a)], [])  # 2 is released, 1 is old
        self.assertTrue(store.is_released(2, a))
        self.assertFalse(store.is_released(2, b))
        store.observe([game(1), game(2), game(3)], b)  # b is new: its own baseline, nothing inherited
        self.assertEqual(store.held([game(1), game(2), game(3)], b), [])
        text = self.path.read_text(encoding="utf-8")
        self.assertEqual(json.loads(text)["version"], 2)
        self.assertNotIn(str(a), text)
        self.assertNotIn(str(b), text)
        again = self.reopen()
        self.assertTrue(again.is_released(2, a))
        self.assertFalse(again.is_released(2, b))
        self.assertEqual(again._buckets.keys() & {"shared"}, set())

    def test_an_old_record_with_a_recent_game_keeps_holding_it_for_the_migrated_account(self):
        a = 10_000_001
        self.path.write_text(json.dumps({"version": 1, "firstSeen": {"2": NOW}, "released": []}), encoding="utf-8")
        self.assertEqual([g.app_id for g, _ in self.reopen().held([game(2)], a)], [2])

    def test_a_store_without_a_path_works_in_memory(self):
        store = FirstSeenStore(None, lambda: self.now)
        store.observe([game(1)])
        self.now += DAY
        store.observe([game(2)])
        store.release(2)
        self.assertEqual(store.held([game(1), game(2)]), [])
        self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
