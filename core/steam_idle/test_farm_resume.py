"""A card farm that was running when the service stopped continues after a quick restart (an update, the app's own restart):
live 2026-11-27 an update restarted the app and Moonlighter 2 stayed unfarmed until a manual start. A stop longer ago than
the window (the user closed the app for the evening) never starts a farm by itself."""
import unittest

from steam_idle.controller import RESUME_KEY, RESUME_WINDOW
from steam_idle.test_controller import Env, gd

NOW = 1_800_000_000.0


class FarmResume(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        for env in getattr(self, "envs", []):
            await env.ctl.shutdown()

    def make(self, settings=None, wall=NOW, **over):
        env = Env(drops=[[gd(100, 5)]] * 50, wall_clock=lambda: wall, **over)
        if settings is not None:
            env.settings.update(settings)
        self.envs = getattr(self, "envs", []) + [env]
        return env

    async def stopped_while_farming(self):
        env = self.make()
        env.signed_in()
        self.assertIsNone(env.ctl.start())
        await env.ctl.shutdown()
        self.envs.remove(env)
        return env.settings

    async def test_a_running_farm_leaves_a_marker_and_the_next_start_resumes_it(self):
        settings = await self.stopped_while_farming()
        self.assertIn(RESUME_KEY, settings)
        env = self.make(settings, wall=NOW + 60)
        env.signed_in()
        self.assertTrue(await env.ctl.resume_after_restart())
        self.assertTrue(env.ctl._running())
        self.assertIsNone(env.settings.get(RESUME_KEY), "one try per restart")

    async def test_the_community_session_is_checked_first_when_unknown(self):
        settings = await self.stopped_while_farming()
        env = self.make(settings, wall=NOW + 60)
        self.assertTrue(await env.ctl.resume_after_restart())
        self.assertTrue(env.ctl._running())

    async def test_a_stop_older_than_the_window_starts_nothing(self):
        settings = await self.stopped_while_farming()
        env = self.make(settings, wall=NOW + RESUME_WINDOW + 1)
        env.signed_in()
        self.assertFalse(await env.ctl.resume_after_restart())
        self.assertFalse(env.ctl._running())
        self.assertIsNone(env.settings.get(RESUME_KEY))

    async def test_no_farm_running_means_no_marker(self):
        env = self.make()
        await env.ctl.shutdown()
        self.envs.remove(env)
        self.assertIsNone(env.settings.get(RESUME_KEY))
        fresh = self.make(env.settings)
        self.assertFalse(await fresh.ctl.resume_after_restart())

    async def test_the_module_turned_off_meanwhile_starts_nothing(self):
        settings = await self.stopped_while_farming()
        env = self.make(settings, wall=NOW + 60, module_enabled=False)
        self.assertFalse(await env.ctl.resume_after_restart())
        self.assertFalse(env.ctl._running())


class ServiceStartsTheResume(unittest.TestCase):
    def test_the_service_start_runs_it(self):
        import inspect
        import sentinel_service
        self.assertIn("self.resume_steam_idle_farm()", inspect.getsource(sentinel_service.SentinelSupervisor.start))


if __name__ == "__main__":
    unittest.main()
