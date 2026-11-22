"""Other copies of the app in the autostart places: the read-only finder (S1) and the cleanup actions (S2).
Every system reader is a fake: nothing here touches the real registry, Startup folder, scheduled tasks or processes."""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

import startup_copies as sc

THIS_TASK = "FreeGamesClaimerStudio-aaaa1111"
LNK_BYTES = b"\x4c\x00\x00\x00lnk-bytes"


class FakeBackend(sc.Backend):
    def __init__(self, project, runs=(), links=(), tasks=(), procs=(), startup_dir=None):
        self.project = project
        self.runs = list(runs)  # (hive, subkey, name, data)
        self.links = list(links)  # (path, target command)
        self.tasks = {t["name"]: dict(t) for t in tasks}
        self.xml = None  # what export_task returns; None means a well-formed task document
        self.procs = [(p[0], p[1], p[2] if len(p) > 2 else 100.0) for p in procs]  # (pid, exe[, create_time])
        self.calls = []
        self.alive = {p[0] for p in self.procs}
        self.close_ignored = False
        self.startup_dir = startup_dir
        self.failing_deletes = set()

    def startup_folder(self):
        return self.startup_dir

    def run_entries(self):
        return list(self.runs)

    def delete_run_value(self, hive, subkey, name):
        self.calls.append(("delete_run", hive, subkey, name))
        if name in self.failing_deletes:
            raise OSError("registry is busy")
        self.runs = [r for r in self.runs if r[:3] != (hive, subkey, name)]

    def set_run_value(self, hive, subkey, name, data):
        self.calls.append(("set_run", hive, subkey, name, data))
        self.runs = [r for r in self.runs if r[:3] != (hive, subkey, name)] + [(hive, subkey, name, data)]

    def startup_links(self):
        return list(self.links)

    def scheduled_tasks(self):
        return [dict(t) for t in self.tasks.values()]

    def export_task(self, name, path):
        self.calls.append(("export_task", name, path))
        return f"<Task>{name}</Task>" if self.xml is None else self.xml

    def unregister_task(self, name, path):
        self.calls.append(("unregister_task", name, path))
        self.tasks.pop(name, None)

    def register_task(self, name, path, xml):
        self.calls.append(("register_task", name, path, xml))
        self.tasks[name] = {"name": name, "path": path, "execute": "conhost.exe", "arguments": ""}

    def processes(self):
        return [p for p in self.procs if p[0] in self.alive]

    def request_close(self, pid, created):
        self.calls.append(("request_close", pid))
        if not self.close_ignored:
            self.alive.discard(pid)

    def kill_tree(self, pid, copy_dir, created):
        self.calls.append(("kill_tree", pid, copy_dir, created))
        self.alive.discard(pid)


class Base(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="startup_copies_"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.project = self.root / "Current Copy"
        self.project.mkdir()
        (self.project / "data").mkdir()
        self.old = self.root / "Old Copy"
        (self.old / "core").mkdir(parents=True)
        (self.old / "core" / "version.py").write_text('__version__ = "3.7.0"\n', encoding="utf-8")
        (self.old / "TwitchDropsSentinel.exe").write_bytes(b"MZ")
        self.old_exe = str(self.old / "TwitchDropsSentinel.exe")
        self.gone = self.root / "Gone Copy"  # never created: its folder was deleted
        self.run_key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        self.backup_path = self.project / "data" / "startup_cleanup_backup.json"

    def backend(self, **kwargs):
        return FakeBackend(self.project, **kwargs)

    def scan(self, backend, own_pid=1):
        return sc.scan(backend, self.project, THIS_TASK, own_pid=own_pid)

    def cmd(self, exe):
        return f'"{exe}" --minimized'

    def manager(self, backend, **kwargs):
        self.autostart_calls = []
        kwargs.setdefault("set_autostart", lambda enabled: self.autostart_calls.append(enabled) or True)
        return sc.StartupCopies(backend, self.project, THIS_TASK, backup_path=self.backup_path, own_pid=1, **kwargs)

    def backups(self):
        return json.loads(self.backup_path.read_text(encoding="utf-8")) if self.backup_path.exists() else []


class ExtractTarget(unittest.TestCase):
    def test_only_the_executable_of_the_command_counts_not_its_arguments(self):
        ours = r"C:\Old\TwitchDropsSentinel.exe"
        cases = {
            f'"C:\\Windows\\notepad.exe" "{ours}"': None,
            f"notepad.exe {ours}": None,
            f'"C:\\Tools\\launcher.exe" --open "C:\\Old\\start_sentinel_silent.bat"': None,
            r'"C:\x\Other.exe" --minimized': None,
            r"C:\Old\TwitchDropsSentinel.exe.bak --x": None,
            r'"C:\Old\start_sentinel_silent.bat"': r"C:\Old\start_sentinel_silent.bat",
            f'"{ours}" --minimized': ours,
            f"{ours} --minimized": ours,
            f'cmd /c "C:\\Old\\start_sentinel_silent.bat"': r"C:\Old\start_sentinel_silent.bat",
            f'C:\\Windows\\System32\\cmd.exe /c ""C:\\Old\\start_sentinel_silent.bat" --x"': r"C:\Old\start_sentinel_silent.bat",
            "": None,
        }
        for command, expected in cases.items():
            with self.subTest(command=command):
                self.assertEqual(sc.extract_target(command), expected)

    def test_path_is_inside_a_folder_by_components_not_by_characters(self):
        self.assertTrue(sc.is_within(r"C:\a\b\x.exe", r"C:\a\b"))
        self.assertTrue(sc.is_within(r"C:\A\B", r"c:\a\b"))
        self.assertFalse(sc.is_within(r"C:\a\bc\x.exe", r"C:\a\b"))
        self.assertFalse(sc.is_within(r"C:\a", r"C:\a\b"))


class RunValues(Base):
    def test_autostart_value_of_another_copy_is_found_with_its_version(self):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))])
        found = self.scan(b)["findings"]
        self.assertEqual(len(found), 1)
        f = found[0]
        self.assertEqual((f["kind"], f["name"], f["version"], f["dirExists"], f["removable"]), ("run_value", "TwitchDropsSentinel", "3.7.0", True, True))
        self.assertEqual(sc.norm(f["copyDir"]), sc.norm(self.old))
        self.assertTrue(f["ownsAutostart"])
        self.assertEqual(self.scan(b)["autostartOwner"]["id"], f["id"])

    def test_this_copy_is_never_reported_whatever_the_spelling(self):
        mine = str(self.project / "TwitchDropsSentinel.exe")
        spellings = [self.cmd(mine), self.cmd(mine.upper()), self.cmd(mine.replace("\\", "/")), mine + " --minimized"]
        b = self.backend(runs=[("HKCU", self.run_key, f"v{i}", s) for i, s in enumerate(spellings)])
        result = self.scan(b)
        self.assertEqual(result["findings"], [])
        self.assertIsNone(result["autostartOwner"])

    def test_only_our_exe_and_bat_count_under_any_value_name(self):
        bat = self.root / "v2" / "start_sentinel_silent.bat"
        runs = [("HKCU", self.run_key, "Discord", r'"C:\Users\x\Discord\Update.exe" --processStart Discord.exe'),
                ("HKCU", self.run_key, "Whatever", self.cmd(self.old_exe)),
                ("HKCU", self.run_key, "Old v2", f'cmd /c "{bat}"'),
                ("HKCU", self.run_key, "Launcher", f'"C:\\Tools\\launcher.exe" --open "{self.old_exe}"')]
        found = self.scan(self.backend(runs=runs))["findings"]
        self.assertEqual({f["name"] for f in found}, {"Whatever", "Old v2"})
        self.assertFalse(any(f["ownsAutostart"] for f in found), "only the TwitchDropsSentinel value owns the autostart")

    def test_runonce_is_included_and_hklm_is_read_only(self):
        runs = [("HKCU", self.run_key.replace("Run", "RunOnce"), "Once", self.cmd(self.old_exe)),
                ("HKLM", self.run_key, "Machine", self.cmd(self.old_exe))]
        found = {f["name"]: f for f in self.scan(self.backend(runs=runs))["findings"]}
        self.assertEqual(found["Once"]["kind"], "run_value")
        self.assertEqual((found["Machine"]["kind"], found["Machine"]["removable"]), ("hklm_run", False))

    def test_missing_folder_and_unreadable_version_are_reported_honestly(self):
        exe = str(self.gone / "TwitchDropsSentinel.exe")
        f = self.scan(self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(exe))]))["findings"][0]
        self.assertEqual((f["dirExists"], f["version"]), (False, None))

    def test_ids_are_stable_between_scans(self):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))])
        self.assertEqual(self.scan(b)["findings"][0]["id"], self.scan(b)["findings"][0]["id"])

    def test_other_platforms_find_nothing(self):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))])
        self.assertEqual(sc.scan(b, self.project, THIS_TASK, own_pid=1, platform_name="linux")["findings"], [])

    def test_an_exe_in_desktop_publish_belongs_to_the_copy_root(self):
        publish = self.old / "desktop" / "publish"
        publish.mkdir(parents=True)
        exe = str(publish / "TwitchDropsSentinel.exe")
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(exe))], procs=[(10, exe)])
        found = self.scan(b)["findings"]
        self.assertEqual(len(found), 2)
        for f in found:
            self.assertEqual((sc.norm(f["copyDir"]), f["version"]), (sc.norm(self.old), "3.7.0"), f["kind"])


class LinksTasksProcesses(Base):
    def test_startup_shortcut_to_our_bat_is_found(self):
        lnk = self.root / "Startup" / "TwitchDropsSentinel.lnk"
        bat = self.old / "start_sentinel_silent.bat"
        b = self.backend(links=[(str(lnk), str(bat)), (str(self.root / "Startup" / "Other.lnk"), r"C:\Windows\notepad.exe")])
        found = self.scan(b)["findings"]
        self.assertEqual([(f["kind"], f["name"], f["removable"]) for f in found], [("startup_link", "TwitchDropsSentinel.lnk", True)])
        self.assertEqual(found[0]["target"], str(bat))

    def test_scheduler_tasks_of_other_copies_are_found_but_not_ours_or_foreign(self):
        arg = f'/c ""C:\\Program Files\\nodejs\\node.exe" "{self.old}\\giveaways_engine\\runner.js""'
        mine = f'/c ""node.exe" "{self.project}\\giveaways_engine\\runner.js""'
        tasks = [{"name": "FreeGamesClaimerStudio-bbbb2222", "execute": "conhost.exe", "arguments": arg},
                 {"name": THIS_TASK, "execute": "conhost.exe", "arguments": mine},
                 {"name": "FreeGamesClaimerStudio", "execute": "conhost.exe", "arguments": mine},
                 {"name": "FreeGamesClaimerStudio-cccc3333", "execute": "mytool.exe", "arguments": ""},
                 {"name": "OneDrive Update", "execute": "x.exe", "arguments": ""}]
        found = {f["name"]: f for f in self.scan(self.backend(tasks=tasks))["findings"]}
        self.assertEqual(set(found), {"FreeGamesClaimerStudio-bbbb2222", "FreeGamesClaimerStudio-cccc3333"})
        known = found["FreeGamesClaimerStudio-bbbb2222"]
        self.assertEqual((known["kind"], known["version"], known["removable"]), ("scheduler_task", "3.7.0", True))
        self.assertEqual(sc.norm(known["copyDir"]), sc.norm(self.old))
        unknown = found["FreeGamesClaimerStudio-cccc3333"]
        self.assertEqual((unknown["copyDir"], unknown["removable"]), (None, False), "a task of unknown origin is shown, never removed")

    def test_task_folder_is_carried_into_the_finding(self):
        arg = f'/c ""node.exe" "{self.old}\\giveaways_engine\\runner.js""'
        tasks = [{"name": "FreeGamesClaimerStudio-bbbb2222", "path": "\\Sentinel\\", "execute": "conhost.exe", "arguments": arg},
                 {"name": "FreeGamesClaimerStudio-dddd4444", "execute": "conhost.exe", "arguments": arg}]
        found = {f["name"]: f for f in self.scan(self.backend(tasks=tasks))["findings"]}
        self.assertEqual(found["FreeGamesClaimerStudio-bbbb2222"]["taskPath"], "\\Sentinel\\")
        self.assertEqual(found["FreeGamesClaimerStudio-dddd4444"]["taskPath"], "\\", "the root folder is the default")

    def test_running_exe_from_another_folder_is_found_but_not_ours(self):
        procs = [(10, self.old_exe), (11, str(self.project / "TwitchDropsSentinel.exe")), (12, str(self.old / "chrome.exe")), (13, self.old_exe)]
        found = self.scan(self.backend(procs=procs), own_pid=13)["findings"]
        self.assertEqual([(f["kind"], f["pid"], f["removable"], f["closable"]) for f in found], [("process", 10, False, True)])
        self.assertEqual(found[0]["startedAt"], 100.0, "the start time identifies the process, a pid alone can be reused")


class Cleanup(Base):
    def test_run_value_is_backed_up_removed_and_can_be_restored(self):
        data = self.cmd(self.old_exe)
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", data)])
        m = self.manager(b)
        fid = m.rescan()["findings"][0]["id"]
        self.assertTrue(m.remove(fid))
        self.assertEqual(b.runs, [])
        saved = self.backups()
        self.assertEqual((saved[0]["kind"], saved[0]["name"], saved[0]["data"]), ("run_value", "TwitchDropsSentinel", data))
        self.assertEqual(m.state()["findings"], [])
        m.restore(saved[0]["backupId"])
        self.assertEqual(b.runs, [("HKCU", self.run_key, "TwitchDropsSentinel", data)])

    def test_shortcut_is_backed_up_byte_for_byte_and_nothing_else_is_deleted(self):
        startup = self.root / "Startup"
        startup.mkdir()
        lnk = startup / "TwitchDropsSentinel.lnk"
        lnk.write_bytes(LNK_BYTES)
        keep = startup / "Other.lnk"
        keep.write_bytes(b"other")
        b = self.backend(links=[(str(lnk), str(self.old / "start_sentinel_silent.bat"))], startup_dir=startup)
        m = self.manager(b)
        old_files = sorted(p.name for p in self.old.rglob("*"))
        self.assertTrue(m.remove(m.rescan()["findings"][0]["id"]))
        self.assertFalse(lnk.exists())
        self.assertTrue(keep.exists())
        self.assertEqual(sorted(p.name for p in self.old.rglob("*")), old_files, "no file of the other copy is touched")
        saved = self.backups()[0]
        self.assertEqual(base64.b64decode(saved["bytesBase64"]), LNK_BYTES)
        m.restore(saved["backupId"])
        self.assertEqual(lnk.read_bytes(), LNK_BYTES)

    def test_task_xml_is_exported_before_it_is_unregistered_and_restores(self):
        arg = f'/c ""node.exe" "{self.old}\\giveaways_engine\\runner.js""'
        b = self.backend(tasks=[{"name": "FreeGamesClaimerStudio-bbbb2222", "path": "\\Sentinel\\", "execute": "conhost.exe", "arguments": arg}])
        m = self.manager(b)
        self.assertTrue(m.remove(m.rescan()["findings"][0]["id"]))
        self.assertEqual(b.calls, [("export_task", "FreeGamesClaimerStudio-bbbb2222", "\\Sentinel\\"),
                                   ("unregister_task", "FreeGamesClaimerStudio-bbbb2222", "\\Sentinel\\")])
        saved = self.backups()[0]
        self.assertEqual((saved["xml"], saved["taskPath"]), ("<Task>FreeGamesClaimerStudio-bbbb2222</Task>", "\\Sentinel\\"))
        m.restore(saved["backupId"])
        self.assertIn(("register_task", "FreeGamesClaimerStudio-bbbb2222", "\\Sentinel\\", "<Task>FreeGamesClaimerStudio-bbbb2222</Task>"), b.calls)

    def test_a_task_is_not_unregistered_when_the_export_is_empty_or_not_xml(self):
        arg = f'/c ""node.exe" "{self.old}\\giveaways_engine\\runner.js""'
        for bad in ("", "   ", "Export-ScheduledTask : not found"):
            with self.subTest(export=bad):
                b = self.backend(tasks=[{"name": "FreeGamesClaimerStudio-bbbb2222", "execute": "conhost.exe", "arguments": arg}])
                b.xml = bad
                m = self.manager(b)
                with self.assertRaises(Exception):
                    m.remove(m.rescan()["findings"][0]["id"])
                self.assertNotIn("unregister_task", [c[0] for c in b.calls])
                self.assertEqual(self.backups(), [])

    def test_nothing_is_removed_when_the_backup_cannot_be_written(self):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))])
        m = sc.StartupCopies(b, self.project, THIS_TASK, backup_path=self.root / "no_such_dir" / "backup.json", set_autostart=lambda e: True, own_pid=1)
        with self.assertRaises(OSError):
            m.remove(m.rescan()["findings"][0]["id"])
        self.assertEqual(len(b.runs), 1)

    def test_remove_all_takes_only_removable_ones(self):
        runs = [("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe)), ("HKLM", self.run_key, "Machine", self.cmd(self.old_exe))]
        b = self.backend(runs=runs, procs=[(10, self.old_exe)])
        m = self.manager(b)
        m.rescan()
        outcome = m.remove_all()
        self.assertEqual(outcome["removed"], 1)
        kinds = sorted(f["kind"] for f in m.state()["findings"])
        self.assertEqual(kinds, ["hklm_run", "process"])

    def test_one_failing_item_does_not_block_the_rest_and_each_result_is_reported(self):
        runs = [("HKCU", self.run_key, "First", self.cmd(self.old_exe)), ("HKCU", self.run_key, "Second", self.cmd(self.old_exe))]
        b = self.backend(runs=runs)
        b.failing_deletes = {"First"}
        m = self.manager(b)
        m.rescan()
        outcome = m.remove_all()
        self.assertEqual(outcome["removed"], 1)
        by_name = {r["name"]: r for r in outcome["results"]}
        self.assertFalse(by_name["First"]["ok"])
        self.assertNotIn("busy", by_name["First"]["error"], "no raw exception text goes to the user")
        self.assertTrue(by_name["Second"]["ok"])
        self.assertEqual([r[2] for r in b.runs], ["First"])

    def test_unknown_or_unremovable_id_is_refused(self):
        b = self.backend(runs=[("HKLM", self.run_key, "Machine", self.cmd(self.old_exe))])
        m = self.manager(b)
        fid = m.rescan()["findings"][0]["id"]
        with self.assertRaises(sc.NotFound):
            m.remove("0" * 12)
        with self.assertRaises(sc.Refusal):
            m.remove(fid)

    def test_move_autostart_backs_up_the_old_value_and_sets_this_copy(self):
        data = self.cmd(self.old_exe)
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", data)])
        m = self.manager(b)
        m.rescan()
        self.assertTrue(m.move_autostart())
        self.assertEqual(self.autostart_calls, [True])
        self.assertEqual(self.backups()[0]["data"], data)

    def test_a_failed_autostart_move_is_an_error_not_a_success(self):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))])
        m = self.manager(b, set_autostart=lambda enabled: False)
        m.rescan()
        with self.assertLogs("SentinelService", level="ERROR"):
            with self.assertRaises(RuntimeError):
                m.move_autostart()


class RemoveReadsTheCurrentEntry(Base):
    """Between the scan the user saw and the click the entry may have been changed by something else."""

    def run_finding(self, **kwargs):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))], **kwargs)
        m = self.manager(b)
        return b, m, m.rescan()["findings"][0]["id"]

    def test_a_value_that_now_points_at_this_copy_is_refused(self):
        b, m, fid = self.run_finding()
        mine = self.cmd(str(self.project / "TwitchDropsSentinel.exe"))
        b.runs = [("HKCU", self.run_key, "TwitchDropsSentinel", mine)]
        with self.assertRaises(sc.Refusal):
            m.remove(fid)
        self.assertEqual(b.runs[0][3], mine)
        self.assertNotIn("delete_run", [c[0] for c in b.calls])

    def test_a_value_that_no_longer_matches_or_points_elsewhere_or_vanished_is_refused(self):
        other = self.root / "Other Copy" / "TwitchDropsSentinel.exe"
        for replacement in ([("HKCU", self.run_key, "TwitchDropsSentinel", r'"C:\Windows\notepad.exe"')],
                            [("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(str(other)))], []):
            with self.subTest(runs=replacement):
                b, m, fid = self.run_finding()
                b.runs = list(replacement)
                with self.assertRaises(sc.Refusal):
                    m.remove(fid)
                self.assertNotIn("delete_run", [c[0] for c in b.calls])
                self.assertEqual(self.backups(), [])

    def test_a_shortcut_that_now_points_at_this_copy_is_refused_and_kept(self):
        startup = self.root / "Startup"
        startup.mkdir()
        lnk = startup / "TwitchDropsSentinel.lnk"
        lnk.write_bytes(LNK_BYTES)
        b = self.backend(links=[(str(lnk), str(self.old / "start_sentinel_silent.bat"))], startup_dir=startup)
        m = self.manager(b)
        fid = m.rescan()["findings"][0]["id"]
        b.links = [(str(lnk), str(self.project / "start_sentinel_silent.bat"))]
        with self.assertRaises(sc.Refusal):
            m.remove(fid)
        self.assertTrue(lnk.exists())

    def test_a_task_that_now_runs_this_copy_is_refused(self):
        arg = f'/c ""node.exe" "{self.old}\\giveaways_engine\\runner.js""'
        b = self.backend(tasks=[{"name": "FreeGamesClaimerStudio-bbbb2222", "execute": "conhost.exe", "arguments": arg}])
        m = self.manager(b)
        fid = m.rescan()["findings"][0]["id"]
        b.tasks["FreeGamesClaimerStudio-bbbb2222"]["arguments"] = f'/c ""node.exe" "{self.project}\\giveaways_engine\\runner.js""'
        with self.assertRaises(sc.Refusal):
            m.remove(fid)
        self.assertNotIn("unregister_task", [c[0] for c in b.calls])


class Close(Base):
    def closing_manager(self, b, on_sleep=None):
        clock = {"t": 0.0}

        def sleep(seconds):
            clock["t"] += seconds
            if on_sleep:
                on_sleep()

        return self.manager(b, sleep=sleep, monotonic=lambda: clock["t"]), clock

    def test_close_copy_is_graceful_first_and_kills_only_after_the_wait(self):
        b = self.backend(procs=[(10, self.old_exe)])
        b.close_ignored = True
        m, clock = self.closing_manager(b)
        pid_id = m.rescan()["findings"][0]["id"]
        self.assertTrue(m.close(pid_id))
        self.assertEqual([c[0] for c in b.calls], ["request_close", "kill_tree"])
        self.assertGreaterEqual(clock["t"], sc.CLOSE_GRACE_SECONDS)
        self.assertEqual(sc.norm(b.calls[1][2]), sc.norm(self.old))
        self.assertEqual(b.calls[1][3], 100.0, "the kill is bound to the process that was verified")

    def test_close_copy_does_not_kill_what_closed_by_itself(self):
        b = self.backend(procs=[(10, self.old_exe)])
        m, _ = self.closing_manager(b)
        self.assertTrue(m.close(m.rescan()["findings"][0]["id"]))
        self.assertEqual([c[0] for c in b.calls], ["request_close"])

    def test_close_refuses_anything_but_a_process(self):
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(self.old_exe))])
        m = self.manager(b)
        fid = m.rescan()["findings"][0]["id"]
        with self.assertRaises(sc.Refusal):
            m.close(fid)
        self.assertEqual(b.calls, [])

    def test_a_pid_reused_by_another_program_is_never_closed(self):
        b = self.backend(procs=[(10, self.old_exe)])
        m, _ = self.closing_manager(b)
        fid = m.rescan()["findings"][0]["id"]
        b.procs = [(10, str(self.root / "notepad.exe"), 555.0)]  # the copy exited, the pid went to someone else
        self.assertTrue(m.close(fid))
        self.assertEqual(b.calls, [])

    def test_a_pid_reused_by_a_new_run_of_the_same_exe_is_never_closed(self):
        b = self.backend(procs=[(10, self.old_exe)])
        m, _ = self.closing_manager(b)
        fid = m.rescan()["findings"][0]["id"]
        b.procs = [(10, self.old_exe, 555.0)]  # same exe, another start time
        self.assertTrue(m.close(fid))
        self.assertEqual(b.calls, [])

    def test_a_pid_reused_during_the_wait_is_not_killed(self):
        b = self.backend(procs=[(10, self.old_exe)])
        b.close_ignored = True
        swapped = []

        def swap():
            if not swapped:
                b.procs = [(10, self.old_exe, 555.0)]
                swapped.append(True)

        m, _ = self.closing_manager(b, on_sleep=swap)
        self.assertTrue(m.close(m.rescan()["findings"][0]["id"]))
        self.assertEqual([c[0] for c in b.calls], ["request_close"])


class FakeProc:
    def __init__(self, pid, exe, created=100.0, cmdline=(), children=()):
        self.pid, self._exe, self._created, self._cmdline, self._children = pid, exe, created, list(cmdline), list(children)
        self.killed = self.terminated = False

    def exe(self): return self._exe
    def cmdline(self): return self._cmdline
    def create_time(self): return self._created
    def children(self, recursive=False): return list(self._children)
    def kill(self): self.killed = True
    def terminate(self): self.terminated = True


def fake_psutil(*procs):
    table = {p.pid: p for p in procs}

    class Error(Exception):
        pass

    class NoSuchProcess(Error):
        pass

    def process(pid):
        if pid not in table:
            raise NoSuchProcess(pid)
        return table[pid]

    return types.SimpleNamespace(Error=Error, NoSuchProcess=NoSuchProcess, Process=process, STATUS_ZOMBIE="zombie")


class SystemBackendProcessSafety(Base):
    def test_kill_tree_takes_only_children_whose_exe_is_inside_the_folder(self):
        inside = FakeProc(11, str(self.old / "core" / "helper.exe"))
        prefix_sibling = FakeProc(12, str(self.root / "Old Copy Two" / "x.exe"))
        mentions_only = FakeProc(13, r"C:\Windows\System32\cmd.exe", cmdline=["cmd", "/c", str(self.old / "start.bat")])
        root = FakeProc(10, self.old_exe, children=[inside, prefix_sibling, mentions_only])
        with mock.patch.dict(sys.modules, {"psutil": fake_psutil(root)}):
            sc.SystemBackend().kill_tree(10, str(self.old), 100.0)
        self.assertEqual([p.killed for p in (root, inside, prefix_sibling, mentions_only)], [True, True, False, False])

    def test_kill_tree_does_nothing_when_the_pid_belongs_to_a_newer_process(self):
        child = FakeProc(11, str(self.old / "helper.exe"))
        root = FakeProc(10, self.old_exe, created=999.0, children=[child])
        with mock.patch.dict(sys.modules, {"psutil": fake_psutil(root)}):
            sc.SystemBackend().kill_tree(10, str(self.old), 100.0)
        self.assertEqual((root.killed, child.killed), (False, False))

    def test_request_close_never_terminates_a_process_that_is_not_the_verified_one(self):
        root = FakeProc(10, str(self.root / "notepad.exe"), created=999.0)
        with mock.patch.dict(sys.modules, {"psutil": fake_psutil(root)}), mock.patch.object(sc.SystemBackend, "_top_windows", return_value=[]):
            sc.SystemBackend().request_close(10, 100.0)
        self.assertFalse(root.terminated)


class SystemCalls(Base):
    def test_powershell_stops_on_every_error_so_a_failed_export_is_not_a_success(self):
        done = subprocess.CompletedProcess([], 0, stdout=b"", stderr=b"")
        with mock.patch.object(sc.subprocess, "run", return_value=done) as run:
            sc._powershell("Get-Thing")
        self.assertIn("$ErrorActionPreference = 'Stop'", run.call_args[0][0][-1])

    def test_task_paths_and_names_are_validated_before_they_reach_powershell(self):
        with mock.patch.object(sc, "_powershell", return_value="<Task/>") as ps:
            sc.SystemBackend().export_task("FreeGamesClaimerStudio-bbbb2222", "\\Sentinel\\")
        self.assertIn("-TaskPath '\\Sentinel\\'", ps.call_args[0][0])
        for bad_path in ("\\x'; calc; '", "no-slash", "\\..\\"):
            with self.assertRaises(ValueError):
                sc.SystemBackend().export_task("FreeGamesClaimerStudio-bbbb2222", bad_path)

    @unittest.skipUnless(sys.platform == "win32", "the Startup folder is a Windows place")
    def test_the_startup_folder_goes_to_powershell_in_the_environment_not_in_the_script(self):
        appdata = self.root / "App\u2019Data"  # a curly quote ends a PowerShell single-quoted string
        folder = appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
        folder.mkdir(parents=True)
        with mock.patch.dict(os.environ, {"APPDATA": str(appdata)}), mock.patch.object(sc, "_powershell", return_value="") as ps:
            sc.SystemBackend().startup_links()
        self.assertNotIn("Data", ps.call_args[0][0])
        self.assertEqual(ps.call_args.kwargs["env_extra"]["SENTINEL_STARTUP_DIR"], str(folder))


class StartupCheck(Base):
    def manager(self, backend, notes=None):
        notes = [] if notes is None else notes
        return super().manager(backend, notify=lambda key, text: notes.append((key, text)))

    def test_dead_entries_are_removed_and_live_ones_are_announced_once_per_set(self):
        runs = [("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(str(self.gone / "TwitchDropsSentinel.exe"))),
                ("HKCU", self.run_key, "Live", self.cmd(self.old_exe))]
        b = self.backend(runs=runs)
        notes = []
        m = self.manager(b, notes)
        result = m.startup_check()
        self.assertEqual([r[2] for r in b.runs], ["Live"])
        self.assertEqual(len(result["cleaned"]), 1)
        self.assertEqual(len(notes), 1)
        m.startup_check()
        self.assertEqual(notes[0][0], notes[1][0], "the same set has the same notification key, so the notifier stays quiet")

    def test_an_unmounted_drive_is_not_a_deleted_copy(self):
        missing_drive = r"Q:\Games\Sentinel\TwitchDropsSentinel.exe"
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(missing_drive))])
        m = self.manager(b)
        orig = b.path_exists
        b.path_exists = lambda p: False if str(p).upper().startswith("Q:") else orig(p)
        self.assertEqual(m.startup_check()["cleaned"], [])
        self.assertEqual(len(b.runs), 1)

    def test_a_missing_parent_folder_is_not_a_deleted_copy(self):
        """An unplugged USB stick or a disconnected share leaves the drive letter or server but not the folders."""
        away = self.root / "Removable" / "Sentinel" / "TwitchDropsSentinel.exe"
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(str(away)))])
        self.assertEqual(self.manager(b).startup_check()["cleaned"], [])
        self.assertEqual(len(b.runs), 1)

    def test_no_notification_when_nothing_is_left(self):
        notes = []
        self.manager(self.backend(), notes).startup_check()
        self.assertEqual(notes, [])


class Restore(Base):
    def write_backups(self, *records):
        self.backup_path.write_text(json.dumps([{"backupId": f"id{i:010d}", "time": "t", **r} for i, r in enumerate(records)]), encoding="utf-8")
        return [f"id{i:010d}" for i in range(len(records))]

    def run_record(self, **over):
        return {"kind": "run_value", "name": "TwitchDropsSentinel", "target": self.old_exe, "copyDir": str(self.old),
                "hive": "HKCU", "subkey": self.run_key, "data": self.cmd(self.old_exe), **over}

    def test_run_records_that_are_not_ours_are_refused(self):
        bad = [self.run_record(hive="HKLM"), self.run_record(subkey=r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run"),
               self.run_record(data=r'"C:\Windows\System32\calc.exe"'), self.run_record(name="evil\\name"), self.run_record(name=""),
               self.run_record(data=5)]
        ids = self.write_backups(*bad)
        b = self.backend()
        m = self.manager(b)
        for backup_id in ids:
            with self.subTest(backup=backup_id):
                with self.assertRaises(sc.Refusal):
                    m.restore(backup_id)
        self.assertEqual(b.calls, [])

    def test_restoring_over_a_different_value_saves_that_value_first(self):
        (backup_id,) = self.write_backups(self.run_record())
        b = self.backend(runs=[("HKCU", self.run_key, "TwitchDropsSentinel", self.cmd(str(self.project / "TwitchDropsSentinel.exe")))])
        m = self.manager(b)
        m.restore(backup_id)
        self.assertEqual(b.runs[0][3], self.cmd(self.old_exe))
        saved = [r for r in self.backups() if r["backupId"] != backup_id]
        self.assertEqual(len(saved), 1)
        self.assertIn(str(self.project), saved[0]["data"], "what was overwritten is in the backup file")

    def test_shortcut_records_must_be_a_lnk_inside_the_startup_folder(self):
        startup = self.root / "Startup"
        startup.mkdir()
        payload = base64.b64encode(LNK_BYTES).decode("ascii")

        def link(path):
            return {"kind": "startup_link", "name": "x.lnk", "target": "t", "copyDir": None, "path": str(path), "bytesBase64": payload}

        bad = [link(self.root / "elsewhere" / "x.lnk"), link(startup / "x.exe"), link(startup / ".." / "x.lnk"), link(startup / "sub" / ".." / ".." / "x.lnk"),
               {**link(startup / "x.lnk"), "bytesBase64": base64.b64encode(b"MZ not a shortcut").decode("ascii")}]
        ids = self.write_backups(*bad)
        m = self.manager(self.backend(startup_dir=startup))
        for backup_id in ids:
            with self.subTest(backup=backup_id):
                with self.assertRaises(sc.Refusal):
                    m.restore(backup_id)
        self.assertFalse((self.root / "elsewhere").exists())
        self.assertEqual(sorted(p.name for p in startup.iterdir()), [])

    def test_restoring_a_shortcut_over_another_file_saves_the_other_file_first(self):
        startup = self.root / "Startup"
        startup.mkdir()
        (startup / "x.lnk").write_bytes(b"\x4c\x00\x00\x00current")
        (backup_id,) = self.write_backups({"kind": "startup_link", "name": "x.lnk", "target": "t", "copyDir": None, "path": str(startup / "x.lnk"),
                                           "bytesBase64": base64.b64encode(LNK_BYTES).decode("ascii")})
        m = self.manager(self.backend(startup_dir=startup))
        m.restore(backup_id)
        self.assertEqual((startup / "x.lnk").read_bytes(), LNK_BYTES)
        extra = [r for r in self.backups() if r["backupId"] != backup_id]
        self.assertEqual(base64.b64decode(extra[0]["bytesBase64"]), b"\x4c\x00\x00\x00current")

    def test_task_records_need_our_name_a_valid_folder_xml_and_a_free_name(self):
        good = {"kind": "scheduler_task", "name": "FreeGamesClaimerStudio-bbbb2222", "taskPath": "\\", "target": "", "copyDir": None, "xml": "<Task/>"}
        bad = [{**good, "name": "OneDrive Update"}, {**good, "taskPath": "\\x'; calc; '"}, {**good, "xml": "not xml"}, {**good, "xml": ""}]
        ids = self.write_backups(*bad, good)
        b = self.backend()
        m = self.manager(b)
        for backup_id in ids[:-1]:
            with self.subTest(backup=backup_id):
                with self.assertRaises(sc.Refusal):
                    m.restore(backup_id)
        self.assertEqual(b.calls, [])
        b.tasks["FreeGamesClaimerStudio-bbbb2222"] = {"name": "FreeGamesClaimerStudio-bbbb2222", "execute": "x", "arguments": ""}
        with self.assertRaises(sc.Refusal):
            m.restore(ids[-1])
        self.assertNotIn("register_task", [c[0] for c in b.calls], "an existing task is never overwritten")


if __name__ == "__main__":
    unittest.main()
