"""atomic_write_json must put the bytes on disk before the rename makes them the live file."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import atomic_json


class AtomicJsonTests(unittest.TestCase):
    def test_fsync_runs_before_replace(self):
        path = Path(tempfile.mkdtemp(prefix="atomic_json_")) / "data.json"
        order = []
        real_fsync, real_replace = os.fsync, os.replace
        with mock.patch.object(atomic_json.os, "fsync", side_effect=lambda fd: (order.append("fsync"), real_fsync(fd))[1]), \
                mock.patch.object(atomic_json.os, "replace", side_effect=lambda a, b: (order.append("replace"), real_replace(a, b))[1]):
            atomic_json.atomic_write_json(path, {"a": 1})
        self.assertEqual(order, ["fsync", "replace"])
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"a": 1})

    def test_failed_fsync_keeps_old_file_and_cleans_temp(self):
        path = Path(tempfile.mkdtemp(prefix="atomic_json_")) / "data.json"
        path.write_text('{"old": true}', encoding="utf-8")
        with mock.patch.object(atomic_json.os, "fsync", side_effect=OSError("disk gone")):
            with self.assertRaises(OSError):
                atomic_json.atomic_write_json(path, {"new": True})
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"old": True})
        self.assertEqual([p.name for p in path.parent.iterdir()], ["data.json"])


if __name__ == "__main__":
    unittest.main()
