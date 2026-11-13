"""Offline checks for the achievements side of the controller: every dependency is a fake, nothing sleeps for real."""
import asyncio
import json
import os
import re
import threading
import unittest
from pathlib import Path
from unittest import mock

from steam_idle import controller as controller_module
from steam_idle._helper import WRITE_GATE
from steam_idle.achievement_queue import GamePlan, LibraryPlan, SelectedPlan
from steam_idle.achievements import Achievement, AchievementsError, UnlockResult, _outcome
from steam_idle.community import CommunityError, OwnedGame
from steam_idle.controller import SteamClient, Tools
from steam_idle.test_controller import ACCOUNT, BASE_ID, OTHER, Env

ACK, RISK = "steam_idle_achievements_ack", "steam_idle_risk_ack"
RUN_KEYS = {"state", "mode", "current", "nextUnlockInSeconds", "queue", "finished", "totals", "lastError", "paused",
            "suspended"}
REFUSALS = {"risk_not_acknowledged", "achievements_not_acknowledged", "unavailable", "steam_not_running",
            "steam_signed_out", "community_signed_out", "account_mismatch", "busy"}


def ach(name, achieved=False, hidden=False):
    return Achievement(name, name, "d", hidden, achieved, 7 if achieved else 0)


def run_of(ctl):
    return ctl.state()["achievements"]["run"]


class Base(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await self.env.ctl.shutdown()

    def make(self, **over):
        over.setdefault("settings", {RISK: True, ACK: True})
        self.env = Env(**over)
        self.env.signed_in()
        return self.env.ctl

    async def wait_run(self, state):
        for _ in range(400):
            if run_of(self.env.ctl)["state"] == state:
                return
            await asyncio.sleep(0.01)
        raise AssertionError(f"run never reached {state}: {run_of(self.env.ctl)['state']}")

    async def ready(self, ctl=None):
        """A cached library so a start needs no read."""
        ctl = ctl or self.env.ctl
        self.assertIsNone(ctl.library_scan())
        await self.env.settle()

    def paced(self):
        self.env.settings.update({"steam_idle_unlock_min_minutes": 1, "steam_idle_unlock_max_minutes": 1})

    async def blocked_paced_run(self, **over):
        """A paced run whose first unlock call is blocked in the worker thread; returns the controller."""
        ctl = self.make(unlock_gate=threading.Event(), **over)
        self.paced()
        await self.ready()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        return ctl

    async def assert_stopped_after_one_write(self):
        self.env.unlock_gate.set()
        await self.env.settle()
        self.assertEqual((run_of(self.env.ctl)["state"], len(self.env.unlock_calls)), ("stopped", 1))


class StateTests(Base):
    async def test_defaults_and_exact_shape(self):
        ctl = self.make(settings={})
        state = ctl.state()
        self.assertEqual(state["achievements"], {
            "acknowledged": False, "settings": {"minMinutes": 0, "maxMinutes": 0, "skipHidden": True},
            "run": {"state": "idle", "mode": None, "current": None, "nextUnlockInSeconds": None, "queue": [],
                    "finished": [], "totals": {"unlocked": 0, "already": 0, "skipped": 0, "rejected": 0, "failed": 0},
                    "lastError": None, "paused": False, "suspended": False}})
        self.assertEqual(state["library"], {"count": None, "status": "none", "ageSeconds": None})

    async def test_payload_is_json_free_of_ids_during_and_after_a_run(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        for _ in range(3):
            await asyncio.sleep(0.02)
            dumped = json.dumps(ctl.state())
            self.assertIsNone(re.search(r"\d{17}", dumped))
            self.assertNotIn(str(ACCOUNT), dumped)
        self.env.on_sleep = lambda: None
        await self.env.settle()
        self.assertEqual(set(run_of(ctl)), RUN_KEYS)

    async def test_write_gate_is_absent_from_the_environment_after_a_run(self):
        ctl = self.make()
        await self.ready()
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        self.assertNotIn(WRITE_GATE, os.environ)
        self.assertEqual(run_of(ctl)["state"], "done")


class SettingsTests(Base):
    async def test_acknowledgement_is_stored_and_withdrawal_stops_a_running_run(self):
        ctl = self.make(settings={RISK: True})
        self.assertFalse(ctl.state()["achievements"]["acknowledged"])
        ctl.acknowledge_achievements(True)
        self.assertIs(self.env.settings[ACK], True)
        self.assertTrue(ctl.state()["achievements"]["acknowledged"])
        self.paced()
        self.env.unlock_gate = threading.Event()
        await self.ready()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        ctl.acknowledge_achievements(False)
        self.assertIs(self.env.settings[ACK], False)
        await self.assert_stopped_after_one_write()

    async def test_withdrawing_the_general_acknowledgement_stops_a_running_run(self):
        ctl = await self.blocked_paced_run()
        ctl.acknowledge(False)
        self.assertIs(self.env.settings[RISK], False)
        await self.assert_stopped_after_one_write()

    async def test_the_write_guard_also_checks_the_general_acknowledgement(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        self.env.on_sleep = lambda: self.env.settings.update({RISK: False}) if self.env.unlock_calls else None
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"], len(self.env.unlock_calls)), ("stopped", "not_acknowledged", 1))

    async def test_a_guard_that_raises_stops_the_run_without_another_write(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        loop_thread = threading.get_ident()
        real = ctl._client_state

        def client():
            if self.env.unlock_calls and threading.get_ident() != loop_thread:  # only the step thread (the guard)
                raise OSError("registry unreadable")
            return real()
        ctl._client_state = client
        with self.assertLogs("steam_idle", "ERROR"):
            ctl.start_achievements(GamePlan(100))
            await self.env.settle()
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"], len(self.env.unlock_calls)), ("stopped", "internal_error", 1))

    async def test_withdrawing_the_acknowledgement_stops_the_run_before_the_next_write(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        self.env.on_sleep = lambda: ctl.acknowledge_achievements(False) if self.env.unlock_calls else None
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        self.assertEqual(run_of(ctl)["state"], "stopped")
        self.assertEqual(len(self.env.unlock_calls), 1)

    async def test_settings_are_stored_and_validated(self):
        ctl = self.make()
        self.assertIsNone(ctl.set_achievements_settings(2, 5, False))
        self.assertEqual(ctl.state()["achievements"]["settings"], {"minMinutes": 2, "maxMinutes": 5, "skipHidden": False})
        self.assertEqual(self.env.settings["steam_idle_unlock_min_minutes"], 2)
        self.assertIsNone(ctl.set_achievements_settings(0, 1440, True))
        bad = [(-1, 5, True), (0, 1441, True), (5, 2, True), (True, 5, True), (1.5, 5, True), ("1", 5, True),
               (1, 5, "yes"), (1, 5, 1), (None, 5, True)]
        for args in bad:
            with self.subTest(args=args):
                self.assertEqual(ctl.set_achievements_settings(*args), "invalid_request")
        self.assertEqual(ctl.state()["achievements"]["settings"], {"minMinutes": 0, "maxMinutes": 1440, "skipHidden": True})

    async def test_pace_settings_apply_to_the_next_run(self):
        ctl = self.make()
        await self.ready()
        ctl.set_achievements_settings(1, 1, True)
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        self.assertEqual([c[3] for c in self.env.unlock_calls], [["A"], ["B"]])


class RefusalTests(Base):
    def calls(self, ctl):
        async def read():
            return await ctl.achievements_of(100)
        return {"start": lambda: ctl.start_achievements(GamePlan(100)), "library_scan": ctl.library_scan, "read": read}

    async def refusal(self, call):
        result = call()
        return await result if asyncio.iscoroutine(result) else result

    async def test_every_refusal_code_for_every_route(self):
        for name in ("start", "library_scan", "read"):
            with self.subTest(route=name):
                ctl = self.make()
                call = self.calls(ctl)[name]
                env, seen = self.env, set()

                async def expect(code):
                    seen.add(code)
                    self.assertEqual(await self.refusal(call), code)

                env.tools = Tools("node_missing")
                await expect("unavailable")
                env.tools = Tools(None, Path("h.exe"), ("node", "s.js"))
                env.settings[RISK] = False
                await expect("risk_not_acknowledged")
                env.settings[RISK] = True
                if name != "library_scan":
                    env.settings[ACK] = False
                    await expect("achievements_not_acknowledged")
                    env.settings[ACK] = True
                env.client = SteamClient(False, 0)
                await expect("steam_not_running")
                env.client = SteamClient(True, 0)
                await expect("steam_signed_out")
                env.client = SteamClient(True, ACCOUNT)
                ctl._session = "unknown"
                await expect("community_signed_out")
                ctl._session, ctl._checked_account = "signed_in", OTHER
                await expect("account_mismatch")
                ctl._session = "account_mismatch"
                await expect("account_mismatch")
                ctl._session = "checking"
                ctl._check_task = asyncio.get_running_loop().create_future()
                await expect("busy")
                ctl._check_task.cancel()
                expected = REFUSALS - ({"achievements_not_acknowledged"} if name == "library_scan" else set())
                self.assertEqual(seen, expected)
                self.assertEqual((env.unlock_calls, env.ach_calls, env.library_calls), ([], [], 0))
                await ctl.shutdown()

    async def test_commands_refuse_when_unavailable_and_are_harmless_without_a_run(self):
        ctl = self.make(tools=Tools("unsupported"))
        for call in (ctl.stop_achievements, ctl.pause_achievements, ctl.resume_achievements, ctl.skip_achievements):
            self.assertEqual(call(), "unavailable")
        self.env.tools = Tools(None, Path("h.exe"), ("node", "s.js"))
        for call in (ctl.stop_achievements, ctl.pause_achievements, ctl.resume_achievements, ctl.skip_achievements):
            self.assertIsNone(call())
        self.assertEqual(run_of(ctl)["state"], "idle")

    async def test_library_games_is_none_without_a_cache(self):
        self.assertIsNone(self.make().library_games())


class ExclusionTests(Base):
    async def test_achievements_run_blocks_the_card_farm_scan_and_a_second_start(self):
        ctl = self.make(unlock_gate=threading.Event())
        await self.ready()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        self.assertEqual(ctl.start(), "busy")
        self.assertEqual(ctl.scan(), "busy")
        self.assertEqual(ctl.library_scan(), "busy")
        self.assertEqual(ctl.start_achievements(GamePlan(100)), "busy")
        self.assertEqual(await ctl.achievements_of(100), "busy")
        self.env.unlock_gate.set()
        await self.env.settle()
        self.assertEqual(self.env.presences, [])

    async def test_card_farm_run_blocks_an_achievements_start(self):
        from steam_idle.test_controller import gd
        ctl = self.make(drops=[[gd(100, 5)]], freeze_at=3)
        await self.ready()
        self.assertIsNone(ctl.start())
        await self.env.wait_running()
        self.assertEqual(ctl.start_achievements(GamePlan(100)), "busy")
        self.assertEqual(await ctl.achievements_of(100), "busy")
        self.assertEqual(self.env.unlock_calls, [])

    async def test_login_and_check_are_busy_during_a_run(self):
        ctl = self.make(unlock_gate=threading.Event())
        await self.ready()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        self.assertEqual((ctl.login(), ctl.check()), ("busy", "busy"))
        self.env.unlock_gate.set()
        await self.env.settle()
        self.assertEqual(self.env.login_commands, [])
        self.assertEqual(self.env.status_calls, [])
        self.assertIsNone(ctl.check())

    async def test_login_and_check_are_busy_during_an_achievements_read(self):
        ctl = self.make(ach_gate=threading.Event())
        task = asyncio.get_running_loop().create_task(ctl.achievements_of(5))
        self.assertTrue(await asyncio.to_thread(self.env.ach_entered.wait, 5))
        self.assertEqual((ctl.login(), ctl.check()), ("busy", "busy"))
        self.env.ach_gate.set()
        await task

    async def test_two_start_requests_back_to_back_the_second_is_busy(self):
        ctl = self.make()
        await self.ready()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        self.assertEqual(ctl.start_achievements(GamePlan(100)), "busy")
        await self.env.settle()
        self.assertEqual(len(self.env.unlock_calls), 1)

    async def test_a_farm_start_during_the_achievements_prepare_phase_is_busy(self):
        ctl = self.make(read_gate=threading.Event())
        ctl._read_library_fn = lambda *a, **k: (self.env.read_entered.set(), self.env.read_gate.wait(5), self.env.library)[2]
        self.assertIsNone(ctl.start_achievements(LibraryPlan((), [])))
        self.assertTrue(await asyncio.to_thread(self.env.read_entered.wait, 5))
        self.assertEqual(ctl.start(), "busy")
        self.env.read_gate.set()
        await self.env.settle()
        self.assertEqual(self.env.presences, [])

    async def test_the_farm_start_has_the_same_closed_check_as_the_other_starts(self):
        ctl = self.make()
        await ctl.shutdown()
        self.assertEqual(ctl.start(), "busy")
        self.assertEqual(self.env.presences, [])

    async def test_a_new_run_can_start_after_the_previous_one_ended(self):
        ctl = self.make()
        await self.ready()
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        self.assertIsNone(ctl.start_achievements(GamePlan(100)))
        await self.env.settle()
        self.assertEqual(len(self.env.unlock_calls), 2)


class LibraryTests(Base):
    async def test_scan_flow_and_cached_list(self):
        ctl = self.make()
        self.assertIsNone(ctl.library_scan())
        self.assertEqual(ctl.state()["library"]["status"], "scanning")
        self.assertEqual(ctl.library_scan(), "busy")
        await self.env.settle()
        self.assertEqual(ctl.state()["library"], {"count": 3, "status": "ready", "ageSeconds": 0.0})
        self.assertEqual(ctl.library_games(), [{"appId": 1, "name": "a", "playtimeMinutes": 0},
                                               {"appId": 2, "name": "b", "playtimeMinutes": 0},
                                               {"appId": 3, "name": "c", "playtimeMinutes": 0}])
        self.env.now += 30
        self.assertEqual(ctl.state()["library"]["ageSeconds"], 30.0)

    async def test_failed_scan_keeps_the_previous_list_and_session_errors_drop_it(self):
        ctl = self.make()
        await self.ready()
        self.env.read_library = mock.Mock(side_effect=CommunityError("timeout"))
        ctl._read_library_fn = self.env.read_library
        ctl.library_scan()
        await self.env.settle()
        self.assertEqual((ctl.state()["library"]["status"], ctl.state()["library"]["count"]), ("failed", 3))
        self.env.read_library = mock.Mock(side_effect=CommunityError("signed_out"))
        ctl._read_library_fn = self.env.read_library
        ctl.library_scan()
        await self.env.settle()
        self.assertEqual(ctl.state()["library"], {"count": None, "status": "none", "ageSeconds": None})
        self.assertEqual(ctl.state()["community"]["session"], "signed_out")

    async def test_failed_scan_without_a_list(self):
        ctl = self.make()
        ctl._read_library_fn = mock.Mock(side_effect=CommunityError("failed:boom"))
        ctl.library_scan()
        await self.env.settle()
        self.assertEqual(ctl.state()["library"], {"count": None, "status": "failed", "ageSeconds": None})
        self.assertIsNone(ctl.library_games())

    async def test_cache_is_dropped_when_the_account_changes(self):
        ctl = self.make()
        await self.ready()
        self.env.client = SteamClient(True, OTHER)
        self.assertEqual(ctl.state()["library"]["status"], "none")
        self.assertIsNone(ctl.library_games())

    async def test_shutdown_kills_a_blocked_library_read(self):
        ctl = self.make(read_gate=threading.Event())
        ctl._read_library_fn = lambda *a, **k: (self.env.read_entered.set(), self.env.read_gate.wait(5), [])[2]
        ctl.library_scan()
        self.assertTrue(await asyncio.to_thread(self.env.read_entered.wait, 5))
        await asyncio.wait_for(ctl.shutdown(), 8)
        self.assertEqual(self.env.kills, 1)
        self.assertEqual(ctl.library_scan(), "busy")

    async def test_a_card_farm_run_fills_the_cache(self):
        from steam_idle.test_controller import gd
        ctl = self.make(drops=[[gd(100, 1)], [gd(100, 0)]])
        ctl.start()
        await self.env.settle()
        self.assertEqual(ctl.state()["library"]["count"], 3)
        self.assertEqual(ctl.state()["library"]["status"], "ready")


class ReadTests(Base):
    async def test_happy_path_reads_off_the_loop_for_the_current_account(self):
        ctl = self.make()
        self.env.ach[5] = [ach("A", achieved=True), ach("B", hidden=True)]
        result = await ctl.achievements_of(5)
        self.assertEqual(result, [
            {"apiName": "A", "name": "A", "description": "d", "hidden": False, "achieved": True, "unlockTime": 7},
            {"apiName": "B", "name": "B", "description": "d", "hidden": True, "achieved": False, "unlockTime": 0}])
        helper, steam_id, app_id, thread = self.env.ach_calls[0]
        self.assertEqual((helper, steam_id, app_id), (Path("helper.exe"), str(BASE_ID + ACCOUNT), 5))
        self.assertNotEqual(thread, threading.get_ident())
        self.assertEqual(self.env.unlock_calls, [])
        self.assertEqual(await ctl.achievements_of(5), result, "the busy flag is released")

    async def test_failure_raises_and_releases_the_flag(self):
        ctl = self.make()
        self.env.ach[5] = AchievementsError("stats_unavailable")
        with self.assertRaises(AchievementsError) as caught, self.assertLogs("steam_idle.controller", "ERROR"):
            await ctl.achievements_of(5)
        self.assertEqual(caught.exception.code, "stats_unavailable")
        self.env.ach[5] = []
        self.assertEqual(await ctl.achievements_of(5), [])

    async def test_a_cancelled_request_keeps_the_reading_flag_until_the_thread_finished(self):
        ctl = self.make(ach_gate=threading.Event())
        task = asyncio.get_running_loop().create_task(ctl.achievements_of(5))
        self.assertTrue(await asyncio.to_thread(self.env.ach_entered.wait, 5))
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual((ctl.login(), ctl.library_scan()), ("busy", "busy"), "the helper read is still running")
        self.env.ach_gate.set()
        for _ in range(200):
            if ctl.login() is None:
                break
            await asyncio.sleep(0.01)
        else:
            self.fail("the flag was never released")

    async def test_shutdown_kills_a_blocked_read(self):
        ctl = self.make(ach_gate=threading.Event())
        task = asyncio.get_running_loop().create_task(ctl.achievements_of(5))
        self.assertTrue(await asyncio.to_thread(self.env.ach_entered.wait, 5))
        await asyncio.wait_for(ctl.shutdown(), 8)
        self.assertEqual(self.env.kills, 1)
        await asyncio.wait_for(task, 5)
        self.assertEqual(await ctl.achievements_of(5), "busy", "no read after shutdown")


class RunTests(Base):
    async def test_selected_shape(self):
        ctl = self.make()
        await self.ready()
        self.assertIsNone(ctl.start_achievements(SelectedPlan(100, ["B"])))
        self.assertEqual(run_of(ctl)["state"], "idle", "start only queues; the loop applies it")
        await self.env.settle()
        helper, steam_id, app_id, names = self.env.unlock_calls[0]
        self.assertEqual((helper, steam_id, app_id, names), (Path("helper.exe"), str(BASE_ID + ACCOUNT), 100, ["B"]))
        run = run_of(ctl)
        self.assertEqual((run["state"], run["mode"], run["totals"]["unlocked"]), ("done", "selected", 1))
        self.assertEqual(run["finished"][0]["name"], "App 100")

    async def test_game_shape_uses_the_library_name_and_all_missing(self):
        ctl = self.make()
        await self.ready()
        ctl.start_achievements(GamePlan(2))
        await self.env.settle()
        self.assertEqual(self.env.unlock_calls[0][2:], (2, ["A", "B"]))
        self.assertEqual(run_of(ctl)["finished"][0]["name"], "b")

    async def test_library_shape_from_the_cache_honours_exclude_and_skip_hidden(self):
        ctl = self.make()
        self.env.ach[3] = [ach("H", hidden=True), ach("Z")]
        await self.ready()
        ctl.start_achievements(LibraryPlan((), [1]))
        await self.env.settle()
        self.assertEqual([(c[2], c[3]) for c in self.env.unlock_calls], [(2, ["A", "B"]), (3, ["Z"])])
        run = run_of(ctl)
        self.assertEqual((run["mode"], run["state"], run["totals"]["skipped"]), ("library", "done", 1))
        self.assertEqual(self.env.library_calls, 1)

    async def test_library_shape_without_a_cache_reads_it_first_in_state_scanning(self):
        ctl = self.make(read_gate=threading.Event())
        ctl._read_library_fn = lambda *a, **k: (self.env.read_entered.set(), self.env.read_gate.wait(5), self.env.library)[2]
        self.assertIsNone(ctl.start_achievements(LibraryPlan((), [])))
        self.assertTrue(await asyncio.to_thread(self.env.read_entered.wait, 5))
        run = run_of(ctl)
        self.assertEqual((run["state"], run["mode"]), ("scanning", "library"))
        self.assertEqual(ctl.start_achievements(GamePlan(1)), "busy")
        self.env.read_gate.set()
        await self.env.settle()
        self.assertEqual(len(self.env.unlock_calls), 3)
        self.assertEqual(ctl.state()["library"]["status"], "ready")

    async def test_library_read_failure_stops_with_a_code(self):
        ctl = self.make()
        ctl._read_library_fn = mock.Mock(side_effect=CommunityError("timeout"))
        ctl.start_achievements(LibraryPlan((), []))
        with self.assertLogs("steam_idle.achievements_run", "ERROR"):
            await self.env.settle()
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"]), ("stopped", "library_failed"))
        self.assertEqual(self.env.unlock_calls, [])

    async def test_stop_during_the_library_read_never_starts_the_run(self):
        ctl = self.make(read_gate=threading.Event())
        ctl._read_library_fn = lambda *a, **k: (self.env.read_entered.set(), self.env.read_gate.wait(5), self.env.library)[2]
        ctl.start_achievements(LibraryPlan((), []))
        self.assertTrue(await asyncio.to_thread(self.env.read_entered.wait, 5))
        ctl.stop_achievements()
        self.env.read_gate.set()
        await self.env.settle()
        self.assertEqual((run_of(ctl)["state"], self.env.unlock_calls, self.env.ach_calls), ("stopped", [], []))

    async def test_pause_resume_skip_and_stop_are_forwarded(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        states = []

        def drive():
            states.append(run_of(ctl)["state"])
            count = len(self.env.sleeps)
            if count == 3:
                ctl.pause_achievements()
            elif count == 6:
                ctl.resume_achievements()
            elif count == 9:
                ctl.skip_achievements()
            elif count == 12:
                ctl.stop_achievements()

        self.env.on_sleep = drive
        ctl.start_achievements(LibraryPlan((), []))
        await self.env.settle()
        self.assertIn("paused", states)
        self.assertIn("waiting", states[states.index("paused"):])
        self.assertTrue(any(f["note"] == "skipped_by_user" for f in run_of(ctl)["finished"]))
        self.assertEqual(run_of(ctl)["state"], "stopped")

    async def test_suspend_is_forwarded_and_blocks_writes_until_released(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        seen = []

        def drive():
            count = len(self.env.sleeps)
            if count == 2:
                ctl.set_suspended(True)
                seen.append(len(self.env.unlock_calls))
            elif count == 8:
                seen.append((run_of(ctl)["state"], len(self.env.unlock_calls)))
                ctl.set_suspended(False)

        self.env.on_sleep = drive
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        self.assertEqual(seen[1], ("suspended", seen[0]), "no write while suspended")
        self.assertEqual(len(self.env.unlock_calls), 2)
        self.assertEqual(run_of(ctl)["state"], "done")

    async def test_account_change_mid_run_stops_with_account_changed(self):
        ctl = self.make()
        self.paced()
        await self.ready()
        self.env.on_sleep = lambda: setattr(self.env, "client", SteamClient(True, OTHER)) if self.env.unlock_calls else None
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"], len(self.env.unlock_calls)), ("stopped", "account_changed", 1))

    async def test_account_change_during_a_blocked_read_writes_nothing(self):
        ctl = self.make(ach_gate=threading.Event())
        await self.ready()
        ctl.start_achievements(GamePlan(100))
        self.assertTrue(await asyncio.to_thread(self.env.ach_entered.wait, 5))
        self.env.client = SteamClient(True, OTHER)
        self.env.ach_gate.set()
        await self.env.settle()
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"], self.env.unlock_calls), ("stopped", "account_changed", []))

    async def test_uncertain_outcome_stops_the_run(self):
        ctl = self.make()
        self.env.unlock_script = lambda app_id, names: _outcome([UnlockResult(n, "pending") for n in names], "timeout")
        await self.ready()
        ctl.start_achievements(LibraryPlan((), []))
        await self.env.settle()
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"], len(self.env.unlock_calls)), ("stopped", "unlock_uncertain", 1))

    async def test_shutdown_waits_for_an_unlock_in_flight_and_never_kills_it(self):
        ctl = self.make(unlock_gate=threading.Event())
        finished = []
        self.env.unlock_script = lambda app_id, names: (finished.append(1), _outcome(
            [UnlockResult(n, "unlocked") for n in names], "yes"))[1]
        self.env.ach[100] = [ach(f"N{i}") for i in range(450)]
        await self.ready()
        ctl.start_achievements(GamePlan(100))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        asyncio.get_running_loop().call_later(0.4, self.env.unlock_gate.set)
        with mock.patch.object(controller_module, "_RELEASE_SECONDS", 0.1), self.assertLogs("steam_idle.controller", "INFO") as logs:
            await asyncio.wait_for(ctl.shutdown(), 8)
        self.assertEqual(finished, [1], "shutdown returned before the unlock call did")
        self.assertIn("unlock in flight at shutdown, waiting", [r.getMessage() for r in logs.records])
        self.assertEqual(self.env.kills, 1, "only the reads are killed")
        await asyncio.sleep(0.2)
        self.assertEqual(len(self.env.unlock_calls), 1)

    async def test_shutdown_budget_covers_the_unlock_wait(self):
        self.make()
        self.assertGreaterEqual(controller_module.SHUTDOWN_BUDGET_SECONDS,
                                controller_module._RELEASE_SECONDS + controller_module._UNLOCK_WAIT_SECONDS)

    async def test_shutdown_during_a_blocked_unlock_closes_the_queue_and_writes_nothing_more(self):
        ctl = self.make(unlock_gate=threading.Event())
        self.env.ach[100] = [ach(f"N{i}") for i in range(450)]
        await self.ready()
        ctl.start_achievements(GamePlan(100))
        self.assertTrue(await asyncio.to_thread(self.env.unlock_entered.wait, 5))
        with (mock.patch.object(controller_module, "_RELEASE_SECONDS", 0.2),
              mock.patch.object(controller_module, "_UNLOCK_WAIT_SECONDS", 0.3),
              self.assertLogs("steam_idle.controller", "WARNING") as logs):
            await asyncio.wait_for(ctl.shutdown(), 8)
        self.assertTrue(any("incomplete" in r.getMessage() for r in logs.records))
        self.env.unlock_gate.set()
        await asyncio.sleep(0.2)
        self.assertEqual(len(self.env.unlock_calls), 1)
        self.assertEqual(run_of(ctl)["state"], "stopped")
        self.assertEqual(ctl.start_achievements(GamePlan(100)), "busy")

    async def test_a_crash_in_the_step_stops_the_run_with_internal_error(self):
        ctl = self.make()
        await self.ready()
        ctl._achv._queue.step = mock.Mock(side_effect=RuntimeError("boom"))
        with self.assertLogs("steam_idle.achievements_run", "ERROR"):
            ctl.start_achievements(GamePlan(100))
            await self.env.settle()
        self.assertIsNone(ctl._achv.task.exception())
        run = run_of(ctl)
        self.assertEqual((run["state"], run["lastError"], self.env.unlock_calls), ("stopped", "internal_error", []))

    async def test_start_after_shutdown_never_writes(self):
        ctl = self.make()
        await self.ready()
        await ctl.shutdown()
        ctl.start_achievements(GamePlan(100))
        await self.env.settle()
        self.assertEqual((self.env.unlock_calls, self.env.ach_calls), ([], []))


if __name__ == "__main__":
    unittest.main()
