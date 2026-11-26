"""Twitch sign-in code: the browser activation tab opens at most once per 10 minutes, the toast and the state still update every time."""
import asyncio
import types

import pytest

import gui_headless
from gui_headless import HeadlessLoginForm


class Clock:
    def __init__(self, now=5000.0):
        self.now = now

    def __call__(self):
        return self.now


@pytest.fixture
def rig(monkeypatch):
    monkeypatch.delenv("SENTINEL_NO_BROWSER", raising=False)
    opened = []
    clock = Clock()
    monkeypatch.setattr("webbrowser.open", lambda url, *a, **k: opened.append(url) or True)
    monkeypatch.setattr(gui_headless, "_monotonic", clock)
    monkeypatch.setattr(gui_headless, "_last_activation_tab_at", None)
    sent = []
    fake_notifier = types.SimpleNamespace(NOTIFIER=types.SimpleNamespace(notify=lambda *a, **k: sent.append(a)))
    monkeypatch.setitem(__import__("sys").modules, "notifications", fake_notifier)
    for name in ("oauth_code", "oauth_uri"):
        monkeypatch.setattr(gui_headless.STATE_BRIDGE, name, None, raising=False)
    return types.SimpleNamespace(opened=opened, clock=clock, sent=sent)


def ask(code, uri="https://www.twitch.tv/activate"):
    asyncio.run(HeadlessLoginForm().ask_enter_code(uri, code))


def test_the_first_code_opens_the_activation_tab(rig):
    ask("AAAA1111")
    assert rig.opened == ["https://www.twitch.tv/activate"]


def test_a_burst_of_codes_opens_one_tab_but_updates_state_and_toast_each_time(rig):
    for i, code in enumerate(("C1", "C2", "C3", "C4")):
        rig.clock.now += 2
        ask(code)
        assert gui_headless.STATE_BRIDGE.oauth_code == code
    assert len(rig.opened) == 1
    assert len(rig.sent) == 4


def test_the_tab_opens_again_after_ten_minutes(rig):
    ask("C1")
    rig.clock.now += 599
    ask("C2")
    assert len(rig.opened) == 1
    rig.clock.now += 2
    ask("C3")
    assert len(rig.opened) == 2


def test_no_browser_switch_still_opens_nothing_and_does_not_use_up_the_interval(rig, monkeypatch):
    monkeypatch.setenv("SENTINEL_NO_BROWSER", "1")
    ask("C1")
    assert rig.opened == []
    monkeypatch.delenv("SENTINEL_NO_BROWSER")
    ask("C2")
    assert len(rig.opened) == 1  # the skipped call did not use up the 10 minutes
