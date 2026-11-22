"""Offline checks for the hours phase: several games held at once until each has the playtime that unlocks drops."""
import threading
import time
import unittest

from steam_idle.batch import BatchPhase
from steam_idle.community import GameDrops
from steam_idle.farm import CardFarm, FarmRules
from steam_idle.test_farm import Harness

RULES = FarmRules(hours_until_drops=3.0)


def gp(app_id, drops, hours):
    return GameDrops(app_id, f"Game {app_id}", drops, hours)


class BatchHarness(Harness):
    """Harness without the one-presence invariant; starts are one per step, so `steps` drives a whole batch up."""

    def __init__(self, reads, rules=RULES, guard=None, **kw):
        super().__init__(reads, rules, **kw)
        if guard is not None:
            self.farm = CardFarm(rules, self.read, self.make, lambda: self.now, hold_guard=guard)

    def step(self):
        return self.farm.step()

    def steps(self, count):
        for _ in range(count):
            self.step()

    def up(self, count):
        """begin(), then enough steps to start `count` presences."""
        self.do(self.farm.start)
        self.steps(count + 1)

    def started(self):
        return [p.app_id for p in self.presences]

    def status(self):
        return self.farm.status()


def three(hours=0.5):
    return [gp(30, 3, hours), gp(10, 1, hours), gp(20, 2, hours)]


class BatchTests(unittest.TestCase):
    def test_threshold_zero_never_batches(self):
        h = BatchHarness([three()], FarmRules())
        h.up(1)
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))
        self.assertEqual(h.status()["phase"], "cards")

    def test_three_under_threshold_games_are_held_together_in_queue_order(self):
        h = BatchHarness([three()])
        h.up(3)
        self.assertEqual(h.state, "batching")
        self.assertEqual(h.started(), [10, 20, 30])
        self.assertEqual(sorted(h.held_ids()), [10, 20, 30])
        status = h.status()
        self.assertEqual((status["phase"], status["current"], status["queue"]), ("hours", None, []))
        self.assertEqual([g["appId"] for g in status["batch"]], [10, 20, 30])
        self.assertEqual(status["batch"][0], {"appId": 10, "name": "Game 10", "dropsRemaining": 1, "playtimeHours": 0.5})
        self.assertEqual((status["hoursUntilDrops"], status["batchDisabled"]), (3.0, None))
        self.assertEqual(status["totalDropsRemaining"], 6)

    def test_each_start_is_its_own_step(self):
        h = BatchHarness([three()])
        h.do(h.farm.start)
        h.step()
        self.assertEqual((h.state, h.started()), ("batching", []))
        self.assertEqual(h.step(), 0.0)
        self.assertEqual(h.started(), [10])

    def test_a_full_batch_is_refilled_when_a_game_reaches_the_threshold(self):
        first = [gp(10, 1, 0.5), gp(20, 2, 0.5), gp(30, 3, 0.5)]
        later = [gp(10, 1, 3.2), gp(20, 2, 1.0), gp(30, 3, 0.5)]
        h = BatchHarness([first, later], FarmRules(hours_until_drops=3.0, batch_size=2))
        h.up(2)
        self.assertEqual(sorted(h.held_ids()), [10, 20])
        self.assertEqual([g["appId"] for g in h.status()["queue"]], [30])
        h.tick(600)
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual(h.presences[0].stops, 1)
        h.step()
        self.assertEqual(sorted(h.held_ids()), [20, 30])
        self.assertEqual((h.state, [g["appId"] for g in h.status()["queue"]]), ("batching", [10]))

    def test_a_game_past_the_threshold_is_not_batched_and_solo_farming_follows_the_batch(self):
        first = [gp(10, 3, 5.0), gp(20, 1, 0.5), gp(30, 2, 1.0)]
        later = [gp(10, 3, 5.0), gp(20, 1, 3.5), gp(30, 2, 3.5)]
        h = BatchHarness([first, later])
        h.up(2)
        self.assertEqual(sorted(h.held_ids()), [20, 30])
        self.assertEqual([g["appId"] for g in h.status()["queue"]], [10])
        h.tick(600)
        self.assertEqual((h.state, h.held_ids()), ("farming", [20]))
        status = h.status()
        self.assertEqual((status["phase"], status["batch"]), ("cards", []))
        self.assertEqual([g["appId"] for g in status["queue"]], [30, 10])

    def test_one_under_threshold_game_is_farmed_solo(self):
        h = BatchHarness([[gp(10, 1, 5.0), gp(20, 2, 0.5)]])
        h.up(1)
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))

    def test_a_finished_game_leaves_the_batch_and_is_done(self):
        first = [gp(10, 1, 0.5), gp(20, 2, 0.5), gp(30, 3, 0.5)]
        later = [gp(10, 0, 1.0), gp(20, 2, 1.0), gp(30, 3, 1.0)]
        h = BatchHarness([first, later])
        h.up(3)
        h.tick(600)
        self.assertEqual(sorted(h.held_ids()), [20, 30])
        status = h.status()
        self.assertEqual([g["appId"] for g in status["done"]], [10])
        self.assertEqual((status["state"], status["queue"]), ("batching", []))

    def test_the_last_two_games_leaving_the_hours_phase_ends_the_batch(self):
        first = [gp(10, 1, 0.5), gp(20, 2, 2.0)]
        later = [gp(10, 1, 1.0), gp(20, 2, 3.0)]
        h = BatchHarness([first, later])
        h.up(2)
        h.tick(600)
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))
        self.assertEqual(h.status()["batch"], [])
        self.assertEqual(h.presences[0].stops, 1)

    def test_an_hour_without_more_hours_ends_the_batch_for_the_run(self):
        h = BatchHarness([three()])
        h.up(3)
        for _ in range(5):
            h.tick(600)
        self.assertEqual((h.state, h.status()["batchDisabled"]), ("batching", None))
        h.tick(600)  # 3600 s without any playtime gain
        status = h.status()
        self.assertEqual((status["state"], h.held_ids()), ("farming", [10]))
        self.assertEqual((status["batchDisabled"], status["phase"], status["batch"]), ("no_hours", "cards", []))
        self.assertEqual([g["appId"] for g in status["queue"]], [20, 30])

    def test_the_no_hours_warning_is_logged(self):
        h = BatchHarness([three()])
        h.up(3)
        for _ in range(5):
            h.tick(600)
        with self.assertLogs("steam_idle.farm", "WARNING"):
            h.tick(600)

    def test_progress_between_stalled_rechecks_resets_the_guard(self):
        flat, up = three(0.5), three(1.0)
        h = BatchHarness([three(0.5), flat, up, up, up])
        h.up(3)
        h.tick(600)  # flat
        h.tick(600)  # up: progress at 1200 s
        for _ in range(5):
            h.tick(600)  # flat until 4200 s
        self.assertEqual((h.state, h.status()["batchDisabled"]), ("batching", None))
        h.tick(600)  # 3600 s since the last gain
        self.assertEqual((h.state, h.status()["batchDisabled"]), ("farming", "no_hours"))

    def test_a_new_run_enables_the_hours_phase_again(self):
        h = BatchHarness([three()])
        h.up(3)
        h.tick(600)
        h.tick(600)
        h.do(h.farm.stop)
        h.do(h.farm.start)
        self.assertEqual(h.status()["batchDisabled"], None)

    def test_stop_releases_every_presence_and_start_nothing_more(self):
        h = BatchHarness([three()])
        h.up(2)
        h.do(h.farm.stop)
        self.assertEqual((h.state, h.held_ids(), h.status()["batch"]), ("stopped", [], []))
        h.steps(3)
        self.assertEqual(len(h.presences), 2)

    def test_status_shows_a_stop_at_once(self):
        h = BatchHarness([three()])
        h.up(3)
        h.farm.stop()
        status = h.status()
        self.assertEqual((status["state"], status["batch"], status["phase"]), ("stopped", [], None))

    def test_pause_releases_all_and_resume_restarts_the_hours_phase(self):
        h = BatchHarness([three()])
        h.up(3)
        h.do(h.farm.pause)
        self.assertEqual((h.state, h.held_ids()), ("paused", []))
        h.do(h.farm.resume)
        h.steps(4)
        self.assertEqual((h.state, sorted(h.held_ids())), ("batching", [10, 20, 30]))
        self.assertEqual(len(h.presences), 6)

    def test_suspend_releases_all_and_unsuspend_resumes(self):
        h = BatchHarness([three()])
        h.up(3)
        h.do(h.farm.set_suspended, True)
        self.assertEqual((h.state, h.held_ids()), ("suspended", []))
        h.do(h.farm.set_suspended, False)
        h.steps(4)
        self.assertEqual((h.state, len(h.held_ids())), ("batching", 3))

    def test_close_releases_all(self):
        h = BatchHarness([three()])
        h.up(3)
        h.do(h.farm.close)
        self.assertEqual((h.state, h.held_ids()), ("stopped", []))

    def test_the_hold_guard_is_checked_before_each_start(self):
        calls = []

        def guard():
            calls.append(1)
            return "account_changed" if len(calls) > 2 else None  # each start asks twice: before and after

        h = BatchHarness([three()], guard=guard)
        h.up(3)
        status = h.status()
        self.assertEqual((status["state"], status["lastError"]), ("stopped", "account_changed"))
        self.assertEqual((len(h.presences), h.held_ids(), status["batch"]), (1, [], []))

    def test_a_presence_that_died_once_is_started_again(self):
        h = BatchHarness([three()])
        h.up(3)
        h.presences[0].alive = False
        h.step()
        self.assertEqual((h.state, sorted(h.held_ids()), h.status()["failed"]), ("batching", [10, 20, 30], []))
        self.assertEqual(h.started(), [10, 20, 30, 10])

    def test_losing_a_presence_twice_in_a_row_fails_that_game(self):
        h = BatchHarness([three()])
        h.up(3)
        h.presences[0].alive = False
        h.step()
        h.presences[-1].alive = False
        h.step()
        status = h.status()
        self.assertEqual(status["failed"], [{"appId": 10, "name": "Game 10", "reason": "presence_lost"}])
        self.assertEqual((status["state"], sorted(h.held_ids())), ("batching", [20, 30]))

    def test_a_healthy_tick_resets_the_loss_count(self):
        h = BatchHarness([three()])
        h.up(3)
        h.presences[0].alive = False
        h.step()
        h.step()  # healthy again
        h.presences[-1].alive = False
        h.step()
        self.assertEqual((h.status()["failed"], sorted(h.held_ids())), ([], [10, 20, 30]))

    def test_a_start_error_fails_only_that_game(self):
        h = BatchHarness([three()], start_fail={20: ["start_timeout"]})
        h.up(3)
        status = h.status()
        self.assertEqual(status["failed"], [{"appId": 20, "name": "Game 20", "reason": "start_timeout"}])
        self.assertEqual((status["state"], sorted(h.held_ids())), ("batching", [10, 30]))

    def test_an_identity_mismatch_stops_the_run_and_releases_the_batch(self):
        h = BatchHarness([three()], start_fail={20: ["identity_mismatch"]})
        h.up(3)
        status = h.status()
        self.assertEqual((status["state"], status["lastError"], h.held_ids()), ("stopped", "identity_mismatch", []))

    def test_failures_leaving_one_game_end_the_batch(self):
        h = BatchHarness([[gp(10, 1, 0.5), gp(20, 2, 0.5)]], start_fail={20: ["start_timeout"]})
        h.up(2)
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))
        self.assertEqual(h.status()["failed"][0]["appId"], 20)

    def test_a_failed_release_is_recorded_and_does_not_stall_the_stop(self):
        h = BatchHarness([three()], stop_fail=True)
        h.up(2)
        h.do(h.farm.stop)
        self.assertEqual(h.state, "stopped")
        self.assertEqual(h.status()["lastError"], "release_failed:stop_timeout")

    def test_a_signed_out_read_releases_the_batch(self):
        from steam_idle.community import CommunityError
        h = BatchHarness([three(), CommunityError("signed_out")])
        h.up(3)
        h.tick(600)
        self.assertEqual((h.state, h.held_ids()), ("needs_login", []))

    def test_a_failed_read_keeps_the_batch_held(self):
        from steam_idle.community import CommunityError
        h = BatchHarness([three(), CommunityError("timeout"), three()])
        h.up(3)
        h.tick(600)
        self.assertEqual((h.state, len(h.held_ids())), ("batching", 3))


class BatchThreadingTests(unittest.TestCase):
    def test_stop_during_a_blocked_batch_start_releases_that_presence_and_starts_no_more(self):
        h = BatchHarness([three()])
        h.farm.start()
        h.step()
        h.step()  # scan: the batch is planned
        h.start_gate = threading.Event()
        self.addCleanup(h.start_gate.set)
        worker = threading.Thread(target=h.farm.step, daemon=True)
        worker.start()
        self.addCleanup(worker.join, 5)
        self.assertTrue(h.start_entered.wait(5))
        h.farm.stop()
        h.start_gate.set()
        worker.join(5)
        h.steps(3)
        self.assertEqual((len(h.presences), h.held_ids(), h.state), (1, [], "stopped"))


class SlowPresence:
    def __init__(self, delay=0.0, fail=False):
        self.delay, self.fail, self.stopped = delay, fail, False

    def start(self, app_id):
        pass

    def is_running(self):
        return not self.stopped

    def stop(self):
        time.sleep(self.delay)
        self.stopped = True
        if self.fail:
            raise OSError("stop failed")


class BatchPhaseTests(unittest.TestCase):
    def phase(self, games, presences):
        made = iter(presences)
        phase = BatchPhase(games, lambda: next(made), lambda: None, 0.0)
        for _ in games:
            self.assertEqual(phase.start_next().kind, "started")
        return phase

    def test_release_all_stops_presences_concurrently_and_logs_each_failure(self):
        presences = [SlowPresence(0.2, fail=(i == 3)) for i in range(10)]
        phase = self.phase([gp(i + 1, 1, 0.5) for i in range(10)], presences)
        started = time.monotonic()
        with self.assertLogs("steam_idle.batch", level="ERROR") as logs:
            code = phase.release_all()
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertTrue(all(p.stopped for p in presences))
        self.assertEqual(code, "release_failed:OSError")
        self.assertEqual(len(logs.output), 1)

    def test_recheck_never_lowers_a_held_games_playtime(self):
        phase = self.phase([gp(1, 1, 1.5), gp(2, 1, 0.5)], [SlowPresence(), SlowPresence()])
        result = phase.recheck([gp(1, 1, 0.0), gp(2, 1, 0.5)], 3.0, 100.0)
        self.assertEqual(phase.held[1].playtime_hours, 1.5)
        self.assertEqual(phase.progress_at, 0.0)
        self.assertFalse(result.stalled)

    def test_a_missing_playtime_read_does_not_trip_the_stall(self):
        phase = self.phase([gp(1, 1, 1.5), gp(2, 1, 0.5)], [SlowPresence(), SlowPresence()])
        self.assertTrue(phase.recheck([gp(1, 1, 0.0), gp(2, 1, 0.5)], 3.0, 3500.0).stalled is False)
        self.assertEqual(phase.held[1].playtime_hours, 1.5)
        phase.recheck([gp(1, 1, 2.0), gp(2, 1, 0.5)], 3.0, 3600.0)
        self.assertEqual(phase.progress_at, 3600.0)


if __name__ == "__main__":
    unittest.main()
