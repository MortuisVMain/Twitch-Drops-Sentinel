"""The update archive is downloaded in parallel ranges and resumes after dropped connections."""
import hashlib
import os
import re
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import updater

PAYLOAD = os.urandom(3 * 1024 * 1024 + 12345)
PART = 256 * 1024


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def do_GET(self):
        srv = self.server
        srv.seen_auth.append(self.headers.get("Authorization"))
        rng = self.headers.get("Range")
        if rng == "bytes=0-0":
            with srv.lock:
                fail_probe = srv.probe_drops > 0
                srv.probe_drops -= fail_probe
            if fail_probe:
                self.close_connection = True
                return
        elif rng:
            with srv.lock:
                srv.part_requests += 1
        match = re.fullmatch(r"bytes=(\d+)-(\d*)", rng or "")
        if not (srv.ranges and match):
            self.send_response(200)
            self.send_header("Content-Length", str(len(PAYLOAD)))
            self.end_headers()
            self.wfile.write(PAYLOAD)
            return
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else len(PAYLOAD) - 1
        end = min(end, len(PAYLOAD) - 1)
        body = PAYLOAD[start:end + 1]
        self.send_response(206)
        self.send_header("Content-Range", f"bytes {start}-{end}/{len(PAYLOAD)}")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        with srv.lock:
            drop = len(body) > 1000 and srv.drops_left > 0
            if drop:
                srv.drops_left -= 1
        if drop:
            self.wfile.write(body[:int(len(body) * srv.sent_before_drop)])
            self.wfile.flush()
            self.close_connection = True
            return
        self.wfile.write(body)


def _serve(ranges=True, drops=0, sent_before_drop=0.5, probe_drops=0):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    srv.probe_drops, srv.part_requests = probe_drops, 0
    srv.ranges, srv.drops_left, srv.lock, srv.seen_auth = ranges, drops, threading.Lock(), []
    srv.sent_before_drop = sent_before_drop
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "update.zip"
        self.opener = urllib.request.build_opener(updater.SafeAuthRedirectHandler)
        self._backoff = updater.RETRY_BACKOFF
        updater.RETRY_BACKOFF = 0
        self.addCleanup(setattr, updater, "RETRY_BACKOFF", self._backoff)
        self.received = 0
        self.total_seen = 0

    def _serve(self, **kw):
        srv = _serve(**kw)
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        return srv, f"http://127.0.0.1:{srv.server_address[1]}/a.zip"

    def _progress(self, total, delta):
        self.total_seen = total
        self.received += delta

    def _download(self, url, **kw):
        updater.download_file(url, {"User-Agent": "t"}, self.path, self.opener, self._progress,
                              part_size=PART, workers=4, **kw)

    def test_parallel_download_survives_mid_part_drops(self):
        srv, url = self._serve(drops=5)
        self._download(url)
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), hashlib.sha256(PAYLOAD).hexdigest())
        self.assertEqual(srv.drops_left, 0)
        self.assertEqual(self.total_seen, len(PAYLOAD))
        self.assertEqual(self.received, len(PAYLOAD))

    def test_dropped_first_probe_still_downloads_in_parallel(self):
        srv, url = self._serve(probe_drops=2)
        self._download(url)
        self.assertEqual(self.path.read_bytes(), PAYLOAD)
        self.assertEqual(srv.probe_drops, 0)
        self.assertEqual(srv.part_requests, -(-len(PAYLOAD) // PART))

    def test_server_without_range_support_falls_back_to_single_stream(self):
        _, url = self._serve(ranges=False)
        self._download(url)
        self.assertEqual(self.path.read_bytes(), PAYLOAD)
        self.assertEqual(self.received, len(PAYLOAD))

    def test_part_gives_up_after_too_many_stalls(self):
        _, url = self._serve(drops=10_000, sent_before_drop=0)
        with self.assertRaises(OSError):
            self._download(url)

    def test_authorization_is_not_sent_to_other_hosts(self):
        headers = {"Authorization": "Bearer x", "User-Agent": "t"}
        self.assertIn("Authorization", updater.headers_for_host(headers, "https://github.com/a", "https://github.com/b"))
        self.assertNotIn("Authorization", updater.headers_for_host(headers, "https://github.com/a", "https://cdn.example.com/b"))


if __name__ == "__main__":
    unittest.main()


class BadArchiveTests(unittest.TestCase):
    def test_a_corrupt_member_ends_in_the_error_stage_and_removes_the_staging_dir(self):
        import io
        import zipfile
        from unittest import mock

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("core/new_module.py", "x = 1\n")
        data = buf.getvalue()
        url = "https://github.com/MortuisVMain/x/releases/download/v9/Patch.zip"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            upd = updater.GitHubUpdater()
            with mock.patch.object(updater, "PROJECT_DIR", root), \
                    mock.patch.object(updater, "get_optional_github_token", lambda: ""), \
                    mock.patch.object(updater, "download_file", lambda u, h, path, op, st: Path(path).write_bytes(data)), \
                    mock.patch.object(zipfile.ZipFile, "testzip", lambda self: "core/new_module.py"):
                ok, message = upd._install_update([url], {url: hashlib.sha256(data).hexdigest()})
            self.assertFalse(ok)
            self.assertIn("core/new_module.py", message)
            self.assertEqual(upd._status["stage"], "error")
            self.assertTrue(upd._status["error_message"])
            self.assertFalse(upd._status["is_updating"])
            self.assertFalse((root / "_staging").exists(), "the half-downloaded staging dir must not be left behind")
