"""Update rollback: the files an update replaced are kept and can be put back; the version rolled back from is skipped."""
import io
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

import updater
from updater import RollbackRecorder, apply_rollback, rollback_info, skipped_version


class Rollback(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="rollback_"))
        (self.root / "core").mkdir()
        (self.root / "core" / "version.py").write_text('__version__ = "3.8.0"\n', encoding="utf-8")
        (self.root / "core" / "twitch.py").write_text("old engine", encoding="utf-8")
        (self.root / "TwitchDropsSentinel.exe").write_bytes(b"old exe")
        self.rb = self.root / "data" / "rollback"
        self.skip = self.root / "data" / "update_skip.json"

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def _update(self):
        rec = RollbackRecorder(self.root, self.rb)
        for rel, data in (("core/version.py", '__version__ = "3.9.0"\n'), ("core/twitch.py", "new engine"),
                          ("core/new_module.py", "added"), ("core/twitch.py", "written twice")):
            target = self.root / rel
            rec.before_write(target)
            target.write_text(data, encoding="utf-8")
        rec.finish("3.8.0", "3.9.0")
        return rec

    def test_round_trip_puts_the_old_version_back_and_skips_the_new_one(self):
        rec = self._update()
        self.assertEqual(rec.saved, ["core/version.py", "core/twitch.py"], "a file written twice is saved once, before the first write")
        self.assertEqual(rec.added, ["core/new_module.py"])
        info = rollback_info(self.rb / "manifest.json")
        self.assertEqual((info["from_version"], info["to_version"]), ("3.8.0", "3.9.0"))
        ok, message = apply_rollback(self.root, self.rb, self.skip)
        self.assertTrue(ok, message)
        self.assertEqual((self.root / "core" / "twitch.py").read_text(encoding="utf-8"), "old engine")
        self.assertIn('"3.8.0"', (self.root / "core" / "version.py").read_text(encoding="utf-8"))
        self.assertFalse((self.root / "core" / "new_module.py").exists())
        self.assertFalse(self.rb.exists(), "a rollback is used once")
        self.assertEqual(skipped_version(self.skip), "3.9.0")
        self.assertFalse(apply_rollback(self.root, self.rb, self.skip)[0], "nothing left to roll back")

    def test_the_running_exe_is_renamed_not_overwritten(self):
        rec = RollbackRecorder(self.root, self.rb)
        update_file = self.root / "TwitchDropsSentinel.update"
        rec.before_write(update_file)  # the new exe arrives as .update and is swapped in
        update_file.write_bytes(b"new exe")
        (self.root / "TwitchDropsSentinel.exe").write_bytes(b"new exe")
        rec.finish("3.8.0", "3.9.0")
        self.assertIn("TwitchDropsSentinel.exe", rec.saved)
        ok, _ = apply_rollback(self.root, self.rb, self.skip)
        self.assertTrue(ok)
        self.assertEqual((self.root / "TwitchDropsSentinel.exe").read_bytes(), b"old exe")
        self.assertEqual((self.root / "TwitchDropsSentinel.exe.old").read_bytes(), b"new exe")

    def test_an_unfinished_update_offers_no_rollback(self):
        rec = RollbackRecorder(self.root, self.rb)
        rec.before_write(self.root / "core" / "twitch.py")
        self.assertIsNone(rollback_info(self.rb / "manifest.json"))
        self.assertFalse(apply_rollback(self.root, self.rb, self.skip)[0])

    def test_a_skipped_version_is_not_offered_but_a_newer_one_is(self):
        self.skip.parent.mkdir(parents=True, exist_ok=True)
        self.skip.write_text(json.dumps({"skip": "3.9.0"}), encoding="utf-8")
        payloads = {updater.REPO_API_URL: {"tag_name": "v3.9.0", "assets": []}}

        class Opener:
            def open(self, req, timeout=None):
                return io.BytesIO(json.dumps(payloads[req.full_url]).encode("utf-8"))

        with mock.patch.object(updater, "SKIP_FILE", self.skip), \
             mock.patch.object(updater, "CACHE_FILE", self.root / "cache.json"), \
             mock.patch.object(updater, "get_optional_github_token", lambda: ""), \
             mock.patch.object(updater, "get_live_local_version", lambda: "3.8.0"), \
             mock.patch.object(updater.urllib.request, "build_opener", lambda *a: Opener()):
            up = updater.GitHubUpdater()
            self.assertFalse(up.check_for_updates(force=True)["update_available"])
            payloads[updater.REPO_API_URL] = {"tag_name": "v3.9.1", "assets": []}
            self.assertTrue(up.check_for_updates(force=True)["update_available"])


if __name__ == "__main__":
    unittest.main()
