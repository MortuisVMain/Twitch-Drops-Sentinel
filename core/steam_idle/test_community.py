"""Offline checks for the community reader, driven by a fake script run through the current interpreter."""
import collections
import io
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from steam_idle import community
from steam_idle.community import (CommunityError, GameDrops, OwnedGame, farmable, kill_in_flight, read_drops,
                                  read_games, read_library, read_status)
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

    def test_a_huge_playtime_is_a_protocol_error_not_an_overflow(self):
        entry = {"appId": 1, "name": "G", "dropsRemaining": 1, "playtimeHours": 10 ** 400}
        with self.assertRaises(CommunityError) as caught:
            community._games({"games": [entry]}, community._drops_entry)
        self.assertEqual(caught.exception.code, "protocol")

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

    def test_failed_read_logs_the_script_stderr_tail_without_secrets(self):
        with self.assertLogs("steam_idle.community", level="WARNING") as logged:
            self.assert_code(read_drops, "noisy", "failed:unparsed_row")
        warnings = [r.getMessage() for r in logged.records if r.levelname == "WARNING"]
        self.assertEqual(len(warnings), 1, warnings)
        text = warnings[0]
        self.assertIn("drops", text)
        self.assertIn("exit 4", text)
        self.assertIn("failed:unparsed_row", text)
        self.assertIn("diag line 30", text)
        self.assertNotIn("diag line 1\n", text + "\n")
        self.assertNotIn("diag line 10\n", text + "\n")  # older than the last ~20 lines
        for secret in ("SECRETVALUE123", "abcDEF0123456789", "TOKENVALUE987", "76561198000000000"):
            self.assertNotIn(secret, text)
        self.assertLessEqual(len(text.encode("utf-8")), 4096 + 300)  # tail cap plus the fixed prefix

    def test_scrub_hides_every_secret_shape(self):
        samples = {
            '"sessionid":"abc123DEF456ghi"': "abc123DEF456ghi",
            "{ name: 'sessionid', value: 'ZZsecretvalue99' }": "ZZsecretvalue99",
            "{ name: 'steamLoginSecure', value: 'JWTpart%7C%7Cmore' }": "JWTpart",
            "Cookie: a=1; steamLoginSecure=XYZ789; b=2": "XYZ789",
            "set-cookie: sessionid=QQQ555; Path=/; HttpOnly": "QQQ555",
            "Cookie: theme=dark; lang=ru": "theme=dark",
            "failed for deadbeefdeadbeefdeadbeef01 now": "deadbeefdeadbeefdeadbeef01",
            "user 76561198012345678 refused": "76561198012345678",
            "id76561198012345678x": "76561198012345678",
            "profile [U:1:52079950] refused": "52079950",
            "accountid=52079950 mismatch": "52079950",
            "steam id 52079950 mismatch": "52079950",
            "Authorization: Bearer TOK12345": "TOK12345",
            "password: 'hunter2hunter2'": "hunter2hunter2",
        }
        for line, secret in samples.items():
            with self.subTest(line=line):
                scrubbed = community._scrub(line)
                self.assertNotIn(secret, scrubbed)
                self.assertLessEqual(len(scrubbed), 200)

    def test_scrub_runs_before_the_line_is_cut(self):
        line = "x" * 190 + " sessionid=SECRETTAILVALUE99"
        self.assertNotIn("SECRETTAIL", community._scrub(line))
        self.assertNotIn("SECRETTAIL", community._scrub(" " * 150 + "token=SECRETTAILVALUE99"))

    def test_a_secret_split_by_a_long_line_never_reaches_the_tail(self):
        stream = io.StringIO("a" * 70000 + " sessionid=SPLITSECRET123\nlast line\n")
        tail = collections.deque(maxlen=20)
        community._read_stderr(stream, tail)
        self.assertNotIn("SPLITSECRET", "\n".join(tail))
        self.assertEqual(tail[-1], "last line")
        self.assertLessEqual(max(len(line) for line in tail), 200)

    def test_a_stderr_reader_that_does_not_end_leaves_the_pipe_open(self):
        gate, procs = threading.Event(), []
        real_spawn = community.spawn

        def spy(*args, **kwargs):
            procs.append(real_spawn(*args, **kwargs))
            return procs[-1]

        with mock.patch.object(community, "spawn", spy), mock.patch.object(community, "_read_stderr", lambda s, t: gate.wait(10)):
            with self.assertLogs("steam_idle.community", level="WARNING") as logged:
                read_drops(self.fake("ok"))
        try:
            self.assertFalse(procs[0].stderr.closed)
            self.assertTrue(any("still running" in line for line in logged.output), logged.output)
        finally:
            gate.set()
            procs[0].stderr.close()

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


    def test_kill_in_flight_ends_a_running_read_and_its_tree(self):
        outcome = []

        def run():
            try:
                read_drops(self.fake("hang"), timeout=60.0)
            except CommunityError as error:
                outcome.append(error.code)

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        for _ in range(100):
            if self.pidfile.exists() and self.pidfile.read_text().strip().count(" ") == 1:
                break
            time.sleep(0.05)
        self.assertTrue(self.pidfile.exists(), "the fake script never reached its sleep")
        kill_in_flight()
        worker.join(15)
        self.assertFalse(worker.is_alive(), "the read kept running after kill_in_flight")
        self.assertEqual(len(outcome), 1)
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])

    def test_kill_in_flight_without_a_read_is_harmless(self):
        kill_in_flight()


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


class ReadGamesTests(unittest.TestCase):
    ID = "76561198000000000"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"
        self.addCleanup(force_kill, self.pidfile)

    def fake(self, mode):
        return [sys.executable, "-S", "-X", "utf8", str(FAKE), mode, str(self.pidfile)]

    def test_returns_the_requested_games_in_request_order(self):
        self.assertEqual(read_games(self.fake("ok"), [440, 730]), [
            GameDrops(440, "Team Fortress 2", 1, 12.0),
            GameDrops(730, "Counter-Strike 2", 3, 1017.5),
        ])

    def test_a_repeated_id_is_asked_once(self):
        self.assertEqual([g.app_id for g in read_games(self.fake("ok"), [440, 440, 730])], [440, 730])

    def test_no_ids_runs_nothing(self):
        self.assertEqual(read_games(["no-such-program"], []), [])

    def test_the_script_failure_code_is_kept(self):
        with self.assertRaises(CommunityError) as caught:
            read_games(self.fake("ok"), [999])
        self.assertEqual(caught.exception.code, "failed:gamecards_unparsed")

    def test_signed_out_and_mismatch_use_the_same_codes_as_drops(self):
        for mode, code in (("signed_out", "signed_out"), ("mismatch", "account_mismatch")):
            with self.assertRaises(CommunityError) as caught:
                read_games(self.fake(mode), [730], expected_steam_id64=self.ID)
            self.assertEqual(caught.exception.code, code)

    def test_expected_id_is_passed_after_the_app_ids(self):
        self.assertEqual(len(read_games(self.fake("needs_expect"), [730, 440], expected_steam_id64=self.ID)), 2)

    def test_an_answer_for_other_games_than_asked_is_a_protocol_error(self):
        with self.assertRaises(CommunityError) as caught:
            read_games(self.fake("wrongids"), [730, 440])
        self.assertEqual(caught.exception.code, "protocol")

    def test_a_bad_expected_id_is_refused_before_running_anything(self):
        with self.assertRaises(CommunityError) as caught:
            read_games(["no-such-program"], [730], expected_steam_id64="123")
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
