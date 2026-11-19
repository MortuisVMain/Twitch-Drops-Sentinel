"""Offline checks for finding Node.js when the PATH of this process is stale: every lookup is a fake."""
import unittest
from pathlib import Path

from steam_idle.controller import Tools, find_tools
from steam_idle.node_locator import find_node

ENV = {"ProgramFiles": r"C:\Program Files", "ProgramFiles(x86)": r"C:\Program Files (x86)", "LOCALAPPDATA": r"C:\Users\u\AppData\Local"}


def locate(existing, registry=(), which=None, environ=ENV):
    """find_node over a pretend disk (`existing` node.exe paths) and a pretend registry PATH."""
    files = {str(Path(p)) for p in existing}
    return find_node(which=which or (lambda name: None), environ=environ, registry_paths=lambda: list(registry),
                     is_file=lambda path: str(path) in files)


class NodeLocatorTests(unittest.TestCase):
    def test_the_path_of_the_process_wins(self):
        self.assertEqual(locate([], which=lambda name: r"C:\x\node.exe"), r"C:\x\node.exe")

    def test_the_standard_install_folders_are_searched(self):
        for folder in (r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs", r"C:\Users\u\AppData\Local\Programs\nodejs"):
            with self.subTest(folder=folder):
                self.assertEqual(locate([folder + r"\node.exe"]), str(Path(folder) / "node.exe"))

    def test_the_registry_path_is_read_fresh_and_its_variables_are_expanded(self):
        self.assertEqual(locate([r"D:\tools\node\node.exe"], registry=[r"C:\Windows;D:\tools\node"]), str(Path(r"D:\tools\node") / "node.exe"))
        self.assertEqual(locate([r"C:\Program Files\nodejs\node.exe"], registry=[r"%ProgramFiles%\nodejs"]),
                         str(Path(r"C:\Program Files\nodejs") / "node.exe"))

    def test_nothing_found_is_none_and_empty_entries_are_skipped(self):
        self.assertIsNone(locate([], registry=[";;C:\\Windows;"]))

    def test_an_unreadable_registry_still_leaves_the_install_folders(self):
        def broken():
            raise OSError("no registry")
        found = find_node(which=lambda name: None, environ=ENV, registry_paths=broken,
                          is_file=lambda path: str(path) == str(Path(r"C:\Program Files\nodejs") / "node.exe"))
        self.assertEqual(found, str(Path(r"C:\Program Files\nodejs") / "node.exe"))


class FindToolsTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "steam_idle").mkdir()
        (self.root / "steam_idle" / "SteamIdleProbe.exe").write_bytes(b"x")
        self.engine = self.root / "engine"
        self.engine.mkdir()
        (self.engine / "steam-community.js").write_text("//", encoding="utf-8")

    def test_the_fallback_is_used_when_the_path_has_no_node(self):
        tools = find_tools(self.root, self.engine, which=lambda name: None, platform_name="win32", fallback=lambda: r"C:\n\node.exe")
        self.assertIsNone(tools.unavailable)
        self.assertEqual(tools.community[0], r"C:\n\node.exe")

    def test_without_a_fallback_node_stays_missing(self):
        self.assertEqual(find_tools(self.root, self.engine, which=lambda name: None, platform_name="win32"),
                         Tools("node_missing"))


if __name__ == "__main__":
    unittest.main()
