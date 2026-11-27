"""Offline checks for the controller's three newer duties: the threshold suggestion, pausing while the user plays a
game of their own, and the notifications. Same fakes as test_controller, nothing sleeps for real."""
import datetime
import time
import unittest
from unittest import mock

from steam_idle import controller
from steam_idle.community import CommunityError, GameDrops
from steam_idle.controller import read_running_app_id
from steam_idle.test_controller import ACCOUNT, Env, gd


def gh(app_id, drops, hours):
    return GameDrops(app_id, f"Game {app_id}", drops, hours)


class Base(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        for name, real in getattr(self, "real_runs", {}).items():  # undo StubRun swaps so shutdown closes the real ones
            setattr(self.env.ctl, name, real)
        await self.env.ctl.shutdown()

    def swap_runs(self, ctl, farm, achv):
        self.real_runs = {"_farm": ctl._farm, "_achv": ctl._achv}
        ctl._farm, ctl._achv = farm, achv

    def make(self, **over):
        self.env = Env(**over)
        return self.env.ctl

    def kinds(self):
        return [item[0] for item in self.env.notified]


class SuggestionTests(Base):
    async def test_the_third_quick_first_drop_suggests_zero_hours_and_logs_each_sample(self):
        ctl = self.make(drops=[[gh(100, 2, 0.0)], [gh(100, 1, 0.5)], [gh(100, 0, 0.6)]])
        ctl.set_farm_settings(3)
        self.env.signed_in()
        for sample in (0.4, 0.5):
            ctl._first_drops.add(ACCOUNT, sample)
        self.assertIsNone(ctl.state()["farm"]["thresholdSuggestion"])
        with self.assertLogs("steam_idle.controller", level="INFO") as logs:
            ctl.start()
            await self.env.settle()
        self.assertTrue(any("First drop in Game 100 after 0.5 h (sample 3/3)" in line for line in logs.output), logs.output)
        self.assertEqual(ctl.state()["farm"]["thresholdSuggestion"],
                         {"kind": "unrestricted", "suggestedHours": 0, "samples": 3})
        self.assertNotIn(str(ACCOUNT), str(self.env.settings["steam_idle_first_drop_samples"]))

    async def test_no_suggestion_when_the_setting_already_matches(self):
        ctl = self.make()
        for sample in (0.4, 0.5, 0.6):
            ctl._first_drops.add(ACCOUNT, sample)
        self.env.signed_in()
        self.assertEqual(ctl.state()["farm"]["thresholdSuggestion"]["suggestedHours"], 0)
        ctl.set_farm_settings(0)
        self.assertIsNone(ctl.state()["farm"]["thresholdSuggestion"])

    async def test_a_restricted_account_gets_a_half_hour_rounded_suggestion(self):
        ctl = self.make()
        for sample in (2.9, 3.1, 3.0):
            ctl._first_drops.add(ACCOUNT, sample)
        ctl.set_farm_settings(1)
        self.assertEqual(ctl.state()["farm"]["thresholdSuggestion"], {"kind": "restricted", "suggestedHours": 3.0, "samples": 3})

    async def test_a_failing_sample_store_is_logged_and_does_not_stop_the_farm(self):
        ctl = self.make(drops=[[gh(100, 2, 0.0)], [gh(100, 1, 0.5)], [gh(100, 0, 0.6)]])

        def boom(account, hours):
            raise OSError("disk full")
        ctl._first_drops.add = boom
        self.env.signed_in()
        with self.assertLogs("steam_idle.controller", level="ERROR"):
            ctl.start()
            await self.env.settle()
        self.assertEqual(ctl.state()["farm"]["state"], "done")


class ReleaseTests(Base):
    async def test_the_held_games_are_released_together_and_failures_are_logged(self):
        ctl = self.make()
        stopped = []

        class Slow:
            def __init__(self, n):
                self.n = n

            def is_running(self):
                return True

            def stop(self):
                time.sleep(0.2)
                stopped.append(self.n)
                if self.n == 2:
                    raise OSError("stop failed")
        ctl._live = [Slow(n) for n in range(10)]
        started = time.monotonic()
        with self.assertLogs("steam_idle.controller", level="ERROR") as logs:
            ctl._release_presences()
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(sorted(stopped), list(range(10)))
        self.assertEqual(len(logs.output), 1)


class SettingsTests(Base):
    async def test_defaults_are_on(self):
        farm = self.make().state()["farm"]
        self.assertEqual((farm["pauseWhilePlaying"], farm["notify"], farm["autoPause"]), (True, True, None))

    async def test_each_setting_is_stored_alone_and_together(self):
        ctl = self.make()
        self.assertIsNone(ctl.set_farm_settings(pause_while_playing=False))
        self.assertIsNone(ctl.set_farm_settings(notify=False))
        farm = ctl.state()["farm"]
        self.assertEqual((farm["pauseWhilePlaying"], farm["notify"], farm["hoursUntilDrops"]), (False, False, 3.0))
        self.assertIsNone(ctl.set_farm_settings(2.5, pause_while_playing=True, notify=True))
        farm = ctl.state()["farm"]
        self.assertEqual((farm["pauseWhilePlaying"], farm["notify"], farm["hoursUntilDrops"]), (True, True, 2.5))

    async def test_a_bad_value_rejects_the_whole_request_and_stores_nothing(self):
        ctl = self.make()
        for kwargs in ({"pause_while_playing": 1}, {"notify": "yes"}, {"pause_while_playing": None}, {}):
            self.assertEqual(ctl.set_farm_settings(**kwargs), "invalid_request", kwargs)
        self.assertEqual(ctl.set_farm_settings(5, notify="no"), "invalid_request")
        self.assertEqual(ctl.set_farm_settings(None), "invalid_request")
        farm = ctl.state()["farm"]
        self.assertEqual((farm["hoursUntilDrops"], farm["pauseWhilePlaying"], farm["notify"]), (3.0, True, True))

    async def test_refused_while_the_module_is_off(self):
        ctl = self.make(module_enabled=False)
        self.assertEqual(ctl.set_farm_settings(pause_while_playing=False), "module_disabled")


class RunningAppTests(unittest.TestCase):
    def test_reads_the_value_from_the_steam_key_and_maps_anything_else_to_zero(self):
        asked = []

        def reader(name, path):
            asked.append((name, path))
            return 999001
        self.assertEqual(read_running_app_id(reader), 999001)
        self.assertEqual(asked, [("RunningAppID", r"Software\Valve\Steam")])
        self.assertIsNone(read_running_app_id(lambda name, path: None), "unreadable is not 'no game'")
        self.assertEqual(read_running_app_id(lambda name, path: 0), 0)
        self.assertEqual(read_running_app_id(lambda name, path: "x"), 0)
        self.assertEqual(read_running_app_id(lambda name, path: -5), 0)


class PlayTests(Base):
    """`plan(ctl, count)` runs from the fake sleep, i.e. on the event loop between two farm steps (5 s of fake time
    each); every call first records (fake time, farm state, autoPause) in `self.seen`."""

    def script(self, plan):
        ctl = self.make(drops=[[gd(100, 9)]], watch=True)
        self.seen = []

        def drive():
            farm = ctl.state()["farm"]
            self.seen.append((self.env.now, farm["state"], farm["autoPause"]))
            plan(ctl, len(self.env.sleeps))
        self.env.on_sleep = drive
        self.env.signed_in()
        return ctl

    def first_paused(self):
        return next((entry for entry in self.seen if entry[1] == "paused"), None)

    def paused_by_the_watch(self, ctl, count):
        """The usual opening: a user game appears at 3 and is seen twice at 4 and 5."""
        if count == 3:
            self.env.running = 999001
        if count in (4, 5):
            ctl.check_user_game()

    async def test_a_user_game_pauses_the_farm_and_closing_it_resumes_after_two_minutes(self):
        self.closed_at = None

        def plan(ctl, count):
            self.paused_by_the_watch(ctl, count)
            if self.closed_at is None and count >= 7 and self.first_paused():
                self.env.running, self.closed_at = 0, self.env.now
            if self.closed_at is not None:
                ctl.check_user_game()
            if count == 90:
                ctl.stop()
        ctl = self.script(plan)
        with self.assertLogs("steam_idle.controller", level="INFO") as logs:
            ctl.start()
            await self.env.settle()
        text = "\n".join(logs.output)
        self.assertIn("Paused: you are playing app 999001", text)
        self.assertIn("Resumed: game closed", text)
        paused = self.first_paused()
        self.assertEqual(paused[2]["reason"], "user_playing")
        self.assertEqual(paused[2]["appId"], 999001)
        self.assertIsNotNone(self.closed_at)
        after = [entry for entry in self.seen if entry[0] > self.closed_at]
        waiting = [entry for entry in after if entry[0] - self.closed_at < 120]
        self.assertTrue(waiting and all(entry[1] == "paused" and entry[2] is not None for entry in waiting), waiting)
        resumed = next(entry for entry in after if entry[1] != "paused")
        self.assertGreaterEqual(resumed[0] - self.closed_at, 120)
        self.assertIsNone(resumed[2])

    async def test_a_game_the_farm_holds_itself_never_pauses_it(self):
        def plan(ctl, count):
            if count >= 6:
                self.env.running = 100
                ctl.check_user_game()
            if count == 20:
                ctl.stop()
        ctl = self.script(plan)
        ctl.start()
        await self.env.settle()
        self.assertTrue(all(state != "paused" for _, state, _ in self.seen), self.seen)

    async def test_a_manual_pause_is_never_resumed_by_the_watch(self):
        def plan(ctl, count):
            if count == 3:
                ctl.pause()
            if count >= 4:
                ctl.check_user_game()
            if count == 90:
                ctl.stop()
        ctl = self.script(plan)
        ctl.start()
        await self.env.settle()
        late = self.seen[6:-1]
        self.assertTrue(late and all(entry[1:] == ("paused", None) for entry in late), late)

    async def test_pressing_pause_during_an_auto_pause_turns_it_into_a_manual_one(self):
        self.pressed = False

        def plan(ctl, count):
            self.paused_by_the_watch(ctl, count)
            if not self.pressed and count >= 7 and self.first_paused():
                self.pressed = True
                ctl.pause()
                self.env.running = 0
            if self.pressed:
                ctl.check_user_game()
            if count == 90:
                ctl.stop()
        ctl = self.script(plan)
        ctl.start()
        await self.env.settle()
        tail = self.seen[-40:-1]
        self.assertTrue(all(entry[1:] == ("paused", None) for entry in tail), tail)

    async def test_resuming_by_hand_while_the_game_still_runs_is_respected(self):
        self.pressed = False

        def plan(ctl, count):
            self.paused_by_the_watch(ctl, count)
            if not self.pressed and count >= 7 and self.first_paused():
                self.pressed = True
                ctl.resume()
            if self.pressed:
                ctl.check_user_game()
            if count == 40:
                ctl.stop()
        ctl = self.script(plan)
        ctl.start()
        await self.env.settle()
        index = self.seen.index(self.first_paused())
        after = [entry[1] for entry in self.seen[index:-1]]
        resumed = next(i for i, state in enumerate(after) if state != "paused")
        self.assertNotIn("paused", after[resumed:])

    async def test_turning_the_setting_off_resumes_an_own_pause_and_stops_watching(self):
        self.pressed = False

        def plan(ctl, count):
            self.paused_by_the_watch(ctl, count)
            if not self.pressed and count >= 7 and self.first_paused():
                self.pressed = True
                ctl.set_farm_settings(pause_while_playing=False)
            if self.pressed:
                ctl.check_user_game()
            if count == 40:
                ctl.stop()
        ctl = self.script(plan)
        ctl.start()
        await self.env.settle()
        after = [entry[1] for entry in self.seen[self.seen.index(self.first_paused()):-1]]
        resumed = next(i for i, state in enumerate(after) if state != "paused")
        self.assertNotIn("paused", after[resumed:])

    async def test_without_a_detector_nothing_is_watched(self):
        ctl = self.make()
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        self.assertIsNone(ctl._watch_task)
        ctl.check_user_game()  # harmless


class StubRun:
    """A farm or achievements run reduced to what the watch asks of it."""

    def __init__(self, state="paused", held=()):
        self.state, self.held, self.resumed = state, held, 0

    def status(self):
        return {"state": self.state}

    def payload(self):
        return {"run": {"state": self.state, "current": None}}

    def held_ids(self):
        return frozenset(self.held)

    def resume(self):
        self.state, self.resumed = "running", self.resumed + 1

    def stop(self):
        self.state = "stopped"

    def pause(self):
        self.state = "paused"


class AutoPauseHalvesTests(Base):
    def both_auto_paused(self):
        ctl = self.make(watch=True)
        self.swap_runs(ctl, StubRun(), StubRun())
        ctl._auto = {"farm": True, "achv": True, "since": self.env.now}
        ctl._play.paused = (999001, self.env.now)
        return ctl

    async def test_a_manual_farm_command_keeps_the_achievements_half_of_the_auto_pause(self):
        ctl = self.both_auto_paused()
        ctl.resume()
        ctl._farm.state = "farming"
        self.assertEqual(ctl._auto["farm"], False)
        self.assertTrue(ctl._auto["achv"])
        self.assertEqual(ctl._auto_payload()["appId"], 999001)
        ctl._release_auto("game closed")
        self.assertEqual((ctl._farm.resumed, ctl._achv.resumed), (0, 1))

    async def test_a_manual_achievements_command_keeps_the_farm_half(self):
        ctl = self.both_auto_paused()
        ctl.stop_achievements()
        ctl._achv.state = "stopped"
        self.assertEqual((ctl._auto["farm"], ctl._auto["achv"]), (True, False))
        self.assertIsNotNone(ctl._auto_payload())
        ctl._release_auto("game closed")
        self.assertEqual((ctl._farm.resumed, ctl._achv.resumed), (1, 0))

    async def test_touching_the_only_half_takes_the_whole_pause_over(self):
        ctl = self.make(watch=True)
        self.swap_runs(ctl, StubRun(), StubRun("idle"))
        ctl._auto = {"farm": True, "achv": False, "since": self.env.now}
        ctl._play.paused = (999001, self.env.now)
        ctl.pause()
        self.assertIsNone(ctl._auto)
        self.assertEqual(ctl._play._dismissed, 999001)


class WatchLoopTests(Base):
    async def test_one_failing_check_does_not_end_the_watch(self):
        ctl = self.make(watch=True)
        calls = []

        def check():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("boom")
        ctl.check_user_game = check
        ctl._running = lambda: len(calls) < 3
        with mock.patch.object(controller, "_WATCH_SECONDS", 0), self.assertLogs("steam_idle.controller", level="ERROR"):
            await ctl._watch_loop()
        self.assertEqual(len(calls), 3)

    async def test_the_end_of_the_watch_resumes_what_it_paused(self):
        ctl = self.make(watch=True)
        self.swap_runs(ctl, StubRun(), StubRun("idle"))
        ctl._achv.active = lambda: False
        ctl._auto = {"farm": True, "achv": False, "since": self.env.now}
        await ctl._watch_loop()
        self.assertEqual(ctl._farm.resumed, 1)
        self.assertIsNone(ctl._auto)

    async def test_an_unreadable_running_app_is_skipped_and_keeps_the_ignored_game(self):
        ctl = self.make(watch=True)
        ctl._play._dismissed = 999001
        self.env.running = None
        with self.assertNoLogs("steam_idle.controller", level="WARNING"):
            ctl.check_user_game()
        self.assertEqual(ctl._play._dismissed, 999001)


class NotifyTests(Base):
    async def test_a_finished_run_notifies_once_with_the_counts(self):
        ctl = self.make(drops=[[gd(100, 2)], [gd(100, 0)]])
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        self.assertEqual(self.kinds(), ["steam_idle_all_collected"])
        title, message = self.env.notified[0][2:]
        self.assertEqual(title, "Steam IDLE: все карточки собраны")
        self.assertIn("2", message)

    async def test_a_sign_out_notifies_with_the_error_kind(self):
        ctl = self.make(drops=[[gd(100, 2)], CommunityError("signed_out")])
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        errors = [item for item in self.env.notified if item[0] == "steam_idle_error"]
        self.assertEqual(len(errors), 1)
        self.assertTrue(errors[0][1].endswith(":signed_out"))

    async def test_a_manual_stop_is_not_an_error(self):
        ctl = self.make(drops=[[gd(100, 5)]])
        self.env.signed_in()
        self.env.on_sleep = lambda: ctl.stop() if len(self.env.sleeps) == 3 else None
        ctl.start()
        await self.env.settle()
        self.assertEqual(self.kinds(), [])

    async def test_the_setting_off_silences_everything(self):
        ctl = self.make(drops=[[gd(100, 2)], [gd(100, 0)]])
        ctl.set_farm_settings(notify=False)
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        self.assertEqual(self.env.notified, [])

    async def test_the_first_step_of_a_new_day_announces_yesterdays_drops(self):
        day = [datetime.datetime(2026, 11, 21, 12, 0).timestamp()]
        ctl = self.make(drops=[[gd(100, 3)], [gd(100, 0)]], wall_clock=lambda: day[0])
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        self.assertNotIn("steam_idle_daily", self.kinds())
        day[0] += 86400
        self.env.drops = [[gd(100, 1)], [gd(100, 0)]]
        ctl.start()
        await self.env.settle()
        daily = [item for item in self.env.notified if item[0] == "steam_idle_daily"]
        self.assertEqual(len(daily), 1)
        self.assertEqual(daily[0][2], "Steam IDLE за 2026-11-21")
        self.assertIn("3", daily[0][3])
        self.assertNotIn(str(ACCOUNT), daily[0][1])


if __name__ == "__main__":
    unittest.main()
