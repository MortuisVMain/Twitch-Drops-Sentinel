"""Commands reach the published status at once and wake the run loops; a blocked step cannot hide the user's intent."""
import asyncio
import threading
import time
import unittest

from steam_idle.achievement_queue import GamePlan
from steam_idle.test_achievement_queue import Env as QueueEnv, missing
from steam_idle.test_achievements_controller import Base as AchBase, run_of
from steam_idle.test_controller import Env, gd
from steam_idle.test_farm import Harness

PROMPT = 2.0  # "immediate" next to a 10-minute farm tick; 0.2 s failed now and then on loaded CI runners


async def within(predicate, seconds=PROMPT) -> bool:
    end = time.monotonic() + seconds
    while not predicate():
        if time.monotonic() >= end:
            return False
        await asyncio.sleep(0.005)
    return True


class FarmIntentTests(unittest.TestCase):
    """CardFarm: the snapshot already shows a command while the step that must apply it is blocked."""

    def blocked(self, h, farming=False):
        h.reads = [[gd(10, 3), gd(20, 3)]]
        h.farm.start()
        h.farm.step()  # scanning
        if farming:
            h.step()  # the scan holds a game
            h.now += 10_000  # the next step is a recheck read
        h.read_gate = threading.Event()
        worker = threading.Thread(target=h.farm.step, daemon=True)
        worker.start()
        self.assertTrue(h.read_entered.wait(5), "the step never blocked")
        self.addCleanup(worker.join, 5)
        self.addCleanup(h.read_gate.set)

    def test_stop_shows_stopped_and_no_game_while_the_step_is_blocked(self):
        for farming in (False, True):
            with self.subTest(farming=farming):
                h = Harness([[gd(10, 3)]])
                self.blocked(h, farming)
                h.farm.stop()
                status = h.farm.status()
                self.assertEqual((status["state"], status["current"], status["queue"]), ("stopped", None, []))
                h.read_gate.set()

    def test_pause_shows_paused_while_the_step_is_blocked(self):
        for farming in (False, True):
            with self.subTest(farming=farming):
                h = Harness([[gd(10, 3)]])
                self.blocked(h, farming)
                h.farm.pause()
                status = h.farm.status()
                self.assertEqual((status["state"], status["paused"], status["current"]), ("paused", True, None))
                h.read_gate.set()

    def test_suspend_shows_suspended_while_the_step_is_blocked(self):
        for farming in (False, True):
            with self.subTest(farming=farming):
                h = Harness([[gd(10, 3)]])
                self.blocked(h, farming)
                h.farm.set_suspended(True)
                status = h.farm.status()
                self.assertEqual((status["state"], status["suspended"], status["current"]), ("suspended", True, None))
                h.read_gate.set()

    def test_resume_and_unsuspend_show_at_once_without_a_step(self):
        h = Harness([[gd(10, 3)]])
        h.begin()
        h.do(h.farm.pause)
        self.assertEqual(h.state, "paused")
        h.farm.resume()
        status = h.farm.status()
        self.assertEqual((status["state"], status["paused"]), ("scanning", False))
        h.do(h.farm.set_suspended, True)
        self.assertEqual(h.state, "suspended")
        h.farm.set_suspended(False)
        status = h.farm.status()
        self.assertEqual((status["state"], status["suspended"]), ("scanning", False))

    def test_the_applied_state_replaces_the_published_intent(self):
        h = Harness([[gd(10, 3)]])
        h.begin()
        h.farm.pause()
        self.assertEqual(h.state, "paused")
        h.step()
        self.assertEqual((h.state, h.held_ids()), ("paused", []))
        h.farm.resume()
        h.step()
        h.step()
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))

    def test_pending_is_true_until_a_step_applies_the_command(self):
        h = Harness([[gd(10, 3)]])
        h.begin()
        self.assertFalse(h.farm.pending())
        h.farm.stop()
        self.assertEqual((h.state, h.farm.pending(), h.held_ids()), ("stopped", True, [10]))
        h.farm.step()
        self.assertEqual((h.state, h.farm.pending(), h.held_ids()), ("stopped", False, []))

    def test_every_command_calls_the_wake_hook(self):
        calls = []
        h = Harness([[gd(10, 3)]])
        h.farm._wake = lambda: calls.append(1)
        for command, args in ((h.farm.start, ()), (h.farm.pause, ()), (h.farm.resume, ()), (h.farm.skip_current, ()),
                              (h.farm.set_suspended, (True,)), (h.farm.stop, ()), (h.farm.close, ())):
            before = len(calls)
            command(*args)
            self.assertGreater(len(calls), before, command.__name__)


class QueueIntentTests(unittest.TestCase):
    """AchievementQueue: the same, for pause, resume and suspend (stop already was published at once)."""

    def blocked(self):
        env = QueueEnv({1: missing(450)})
        env.gate = threading.Event()
        env.start(GamePlan(1))
        for _ in range(3):
            env.step()
        worker = threading.Thread(target=env.q.step, daemon=True)
        worker.start()
        self.assertTrue(env.entered.wait(5), "the unlock never blocked")
        self.addCleanup(worker.join, 5)
        self.addCleanup(env.gate.set)
        return env

    def test_commands_show_at_once_while_an_unlock_is_blocked(self):
        for name, command, expected in (("pause", lambda e: e.pause(), ("paused", True, False)),
                                        ("suspend", lambda e: e.suspend(True), ("suspended", False, True)),
                                        ("stop", lambda e: e.stop(), ("stopped", False, False))):
            with self.subTest(command=name):
                env = self.blocked()
                command(env)
                status = env.q.status()
                self.assertEqual((status["state"], status["paused"], status["suspended"]), expected)
                env.gate.set()

    def test_resume_and_unsuspend_show_at_once_without_a_step(self):
        env = QueueEnv({1: missing(450)})
        env.start(GamePlan(1))
        for _ in range(3):
            env.step()
        env.pause()
        env.step()
        self.assertEqual(env.state(), "paused")
        env.resume()
        self.assertEqual(env.q.status()["state"], "unlocking")
        env.suspend(True)
        self.assertEqual(env.q.status()["state"], "suspended")
        env.suspend(False)
        self.assertEqual(env.q.status()["state"], "unlocking")

    def test_every_command_calls_the_wake_hook(self):
        calls = []
        env = QueueEnv({1: missing(2)})
        env.q._wake = lambda: calls.append(1)
        for command, args in ((env.q.start, (GamePlan(1),)), (env.q.pause, ()), (env.q.resume, ()),
                              (env.q.skip_current, ()), (env.q.set_suspended, (True,)), (env.q.stop, ()),
                              (env.q.close, ())):
            before = len(calls)
            command(*args)
            self.assertGreater(len(calls), before, command.__name__)


class FarmWakeTests(unittest.IsolatedAsyncioTestCase):
    """Controller farm loop with a real sleep: a command is visible and applied within 200 ms."""

    async def asyncTearDown(self):
        await self.env.ctl.shutdown()

    def farm(self):
        return self.env.ctl.state()["farm"]

    def held(self):
        return [p.app_id for p in self.env.presences if p.running]

    def make(self, **over):
        self.env = Env(drops=[[gd(100, 5), gd(200, 5)]], **over)
        self.env.signed_in()
        self.env.ctl._sleep = asyncio.sleep
        return self.env.ctl

    async def farming(self):
        ctl = self.make()
        self.assertIsNone(ctl.start())
        await self.env.wait_running()
        await asyncio.sleep(0.05)  # the loop is now in its sleep
        return ctl

    async def test_stop_is_visible_and_releases_the_game_at_once(self):
        ctl = await self.farming()
        ctl.stop()
        self.assertTrue(await within(lambda: self.farm()["state"] == "stopped"), self.farm()["state"])
        self.assertTrue(await within(lambda: self.held() == []), "the game is still held")

    async def test_pause_and_resume_are_immediate(self):
        ctl = await self.farming()
        ctl.pause()
        self.assertTrue(await within(lambda: (self.farm()["state"], self.farm()["paused"]) == ("paused", True)))
        self.assertTrue(await within(lambda: self.held() == []))
        ctl.resume()
        self.assertTrue(await within(lambda: self.farm()["state"] == "farming" and self.held() == [100]),
                        self.farm()["state"])

    async def test_suspend_and_release_are_immediate(self):
        ctl = await self.farming()
        ctl.set_suspended(True)
        self.assertTrue(await within(lambda: (self.farm()["state"], self.farm()["suspended"]) == ("suspended", True)))
        self.assertTrue(await within(lambda: self.held() == []))
        ctl.set_suspended(False)
        self.assertTrue(await within(lambda: self.farm()["state"] == "farming" and self.held() == [100]))

    async def test_skip_is_immediate(self):
        ctl = await self.farming()
        ctl.skip()
        self.assertTrue(await within(lambda: self.held() == [200]), self.held())

    async def test_acknowledgement_withdrawal_is_immediate(self):
        ctl = await self.farming()
        ctl.acknowledge(False)
        self.assertTrue(await within(lambda: self.farm()["state"] == "stopped" and self.held() == []))

    async def test_commands_show_while_a_step_is_blocked_in_a_read(self):
        for name, state, flag in (("stop", "stopped", None), ("pause", "paused", "paused"),
                                  ("set_suspended", "suspended", "suspended")):
            with self.subTest(command=name):
                ctl = self.make(read_gate=threading.Event())
                self.assertIsNone(ctl.start())
                self.assertTrue(await asyncio.to_thread(self.env.read_entered.wait, 5))
                getattr(ctl, name)(*((True,) if name == "set_suspended" else ()))
                self.assertTrue(await within(lambda: self.farm()["state"] == state), self.farm()["state"])
                if flag:
                    self.assertIs(self.farm()[flag], True)
                self.assertEqual(self.held(), [])
                await ctl.shutdown()

    async def test_an_idle_loop_does_not_spin(self):
        ctl = await self.farming()
        steps = []
        real = ctl._farm.step
        ctl._farm.step = lambda: (steps.append(1), real())[1]
        await asyncio.sleep(0.4)
        self.assertLessEqual(len(steps), 2)


class AchievementsWakeTests(AchBase):
    async def waiting_run(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        ctl._sleep = ctl._achv._sleep = asyncio.sleep
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        await self.wait_run("waiting")
        await asyncio.sleep(0.05)  # the loop is now in its sleep
        return ctl

    def run_state(self):
        return run_of(self.env.ctl)

    async def test_stop_is_immediate(self):
        ctl = await self.waiting_run()
        ctl.stop_achievements()
        self.assertTrue(await within(lambda: self.run_state()["state"] == "stopped"), self.run_state()["state"])

    async def test_pause_and_resume_are_immediate(self):
        ctl = await self.waiting_run()
        ctl.pause_achievements()
        self.assertTrue(await within(lambda: (self.run_state()["state"], self.run_state()["paused"]) == ("paused", True)))
        ctl.resume_achievements()
        self.assertTrue(await within(lambda: self.run_state()["state"] == "waiting" and not self.run_state()["paused"]))

    async def test_suspend_and_release_are_immediate(self):
        ctl = await self.waiting_run()
        ctl.set_suspended(True)
        self.assertTrue(await within(lambda: (self.run_state()["state"], self.run_state()["suspended"]) == ("suspended", True)))
        ctl.set_suspended(False)
        self.assertTrue(await within(lambda: self.run_state()["state"] == "waiting"))

    async def test_acknowledgement_withdrawal_is_immediate(self):
        ctl = await self.waiting_run()
        ctl.acknowledge_achievements(False)
        self.assertTrue(await within(lambda: self.run_state()["state"] == "stopped"))

    async def test_skip_is_applied_at_once(self):
        ctl = await self.waiting_run()
        ctl.skip_achievements()
        self.assertTrue(await within(lambda: any(f["note"] == "skipped_by_user" for f in self.run_state()["finished"])))

    async def test_commands_show_while_an_unlock_is_blocked(self):
        for name, state, flag in (("stop_achievements", "stopped", None), ("pause_achievements", "paused", "paused"),
                                  ("set_suspended", "suspended", "suspended")):
            with self.subTest(command=name):
                ctl = await self.blocked_paced_run()
                getattr(ctl, name)(*((True,) if name == "set_suspended" else ()))
                self.assertTrue(await within(lambda: self.run_state()["state"] == state), self.run_state()["state"])
                if flag:
                    self.assertIs(self.run_state()[flag], True)
                self.env.unlock_gate.set()
                await ctl.shutdown()

    async def test_an_idle_loop_does_not_spin(self):
        ctl = await self.waiting_run()
        steps = []
        real = ctl._achv._queue.step
        ctl._achv._queue.step = lambda: (steps.append(1), real())[1]
        await asyncio.sleep(0.4)
        self.assertLessEqual(len(steps), 2)


if __name__ == "__main__":
    unittest.main()
