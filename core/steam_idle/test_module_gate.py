"""Turning the Steam IDLE tab off turns the module off: its commands are refused, a run in progress is stopped
(the achievements record kept), and turning it back on needs no restart."""
import asyncio
import tempfile
import threading
import unittest
from pathlib import Path

from steam_idle.achievement_queue import GamePlan
from steam_idle.controller import create_controller
from steam_idle.interrupted import RECORD_FILE_NAME
from steam_idle.test_controller import Env, gd

RISK, ACK = "steam_idle_risk_ack", "steam_idle_achievements_ack"
PACE = {"steam_idle_unlock_min_minutes": 1, "steam_idle_unlock_max_minutes": 1}


class Base(unittest.IsolatedAsyncioTestCase):
    def make(self, **over):
        over.setdefault("settings", {RISK: True, ACK: True})
        self.env = Env(**over)
        self.env.signed_in()
        self.addAsyncCleanup(self.env.ctl.shutdown)
        return self.env.ctl

    def data_dir(self):
        """A record directory removed only after the controller is shut down (cleanups run last-in first-out)."""
        return Path(self.enterContext(tempfile.TemporaryDirectory()))

    async def turn_off(self):
        self.env.module_enabled = False
        await self.env.ctl.set_module_enabled(False)

    async def turn_on(self):
        self.env.module_enabled = True
        await self.env.ctl.set_module_enabled(True)


class DisabledModuleTests(Base):
    def assertNothingLaunched(self):
        env = self.env
        self.assertEqual((env.status_calls, env.login_commands, env.drops_calls, env.library_calls, env.ach_calls),
                         ([], [], 0, 0, []))
        self.assertEqual((env.presences, env.unlock_calls), ([], []))

    async def test_every_command_is_refused_and_nothing_starts(self):
        ctl = self.make(module_enabled=False)
        refused = {
            "check": ctl.check(), "login": ctl.login(), "scan": ctl.scan(), "library_scan": ctl.library_scan(),
            "start": ctl.start(), "pause": ctl.pause(), "resume": ctl.resume(), "skip": ctl.skip(),
            "release": ctl.release_held(5), "ach_start": ctl.start_achievements(GamePlan(730)),
            "ach_pause": ctl.pause_achievements(), "ach_resume": ctl.resume_achievements(),
            "ach_skip": ctl.skip_achievements(), "ach_resume_interrupted": ctl.resume_interrupted(True),
            "ach_read": await ctl.achievements_of(730), "ack": ctl.acknowledge(False),
            "ach_ack": ctl.acknowledge_achievements(False), "ach_settings": ctl.set_achievements_settings(1, 2, True),
        }
        self.assertEqual({name: code for name, code in refused.items() if code != "module_disabled"}, {})
        await self.env.settle()
        self.assertNothingLaunched()
        self.assertEqual((self.env.settings[RISK], self.env.settings[ACK]), (True, True), "a refused ack changes nothing")
        self.assertNotIn("steam_idle_unlock_min_minutes", self.env.settings)

    async def test_stop_and_discarding_an_interrupted_run_stay_allowed(self):
        ctl = self.make(module_enabled=False)
        self.assertIsNone(ctl.stop())
        self.assertIsNone(ctl.stop_achievements())
        self.assertIsNone(ctl.discard_interrupted())

    async def test_state_reports_the_module_as_off_without_touching_anything(self):
        ctl = self.make(module_enabled=False)
        self.env.client_reads = 0
        state = ctl.state()
        self.assertEqual((state["available"], state["unavailableReason"], state["busy"]), (False, "module_disabled", False))
        self.assertEqual(state["steam"], {"running": False, "signedIn": False})
        self.assertEqual(set(state), set(Env().ctl.state()))
        self.assertEqual(self.env.client_reads, 0, "no Steam client read while the module is off")

    async def test_state_of_the_enabled_module_is_not_busy_and_available(self):
        state = self.make().state()
        self.assertEqual((state["available"], state["unavailableReason"], state["busy"]), (True, None, False))


class TurningOffTests(Base):
    async def test_a_running_farm_is_stopped_and_the_game_released(self):
        ctl = self.make(drops=[[gd(100, 2)]])
        self.assertIsNone(ctl.start())
        await self.env.wait_running()
        self.assertTrue(ctl.state()["busy"])
        await self.turn_off()
        self.assertFalse(self.env.presences[-1].running, "Steam must stop showing the game")
        state = ctl.state()
        self.assertEqual((state["farm"]["state"], state["busy"]), ("stopped", False))

    async def test_nothing_running_turns_off_quietly_and_twice(self):
        self.make()
        await self.turn_off()
        await self.turn_off()
        self.assertEqual(self.env.presences, [])

    async def test_an_achievements_run_stops_after_the_unlock_in_flight_and_keeps_its_record(self):
        tmp = self.data_dir()
        ctl = self.make(unlock_gate=threading.Event(), data_dir=tmp)
        self.env.settings.update(PACE)
        self.assertIsNone(ctl.library_scan())
        await self.env.settle()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        self.assertTrue(ctl.state()["busy"])
        self.env.module_enabled = False
        task = asyncio.get_running_loop().create_task(ctl.set_module_enabled(False))
        await asyncio.sleep(0.3)
        self.assertFalse(task.done(), "an unlock call in flight is waited for, never killed")
        self.env.unlock_gate.set()
        await asyncio.wait_for(task, 8)
        self.assertEqual(len(self.env.unlock_calls), 1)
        state = ctl.state()
        self.assertEqual((state["achievements"]["run"]["state"], state["busy"]), ("stopped", False))
        self.assertEqual(state["achievements"]["interrupted"]["kind"], "game")
        self.assertTrue((tmp / RECORD_FILE_NAME).exists(), "the record stays on disk")
        self.assertEqual(ctl.discard_interrupted(), None)
        self.assertFalse((tmp / RECORD_FILE_NAME).exists())

    async def test_the_interrupted_run_is_offered_again_after_turning_on(self):
        tmp = self.data_dir()
        ctl = self.make(unlock_gate=threading.Event(), data_dir=tmp)
        self.env.settings.update(PACE)
        self.assertIsNone(ctl.library_scan())
        await self.env.settle()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        self.env.unlock_gate.set()
        await self.turn_off()
        await self.turn_on()
        self.assertIsNotNone(ctl.state()["achievements"]["interrupted"])
        self.assertIsNone(ctl.resume_interrupted(False))
        self.assertTrue(ctl.state()["busy"])

    async def test_a_user_stop_still_removes_the_record(self):
        tmp = self.data_dir()
        ctl = self.make(unlock_gate=threading.Event(), data_dir=tmp)
        self.env.settings.update(PACE)
        self.assertIsNone(ctl.library_scan())
        await self.env.settle()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        ctl.stop_achievements()
        self.env.unlock_gate.set()
        await self.env.settle()
        self.assertIsNone(ctl.state()["achievements"]["interrupted"])
        self.assertFalse((tmp / RECORD_FILE_NAME).exists())


class TurningOnTests(Base):
    async def test_commands_work_again_without_a_new_controller(self):
        ctl = self.make(module_enabled=False, drops=[[gd(100, 2)]])
        self.assertEqual(ctl.start(), "module_disabled")
        await self.turn_on()
        self.assertIsNone(ctl.check())
        await self.env.settle()
        self.assertEqual(len(self.env.status_calls), 1)
        self.assertIsNone(ctl.start())
        await self.env.wait_running()
        self.assertEqual(ctl.state()["unavailableReason"], None)

    async def test_the_farm_can_run_again_after_being_turned_off(self):
        ctl = self.make(drops=[[gd(100, 2)]])
        self.assertIsNone(ctl.start())
        await self.env.wait_running()
        await self.turn_off()
        await self.turn_on()
        self.assertIsNone(ctl.start())
        for _ in range(300):
            if self.env.presences[-1].running:
                break
            await asyncio.sleep(0.01)
        self.assertEqual(len(self.env.presences), 2)
        self.assertTrue(self.env.presences[-1].running)


class FactoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_controller_asks_the_injected_module_switch(self):
        on = [True]
        ctl = create_controller(Path("nowhere"), Path("nowhere"), lambda key, default=False: default,
                                lambda k, v: None, inert=True, module_enabled=lambda: on[0])
        self.assertEqual(ctl.state()["unavailableReason"], "unsupported")
        on[0] = False
        self.assertEqual(ctl.state()["unavailableReason"], "module_disabled")
        self.assertEqual(ctl.check(), "module_disabled")
        await ctl.shutdown()


if __name__ == "__main__":
    unittest.main()
