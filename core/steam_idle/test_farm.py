"""Offline checks for the card-farm state machine: fake clock, scripted drops reads, fake presence."""
import json
import re
import threading
import time
import unittest

from steam_idle.community import CommunityError, GameDrops
from steam_idle.farm import CardFarm, FarmRules
from steam_idle.presence import PresenceError


def gd(app_id, drops):
    return GameDrops(app_id, f"Game {app_id}", drops, 1.0)


class FakePresence:
    def __init__(self, env):
        self.env, self.app_id, self.held, self.alive, self.stops = env, None, False, False, 0

    def start(self, app_id):
        codes = self.env.start_fail.get(app_id)
        if codes:
            raise PresenceError(codes.pop(0))
        if self.env.start_gate is not None:
            self.env.start_entered.set()
            self.env.start_gate.wait(5)
        self.app_id, self.held = app_id, True
        self.alive = self.env.dead_starts == 0
        self.env.dead_starts = max(self.env.dead_starts - 1, 0)

    def stop(self):
        self.stops += 1
        if self.env.stop_gate is not None and self.held:
            self.env.stop_entered.set()
            self.env.stop_gate.wait(5)
        was_held, self.held = self.held, False
        if was_held and self.env.stop_fail:
            raise PresenceError("stop_timeout")

    def is_running(self):
        return self.held and self.alive


class Harness:
    """Drives a CardFarm and asserts the one-presence invariant after every step."""

    def __init__(self, reads, rules=None, start_fail=None, stop_fail=False):
        self.reads, self.read_calls = list(reads), 0
        self.start_fail = {k: list(v) for k, v in (start_fail or {}).items()}
        self.stop_fail, self.dead_starts = stop_fail, 0
        self.presences, self.now = [], 1000.0
        self.read_gate = self.start_gate = self.stop_gate = None
        self.read_entered, self.start_entered, self.stop_entered = (threading.Event() for _ in range(3))
        self.farm = CardFarm(rules or FarmRules(), self.read, self.make, lambda: self.now)

    def read(self):
        self.read_calls += 1
        if self.read_gate is not None:
            self.read_entered.set()
            self.read_gate.wait(5)
        item = self.reads.pop(0) if len(self.reads) > 1 else self.reads[0]
        if isinstance(item, Exception):
            raise item
        return item

    def make(self):
        self.presences.append(FakePresence(self))
        return self.presences[-1]

    def held_ids(self):
        return [p.app_id for p in self.presences if p.held]

    def step(self):
        delay = self.farm.step()
        held, state = self.held_ids(), self.farm.status()["state"]
        assert len(held) <= 1, f"two presences held: {held}"
        assert not held or state == "farming", f"{held} held in state {state}"
        assert held or state != "farming", "farming without a held game"
        return delay

    def do(self, command, *args):
        command(*args)
        return self.step()

    def begin(self):
        self.do(self.farm.start)
        return self.step()

    def tick(self, seconds):
        self.now += seconds
        return self.step()

    @property
    def state(self):
        return self.farm.status()["state"]


def err(code):
    return CommunityError(code)


class FarmTests(unittest.TestCase):
    def test_happy_path_three_games_in_farm_order(self):
        h = Harness([[gd(30, 3), gd(10, 1), gd(20, 2)],
                     [gd(30, 3), gd(10, 0), gd(20, 2)],
                     [gd(30, 3), gd(10, 0), gd(20, 0)],
                     [gd(30, 0), gd(10, 0), gd(20, 0)]])
        h.begin()
        self.assertEqual(h.held_ids(), [10])
        h.tick(600)
        self.assertEqual(h.held_ids(), [20])
        h.tick(600)
        self.assertEqual(h.held_ids(), [30])
        h.tick(600)
        status = h.farm.status()
        self.assertEqual(status["state"], "done")
        self.assertEqual([g["appId"] for g in status["done"]], [10, 20, 30])
        self.assertEqual(status["failed"], [])
        self.assertEqual(h.held_ids(), [])
        self.assertTrue(all(p.stops == 1 for p in h.presences))
        self.assertEqual(h.read_calls, 4)

    def test_nothing_farmable_is_done_at_once(self):
        h = Harness([[gd(10, 0)]])
        h.begin()
        self.assertEqual(h.state, "done")
        self.assertEqual(h.presences, [])

    def test_blacklist_is_never_held(self):
        h = Harness([[gd(10, 1), gd(20, 2)]], FarmRules(blacklist=frozenset({10})))
        h.begin()
        self.assertEqual(h.held_ids(), [20])
        h.tick(600)
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual(h.farm.status()["queue"], [])

    def test_decreasing_count_resets_no_progress_timer(self):
        rules = FarmRules(recheck_seconds=600, max_game_seconds=1000)
        h = Harness([[gd(10, 3)], [gd(10, 2)], [gd(10, 2)], [gd(10, 2)]], rules)
        h.begin()
        h.tick(600)  # 3 -> 2 resets the timer
        h.tick(600)  # 1200 s from the start but only 600 since the decrease: still farming
        self.assertEqual(h.state, "farming")
        h.tick(600)  # 1200 s since the decrease: given up
        self.assertEqual(h.state, "done")
        self.assertEqual(h.farm.status()["failed"], [{"appId": 10, "name": "Game 10", "reason": "no_progress"}])

    def test_no_progress_timeout_releases_and_records_failure(self):
        rules = FarmRules(recheck_seconds=600, max_game_seconds=1000)
        h = Harness([[gd(10, 3), gd(20, 5)]], rules)
        h.begin()
        h.tick(600)
        self.assertEqual(h.held_ids(), [10])
        h.tick(600)
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual(h.farm.status()["failed"][0]["reason"], "no_progress")
        self.assertEqual(h.farm.status()["done"], [])

    def test_game_disappearing_from_list_counts_as_done(self):
        h = Harness([[gd(10, 1), gd(20, 2)], [gd(20, 2)]])
        h.begin()
        h.tick(600)
        status = h.farm.status()
        self.assertEqual([g["appId"] for g in status["done"]], [10])
        self.assertEqual(h.held_ids(), [20])

    def test_presence_start_failure_continues_with_next(self):
        h = Harness([[gd(10, 1), gd(20, 2)]], start_fail={10: ["start_failed"]})
        h.begin()
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual(h.farm.status()["failed"], [{"appId": 10, "name": "Game 10", "reason": "start_failed"}])

    def test_identity_mismatch_stops_everything(self):
        h = Harness([[gd(10, 1), gd(20, 2)]], start_fail={10: ["identity_mismatch"]})
        h.begin()
        status = h.farm.status()
        self.assertEqual(status["state"], "stopped")
        self.assertEqual(status["lastError"], "identity_mismatch")
        self.assertEqual(h.held_ids(), [])
        self.assertEqual(len(h.presences), 1)

    def test_presence_dies_once_then_recovers(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.presences[0].alive = False
        h.step()
        self.assertEqual(h.held_ids(), [10])
        self.assertEqual(len(h.presences), 2)
        self.assertEqual(h.farm.status()["failed"], [])
        h.step()  # the restarted presence is seen alive: the counter resets
        h.presences[1].alive = False
        h.step()
        self.assertEqual(len(h.presences), 3)
        self.assertEqual(h.state, "farming")

    def test_presence_dies_twice_in_a_row_fails_game(self):
        h = Harness([[gd(10, 1), gd(20, 2)]])
        h.begin()
        h.dead_starts = 1  # the restart comes up dead
        h.presences[0].alive = False
        h.step()
        h.step()
        self.assertEqual(h.farm.status()["failed"], [{"appId": 10, "name": "Game 10", "reason": "presence_lost"}])
        self.assertEqual(h.held_ids(), [20])

    def test_failed_restart_records_presence_lost(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.start_fail[10] = ["start_failed"]
        h.presences[0].alive = False
        h.step()
        self.assertEqual(h.farm.status()["failed"][0]["reason"], "presence_lost")
        self.assertEqual(h.state, "done")

    def test_signed_out_needs_login_then_start_works_again(self):
        h = Harness([[gd(10, 1)], err("signed_out"), [gd(10, 1)]])
        h.begin()
        h.tick(600)
        self.assertEqual(h.state, "needs_login")
        self.assertEqual(h.held_ids(), [])
        self.assertEqual(h.farm.status()["lastError"], "signed_out")
        h.begin()
        self.assertEqual(h.state, "farming")
        self.assertEqual(h.held_ids(), [10])

    def test_transient_read_failure_keeps_holding_and_retries(self):
        h = Harness([[gd(10, 1)], err("timeout"), [gd(10, 1)]])
        h.begin()
        delay = h.tick(600)
        status = h.farm.status()
        self.assertEqual((status["state"], h.held_ids(), status["lastError"]), ("farming", [10], "timeout"))
        self.assertEqual(delay, 300.0)
        self.assertEqual(h.tick(100), 200.0)  # not due yet: no extra read
        self.assertEqual(h.read_calls, 2)
        self.assertEqual(h.tick(200), 600.0)
        self.assertIsNone(h.farm.status()["lastError"])

    def test_scanning_read_failure_waits_then_retries(self):
        h = Harness([err("timeout"), [gd(10, 1)]])
        h.do(h.farm.start)
        self.assertEqual(h.step(), 300.0)
        self.assertEqual(h.state, "waiting")
        self.assertEqual(h.tick(100), 200.0)
        self.assertEqual(h.read_calls, 1)
        h.tick(200)
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))

    def test_five_consecutive_failures_stop(self):
        h = Harness([[gd(10, 1)], err("timeout")])
        h.begin()
        h.tick(600)  # failure 1, then one retry every 300 s
        for _ in range(3):
            h.tick(300)
            self.assertEqual(h.state, "farming")
        h.tick(300)
        status = h.farm.status()
        self.assertEqual((status["state"], status["lastError"]), ("stopped", "timeout"))
        self.assertEqual(h.held_ids(), [])

    def test_success_resets_failure_counter(self):
        h = Harness([[gd(10, 1)]] + [err("timeout")] * 4 + [[gd(10, 1)]] + [err("timeout")] * 4 + [[gd(10, 1)]])
        h.begin()
        for _ in range(10):
            h.tick(600)
            self.assertEqual(h.state, "farming")

    def test_pause_and_resume(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.do(h.farm.pause)
        status = h.farm.status()
        self.assertEqual((status["state"], status["paused"], h.held_ids()), ("paused", True, []))
        h.do(h.farm.resume)
        self.assertEqual(h.state, "scanning")
        h.step()
        self.assertEqual((h.state, h.held_ids()), ("farming", [10]))
        self.assertFalse(h.farm.status()["paused"])

    def test_suspend_and_unsuspend_keep_paused_flag(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.do(h.farm.set_suspended, True)
        status = h.farm.status()
        self.assertEqual((status["state"], status["suspended"], status["paused"], h.held_ids()),
                         ("suspended", True, False, []))
        h.do(h.farm.set_suspended, False)
        self.assertEqual(h.state, "scanning")
        h.step()
        self.assertEqual(h.held_ids(), [10])

    def test_pause_wins_over_suspend(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.do(h.farm.set_suspended, True)
        h.do(h.farm.pause)
        self.assertEqual(h.state, "paused")
        h.do(h.farm.set_suspended, False)
        self.assertEqual((h.state, h.held_ids()), ("paused", []))
        h.do(h.farm.resume)
        h.step()
        self.assertEqual(h.held_ids(), [10])

    def test_leaving_pause_while_suspended_stays_released(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.do(h.farm.pause)
        h.do(h.farm.set_suspended, True)
        self.assertEqual(h.state, "paused")
        h.do(h.farm.resume)
        self.assertEqual((h.state, h.held_ids()), ("suspended", []))
        h.do(h.farm.resume)  # resume does not end a suspension
        self.assertEqual(h.state, "suspended")
        h.do(h.farm.set_suspended, False)
        h.step()
        self.assertEqual(h.held_ids(), [10])

    def test_skip_current_moves_on_without_marking_done_or_failed(self):
        h = Harness([[gd(10, 1), gd(20, 2)]])
        h.begin()
        h.do(h.farm.skip_current)
        status = h.farm.status()
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual((status["done"], status["failed"]), ([], []))
        h.tick(600)  # the fresh list still contains the skipped game: it stays out
        self.assertEqual(h.held_ids(), [20])
        self.assertEqual(h.farm.status()["queue"], [])
        h.do(h.farm.skip_current)
        self.assertEqual(h.state, "done")

    def test_stop_from_every_state(self):
        for name in ("idle", "scanning", "farming", "waiting", "paused", "suspended", "needs_login", "done", "stopped"):
            with self.subTest(state=name):
                h = self.reach(name)
                self.assertEqual(h.state, name)
                h.do(h.farm.stop)
                self.assertEqual(h.state, "stopped")
                self.assertEqual(h.held_ids(), [])

    @staticmethod
    def reach(name):
        reads = {"waiting": [err("timeout")], "needs_login": [err("signed_out")], "done": [[]]}.get(name, [[gd(10, 1)]])
        h = Harness(reads)
        farm = h.farm
        if name == "idle":
            return h
        h.do(farm.start)
        if name != "scanning":
            h.step()
        if name == "suspended":
            h.do(farm.set_suspended, True)
        elif name == "paused":
            h.do(farm.pause)
        elif name == "stopped":
            h.do(farm.stop)
        return h

    def test_commands_that_make_no_sense_are_ignored(self):
        h = Harness([[gd(10, 1)]])
        for command in (h.farm.pause, h.farm.resume, h.farm.skip_current):
            h.do(command)
            self.assertEqual(h.state, "idle")
        h.begin()
        h.do(h.farm.start)  # already farming
        h.do(h.farm.resume)
        self.assertEqual((h.state, h.held_ids(), len(h.presences)), ("farming", [10], 1))

    def test_release_failure_is_recorded_and_not_retried(self):
        h = Harness([[gd(10, 1)]], stop_fail=True)
        h.begin()
        h.do(h.farm.pause)
        status = h.farm.status()
        self.assertEqual(status["state"], "paused")
        self.assertEqual(status["lastError"], "release_failed:stop_timeout")
        for _ in range(3):
            h.tick(600)
        self.assertEqual(h.presences[0].stops, 1)

    def test_step_return_values(self):
        h = Harness([[gd(10, 1)]], FarmRules(recheck_seconds=600, retry_seconds=300))
        self.assertEqual(h.do(h.farm.start), 0)
        self.assertEqual(h.step(), 600.0)
        self.assertEqual(h.tick(250), 350.0)
        self.assertEqual(h.tick(350), 600.0)

    def test_status_is_json_and_free_of_account_keys(self):
        h = Harness([[gd(10, 1), gd(20, 2), gd(30, 3)]], FarmRules(max_game_seconds=1000))
        self.assertIsNone(h.farm.status()["lastReadAgeSeconds"])
        h.begin()
        h.tick(50)
        status = json.loads(json.dumps(h.farm.status()))
        self.assertEqual(status["current"], {"appId": 10, "name": "Game 10", "dropsRemaining": 1, "heldSeconds": 50.0})
        self.assertEqual([g["appId"] for g in status["queue"]], [20, 30])
        self.assertEqual((status["totalDropsRemaining"], status["lastReadAgeSeconds"]), (6, 50.0))
        h.tick(2000)
        status = h.farm.status()
        self.assertEqual(status["failed"][0]["appId"], 10)
        self.assertNotRegex(json.dumps(status), re.compile(r"id64|account|steamid", re.IGNORECASE))


class FarmFindingsTests(unittest.TestCase):
    def test_stop_queued_behind_other_commands_takes_effect_on_the_next_step(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.farm.set_suspended(True)
        h.farm.pause()
        h.farm.skip_current()
        h.farm.stop()
        h.step()
        self.assertEqual((h.state, h.held_ids()), ("stopped", []))

    def test_recheck_with_more_drops_updates_the_count_but_not_the_progress_timer(self):
        rules = FarmRules(recheck_seconds=600, max_game_seconds=1000)
        h = Harness([[gd(10, 3)], [gd(10, 5)], [gd(10, 5)]], rules)
        h.begin()
        h.tick(600)
        self.assertEqual(h.farm.status()["current"]["dropsRemaining"], 5)
        self.assertEqual(h.state, "farming")
        h.tick(600)  # 1200 s without a decrease: the timer was not reset by the increase
        self.assertEqual(h.farm.status()["failed"][0]["reason"], "no_progress")

    def test_repeated_suspend_commands_do_not_grow_the_queue(self):
        farm = Harness([[gd(10, 1)]]).farm
        for _ in range(50):
            farm.set_suspended(True)
        for flag in (False, True) * 25:
            farm.set_suspended(flag)
        self.assertLessEqual(len(farm._commands), 1)


class FarmThreadingTests(unittest.TestCase):
    """A step blocked in a worker thread (read or presence start) while commands arrive from another thread."""

    def blocked_step(self, h, gate_name, entered_name):
        h.farm.start()
        h.farm.step()
        setattr(h, gate_name, threading.Event())
        worker = threading.Thread(target=h.farm.step, daemon=True)
        worker.start()
        self.assertTrue(getattr(h, entered_name).wait(5), "the step never blocked")
        self.addCleanup(worker.join, 5)
        self.addCleanup(getattr(h, gate_name).set)
        return worker, getattr(h, gate_name)

    def finish(self, worker, gate):
        gate.set()
        worker.join(5)
        self.assertFalse(worker.is_alive())

    def test_stop_during_a_blocked_read_holds_no_game(self):
        h = Harness([[gd(10, 1)]])
        worker, gate = self.blocked_step(h, "read_gate", "read_entered")
        h.farm.stop()
        self.finish(worker, gate)
        self.assertEqual(h.presences, [])
        h.farm.step()
        self.assertEqual((h.state, h.held_ids()), ("stopped", []))

    def test_close_during_a_blocked_read_holds_no_game_and_blocks_later_holds(self):
        h = Harness([[gd(10, 1)]])
        worker, gate = self.blocked_step(h, "read_gate", "read_entered")
        h.farm.close()
        self.finish(worker, gate)
        self.assertEqual(h.presences, [])
        h.farm.start()
        h.farm.step()
        h.farm.step()
        self.assertEqual((h.presences, h.state), ([], "stopped"))

    def test_stop_during_a_blocked_presence_start_releases_the_new_game(self):
        h = Harness([[gd(10, 1)]])
        worker, gate = self.blocked_step(h, "start_gate", "start_entered")
        h.farm.stop()
        self.finish(worker, gate)
        self.assertEqual(h.held_ids(), [])
        h.farm.step()
        self.assertEqual(h.state, "stopped")

    def test_pause_during_a_blocked_scan_does_not_hold(self):
        h = Harness([[gd(10, 1)]])
        worker, gate = self.blocked_step(h, "read_gate", "read_entered")
        h.farm.pause()
        self.finish(worker, gate)
        self.assertEqual(h.presences, [])
        h.farm.step()
        status = h.farm.status()
        self.assertEqual((status["state"], status["paused"]), ("paused", True))

    def test_suspend_during_a_blocked_scan_does_not_hold(self):
        h = Harness([[gd(10, 1)]])
        worker, gate = self.blocked_step(h, "read_gate", "read_entered")
        h.farm.set_suspended(True)
        self.finish(worker, gate)
        self.assertEqual(h.presences, [])
        h.farm.step()
        self.assertEqual(h.state, "suspended")

    def test_hold_guard_refusal_stops_with_its_code(self):
        h = Harness([[gd(10, 1)]])
        h.farm._guard = lambda: "account_changed"
        h.begin()
        status = h.farm.status()
        self.assertEqual((status["state"], status["lastError"], h.presences), ("stopped", "account_changed", []))

    def test_status_is_prompt_and_consistent_while_a_release_is_blocked(self):
        h = Harness([[gd(10, 1)]])
        h.begin()
        h.stop_gate = threading.Event()
        self.addCleanup(h.stop_gate.set)
        h.farm.pause()
        worker = threading.Thread(target=h.farm.step, daemon=True)
        worker.start()
        self.addCleanup(worker.join, 5)
        self.assertTrue(h.stop_entered.wait(5))
        slowest = 0.0
        for _ in range(200):
            began = time.perf_counter()
            status = h.farm.status()
            slowest = max(slowest, time.perf_counter() - began)
            self.assertTrue(status["state"] != "farming" or status["current"] is not None, status)
        self.assertLess(slowest, 0.2)
        h.stop_gate.set()
        worker.join(5)
        self.assertEqual(h.state, "paused")


if __name__ == "__main__":
    unittest.main()
