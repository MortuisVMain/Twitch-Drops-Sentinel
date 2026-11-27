"""Background health watch: schedule with a fake clock, notify-once, persisted state, settings validation, the cheap check filter."""
import asyncio
import json
import types
from datetime import datetime

import pytest

import health
import health_watch
from health_watch import FIRST_RUN_SECONDS, HealthWatch

HOUR = 3600


class Clock:
    def __init__(self, now=1_000_000.0):
        self.now = now

    def __call__(self):
        return self.now


def r(check_id, status, title=None, area="system"):
    return {"id": check_id, "area": area, "status": status, "title": title or f"Title {check_id}", "detail": "", "advice": ""}


class Rig:
    """A HealthWatch wired to fakes: the settings, the check run and the notifier are all in memory, the store is in tmp_path."""

    def __init__(self, tmp_path, rows=None, enabled=True, hours=1, lang="ru", clock=None):
        self.store = tmp_path / "health_watch.json"
        self.clock = clock or Clock()
        self.settings = {"enabled": enabled, "hours": hours, "lang": lang}
        self.rows = rows if rows is not None else []
        self.runs = 0
        self.toasts = []
        self.fail_run = False
        self.during_run = None  # called inside the run, to simulate things that happen while it awaits
        self.mono = self.clock  # the schedule runs on the monotonic clock; here the same fake unless a test splits them
        self.watch = self.make()

    async def run(self, lang):
        self.runs += 1
        if self.during_run:
            self.during_run()
        if self.fail_run:
            raise RuntimeError("boom")
        return {"checks": list(self.rows)}

    def make(self):
        return HealthWatch(self.store, self.clock, lambda: self.settings["enabled"], lambda: self.settings["hours"], self.run,
                           lambda key, message: self.toasts.append((key, message)), lambda: self.settings["lang"], mono=self.mono)

    def tick(self, at=None):
        """Time passes in steps of at most 60 s (the service ticks every second; a bigger gap means the PC slept), then one tick at `at`."""
        async def go():
            ran = False
            while at is not None and at - self.clock.now > 60:
                self.clock.now += 60
                ran = await self.watch.tick() or ran
            if at is not None:
                self.clock.now = at
            return await self.watch.tick() or ran
        return asyncio.run(go())


# ---- schedule ----

def test_first_run_is_five_minutes_after_the_start(tmp_path):
    rig = Rig(tmp_path)
    start = rig.clock.now
    assert rig.tick(start) is False and rig.tick(start + FIRST_RUN_SECONDS - 1) is False and rig.runs == 0
    assert rig.tick(start + FIRST_RUN_SECONDS) is True and rig.runs == 1


@pytest.mark.parametrize("hours", [1, 4, 12, 24])
def test_then_every_n_hours(tmp_path, hours):
    rig = Rig(tmp_path, hours=hours)
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    assert rig.tick(first + hours * HOUR - 1) is False and rig.runs == 1
    assert rig.tick(first + hours * HOUR) is True and rig.runs == 2
    assert rig.tick(first + 2 * hours * HOUR - 1) is False
    assert rig.tick(first + 2 * hours * HOUR) is True and rig.runs == 3


def test_last_run_is_stored_and_a_restart_still_runs_five_minutes_after_its_own_start(tmp_path):
    rig = Rig(tmp_path, hours=24)
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    stored = json.loads(rig.store.read_text(encoding="utf-8"))
    assert stored["lastRun"] == first
    rig.clock.now = first + 600  # the app restarts ten minutes later
    again = rig.make()
    assert again.state()["lastRun"] == first, "the last run survives the restart"
    rig.watch = again
    assert rig.tick(rig.clock.now + FIRST_RUN_SECONDS - 1) is False
    assert rig.tick(rig.clock.now + FIRST_RUN_SECONDS) is True, "the first run after a start is not held back by the stored one"
    assert rig.tick(rig.clock.now + 12 * HOUR) is False, "after it the interval counts again"


def test_changing_the_interval_reschedules_from_the_moment_of_change(tmp_path):
    rig = Rig(tmp_path, hours=1)
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    changed = first + 600
    rig.settings["hours"] = 24
    assert rig.tick(changed) is False
    assert rig.tick(changed + 23 * HOUR) is False, "the old 1 h schedule is gone"
    assert rig.tick(changed + 24 * HOUR) is True
    back = rig.clock.now
    rig.settings["hours"] = 4
    assert rig.tick(back) is False
    assert rig.tick(back + 4 * HOUR) is True


def test_off_means_no_runs_at_all(tmp_path):
    rig = Rig(tmp_path, enabled=False)
    for step in (0, FIRST_RUN_SECONDS, HOUR, 25 * HOUR, 100 * HOUR):
        assert rig.tick(rig.clock.now + step) is False
    assert rig.runs == 0 and rig.toasts == []


def test_turning_it_on_schedules_a_run_in_five_minutes(tmp_path):
    rig = Rig(tmp_path, enabled=False)
    rig.tick(rig.clock.now + 10_000)
    on = rig.clock.now
    rig.settings["enabled"] = True
    assert rig.tick(on) is False
    assert rig.tick(on + FIRST_RUN_SECONDS - 1) is False
    assert rig.tick(on + FIRST_RUN_SECONDS) is True


def test_turning_it_off_cancels_the_pending_run(tmp_path):
    rig = Rig(tmp_path)
    rig.tick(rig.clock.now + 10)
    rig.settings["enabled"] = False
    assert rig.tick(rig.clock.now + 5 * HOUR) is False and rig.runs == 0


def test_a_crashing_run_is_contained_and_retried_later(tmp_path, caplog):
    rig = Rig(tmp_path)
    rig.fail_run = True
    first = rig.clock.now + FIRST_RUN_SECONDS
    assert rig.tick(first) is False, "no result, no exception"
    assert any("boom" in rec.getMessage() or rec.exc_info for rec in caplog.records), "the crash is logged with its traceback"
    assert rig.tick(first + 1) is False and rig.runs == 1, "it does not retry every second"
    rig.fail_run = False
    assert rig.tick(first + FIRST_RUN_SECONDS) is True


# ---- notify once ----

def test_a_new_fail_notifies_with_the_row_title_and_where_to_look(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail", "Свободное место на диске"), r("system_logs", "ok")])
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert len(rig.toasts) == 1
    assert "Свободное место на диске" in rig.toasts[0][1] and "Откройте «Центр проверки»" in rig.toasts[0][1]


def test_english_texts_follow_the_app_language(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail", "Free disk space")], lang="en")
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert "Free disk space" in rig.toasts[0][1] and "Health center" in rig.toasts[0][1]


def test_the_same_fail_is_not_announced_twice(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    rig.tick(first + HOUR)
    rig.tick(first + 2 * HOUR)
    assert len(rig.toasts) == 1


def test_a_fail_that_goes_away_and_comes_back_is_announced_again(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    rig.rows = [r("system_disk", "ok")]
    rig.tick(first + HOUR)
    rig.rows = [r("system_disk", "fail")]
    rig.tick(first + 2 * HOUR)
    assert len(rig.toasts) == 2
    assert rig.toasts[0][0] != rig.toasts[1][0], "each announcement has its own key, or the toast gate would swallow the second"


def test_a_warning_lights_the_count_but_never_toasts(tmp_path):
    rig = Rig(tmp_path, rows=[r("steam_client", "warn"), r("system_logs", "ok")])
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert rig.toasts == [] and rig.watch.state()["problems"] == 1


def test_a_warning_that_turns_into_a_fail_is_announced(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "warn")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    rig.rows = [r("system_disk", "fail")]
    rig.tick(first + HOUR)
    assert len(rig.toasts) == 1


def test_announced_problems_survive_a_restart(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert len(rig.toasts) == 1
    rig.watch = rig.make()
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert len(rig.toasts) == 1, "a restart does not repeat the news"
    assert json.loads(rig.store.read_text(encoding="utf-8"))["notified"] == ["system_disk:fail"]


def test_problem_count_is_fail_plus_warn_of_the_last_run(tmp_path):
    rig = Rig(tmp_path, rows=[r("a", "fail"), r("b", "warn"), r("c", "ok")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    assert rig.watch.state() == {"enabled": True, "hours": 1, "problems": 2, "fails": 1, "lastRun": first, "lastManual": None}
    rig.rows = [r("a", "ok")]
    rig.tick(first + HOUR)
    assert rig.watch.state()["problems"] == 0


# ---- the manual check keeps the count honest ----

def test_a_manual_check_updates_the_stored_count_without_touching_the_schedule(tmp_path):
    rig = Rig(tmp_path, rows=[r("a", "fail"), r("b", "warn")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    rig.watch.record_manual([r("a", "ok"), r("b", "ok"), r("net_twitch", "fail", area="network")])
    assert rig.watch.state()["problems"] == 0, "network rows are not part of the watch, fixed problems clear the dot"
    assert rig.watch.state()["lastRun"] == first
    assert json.loads(rig.store.read_text(encoding="utf-8"))["problems"] == 0
    rig.watch.record_manual([r("a", "warn")])
    assert rig.watch.state()["problems"] == 1


def test_count_problems_skips_the_network_area():
    rows = [r("a", "fail"), r("b", "warn"), r("net_gql", "fail", area="network"), r("c", "ok")]
    assert health_watch.count_problems(rows) == 2


# ---- review round ----

def walk_mono(rig, seconds):
    """The monotonic clock moves in ordinary one-minute-or-less steps with a tick after each; True if a run finished on the way."""
    async def go():
        ran, left = False, seconds
        while left > 0:
            step = min(60, left)
            rig.mono.now += step
            left -= step
            ran = await rig.watch.tick() or ran
        return ran
    return asyncio.run(go())


def test_a_manual_check_forgets_fixed_failures_so_a_new_break_is_announced(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    assert len(rig.toasts) == 1
    rig.watch.record_manual([r("system_disk", "ok")])  # the user fixed it and opened the panel
    assert json.loads(rig.store.read_text(encoding="utf-8"))["notified"] == []
    rig.tick(first + HOUR)  # still ok
    rig.rows = [r("system_disk", "fail")]
    rig.tick(first + 2 * HOUR)
    assert len(rig.toasts) == 2


def test_a_manual_check_keeps_failures_that_are_still_there(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])
    first = rig.clock.now + FIRST_RUN_SECONDS
    rig.tick(first)
    rig.watch.record_manual([r("system_disk", "fail"), r("net_gql", "fail", area="network")])
    rig.tick(first + HOUR)
    assert len(rig.toasts) == 1


def test_the_schedule_runs_on_the_monotonic_clock_not_the_wall_clock(tmp_path):
    rig = Rig(tmp_path)
    rig.mono = Clock(500.0)
    rig.watch = rig.make()
    rig.clock.now += 10 * HOUR  # the wall clock jumps (time sync, DST): nothing is due
    assert asyncio.run(rig.watch.tick()) is False
    assert walk_mono(rig, FIRST_RUN_SECONDS - 1) is False
    assert walk_mono(rig, 1) is True
    assert rig.watch.state()["lastRun"] == rig.clock.now, "the wall clock is only the displayed time of the run"


def test_waking_from_sleep_waits_five_minutes_instead_of_running_at_once(tmp_path):
    rig = Rig(tmp_path, hours=1)
    rig.mono = Clock(0.0)
    rig.watch = rig.make()
    assert walk_mono(rig, FIRST_RUN_SECONDS) is True and rig.runs == 1
    rig.mono.now += 3 * HOUR  # the PC slept: the next tick comes hours late
    assert asyncio.run(rig.watch.tick()) is False and rig.runs == 1, "no run right after waking: the network and sign-ins are not back yet"
    assert walk_mono(rig, FIRST_RUN_SECONDS - 1) is False
    assert walk_mono(rig, 1) is True and rig.runs == 2


def test_a_manual_check_during_a_background_run_is_not_overwritten(tmp_path):
    rig = Rig(tmp_path, rows=[r("a", "fail"), r("b", "warn")])
    rig.during_run = lambda: rig.watch.record_manual([r("a", "ok"), r("b", "ok")])  # the user fixed things while the run was working
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert rig.watch.state()["problems"] == 0
    assert json.loads(rig.store.read_text(encoding="utf-8"))["problems"] == 0


def test_a_stale_background_run_does_not_re_announce_what_a_manual_check_cleared(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])
    rig.during_run = lambda: rig.watch.record_manual([r("system_disk", "ok")])  # fixed and re-checked while the run worked
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert rig.toasts == []
    assert json.loads(rig.store.read_text(encoding="utf-8"))["notified"] == []


def test_a_run_that_finishes_after_the_watch_was_switched_off_announces_nothing(tmp_path):
    rig = Rig(tmp_path, rows=[r("system_disk", "fail")])

    def switch_off():
        rig.settings["enabled"] = False

    rig.during_run = switch_off
    rig.tick(rig.clock.now + FIRST_RUN_SECONDS)
    assert rig.toasts == []
    assert rig.watch.state()["problems"] == 0
    assert rig.tick(rig.clock.now + 5 * HOUR) is False


def test_a_failing_settings_getter_does_not_escape_the_tick(tmp_path, caplog):
    rig = Rig(tmp_path)

    def broken():
        raise RuntimeError("settings gone")

    rig.watch._enabled = broken
    assert asyncio.run(rig.watch.tick()) is False
    assert any(rec.exc_info for rec in caplog.records)


# ---- store ----

def test_a_damaged_store_starts_empty_and_says_so(tmp_path, caplog):
    store = tmp_path / "health_watch.json"
    store.write_text("{not json", encoding="utf-8")
    rig = Rig(tmp_path)
    assert rig.watch.state()["lastRun"] is None and rig.watch.state()["problems"] == 0
    assert any(rec.levelname == "WARNING" for rec in caplog.records)


def test_a_store_with_wrong_types_is_ignored(tmp_path):
    (tmp_path / "health_watch.json").write_text(json.dumps({"lastRun": "x", "problems": -3, "notified": "oops"}), encoding="utf-8")
    state = Rig(tmp_path).watch.state()
    assert state["lastRun"] is None and state["problems"] == 0


# ---- settings ----

@pytest.mark.parametrize("hours", [1, 4, 12, 24])
def test_the_four_intervals_are_accepted(hours):
    data = {"health_watch_hours": hours}
    health_watch.normalize_settings(data)
    assert data == {"health_watch_hours": hours}


@pytest.mark.parametrize("bad", [0, 2, 6, 48, -1, "4", 4.5, True, None, [4]])
def test_any_other_interval_is_dropped_from_the_incoming_data(bad):
    data = {"health_watch_hours": bad, "other": 1}
    health_watch.normalize_settings(data)
    assert data == {"other": 1}


@pytest.mark.parametrize("bad", ["yes", 1, 0, None])
def test_a_switch_that_is_not_a_boolean_is_dropped(bad):
    data = {"health_watch_enabled": bad}
    health_watch.normalize_settings(data)
    assert data == {}


def test_stored_values_fall_back_to_the_defaults():
    assert health_watch.hours_from({}) == 1 and health_watch.enabled_from({}) is True
    assert health_watch.hours_from({"health_watch_hours": 5}) == 1
    assert health_watch.hours_from({"health_watch_hours": True}) == 1
    assert health_watch.hours_from({"health_watch_hours": 12}) == 12
    assert health_watch.enabled_from({"health_watch_enabled": "no"}) is True
    assert health_watch.enabled_from({"health_watch_enabled": False}) is False


def test_the_defaults_are_in_the_shipped_config():
    shipped = json.loads((health_watch.Path(__file__).resolve().parent.parent / "config.default.json").read_text(encoding="utf-8"))
    assert shipped["health_watch_enabled"] is True and shipped["health_watch_hours"] == 1


# ---- the cheap check set ----

def test_the_background_set_has_no_network_check_and_keeps_the_rest():
    ids = [c.id for c in health.background_checks()]
    assert ids and not any(i.startswith("net_") for i in ids)
    assert all(c.area != "network" for c in health.background_checks())
    assert {"twitch_login", "steam", "giveaways", "system_errors", "settings_config"} <= set(ids)
    assert len(ids) == len(health.CATALOG) - len(health.NET_TARGETS)


def test_a_background_run_never_touches_the_network(tmp_path, monkeypatch):
    async def forbidden(url, timeout):
        raise AssertionError(f"the background run asked the network: {url}")

    monkeypatch.setattr(health, "_http_probe", forbidden)
    monkeypatch.setattr(health, "read_autostart", lambda: (False, ""))
    monkeypatch.setattr(health, "disk_free_bytes", lambda path: 50 * 1024 ** 3)
    (tmp_path / "core").mkdir()

    async def readiness():
        return {"items": []}

    ctx = health.HealthContext(
        project_dir=tmp_path, log_dir=tmp_path / "core", bridge=types.SimpleNamespace(user_id="1", username="m", oauth_code=None, oauth_uri=None),
        steam_state=lambda: {"available": False, "unavailableReason": "module_disabled"}, giveaways_readiness=readiness,
        giveaways_marker=lambda: False, cached_update=lambda: None, version="4.0.1", now=datetime.now)
    health._flight = None
    health._last = None
    result = asyncio.run(health.run_health(ctx, health.background_checks()))
    assert result["checks"] and all(row["area"] != "network" for row in result["checks"])
    health._last = None
