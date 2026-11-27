"""Read-only health checks behind GET /api/v1/health: every check ok/warn/fail with fakes, the time budget, the crash path, the route."""
import asyncio
import json
import os
import threading
import time
import types
from datetime import datetime, timedelta
from pathlib import Path

import aiohttp
import pytest

import health


def run(coro):
    return asyncio.run(coro)


def bridge(**over):
    base = dict(user_id="", username="", oauth_code=None, oauth_uri=None)
    base.update(over)
    return types.SimpleNamespace(**base)


def make_ctx(tmp_path, **over):
    core = tmp_path / "core"
    core.mkdir(exist_ok=True)

    async def readiness():
        return {"items": [{"id": "module", "status": "ok", "params": {}, "action": None}]}

    base = dict(
        lang="ru", project_dir=tmp_path, log_dir=core, bridge=bridge(),
        steam_state=lambda: {"available": True, "unavailableReason": None, "steam": {"running": True, "signedIn": True},
                             "community": {"session": "ok"}, "farm": {}},
        giveaways_readiness=readiness, giveaways_marker=lambda: False,
        cached_update=lambda: None, version="4.0.1", now=datetime.now,
    )
    base.update(over)
    return health.HealthContext(**base)


def one(rows):
    assert len(rows) == 1, rows
    return rows[0]


@pytest.fixture(autouse=True)
def clean_state():
    health.OAUTH_CODES.clear()
    health.note_settings_error(None)
    health._flight = None
    health._last = None
    yield
    health.OAUTH_CODES.clear()
    health.note_settings_error(None)
    health._flight = None
    health._last = None


# ---- twitch ----

def test_twitch_signed_in_is_ok_and_says_the_token_was_not_probed(tmp_path):
    row = one(run(health.check_twitch_login(make_ctx(tmp_path, bridge=bridge(user_id="1", username="mort")))))
    assert (row["id"], row["area"], row["status"]) == ("twitch_login", "twitch", "ok")
    assert "m***" in row["detail"] and "mort" not in row["detail"]


def test_twitch_not_signed_in_warns(tmp_path):
    row = one(run(health.check_twitch_login(make_ctx(tmp_path))))
    assert row["status"] == "warn" and row["advice"]


def test_twitch_waiting_for_code_shows_the_code(tmp_path):
    row = one(run(health.check_twitch_code(make_ctx(tmp_path, bridge=bridge(oauth_code="ABCD-EFGH", oauth_uri="https://www.twitch.tv/activate")))))
    assert row["status"] == "warn" and "ABCD-EFGH" in row["detail"]


def test_twitch_no_code_pending_is_ok(tmp_path):
    assert one(run(health.check_twitch_code(make_ctx(tmp_path))))["status"] == "ok"


def test_code_tracker_counts_distinct_codes_in_the_window():
    t = health.CodeTracker()
    now = 1000.0
    t.note("A", now - 700)  # outside 10 minutes
    t.note("B", now - 100)
    t.note("B", now - 90)  # the same code again is not new
    t.note("C", now - 50)
    assert t.recent(now) == 2


def test_code_loop_fails_at_three_new_codes_in_ten_minutes(tmp_path):
    ctx = make_ctx(tmp_path)
    assert one(run(health.check_twitch_code_loop(ctx)))["status"] == "ok"
    for code in ("A", "B"):
        health.OAUTH_CODES.note(code)
    assert one(run(health.check_twitch_code_loop(ctx)))["status"] == "ok"
    health.OAUTH_CODES.note("C")
    row = one(run(health.check_twitch_code_loop(ctx)))
    assert row["status"] == "fail" and "4.0.1" in row["advice"]


# ---- steam ----

def steam_ctx(tmp_path, **state):
    base = {"available": True, "unavailableReason": None, "steam": {"running": True, "signedIn": True},
            "community": {"session": "ok"}, "farm": {}}
    base.update(state)
    return make_ctx(tmp_path, steam_state=lambda: base)


def by_id(rows):
    return {r["id"]: r for r in rows}


def test_steam_all_good(tmp_path):
    rows = run(health.check_steam(steam_ctx(tmp_path)))
    assert rows and all(r["status"] == "ok" and r["area"] == "steam" for r in rows)


def test_steam_module_off_is_one_ok_row(tmp_path):
    row = one(run(health.check_steam(steam_ctx(tmp_path, available=False, unavailableReason="module_disabled"))))
    assert row["status"] == "ok"


@pytest.mark.parametrize("reason", ["helper_missing", "node_missing", "unsupported"])
def test_steam_module_unavailable_warns(tmp_path, reason):
    row = one(run(health.check_steam(steam_ctx(tmp_path, available=False, unavailableReason=reason))))
    assert row["status"] == "warn" and reason in row["detail"]


def test_steam_not_running_and_signed_out(tmp_path):
    rows = by_id(run(health.check_steam(steam_ctx(tmp_path, steam={"running": False, "signedIn": False}))))
    assert rows["steam_client"]["status"] == "warn"
    rows = by_id(run(health.check_steam(steam_ctx(tmp_path, steam={"running": True, "signedIn": False}))))
    assert rows["steam_client"]["status"] == "warn"


@pytest.mark.parametrize("session", ["signed_out", "account_mismatch", "engine_missing"])
def test_steam_community_session_problems_warn(tmp_path, session):
    rows = by_id(run(health.check_steam(steam_ctx(tmp_path, community={"session": session}))))
    assert rows["steam_session"]["status"] == "warn" and session in rows["steam_session"]["detail"]


def test_steam_farm_last_error_warns(tmp_path):
    rows = by_id(run(health.check_steam(steam_ctx(tmp_path, farm={"lastError": "steam_closed"}))))
    assert rows["steam_farm"]["status"] == "warn" and "steam_closed" in rows["steam_farm"]["detail"]


# ---- giveaways ----

def readiness_ctx(tmp_path, items, marker=False):
    async def readiness():
        return {"items": items}
    return make_ctx(tmp_path, giveaways_readiness=readiness, giveaways_marker=lambda: marker)


def item(item_id, status, params=None, store=None):
    d = {"id": item_id, "status": status, "params": params or {}, "action": None}
    if store:
        d["store"] = store
    return d


def test_giveaways_status_mapping(tmp_path):
    items = [item("module", "ok"), item("node", "todo", {"reason": "missing"}), item("browser", "warning", {"reason": "will_download"}),
             item("scheduler", "info", {"reason": "not_created"}), item("login", "ok", {"account": "me"}, "epic")]
    rows = run(health.check_giveaways(readiness_ctx(tmp_path, items)))
    got = {(r["id"]): r["status"] for r in rows}
    assert got["giveaways_module"] == "ok"
    assert got["giveaways_node"] == "warn"
    assert got["giveaways_browser"] == "warn"
    assert got["giveaways_scheduler"] == "ok"
    assert got["giveaways_login"] == "ok"
    assert all(r["area"] == "giveaways" for r in rows)


def test_giveaways_store_sign_ins_are_one_row_that_names_the_missing_ones(tmp_path):
    items = [item("login", "ok", {"account": "me"}, "epic"), item("login", "todo", None, "gog")]
    rows = run(health.check_giveaways(readiness_ctx(tmp_path, items)))
    login = one(rows)
    assert login["id"] == "giveaways_login" and login["status"] == "warn" and "gog" in login["detail"] and "epic" in login["detail"]


def test_details_are_sanitized_before_they_leave_the_service():
    home = str(Path.home())
    r = health.row("x", "system", "warn", "t", f"{home}\app steam 76561198012345678")
    assert home not in r["detail"] and "76561198012345678" not in r["detail"]


def test_giveaways_incomplete_engine_install_marker_fails(tmp_path):
    rows = by_id(run(health.check_giveaways(readiness_ctx(tmp_path, [item("engine", "todo")], marker=True))))
    assert rows["giveaways_engine"]["status"] == "fail" and rows["giveaways_engine"]["advice"]


def test_giveaways_disabled_selection_is_not_a_problem(tmp_path):
    rows = by_id(run(health.check_giveaways(readiness_ctx(tmp_path, [item("selection", "todo", {"reason": "disabled"})]))))
    assert rows["giveaways_selection"]["status"] == "ok"


# ---- network ----

def fake_probe(results):
    async def probe(url, timeout):
        outcome = results[url]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome
    return probe


def test_network_ok_slow_and_unreachable(tmp_path, monkeypatch):
    ctx = make_ctx(tmp_path)
    monkeypatch.setattr(health, "_http_probe", fake_probe({"https://www.twitch.tv": 120, "https://gql.twitch.tv": 2500,
                                                           "https://steamcommunity.com": aiohttp.ClientConnectionError("dns"),
                                                           "https://api.github.com": asyncio.TimeoutError()}))
    rows = {r["id"]: r for r in run(health.run_health(ctx, checks=[c for c in health.CATALOG if c.area == "network"]))["checks"]}
    assert rows["net_twitch"]["status"] == "ok" and "120" in rows["net_twitch"]["detail"]
    assert rows["net_gql"]["status"] == "warn" and "2500" in rows["net_gql"]["detail"]
    assert rows["net_steam"]["status"] == "fail" and "VPN" in rows["net_steam"]["advice"]
    assert rows["net_github"]["status"] == "fail"


def test_network_probe_treats_any_http_status_as_reachable(monkeypatch):
    class Resp:
        status = 403
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

    class Session:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        def head(self, url, **k): return Resp()
        get = head

    monkeypatch.setattr(health.aiohttp, "ClientSession", Session)
    ms = run(health._http_probe("https://gql.twitch.tv", 5))
    assert isinstance(ms, int) and ms >= 0


# ---- updates ----

def test_updates_current_version_ok_and_newer_cached_version_warns(tmp_path):
    row = one(run(health.check_updates_version(make_ctx(tmp_path))))
    assert row["status"] == "ok" and "4.0.1" in row["detail"]
    ctx = make_ctx(tmp_path, cached_update=lambda: {"update_available": True, "latest_version": "4.1.0"})
    row = one(run(health.check_updates_version(ctx)))
    assert row["status"] == "warn" and "4.1.0" in row["detail"]


def test_updates_half_applied_marker_warns(tmp_path):
    ctx = make_ctx(tmp_path)
    assert one(run(health.check_updates_pending(ctx)))["status"] == "ok"
    (tmp_path / "TwitchDropsSentinel.update").write_bytes(b"x")
    assert one(run(health.check_updates_pending(ctx)))["status"] == "warn"


# ---- settings ----

def test_settings_fallback_flag_fails(tmp_path):
    ctx = make_ctx(tmp_path)
    assert one(run(health.check_settings(ctx)))["status"] == "ok"
    health.note_settings_error("Expecting value: line 1 column 1")
    row = one(run(health.check_settings(ctx)))
    assert row["status"] == "fail" and "Expecting value" in row["detail"]


def test_load_settings_sets_and_clears_the_flag(tmp_path, monkeypatch):
    import sentinel_service as s
    cfg = tmp_path / "config.json"
    monkeypatch.setattr(s, "CONFIG_FILE", cfg)
    cfg.write_text("{ not json", encoding="utf-8")
    s.SentinelSupervisor.load_settings(None)
    assert health.settings_error() is not None
    cfg.write_text("{}", encoding="utf-8")
    s.SentinelSupervisor.load_settings(None)
    assert health.settings_error() is None


# ---- system ----

def test_disk_thresholds(tmp_path, monkeypatch):
    ctx = make_ctx(tmp_path)
    gb = 1024 ** 3
    for free, status in ((0.5 * gb, "fail"), (3 * gb, "warn"), (50 * gb, "ok")):
        monkeypatch.setattr(health, "disk_free_bytes", lambda p, f=free: int(f))
        assert one(run(health.check_disk(ctx)))["status"] == status


def test_logs_size_warns_over_200_mb(tmp_path):
    ctx = make_ctx(tmp_path)
    (ctx.log_dir / "sentinel_service.log").write_bytes(b"x" * 1000)
    (ctx.log_dir / "sentinel_service.log.1").write_bytes(b"x" * 1000)
    assert one(run(health.check_logs_size(ctx)))["status"] == "ok"
    big = ctx.log_dir / "sentinel_service.log.2"
    with open(big, "wb") as f:
        f.truncate(201 * 1024 * 1024)
    assert one(run(health.check_logs_size(ctx)))["status"] == "warn"


def test_autostart_off_current_copy_and_other_copy(tmp_path, monkeypatch):
    ctx = make_ctx(tmp_path)
    monkeypatch.setattr(health, "read_autostart", lambda: (False, ""))
    assert one(run(health.check_autostart(ctx)))["status"] == "ok"
    mine = f'"{tmp_path / "TwitchDropsSentinel.exe"}" --minimized'
    monkeypatch.setattr(health, "read_autostart", lambda: (True, mine))
    assert one(run(health.check_autostart(ctx)))["status"] == "ok"
    other = '"C:\\Elsewhere\\Old Copy\\TwitchDropsSentinel.exe" --minimized'
    monkeypatch.setattr(health, "read_autostart", lambda: (True, other))
    row = one(run(health.check_autostart(ctx)))
    assert row["status"] == "warn" and "Old Copy" in row["detail"]


def test_log_errors_last_hour_are_counted_and_sanitized(tmp_path):
    now = datetime(2026, 11, 24, 12, 0, 0)
    ctx = make_ctx(tmp_path, now=lambda: now)
    stamp = lambda d: (now - d).strftime("%Y-%m-%d %H:%M:%S,123")
    home = str(Path.home())
    lines = [f"{stamp(timedelta(hours=3))} [ERROR] X: too old",
             f"{stamp(timedelta(minutes=30))} [INFO] X: fine",
             f"{stamp(timedelta(minutes=20))} [ERROR] X: broke {home}\\file oauth:abcdef123456 steam 76561198012345678",
             "Traceback (most recent call last):",
             f"{stamp(timedelta(minutes=5))} [ERROR] X: again"]
    (ctx.log_dir / "sentinel_service.log").write_text("\n".join(lines) + "\n", encoding="utf-8")
    row = one(run(health.check_log_errors(ctx)))
    assert row["status"] == "warn" and "2" in row["title"] + row["detail"]
    assert "too old" not in row["detail"] and "again" in row["detail"]
    assert home not in row["detail"] and "abcdef123456" not in row["detail"] and "76561198012345678" not in row["detail"]


def test_log_errors_none_is_ok_and_missing_log_is_ok(tmp_path):
    ctx = make_ctx(tmp_path)
    assert one(run(health.check_log_errors(ctx)))["status"] == "ok"
    (ctx.log_dir / "sentinel_service.log").write_text(f"{datetime.now():%Y-%m-%d %H:%M:%S,000} [INFO] X: fine\n", encoding="utf-8")
    assert one(run(health.check_log_errors(ctx)))["status"] == "ok"


# ---- the run: shape, budget, crash ----

def test_every_catalog_row_has_the_documented_shape(tmp_path, monkeypatch):
    monkeypatch.setattr(health, "_http_probe", fake_probe({u: 50 for u in ("https://www.twitch.tv", "https://gql.twitch.tv", "https://steamcommunity.com", "https://api.github.com")}))
    monkeypatch.setattr(health, "read_autostart", lambda: (False, ""))
    ctx = make_ctx(tmp_path)
    result = run(health.run_health(ctx))
    assert set(result) >= {"checks", "version", "generatedAt"} and result["version"] == "4.0.1"
    assert result["checks"]
    areas = {"twitch", "steam", "giveaways", "network", "updates", "settings", "system"}
    for row in result["checks"]:
        assert set(row) >= {"id", "area", "status", "title", "detail", "advice"}
        assert row["status"] in ("ok", "warn", "fail") and row["area"] in areas
    assert {r["area"] for r in result["checks"]} == areas
    assert len({r["id"] for r in result["checks"]}) == len(result["checks"])


def test_a_crashing_check_becomes_a_warn_row_and_is_logged(tmp_path, caplog):
    async def boom(ctx):
        raise RuntimeError("kaput")
    entry = health.Check("boom", "system", ("Сломанная", "Broken"), boom, 1.0)
    with caplog.at_level("WARNING"):
        rows = run(health.run_health(make_ctx(tmp_path), checks=[entry]))["checks"]
    row = one(rows)
    assert (row["id"], row["status"], row["area"]) == ("boom", "warn", "system") and "kaput" in row["detail"]
    assert any("kaput" in r.getMessage() or (r.exc_info and "kaput" in str(r.exc_info[1])) for r in caplog.records)


def test_a_slow_check_times_out_alone_the_others_still_report(tmp_path):
    async def slow(ctx):
        await asyncio.sleep(5)

    async def fast(ctx):
        return [health.row("fast", "system", "ok", "Быстрая")]
    checks = [health.Check("slow", "system", ("Медленная", "Slow"), slow, 0.2), health.Check("fast", "system", ("Быстрая", "Fast"), fast, 1.0)]
    rows = {r["id"]: r for r in run(health.run_health(make_ctx(tmp_path), checks=checks))["checks"]}
    assert rows["slow"]["status"] == "warn" and "не успела" in rows["slow"]["detail"]
    assert rows["fast"]["status"] == "ok"


def test_the_whole_run_budget_cuts_off_what_is_left(tmp_path):
    async def slow(ctx):
        await asyncio.sleep(5)
    checks = [health.Check(f"s{i}", "system", ("Медленная", "Slow"), slow, 30.0) for i in range(3)]
    result = run(health.run_health(make_ctx(tmp_path), checks=checks, budget=0.3))
    assert all(r["status"] == "warn" and "не успела" in r["detail"] for r in result["checks"]) and len(result["checks"]) == 3


def test_english_texts_when_asked(tmp_path):
    ctx = make_ctx(tmp_path, lang="en", bridge=bridge(user_id="1", username="mort"))
    row = one(run(health.check_twitch_login(ctx)))
    assert not any("а" <= ch.lower() <= "я" for ch in row["title"] + row["detail"])


# ---- the route: 200 with the token, 401 without ----

def test_health_route_requires_the_token(tmp_path):
    import types as _t
    from aiohttp import web
    from aiohttp.test_utils import TestClient, TestServer
    import sentinel_service as s

    ctx = make_ctx(tmp_path)
    fake = _t.SimpleNamespace(api_token="secret-token-123")
    fake._health_context = lambda lang: ctx
    recorded = []
    fake.health_watch = _t.SimpleNamespace(record_manual=recorded.append)  # the panel's check feeds the background watch's count

    async def go():
        app = web.Application(middlewares=[_t.MethodType(s.SentinelSupervisor.cors_middleware, fake)])
        app.router.add_get("/api/v1/health", _t.MethodType(s.SentinelSupervisor.handle_get_health, fake))
        async with TestClient(TestServer(app)) as client:
            denied = await client.get("/api/v1/health")
            ok = await client.get("/api/v1/health", headers={"X-Sentinel-Token": "secret-token-123"})
            return denied.status, ok.status, await ok.json()

    denied, ok, body = run(go())
    assert denied == 401 and ok == 200
    assert body["version"] == "4.0.1" and isinstance(body["checks"], list)
    json.dumps(body)
    assert len(recorded) == 1 and recorded[0] == body["checks"], "the count behind the menu dot follows the manual check"


def test_health_route_is_registered():
    text = (Path(__file__).parent / "sentinel_service.py").read_text(encoding="utf-8")
    assert '"/api/v1/health"' in text and "self.handle_get_health" in text


# ---- review round: network deadline ----

class _Hang:
    async def __aenter__(self):
        await asyncio.sleep(30)

    async def __aexit__(self, *a):
        return False


def _session(head, get):
    class Session:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        def __getattr__(self, name): return {"head": head, "get": get}[name]
    return Session


def _elapsed_probe(timeout):
    """(error, seconds) of a probe, with a 2 s outer cap so a probe that ignores its own deadline cannot hang the test."""
    started = time.perf_counter()
    try:
        run(asyncio.wait_for(health._http_probe("https://x.test", timeout), 2.0))
    except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
        return exc, time.perf_counter() - started
    return None, time.perf_counter() - started


def test_probe_with_a_hanging_head_ends_within_one_deadline(monkeypatch):
    monkeypatch.setattr(health.aiohttp, "ClientSession", _session(lambda *a, **k: _Hang(), lambda *a, **k: _Hang()))
    exc, seconds = _elapsed_probe(0.3)
    assert isinstance(exc, asyncio.TimeoutError) and seconds < 1.0


def test_probe_head_error_then_hanging_get_shares_the_same_deadline(monkeypatch):
    class Boom:
        async def __aenter__(self): raise aiohttp.ClientConnectionError("no head")
        async def __aexit__(self, *a): return False
    monkeypatch.setattr(health.aiohttp, "ClientSession", _session(lambda *a, **k: Boom(), lambda *a, **k: _Hang()))
    exc, seconds = _elapsed_probe(0.3)
    assert isinstance(exc, asyncio.TimeoutError) and seconds < 1.0


def test_probe_falls_back_to_get_when_head_is_refused(monkeypatch):
    class Resp:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
    class Boom:
        async def __aenter__(self): raise aiohttp.ClientConnectionError("head refused")
        async def __aexit__(self, *a): return False
    monkeypatch.setattr(health.aiohttp, "ClientSession", _session(lambda *a, **k: Boom(), lambda *a, **k: Resp()))
    exc, _ = _elapsed_probe(1.0)
    assert exc is None


def test_a_dead_network_is_a_fail_row_with_advice_not_a_timeout_warning(tmp_path, monkeypatch):
    monkeypatch.setattr(health.aiohttp, "ClientSession", _session(lambda *a, **k: _Hang(), lambda *a, **k: _Hang()))
    monkeypatch.setattr(health, "NET_PROBE_SECONDS", 0.3)
    entry = health.Check("net_x", "network", ("Сеть", "Net"), health._net_fn("net_x", "https://x.test", "x.test"), 1.0)
    row = one(run(health.run_health(make_ctx(tmp_path), checks=[entry]))["checks"])
    assert row["status"] == "fail" and "VPN" in row["advice"]


def test_catalog_net_checks_wait_longer_than_the_probe_deadline():
    for entry in health.CATALOG:
        if entry.area == "network":
            assert entry.timeout > health.NET_PROBE_SECONDS


# ---- review round: blocking work off the event loop, single flight ----

def test_blocking_reads_run_off_the_event_loop(tmp_path, monkeypatch):
    main = threading.get_ident()
    seen = {}

    def spy(name, value):
        def f(*a, **k):
            seen[name] = threading.get_ident()
            return value
        return f
    monkeypatch.setattr(health, "disk_free_bytes", spy("disk", 50 * 1024 ** 3))
    monkeypatch.setattr(health, "read_autostart", spy("autostart", (False, "")))
    monkeypatch.setattr(health, "_read_tail", spy("tail", ""))
    monkeypatch.setattr(health, "_logs_total_bytes", spy("logs", 0))
    monkeypatch.setattr(health, "_path_exists", spy("pending", False))
    ctx = make_ctx(tmp_path, giveaways_marker=spy("marker", False))
    (ctx.log_dir / "sentinel_service.log").write_text("x\n", encoding="utf-8")

    async def go():
        for fn in (health.check_disk, health.check_autostart, health.check_log_errors, health.check_logs_size,
                   health.check_updates_pending, health.check_giveaways):
            await fn(ctx)
    run(go())
    assert set(seen) == {"disk", "autostart", "tail", "logs", "pending", "marker"}
    assert all(ident != main for ident in seen.values()), seen


def _counting_check(calls, delay=0.2):
    async def counting(ctx):
        calls.append(1)
        await asyncio.sleep(delay)
        return [health.row("c", "system", "ok", "C")]
    return [health.Check("c", "system", ("С", "C"), counting, 2.0)]


def test_concurrent_run_health_calls_share_one_run(tmp_path):
    calls = []
    checks = _counting_check(calls)

    async def go():
        ctx = make_ctx(tmp_path)
        return await asyncio.gather(health.run_health(ctx, checks=checks), health.run_health(ctx, checks=checks))
    first, second = run(go())
    assert len(calls) == 1 and first == second


def test_a_fresh_result_is_reused_and_an_old_one_is_not(tmp_path, monkeypatch):
    calls = []
    checks = _counting_check(calls, delay=0.01)

    async def go():
        ctx = make_ctx(tmp_path)
        await health.run_health(ctx, checks=checks)
        await health.run_health(ctx, checks=checks)
        monkeypatch.setattr(health, "REUSE_SECONDS", 0.0)
        await health.run_health(ctx, checks=checks)
    run(go())
    assert len(calls) == 2


def test_a_cancelled_caller_does_not_stop_the_shared_run(tmp_path):
    calls = []
    checks = _counting_check(calls)

    async def go():
        ctx = make_ctx(tmp_path)
        gone = asyncio.create_task(health.run_health(ctx, checks=checks))
        await asyncio.sleep(0.05)
        stays = asyncio.create_task(health.run_health(ctx, checks=checks))
        await asyncio.sleep(0)
        gone.cancel()
        return await stays
    result = run(go())
    assert len(calls) == 1 and result["checks"][0]["status"] == "ok"


def test_health_context_does_no_disk_work_until_the_marker_is_asked(monkeypatch):
    import sentinel_service as s
    asked = []
    monkeypatch.setattr(s, "resolve_fgc_root", lambda: asked.append(1) or Path("."))
    fake = types.SimpleNamespace(steam_idle=types.SimpleNamespace(state=dict), giveaways=None)
    ctx = s.SentinelSupervisor._health_context(fake, "ru")
    assert asked == []
    ctx.giveaways_marker()
    assert asked == [1]


# ---- review round: privacy ----

def test_twitch_name_and_id_are_masked_in_the_row(tmp_path):
    row = one(run(health.check_twitch_login(make_ctx(tmp_path, bridge=bridge(user_id="987654", username="mortuis")))))
    assert "mortuis" not in row["detail"] and "m***" in row["detail"]
    row = one(run(health.check_twitch_login(make_ctx(tmp_path, bridge=bridge(user_id="987654", username="")))))
    assert "987654" not in row["detail"]


@pytest.mark.parametrize("account,masked", [("person@mail.com", "p***@mail.com"), ("nickname", "n***"), ("me", "m***")])
def test_giveaway_account_names_and_emails_are_masked(tmp_path, account, masked):
    detail = health._giveaway_detail(make_ctx(tmp_path), item("login", "ok", {"account": account}, "epic"))
    assert detail == masked


def test_mask_name_leaves_empty_alone():
    assert health.mask_name("") == ""


_HOME = str(Path.home())


@pytest.mark.parametrize("raw,leaked", [
    ("Authorization: Bearer abc.DEF-123_xyz", "abc.DEF-123"),
    ("sent Bearer abcdef123456 to the API", "abcdef123456"),
    ('{"access_token": "sekret-value-1"}', "sekret-value-1"),
    ('{"refresh_token":"sekret-value-2","x":1}', "sekret-value-2"),
    ('{"token": "sekret-value-3"}', "sekret-value-3"),
    ("token: sekret-value-4 end", "sekret-value-4"),
    ("access_token: sekret-value-5", "sekret-value-5"),
    ("authorization: Basic c2VjcmV0LXZhbHVl", "c2VjcmV0LXZhbHVl"),
    ("Cookie: auth-token=sekret-cookie-6; unique_id=abc999", "sekret-cookie-6"),
    ("Set-Cookie: session=sekret-cookie-7; Path=/", "sekret-cookie-7"),
    (_HOME.replace("\\", "\\\\") + "\\\\app", _HOME.replace("\\", "\\\\")),
    (_HOME.replace("\\", "/") + "/app", _HOME.replace("\\", "/")),
    (_HOME + "\\app", _HOME),
])
def test_sanitize_covers_the_pattern(raw, leaked):
    out = health.sanitize(raw)
    assert leaked not in out, out


def test_sanitize_keeps_ordinary_text():
    assert health.sanitize("The token was not checked. Version 4.0.1") == "The token was not checked. Version 4.0.1"


# ---- review round: CodeTracker ----

class _LockedDict(dict):
    """Fails any read or write of the tracker's dict made without holding the tracker's lock."""
    owner = None

    def _held(self):
        assert self.owner._lock.locked(), "dict touched without the lock"

    def setdefault(self, *a): self._held(); return super().setdefault(*a)
    def items(self): self._held(); return super().items()
    def values(self): self._held(); return super().values()
    def clear(self): self._held(); return super().clear()
    def __delitem__(self, k): self._held(); return super().__delitem__(k)


def test_code_tracker_touches_its_dict_only_under_the_lock():
    t = health.CodeTracker()
    guard = _LockedDict()
    guard.owner = t
    t._seen = guard
    t.note("A", 1000.0)
    t.note("B", 1000.0 + 100)
    t.note("C", 1000.0 + 10000)  # prunes the old ones
    assert t.recent(1000.0 + 10000) == 1
    t.clear()
    assert t.recent(1000.0) == 0


def test_code_tracker_survives_threads():
    t = health.CodeTracker()
    errors = []

    def writer(n):
        try:
            for i in range(3000):
                t.note(f"{n}-{i}", float(i))
        except Exception as exc:  # noqa: BLE001 - the test reports whatever a race throws
            errors.append(exc)

    def reader():
        try:
            for i in range(3000):
                t.recent(float(i))
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
    threads = [threading.Thread(target=writer, args=(n,)) for n in range(3)] + [threading.Thread(target=reader)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert errors == []


def test_a_successful_twitch_sign_in_clears_the_code_tracker(monkeypatch):
    import gui_headless
    for name in ("user_id", "username", "oauth_code", "oauth_uri"):
        monkeypatch.setattr(gui_headless.STATE_BRIDGE, name, "", raising=False)
    for code in ("A", "B", "C"):
        health.OAUTH_CODES.note(code)
    assert health.OAUTH_CODES.recent() == 3
    gui_headless.HeadlessLoginForm().update("signed in", 12345, username="mortuis")
    assert health.OAUTH_CODES.recent() == 0


# ================= stage 2: one-click fixes =================
# Nothing here touches the real registry, config.json, logs or services: every action is a recording fake, files live in tmp_path.


class Fakes:
    """The service's actions as recorders; `backups` is what list_backups returns (newest first)."""

    def __init__(self, tmp_path, backups=(), bad=(), fail=None):
        self.calls = []
        self.backups = list(backups)
        self.bad = set(bad)
        self.fail = fail
        self.dir = tmp_path

    def _do(self, name):
        self.calls.append(name)
        if self.fail == name:
            raise health.FixFailed(f"{name} refused")

    async def sign_out_twitch(self):
        self._do("sign_out_twitch")

    async def steam_login(self):
        self._do("steam_login")

    async def install_engine(self):
        self._do("install_engine")
        return "started"

    def enable_autostart(self):
        self._do("enable_autostart")
        return True

    async def reset_settings(self):
        self._do("reset_settings")

    def save_profile_backup(self):
        self._do("save_profile_backup")
        path = self.dir / "before_health_fix.zip"
        path.write_bytes(b"zip")
        return path

    def list_backups(self):
        self.calls.append("list_backups")
        return list(self.backups)

    def stage_restore(self, path):
        self.calls.append(("stage_restore", path.name))
        if path.name in self.bad:
            raise ValueError("bad archive")
        return ["config.json"]

    def actions(self):
        return health.FixActions(
            sign_out_twitch=self.sign_out_twitch, steam_login=self.steam_login, install_engine=self.install_engine,
            enable_autostart=self.enable_autostart, reset_settings=self.reset_settings, save_profile_backup=self.save_profile_backup,
            list_backups=self.list_backups, stage_restore=self.stage_restore)


def fix_ctx(tmp_path, fakes=None, claim_dirs=(), **over):
    fakes = fakes or Fakes(tmp_path)
    return health.FixContext(health=make_ctx(tmp_path, **over), actions=fakes.actions(), claim_log_dirs=lambda: list(claim_dirs)), fakes


@pytest.fixture(autouse=True)
def clean_fix_state():
    health._fix_running = False
    yield
    health._fix_running = False


# ---- rows offer fixes ----

def test_a_row_without_a_fix_has_no_fix_key(tmp_path):
    assert "fix" not in one(run(health.check_twitch_code(make_ctx(tmp_path))))
    assert "fix" not in health.row("x", "system", "ok", "t")


def test_code_loop_row_offers_a_confirmed_relogin_with_the_exact_text(tmp_path):
    for code in ("A", "B", "C"):
        health.OAUTH_CODES.note(code)
    row = one(run(health.check_twitch_code_loop(make_ctx(tmp_path))))
    assert row["fix"]["id"] == "twitch_relogin"
    assert row["fix"]["confirm"] == "Вход в Twitch будет сброшен, понадобится ввести новый код"
    assert row["fix"]["label"]


def test_not_signed_in_without_a_pending_code_offers_relogin_but_a_pending_code_does_not(tmp_path):
    assert one(run(health.check_twitch_login(make_ctx(tmp_path))))["fix"]["id"] == "twitch_relogin"
    pending = make_ctx(tmp_path, bridge=bridge(oauth_code="ABCD-EFGH"))
    assert "fix" not in one(run(health.check_twitch_login(pending)))
    assert "fix" not in one(run(health.check_twitch_login(make_ctx(tmp_path, bridge=bridge(user_id="1", username="m")))))


def test_pending_code_row_carries_a_safe_page_side_fix(tmp_path):
    ctx = make_ctx(tmp_path, bridge=bridge(oauth_code="ABCD-EFGH", oauth_uri="https://www.twitch.tv/activate"))
    fix = one(run(health.check_twitch_code(ctx)))["fix"]
    assert fix["id"] == "twitch_open_code" and fix["client"] is True
    assert fix["uri"] == "https://www.twitch.tv/activate" and fix["code"] == "ABCD-EFGH"
    assert "twitch_open_code" not in health.FIXES, "no service action: the page and the host do it"


@pytest.mark.parametrize("uri", ["https://evil.example/activate", "http://www.twitch.tv/activate", "https://twitch.tv.evil.com/x",
                                 "javascript:alert(1)", "https://user@www.twitch.tv/activate", "file:///c:/x", "https://www.twitch.tv:8443/a", None])
def test_a_foreign_activation_address_is_replaced_by_the_twitch_one(tmp_path, uri):
    ctx = make_ctx(tmp_path, bridge=bridge(oauth_code="ABCD-EFGH", oauth_uri=uri))
    assert one(run(health.check_twitch_code(ctx)))["fix"]["uri"] == "https://www.twitch.tv/activate"


def test_an_address_on_twitch_tv_from_the_state_is_kept(tmp_path):
    ctx = make_ctx(tmp_path, bridge=bridge(oauth_code="ABCD-EFGH", oauth_uri="https://www.twitch.tv/activate?device-code=XYZ"))
    assert one(run(health.check_twitch_code(ctx)))["fix"]["uri"] == "https://www.twitch.tv/activate?device-code=XYZ"


def test_an_odd_code_is_not_passed_on(tmp_path):
    ctx = make_ctx(tmp_path, bridge=bridge(oauth_code="<script>x</script>", oauth_uri="https://www.twitch.tv/activate"))
    assert "code" not in one(run(health.check_twitch_code(ctx)))["fix"]


@pytest.mark.parametrize("session", ["signed_out", "account_mismatch"])
def test_steam_sign_in_problem_offers_the_login_without_confirm(tmp_path, session):
    fix = by_id(run(health.check_steam(steam_ctx(tmp_path, community={"session": session}))))["steam_session"]["fix"]
    assert fix["id"] == "steam_login" and "confirm" not in fix


def test_steam_engine_missing_or_a_good_session_offers_nothing(tmp_path):
    for session in ("engine_missing", "ok"):
        assert "fix" not in by_id(run(health.check_steam(steam_ctx(tmp_path, community={"session": session}))))["steam_session"]


def test_engine_marker_and_missing_engine_offer_the_reinstall(tmp_path):
    marker = by_id(run(health.check_giveaways(readiness_ctx(tmp_path, [item("engine", "todo")], marker=True))))["giveaways_engine"]
    missing = by_id(run(health.check_giveaways(readiness_ctx(tmp_path, [item("engine", "todo")]))))["giveaways_engine"]
    fine = by_id(run(health.check_giveaways(readiness_ctx(tmp_path, [item("engine", "ok")]))))["giveaways_engine"]
    assert marker["fix"]["id"] == "giveaways_reinstall" and missing["fix"]["id"] == "giveaways_reinstall" and "fix" not in fine
    assert "confirm" not in marker["fix"]



def test_a_config_fallback_offers_a_confirmed_restore(tmp_path):
    health.note_settings_error("JSONDecodeError: x")
    fix = one(run(health.check_settings(make_ctx(tmp_path))))["fix"]
    assert fix["id"] == "settings_restore" and fix["confirm"]
    health.note_settings_error(None)
    assert "fix" not in one(run(health.check_settings(make_ctx(tmp_path))))


def test_big_logs_offer_a_confirmed_trim(tmp_path):
    ctx = make_ctx(tmp_path)
    with open(ctx.log_dir / "sentinel_service.log.2", "wb") as f:
        f.truncate(201 * 1024 * 1024)
    row = one(run(health.check_logs_size(ctx)))
    assert row["fix"]["id"] == "logs_trim" and row["fix"]["confirm"]


def test_autostart_of_another_copy_offers_the_repair_and_names_this_copys_path(tmp_path, monkeypatch):
    monkeypatch.setattr(health, "read_autostart", lambda: (True, '"C:\\Elsewhere\\Old Copy\\TwitchDropsSentinel.exe" --minimized'))
    row = one(run(health.check_autostart(make_ctx(tmp_path))))
    assert row["fix"]["id"] == "autostart_repair" and "confirm" not in row["fix"]
    assert "TwitchDropsSentinel.exe" in row["fix"]["label"] and "Old Copy" not in row["fix"]["label"]
    monkeypatch.setattr(health, "read_autostart", lambda: (False, ""))
    assert "fix" not in one(run(health.check_autostart(make_ctx(tmp_path))))


def test_the_english_fix_texts_have_no_russian(tmp_path):
    health.note_settings_error("x")
    ctx = make_ctx(tmp_path, lang="en")
    fix = one(run(health.check_settings(ctx)))["fix"]
    assert not any("а" <= ch.lower() <= "я" for ch in fix["label"] + fix["confirm"])


def test_every_service_fix_a_row_can_offer_is_in_the_whitelist():
    assert set(health.FIXES) == {"twitch_relogin", "steam_login", "giveaways_reinstall", "autostart_repair", "settings_restore", "logs_trim"}
    for fix_id, fix in health.FIXES.items():
        assert fix.checks and all(c in {e.id for e in health.CATALOG} for c in fix.checks), fix_id


# ---- running a fix ----

def test_an_unknown_id_is_a_400_and_nothing_runs(tmp_path):
    fctx, fakes = fix_ctx(tmp_path)
    for bad in ("rm_rf", "", "../x", "twitch_open_code", None, 5):
        status, body = run(health.run_fix(bad, fctx))
        assert status == 400 and body["ok"] is False and body["message"], bad
    assert fakes.calls == []


def test_a_fix_that_does_not_apply_is_a_409_with_a_message_and_nothing_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(health, "read_autostart", lambda: (False, ""))
    fctx, fakes = fix_ctx(tmp_path, bridge=bridge(user_id="1", username="m"))
    status, body = run(health.run_fix("twitch_relogin", fctx))
    assert status == 409 and body["ok"] is False and body["message"] and fakes.calls == []
    for fix_id in ("steam_login", "giveaways_reinstall", "autostart_repair", "settings_restore", "logs_trim"):
        status, body = run(health.run_fix(fix_id, fctx))
        assert status == 409 and body["message"], fix_id
    assert fakes.calls == []


def test_relogin_signs_out_once_then_rechecks_the_twitch_rows(tmp_path, caplog):
    for code in ("A", "B", "C"):
        health.OAUTH_CODES.note(code)
    fctx, fakes = fix_ctx(tmp_path)
    with caplog.at_level("INFO", logger="sentinel.health"):
        status, body = run(health.run_fix("twitch_relogin", fctx))
    assert status == 200 and body["ok"] is True and body["message"]
    assert fakes.calls == ["sign_out_twitch"]
    assert {r["id"] for r in body["checks"]} == {"twitch_login", "twitch_code", "twitch_code_loop"}
    assert any(rec.getMessage().startswith("health fix twitch_relogin: ok") for rec in caplog.records)


def test_steam_login_calls_the_existing_login(tmp_path):
    fctx, fakes = fix_ctx(tmp_path, steam_state=lambda: {"available": True, "steam": {"running": True, "signedIn": True}, "community": {"session": "signed_out"}, "farm": {}})
    status, body = run(health.run_fix("steam_login", fctx))
    assert status == 200 and fakes.calls == ["steam_login"] and {r["id"] for r in body["checks"]} == {"steam_module", "steam_client", "steam_session"}


def test_reinstall_starts_the_install_and_returns_at_once(tmp_path):
    async def readiness():
        return {"items": [item("engine", "todo")]}
    fctx, fakes = fix_ctx(tmp_path, giveaways_readiness=readiness, giveaways_marker=lambda: True)
    status, body = run(health.run_fix("giveaways_reinstall", fctx))
    assert status == 200 and fakes.calls == ["install_engine"]
    assert "запущ" in body["message"]


def test_autostart_repair_enables_it_for_this_copy_and_rechecks(tmp_path, monkeypatch):
    state = {"cmd": '"C:\\Elsewhere\\Old\\TwitchDropsSentinel.exe" --minimized'}
    monkeypatch.setattr(health, "read_autostart", lambda: (True, state["cmd"]))
    fctx, fakes = fix_ctx(tmp_path)

    def enable():
        fakes.calls.append("enable_autostart")
        state["cmd"] = f'"{tmp_path / "TwitchDropsSentinel.exe"}" --minimized'
        return True
    fctx.actions.enable_autostart = enable
    status, body = run(health.run_fix("autostart_repair", fctx))
    assert status == 200 and fakes.calls == ["enable_autostart"]
    assert one(body["checks"])["id"] == "system_autostart" and one(body["checks"])["status"] == "ok"


def test_autostart_repair_reports_a_failed_write(tmp_path, monkeypatch):
    monkeypatch.setattr(health, "read_autostart", lambda: (True, '"C:\\Elsewhere\\Old\\TwitchDropsSentinel.exe"'))
    fctx, fakes = fix_ctx(tmp_path)
    fctx.actions.enable_autostart = lambda: False
    status, body = run(health.run_fix("autostart_repair", fctx))
    assert status == 500 and body["ok"] is False and body["message"]




def test_settings_restore_saves_a_backup_first_then_stages_the_newest_good_copy(tmp_path):
    health.note_settings_error("JSONDecodeError: x")
    fakes = Fakes(tmp_path, backups=[Path("new_bad.zip"), Path("old_good.zip"), Path("older.zip")], bad={"new_bad.zip"})
    fctx, _ = fix_ctx(tmp_path, fakes)
    status, body = run(health.run_fix("settings_restore", fctx))
    assert status == 200 and body["ok"] and body["restart"] is True
    assert fakes.calls == ["list_backups", "save_profile_backup", ("stage_restore", "new_bad.zip"), ("stage_restore", "old_good.zip")]
    assert "reset_settings" not in fakes.calls


def test_settings_restore_without_any_backup_resets_to_defaults_after_the_backup(tmp_path):
    health.note_settings_error("JSONDecodeError: x")
    fctx, fakes = fix_ctx(tmp_path)
    status, body = run(health.run_fix("settings_restore", fctx))
    assert status == 200 and fakes.calls == ["list_backups", "save_profile_backup", "reset_settings"]
    assert health.settings_error() is None, "the file was rewritten: the fallback flag is cleared"
    assert body["restart"] is False


def test_settings_restore_with_only_unusable_backups_resets_to_defaults(tmp_path):
    health.note_settings_error("x")
    fakes = Fakes(tmp_path, backups=[Path("a.zip")], bad={"a.zip"})
    fctx, _ = fix_ctx(tmp_path, fakes)
    assert run(health.run_fix("settings_restore", fctx))[0] == 200
    assert fakes.calls[-1] == "reset_settings"


def test_settings_restore_stops_when_the_backup_cannot_be_saved(tmp_path):
    health.note_settings_error("x")
    fakes = Fakes(tmp_path, backups=[Path("a.zip")], fail="save_profile_backup")
    fctx, _ = fix_ctx(tmp_path, fakes)
    status, body = run(health.run_fix("settings_restore", fctx))
    assert status == 500 and body["ok"] is False
    assert not any(c == "reset_settings" or (isinstance(c, tuple) and c[0] == "stage_restore") for c in fakes.calls)


def test_a_failing_action_is_a_500_the_rows_are_still_returned_and_the_failure_is_logged(tmp_path, caplog):
    for code in ("A", "B", "C"):
        health.OAUTH_CODES.note(code)
    fakes = Fakes(tmp_path, fail="sign_out_twitch")
    fctx, _ = fix_ctx(tmp_path, fakes)
    with caplog.at_level("INFO", logger="sentinel.health"):
        status, body = run(health.run_fix("twitch_relogin", fctx))
    assert status == 500 and body["ok"] is False and "sign_out_twitch refused" in body["message"] and body["checks"]
    assert any(rec.getMessage().startswith("health fix twitch_relogin: failed") for rec in caplog.records)


def test_an_unexpected_crash_in_an_action_is_logged_with_a_traceback(tmp_path, caplog):
    for code in ("A", "B", "C"):
        health.OAUTH_CODES.note(code)
    fctx, _ = fix_ctx(tmp_path)

    async def boom():
        raise RuntimeError("kaput")
    fctx.actions.sign_out_twitch = boom
    with caplog.at_level("INFO", logger="sentinel.health"):
        status, body = run(health.run_fix("twitch_relogin", fctx))
    assert status == 500 and "kaput" in body["message"]
    assert any(rec.exc_info for rec in caplog.records if "health fix twitch_relogin" in rec.getMessage())


def test_the_refusal_and_the_unknown_id_are_logged_too(tmp_path, caplog):
    fctx, _ = fix_ctx(tmp_path, bridge=bridge(user_id="1", username="m"))
    with caplog.at_level("INFO", logger="sentinel.health"):
        run(health.run_fix("twitch_relogin", fctx))
        run(health.run_fix("nope\nforged line", fctx))
    messages = [rec.getMessage() for rec in caplog.records]
    assert any(m.startswith("health fix twitch_relogin: refused") for m in messages)
    assert any(m.startswith("health fix ") and "unknown" in m for m in messages)
    assert not any("\n" in m for m in messages), "an id from the page cannot forge a log line"




# ---- logs_trim ----

def _age(path, days):
    stamp = time.time() - days * 86400
    os.utime(path, (stamp, stamp))


def test_logs_trim_deletes_only_rotated_files_and_old_claim_logs_never_the_active_log(tmp_path):
    core = tmp_path / "core"
    core.mkdir()
    claim = tmp_path / "engine"
    claim.mkdir()
    active = core / "sentinel_service.log"
    active.write_bytes(b"live")
    rotated = [core / f"sentinel_service.log.{n}" for n in (1, 2, 5)]
    for f in rotated:
        f.write_bytes(b"old" * 100)
    keep = [active, core / "sentinel_service.log.bak", core / "sentinel_service.log.old.1", core / "other.log",
            tmp_path / "sentinel_stdout.log", tmp_path / "sentinel_stderr.log"]
    for f in keep[1:]:
        f.write_bytes(b"keep")
    (core / "sentinel_service.log.7").mkdir()  # a folder with a rotated-looking name
    old_claim = claim / "ClaimOutput_20250101-000000.log"
    old_claim.write_bytes(b"c" * 50)
    _age(old_claim, 8)
    fresh_claim = claim / "ClaimOutput_20261124-000000.log"
    fresh_claim.write_bytes(b"c")
    _age(fresh_claim, 1)
    not_claim = claim / "notes.log"
    not_claim.write_bytes(b"n")
    _age(not_claim, 30)

    with open(core / "sentinel_service.log.9", "wb") as f:
        f.truncate(201 * 1024 * 1024)
    fctx, _ = fix_ctx(tmp_path, claim_dirs=[claim])
    status, body = run(health.run_fix("logs_trim", fctx))
    assert status == 200 and body["ok"]
    for f in rotated + [old_claim, core / "sentinel_service.log.9"]:
        assert not f.exists(), f
    for f in keep + [fresh_claim, not_claim, core / "sentinel_service.log.7"]:
        assert f.exists(), f
    assert active.read_bytes() == b"live"
    assert one(body["checks"])["id"] == "system_logs" and one(body["checks"])["status"] == "ok"


def test_logs_trim_with_nothing_to_delete_is_a_409(tmp_path):
    fctx, _ = fix_ctx(tmp_path)
    (fctx.health.log_dir / "sentinel_service.log").write_bytes(b"live")
    status, body = run(health.run_fix("logs_trim", fctx))
    assert status == 409 and (fctx.health.log_dir / "sentinel_service.log").exists()


def test_logs_trim_keeps_going_when_one_file_cannot_be_deleted(tmp_path, monkeypatch, caplog):
    core = tmp_path / "core"
    core.mkdir()
    a, b = core / "sentinel_service.log.1", core / "sentinel_service.log.2"
    a.write_bytes(b"x")
    b.write_bytes(b"x")
    real_unlink = Path.unlink

    def flaky(self, *args, **kwargs):
        if self.name == "sentinel_service.log.1":
            raise PermissionError("locked")
        return real_unlink(self, *args, **kwargs)
    monkeypatch.setattr(Path, "unlink", flaky)
    fctx, _ = fix_ctx(tmp_path)
    with caplog.at_level("WARNING", logger="sentinel.health"):
        status, body = run(health.run_fix("logs_trim", fctx))
    assert status == 200 and a.exists() and not b.exists()
    assert any(rec.exc_info for rec in caplog.records)


# ---- the route ----

def _fix_app(fctx, secret="secret-token-123"):
    import types as _t
    from aiohttp import web
    import sentinel_service as s
    fake = _t.SimpleNamespace(api_token=secret)
    fake._fix_context = lambda lang, request: fctx
    app = web.Application(middlewares=[_t.MethodType(s.SentinelSupervisor.cors_middleware, fake)])
    app.router.add_post("/api/v1/health/fix", _t.MethodType(s.SentinelSupervisor.handle_post_health_fix, fake))
    return app


def _post(fctx, body, headers=None, query=""):
    from aiohttp.test_utils import TestClient, TestServer

    async def go():
        async with TestClient(TestServer(_fix_app(fctx))) as client:
            resp = await client.post("/api/v1/health/fix" + query, data=body, headers=headers or {})
            return resp.status, await resp.json()
    return run(go())


def test_the_fix_route_requires_the_token(tmp_path):
    fctx, fakes = fix_ctx(tmp_path, bridge=bridge())
    status, _ = _post(fctx, json.dumps({"id": "twitch_relogin"}))
    assert status == 401 and fakes.calls == []
    status, body = _post(fctx, json.dumps({"id": "twitch_relogin"}), {"X-Sentinel-Token": "secret-token-123", "Content-Type": "application/json"})
    assert status == 200 and body["ok"] is True and fakes.calls == ["sign_out_twitch"]


def test_the_fix_route_answers_400_for_an_unknown_id_a_bad_body_and_409_when_it_does_not_apply(tmp_path):
    fctx, fakes = fix_ctx(tmp_path, bridge=bridge(user_id="1", username="m"))
    headers = {"X-Sentinel-Token": "secret-token-123", "Content-Type": "application/json"}
    assert _post(fctx, json.dumps({"id": "format_c"}), headers)[0] == 400
    assert _post(fctx, "not json", headers)[0] == 400
    assert _post(fctx, json.dumps(["twitch_relogin"]), headers)[0] == 400
    assert _post(fctx, json.dumps({"id": ["twitch_relogin"]}), headers)[0] == 400
    assert _post(fctx, json.dumps({"id": "twitch_relogin"}), headers)[0] == 409
    assert fakes.calls == []


def test_the_fix_route_is_registered_and_post_only():
    text = (Path(__file__).parent / "sentinel_service.py").read_text(encoding="utf-8")
    assert 'add_post("/api/v1/health/fix", self.handle_post_health_fix)' in text


def test_the_service_hands_each_fix_the_existing_function(tmp_path, monkeypatch):
    import types as _t
    from aiohttp import web
    import sentinel_service as s
    calls = []

    async def ok_response(request):
        calls.append(("handler", request))
        return web.json_response({"status": "ok", "success": True})

    async def install():
        calls.append("install_engine")
        return {"status": "started"}

    fake = _t.SimpleNamespace(
        _health_context=lambda lang: None, handle_logout=ok_response, handle_reset_settings=ok_response,
        steam_idle=_t.SimpleNamespace(login=lambda: calls.append("steam_login")), giveaways=_t.SimpleNamespace(install_engine=install))
    monkeypatch.setattr(s, "set_autostart_status", lambda enabled: calls.append(("autostart", enabled)) or True)
    monkeypatch.setattr(s, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(s, "write_backup", lambda path, entries: calls.append(("write_backup", path.parent.name, path.name.startswith("sentinel_profile_before_health_fix_"))) or [])
    monkeypatch.setattr(s, "stage_restore", lambda zip_path, entries, pending: calls.append(("stage", zip_path.name, pending.name)) or ["config.json"])
    request = object()
    actions = s.SentinelSupervisor._fix_context(fake, "ru", request).actions

    async def go():
        await actions.sign_out_twitch()
        await actions.steam_login()
        assert await actions.install_engine() == "started"
        assert actions.enable_autostart() is True
        await actions.reset_settings()
    run(go())
    actions.save_profile_backup()
    (tmp_path / "backups").mkdir(exist_ok=True)
    (tmp_path / "backups" / "a.zip").write_bytes(b"1")
    assert [p.name for p in actions.list_backups()] == ["a.zip"]
    actions.stage_restore(tmp_path / "backups" / "a.zip")
    handler_calls = [c for c in calls if isinstance(c, tuple) and c[0] == "handler"]
    assert len(handler_calls) == 2 and all(c[1] is request for c in handler_calls)
    assert "steam_login" in calls and "install_engine" in calls and ("autostart", True) in calls
    assert ("write_backup", "backups", True) in calls and ("stage", "a.zip", "restore_pending") in calls


def test_the_service_turns_a_refused_existing_function_into_a_failed_fix():
    import types as _t
    from aiohttp import web
    import sentinel_service as s

    async def refuse(request):
        return web.json_response({"success": False, "error": "locked cookies"}, status=500)

    fake = _t.SimpleNamespace(_health_context=lambda lang: None, handle_logout=refuse, steam_idle=_t.SimpleNamespace(login=lambda: "engine_missing"), giveaways=None)
    actions = s.SentinelSupervisor._fix_context(fake, "ru", object()).actions

    async def go():
        with pytest.raises(health.FixFailed, match="locked cookies"):
            await actions.sign_out_twitch()
        with pytest.raises(health.FixFailed, match="engine_missing"):
            await actions.steam_login()
    run(go())


def test_the_disk_row_offers_no_fix_because_nothing_here_frees_space(tmp_path, monkeypatch):
    ctx = make_ctx(tmp_path)
    for free in (0.5 * 1024 ** 3, 3 * 1024 ** 3):
        monkeypatch.setattr(health, "disk_free_bytes", lambda p, f=free: int(f))
        assert "fix" not in one(run(health.check_disk(ctx)))
    assert "cache_clear" not in health.FIXES


def test_the_recheck_ignores_the_reuse_cache_and_drops_it(tmp_path):
    fctx, fakes = fix_ctx(tmp_path)
    (fctx.health.log_dir / "sentinel_service.log.1").write_bytes(b"x")
    key = (fctx.health.lang, tuple(e.id for e in health.CATALOG))
    health._last = (key, time.monotonic(), {"checks": [{"id": "stale"}], "version": "x", "generatedAt": ""})
    status, body = run(health.run_fix("logs_trim", fctx))
    assert status == 200 and one(body["checks"])["id"] == "system_logs"
    assert health._last is None, "the next GET must not hand out the result from before the fix"


def test_two_fixes_do_not_run_at_the_same_time(tmp_path):
    fctx, fakes = fix_ctx(tmp_path, steam_state=lambda: {"available": True, "steam": {}, "community": {"session": "signed_out"}, "farm": {}})

    async def slow():
        await asyncio.sleep(0.2)
        fakes.calls.append("steam_login")
    fctx.actions.steam_login = slow

    async def both():
        return await asyncio.gather(health.run_fix("steam_login", fctx), health.run_fix("steam_login", fctx))
    (a, _), (b, _) = run(both())
    assert sorted([a, b]) == [200, 409] and fakes.calls == ["steam_login"]
    assert health._fix_running is False


# ---- review round: logs ----

def _sparse(path, mb):
    with open(path, "wb") as f:
        f.truncate(mb * 1024 * 1024)


def test_logs_row_offers_the_trim_only_when_it_would_bring_the_total_under_the_limit(tmp_path):
    ctx = make_ctx(tmp_path)
    _sparse(ctx.project_dir / "sentinel_stdout.log", 250)
    _sparse(ctx.log_dir / "sentinel_service.log.1", 100)
    row = one(run(health.check_logs_size(ctx)))
    assert row["status"] == "warn" and "fix" not in row, "trimming the rotated file leaves 250 MB: the warning would stay"
    assert "sentinel_stdout.log" in row["detail"] or "sentinel_stdout.log" in row["advice"], "the row says why the big files are not trimmed"
    (ctx.project_dir / "sentinel_stdout.log").unlink()
    _sparse(ctx.project_dir / "sentinel_stdout.log", 50)
    row = one(run(health.check_logs_size(ctx)))
    assert row["status"] == "ok" or row["fix"]["id"] == "logs_trim"


def test_logs_row_with_a_big_stdout_log_and_a_big_rotated_one_offers_the_trim_when_that_is_enough(tmp_path):
    ctx = make_ctx(tmp_path)
    _sparse(ctx.project_dir / "sentinel_stdout.log", 50)
    _sparse(ctx.log_dir / "sentinel_service.log.1", 160)
    row = one(run(health.check_logs_size(ctx)))
    assert row["status"] == "warn" and row["fix"]["id"] == "logs_trim"


def test_logs_trim_never_touches_the_stdout_and_stderr_logs(tmp_path):
    fctx, _ = fix_ctx(tmp_path)
    out, err = tmp_path / "sentinel_stdout.log", tmp_path / "sentinel_stderr.log"
    _sparse(out, 60)
    _sparse(err, 60)
    (fctx.health.log_dir / "sentinel_service.log.1").write_bytes(b"x")
    assert run(health.run_fix("logs_trim", fctx))[0] == 200
    assert out.stat().st_size == 60 * 1024 * 1024 and err.stat().st_size == 60 * 1024 * 1024


def test_a_missing_log_folder_or_a_vanishing_file_is_skipped_not_a_crash(tmp_path, monkeypatch, caplog):
    now = datetime.now()
    assert health._trim_candidates(tmp_path / "nope", [tmp_path / "also_nope"], now) == []
    core = tmp_path / "core"
    core.mkdir()
    claim = tmp_path / "engine"
    claim.mkdir()
    old = claim / "ClaimOutput_1.log"
    old.write_bytes(b"x")
    _age(old, 9)
    real_stat = Path.stat

    def vanishing(self, *args, **kwargs):
        if self.name == "ClaimOutput_1.log":
            raise FileNotFoundError(self.name)
        return real_stat(self, *args, **kwargs)
    monkeypatch.setattr(Path, "stat", vanishing)
    with caplog.at_level("DEBUG", logger="sentinel.health"):
        assert health._trim_candidates(core, [claim], now) == []
    assert any("ClaimOutput_1.log" in rec.getMessage() for rec in caplog.records)


def test_the_applicability_test_survives_a_missing_log_folder(tmp_path):
    fctx, _ = fix_ctx(tmp_path)
    fctx.health.log_dir = tmp_path / "gone"
    status, body = run(health.run_fix("logs_trim", fctx))
    assert status == 409 and body["message"]


def test_the_same_folder_listed_twice_is_trimmed_once(tmp_path):
    claim = tmp_path / "engine"
    claim.mkdir()
    old = claim / "ClaimOutput_1.log"
    old.write_bytes(b"x" * 10)
    _age(old, 9)
    fctx, _ = fix_ctx(tmp_path, claim_dirs=[claim, claim, claim / "." , tmp_path / "engine" / ".." / "engine"])
    found = health._trim_candidates(fctx.health.log_dir, fctx.claim_log_dirs(), datetime.now())
    assert found == [old]
    status, body = run(health.run_fix("logs_trim", fctx))
    assert status == 200 and "1" in body["message"] and "Не удалось" not in body["message"]


# ---- review round: a read that began before a fix must not outlive it ----

def test_a_get_in_flight_during_a_fix_does_not_store_its_pre_fix_result(tmp_path):
    fctx, fakes = fix_ctx(tmp_path)
    (fctx.health.log_dir / "sentinel_service.log.1").write_bytes(b"x")
    started = []

    async def slow(ctx):
        started.append(1)
        await asyncio.sleep(0.3)
        return [health.row("c", "system", "ok", "C")]
    checks = [health.Check("c", "system", ("С", "C"), slow, 2.0)]

    async def go():
        reader = asyncio.ensure_future(health.run_health(fctx.health, checks))
        await asyncio.sleep(0.05)
        status, _ = await health.run_fix("logs_trim", fctx)
        await reader
        return status
    assert run(go()) == 200 and started
    assert health._last is None, "the read that began before the fix finished after it: its result is from before the fix"


def test_a_get_that_starts_after_the_fix_is_stored_as_usual(tmp_path):
    fctx, _ = fix_ctx(tmp_path)
    (fctx.health.log_dir / "sentinel_service.log.1").write_bytes(b"x")

    async def quick(ctx):
        return [health.row("c", "system", "ok", "C")]
    checks = [health.Check("c", "system", ("С", "C"), quick, 2.0)]

    async def go():
        await health.run_fix("logs_trim", fctx)
        await health.run_health(fctx.health, checks)
    run(go())
    assert health._last is not None


def test_a_get_after_the_fix_does_not_join_a_run_that_began_before_it(tmp_path):
    fctx, _ = fix_ctx(tmp_path)
    (fctx.health.log_dir / "sentinel_service.log.1").write_bytes(b"x")
    calls = []

    async def counting(ctx):
        calls.append(1)
        await asyncio.sleep(0.2)
        return [health.row("c", "system", "ok", "C")]
    checks = [health.Check("c", "system", ("С", "C"), counting, 2.0)]

    async def go():
        first = asyncio.ensure_future(health.run_health(fctx.health, checks))
        await asyncio.sleep(0.03)
        await health.run_fix("logs_trim", fctx)
        await health.run_health(fctx.health, checks)
        await first
    run(go())
    assert len(calls) == 2


# ---- review round: backups ----

def test_the_service_does_not_offer_its_own_safety_zips_as_a_backup_to_restore(tmp_path, monkeypatch):
    import types as _t
    import sentinel_service as s
    folder = tmp_path / "backups"
    folder.mkdir()
    for name in ("sentinel_profile_backup_1.zip", "sentinel_profile_before_restore_1.zip", "sentinel_profile_before_health_fix_20261125_100000.zip"):
        (folder / name).write_bytes(b"z")
    monkeypatch.setattr(s, "BACKUP_DIR", folder)
    fake = _t.SimpleNamespace(_health_context=lambda lang: None)
    names = {p.name for p in s.SentinelSupervisor._fix_context(fake, "ru", object()).actions.list_backups()}
    assert names == {"sentinel_profile_backup_1.zip", "sentinel_profile_before_restore_1.zip"}
