"""A fresh install ships the browser engine without its modules: every Community operation must say so, not fail."""
import tempfile
import unittest
from pathlib import Path

from steam_idle.achievement_queue import GamePlan
from steam_idle.controller import create_controller
from steam_idle.test_controller import ACCOUNT, Env

RISK, ACK = "steam_idle_risk_ack", "steam_idle_achievements_ack"


class EngineMissingTests(unittest.IsolatedAsyncioTestCase):
    def make(self, engine_installed=False):
        self.env = Env(engine_installed=engine_installed, settings={RISK: True, ACK: True})
        self.env.signed_in()
        self.addAsyncCleanup(self.env.ctl.shutdown)
        return self.env.ctl

    def assertNothingLaunched(self):
        env = self.env
        self.assertEqual((env.status_calls, env.login_commands, env.drops_calls, env.library_calls, env.ach_calls),
                         ([], [], 0, 0, []))
        self.assertEqual(env.presences, [])

    async def test_every_community_operation_is_refused_and_nothing_starts(self):
        ctl = self.make()
        self.assertEqual(ctl.check(), "engine_missing")
        self.assertEqual(ctl.login(), "engine_missing")
        self.assertEqual(ctl.scan(), "engine_missing")
        self.assertEqual(ctl.library_scan(), "engine_missing")
        self.assertEqual(ctl.start(), "engine_missing")
        self.assertEqual(await ctl.achievements_of(730), "engine_missing")
        self.assertEqual(ctl.start_achievements(GamePlan(730)), "engine_missing")
        await self.env.settle()
        self.assertNothingLaunched()

    async def test_state_exposes_the_missing_engine_as_the_session(self):
        ctl = self.make()
        self.assertEqual(ctl.state()["community"]["session"], "engine_missing")
        self.assertIsNone(ctl.state()["community"]["checkedAgeSeconds"])

    async def test_refusal_does_not_overwrite_the_remembered_session(self):
        ctl = self.make()
        ctl.check()
        ctl.login()
        self.env.engine_installed = True
        self.assertEqual(ctl.state()["community"]["session"], "signed_in")

    async def test_unavailable_tools_keep_their_own_refusal_and_session(self):
        from steam_idle.controller import Tools
        ctl = self.make()
        self.env.tools = Tools("helper_missing")
        self.assertEqual(ctl.check(), "unavailable")
        self.assertEqual(ctl.login(), "unavailable")
        self.assertEqual(ctl.start(), "unavailable")
        self.assertEqual(ctl.state()["community"]["session"], "signed_in")

    async def test_installed_engine_behaves_as_before(self):
        ctl = self.make(engine_installed=True)
        self.assertIsNone(ctl.check())
        await self.env.settle()
        self.assertEqual(len(self.env.status_calls), 1)
        self.assertEqual(ctl.state()["community"]["session"], "signed_in")
        self.assertIsNone(ctl.library_scan())
        await self.env.settle()
        self.assertEqual(self.env.library_calls, 1)


class FactoryWiringTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_controller_asks_the_giveaways_engine_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = Path(tmp) / "engine"
            engine.mkdir()
            ctl = create_controller(Path(tmp), engine, lambda key, default=False: default, lambda k, v: None)
            self.assertFalse(ctl._engine_installed())
            (engine / "node_modules" / "patchright").mkdir(parents=True)
            self.assertTrue(ctl._engine_installed())
            (engine / "data").mkdir()
            (engine / "data" / ".engine-install-incomplete").write_text("", encoding="utf-8")
            self.assertFalse(ctl._engine_installed())
            await ctl.shutdown()

    async def test_inert_controller_is_unaffected(self):
        ctl = create_controller(Path("nowhere"), Path("nowhere"), lambda key, default=False: default,
                                lambda k, v: None, inert=True)
        self.assertEqual(ctl.state()["community"]["session"], "unknown")
        self.assertEqual(ctl.check(), "unavailable")
        await ctl.shutdown()


if __name__ == "__main__":
    unittest.main()
