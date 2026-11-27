"""Health history: found/fixed events, cap of 20, persistence, sanitized titles, the token gate, the toast launch argument."""
import json
import subprocess
from pathlib import Path

import pytest

import gui_headless
import health_watch
from health_history import MAX_EVENTS, HealthHistory
from health_watch import HealthWatch
from local_access import token_allowed
from notifications import ToastGate


def r(check_id, status, title=None, area="steam"):
    return {"id": check_id, "area": area, "status": status, "title": title or f"Title {check_id}", "detail": "", "advice": ""}


class Clock:
    def __init__(self, now=1_000.0):
        self.now = now

    def __call__(self):
        return self.now


def make(tmp_path, clock=None):
    return HealthHistory(tmp_path / "health_history.json", clock or Clock())


def test_a_new_problem_is_found_once(tmp_path):
    history = make(tmp_path)
    history.record([r("a", "fail"), r("b", "ok")])
    history.record([r("a", "fail"), r("b", "ok")])
    events = history.events()
    assert [(e["checkId"], e["event"], e["status"]) for e in events] == [("a", "found", "fail")]
    assert set(events[0]) == {"time", "checkId", "area", "title", "status", "event"}


def test_a_warning_counts_and_a_worse_status_is_found_again(tmp_path):
    history = make(tmp_path)
    history.record([r("a", "warn")])
    history.record([r("a", "fail")])
    assert [(e["event"], e["status"]) for e in history.events()] == [("found", "fail"), ("found", "warn")]


def test_a_problem_that_is_ok_again_is_fixed(tmp_path):
    clock = Clock()
    history = make(tmp_path, clock)
    history.record([r("a", "fail")])
    clock.now = 2_000.0
    history.record([r("a", "ok")])
    newest = history.events()[0]
    assert (newest["checkId"], newest["event"], newest["status"], newest["time"]) == ("a", "fixed", "ok", 2_000.0)
    history.record([r("a", "ok")])
    assert len(history.events()) == 2, "staying ok is not news"


def test_a_row_missing_from_a_run_keeps_its_state(tmp_path):
    history = make(tmp_path)
    history.record([r("net", "fail", area="network")])
    history.record([r("x", "ok")])  # a background run has no network rows
    history.record([r("net", "fail", area="network")])
    assert len(history.events()) == 1


def test_only_the_last_20_events_are_kept_newest_first(tmp_path):
    clock = Clock()
    history = make(tmp_path, clock)
    for i in range(25):
        clock.now = float(i)
        history.record([r(f"c{i}", "fail")])
    events = history.events()
    assert MAX_EVENTS == 20 and len(events) == 20
    assert events[0]["checkId"] == "c24" and events[-1]["checkId"] == "c5"


def test_events_and_state_survive_a_restart(tmp_path):
    history = make(tmp_path)
    history.record([r("a", "fail")])
    again = make(tmp_path)
    assert [e["checkId"] for e in again.events()] == ["a"]
    again.record([r("a", "fail")])
    assert len(again.events()) == 1, "the remembered state stops a repeat after a restart"
    again.record([r("a", "ok")])
    assert again.events()[0]["event"] == "fixed"


def test_an_unreadable_store_starts_empty_and_is_logged(tmp_path, caplog):
    (tmp_path / "health_history.json").write_text("{not json", encoding="utf-8")
    with caplog.at_level("WARNING"):
        history = make(tmp_path)
    assert history.events() == []
    assert any("unreadable" in rec.getMessage() for rec in caplog.records)


def test_a_store_with_wrong_shapes_is_ignored(tmp_path):
    (tmp_path / "health_history.json").write_text(json.dumps({"events": [1, {"checkId": "a"}, "x"], "known": {"a": 5}}), encoding="utf-8")
    assert make(tmp_path).events() == []


def test_titles_are_sanitized_and_cut(tmp_path):
    home = str(Path.home())
    history = make(tmp_path)
    history.record([r("a", "fail", title=f"Broken {home}\\x steam 76561198012345678 " + "z" * 500)])
    title = history.events()[0]["title"]
    assert home not in title and "76561198012345678" not in title and len(title) <= 200
    assert home not in (tmp_path / "health_history.json").read_text(encoding="utf-8")


def test_a_save_failure_is_logged_not_raised(tmp_path, caplog):
    history = HealthHistory(tmp_path / "blocked" / "h.json", Clock())
    (tmp_path / "blocked").write_text("a file where the folder should be", encoding="utf-8")
    with caplog.at_level("WARNING"):
        history.record([r("a", "fail")])
    assert any("Could not save" in rec.getMessage() for rec in caplog.records)
    assert len(history.events()) == 1


def test_no_store_works_in_memory():
    history = HealthHistory(None, Clock())
    history.record([r("a", "fail")])
    assert len(history.events()) == 1


# ---- wiring into the watch ----

class WatchRig:
    def __init__(self, tmp_path):
        self.clock = Clock(1_000_000.0)
        self.history = HealthHistory(tmp_path / "h.json", self.clock)
        self.rows = []

        async def run(lang):
            return {"checks": list(self.rows)}

        self.watch = HealthWatch(tmp_path / "w.json", self.clock, lambda: True, lambda: 1, run, lambda key, msg: None, lambda: "ru",
                                 mono=self.clock, history=self.history)


def test_a_manual_check_feeds_the_history_and_the_last_manual_time(tmp_path):
    rig = WatchRig(tmp_path)
    rig.watch.record_manual([r("a", "fail")])
    assert [e["event"] for e in rig.history.events()] == ["found"]
    assert rig.watch.state()["lastManual"] == rig.clock.now
    again = HealthWatch(tmp_path / "w.json", rig.clock, lambda: True, lambda: 1, None, lambda k, m: None, lambda: "ru", mono=rig.clock)
    assert again.state()["lastManual"] == rig.clock.now, "the manual time is remembered"


def test_a_background_run_feeds_the_history(tmp_path):
    import asyncio
    rig = WatchRig(tmp_path)
    rig.rows = [r("a", "fail")]
    ran = False
    for _ in range(health_watch.FIRST_RUN_SECONDS // 60 + 2):  # the watch treats a bigger gap between ticks as a sleeping PC
        rig.clock.now += 60
        ran = asyncio.run(rig.watch.tick()) or ran
    assert ran is True
    assert [e["checkId"] for e in rig.history.events()] == ["a"]


# ---- the route and the token ----

def test_the_history_route_is_registered_and_needs_the_token():
    service = (Path(__file__).parent / "sentinel_service.py").read_text(encoding="utf-8")
    assert 'add_get("/api/v1/health/history", self.handle_get_health_history)' in service
    assert token_allowed("secret", "/api/v1/health/history", {}, {}) is False
    assert token_allowed("secret", "/api/v1/health/history", {}, {"token": "secret"}) is False, "the query token is for the streams only"
    assert token_allowed("secret", "/api/v1/health/history", {"X-Sentinel-Token": "secret"}, {}) is True


def test_the_history_handler_returns_events_newest_first(tmp_path):
    import asyncio
    import types
    import sentinel_service

    history = make(tmp_path)
    history.record([r("a", "fail")])
    fake = types.SimpleNamespace(health_history=history)
    response = asyncio.run(sentinel_service.SentinelSupervisor.handle_get_health_history(fake, None))
    assert response.status == 200 and json.loads(response.text)["events"][0]["checkId"] == "a"


# ---- toast launch ----

class Popped:
    def __init__(self, monkeypatch):
        self.calls = []
        monkeypatch.setattr(gui_headless.subprocess, "Popen", lambda cmd, **kw: self.calls.append((cmd, kw)))


def test_a_toast_with_a_known_launch_key_carries_the_uri(monkeypatch):
    popped = Popped(monkeypatch)
    gui_headless.send_windows_toast("T", "M", launch="health")
    env = popped.calls[0][1]["env"]
    assert env["SENTINEL_TOAST_LAUNCH"] == "hellharvest://health"
    assert "SENTINEL_TOAST_LAUNCH" in gui_headless.TOAST_SCRIPT and "activationType" in gui_headless.TOAST_SCRIPT


def test_a_toast_without_or_with_an_unknown_launch_key_has_no_activation(monkeypatch):
    popped = Popped(monkeypatch)
    gui_headless.send_windows_toast("T", "M")
    gui_headless.send_windows_toast("T", "M", launch="https://evil.example/")
    assert [call[1]["env"].get("SENTINEL_TOAST_LAUNCH", "") for call in popped.calls] == ["", ""]


def test_the_toast_gate_passes_the_launch_key_only_when_given(tmp_path):
    sent = []
    gate = ToastGate(lambda *args: sent.append(args), lambda: True, None)
    gate.notify("k", "1", "T", "M")
    gate.notify("k", "2", "T", "M", launch="health")
    assert sent == [("T", "M"), ("T", "M", "health")]


def test_the_watch_toast_text_names_the_center():
    assert "Центр проверки" in health_watch._TOAST["ru"] and "Health center" in health_watch._TOAST["en"]


def test_the_state_splits_failures_from_the_problem_count(tmp_path):
    rig = WatchRig(tmp_path)
    rig.watch.record_manual([r("a", "fail"), r("b", "fail"), r("c", "warn"), r("d", "ok"), r("n", "fail", area="network")])
    state = rig.watch.state()
    assert state["problems"] == 3 and state["fails"] == 2, "network rows are not watched, the rest is split into failures and the total"
    again = HealthWatch(tmp_path / "w.json", rig.clock, lambda: True, lambda: 1, None, lambda k, m: None, lambda: "ru", mono=rig.clock)
    assert again.state()["fails"] == 2


def test_a_background_run_overtaken_by_a_manual_check_does_not_feed_the_history(tmp_path):
    import asyncio
    clock = Clock(1_000_000.0)
    history = HealthHistory(tmp_path / "h.json", clock)
    holder = {}

    async def run(lang):
        holder["watch"].record_manual([r("a", "ok")])  # the panel's check lands while the background run is still working
        return {"checks": [r("a", "fail")]}  # an older picture than the manual one

    watch = HealthWatch(tmp_path / "w.json", clock, lambda: True, lambda: 1, run, lambda k, m: None, lambda: "ru", mono=clock, history=history)
    holder["watch"] = watch
    ran = False
    for _ in range(health_watch.FIRST_RUN_SECONDS // 60 + 2):
        clock.now += 60
        ran = asyncio.run(watch.tick()) or ran
    assert ran is True
    assert history.events() == [], "the stale background result is not recorded as a new problem"
