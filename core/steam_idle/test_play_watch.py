"""Offline checks for the decision logic that pauses the farm while the user plays a game of their own."""
import unittest

from steam_idle.play_watch import RESUME_AFTER_SECONDS, PlayWatch


class PlayWatchTests(unittest.TestCase):
    def setUp(self):
        self.watch = PlayWatch()

    def see(self, running, now, held=()):
        return self.watch.observe(running, frozenset(held), now)

    def test_nothing_running_does_nothing(self):
        self.assertIsNone(self.see(0, 0))
        self.assertIsNone(self.see(0, 60))
        self.assertIsNone(self.watch.paused)

    def test_one_sighting_is_not_enough_two_in_a_row_pause(self):
        self.assertIsNone(self.see(730, 0))
        self.assertEqual(self.see(730, 60), ("pause", 730))
        self.assertEqual(self.watch.paused, (730, 60))

    def test_a_game_the_farm_holds_is_never_a_user_game(self):
        for now in (0, 60, 120, 180):
            self.assertIsNone(self.see(570, now, held={570, 440}))
        self.assertIsNone(self.watch.paused)

    def test_a_changing_value_restarts_the_count(self):
        self.assertIsNone(self.see(730, 0))
        self.assertIsNone(self.see(440, 60))
        self.assertIsNone(self.see(730, 120))
        self.assertEqual(self.see(730, 180), ("pause", 730))

    def test_a_single_blip_between_zeros_never_pauses(self):
        self.assertIsNone(self.see(0, 0))
        self.assertIsNone(self.see(730, 60))
        self.assertIsNone(self.see(0, 120))
        self.assertIsNone(self.see(730, 180))
        self.assertIsNone(self.watch.paused)

    def test_resumes_after_two_minutes_without_a_user_game(self):
        self.see(730, 0)
        self.see(730, 60)
        self.assertIsNone(self.see(0, 120))
        self.assertIsNone(self.see(0, 120 + RESUME_AFTER_SECONDS - 1))
        self.assertEqual(self.see(0, 120 + RESUME_AFTER_SECONDS), ("resume", 730))
        self.assertIsNone(self.watch.paused)

    def test_the_game_coming_back_cancels_the_pending_resume(self):
        self.see(730, 0)
        self.see(730, 60)
        self.see(0, 120)
        self.assertIsNone(self.see(730, 180))
        self.assertIsNone(self.see(0, 240))
        self.assertIsNone(self.see(0, 240 + RESUME_AFTER_SECONDS - 1))
        self.assertEqual(self.see(0, 240 + RESUME_AFTER_SECONDS)[0], "resume")

    def test_a_different_user_game_while_paused_keeps_the_pause_and_updates_the_id(self):
        self.see(730, 0)
        self.see(730, 60)
        self.assertIsNone(self.see(440, 120))
        self.assertEqual(self.watch.paused[0], 440)

    def test_reset_forgets_an_own_pause_and_the_debounce(self):
        self.see(730, 0)
        self.see(730, 60)
        self.watch.reset()
        self.assertIsNone(self.watch.paused)
        self.assertIsNone(self.see(730, 120), "the count starts again")

    def test_can_pause_again_after_a_resume(self):
        self.see(730, 0)
        self.see(730, 60)
        self.see(0, 120)
        self.see(0, 120 + RESUME_AFTER_SECONDS)
        self.assertIsNone(self.see(440, 400))
        self.assertEqual(self.see(440, 460), ("pause", 440))

    def test_dismiss_ignores_the_same_game_until_it_closes_then_works_again(self):
        self.see(730, 0)
        self.see(730, 60)
        self.watch.dismiss()
        self.assertIsNone(self.watch.paused)
        for now in (120, 180, 240):
            self.assertIsNone(self.see(730, now), "the user resumed on purpose")
        self.assertIsNone(self.see(0, 300))
        self.assertIsNone(self.see(730, 360))
        self.assertEqual(self.see(730, 420), ("pause", 730))

    def test_dismiss_does_not_hide_a_different_game(self):
        self.see(730, 0)
        self.see(730, 60)
        self.watch.dismiss()
        self.assertIsNone(self.see(440, 120))
        self.assertEqual(self.see(440, 180), ("pause", 440))


if __name__ == "__main__":
    unittest.main()
