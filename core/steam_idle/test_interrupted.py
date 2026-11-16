"""Offline checks for the interrupted-run record store: real files in a temporary directory, nothing else."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from steam_idle.interrupted import RECORD_FILE_NAME, InterruptedStore, account_hash


def record(**over):
    base = {"version": 1, "kind": "library", "startedAt": 1700000000.0, "appId": None, "name": None, "names": None,
            "exclude": [9], "finished": [1, 2], "gamesDone": 2, "gamesTotal": 5, "unlocked": 7, "accountHash": "ab" * 32}
    base.update(over)
    return base


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.store = InterruptedStore(self.dir / RECORD_FILE_NAME)

    def test_account_hash_is_the_sha256_of_the_id_and_hides_it(self):
        digest = account_hash("76561198000000001")
        self.assertEqual(digest, hashlib.sha256(b"76561198000000001").hexdigest())
        self.assertNotIn("76561198000000001", digest)

    def test_save_load_delete_roundtrip(self):
        self.assertIsNone(self.store.load())
        self.store.save(record())
        self.assertEqual(InterruptedStore(self.dir / RECORD_FILE_NAME).load(), record())
        self.store.delete()
        self.assertFalse((self.dir / RECORD_FILE_NAME).exists())
        self.store.delete()  # deleting nothing is fine

    def test_unreadable_or_malformed_records_are_logged_and_renamed_aside(self):
        bad = ["{broken", "[]", json.dumps(record(kind="other")), json.dumps(record(finished="x")),
               json.dumps(record(gamesDone=-1)), json.dumps(record(accountHash=5)),
               json.dumps({k: v for k, v in record().items() if k != "unlocked"}), json.dumps(record(version=2))]
        for text in bad:
            with self.subTest(text=text[:40]):
                path = self.dir / RECORD_FILE_NAME
                path.write_text(text, encoding="utf-8")
                with self.assertLogs("steam_idle.interrupted", level="ERROR"):
                    self.assertIsNone(self.store.load())
                self.assertFalse(path.exists())
                aside = self.dir / (RECORD_FILE_NAME + ".corrupt")
                self.assertEqual(aside.read_text(encoding="utf-8"), text)
                aside.unlink()

    def test_per_kind_shapes_are_accepted(self):
        for rec in (record(kind="game", appId=7, name="g", names=None, exclude=None),
                    record(kind="selected", appId=7, name="g", names=["A", "B"], exclude=None)):
            self.store.save(rec)
            self.assertEqual(self.store.load(), rec)

    def test_a_store_without_a_path_keeps_and_writes_nothing(self):
        store = InterruptedStore(None)
        store.save(record())
        self.assertIsNone(store.load())
        store.delete()

    def test_a_failed_write_is_logged_not_raised(self):
        store = InterruptedStore(self.dir / "missing" / RECORD_FILE_NAME)
        with self.assertLogs("steam_idle.interrupted", level="ERROR"):
            store.save(record())


if __name__ == "__main__":
    unittest.main()
