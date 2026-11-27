"""Build downloads are pinned: the embeddable Python hash is verified, workflow tools and third-party actions are pinned."""
import importlib.util
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def load_setup():
    spec = importlib.util.spec_from_file_location("setup_portable_runtime", ROOT / "tools" / "setup_portable_runtime.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PortableRuntimePinTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_setup()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dest = Path(self.tmp.name) / "python_embed.zip"

    def fake_download(self, payload: bytes):
        def retrieve(url, filename):
            Path(filename).write_bytes(payload)
        return mock.patch.object(self.mod.urllib.request, "urlretrieve", side_effect=retrieve)

    def test_hash_constant_is_a_sha256(self):
        self.assertRegex(self.mod.EMBED_SHA256, r"^[0-9a-f]{64}$")

    def test_wrong_hash_is_rejected_and_file_deleted(self):
        with self.fake_download(b"tampered"):
            with self.assertRaises(RuntimeError):
                self.mod.download_verified("https://example.invalid/x.zip", self.dest, self.mod.EMBED_SHA256)
        self.assertFalse(self.dest.exists())

    def test_matching_hash_is_accepted(self):
        import hashlib
        with self.fake_download(b"payload"):
            self.mod.download_verified("https://example.invalid/x.zip", self.dest, hashlib.sha256(b"payload").hexdigest())
        self.assertTrue(self.dest.exists())


class WorkflowPinTests(unittest.TestCase):
    def workflows(self):
        return {p.name: p.read_text(encoding="utf-8") for p in (ROOT / ".github" / "workflows").glob("*.yml")}

    def test_third_party_actions_pinned_to_commit_sha(self):
        for name, text in self.workflows().items():
            for action in re.findall(r"uses:\s*([^\s#]+)", text):
                if action.startswith(("actions/", "./")):
                    continue
                self.assertRegex(action, r"@[0-9a-f]{40}$", f"{name}: {action} is not pinned to a commit SHA")

    def test_choco_installs_are_version_pinned(self):
        for name, text in self.workflows().items():
            for line in re.findall(r"choco install[^\r\n]*", text):
                self.assertIn("--version", line, f"{name}: unpinned choco install: {line}")


if __name__ == "__main__":
    unittest.main()
