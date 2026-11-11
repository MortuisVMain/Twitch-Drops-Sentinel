"""Offline fixtures for filename-only candidate discovery and isolated probing."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core.steam_idle.inventory import InventoryError, InventoryStore
from core.steam_idle.local_inventory import SOURCE, observe

STEAM_ID = str(0x0110000100000000 + 42)


class LocalInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = self.root / 'userdata' / '42' / 'config' / 'librarycache'

    def response(self, **changes):
        value = {'protocolVersion': 1, 'clientConnection': 'connected',
                     'identity': 'expected_account_confirmed', 'steamOperations': 'unsupported',
                     'error': None, 'appId': 10, 'subscribed': True, 'installed': False}
        value.update(changes)
        return subprocess.CompletedProcess([], 0, json.dumps(value), '')

    def test_missing_unknown_empty_partial(self):
        self.assertEqual(observe(self.root, STEAM_ID, 'epoch', Path('probe.exe')).status, 'unknown')
        self.cache.mkdir(parents=True)
        self.assertEqual(observe(self.root, STEAM_ID, 'epoch', Path('probe.exe')).status, 'partial')

    def test_candidates_are_filenames_only_and_store_compatible(self):
        self.cache.mkdir(parents=True)
        for name in ['10.json', 'bad.json', '0.json', '01.json', '10_other.json', '4294967296.json']:
            (self.cache / name).write_text('contents must not be parsed', encoding='utf-8')
        with patch('core.steam_idle.local_inventory.subprocess.run', return_value=self.response()) as run:
            snapshot = observe(self.root, STEAM_ID, 'epoch', Path('probe.exe'))
        self.assertEqual(len(snapshot.items), 1)
        self.assertEqual(snapshot.items[0].ownership, 'subscribed')
        self.assertEqual(snapshot.items[0].name, 'App 10')
        self.assertFalse(run.call_args.kwargs['shell'])
        store = InventoryStore(SOURCE, 'epoch')
        self.assertEqual(store.refresh('epoch', [{'items': [vars(snapshot.items[0])], 'cursor': None,
                         'next_cursor': None, 'complete': False}]).status, 'partial')

    def test_failure_never_returns_empty_success(self):
        self.cache.mkdir(parents=True)
        (self.cache / '10.json').touch()
        outcomes = [subprocess.CompletedProcess([], 4, '{}', ''), self.response(appId=11),
                    self.response(identity='unverified'), self.response(subscribed=1),
                    subprocess.CompletedProcess([], 0, 'noise{}', ''),
                    subprocess.TimeoutExpired('probe', 1), OSError('fixture')]
        for outcome in outcomes:
            with self.subTest(outcome=type(outcome).__name__):
                options = {'side_effect': outcome} if isinstance(outcome, Exception) else {'return_value': outcome}
                with patch('core.steam_idle.local_inventory.subprocess.run', **options), self.assertRaises(InventoryError):
                    observe(self.root, STEAM_ID, 'epoch', Path('probe.exe'))

    def test_unknown_subscription_and_budgets(self):
        self.cache.mkdir(parents=True)
        (self.cache / '10.json').touch()
        with patch('core.steam_idle.local_inventory.subprocess.run', return_value=self.response(subscribed=False)):
            self.assertEqual(observe(self.root, STEAM_ID, 'epoch', Path('probe.exe')).items[0].ownership, 'unknown')
        with patch('core.steam_idle.local_inventory.time.monotonic', side_effect=[0, 31]), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, 'epoch', Path('probe.exe'))
        for invalid in ['42', ' ' + STEAM_ID, str(0x0110000100000000), STEAM_ID + '0']:
            with self.assertRaises(InventoryError):
                observe(self.root, invalid, 'epoch', Path('probe.exe'))

    def test_entry_limit_and_linked_paths_rejected(self):
        self.cache.mkdir(parents=True)
        (self.cache / '10.json').touch()
        with patch('core.steam_idle.local_inventory.MAX_ITEMS', 0), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, 'epoch', Path('probe.exe'))
        metadata = self.cache.lstat()
        real_lstat = Path.lstat
        def linked(path):
            if path == self.cache:
                from types import SimpleNamespace
                return SimpleNamespace(st_mode=metadata.st_mode, st_file_attributes=0x400)
            return real_lstat(path)
        with patch.object(Path, 'lstat', linked), self.assertRaises(InventoryError):
            observe(self.root, STEAM_ID, 'epoch', Path('probe.exe'))

    def test_reserves_worker_cleanup_budget_before_spawn(self):
        self.cache.mkdir(parents=True)
        (self.cache / '10.json').touch()
        with (patch('core.steam_idle.local_inventory.time.monotonic', side_effect=[0, 21, 21]),
              patch('core.steam_idle.local_inventory.subprocess.run') as run,
              self.assertRaises(InventoryError)):
            observe(self.root, STEAM_ID, 'epoch', Path('probe.exe'))
        run.assert_not_called()
