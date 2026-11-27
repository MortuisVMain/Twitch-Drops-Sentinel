"""/api/ping is the cheap liveness answer for the host watchdog; the WS handler survives a client that broadcast already dropped."""
import asyncio
import builtins
import inspect
import json
from types import SimpleNamespace

import sentinel_service as s
from local_access import TOKEN_HEADER, token_allowed


def make_self(paused=False):
    async def forbidden():
        raise AssertionError("ping must not build the full state")

    return SimpleNamespace(
        hardware_state={"is_paused": paused, "cpu_percent": 12},
        get_full_state=forbidden,
        load_trophies=lambda: (_ for _ in ()).throw(AssertionError("ping must not read Trophies")),
        get_app_version=lambda: (_ for _ in ()).throw(AssertionError("ping must not read version.py")),
    )


def ping(monkeypatch, drop, paused=False):
    monkeypatch.setattr(s.STATE_BRIDGE, "active_drop", drop)

    def no_open(*args, **kwargs):
        raise AssertionError("ping must not open files")

    monkeypatch.setattr(builtins, "open", no_open)
    response = asyncio.run(s.SentinelSupervisor.handle_ping(make_self(paused), None))
    monkeypatch.undo()
    return json.loads(response.body)


def test_ping_reports_what_the_tooltip_needs_without_heavy_work(monkeypatch):
    body = ping(monkeypatch, {"game": "Rust", "progress_percent": 42.7, "remaining_seconds": 99})
    assert body["ok"] is True and body["version"] == s.APP_VERSION
    assert body["hardware"] == {"is_paused": False}
    assert body["active_drop"] == {"game": "Rust", "progress_percent": 42}


def test_ping_without_a_drop_or_when_paused(monkeypatch):
    body = ping(monkeypatch, None, paused=True)
    assert body["active_drop"] is None and body["hardware"] == {"is_paused": True}


def test_ping_is_registered_and_behind_the_token():
    assert 'add_get("/api/ping", self.handle_ping)' in inspect.getsource(s.SentinelSupervisor._setup_routes)
    assert not token_allowed("secret", "/api/ping", {}, {})
    assert not token_allowed("secret", "/api/ping", {}, {"token": "secret"})
    assert token_allowed("secret", "/api/ping", {TOKEN_HEADER: "secret"}, {})


def test_ws_handler_survives_a_client_broadcast_already_dropped(monkeypatch):
    clients = set()

    class FakeWs:
        async def prepare(self, request):
            return self

        def __aiter__(self):
            clients.discard(self)  # broadcast_ws dropped it after a failed send
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    monkeypatch.setattr(s.web, "WebSocketResponse", FakeWs)
    owner = SimpleNamespace(ws_clients=clients)
    asyncio.run(s.SentinelSupervisor.handle_ws(owner, None))
    assert clients == set()
