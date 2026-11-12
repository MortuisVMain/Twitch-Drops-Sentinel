"""Offline checks for the achievements reader, driven by a fake helper script run through the current interpreter."""
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

from steam_idle.achievements import Achievement, AchievementsError, read_achievements
from steam_idle.helper_support import force_kill, read_pids, wait_gone

STEAM_ID = "76561198000000001"
APP_ID = 10

# argv: <mode> <pidfile> achievements <steamid64> <appid>. Prints what a real helper would, or a defect named by the mode.
FAKE = textwrap.dedent('''
    import json, subprocess, sys, time
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
        "api_nonascii": lambda d: d.update(apiName="Caf\\u00e9"),
        "api_tab": lambda d: d.update(apiName="A\\tB"),
        "api_long": lambda d: d.update(apiName="A" * 129),
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
        for mode in ("failed_bad_code", "failed_extra_key", "failed_after_item"):
            self.assert_code(mode, "protocol")

    def test_garbage_is_a_protocol_error(self):
        for mode in ("garbage", "array", "duplicate_key", "long_line", "nothing"):
            self.assert_code(mode, "protocol")

    def test_wrong_types_and_values_are_protocol_errors(self):
        for name in ("version", "extra_key", "missing_key", "api_int", "api_empty", "api_nonascii", "api_tab", "api_long",
                     "name_null", "name_long", "desc_int", "desc_long", "hidden_str", "hidden_int", "achieved_int",
                     "unlock_str", "unlock_neg", "unlock_float", "unlock_big", "unlock_bool", "locked_with_time"):
            self.assert_code("mut_" + name, "protocol")

    def test_bad_complete_line_is_a_protocol_error(self):
        for mode in ("count_plus", "count_minus", "count_bool", "wrong_app", "end_extra_key", "no_complete", "complete_first"):
            self.assert_code(mode, "protocol")

    def test_nothing_may_follow_the_complete_line(self):
        for mode in ("after_complete", "garbage_after_complete"):
            self.assert_code(mode, "protocol")

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
        self.assert_code("hang", "timeout", timeout=2.0)
        self.assertTrue(self.pidfile.exists(), "the fake helper never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])


if __name__ == "__main__":
    unittest.main()
