"""Offline checks for the hold controller, driven by the fake helper process."""
import tempfile
import unittest
from pathlib import Path

from steam_idle.helper_support import fake_command, force_kill, read_pids, wait_gone
from steam_idle.presence import Presence, PresenceError

STEAM_ID = str(0x0110000100000000 + 42)


class PresenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"
        self.addCleanup(force_kill, self.pidfile)
        self.presence = Presence()
        self.addCleanup(self.presence.stop)

    def start(self, mode, timeout=10.0, app_id=730):
        self.presence.start(fake_command(mode, self.pidfile), STEAM_ID, app_id, timeout=timeout)

    def assert_tree_gone(self):
        self.assertTrue(self.pidfile.exists(), "the fake helper never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])

    def test_happy_path_hold_and_release(self):
        self.assertFalse(self.presence.is_running())
        self.start("ok")
        self.assertTrue(self.presence.is_running())
        self.presence.stop()
        self.assertFalse(self.presence.is_running())

    def test_context_manager_stops_the_helper(self):
        with Presence() as presence:
            presence.start(fake_command("ok", self.pidfile), STEAM_ID, 730)
            self.assertTrue(presence.is_running())
        self.assertFalse(presence.is_running())

    def test_failed_line_reports_the_helper_error_code(self):
        with self.assertRaises(PresenceError) as caught:
            self.start("failed")
        self.assertEqual(caught.exception.code, "not_subscribed")
        self.assertIn("not_subscribed", str(caught.exception))
        self.assertFalse(self.presence.is_running())

    def test_garbage_output_kills_the_tree(self):
        with self.assertRaises(PresenceError):
            self.start("garbage", timeout=5.0)
        self.assert_tree_gone()
        self.assertFalse(self.presence.is_running())

    def test_wrong_app_id_is_rejected(self):
        with self.assertRaises(PresenceError):
            self.start("wrongapp")
        self.assertFalse(self.presence.is_running())

    def test_helper_exiting_early_is_an_error_with_its_return_code(self):
        with self.assertRaises(PresenceError) as caught:
            self.start("early")
        self.assertIn("rc=2", str(caught.exception))
        self.assertFalse(self.presence.is_running())

    def test_helper_hanging_before_holding_times_out_and_is_killed(self):
        with self.assertRaises(PresenceError) as caught:
            self.start("hang", timeout=3.0)
        self.assertEqual(caught.exception.code, "timeout")
        self.assert_tree_gone()
        self.assertFalse(self.presence.is_running())

    def test_stop_when_helper_ignores_stop_kills_the_tree(self):
        self.start("ignorestop")
        with self.assertRaises(PresenceError) as caught:
            self.presence.stop(timeout=1.5)
        self.assertEqual(caught.exception.code, "stop_timeout")
        self.assert_tree_gone()
        self.assertFalse(self.presence.is_running())

    def test_double_start_raises_and_keeps_the_first_helper(self):
        self.start("ok")
        with self.assertRaises(PresenceError):
            self.start("ok")
        self.assertTrue(self.presence.is_running())

    def test_stop_is_idempotent(self):
        self.presence.stop()
        self.start("ok")
        self.presence.stop()
        self.presence.stop()
        self.assertFalse(self.presence.is_running())

    def test_arguments_are_validated_before_any_process_starts(self):
        helper = fake_command("ok", self.pidfile)
        for steam_id, app_id in [("42", 730), (STEAM_ID + "0", 730), (STEAM_ID, 0), (STEAM_ID, 2**32),
                                 (STEAM_ID, True), (STEAM_ID, "730")]:
            with self.subTest(steam_id=steam_id, app_id=app_id), self.assertRaises(PresenceError):
                self.presence.start(helper, steam_id, app_id)
        self.presence.start(helper, STEAM_ID, 2**32 - 1)
        self.assertTrue(self.presence.is_running())

    def test_restart_after_stop_works(self):
        self.start("ok")
        self.presence.stop()
        self.start("ok")
        self.assertTrue(self.presence.is_running())
