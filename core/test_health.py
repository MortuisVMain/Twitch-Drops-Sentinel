"""Read-only health checks behind GET /api/v1/health: every check ok/warn/fail with fakes, the time budget, the crash path, the route."""
import asyncio
import json
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
