"""The /api/startup-copies handlers (fake request, fake manager, no server) and the installer hint rule."""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import copy_import
import startup_copies as sc
from startup_copies_routes import StartupCopiesRoutes

FID = "abcdef012345"


class FakeManager:
    def __init__(self, findings=()):
        self.findings = list(findings)
        self.calls = []
        self.fail = None

    def state(self):
        return {"findings": self.findings, "autostartOwner": None, "scannedAt": 1.0}

    def rescan(self):
        self.calls.append(("rescan",))
        return self.state()

    def _act(self, name, *args):
        self.calls.append((name, *args))
        if self.fail:
            raise self.fail
        return True

    def remove(self, fid):
        if fid != FID:
            raise sc.NotFound(fid)
        return self._act("remove", fid)

    def remove_all(self):
        self._act("remove_all")
        return {"removed": 2, "results": [{"id": FID, "name": "x", "ok": True}, {"id": "111111111111", "name": "y", "ok": False, "error": "e"}]}

    def move_autostart(self):
        return self._act("move_autostart")

    def close(self, fid):
        if fid != FID:
            raise sc.NotFound(fid)
        return self._act("close", fid)


class FakeRequest:
    def __init__(self, body=None, error=None, query=None):
        self.body, self.error, self.query = body, error, query or {}

    async def json(self):
        if self.error:
            raise self.error
        return self.body


def call(coro):
    response = asyncio.run(coro)
    return response.status, json.loads(response.text)


class Routes(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="routes_"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.project = self.root / "New"
        (self.project / "data").mkdir(parents=True)
        self.old = self.root / "Old"
        (self.old / "core").mkdir(parents=True)
        (self.old / "core" / "version.py").write_text('__version__ = "3.7.0"\n', encoding="utf-8")
        (self.old / "config.json").write_text("{}", encoding="utf-8")
        self.finding = {"id": FID, "kind": "run_value", "copyDir": str(self.old), "version": "3.7.0", "removable": True, "closable": False, "dirExists": True}
        self.manager = FakeManager([self.finding])
        self.dismissed = []
        self.hint_flag = False
        self.routes = StartupCopiesRoutes(self.manager, self.project, defaults={"pause_on_gaming": True}, hint_dismissed=lambda: self.hint_flag,
                                          dismiss_hint=lambda: self.dismissed.append(True), downloads=self.root / "Downloads", this_version="3.10.0")

    def test_state_is_cached_and_rescans_on_demand(self):
        status, body = call(self.routes.get_state(FakeRequest()))
        self.assertEqual((status, body["status"], body["thisVersion"]), (200, "ok", "3.10.0"))
        self.assertEqual(self.manager.calls, [])
        call(self.routes.get_state(FakeRequest(query={"rescan": "1"})))
        self.assertEqual(self.manager.calls, [("rescan",)])

    def test_state_lists_copies_with_their_import_options(self):
        _, body = call(self.routes.get_state(FakeRequest()))
        self.assertEqual(len(body["copies"]), 1)
        copy = body["copies"][0]
        self.assertEqual((copy["version"], copy["running"], copy["importable"]), ("3.7.0", False, True))
        self.manager.findings.append({**self.finding, "id": "111111111111", "kind": "process", "removable": False, "closable": True})
        _, body = call(self.routes.get_state(FakeRequest()))
        self.assertEqual((body["copies"][0]["running"], body["copies"][0]["importable"]), (True, False), "a running copy cannot be imported from")

    def test_remove_one_all_and_validation(self):
        self.assertEqual(call(self.routes.remove(FakeRequest({"id": FID})))[0], 200)
        self.assertEqual(self.manager.calls[-1], ("remove", FID))
        status, body = call(self.routes.remove(FakeRequest({"all": True})))
        self.assertEqual((status, body["removed"], len(body["results"])), (200, 2, 2))
        self.assertEqual(call(self.routes.remove(FakeRequest({"id": "ffffffffffff"})))[0], 404)
        for bad in ({}, {"id": 5}, {"id": "../x"}, {"id": FID, "all": True}, {"all": False}, {"all": "yes"}, [], None, {"id": FID, "extra": 1}):
            self.assertEqual(call(self.routes.remove(FakeRequest(bad)))[0], 400, f"{bad!r}")
        self.assertEqual(call(self.routes.remove(FakeRequest(error=ValueError("bad json"))))[0], 400)

    def test_refusals_and_failures_map_to_statuses(self):
        self.manager.fail = sc.Refusal("hklm")
        self.assertEqual(call(self.routes.remove(FakeRequest({"id": FID})))[0], 409)
        self.manager.fail = OSError("disk")
        status, body = call(self.routes.remove(FakeRequest({"id": FID})))
        self.assertEqual((status, body["status"]), (500, "error"))

    def test_only_our_own_exception_types_mean_refused_or_not_found(self):
        """A PermissionError from the OS or a KeyError from a bug is a failure, not a policy answer."""
        for exc in (PermissionError("Access is denied"), KeyError("bug"), LookupError("bug")):
            self.manager.fail = exc
            with self.assertLogs("SentinelService", level="ERROR") as logs:
                status, body = call(self.routes.remove(FakeRequest({"id": FID})))
            self.assertEqual(status, 500, repr(exc))
            self.assertTrue(logs.records[0].exc_info, "the trace is logged")
        self.manager.fail = sc.NotFound("gone")
        self.assertEqual(call(self.routes.remove(FakeRequest({"id": FID})))[0], 404)

    def test_failure_bodies_carry_no_raw_exception_text(self):
        self.manager.fail = OSError("secret path of someone")
        with self.assertLogs("SentinelService", level="ERROR"):
            status, body = call(self.routes.remove(FakeRequest({"id": FID})))
        self.assertEqual(status, 500)
        self.assertNotIn("secret", json.dumps(body))
        self.assertTrue(body["message"])

    def test_a_failed_autostart_move_is_a_500(self):
        self.manager.fail = RuntimeError("autostart was not set")
        with self.assertLogs("SentinelService", level="ERROR"):
            self.assertEqual(call(self.routes.move_autostart(FakeRequest({})))[0], 500)

    def test_move_autostart_and_close(self):
        self.assertEqual(call(self.routes.move_autostart(FakeRequest({})))[0], 200)
        self.assertEqual(call(self.routes.close(FakeRequest({"id": FID})))[0], 200)
        self.assertEqual(call(self.routes.close(FakeRequest({"id": "ffffffffffff"})))[0], 404)
        self.assertEqual(call(self.routes.close(FakeRequest({})))[0], 400)

    def test_import_needs_a_known_copy_that_is_not_running(self):
        self.assertEqual(call(self.routes.import_data(FakeRequest({"dir": str(self.root / "Other")})))[0], 404)
        self.assertEqual(call(self.routes.import_data(FakeRequest({"dir": 7})))[0], 400)
        self.manager.findings.append({**self.finding, "id": "111111111111", "kind": "process", "removable": False, "closable": True})
        self.assertEqual(call(self.routes.import_data(FakeRequest({"dir": str(self.old)})))[0], 409)

    def test_import_refuses_a_folder_that_is_not_a_copy_or_has_nothing_to_bring(self):
        for name, build in (("Empty", lambda d: d.mkdir()), ("NoData", lambda d: (d / "core").mkdir(parents=True) or (d / "core" / "version.py").write_text("x", encoding="utf-8"))):
            folder = self.root / name
            build(folder)
            self.manager.findings = [{**self.finding, "copyDir": str(folder)}]
            status, body = call(self.routes.import_data(FakeRequest({"dir": str(folder)})))
            self.assertEqual(status, 400, name)
        self.assertFalse((self.project / "data" / copy_import.MARKER_NAME).exists())

    def test_import_asks_before_replacing_own_data_then_stages(self):
        (self.project / "config.json").write_text(json.dumps({"pause_on_gaming": False}), encoding="utf-8")
        status, body = call(self.routes.import_data(FakeRequest({"dir": str(self.old)})))
        self.assertEqual((status, body["status"]), (409, "confirm_required"))
        self.assertFalse((self.project / "data" / copy_import.MARKER_NAME).exists())
        status, body = call(self.routes.import_data(FakeRequest({"dir": str(self.old), "confirm": True})))
        self.assertEqual((status, body["restart_required"]), (200, True))
        self.assertTrue((self.project / "data" / copy_import.MARKER_NAME).is_file())

    def test_import_without_own_data_needs_no_confirmation(self):
        status, body = call(self.routes.import_data(FakeRequest({"dir": str(self.old)})))
        self.assertEqual((status, body["restart_required"]), (200, True))

    def test_dismissing_the_hint_is_remembered_through_the_setting(self):
        self.assertEqual(call(self.routes.dismiss_hint(FakeRequest({})))[0], 200)
        self.assertEqual(self.dismissed, [True])


class InstallerHint(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="hint_"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

    def test_installer_installs_are_recognised_by_the_uninstaller_next_to_the_exe(self):
        (self.root / "app").mkdir()
        self.assertFalse(sc.installed_by_installer(self.root / "app"))
        (self.root / "app" / "unins000.exe").write_bytes(b"MZ")
        self.assertTrue(sc.installed_by_installer(self.root / "app"))

    def test_rule(self):
        downloads = self.root / "Downloads"
        in_dl, elsewhere = downloads / "Sentinel 3.10", self.root / "Tools" / "Sentinel"
        for p in (in_dl, elsewhere):
            p.mkdir(parents=True)
        show = lambda project, others, dismissed=False: sc.installer_hint_visible(project, others, dismissed, downloads)
        self.assertTrue(show(in_dl, False))
        self.assertTrue(show(elsewhere, True))
        self.assertFalse(show(elsewhere, False), "a tidy portable copy elsewhere is left alone")
        self.assertFalse(show(in_dl, True, dismissed=True))
        (in_dl / "unins000.exe").write_bytes(b"MZ")
        self.assertFalse(show(in_dl, True), "an installed copy never gets the hint")


if __name__ == "__main__":
    unittest.main()
