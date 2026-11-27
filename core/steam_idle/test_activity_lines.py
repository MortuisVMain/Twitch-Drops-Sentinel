"""The INFO lines the farm, the hours phase and the achievements queue write for the activity console."""
import logging
import unittest
from unittest import mock

from steam_idle import community, presence
from steam_idle.achievement_queue import GamePlan
from steam_idle.farm import FarmRules
from steam_idle.test_achievement_queue import Env, missing
from steam_idle.test_batch import BatchHarness, gp, three
from steam_idle.test_farm import Harness, gd


class Capture:
    """Collects the steam_idle records of a block as (level name, text)."""

    def __enter__(self):
        self.records = []
        self._handler = logging.Handler(logging.INFO)
        self._handler.emit = self.records.append
        self._logger = logging.getLogger("steam_idle")
        self._level = self._logger.level
        self._logger.setLevel(logging.INFO)
        self._logger.addHandler(self._handler)
        return self

    def __exit__(self, *exc):
        self._logger.removeHandler(self._handler)
        self._logger.setLevel(self._level)

    @property
    def lines(self):
        return [(r.levelname, r.getMessage()) for r in self.records]

    @property
    def texts(self):
        return [text for _, text in self.lines]


class FarmLineTests(unittest.TestCase):
    def test_start_scan_and_hold_are_logged(self):
        h = Harness([[gd(10, 1), gd(20, 2)]])
        with Capture() as cap:
            h.begin()
        self.assertEqual(cap.texts, ["Farm run started", "Scan: 2 games with drops, 0 refund-held",
                                     "Idling Game 10 (10), 1 drops left"])

    def test_recheck_logs_only_changes_and_the_finish(self):
        h = Harness([[gd(10, 3)], [gd(10, 2)], [gd(10, 2)], [gd(10, 0)]])
        h.begin()
        with Capture() as cap:
            h.tick(600)
            first = list(cap.texts)
            h.tick(600)
            second = list(cap.texts)
            h.tick(600)
        self.assertEqual(first, ["Game 10: drops 3 -> 2"])
        self.assertEqual(second, first, "an unchanged read writes nothing")
        self.assertIn("Game done: Game 10 (10)", cap.texts)

    def test_command_transitions_are_logged(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        with Capture() as cap:
            h.do(h.farm.pause)
            h.do(h.farm.resume)
            h.step()
            h.do(h.farm.set_suspended, True)
            h.do(h.farm.set_suspended, False)
            h.step()
            h.do(h.farm.stop)
        for text in ("Farm paused", "Farm resumed", "Farm suspended", "Farm no longer suspended", "Farm run stopped"):
            self.assertIn(text, cap.texts)

    def test_a_game_that_fails_to_start_is_a_warning_with_the_reason(self):
        h = Harness([[gd(10, 1)]], start_fail={10: ["start_timeout"]})
        with Capture() as cap:
            h.begin()
        self.assertIn(("WARNING", "Game failed: Game 10 (10): start_timeout"), cap.lines)

    def test_a_lost_presence_is_logged_before_the_restart(self):
        h = Harness([[gd(10, 1)]])
        h.dead_starts = 1
        h.begin()
        with Capture() as cap:
            h.step()
        self.assertIn(("WARNING", "Presence for Game 10 lost, restarting"), cap.lines)

    def test_skip_is_logged(self):
        h = Harness([[gd(10, 1), gd(20, 2)]])
        h.begin()
        with Capture() as cap:
            h.do(h.farm.skip_current)
        self.assertIn("Skipped Game 10 (10)", cap.texts)


class HoursPhaseLineTests(unittest.TestCase):
    def test_phase_start_joins_playtime_changes_leaves_and_end(self):
        h = BatchHarness([three(0.5), [gp(30, 3, 0.9), gp(10, 1, 3.2), gp(20, 2, 0.5)], [gp(30, 3, 0.9), gp(20, 2, 3.5)]])
        with Capture() as cap:
            h.up(3)
        self.assertIn("Collecting playtime for 3 games, threshold 3.0 h", cap.texts)
        self.assertEqual(sum(t.endswith("joined the playtime batch") for t in cap.texts), 3)
        with Capture() as cap:
            h.tick(600)
        self.assertIn("Game 30: 0.5 h -> 0.9 h", cap.texts)
        self.assertIn("Game 10: 0.5 h -> 3.2 h", cap.texts)
        self.assertNotIn("Game 20: 0.5 h -> 0.5 h", cap.texts)
        self.assertIn("Game 10 left the playtime batch (3.2 h)", cap.texts)
        with Capture() as cap:
            h.tick(600)
        self.assertIn("Playtime phase finished", cap.texts)


class AchievementLineTests(unittest.TestCase):
    def test_run_unlocks_and_finish_are_logged(self):
        env = Env({7: missing(3)})
        with Capture() as cap:
            env.start(GamePlan(7, "Seven"))
            env.run()
        self.assertEqual(cap.texts, ["Achievements run started: game Seven (7)", "Unlocked 3 achievements in Seven (7)",
                                     "Achievements finished: Seven (7), 3 unlocked, 0 skipped, 0 failed",
                                     "Achievements run finished: 3 unlocked"])

    def test_an_anti_cheat_game_is_skipped_with_a_visible_reason(self):
        env = Env({7: missing(1)}, verdicts={7: "protected"})
        with Capture() as cap:
            env.start(GamePlan(7, "Seven"))
            env.run()
        self.assertIn(("WARNING", "Skipped Seven (7): anti-cheat protected"), cap.lines)

    def test_stop_is_logged(self):
        env = Env({7: missing(1)})
        env.start(GamePlan(7, "Seven"))
        env.step()
        with Capture() as cap:
            env.stop()
            env.step()
        self.assertIn("Achievements run stopped", cap.texts)


class SourceMessageTests(unittest.TestCase):
    PATH_ERROR = OSError(2, "The system cannot find the file specified", "C:/Users/someone/helper.exe")

    def test_a_failed_helper_start_does_not_put_the_file_path_in_the_message(self):
        for module, call in ((presence, lambda: presence.Presence().start(["x"], "76561198000000042", 730)),
                             (community, lambda: community._run(["x"], "read", 1.0))):
            with mock.patch.object(module, "spawn", side_effect=self.PATH_ERROR), Capture() as cap:
                with self.assertRaises(Exception):
                    call()
            self.assertTrue(cap.texts, module.__name__)
            self.assertFalse(any("someone" in text for text in cap.texts), cap.texts)


if __name__ == "__main__":
    unittest.main()
