"""Offline checks for the achievements reader, driven by a fake helper script run through the current interpreter."""
import os
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

from steam_idle import _helper
from steam_idle.achievements import (Achievement, AchievementsError, UnlockResult, read_achievements,
                                     unlock_achievements)
from steam_idle.helper_support import force_kill, read_pids, wait_gone

STEAM_ID = "76561198000000001"
APP_ID = 10

# argv: <mode> <pidfile> achievements <steamid64> <appid>. Prints what a real helper would, or a defect named by the mode.
FAKE = textwrap.dedent('''
    import json, os, subprocess, sys, time
    mode, pidfile, app = sys.argv[1], sys.argv[2], int(sys.argv[5])
    assert sys.argv[3:5] == ["achievements", "76561198000000001"], sys.argv


    def item(api="ACH_ONE", name="One", description="First", hidden=False, achieved=True, unlock=1700000000):
        return {"protocolVersion": 2, "apiName": api, "name": name, "description": description, "hidden": hidden,
                "achieved": achieved, "unlockTime": unlock}


    def end(count, app_id=app):
        return {"protocolVersion": 2, "status": "complete", "appId": app_id, "count": count}


    def out(*values, ascii_only=True):
        for value in values:
            print(value if isinstance(value, str) else json.dumps(value, ensure_ascii=ascii_only), flush=True)


    def sleep_with_child():
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
        with open(pidfile, "w") as handle:
            handle.write(f"{child.pid}")
        time.sleep(300)


    two = [item(), item("ACH_TWO", "Two", "Second", True, False, 0)]
    MUTATIONS = {
        "version": lambda d: d.update(protocolVersion=1),
        "extra_key": lambda d: d.update(x=1),
        "missing_key": lambda d: d.pop("hidden"),
        "api_int": lambda d: d.update(apiName=1),
        "api_empty": lambda d: d.update(apiName=""),
        "api_tab": lambda d: d.update(apiName="A\\tB"),
        "api_nul": lambda d: d.update(apiName="A\\u0000B"),
        "api_del": lambda d: d.update(apiName="A\\u007fB"),
        "api_lone_surrogate": lambda d: d.update(apiName="A\\ud800"),
        "api_replacement_char": lambda d: d.update(apiName="A\\ufffd"),
        "api_long": lambda d: d.update(apiName="A" * 257),
        "api_long_cjk": lambda d: d.update(apiName="\\u65e5" * 86),
        "name_null": lambda d: d.update(name=None),
        "name_long": lambda d: d.update(name="x" * 513),
        "desc_int": lambda d: d.update(description=5),
        "desc_long": lambda d: d.update(description="x" * 2049),
        "hidden_str": lambda d: d.update(hidden="false"),
        "hidden_int": lambda d: d.update(hidden=0),
        "achieved_int": lambda d: d.update(achieved=1),
        "unlock_str": lambda d: d.update(unlockTime="1"),
        "unlock_neg": lambda d: d.update(unlockTime=-1),
        "unlock_float": lambda d: d.update(unlockTime=1.5),
        "unlock_big": lambda d: d.update(unlockTime=2 ** 32),
        "unlock_bool": lambda d: d.update(unlockTime=True),
        "locked_with_time": lambda d: d.update(achieved=False),
    }

    if mode == "ok":
        out(*two, end(2))
    elif mode == "unicode":
        out(item("ACH_U", "\\u041e\\u0434\\u0438\\u043d \\U0001F600", "Caf\\u00e9 \\u2603"), end(1), ascii_only=False)
    elif mode == "nonascii_api":
        out(item("Caf\\u00e9"), item("\\u65e5\\u672c" * 42 + "\\u65e5", "J"), item("A" * 256, "L"), item("\\U0001F600", "E"), end(4))
    elif mode == "at_limits":
        out(item(name="n" * 512, description="d" * 2048), end(1))
    elif mode == "empty":
        out(end(0))
    elif mode == "failed":
        out({"protocolVersion": 2, "status": "failed", "error": "stats_unavailable"})
        sys.exit(4)
    elif mode == "failed_bad_code":
        out({"protocolVersion": 2, "status": "failed", "error": "Bad Code!"})
        sys.exit(4)
    elif mode == "failed_extra_key":
        out({"protocolVersion": 2, "status": "failed", "error": "x", "y": 1})
        sys.exit(4)
    elif mode == "failed_after_item":
        out(item(), {"protocolVersion": 2, "status": "failed", "error": "stats_unavailable"})
        sys.exit(4)
    elif mode == "env":  # names whether the write gate reached this child
        gate = "set" if "SENTINEL_STEAM_IDLE_ALLOW_WRITE" in os.environ else "unset"
        out({"protocolVersion": 2, "status": "failed", "error": "gate_" + gate})
        sys.exit(4)
    elif mode == "garbage":
        out("not json")
    elif mode == "array":
        out("[1]", end(0))
    elif mode == "duplicate_key":
        out('{"protocolVersion":2,"protocolVersion":2,"status":"complete","appId":10,"count":0}')
    elif mode == "count_plus":
        out(*two, end(3))
    elif mode == "count_minus":
        out(*two, end(1))
    elif mode == "count_bool":
        out(*two, end(True))
    elif mode == "wrong_app":
        out(*two, end(2, app + 1))
    elif mode == "end_extra_key":
        out(*two, {**end(2), "x": 1})
    elif mode == "after_complete":
        out(*two, end(2), item("ACH_LATE"))
    elif mode == "garbage_after_complete":
        out(*two, end(2), "stray")
    elif mode == "complete_first":
        out(end(0), item())
    elif mode == "no_complete":
        out(*two)
    elif mode == "nothing":
        pass
    elif mode == "duplicate_api":
        out(item(), item(), end(2))
    elif mode == "too_many":
        out(*(item(f"A{i}") for i in range(10001)), end(10001))
    elif mode == "ten_thousand":
        out(*(item(f"A{i}") for i in range(10000)), end(10000))
    elif mode == "long_line":
        out("x" * 30000)
    elif mode == "bad_exit":
        out(*two, end(2))
        sys.exit(3)
    elif mode == "hang":
        sleep_with_child()
    elif mode.startswith("mut_"):
        first = item()
        MUTATIONS[mode[4:]](first)
        out(first, end(1))
    else:
        sys.exit(64)
''')


class AchievementsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"
        self.script = Path(self.temp.name) / "fake_achievements.py"
        self.script.write_text(FAKE, encoding="utf-8")
        self.addCleanup(force_kill, self.pidfile)

    def fake(self, mode):
        return [sys.executable, "-S", "-X", "utf8", str(self.script), mode, str(self.pidfile)]

    def read(self, mode, **kwargs):
        return read_achievements(self.fake(mode), STEAM_ID, APP_ID, **kwargs)

    def assert_code(self, mode, code, **kwargs):
        with self.assertRaises(AchievementsError, msg=mode) as caught:
            self.read(mode, **kwargs)
        self.assertEqual(caught.exception.code, code, mode)

    def test_complete_list_in_api_order(self):
        self.assertEqual(self.read("ok"), [
            Achievement("ACH_ONE", "One", "First", False, True, 1700000000),
            Achievement("ACH_TWO", "Two", "Second", True, False, 0),
        ])

    def test_utf8_text_survives(self):
        self.assertEqual(self.read("unicode"), [
            Achievement("ACH_U", "Один \U0001F600", "Café ☃", False, True, 1700000000)])

    def test_non_ascii_api_names_are_accepted_up_to_256_bytes(self):
        names = [item.api_name for item in self.read("nonascii_api")]
        self.assertEqual(names, ["Café", "日本" * 42 + "日", "A" * 256, "\U0001F600"])
        self.assertEqual(len(names[1].encode("utf-8")), 255)

    def test_strings_at_the_limit_are_accepted(self):
        item, = self.read("at_limits")
        self.assertEqual((len(item.name), len(item.description)), (512, 2048))

    def test_empty_list_is_valid(self):
        self.assertEqual(self.read("empty"), [])

    def test_ten_thousand_are_valid_and_one_more_is_not(self):
        self.assertEqual(len(self.read("ten_thousand")), 10000)
        self.assert_code("too_many", "protocol")

    def test_failed_line_carries_the_helper_code(self):
        self.assert_code("failed", "stats_unavailable")

    def test_malformed_failed_lines_are_protocol_errors(self):
        run_parallel(lambda mode: self.assert_code(mode, "protocol"), ("failed_bad_code", "failed_extra_key", "failed_after_item"))

    def test_garbage_is_a_protocol_error(self):
        run_parallel(lambda mode: self.assert_code(mode, "protocol"),
                     ("garbage", "array", "duplicate_key", "long_line", "nothing"))

    def test_wrong_types_and_values_are_protocol_errors(self):
        run_parallel(lambda name: self.assert_code("mut_" + name, "protocol"),
                     ("version", "extra_key", "missing_key", "api_int", "api_empty", "api_tab", "api_nul", "api_del",
                      "api_lone_surrogate", "api_replacement_char", "api_long", "api_long_cjk",
                      "name_null", "name_long", "desc_int", "desc_long", "hidden_str", "hidden_int", "achieved_int",
                      "unlock_str", "unlock_neg", "unlock_float", "unlock_big", "unlock_bool", "locked_with_time"))

    def test_bad_complete_line_is_a_protocol_error(self):
        run_parallel(lambda mode: self.assert_code(mode, "protocol"),
                     ("count_plus", "count_minus", "count_bool", "wrong_app", "end_extra_key", "no_complete", "complete_first"))

    def test_nothing_may_follow_the_complete_line(self):
        run_parallel(lambda mode: self.assert_code(mode, "protocol"), ("after_complete", "garbage_after_complete"))

    def test_a_close_that_fails_does_not_replace_the_result(self):
        real_popen = subprocess.Popen

        def popen(*args, **kwargs):
            proc = real_popen(*args, **kwargs)
            if proc.stdin is None:  # taskkill, started through the same patched Popen
                return proc
            real_close = proc.stdin.close

            def failing_close():
                real_close()
                raise OSError("broken pipe on close")

            proc.stdin = mock.Mock(close=failing_close)
            return proc

        with mock.patch("subprocess.Popen", popen):
            self.assertEqual(len(self.read("ok")), 2)
            self.assert_code("failed", "stats_unavailable")

    def test_the_write_gate_never_reaches_a_read_child(self):
        with mock.patch.dict(os.environ, {GATE: "1"}):
            self.assert_code("env", "gate_unset")
            self.assertEqual(os.environ[GATE], "1")

    def test_duplicate_api_name_is_rejected(self):
        self.assert_code("duplicate_api", "protocol")

    def test_complete_with_a_nonzero_exit_is_rejected(self):
        self.assert_code("bad_exit", "protocol")

    def test_missing_helper_is_start_failed(self):
        with self.assertRaises(AchievementsError) as caught:
            read_achievements(str(Path(self.temp.name) / "no-such-helper.exe"), STEAM_ID, APP_ID)
        self.assertEqual(caught.exception.code, "start_failed")

    def test_invalid_arguments_are_refused_before_running_anything(self):
        for steam_id, app_id, code in (("123", APP_ID, "invalid_steam_id"), ("", APP_ID, "invalid_steam_id"),
                                       (STEAM_ID, 0, "invalid_app_id"), (STEAM_ID, True, "invalid_app_id"),
                                       (STEAM_ID, "10", "invalid_app_id"), (STEAM_ID, 2 ** 32, "invalid_app_id")):
            with self.assertRaises(AchievementsError) as caught:
                read_achievements(["no-such-program"], steam_id, app_id)
            self.assertEqual(caught.exception.code, code)

    def test_hang_times_out_and_the_tree_is_killed(self):
        self.assert_code("hang", "timeout", timeout=HANG_TIMEOUT)  # generous: a slow interpreter start must not decide
        self.assertTrue(self.pidfile.exists(), "the fake helper never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])


class KillInFlightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"
        self.script = Path(self.temp.name) / "fake_achievements.py"
        self.script.write_text(FAKE, encoding="utf-8")
        self.addCleanup(force_kill, self.pidfile)

    def fake(self, mode):
        return [sys.executable, "-S", "-X", "utf8", str(self.script), mode, str(self.pidfile)]

    def test_kill_in_flight_ends_a_blocked_read_and_forgets_it(self):
        from steam_idle import achievements as module
        codes = []

        def blocked_read():
            try:
                read_achievements(self.fake("hang"), STEAM_ID, APP_ID, timeout=30)
            except AchievementsError as error:
                codes.append(error.code)

        worker = threading.Thread(target=blocked_read)
        worker.start()
        deadline = time.monotonic() + 10
        while not module._LIVE_READS and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(module._LIVE_READS, "the read never started")
        module.kill_in_flight()
        worker.join(15)
        self.assertFalse(worker.is_alive())
        self.assertEqual(codes, ["protocol"])
        self.assertEqual(module._LIVE_READS, set())


class SpawnEnvironmentTests(unittest.TestCase):
    PROBE = "import os; print('set' if 'SENTINEL_STEAM_IDLE_ALLOW_WRITE' in os.environ else 'unset')"

    def child_sees(self, **kwargs):
        proc = _helper.spawn([sys.executable, "-S", "-X", "utf8", "-c", self.PROBE], **kwargs)
        try:
            return proc.stdout.readline().strip()
        finally:
            _helper.kill_tree(proc)
            proc.stdin.close()
            proc.stdout.close()

    def test_the_default_strips_the_write_gate_and_leaves_os_environ_alone(self):
        with mock.patch.dict(os.environ, {GATE: "1"}):
            self.assertEqual(self.child_sees(), "unset")
            self.assertEqual(os.environ[GATE], "1")
        with mock.patch.dict(os.environ):
            os.environ.pop(GATE, None)
            self.assertEqual(self.child_sees(), "unset")

    def test_an_explicit_env_is_passed_as_given(self):
        with mock.patch.dict(os.environ):
            os.environ.pop(GATE, None)
            self.assertEqual(self.child_sees(env={**_helper.child_env(), GATE: "1"}), "set")
            self.assertNotIn(GATE, os.environ)


def run_parallel(function, items):
    """Each item is its own helper process; running them side by side keeps the module fast."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(function, items))  # re-raises the first failure


UNLOCK_HELPER = Path(__file__).with_name("fake_unlock_helper.py")
GATE = "SENTINEL_STEAM_IDLE_ALLOW_WRITE"
HANG_TIMEOUT = 4.0


class UnlockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.pidfile = Path(self.temp.name) / "pids.txt"
        self.addCleanup(force_kill, self.pidfile)
        floor = mock.patch("steam_idle.achievements.MIN_UNLOCK_TIMEOUT", 1.0)  # the real floor is tested on its own
        floor.start()
        self.addCleanup(floor.stop)

    def fake(self, mode):
        return [sys.executable, "-S", "-X", "utf8", str(UNLOCK_HELPER), mode, str(self.pidfile)]

    def unlock(self, mode, names=("A", "B", "C", "D"), **kwargs):
        return unlock_achievements(self.fake(mode), STEAM_ID, APP_ID, list(names), **kwargs)

    def failure(self, mode, names=("A", "B", "C", "D"), **kwargs) -> AchievementsError:
        with self.assertRaises(AchievementsError, msg=mode) as caught:
            self.unlock(mode, names, **kwargs)
        return caught.exception

    def assert_error(self, mode, code, wrote, names=("A", "B", "C", "D"), **kwargs):
        error = self.failure(mode, names, **kwargs)
        self.assertEqual((error.code, error.wrote), (code, wrote), mode)

    def test_results_come_back_in_input_order_with_the_store_state(self):
        outcome = self.unlock("ok")
        self.assertEqual(outcome.results, [UnlockResult("A", "unlocked"), UnlockResult("B", "already"),
                                           UnlockResult("C", "unknown"), UnlockResult("D", "unconfirmed")])
        self.assertEqual(outcome.stored, "yes")

    def test_every_consistent_outcome_is_accepted(self):
        def check(combo):
            stored, result = combo
            outcome = self.unlock(f"combo:{stored}:{result}", ("A", "B"))
            self.assertEqual((outcome.stored, [item.result for item in outcome.results]), (stored, [result] * 2), combo)

        run_parallel(check, (("not_needed", "already"), ("not_needed", "unknown"), ("not_needed", "rejected"),
                             ("yes", "unlocked"), ("yes", "unconfirmed"), ("timeout", "pending"),
                             ("timeout", "unconfirmed"), ("no", "store_failed"), ("no", "pending"),
                             ("no", "unconfirmed")))

    def test_impossible_combinations_are_protocol_errors_and_uncertain(self):
        run_parallel(lambda combo: self.assert_error("combo:%s:%s" % combo, "protocol", True, names=("A", "B")),
                     (("yes", "pending"), ("yes", "store_failed"), ("yes", "already"), ("timeout", "unlocked"),
                      ("timeout", "store_failed"), ("timeout", "already"), ("no", "unlocked"), ("no", "already"),
                      ("not_needed", "unlocked"), ("not_needed", "pending"), ("not_needed", "unconfirmed"),
                      ("not_needed", "store_failed")))

    def test_changed_and_uncertain_follow_the_results_and_the_store_state(self):
        def check(row):
            mode, stored, changed, uncertain = row
            outcome = self.unlock(mode)
            self.assertEqual((outcome.stored, outcome.changed, outcome.uncertain), (stored, changed, uncertain), mode)

        run_parallel(check, (
            ("ok", "yes", True, True), ("all_unlocked", "yes", True, False),
            ("combo:not_needed:already", "not_needed", False, False),
            ("combo:not_needed:unknown", "not_needed", False, False),
            ("combo:not_needed:rejected", "not_needed", False, False),
            ("combo:timeout:pending", "timeout", True, True), ("combo:timeout:unconfirmed", "timeout", True, True),
            ("combo:no:store_failed", "no", True, True), ("combo:no:pending", "no", True, True)))

    def test_names_travel_as_utf8_lines(self):
        names = ["ACH_1", "Café", "日本", "\U0001F600", "with space", "A" * 256]
        self.unlock("echo", names)
        captured = Path(str(self.pidfile) + ".stdin")
        self.assertEqual(captured.read_bytes(), ("\n".join(names) + "\n").encode("utf-8"))

    def test_names_with_leading_and_trailing_spaces_are_passed_byte_exact(self):
        names = ["  lead", "trail  ", " both ", "mid dle"]
        outcome = self.unlock("echo", names)
        self.assertEqual(Path(str(self.pidfile) + ".stdin").read_bytes(), ("\n".join(names) + "\n").encode("utf-8"))
        self.assertEqual([item.api_name for item in outcome.results], names)

    def test_the_write_gate_is_set_for_the_child_only(self):
        with mock.patch.dict(os.environ, {GATE: "0"}):
            self.assert_error("env", "gate_1", False)
            self.assertEqual(os.environ[GATE], "0")
        with mock.patch.dict(os.environ):
            os.environ.pop(GATE, None)
            self.assert_error("env", "gate_1", False)
            self.assertNotIn(GATE, os.environ)

    def test_helper_that_exits_before_reading_stdin_still_gives_its_failure(self):
        real_popen, real_start, started = subprocess.Popen, threading.Thread.start, []

        def popen(*args, **kwargs):
            started.append(real_popen(*args, **kwargs))
            return started[-1]

        def start_after_the_helper_exited(thread):  # the parent is late: the pipe is already broken
            started[-1].wait(timeout=30)
            real_start(thread)

        with mock.patch("subprocess.Popen", popen), mock.patch.object(threading.Thread, "start", start_after_the_helper_exited):
            self.assert_error("exit_early", "write_not_allowed", False)

    def test_helper_failure_before_a_write_is_not_a_write(self):
        self.assert_error("failed", "stats_unavailable", False)
        self.assert_error("failed_exit_2", "invalid_name_list", False)

    def test_a_failed_line_is_trusted_only_with_a_pre_write_exit_code(self):
        for mode in ("failed_exit_0", "failed_exit_1", "failed_exit_3"):
            self.assert_error(mode, "stats_unavailable", True)

    def test_helper_failure_after_a_write_says_so(self):
        self.assert_error("failed_wrote", "worker_failed", True)

    def test_malformed_failure_lines_are_protocol_errors_and_uncertain(self):
        run_parallel(lambda mode: self.assert_error(mode, "protocol", True),
                     ("failed_wrote_false", "failed_bad_code", "failed_after_item"))

    def test_garbage_and_silence_are_protocol_errors_and_uncertain(self):
        run_parallel(lambda mode: self.assert_error(mode, "protocol", True, names=("A", "B")),
                     ("garbage", "nothing", "no_complete", "truncated", "after_complete", "swapped", "bad_exit"))
        self.assert_error("wrong_name", "protocol", True, names=("A",))

    def test_wrong_fields_and_inconsistent_states_are_protocol_errors(self):
        run_parallel(lambda kind: self.assert_error("mut_" + kind, "protocol", True, names=("A", "B")),
                     ("version", "extra_key", "missing_key", "name_int", "result_unknown", "result_int", "count_plus",
                      "unlocked_wrong", "app_wrong", "stored_bad", "stored_int", "end_extra_key", "bool_count",
                      "unlocked_but_not_needed", "needed_but_nothing_written", "pending_but_yes", "unlocked_but_timeout",
                      "store_failed_with_pending"))

    def test_results_received_before_a_failure_are_kept_as_partial(self):
        def check(row):
            mode, names, expected = row
            self.assertEqual(self.failure(mode, names).partial, expected, mode)

        run_parallel(check, (
                ("failed_after_item", ("A", "B"), [UnlockResult("A", "already")]),
                ("truncated", ("A", "B"), [UnlockResult("A", "already")]),
                ("no_complete", ("A", "B"), [UnlockResult("A", "unlocked"), UnlockResult("B", "already")]),
                ("after_complete", ("A", "B"), [UnlockResult("A", "unlocked"), UnlockResult("B", "already")]),
                ("mut_count_plus", ("A", "B"), [UnlockResult("A", "unlocked"), UnlockResult("B", "unlocked")]),
                ("bad_exit", ("A", "B", "C", "D"), [UnlockResult("A", "unlocked"), UnlockResult("B", "already"),
                                                    UnlockResult("C", "unknown"), UnlockResult("D", "unconfirmed")]),
                ("garbage", ("A", "B"), []), ("failed", ("A", "B"), []), ("failed_wrote", ("A", "B"), []),
                ("mut_name_int", ("A", "B"), [])))

    def test_a_flood_of_lines_is_cut_at_names_plus_one(self):
        started = time.monotonic()
        error = self.failure("flood_then_hang", ("A",), timeout=HANG_TIMEOUT)
        self.assertEqual((error.code, error.wrote), ("protocol", True))
        self.assertEqual(error.partial, [UnlockResult("A", "already")])
        self.assertLess(time.monotonic() - started, HANG_TIMEOUT)

    def test_error_messages_name_the_unlock_path(self):
        self.assertEqual(str(self.failure("failed")), "unlock failed: stats_unavailable")
        with self.assertRaises(AchievementsError) as caught:
            unlock_achievements(["no-such-program"], STEAM_ID, APP_ID, [])
        self.assertEqual(str(caught.exception), "unlock failed: invalid_name_list")
        with self.assertRaises(AchievementsError) as caught:
            read_achievements(["no-such-program"], STEAM_ID, 0)
        self.assertEqual(str(caught.exception), "achievements read failed: invalid_app_id")

    def test_a_hang_times_out_uncertain_and_the_tree_is_killed(self):
        self.assert_error("hang", "timeout", True, timeout=HANG_TIMEOUT)
        self.assertTrue(self.pidfile.exists(), "the fake helper never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])

    def test_a_helper_that_never_reads_stdin_is_cut_at_the_deadline(self):
        names = [f"ACH_{i:03d}_" + "x" * 240 for i in range(200)]  # about 50 KB: far more than the pipe holds
        started = time.monotonic()
        self.assert_error("no_read", "timeout", True, names=names, timeout=HANG_TIMEOUT)
        self.assertLess(time.monotonic() - started, HANG_TIMEOUT + 10)
        self.assertTrue(self.pidfile.exists(), "the fake helper never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])

    def test_the_timeout_has_a_floor_of_fifty_seconds(self):
        with mock.patch("steam_idle.achievements.MIN_UNLOCK_TIMEOUT", 50.0):
            for timeout in (49.9, 0, -1, float("nan")):
                with self.assertRaises(ValueError, msg=str(timeout)):
                    unlock_achievements(["no-such-program"], STEAM_ID, APP_ID, ["A"], timeout=timeout)
            with self.assertRaises(AchievementsError) as caught:  # 50 is allowed and gets as far as starting
                unlock_achievements(["no-such-program"], STEAM_ID, APP_ID, ["A"], timeout=50.0)
            self.assertEqual(caught.exception.code, "start_failed")

    def test_a_failed_job_object_setup_kills_the_child_and_is_start_failed_not_written(self):
        real_popen, started = subprocess.Popen, []

        def popen(*args, **kwargs):
            started.append(real_popen(*args, **kwargs))
            return started[-1]

        for job in (mock.Mock(side_effect=OSError("denied")), mock.Mock(return_value=None)):
            started.clear()
            with mock.patch("subprocess.Popen", popen), mock.patch("steam_idle._helper._job_for", job):
                self.assert_error("no_read", "start_failed", False, timeout=HANG_TIMEOUT)
            self.assertIsNotNone(started[0].poll(), "the helper was left running")

    def test_missing_helper_is_start_failed_and_nothing_was_written(self):
        with self.assertRaises(AchievementsError) as caught:
            unlock_achievements(str(Path(self.temp.name) / "no-such-helper.exe"), STEAM_ID, APP_ID, ["A"])
        self.assertEqual((caught.exception.code, caught.exception.wrote), ("start_failed", False))

    def test_invalid_arguments_are_refused_before_running_anything(self):
        cases = [("123", APP_ID, ["A"], "invalid_steam_id"), (STEAM_ID, 0, ["A"], "invalid_app_id"),
                 (STEAM_ID, True, ["A"], "invalid_app_id"), (STEAM_ID, 2 ** 32, ["A"], "invalid_app_id"),
                 (STEAM_ID, APP_ID, [], "invalid_name_list"), (STEAM_ID, APP_ID, "ACH", "invalid_name_list"),
                 (STEAM_ID, APP_ID, [f"A{i}" for i in range(201)], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["A", "A"], "duplicate_name"), (STEAM_ID, APP_ID, [""], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["A\nB"], "invalid_name_list"), (STEAM_ID, APP_ID, ["A\rB"], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["A\x00"], "invalid_name_list"), (STEAM_ID, APP_ID, ["A\x7f"], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["A" * 257], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["日" * 86], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["A\ud800"], "invalid_name_list"),
                 (STEAM_ID, APP_ID, ["A�"], "invalid_name_list"),
                 (STEAM_ID, APP_ID, [1], "invalid_name_list"), (STEAM_ID, APP_ID, [b"A"], "invalid_name_list")]
        for steam_id, app_id, names, code in cases:
            with self.assertRaises(AchievementsError, msg=repr(names)[:40]) as caught:
                unlock_achievements(["no-such-program"], steam_id, app_id, names)
            self.assertEqual((caught.exception.code, caught.exception.wrote), (code, False), repr(names)[:40])

    def test_the_limits_themselves_are_accepted(self):
        outcome = self.unlock("echo", [f"A{i}" for i in range(200)])
        self.assertEqual(len(outcome.results), 200)
        self.unlock("echo", ["A" * 256, "日" * 85])


if __name__ == "__main__":
    unittest.main()
