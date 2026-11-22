"""Offline checks for the Steam IDLE notifications: which farm events are announced, once, with what text."""
import datetime
import unittest

from steam_idle.drops_daily import DailyDrops
from steam_idle.run_events import (KIND_ALL, KIND_DAILY, KIND_ERROR, KIND_NO_HOURS, NOTIFY_KEY, RunEvents)

DAY = datetime.datetime(2026, 11, 22, 12, 0).timestamp()


def status(state="farming", **over):
    base = {"state": state, "done": [], "droppedThisRun": 0, "lastError": None, "batchDisabled": None}
    base.update(over)
    return base


class Env:
    def __init__(self, enabled=True):
        self.sent, self.settings, self.wall = [], {}, DAY
        self.enabled = enabled
        self.daily = DailyDrops(lambda key, default=None: self.settings.get(key, default), self.settings.__setitem__,
                                lambda: self.wall)
        self.events = RunEvents(lambda *args: self.sent.append(args), lambda: self.enabled, self.daily)
        self.events.begin_run("run1")

    def kinds(self):
        return [item[0] for item in self.sent]


class RunEventsTests(unittest.TestCase):
    def setUp(self):
        self.env = Env()

    def test_setting_key(self):
        self.assertEqual(NOTIFY_KEY, "steam_idle_notify")

    def test_a_finished_run_announces_all_cards_collected_once(self):
        done = [{"appId": 1, "name": "A"}, {"appId": 2, "name": "B"}]
        for _ in range(3):
            self.env.events.observe(status("done", done=done, droppedThisRun=7), None, 5)
        self.assertEqual(self.env.kinds(), [KIND_ALL])
        kind, key, title, message = self.env.sent[0]
        self.assertEqual((key, title), ("run1", "Steam IDLE: все карточки собраны"))
        self.assertIn("2", message)
        self.assertIn("7", message)

    def test_a_run_that_found_nothing_to_farm_says_nothing(self):
        self.env.events.observe(status("done"), None, 5)
        self.assertEqual(self.env.sent, [])

    def test_running_states_say_nothing(self):
        for state in ("scanning", "farming", "batching", "waiting", "paused", "suspended", "idle"):
            self.env.events.observe(status(state), None, 5)
        self.assertEqual(self.env.sent, [])

    def test_needs_login_is_announced_once_per_run_and_code(self):
        for _ in range(2):
            self.env.events.observe(status("needs_login", lastError="signed_out"), None, 5)
        self.assertEqual(self.env.kinds(), [KIND_ERROR])
        self.assertEqual(self.env.sent[0][1], "run1:signed_out")
        self.assertIn("вход", self.env.sent[0][3].lower())

    def test_a_stop_with_an_error_code_is_announced_and_a_plain_stop_is_not(self):
        self.env.events.observe(status("stopped"), None, 5)
        self.assertEqual(self.env.sent, [])
        self.env.events.observe(status("stopped", lastError="no_progress"), None, 5)
        self.env.events.observe(status("stopped"), "account_changed", 5)
        self.assertEqual([item[1] for item in self.env.sent], ["run1:no_progress", "run1:account_changed"])

    def test_the_hours_phase_giving_up_is_announced_once_per_run(self):
        for _ in range(3):
            self.env.events.observe(status("farming", batchDisabled="no_hours"), None, 5)
        self.assertEqual(self.env.kinds(), [KIND_NO_HOURS])
        self.assertEqual(self.env.sent[0][1], "run1")

    def test_a_new_run_announces_again(self):
        self.env.events.observe(status("needs_login", lastError="signed_out"), None, 5)
        self.env.events.begin_run("run2")
        self.env.events.observe(status("needs_login", lastError="signed_out"), None, 5)
        self.assertEqual([item[1] for item in self.env.sent], ["run1:signed_out", "run2:signed_out"])

    def test_nothing_is_sent_while_the_setting_is_off(self):
        env = Env(enabled=False)
        env.events.observe(status("needs_login", lastError="signed_out"), None, 5)
        env.events.observe(status("done", done=[{"appId": 1, "name": "A"}], droppedThisRun=1), None, 5)
        env.events.daily_summary(5)
        self.assertEqual(env.sent, [])

    def test_a_failing_notifier_is_logged_and_never_raised(self):
        def boom(*args):
            raise RuntimeError("toast broke")
        events = RunEvents(boom, lambda: True, self.env.daily)
        events.begin_run("r")
        with self.assertLogs("steam_idle.run_events", level="ERROR"):
            events.observe(status("needs_login", lastError="signed_out"), None, 5)

    def test_the_daily_summary_announces_yesterdays_drops_once(self):
        self.env.daily.add(5, 4)
        self.env.wall += 86400
        for _ in range(3):
            self.env.events.daily_summary(5)
        self.assertEqual(self.env.kinds(), [KIND_DAILY])
        kind, key, title, message = self.env.sent[0]
        self.assertTrue(key.endswith(":2026-11-22"))
        self.assertNotIn("5:", key)
        self.assertEqual(title, "Steam IDLE за 2026-11-22")
        self.assertIn("4", message)

    def test_no_daily_summary_for_today_for_zero_or_for_an_older_day(self):
        self.env.daily.add(5, 4)
        self.env.events.daily_summary(5)
        self.assertEqual(self.env.sent, [], "still the same day")
        self.env.wall += 2 * 86400
        self.env.events.daily_summary(5)
        self.assertEqual(self.env.sent, [], "two days old is not the previous day")
        self.env.events.daily_summary(6)
        self.assertEqual(self.env.sent, [], "another account has no bucket")


class PreviousDayTests(unittest.TestCase):
    def test_previous_day_returns_the_bucket_of_yesterday_only(self):
        env = Env()
        env.daily.add(1, 3)
        self.assertIsNone(env.daily.previous_day(1))
        env.wall += 86400
        found = env.daily.previous_day(1)
        self.assertEqual((found[1], found[2]), ("2026-11-22", 3))
        env.wall += 86400
        self.assertIsNone(env.daily.previous_day(1))


if __name__ == "__main__":
    unittest.main()
