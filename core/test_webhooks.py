"""Telegram/Discord copies of notifications: settings checks, sealed secrets, delivery and the gate's listeners."""
import io
import json
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import webhooks
from dpapi import DpapiError
from notifications import ToastGate
from webhooks import WebhookError, Webhooks

TOKEN = "123456789:" + "A" * 35
DISCORD = "https://discord.com/api/webhooks/1/abc"


class FakeOpener:
    def __init__(self):
        self.sent = []

    def __call__(self, req, timeout=None):
        self.sent.append((req.full_url, json.loads(req.data.decode("utf-8"))))
        return io.BytesIO(b"{}")


class WebhookSettings(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="webhooks_"))
        self.store = self.dir / "webhooks.json"
        self.opener = FakeOpener()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def make(self):
        return Webhooks(self.store, opener=self.opener)

    def test_bad_values_are_refused_with_a_reason(self):
        hooks = self.make()
        with self.assertRaisesRegex(WebhookError, "токен"):
            hooks.update({"telegram": {"token": "nope"}})
        with self.assertRaisesRegex(WebhookError, "chat_id"):
            hooks.update({"telegram": {"chat_id": "hello world"}})
        with self.assertRaisesRegex(WebhookError, "discord.com"):
            hooks.update({"discord": {"url": "https://evil.example/api/webhooks/1"}})
        with self.assertRaisesRegex(WebhookError, "нужны"):
            hooks.update({"telegram": {"enabled": True}})
        self.assertFalse(self.store.exists(), "a refused change saves nothing")

    def test_a_save_that_cannot_encrypt_leaves_the_old_settings_in_use(self):
        hooks = self.make()
        before = hooks.public()
        with mock.patch.object(webhooks, "protect_bytes", side_effect=DpapiError("DPAPI failed")):
            with self.assertRaises(DpapiError):
                hooks.update({"telegram": {"token": TOKEN, "chat_id": "-1001", "enabled": True}})
        self.assertEqual(hooks.public(), before, "the unsaved token must not be used until restart")
        self.assertFalse(self.store.exists())

    def test_secrets_never_reach_the_ui_and_survive_a_restart(self):
        public = self.make().update({"telegram": {"token": TOKEN, "chat_id": "-1001", "enabled": True},
                                     "discord": {"url": DISCORD, "enabled": True}})
        self.assertEqual(public, {"telegram": {"enabled": True, "chat_id": "-1001", "token_set": True},
                                  "discord": {"enabled": True, "url_set": True}})
        self.assertNotIn(TOKEN, json.dumps(public))
        again = self.make()
        self.assertEqual(again.public(), public)
        # an empty token keeps the saved one; clear removes it
        again.update({"telegram": {"token": "", "chat_id": "@my_channel"}})
        self.assertTrue(again.public()["telegram"]["token_set"])
        again.update({"discord": {"clear": True}})
        self.assertEqual(again.public()["discord"], {"enabled": False, "url_set": False})

    def test_test_message_goes_to_the_named_channel_only(self):
        hooks = self.make()
        hooks.update({"telegram": {"token": TOKEN, "chat_id": "42"}, "discord": {"url": DISCORD}})
        hooks.send_test("telegram")
        self.assertEqual(len(self.opener.sent), 1)
        url, body = self.opener.sent[0]
        self.assertEqual(url, f"https://api.telegram.org/bot{TOKEN}/sendMessage")
        self.assertEqual(body["chat_id"], "42")
        with self.assertRaisesRegex(WebhookError, "не настроен"):
            Webhooks(None, opener=self.opener).send_test("discord")

    def test_delivery_runs_in_the_background_to_enabled_channels(self):
        hooks = self.make()
        hooks.update({"telegram": {"token": TOKEN, "chat_id": "42", "enabled": False}, "discord": {"url": DISCORD, "enabled": True}})
        with mock.patch("constants.TEST_MODE", False):
            hooks.deliver("Hell Harvest", "Получен дроп: Skin (Rust)")
            deadline = time.time() + 5
            while not self.opener.sent and time.time() < deadline:
                time.sleep(0.02)
        self.assertEqual(len(self.opener.sent), 1, "only Discord is on")
        url, body = self.opener.sent[0]
        self.assertEqual(url, DISCORD)
        self.assertIn("Skin (Rust)", body["content"])
        self.assertEqual(body["allowed_mentions"], {"parse": []}, "a game name can never ping anyone")

    def test_test_mode_never_posts(self):
        hooks = self.make()
        hooks.update({"discord": {"url": DISCORD, "enabled": True}})
        with mock.patch("constants.TEST_MODE", True):
            hooks.deliver("t", "m")
        time.sleep(0.1)
        self.assertEqual(self.opener.sent, [])


class GateListeners(unittest.TestCase):
    def test_listeners_hear_each_event_once_even_with_toasts_off(self):
        toasts, heard = [], []
        gate = ToastGate(lambda t, m: toasts.append(m), lambda: False, None)
        gate.add_listener(lambda t, m: heard.append(m))
        gate.notify("drop", "1", "T", "first")
        gate.notify("drop", "1", "T", "first again")
        self.assertEqual(heard, ["first"])
        self.assertEqual(toasts, [], "toasts are off")

    def test_state_events_prime_silently_then_reach_listeners(self):
        heard = []
        gate = ToastGate(lambda t, m: None, lambda: True, None)
        gate.add_listener(lambda t, m: heard.append(m))
        one = lambda g: f"started {g}"
        many = lambda gs: f"started {len(gs)}"
        gate.notify_new("k", [("a", "A")], "T", one, many)
        self.assertEqual(heard, [], "the first call only remembers")
        gate.notify_new("k", [("a", "A"), ("b", "B")], "T", one, many)
        self.assertEqual(heard, ["started B"])

    def test_a_failing_listener_does_not_stop_the_toast(self):
        toasts = []
        gate = ToastGate(lambda t, m: toasts.append(m), lambda: True, None)
        gate.add_listener(lambda t, m: 1 / 0)
        with self.assertLogs("TwitchDrops", level="WARNING"):
            self.assertTrue(gate.notify("x", "1", "T", "hello"))
        self.assertEqual(toasts, ["hello"])


if __name__ == "__main__":
    unittest.main()
