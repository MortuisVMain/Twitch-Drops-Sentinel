"""Offline checks for the achievements queue: fake clock, scripted reads and unlocks, no processes, no real waiting."""
import json
import random
import threading
import unittest

from steam_idle.achievement_queue import AchievementQueue, GamePlan, LibraryPlan, Rules, SelectedPlan
from steam_idle.achievements import Achievement, AchievementsError, UnlockOutcome, UnlockResult, _outcome

RUN_KEYS = {"state", "mode", "current", "nextUnlockInSeconds", "queue", "finished", "totals", "lastError", "paused",
            "suspended"}
TOTAL_KEYS = {"unlocked", "already", "skipped", "rejected", "failed"}
FINISHED_KEYS = {"appId", "name", "unlocked", "skipped", "failed", "already", "rejected", "note"}
BLOCKED = ("paused", "suspended", "stopped", "done", "idle")


def ach(name, achieved=False, hidden=False):
    return Achievement(name, name, "", hidden, achieved, 5 if achieved else 0)


def missing(count, prefix="A"):
    return [ach(f"{prefix}{i}") for i in range(count)]


def outcome(names, result="unlocked", stored="yes"):
    results = [UnlockResult(name, result if isinstance(result, str) else result[i]) for i, name in enumerate(names)]
    return _outcome(results, stored)


class Env:
    """Drives one queue; asserts after every step that unlock never ran while writing was not allowed."""

    def __init__(self, reads=None, rules=None, seed=1, verdicts=None):
        self.now, self.reads = 1000.0, dict(reads or {})
        self.calls, self.read_calls, self.violations, self.classify_calls = [], [], [], []
        self.verdicts = verdicts
        self.guard_result = self.on_unlock = None
        self.gate, self.entered = None, threading.Event()
        self.intent = {"paused": False, "suspended": False, "stopped": True, "closed": False}
        self.q = AchievementQueue(self.read, self.unlock, lambda: self.now, random.Random(seed).uniform, self.guard,
                                  classify=None if verdicts is None else self.classify)
        self.rules = rules or Rules()

    def read(self, app_id):
        self.read_calls.append(app_id)
        item = self.reads[app_id]
        if isinstance(item, Exception):
            raise item
        return item

    def guard(self):
        return self.guard_result

    def classify(self, app_id):
        self.classify_calls.append(app_id)
        verdict = self.verdicts.get(app_id, "clear")
        if isinstance(verdict, Exception):
            raise verdict
        return verdict

    def unlock(self, app_id, names):
        names = list(names)
        state = self.q.status()["state"]
        # the snapshot lags behind a resume, so only the terminal states are judged by it; the intent covers the rest
        if state in ("done", "stopped", "idle") or any(self.intent.values()):
            self.violations.append((state, dict(self.intent)))
        self.calls.append((app_id, names))
        if self.gate is not None:
            self.entered.set()
            self.gate.wait(5)
        if self.on_unlock is not None:
            return self.on_unlock(app_id, names, len(self.calls) - 1)
        return outcome(names)

    # commands, mirrored in the intent the invariant is judged by
    def start(self, plan):
        self.intent.update(stopped=False, paused=False)
        self.q.start(plan, self.rules)

    def pause(self):
        self.intent["paused"] = True
        self.q.pause()

    def resume(self):
        self.intent["paused"] = False
        self.q.resume()

    def suspend(self, flag):
        self.intent["suspended"] = flag
        self.q.set_suspended(flag)

    def stop(self):
        self.intent["stopped"] = True
        self.q.stop()

    def close(self):
        self.intent["closed"] = True
        self.q.close()

    def step(self):
        delay = self.q.step()
        assert not self.violations, self.violations
        return delay

    def state(self):
        return self.q.status()["state"]

    def run(self, limit=2000):
        for _ in range(limit):
            delay = self.step()
            if self.state() in ("done", "stopped", "idle"):
                return self.q.status()
            if delay > 0:
                self.now += delay
        raise AssertionError(f"never finished: {self.state()}")


def finished(env):
    return env.q.status()["finished"]


class PlanTests(unittest.TestCase):
    def test_initial_status_is_the_idle_contract_shape(self):
        status = Env().q.status()
        self.assertEqual(status, {"state": "idle", "mode": None, "current": None, "nextUnlockInSeconds": None,
                                  "queue": [], "finished": [], "totals": dict.fromkeys(TOTAL_KEYS, 0),
                                  "lastError": None, "paused": False, "suspended": False})

    def test_selected_writes_only_the_requested_names(self):
        env = Env({7: missing(5)})
        env.start(SelectedPlan(7, ["A1", "A3"], "Seven"))
        self.assertEqual(env.step(), 0.0)
        self.assertEqual(env.state(), "scanning")
        status = env.run()
        self.assertEqual(env.calls, [(7, ["A1", "A3"])])
        self.assertEqual((status["state"], status["mode"], status["lastError"]), ("done", "selected", None))
        self.assertEqual(status["totals"], {"unlocked": 2, "already": 0, "skipped": 0, "rejected": 0, "failed": 0})
        self.assertEqual(status["finished"], [{"appId": 7, "name": "Seven", "unlocked": 2, "skipped": 0, "failed": 0,
                                               "already": 0, "rejected": 0, "note": None}])
        self.assertEqual((status["current"], status["queue"]), (None, []))

    def test_selected_counts_unknown_and_already_achieved_names_without_a_write(self):
        env = Env({7: [ach("A", achieved=True), ach("B"), ach("C")]})
        env.start(SelectedPlan(7, ["A", "B", "NOPE", "NOPE2"]))
        status = env.run()
        self.assertEqual(env.calls, [(7, ["B"])])
        self.assertEqual(status["totals"], {"unlocked": 1, "already": 1, "skipped": 0, "rejected": 2, "failed": 0})
        row = status["finished"][0]
        self.assertEqual((row["unlocked"], row["already"], row["rejected"]), (1, 1, 2), "the game row counts them too")

    def test_selected_honours_hidden_names_as_the_user_sent_them(self):
        env = Env({7: [ach("A"), ach("H", hidden=True)]})
        env.start(SelectedPlan(7, ["H"]))
        status = env.run()
        self.assertEqual(env.calls, [(7, ["H"])])
        self.assertEqual((status["totals"]["skipped"], status["totals"]["unlocked"]), (0, 1))
        self.assertEqual(status["finished"][0]["skipped"], 0)

    def test_selected_with_nothing_to_write_makes_no_call(self):
        env = Env({7: [ach("A", achieved=True)]})
        env.start(SelectedPlan(7, ["A"]))
        status = env.run()
        self.assertEqual(env.calls, [])
        self.assertEqual((status["totals"]["already"], status["finished"][0]["note"]), (1, "nothing_missing"))

    def test_game_plan_targets_every_missing_achievement_and_skips_hidden(self):
        env = Env({9: [ach("A"), ach("B", achieved=True), ach("H", hidden=True), ach("C")]})
        env.start(GamePlan(9, "Nine"))
        status = env.run()
        self.assertEqual(env.calls, [(9, ["A", "C"])])
        self.assertEqual(status["mode"], "game")
        self.assertEqual(status["totals"]["skipped"], 1)
        self.assertEqual(status["finished"][0], {"appId": 9, "name": "Nine", "unlocked": 2, "skipped": 1, "failed": 0,
                                                 "already": 0, "rejected": 0, "note": None})

    def test_hidden_are_included_when_skip_hidden_is_false(self):
        env = Env({9: [ach("A"), ach("H", hidden=True)]}, Rules(skip_hidden=False))
        env.start(GamePlan(9))
        status = env.run()
        self.assertEqual(env.calls, [(9, ["A", "H"])])
        self.assertEqual(status["totals"]["skipped"], 0)

    def test_only_hidden_missing_is_noted_as_only_hidden(self):
        env = Env({9: [ach("H", hidden=True)]})
        env.start(GamePlan(9))
        status = env.run()
        self.assertEqual((env.calls, status["finished"][0]["skipped"], status["finished"][0]["note"]),
                         ([], 1, "only_hidden"))

    def test_library_plan_walks_games_newest_finished_first_and_honours_exclude(self):
        reads = {1: missing(2, "X"), 2: [], 3: [ach("D", achieved=True)], 4: AchievementsError("stats_unavailable"),
                 5: missing(1, "Z")}
        env = Env(reads)
        env.start(LibraryPlan([(1, "one"), (2, "two"), (3, "three"), (4, "four"), (5, "five"), (6, "six")], [6, 2]))
        env.step()
        env.step()
        self.assertEqual(env.q.status()["queue"], [{"appId": 3, "name": "three"}, {"appId": 4, "name": "four"},
                                                   {"appId": 5, "name": "five"}])
        status = env.run()
        self.assertEqual(env.read_calls, [1, 3, 4, 5])
        self.assertEqual(env.calls, [(1, ["X0", "X1"]), (5, ["Z0"])])
        self.assertEqual([(f["appId"], f["note"]) for f in status["finished"]],
                         [(5, None), (4, "read_failed"), (3, "nothing_missing"), (1, None)])
        self.assertEqual((status["mode"], status["state"], status["totals"]["unlocked"]), ("library", "done", 3))

    def test_game_without_achievements_is_noted(self):
        env = Env({1: []})
        env.start(GamePlan(1))
        self.assertEqual(env.run()["finished"][0]["note"], "no_achievements")

    def test_duplicate_requested_names_are_written_once(self):
        env = Env({1: missing(2)})
        env.start(SelectedPlan(1, ["A0", "A0", "A1"]))
        env.run()
        self.assertEqual(env.calls, [(1, ["A0", "A1"])])

    def test_current_shows_done_and_total_of_the_game(self):
        env = Env({1: missing(450)})
        env.start(GamePlan(1, "G"))
        seen = []
        env.on_unlock = lambda app_id, names, i: (seen.append(env.q.status()["current"]), outcome(names))[1]
        env.run()
        self.assertEqual(seen[0], {"appId": 1, "name": "G", "done": 0, "total": 450})
        self.assertEqual(seen[1]["done"], 200)


class BatchAndPaceTests(unittest.TestCase):
    def test_zero_pace_batches_of_at_most_200(self):
        env = Env({1: missing(450)})
        env.start(GamePlan(1))
        env.run()
        self.assertEqual([len(names) for _, names in env.calls], [200, 200, 50])
        self.assertEqual(env.q.status()["totals"]["unlocked"], 450)

    def test_paced_run_writes_one_name_per_call_and_waits_between_but_not_after_the_last(self):
        env = Env({1: missing(3)}, Rules(min_minutes=1, max_minutes=2), seed=5)
        expected = random.Random(5)
        env.start(GamePlan(1))
        waits = []
        for _ in range(60):
            env.step()
            status = env.q.status()
            if status["state"] == "waiting":
                waits.append(status["nextUnlockInSeconds"])
                self.assertEqual(len(env.calls), len(waits))
                self.assertLessEqual(env.q.step(), 5.0)
                env.now += waits[-1]
            if status["state"] == "done":
                break
        self.assertEqual(env.calls, [(1, ["A0"]), (1, ["A1"]), (1, ["A2"])])
        for wait, want in zip(waits, [expected.uniform(60, 120), expected.uniform(60, 120)], strict=True):
            self.assertAlmostEqual(wait, want, places=6)
        self.assertTrue(all(60 <= w <= 120 for w in waits))
        self.assertIsNone(env.q.status()["nextUnlockInSeconds"])

    def test_wait_counts_down_from_the_clock_and_step_returns_at_most_five_seconds(self):
        env = Env({1: missing(2)}, Rules(min_minutes=1, max_minutes=1))
        env.start(GamePlan(1))
        while env.state() != "waiting":
            env.step()
        self.assertEqual(env.q.status()["nextUnlockInSeconds"], 60.0)
        self.assertEqual(env.step(), 5.0)
        env.now += 57
        self.assertEqual(env.step(), 3.0)
        self.assertEqual(env.q.status()["nextUnlockInSeconds"], 3.0)
        self.assertEqual(len(env.calls), 1, "no write before the delay is over")
        env.now += 3
        env.step()
        self.assertEqual(env.state(), "unlocking")
        env.run()
        self.assertEqual(len(env.calls), 2)

    def test_no_wait_after_a_call_that_changed_nothing(self):
        env = Env({1: missing(3)}, Rules(min_minutes=1, max_minutes=1))
        env.on_unlock = lambda app_id, names, i: outcome(names, "already", "not_needed")
        env.start(GamePlan(1))
        states = []
        for _ in range(30):
            env.step()
            states.append(env.state())
        self.assertNotIn("waiting", states)
        self.assertEqual(len(env.calls), 3)

    def test_no_wait_before_games_with_nothing_to_write(self):
        env = Env({1: missing(1), 2: [ach("X", achieved=True)], 3: []}, Rules(min_minutes=60, max_minutes=60))
        env.start(LibraryPlan([(1, "a"), (2, "b"), (3, "c")]))
        states = set()
        for _ in range(40):
            env.step()
            states.add(env.state())
            if env.state() == "done":
                break
        self.assertEqual(env.state(), "done")
        self.assertNotIn("waiting", states)
        self.assertEqual((len(env.calls), env.now), (1, 1000.0), "the run ended without waiting for a write")

    def test_the_wait_is_armed_only_right_before_the_next_write(self):
        env = Env({1: missing(1), 2: [ach("X", achieved=True)], 3: missing(1, "C")}, Rules(min_minutes=1, max_minutes=1))
        env.start(LibraryPlan([(1, "a"), (2, "b"), (3, "c")]))
        seen = []
        for _ in range(60):
            env.step()
            status = env.q.status()
            if status["state"] == "waiting":
                seen.append((status["current"]["appId"], len(env.calls)))
            if status["state"] == "done":
                break
            env.now += 5
        self.assertEqual(env.calls, [(1, ["A0"]), (3, ["C0"])])
        self.assertTrue(seen and set(seen) == {(3, 1)}, seen)

    def test_wait_spans_games_and_the_last_game_does_not_wait(self):
        env = Env({1: missing(1), 2: missing(1, "B")}, Rules(min_minutes=1, max_minutes=1))
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        env.run()
        self.assertEqual(env.calls, [(1, ["A0"]), (2, ["B0"])])
        self.assertEqual(env.now - 1000.0, 60.0 + 0.0, "exactly one wait elapsed (the clock only moves for waits)")


class ResultTests(unittest.TestCase):
    def run_result(self, result, stored):
        env = Env({1: missing(1)})
        env.on_unlock = lambda app_id, names, i: outcome(names, result, stored)
        env.start(GamePlan(1))
        return env, env.run()

    def test_result_mapping_to_totals(self):
        cases = {"unlocked": ("unlocked", "yes"), "already": ("already", "not_needed"),
                 "unknown": ("rejected", "not_needed"), "rejected": ("rejected", "not_needed")}
        for result, (total, stored) in cases.items():
            with self.subTest(result=result):
                env, status = self.run_result(result, stored)
                self.assertEqual(status["totals"][total], 1)
                self.assertEqual(sum(status["totals"].values()), 1)
                self.assertEqual((status["state"], status["lastError"]), ("done", None))

    def test_pending_unconfirmed_and_store_failed_count_as_failed_and_stop_the_run(self):
        for result, stored in (("pending", "timeout"), ("unconfirmed", "yes"), ("store_failed", "no")):
            with self.subTest(result=result):
                env = Env({1: missing(1), 2: missing(1)})
                env.on_unlock = lambda app_id, names, i: outcome(names, result, stored)
                env.start(LibraryPlan([(1, "a"), (2, "b")]))
                status = env.run()
                self.assertEqual((status["state"], status["lastError"]), ("stopped", "unlock_uncertain"))
                self.assertEqual((status["totals"]["failed"], status["totals"]["unlocked"]), (1, 0))
                self.assertEqual(len(env.calls), 1)
                self.assertEqual(env.read_calls, [1], "nothing is read or written after an uncertain outcome")
                self.assertEqual((status["queue"], status["current"]), ([], None))
                self.assertEqual(status["finished"][0]["note"], "unlock_uncertain")

    def test_an_uncertain_flag_alone_stops_the_run(self):
        env = Env({1: missing(2)})
        env.on_unlock = lambda app_id, names, i: UnlockOutcome([UnlockResult(n, "unlocked") for n in names], "timeout",
                                                               True, True)
        env.start(GamePlan(1))
        status = env.run()
        self.assertEqual((status["state"], status["lastError"], status["totals"]["unlocked"]),
                         ("stopped", "unlock_uncertain", 2))


class ErrorTests(unittest.TestCase):
    def raising(self, env, code, wrote):
        def on_unlock(app_id, names, index):
            raise AchievementsError(code, wrote)
        env.on_unlock = on_unlock

    def test_error_with_wrote_true_stops_with_its_code(self):
        env = Env({1: missing(2), 2: missing(1)})
        self.raising(env, "worker_failed", True)
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        status = env.run()
        self.assertEqual((status["state"], status["lastError"], len(env.calls)), ("stopped", "worker_failed", 1))
        self.assertEqual(status["totals"]["failed"], 2)
        self.assertEqual(status["finished"][0]["note"], "uncertain")

    def test_error_with_wrote_true_counts_all_remaining_targets_of_the_game_as_failed(self):
        env = Env({1: missing(3)}, Rules(min_minutes=1, max_minutes=1))
        self.raising(env, "worker_failed", True)
        env.start(GamePlan(1))
        status = env.run()
        self.assertEqual(len(env.calls), 1, "paced: one name per call")
        self.assertEqual((status["totals"]["failed"], status["finished"][0]["failed"]), (3, 3))
        self.assertEqual((status["finished"][0]["note"], status["lastError"]), ("uncertain", "worker_failed"))

    def test_an_unexpected_exception_from_unlock_stops_as_internal_error_and_notes_uncertain(self):
        env = Env({1: missing(2), 2: missing(1)})
        env.on_unlock = lambda *args: (_ for _ in ()).throw(RuntimeError("boom"))
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        with self.assertLogs("steam_idle.achievement_queue", "ERROR"):
            status = env.run()
        self.assertEqual((status["state"], status["lastError"], len(env.calls)), ("stopped", "internal_error", 1))
        row = status["finished"][0]
        self.assertEqual((row["appId"], row["note"], row["failed"]), (1, "uncertain", 2))
        self.assertEqual(status["totals"]["failed"], 2)
        self.assertEqual((status["queue"], status["current"]), ([], None))

    def test_error_with_wrote_false_fails_the_game_and_continues(self):
        env = Env({1: missing(3), 2: missing(1, "B")})

        def on_unlock(app_id, names, index):
            if app_id == 1:
                raise AchievementsError("stats_unavailable", False)
            return outcome(names)
        env.on_unlock = on_unlock
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        status = env.run()
        self.assertEqual((status["state"], status["lastError"]), ("done", None))
        self.assertEqual(status["totals"]["failed"], 3)
        self.assertEqual(status["totals"]["unlocked"], 1)
        self.assertEqual([(f["appId"], f["failed"], f["note"]) for f in status["finished"]],
                         [(2, 0, None), (1, 3, "stats_unavailable")])

    def test_fatal_codes_with_wrote_false_stop_the_run(self):
        for code in ("identity_mismatch", "account_mismatch", "active_account_changed", "write_not_allowed",
                     "start_failed", "invalid_steam_id"):
            with self.subTest(code=code):
                env = Env({1: missing(1), 2: missing(1)})
                self.raising(env, code, False)
                env.start(LibraryPlan([(1, "a"), (2, "b")]))
                status = env.run()
                self.assertEqual((status["state"], status["lastError"], len(env.calls)), ("stopped", code, 1))
                self.assertEqual(env.read_calls, [1])

    def test_fatal_read_error_stops_but_other_read_errors_continue(self):
        env = Env({1: AchievementsError("account_mismatch"), 2: missing(1)})
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        status = env.run()
        self.assertEqual((status["state"], status["lastError"], env.read_calls, env.calls), ("stopped", "account_mismatch", [1], []))
        self.assertEqual(status["finished"][0]["note"], "read_failed")

    def test_a_crash_in_a_dependency_propagates_and_abort_makes_the_state_honest(self):
        env = Env({1: RuntimeError("boom")})
        env.start(GamePlan(1))
        with self.assertRaises(RuntimeError):
            env.run()
        env.q.abort("internal_error")
        status = env.q.status()
        self.assertEqual((status["state"], status["lastError"], status["queue"]), ("stopped", "internal_error", []))


class GuardTests(unittest.TestCase):
    def test_guard_refusal_stops_before_the_write_and_keeps_its_code(self):
        for code in ("account_changed", "not_acknowledged"):
            with self.subTest(code=code):
                env = Env({1: missing(1), 2: missing(1)})
                env.guard_result = code
                env.start(LibraryPlan([(1, "a"), (2, "b")]))
                status = env.run()
                self.assertEqual((env.calls, status["state"], status["lastError"]), ([], "stopped", code))
                self.assertEqual(status["queue"], [])

    def test_guard_is_called_right_before_every_unlock(self):
        env = Env({1: missing(450)})
        order = []
        env.guard = lambda: order.append("guard")
        env.q._guard = env.guard
        env.on_unlock = lambda app_id, names, i: (order.append("unlock"), outcome(names))[1]
        env.start(GamePlan(1))
        env.run()
        self.assertEqual(order, ["guard", "unlock"] * 3)

    def test_paused_before_the_write_writes_nothing_and_resume_continues(self):
        env = Env({1: missing(1)})
        env.start(GamePlan(1))
        env.step()
        env.step()
        env.step()  # start applied, game opened, achievements read: the next step would write
        env.pause()
        for _ in range(3):
            self.assertEqual(env.step(), 5.0)
        status = env.q.status()
        self.assertEqual((status["state"], status["paused"], env.calls), ("paused", True, []))
        env.resume()
        status = env.run()
        self.assertEqual((status["state"], len(env.calls)), ("done", 1))

    def test_suspended_before_the_write_and_released_again(self):
        env = Env({1: missing(1)})
        env.start(GamePlan(1))
        env.step()
        env.step()
        env.step()
        env.suspend(True)
        env.step()
        status = env.q.status()
        self.assertEqual((status["state"], status["suspended"], env.calls), ("suspended", True, []))
        env.suspend(False)
        self.assertEqual(env.run()["state"], "done")
        self.assertEqual(len(env.calls), 1)

    def test_suspend_set_before_start_starts_suspended(self):
        env = Env({1: missing(1)})
        env.suspend(True)
        env.start(GamePlan(1))
        env.step()
        self.assertEqual((env.state(), env.read_calls, env.calls), ("suspended", [], []))

    def test_pause_during_a_wait_keeps_the_wait_and_resume_goes_on(self):
        env = Env({1: missing(2)}, Rules(min_minutes=1, max_minutes=1))
        env.start(GamePlan(1))
        while env.state() != "waiting":
            env.step()
        env.pause()
        env.step()
        self.assertEqual(env.state(), "paused")
        env.now += 100
        env.step()
        self.assertEqual(len(env.calls), 1)
        env.resume()
        self.assertEqual(env.run()["state"], "done")
        self.assertEqual(len(env.calls), 2)

    def test_stop_clears_the_queue_and_takes_effect_on_the_next_step(self):
        env = Env({1: missing(1), 2: missing(1)})
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        env.step()
        env.stop()
        env.step()
        status = env.q.status()
        self.assertEqual((status["state"], status["queue"], status["current"], env.calls), ("stopped", [], None, []))
        self.assertEqual(env.step(), 5.0)

    def test_skip_current_game_moves_on_and_notes_it(self):
        env = Env({1: missing(3), 2: missing(1, "B")}, Rules(min_minutes=1, max_minutes=1))
        env.start(LibraryPlan([(1, "a"), (2, "b")]))
        while env.state() != "waiting":
            env.step()
        env.q.skip_current()
        env.step()
        status = env.q.status()
        self.assertEqual((status["finished"][0]["appId"], status["finished"][0]["note"], status["finished"][0]["unlocked"]),
                         (1, "skipped_by_user", 1))
        self.assertEqual((status["state"], status["nextUnlockInSeconds"]), ("scanning", None))
        env.run()
        self.assertEqual(env.calls, [(1, ["A0"]), (2, ["B0"])])

    def test_stop_in_the_middle_of_a_game_records_what_was_already_done(self):
        env = Env({1: missing(3)}, Rules(min_minutes=1, max_minutes=1))
        env.start(LibraryPlan([(1, "a")]))
        while env.state() != "waiting":
            env.step()
        env.q.stop()
        env.step()
        status = env.q.status()
        self.assertEqual(status["state"], "stopped")
        self.assertEqual([(g["appId"], g["note"], g["unlocked"]) for g in status["finished"]], [(1, "stopped", 1)])
        self.assertEqual(env.calls, [(1, ["A0"])])

    def test_skip_without_a_current_game_is_harmless(self):
        env = Env({1: missing(1)})
        env.q.skip_current()
        env.step()
        self.assertEqual(env.state(), "idle")

    def test_restart_after_done_resets_the_run(self):
        env = Env({1: missing(1)})
        env.start(GamePlan(1))
        env.run()
        env.start(GamePlan(1))
        env.step()
        status = env.q.status()
        self.assertEqual((status["state"], status["totals"]["unlocked"], status["finished"]), ("scanning", 0, []))

    def test_start_while_running_is_ignored(self):
        env = Env({1: missing(1), 2: missing(1)})
        env.start(GamePlan(1))
        env.step()
        env.start(GamePlan(2))
        env.run()
        self.assertEqual(env.calls, [(1, ["A0"])])


class BlockedStepTests(unittest.TestCase):
    def blocked_unlock(self, command):
        env = Env({1: missing(450)})
        env.gate = threading.Event()
        env.start(GamePlan(1))
        for _ in range(3):
            env.step()
        worker = threading.Thread(target=env.q.step)
        worker.start()
        self.assertTrue(env.entered.wait(5), "the unlock never blocked")
        began = threading.Event()
        started = []

        def reader():
            began.set()
            started.append(env.q.status()["state"])
        probe = threading.Thread(target=reader)
        probe.start()
        probe.join(2)
        self.assertEqual(started, ["unlocking"], "status must answer while the step is blocked")
        command(env)
        env.gate.set()
        worker.join(5)
        self.assertFalse(worker.is_alive())
        return env

    def test_pause_suspend_stop_and_close_arriving_while_blocked_write_nothing_more(self):
        commands = {"pause": lambda e: e.pause(), "suspend": lambda e: e.suspend(True), "stop": lambda e: e.stop(),
                    "close": lambda e: e.close()}
        for name, command in commands.items():
            with self.subTest(command=name):
                env = self.blocked_unlock(command)
                self.assertEqual(len(env.calls), 1)
                for _ in range(5):
                    env.step()
                self.assertEqual(len(env.calls), 1, f"a write happened after {name}")
                self.assertNotEqual(env.state(), "done")
                if name in ("stop", "close"):
                    self.assertEqual(env.state(), "stopped")

    def test_close_is_a_latch_start_afterwards_never_reads_or_writes(self):
        env = Env({1: missing(1)})
        env.close()
        env.intent["stopped"] = False
        env.q.start(GamePlan(1), env.rules)
        for _ in range(5):
            env.step()
        self.assertEqual((env.calls, env.read_calls, env.state()), ([], [], "stopped"))

    def test_close_in_the_middle_of_a_run_blocks_a_restart(self):
        env = Env({1: missing(1)})
        env.start(GamePlan(1))
        env.step()
        env.close()
        env.step()
        env.q.start(GamePlan(1), env.rules)
        for _ in range(5):
            env.step()
        self.assertEqual((env.calls, env.state()), ([], "stopped"))


class StatusTests(unittest.TestCase):
    def test_status_shape_is_exact_json_and_free_of_long_numbers(self):
        env = Env({1: missing(2)}, Rules(min_minutes=1, max_minutes=1))
        env.start(GamePlan(1, "G"))
        for _ in range(5):
            env.step()
        status = env.q.status()
        self.assertEqual(set(status), RUN_KEYS)
        self.assertEqual(set(status["totals"]), TOTAL_KEYS)
        self.assertEqual(status["state"], "waiting")
        self.assertEqual(set(status["current"]), {"appId", "name", "done", "total"})
        json.dumps(status)
        env.run()
        done = env.q.status()
        self.assertEqual(set(done["finished"][0]), FINISHED_KEYS)

    def test_lists_are_capped_at_200_but_the_run_processes_everything(self):
        env = Env({i: [ach("X")] for i in range(1, 251)})
        env.start(LibraryPlan([(i, f"g{i}") for i in range(1, 251)]))
        env.step()
        env.step()
        env.step()
        self.assertEqual(len(env.q.status()["queue"]), 200)
        status = env.run()
        self.assertEqual((len(status["finished"]), status["totals"]["unlocked"]), (200, 250))
        self.assertEqual(status["finished"][0]["appId"], 250)

    def test_a_returned_snapshot_is_not_changed_by_later_steps(self):
        env = Env({1: missing(1)})
        env.start(GamePlan(1))
        env.step()
        before = env.q.status()
        frozen = json.dumps(before)
        env.run()
        self.assertEqual(json.dumps(before), frozen)
        before["queue"].append("x")
        before["totals"]["unlocked"] = 99
        self.assertEqual(env.q.status()["totals"]["unlocked"], 1)


class ProtectionTests(unittest.TestCase):
    """The anti-cheat verdict is asked once per game, before its achievements are read; only a clear game is opened."""

    def test_protected_and_unknown_games_are_finished_with_a_note_and_nothing_is_read_or_written(self):
        plans = {"game": GamePlan(1), "selected": SelectedPlan(1, ["A0"]), "library": LibraryPlan([(1, "one")])}
        for verdict, note in (("protected", "protected_app"), ("unknown", "protection_unknown")):
            for kind, plan in plans.items():
                with self.subTest(verdict=verdict, kind=kind):
                    env = Env({1: missing(2)}, verdicts={1: verdict})
                    env.start(plan)
                    status = env.run()
                    self.assertEqual((env.read_calls, env.calls), ([], []))
                    self.assertEqual([(f["appId"], f["note"], f["unlocked"]) for f in status["finished"]], [(1, note, 0)])
                    self.assertEqual((status["state"], status["lastError"]), ("done", None))

    def test_a_clear_game_is_read_and_written_and_asked_once(self):
        env = Env({1: missing(2)}, verdicts={})
        env.start(GamePlan(1))
        env.run()
        self.assertEqual((env.classify_calls, env.calls), ([1], [(1, ["A0", "A1"])]))

    def test_library_skips_only_the_flagged_games(self):
        env = Env({1: missing(1), 2: missing(1, "B"), 3: missing(1, "C")}, verdicts={2: "protected", 3: "unknown"})
        env.start(LibraryPlan([(1, "one"), (2, "two"), (3, "three")]))
        status = env.run()
        self.assertEqual(env.calls, [(1, ["A0"])])
        self.assertEqual({f["appId"]: f["note"] for f in status["finished"]},
                         {1: None, 2: "protected_app", 3: "protection_unknown"})

    def test_a_failing_classifier_counts_as_unknown(self):
        env = Env({1: missing(1)}, verdicts={1: RuntimeError("boom")})
        env.start(GamePlan(1))
        with self.assertLogs("steam_idle.achievement_queue", level="ERROR"):
            status = env.run()
        self.assertEqual((env.read_calls, status["finished"][0]["note"]), ([], "protection_unknown"))

    def test_a_stop_during_the_check_is_not_noted_as_a_verdict(self):
        env = Env({1: missing(1)}, verdicts={})
        env.q._classify = lambda app_id: (env.stop(), "protected")[1]  # the user stops while the check runs
        env.start(GamePlan(1))
        env.run()
        env.step()  # the stop command is applied by a step
        self.assertEqual((env.calls, env.read_calls), ([], []))
        self.assertEqual(env.q.status()["finished"][0]["note"], "stopped")


class InvariantSweepTests(unittest.TestCase):
    def test_no_unlock_in_a_blocked_state_through_a_busy_scenario(self):
        env = Env({1: missing(450), 2: missing(3, "B"), 3: missing(2, "C")}, Rules(min_minutes=0, max_minutes=0))
        env.start(LibraryPlan([(1, "a"), (2, "b"), (3, "c")]))
        script = {2: env.pause, 4: env.resume, 6: lambda: env.suspend(True), 8: lambda: env.suspend(False),
                  10: env.q.skip_current, 14: env.stop, 16: lambda: env.start(GamePlan(3)), 30: env.close}
        for index in range(60):
            if index in script:
                script[index]()
            env.step()
            env.now += 1
        self.assertEqual(env.violations, [])
        self.assertTrue(env.calls)


if __name__ == "__main__":
    unittest.main()
