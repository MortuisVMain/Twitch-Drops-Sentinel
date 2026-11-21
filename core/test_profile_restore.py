"""Profile restore: an archive is checked, staged while the app runs and applied at the next start."""
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

from profile_backup import BackupError, apply_pending_restore, profile_entries, read_backup, stage_restore, write_backup


class ProfileRestore(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="restore_"))
        self.project = self.root / "app"
        (self.project / "data").mkdir(parents=True)
        (self.project / "core").mkdir()
        self.entries = profile_entries(self.project, self.project / "core" / "settings.json", self.project / "core" / "cookies.jar")
        self.pending = self.project / "data" / "restore_pending"

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def _backup(self, config=None, trophies="old trophies"):
        (self.project / "config.json").write_text(json.dumps(config or {"priority_games": ["Rust"]}), encoding="utf-8")
        (self.project / "Trophies.md").write_text(trophies, encoding="utf-8")
        (self.project / "core" / "cookies.jar").write_bytes(b"jar")
        zip_path = self.root / "backup.zip"
        self.assertEqual(write_backup(zip_path, self.entries), [])
        return zip_path

    def test_round_trip_restores_the_backed_up_files_at_the_next_start(self):
        zip_path = self._backup()
        (self.project / "config.json").write_text('{"priority_games": []}', encoding="utf-8")
        (self.project / "Trophies.md").write_text("new", encoding="utf-8")
        staged = stage_restore(zip_path, self.entries, self.pending)
        self.assertIn("config.json", staged)
        self.assertIn("core/cookies.jar", staged)
        # staging changes nothing in place: the running app may still save over the live files
        self.assertEqual((self.project / "Trophies.md").read_text(encoding="utf-8"), "new")
        restored = apply_pending_restore(self.project, self.entries, self.pending)
        self.assertEqual(sorted(restored), staged)
        self.assertEqual(json.loads((self.project / "config.json").read_text(encoding="utf-8")), {"priority_games": ["Rust"]})
        self.assertEqual((self.project / "Trophies.md").read_text(encoding="utf-8"), "old trophies")
        self.assertFalse(self.pending.exists(), "the stage is removed once applied")
        self.assertEqual(apply_pending_restore(self.project, self.entries, self.pending), [], "applied only once")

    def test_unknown_members_are_never_written(self):
        zip_path = self._backup()
        with zipfile.ZipFile(zip_path, "a") as zf:
            zf.writestr("../evil.txt", "x")
            zf.writestr("core/twitch.py", "x")
        files = read_backup(zip_path, self.entries)
        self.assertNotIn("../evil.txt", files)
        self.assertNotIn("core/twitch.py", files)
        stage_restore(zip_path, self.entries, self.pending)
        apply_pending_restore(self.project, self.entries, self.pending)
        self.assertFalse((self.root / "evil.txt").exists())
        self.assertFalse((self.project / "core" / "twitch.py").exists())

    def test_a_stage_without_its_marker_is_dropped(self):
        zip_path = self._backup()
        stage_restore(zip_path, self.entries, self.pending)
        (self.pending / "restore.json").unlink()
        (self.project / "Trophies.md").write_text("current", encoding="utf-8")
        self.assertEqual(apply_pending_restore(self.project, self.entries, self.pending), [])
        self.assertEqual((self.project / "Trophies.md").read_text(encoding="utf-8"), "current")
        self.assertFalse(self.pending.exists())

    def test_bad_archives_are_refused_with_a_reason(self):
        not_zip = self.root / "x.zip"
        not_zip.write_text("hello", encoding="utf-8")
        with self.assertRaisesRegex(BackupError, "ZIP"):
            read_backup(not_zip, self.entries)
        no_manifest = self.root / "m.zip"
        with zipfile.ZipFile(no_manifest, "w") as zf:
            zf.writestr("config.json", "{}")
        with self.assertRaisesRegex(BackupError, "manifest"):
            read_backup(no_manifest, self.entries)
        no_config = self.root / "c.zip"
        with zipfile.ZipFile(no_config, "w") as zf:
            zf.writestr("manifest.json", json.dumps({"format": 1, "files": []}))
        with self.assertRaisesRegex(BackupError, "config.json"):
            read_backup(no_config, self.entries)
        broken_config = self.root / "b.zip"
        with zipfile.ZipFile(broken_config, "w") as zf:
            zf.writestr("manifest.json", json.dumps({"format": 1, "files": []}))
            zf.writestr("config.json", "[1, 2]")
        with self.assertRaisesRegex(BackupError, "config.json"):
            read_backup(broken_config, self.entries)
        self.assertFalse(self.pending.exists(), "a refused archive stages nothing")


if __name__ == "__main__":
    unittest.main()
