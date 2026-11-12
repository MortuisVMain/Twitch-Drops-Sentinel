"""Offline checks for the service-facing controller: every dependency is a fake, nothing sleeps for real."""
import asyncio
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from steam_idle.community import CommunityError, GameDrops, OwnedGame
from steam_idle.controller import (SteamClient, SteamIdleController, Tools, create_controller, find_tools,
                                   read_steam_client, steam_id64)
from steam_idle.farm import FarmRules

ACCOUNT, OTHER = 38734272, 1234567
BASE_ID = 76561197960265728
FARM_KEYS = {"state", "current", "queue", "done", "failed", "totalDropsRemaining", "lastReadAgeSeconds",
             "lastError", "paused", "suspended"}
REFUSALS = {"risk_not_acknowledged", "unavailable", "steam_not_running", "steam_signed_out",
            "community_signed_out", "account_mismatch", "busy"}


def gd(app_id, drops):
    return GameDrops(app_id, f"Game {app_id}", drops, 1.0)


class FakePresence:
    def __init__(self, env, helper, steam_id):
        self.env, self.helper, self.steam_id, self.app_id, self.running = env, helper, steam_id, None, False

    def start(self, app_id):
        self.app_id, self.running = app_id, True

    def stop(self):
        self.running = False

    def is_running(self):
        return self.running


class Env:
    """Mutable fakes behind one controller; `sleep` advances the clock instead of waiting."""

    def __init__(self, **over):
        self.settings = {"steam_idle_risk_ack": True}
        self.tools = Tools(None, Path("helper.exe"), ("node", "steam-community.js"))
        self.client = SteamClient(True, ACCOUNT)
        self.client_reads = 0
        self.drops = [[gd(100, 2)], [gd(100, 0)]]
        self.library = [OwnedGame(1, "a", 0), OwnedGame(2, "b", 0), OwnedGame(3, "c", 0)]
        self.library_calls = self.drops_calls = 0
        self.expected_seen, self.status_calls, self.status_error = [], [], None
        self.presences, self.login_commands, self.login_gate = [], [], None
        self.now, self.sleeps, self.on_sleep, self.freeze_at = 1000.0, [], None, None
        self.__dict__.update(over)
        self.ctl = SteamIdleController(
            get_setting=lambda key, default=False: self.settings.get(key, default),
            set_setting=self.settings.__setitem__,
            find_tools=lambda: self.tools, client_state=self.read_client,
            read_drops=self.read_drops, read_library=self.read_library, read_status=self.read_status,
            presence_factory=self.make_presence, run_login=self.run_login,
            clock=lambda: self.now, sleep=self.sleep, rules=FarmRules(recheck_seconds=10.0))

    def read_client(self):
        self.client_reads += 1
        return self.client

    def read_drops(self, command, expected_steam_id64=None):
        self.drops_calls += 1
        self.expected_seen.append(expected_steam_id64)
        item = self.drops.pop(0) if len(self.drops) > 1 else self.drops[0]
        if isinstance(item, Exception):
            raise item
        return item

    def read_library(self, command, expected_steam_id64=None):
        self.library_calls += 1
        return self.library

    def read_status(self, command, expected_steam_id64=None):
        self.status_calls.append((tuple(command), expected_steam_id64))
        if self.status_error:
            raise CommunityError(self.status_error)

    def make_presence(self, helper, steam_id):
        self.presences.append(FakePresence(self, helper, steam_id))
        return self.presences[-1]

    async def run_login(self, command):
        self.login_commands.append(tuple(command))
        if self.login_gate is not None:
            await self.login_gate.wait()

    async def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds
        if self.on_sleep:
            self.on_sleep()
        if self.freeze_at is not None and len(self.sleeps) >= self.freeze_at:
            await asyncio.sleep(3600)
        await asyncio.sleep(0)

    async def settle(self):
        await asyncio.wait_for(self.ctl.join(), 10)

    def signed_in(self):
        self.ctl._session = "signed_in"
        self.ctl._checked_account = ACCOUNT

    async def wait_running(self):
        for _ in range(300):
            if self.presences and self.presences[-1].running:
                return
            await asyncio.sleep(0.01)
        raise AssertionError("the farm never held a game")


class ToolsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "app"
        self.engine = self.root / "giveaways_engine"
        self.engine.mkdir(parents=True)
        (self.engine / "steam-community.js").write_text("//", encoding="utf-8")
        self.installed = self.root / "steam_idle" / "SteamIdleProbe.exe"
        self.dev = self.root / "tools" / "steam_idle_probe" / "bin" / "Release" / "net10.0-windows" / "SteamIdleProbe.exe"

    def put(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"")

    def find(self, which=lambda name: "C:/node.exe", platform_name="win32"):
        return find_tools(self.root, self.engine, which=which, platform_name=platform_name)

    def test_installed_helper_wins_over_the_dev_build(self):
        self.put(self.installed)
        self.put(self.dev)
        tools = self.find()
        self.assertEqual((tools.unavailable, tools.helper), (None, self.installed))
        self.assertEqual(tools.community, ("C:/node.exe", str(self.engine / "steam-community.js")))

    def test_dev_build_is_the_fallback(self):
        self.put(self.dev)
        self.assertEqual(self.find().helper, self.dev)

    def test_helper_missing(self):
        self.assertEqual(self.find().unavailable, "helper_missing")

    def test_node_missing_and_engine_script_missing(self):
        self.put(self.dev)
        self.assertEqual(self.find(which=lambda name: None).unavailable, "node_missing")
        (self.engine / "steam-community.js").unlink()
        self.assertEqual(self.find().unavailable, "node_missing")

    def test_not_windows_is_unsupported(self):
        self.put(self.dev)
        self.assertEqual(self.find(platform_name="linux").unavailable, "unsupported")


class RegistryTests(unittest.TestCase):
    def read(self, values, alive=True):
        return read_steam_client(values.get, lambda pid: alive)

    def test_running_and_signed_in(self):
        self.assertEqual(self.read({"pid": 4242, "ActiveUser": ACCOUNT}), SteamClient(True, ACCOUNT))

    def test_signed_out_client(self):
        self.assertEqual(self.read({"pid": 4242, "ActiveUser": 0}), SteamClient(True, 0))

    def test_dead_pid_or_missing_key_is_not_running(self):
        self.assertEqual(self.read({"pid": 4242, "ActiveUser": ACCOUNT}, alive=False), SteamClient(False, 0))
        self.assertEqual(self.read({}), SteamClient(False, 0))
        self.assertEqual(self.read({"pid": 0, "ActiveUser": ACCOUNT}), SteamClient(False, 0))


class ControllerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        ctl = getattr(self, "env", None) and self.env.ctl
        if ctl is not None:
            await ctl.shutdown()

    def make(self, **over):
        self.env = Env(**over)
        return self.env.ctl

    def test_steam_id64_adds_the_account_id(self):
        self.assertEqual(steam_id64(ACCOUNT), str(BASE_ID + ACCOUNT))

    # state payload
    async def test_state_payload_shape_is_exact_and_free_of_ids(self):
        ctl = self.make()
        self.env.signed_in()
        self.assertEqual(ctl.start(), None)
        await self.env.settle()
        state = ctl.state()
        self.assertEqual(set(state), {"available", "unavailableReason", "riskAcknowledged", "steam", "community", "farm", "library"})
        self.assertEqual(set(state["steam"]), {"running", "signedIn"})
        self.assertEqual(set(state["community"]), {"session", "checkedAgeSeconds"})
        self.assertEqual(set(state["farm"]), FARM_KEYS)
        self.assertEqual(set(state["library"]), {"count"})
        dumped = json.dumps(state)
        self.assertIsNone(re.search(r"\d{17}", dumped))
        self.assertIsNone(re.search(str(ACCOUNT), dumped))

    async def test_initial_state(self):
        state = self.make().state()
        self.assertEqual((state["available"], state["unavailableReason"], state["riskAcknowledged"]), (True, None, True))
        self.assertEqual(state["steam"], {"running": True, "signedIn": True})
        self.assertEqual(state["community"], {"session": "unknown", "checkedAgeSeconds": None})
        self.assertEqual((state["farm"]["state"], state["library"]["count"]), ("idle", None))

    async def test_unavailable_state_never_reads_the_client(self):
        ctl = self.make(tools=Tools("helper_missing"))
        state = ctl.state()
        self.assertEqual((state["available"], state["unavailableReason"]), (False, "helper_missing"))
        self.assertEqual(state["steam"], {"running": False, "signedIn": False})
        self.assertEqual(self.env.client_reads, 0)

    # refusals
    async def test_every_refusal_code(self):
        env = Env()
        ctl = env.ctl
        seen = set()

        def expect(code):
            seen.add(code)
            self.assertEqual(ctl.start(), code)

        env.tools = Tools("node_missing")
        expect("unavailable")
        env.tools = Tools(None, Path("h.exe"), ("node", "s.js"))
        env.settings["steam_idle_risk_ack"] = False
        expect("risk_not_acknowledged")
        env.settings["steam_idle_risk_ack"] = True
        env.client = SteamClient(False, 0)
        expect("steam_not_running")
        env.client = SteamClient(True, 0)
        expect("steam_signed_out")
        env.client = SteamClient(True, ACCOUNT)
        expect("community_signed_out")
        ctl._session = "signed_in"
        ctl._checked_account = OTHER
        expect("account_mismatch")
        ctl._session = "account_mismatch"
        expect("account_mismatch")
        ctl._session = "checking"
        ctl._check_task = asyncio.get_running_loop().create_future()
        expect("busy")
        ctl._check_task.cancel()
        self.assertEqual(seen, REFUSALS)
        self.assertEqual(env.presences, [])

    async def test_farm_commands_refuse_when_unavailable_and_are_harmless_without_a_run(self):
        ctl = self.make(tools=Tools("unsupported"))
        for call in (ctl.stop, ctl.pause, ctl.resume, ctl.skip):
            self.assertEqual(call(), "unavailable")
        self.env.tools = Tools(None, Path("h.exe"), ("node", "s.js"))
        for call in (ctl.stop, ctl.pause, ctl.resume, ctl.skip):
            self.assertIsNone(call())
        self.assertEqual(ctl.state()["farm"]["state"], "idle")

    # acknowledgement
    async def test_acknowledge_is_stored_in_settings(self):
        ctl = self.make(settings={})
        self.assertFalse(ctl.state()["riskAcknowledged"])
        ctl.acknowledge(True)
        self.assertIs(self.env.settings["steam_idle_risk_ack"], True)
        self.assertTrue(ctl.state()["riskAcknowledged"])
        ctl.acknowledge(False)
        self.assertIs(self.env.settings["steam_idle_risk_ack"], False)

    # farming
    async def test_happy_path_scanning_farming_done(self):
        ctl = self.make()
        self.env.signed_in()
        self.assertIsNone(ctl.start())
        self.assertEqual(ctl.state()["farm"]["state"], "idle", "start only queues; the loop applies it")
        await self.env.settle()
        farm = ctl.state()["farm"]
        self.assertEqual(farm["state"], "done")
        self.assertEqual([g["appId"] for g in farm["done"]], [100])
        self.assertEqual(len(self.env.presences), 1)
        presence = self.env.presences[0]
        self.assertEqual((presence.helper, presence.steam_id, presence.app_id), (Path("helper.exe"), str(BASE_ID + ACCOUNT), 100))
        self.assertFalse(presence.running)
        self.assertEqual(set(self.env.expected_seen), {str(BASE_ID + ACCOUNT)})
        self.assertTrue(max(self.env.sleeps) <= 5.0)
        self.assertEqual(self.env.library_calls, 1)
        self.assertEqual(ctl.state()["library"]["count"], 3)

    async def test_library_is_read_once_per_run_and_a_new_run_reads_it_again(self):
        ctl = self.make(drops=[[gd(100, 2)], [gd(100, 1)], [gd(100, 0)]])
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        self.assertEqual(self.env.library_calls, 1)
        self.env.drops = [[gd(200, 1)], [gd(200, 0)]]
        ctl.start()
        await self.env.settle()
        self.assertEqual(self.env.library_calls, 2)

    async def test_failed_library_read_does_not_stop_farming(self):
        ctl = self.make()
        self.env.signed_in()
        self.env.read_library = mock.Mock(side_effect=CommunityError("timeout"))
        ctl._read_library_fn = self.env.read_library
        ctl.start()
        await self.env.settle()
        self.assertEqual((ctl.state()["farm"]["state"], ctl.state()["library"]["count"]), ("done", None))

    async def test_signed_out_during_the_run_ends_in_needs_login(self):
        ctl = self.make(drops=[CommunityError("signed_out")])
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        state = ctl.state()
        self.assertEqual((state["farm"]["state"], state["community"]["session"]), ("needs_login", "signed_out"))

    async def test_account_mismatch_during_the_run_ends_in_needs_login(self):
        ctl = self.make(drops=[CommunityError("account_mismatch")])
        self.env.signed_in()
        ctl.start()
        await self.env.settle()
        state = ctl.state()
        self.assertEqual((state["farm"]["state"], state["farm"]["lastError"], state["community"]["session"]),
                         ("needs_login", "account_mismatch", "account_mismatch"))

    async def test_account_change_mid_run_stops_the_farm(self):
        ctl = self.make(drops=[[gd(100, 2)]])
        self.env.signed_in()

        def switch():
            if self.env.presences and self.env.presences[0].running:
                self.env.client = SteamClient(True, OTHER)

        self.env.on_sleep = switch
        ctl.start()
        await self.env.settle()
        farm = ctl.state()["farm"]
        self.assertEqual((farm["state"], farm["lastError"]), ("stopped", "account_changed"))
        self.assertFalse(self.env.presences[0].running)
        self.assertEqual(len(self.env.presences), 1)

    async def test_pause_resume_skip_and_stop_are_forwarded_to_the_running_farm(self):
        ctl = self.make(drops=[[gd(100, 5), gd(200, 6)]])
        self.env.signed_in()
        states = []
        skip = mock.Mock(wraps=ctl._farm.skip_current)
        ctl._farm.skip_current = skip

        def drive():
            states.append(ctl.state()["farm"]["state"])
            count = len(self.env.sleeps)
            if count == 3:
                ctl.pause()
            elif count == 6:
                ctl.resume()
            elif count == 9:
                ctl.skip()
            elif count == 12:
                ctl.stop()

        self.env.on_sleep = drive
        ctl.start()
        await self.env.settle()
        self.assertIn("paused", states)
        self.assertIn("farming", states[states.index("paused"):])
        skip.assert_called_once_with()
        self.assertEqual(ctl.state()["farm"]["state"], "stopped")
        self.assertTrue(all(not p.running for p in self.env.presences))

    async def test_suspend_is_forwarded_only_when_it_changes(self):
        ctl = self.make()
        with mock.patch.object(ctl._farm, "set_suspended") as forward:
            ctl.set_suspended(False)
            ctl.set_suspended(True)
            ctl.set_suspended(True)
            ctl.set_suspended(False)
            ctl.set_suspended(False)
        self.assertEqual([c.args for c in forward.call_args_list], [(True,), (False,)])

    async def test_suspend_releases_the_game_and_resume_holds_it_again(self):
        ctl = self.make(drops=[[gd(100, 5)]])
        self.env.signed_in()
        states = []

        def drive():
            states.append((ctl.state()["farm"]["state"], bool(self.env.presences and self.env.presences[-1].running)))
            count = len(self.env.sleeps)
            if count == 3:
                ctl.set_suspended(True)
            elif count == 7:
                ctl.set_suspended(False)
            elif count == 12:
                ctl.stop()

        self.env.on_sleep = drive
        ctl.start()
        await self.env.settle()
        self.assertIn(("suspended", False), states)
        self.assertGreaterEqual(len(self.env.presences), 2)
        self.assertTrue(any(state == "farming" and held for state, held in states[8:]))

    async def test_shutdown_releases_presence_and_ends_the_loop(self):
        ctl = self.make(drops=[[gd(100, 5)]], freeze_at=3)
        self.env.signed_in()
        ctl.start()
        await self.env.wait_running()
        await asyncio.wait_for(ctl.shutdown(), 5)
        self.assertFalse(self.env.presences[-1].running)
        await asyncio.wait_for(ctl.join(), 1)

    # community session
    async def test_check_flow_signed_in(self):
        ctl = self.make()
        self.assertIsNone(ctl.check())
        self.assertEqual(ctl.state()["community"]["session"], "checking")
        self.assertEqual(ctl.check(), "busy")
        await self.env.settle()
        self.assertEqual(self.env.status_calls, [(("node", "steam-community.js"), str(BASE_ID + ACCOUNT))])
        self.assertEqual(ctl.state()["community"], {"session": "signed_in", "checkedAgeSeconds": 0.0})
        self.env.now += 7
        self.assertEqual(ctl.state()["community"]["checkedAgeSeconds"], 7.0)
        self.assertIsNone(ctl.start())

    async def test_check_failures_map_to_sessions(self):
        for code, session in (("signed_out", "signed_out"), ("account_mismatch", "account_mismatch"),
                              ("timeout", "error"), ("failed:launch_or_run_failed", "error")):
            with self.subTest(code=code):
                ctl = self.make(status_error=code)
                ctl.check()
                await self.env.settle()
                self.assertEqual(ctl.state()["community"]["session"], session)
                self.assertNotEqual(ctl.start(), None)

    async def test_check_needs_a_signed_in_steam_client(self):
        ctl = self.make(client=SteamClient(False, 0))
        self.assertEqual(ctl.check(), "steam_not_running")
        self.env.client = SteamClient(True, 0)
        self.assertEqual(ctl.check(), "steam_signed_out")
        self.assertEqual(self.env.status_calls, [])
        self.env.tools = Tools("helper_missing")
        self.assertEqual(ctl.check(), "unavailable")

    async def test_login_flow_login_open_then_a_status_check(self):
        gate = asyncio.Event()
        ctl = self.make(login_gate=gate)
        self.assertIsNone(ctl.login())
        self.assertEqual(ctl.state()["community"]["session"], "login_open")
        self.assertEqual(ctl.login(), "busy")
        self.assertEqual(ctl.check(), "busy")
        self.assertEqual(ctl.start(), "busy")
        await asyncio.sleep(0.05)
        self.assertEqual(self.env.login_commands, [("node", "steam-community.js")])
        self.assertEqual(self.env.status_calls, [])
        gate.set()
        await self.env.settle()
        self.assertEqual(len(self.env.status_calls), 1)
        self.assertEqual(ctl.state()["community"]["session"], "signed_in")

    async def test_login_without_a_signed_in_client_ends_unknown_and_failures_end_in_error(self):
        ctl = self.make(client=SteamClient(False, 0))
        ctl.login()
        await self.env.settle()
        self.assertEqual(ctl.state()["community"]["session"], "unknown")
        self.assertEqual(self.env.status_calls, [])

        async def broken(command):
            raise OSError("no node")

        self.env.client = SteamClient(True, ACCOUNT)
        ctl._run_login = broken
        ctl.login()
        await self.env.settle()
        self.assertEqual(ctl.state()["community"]["session"], "error")

    async def test_login_refuses_when_unavailable(self):
        ctl = self.make(tools=Tools("node_missing"))
        self.assertEqual(ctl.login(), "unavailable")

    async def test_shutdown_cancels_an_open_login(self):
        ctl = self.make(login_gate=asyncio.Event())
        ctl.login()
        await asyncio.sleep(0.01)
        await asyncio.wait_for(ctl.shutdown(), 5)
        self.assertEqual(self.env.status_calls, [])


class FactoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_inert_controller_is_unavailable_and_touches_nothing(self):
        stored = {}
        ctl = create_controller(Path("nowhere"), Path("nowhere"), lambda key, default=False: stored.get(key, default),
                                stored.__setitem__, inert=True)
        state = ctl.state()
        self.assertEqual((state["available"], state["unavailableReason"]), (False, "unsupported"))
        self.assertEqual(ctl.start(), "unavailable")
        self.assertEqual(ctl.login(), "unavailable")
        ctl.set_suspended(True)
        await ctl.shutdown()


if __name__ == "__main__":
    unittest.main()
