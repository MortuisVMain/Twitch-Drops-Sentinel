"""Offline fixtures for filename-only candidate discovery and the batch helper (fake helper process)."""
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from steam_idle.helper_support import fake_command, force_kill, read_pids, wait_gone
from steam_idle.inventory import InventoryError, InventoryStore
from steam_idle.local_inventory import SOURCE, observe

STEAM_ID = str(0x0110000100000000 + 42)
PROBE = Path("probe.exe")  # never started: tests that reach the helper use the fake


class LocalInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = self.root / "userdata" / "42" / "config" / "librarycache"
        self.pidfile = self.root / "pids.txt"
        self.addCleanup(force_kill, self.pidfile)

    def fake(self, mode):
        return fake_command(mode, self.pidfile)

    def cache_with(self, *names):
        self.cache.mkdir(parents=True)
        for name in names:
            (self.cache / name).write_text("contents must not be parsed", encoding="utf-8")

    def test_missing_unknown_empty_partial(self):
        self.assertEqual(observe(self.root, STEAM_ID, "epoch", PROBE).status, "unknown")
        self.cache.mkdir(parents=True)
        self.assertEqual(observe(self.root, STEAM_ID, "epoch", PROBE).status, "partial")

    def test_batch_uses_one_helper_and_store_compatible(self):
        self.cache_with("10.json", "11.json", "bad.json", "0.json", "01.json", "10_other.json", "4294967296.json")
        real_popen = subprocess.Popen
        calls = []

        def spy(*args, **kwargs):
            calls.append((args, kwargs))
            return real_popen(*args, **kwargs)

        with patch("steam_idle._helper.subprocess.Popen", side_effect=spy):
            snapshot = observe(self.root, STEAM_ID, "epoch", self.fake("ok"))
        self.assertEqual(len(calls), 1)
        command, kwargs = calls[0][0][0], calls[0][1]
        self.assertEqual(command[-2:], ["apps", STEAM_ID])
        self.assertFalse(kwargs.get("shell", False))
        self.assertEqual(kwargs["creationflags"], 0x08000000)
        self.assertEqual([row.app_id for row in snapshot.items], [10, 11])
        self.assertEqual([row.ownership for row in snapshot.items], ["subscribed", "unknown"])
        self.assertEqual(snapshot.items[0].name, "App 10")
        store = InventoryStore(SOURCE, "epoch")
        self.assertEqual(store.refresh("epoch", [{"items": [vars(row) for row in snapshot.items], "cursor": None,
                         "next_cursor": None, "complete": False}]).status, "partial")

    def test_protocol_violations_never_return_success(self):
        self.cache_with("10.json", "11.json")
        for mode in ("garbage", "failed", "badorder", "missingkey", "truncated", "badcount", "badexit"):
            with self.subTest(mode=mode), self.assertRaises(InventoryError) as caught:
                observe(self.root, STEAM_ID, "epoch", self.fake(mode))
            self.assertIn("rc=", str(caught.exception))
        with self.assertRaises(InventoryError) as caught:
            observe(self.root, STEAM_ID, "epoch", self.fake("failed"))
        self.assertIn("identity_mismatch", str(caught.exception))

    def test_failures_are_logged_with_the_module_logger(self):
        self.cache_with("10.json")
        with self.assertLogs("steam_idle.local_inventory", level="ERROR"), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, "epoch", self.fake("garbage"))

    def test_missing_helper_executable_is_an_inventory_error(self):
        self.cache_with("10.json")
        with self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, "epoch", self.root / "nope.exe")

    def test_timeout_kills_the_whole_process_tree(self):
        self.cache_with("10.json")
        with patch("steam_idle.local_inventory.HELPER_TIMEOUT", 3.0), self.assertRaises(InventoryError) as caught:
            observe(self.root, STEAM_ID, "epoch", self.fake("hang"))
        self.assertIn("timeout", str(caught.exception))
        self.assertIn("rc=", str(caught.exception))
        self.assertTrue(self.pidfile.exists(), "the fake helper never reached its sleep")
        self.assertEqual(wait_gone(read_pids(self.pidfile)), [])

    def test_unknown_subscription_and_budgets(self):
        self.cache_with("11.json")
        self.assertEqual(observe(self.root, STEAM_ID, "epoch", self.fake("ok")).items[0].ownership, "unknown")
        with patch("steam_idle.local_inventory.time.monotonic", side_effect=[0, 31]), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, "epoch", PROBE)
        for invalid in ["42", " " + STEAM_ID, str(0x0110000100000000), STEAM_ID + "0"]:
            with self.assertRaises(InventoryError):
                observe(self.root, invalid, "epoch", PROBE)

    def test_entry_cap_counts_only_matching_entries(self):
        self.cache_with("10.json", *[f"junk{index}.txt" for index in range(5)])
        with patch("steam_idle.local_inventory.MAX_ITEMS", 1):
            self.assertEqual(len(observe(self.root, STEAM_ID, "epoch", self.fake("ok")).items), 1)
        (self.cache / "11.json").touch()
        with patch("steam_idle.local_inventory.MAX_ITEMS", 1), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, "epoch", self.fake("ok"))
        with patch("steam_idle.local_inventory.MAX_ITEMS", 0), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, "epoch", self.fake("ok"))

    def linked(self, target):
        real_lstat = Path.lstat

        def lstat(path):
            metadata = real_lstat(path)
            if path == target:
                return SimpleNamespace(st_mode=metadata.st_mode, st_file_attributes=0x400)
            return metadata
        return patch.object(Path, "lstat", lstat)

    def test_links_at_or_below_userdata_are_rejected_but_not_the_steam_root(self):
        self.cache_with("11.json")
        for target in (self.cache, self.cache.parent, self.root / "userdata"):
            with self.subTest(target=target.name), self.linked(target), self.assertRaises(InventoryError):
                observe(self.root, STEAM_ID, "epoch", self.fake("ok"))
        with self.linked(self.root):
            self.assertEqual(len(observe(self.root, STEAM_ID, "epoch", self.fake("ok")).items), 1)
