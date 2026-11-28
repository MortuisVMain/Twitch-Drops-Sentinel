"""Import of the data of an old copy: validation, the staged marker, the start-time apply with its backup."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import copy_import as ci


def write(path: Path, text: str = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def make_dir_link(link: Path, target: Path) -> None:
    """A directory symlink, or a junction on Windows without the symlink privilege; skips the test when neither can be made."""
    try:
        os.symlink(target, link, target_is_directory=True)
        return
    except (OSError, NotImplementedError):
        pass
    if sys.platform == "win32":
        done = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], capture_output=True)
        if done.returncode == 0:
            return
    raise unittest.SkipTest("cannot create a link or junction here")


def nothing_runs():
    return []


class Base(unittest.TestCase):
    def setUp(self):
        # resolved: stage_import stores the resolved path, and TEMP may be an 8.3 short path (CI: RUNNER~1)
        self.root = Path(tempfile.mkdtemp(prefix="copy_import_")).resolve()
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.project = self.root / "New"
        self.source = self.root / "Old"
        write(self.source / "core" / "version.py", '__version__ = "3.7.0"\n')
        write(self.project / "core" / "version.py", '__version__ = "3.10.0"\n')
        (self.project / "data").mkdir()

    def apply(self, now="t", **kwargs):
        kwargs.setdefault("running_exes", nothing_runs)
        return ci.apply_pending_import(self.project, now=lambda: now, **kwargs)

    def marker_path(self):
        return self.project / "data" / ci.MARKER_NAME

    def failed_path(self):
        return self.project / "data" / (ci.MARKER_NAME + ".failed")


class Validation(Base):
    def test_a_copy_has_the_version_file_or_the_exe(self):
        self.assertTrue(ci.is_sentinel_copy(self.source))
        exe_only = self.root / "ExeOnly"
        write(exe_only / "TwitchDropsSentinel.exe", "MZ")
        self.assertTrue(ci.is_sentinel_copy(exe_only))
        self.assertFalse(ci.is_sentinel_copy(self.root / "Random"))
        self.assertFalse(ci.is_sentinel_copy(self.root))

    def test_staging_refuses_this_folder_and_non_copies(self):
        with self.assertRaises(ci.ImportRefused):
            ci.stage_import(self.project, self.project)
        with self.assertRaises(ci.ImportRefused):
            ci.stage_import(self.project, self.root / "Random")
        self.assertFalse((self.project / "data" / ci.MARKER_NAME).exists())

    def test_own_data_state_tells_defaults_from_the_users_choices(self):
        defaults = {"pause_on_gaming": True, "priority_games": ["Rust"]}
        write(self.project / "config.json", json.dumps({"pause_on_gaming": True, "priority_games": ["Rust"], "unknown_key": 5}))
        self.assertEqual(ci.own_data_state(self.project, defaults), {"nonDefaultConfig": False, "signedIn": False})
        write(self.project / "config.json", json.dumps({"pause_on_gaming": False}))
        write(self.project / "core" / "cookies.jar", "jar")
        self.assertEqual(ci.own_data_state(self.project, defaults), {"nonDefaultConfig": True, "signedIn": True})

    def test_a_broken_config_counts_as_nothing_to_lose_only_when_absent(self):
        write(self.project / "config.json", "{ not json")
        self.assertTrue(ci.own_data_state(self.project, {"a": 1})["nonDefaultConfig"], "an unreadable config is kept safe, not treated as default")


class Apply(Base):
    def populate_source(self):
        write(self.source / "config.json", '{"priority_games": ["Old"]}')
        write(self.source / "core" / "cookies.jar", "old-jar")
        write(self.source / "data" / "webhooks.json", "old-hooks")
        write(self.source / "data" / "app.log", "log")
        write(self.source / "data" / "backups" / "b.zip", "zip")
        write(self.source / "data" / "import_backup_1" / "x.json", "nested backup")
        write(self.source / "data" / ci.MARKER_NAME, "marker of the other copy")
        write(self.source / "data" / "startup_cleanup_backup.json", "[]")
        write(self.source / "giveaways_engine" / "data" / "sessions.json", '{"epic": {"account": "me"}}')
        write(self.source / "giveaways_engine" / "data" / "browser" / "Profile" / "Cookies", "browser cache")
        write(self.source / "giveaways_engine" / "data" / "screenshots" / "s.png", "png")

    def test_staging_writes_only_the_marker(self):
        self.populate_source()
        ci.stage_import(self.project, self.source)
        marker = json.loads(self.marker_path().read_text(encoding="utf-8"))
        self.assertEqual(Path(marker["source"]), self.source)
        self.assertFalse((self.project / "config.json").exists(), "nothing is copied while the app runs")

    def test_apply_backs_up_then_copies_and_drops_the_marker(self):
        self.populate_source()
        write(self.project / "config.json", '{"priority_games": ["Mine"]}')
        write(self.project / "data" / "webhooks.json", "my-hooks")
        write(self.project / "data" / "only_here.json", "kept")
        ci.stage_import(self.project, self.source)
        copied = self.apply("20261122_101500")
        self.assertIn("config.json", copied)
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), '{"priority_games": ["Old"]}')
        self.assertEqual((self.project / "core" / "cookies.jar").read_text(encoding="utf-8"), "old-jar")
        self.assertEqual((self.project / "data" / "webhooks.json").read_text(encoding="utf-8"), "old-hooks")
        self.assertEqual((self.project / "data" / "only_here.json").read_text(encoding="utf-8"), "kept", "a file only this copy has stays")
        self.assertTrue((self.project / "giveaways_engine" / "data" / "sessions.json").is_file())
        backup = self.project / "data" / "import_backup_20261122_101500"
        self.assertEqual((backup / "config.json").read_text(encoding="utf-8"), '{"priority_games": ["Mine"]}')
        self.assertEqual((backup / "data" / "webhooks.json").read_text(encoding="utf-8"), "my-hooks")
        self.assertFalse(self.marker_path().exists())

    def test_runtime_and_other_copy_state_is_not_copied(self):
        self.populate_source()
        ci.stage_import(self.project, self.source)
        self.apply()
        gone = [Path("data") / "app.log", Path("data") / "backups" / "b.zip", Path("data") / "import_backup_1" / "x.json",
                Path("data") / "startup_cleanup_backup.json", Path("giveaways_engine") / "data" / "browser" / "Profile" / "Cookies",
                Path("giveaways_engine") / "data" / "screenshots" / "s.png"]
        for rel in gone:
            self.assertFalse((self.project / rel).exists(), f"{rel} must not be copied")

    def test_every_browser_profile_folder_is_skipped(self):
        # live 2026-11-27: browser-steam-idle (the Steam community sign-in) was replaced by the old copy's stale profile
        write(self.source / "giveaways_engine" / "data" / "browser-steam-idle" / "Default" / "Cookies", "old cookies")
        ci.stage_import(self.project, self.source)
        self.apply()
        self.assertFalse((self.project / "giveaways_engine" / "data" / "browser-steam-idle").exists())

    def test_the_trophy_journal_is_merged_not_replaced(self):
        # live 2026-11-27: the old copy's journal replaced the newer one and five days of rows were gone
        header = "| Date | Game | Drop | Campaign | Status |\n|---|---|---|---|---|\n"
        shared, mine, theirs = "| 1 | **A** | x | c | ok |\n", "| 3 | **B** | y | c | ok |\n", "| 2 | **C** | z | c | ok |\n"
        write(self.project / "Trophies.md", header + shared + mine)
        write(self.source / "Trophies.md", header + shared + theirs)
        ci.stage_import(self.project, self.source)
        self.apply()
        merged = (self.project / "Trophies.md").read_text(encoding="utf-8")
        self.assertTrue(merged.startswith(header + shared + mine), merged)
        self.assertEqual(merged.count(shared), 1)
        self.assertIn(theirs, merged)

    def test_the_claimed_drops_list_is_merged_not_replaced(self):
        write(self.project / "data" / "claimed_drops.json", '["mine", "both"]')
        write(self.source / "data" / "claimed_drops.json", '["both", "theirs"]')
        ci.stage_import(self.project, self.source)
        self.apply()
        merged = json.loads((self.project / "data" / "claimed_drops.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted(merged), ["both", "mine", "theirs"])

    def test_the_source_is_never_modified(self):
        self.populate_source()
        before = sorted((p.relative_to(self.source).as_posix(), p.read_bytes()) for p in self.source.rglob("*") if p.is_file())
        ci.stage_import(self.project, self.source)
        self.apply()
        after = sorted((p.relative_to(self.source).as_posix(), p.read_bytes()) for p in self.source.rglob("*") if p.is_file())
        self.assertEqual(before, after)

    def test_nothing_staged_means_nothing_applied(self):
        self.assertIsNone(self.apply())

    def test_a_source_that_vanished_drops_the_marker_and_changes_nothing(self):
        self.populate_source()
        write(self.project / "config.json", "mine")
        ci.stage_import(self.project, self.source)
        shutil.rmtree(self.source)
        self.assertIsNone(self.apply())
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "mine")
        self.assertFalse(self.marker_path().exists())


class Safety(Base):
    def test_the_marker_holds_the_resolved_absolute_source(self):
        write(self.source / "config.json", "{}")
        ci.stage_import(self.project, self.source)
        recorded = Path(json.loads(self.marker_path().read_text(encoding="utf-8"))["source"])
        self.assertTrue(recorded.is_absolute())
        self.assertEqual(recorded, self.source.resolve())

    def test_a_marker_older_than_a_day_is_discarded(self):
        write(self.source / "config.json", '{"a": 1}')
        write(self.project / "config.json", "mine")
        ci.stage_import(self.project, self.source)
        later = datetime.now() + timedelta(hours=25)
        with self.assertLogs("SentinelService", level="WARNING"):
            self.assertIsNone(self.apply(clock=lambda: later))
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "mine")
        self.assertFalse(self.marker_path().exists())

    def test_a_fresh_marker_is_applied(self):
        write(self.source / "config.json", '{"a": 1}')
        ci.stage_import(self.project, self.source)
        soon = datetime.now() + timedelta(hours=23)
        self.assertEqual(self.apply(clock=lambda: soon), ["config.json"])

    def test_the_source_is_checked_again_at_apply(self):
        write(self.source / "config.json", "theirs")
        write(self.project / "config.json", "mine")
        now = datetime.now().isoformat(timespec="seconds")
        cases = {
            "relative": {"source": "Old", "time": now},
            "this copy": {"source": str(self.project.resolve()), "time": now},
            "no time": {"source": str(self.source.resolve())},
            "bad time": {"source": str(self.source.resolve()), "time": "yesterday"},
        }
        for name, marker in cases.items():
            with self.subTest(case=name):
                self.marker_path().write_text(json.dumps(marker), encoding="utf-8")
                with self.assertLogs("SentinelService", level="ERROR"):
                    self.assertIsNone(self.apply())
                self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "mine")
                self.assertFalse(self.marker_path().exists())

    def test_a_source_that_is_running_is_not_imported(self):
        write(self.source / "config.json", "theirs")
        write(self.project / "config.json", "mine")
        ci.stage_import(self.project, self.source)
        running = lambda: [str(self.root / "elsewhere" / "TwitchDropsSentinel.exe"), str(self.source / "TwitchDropsSentinel.exe")]
        with self.assertLogs("SentinelService", level="ERROR"):
            self.assertIsNone(self.apply(running_exes=running))
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "mine")
        self.assertFalse(self.marker_path().exists())

    def test_a_folder_with_a_similar_name_is_not_the_running_source(self):
        write(self.source / "config.json", "theirs")
        ci.stage_import(self.project, self.source)
        sibling = str(self.root / "Old2" / "TwitchDropsSentinel.exe")
        self.assertEqual(self.apply(running_exes=lambda: [sibling]), ["config.json"])

    def populate(self):
        write(self.source / "config.json", '{"priority_games": ["Old"]}')
        write(self.source / "core" / "cookies.jar", "old-jar")
        write(self.source / "data" / "webhooks.json", "old-hooks")
        write(self.source / "giveaways_engine" / "data" / "sessions.json", "{}")

    @staticmethod
    def failing_copy(name):
        def copy(src, dst, *args, **kwargs):
            if Path(src).name == name:
                raise OSError("disk full")
            return shutil.copy2(src, dst, *args, **kwargs)
        return copy

    def test_a_failure_in_the_middle_rolls_everything_back_and_parks_the_marker(self):
        self.populate()
        write(self.project / "config.json", "mine-config")
        write(self.project / "data" / "webhooks.json", "my-hooks")
        ci.stage_import(self.project, self.source)
        with self.assertLogs("SentinelService", level="ERROR"):
            self.assertIsNone(self.apply(copy_file=self.failing_copy("sessions.json")))
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "mine-config")
        self.assertEqual((self.project / "data" / "webhooks.json").read_text(encoding="utf-8"), "my-hooks")
        self.assertFalse((self.project / "core" / "cookies.jar").exists(), "a file that did not exist before is removed again")
        self.assertFalse((self.project / "giveaways_engine" / "data" / "sessions.json").exists())
        self.assertFalse(self.marker_path().exists(), "no retry loop at the next start")
        self.assertTrue(self.failed_path().is_file())
        self.assertEqual([p for p in self.project.rglob("*") if ".importtmp" in p.name], [])

    def test_a_file_is_never_half_written(self):
        write(self.source / "config.json", "theirs-complete")
        write(self.project / "config.json", "mine")
        ci.stage_import(self.project, self.source)
        seen = []

        def copy(src, dst, *args, **kwargs):
            seen.append(Path(dst).name)
            return shutil.copy2(src, dst, *args, **kwargs)

        self.apply(copy_file=copy)
        self.assertEqual(seen, ["config.json.importtmp"], "the copy goes to a temporary file that replaces the target in one step")
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "theirs-complete")

    def test_the_backup_is_made_once_and_never_overwritten(self):
        write(self.source / "config.json", "theirs")
        write(self.project / "config.json", "original-mine")
        ci.stage_import(self.project, self.source)
        self.apply("same")
        ci.stage_import(self.project, self.source)
        self.apply("same")
        backup = self.project / "data" / "import_backup_same" / "config.json"
        self.assertEqual(backup.read_text(encoding="utf-8"), "original-mine")

    def test_links_and_junctions_in_the_source_are_not_followed(self):
        outside = self.root / "Outside"
        write(outside / "secret.json", "secret")
        write(self.source / "data" / "real.json", "real")
        make_dir_link(self.source / "data" / "linked", outside)
        self.assertEqual(ci._files(self.source), ["data/real.json"])

    def test_a_link_in_the_destination_cannot_send_a_file_outside_this_copy(self):
        outside = self.root / "Outside"
        outside.mkdir()
        write(self.source / "data" / "out" / "x.json", "theirs")
        write(self.source / "config.json", "theirs-config")
        write(self.project / "config.json", "mine")
        make_dir_link(self.project / "data" / "out", outside)
        ci.stage_import(self.project, self.source)
        with self.assertLogs("SentinelService", level="ERROR"):
            self.assertIsNone(self.apply())
        self.assertEqual(list(outside.iterdir()), [], "nothing was written outside this copy")
        self.assertEqual((self.project / "config.json").read_text(encoding="utf-8"), "mine")
        self.assertTrue(self.failed_path().is_file())


if __name__ == "__main__":
    unittest.main()
