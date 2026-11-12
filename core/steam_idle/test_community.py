"""Offline checks for the community reader, driven by a fake script run through the current interpreter."""
import sys
import tempfile
import unittest
from pathlib import Path

from steam_idle.community import CommunityError, GameDrops, OwnedGame, farmable, read_drops, read_library, read_status
from steam_idle.helper_support import force_kill, read_pids, wait_gone

FAKE = Path(__file__).with_name("fake_community.py")


class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"
        self.addCleanup(force_kill, self.pidfile)

    def fake(self, mode):
        return [sys.executable, "-S", "-X", "utf8", str(FAKE), mode, str(self.pidfile)]

    def assert_code(self, call, mode, code):
        with self.assertRaises(CommunityError) as caught:
            call(self.fake(mode))
        self.assertEqual(caught.exception.code, code)

    def test_drops_complete(self):
        self.assertEqual(read_drops(self.fake("ok")), [
            GameDrops(730, "Counter-Strike 2", 3, 1017.5),
            GameDrops(570, "Dota 2", 0, 0.0),
            GameDrops(440, "Team Fortress 2", 1, 12.0),
        ])

    def test_library_complete(self):
        self.assertEqual(read_library(self.fake("ok")), [
            OwnedGame(440, "Team Fortress 2", 720),
            OwnedGame(570, "Dota 2", 0),
        ])

    def test_empty_lists_are_valid(self):
        self.assertEqual(read_drops(self.fake("empty")), [])
        self.assertEqual(read_library(self.fake("empty")), [])

    def test_signed_out(self):
        self.assert_code(read_drops, "signed_out", "signed_out")
        self.assert_code(read_library, "signed_out", "signed_out")

    def test_failed_line_carries_the_helper_code(self):
        self.assert_code(read_drops, "failed", "failed:unparsed_row")
        self.assert_code(read_library, "failed", "failed:unparsed_row")

    def test_garbage_is_a_protocol_error(self):
        self.assert_code(read_drops, "garbage", "protocol")

    def test_two_lines_are_a_protocol_error(self):
        self.assert_code(read_drops, "twolines", "protocol")
        self.assert_code(read_library, "twolines", "protocol")

    def test_bool_is_not_an_int(self):
        self.assert_code(read_drops, "boolint", "protocol")
        self.assert_code(read_library, "boolint", "protocol")

    def test_duplicate_app_id_is_rejected(self):
        self.assert_code(read_drops, "dupe", "protocol")
        self.assert_code(read_library, "dupe", "protocol")

    def test_negative_number_is_rejected(self):
        self.assert_code(read_drops, "negative", "protocol")
        self.assert_code(read_library, "negative", "protocol")

    def test_complete_with_a_nonzero_exit_is_rejected(self):
        self.assert_code(read_drops, "badexit", "protocol")

    def test_missing_script_is_start_failed(self):
        with self.assertRaises(CommunityError) as caught:
            read_drops([str(Path(self.temp.name) / "no-such-program.exe")])
        self.assertEqual(caught.exception.code, "start_failed")

    def test_hang_times_out_and_the_tree_is_killed(self):
        with self.assertRaises(CommunityError) as caught:
            read_drops(self.fake("hang"), timeout=2.0)
        self.assertEqual(caught.exception.code, "timeout")
        self.assertTrue(self.pidfile.exists(), "the fake script never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])


class AccountMatchTests(unittest.TestCase):
    ID = "76561198000000001"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"

    def fake(self, mode):
        return [sys.executable, "-S", "-X", "utf8", str(FAKE), mode, str(self.pidfile)]

    def test_expected_id_is_passed_to_the_script(self):
        self.assertEqual(len(read_drops(self.fake("needs_expect"), expected_steam_id64=self.ID)), 3)
        self.assertEqual(len(read_library(self.fake("needs_expect"), expected_steam_id64=self.ID)), 2)
        read_status(self.fake("needs_expect"), expected_steam_id64=self.ID)

    def test_without_expected_id_no_argument_is_added(self):
        with self.assertRaises(CommunityError) as caught:
            read_drops(self.fake("needs_expect"))
        self.assertEqual(caught.exception.code, "failed:no_expect")

    def test_exit_five_is_account_mismatch(self):
        for call in (read_drops, read_library, read_status):
            with self.assertRaises(CommunityError) as caught:
                call(self.fake("mismatch"), expected_steam_id64=self.ID)
            self.assertEqual(caught.exception.code, "account_mismatch")

    def test_status_signed_in_and_signed_out(self):
        read_status(self.fake("ok"), expected_steam_id64=self.ID)
        with self.assertRaises(CommunityError) as caught:
            read_status(self.fake("signed_out"), expected_steam_id64=self.ID)
        self.assertEqual(caught.exception.code, "signed_out")

    def test_bad_expected_id_is_refused_before_running_anything(self):
        for bad in ("123", "", "7656119000000000x"):
            with self.assertRaises(CommunityError) as caught:
                read_drops(["no-such-program"], expected_steam_id64=bad)
            self.assertEqual(caught.exception.code, "invalid_steam_id")


class FarmableTests(unittest.TestCase):
    def test_only_positive_drops_fewest_first_then_app_id(self):
        drops = [
            GameDrops(5, "e", 0, 1.0),
            GameDrops(30, "c", 2, 1.0),
            GameDrops(10, "a", 1, 1.0),
            GameDrops(20, "b", 2, 1.0),
            GameDrops(2, "d", 1, 1.0),
        ]
        self.assertEqual([g.app_id for g in farmable(drops)], [2, 10, 20, 30])

    def test_empty(self):
        self.assertEqual(farmable([]), [])


if __name__ == "__main__":
    unittest.main()
