"""Beta update channel: pre-releases are offered only on the beta channel, and a release beats its pre-releases."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import updater
from updater import GitHubUpdater, pick_release, version_key


def rel(tag, prerelease=False, draft=False, packaged=True):
    assets = [{"name": f"Twitch_Drops_Sentinel_{tag}.zip", "browser_download_url": f"https://github.com/x/releases/download/{tag}/full.zip",
               "url": "https://api.github.com/repos/x/releases/assets/1"}] if packaged else []
    return {"tag_name": tag, "prerelease": prerelease, "draft": draft, "assets": assets, "html_url": f"https://github.com/x/{tag}"}


class VersionKey(unittest.TestCase):
    def test_a_release_beats_its_prereleases(self):
        self.assertLess(version_key("v3.9.0-beta.1"), version_key("v3.9.0-beta.2"))
        self.assertLess(version_key("v3.9.0-beta.2"), version_key("v3.9.0"))
        self.assertLess(version_key("3.9.0"), version_key("v3.9.1-beta.1"))
        self.assertLess(version_key("3.8.0"), version_key("3.9.0-rc"))
        self.assertEqual(version_key("3.8"), version_key("3.8.0"))


class PickRelease(unittest.TestCase):
    RELEASES = [rel("v3.9.0-beta.1", prerelease=True), rel("v3.8.0"), rel("v4.0.0", draft=True), rel("v3.7.0")]

    def test_stable_skips_prereleases_and_drafts(self):
        self.assertEqual(pick_release(self.RELEASES, include_prerelease=False)["tag_name"], "v3.8.0")

    def test_beta_takes_the_newest_prerelease(self):
        self.assertEqual(pick_release(self.RELEASES, include_prerelease=True)["tag_name"], "v3.9.0-beta.1")

    def test_beta_takes_the_release_once_it_is_out(self):
        releases = self.RELEASES + [rel("v3.9.0")]
        self.assertEqual(pick_release(releases, include_prerelease=True)["tag_name"], "v3.9.0")

    def test_nothing_usable(self):
        self.assertIsNone(pick_release([rel("v9.0.0", draft=True)], include_prerelease=True))
        self.assertIsNone(pick_release({"message": "Not Found"}, include_prerelease=True))


class Channel(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp(prefix="update_channel_"))
        self.patches = [
            mock.patch.object(updater, "CACHE_FILE", self.work / "cache.json"),
            mock.patch.object(updater, "get_optional_github_token", lambda: ""),
            mock.patch.object(updater, "get_live_local_version", lambda: "3.8.0"),
        ]
        for p in self.patches:
            p.start()
        self.urls = []

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def _serve(self, payload_by_url):
        urls = self.urls

        class Opener:
            def open(self, req, timeout=None):
                urls.append(req.full_url)
                return io.BytesIO(json.dumps(payload_by_url[req.full_url]).encode("utf-8"))

        return mock.patch.object(updater.urllib.request, "build_opener", lambda *a: Opener())

    def test_stable_and_beta_read_different_endpoints_and_never_share_a_cached_answer(self):
        up = GitHubUpdater()
        payloads = {updater.REPO_API_URL: rel("v3.8.0"),
                    updater.REPO_RELEASES_URL: [rel("v3.9.0-beta.1", prerelease=True), rel("v3.8.0")]}
        with self._serve(payloads):
            stable = up.check_for_updates(force=True)
            self.assertFalse(stable["update_available"])
            self.assertEqual(stable["channel"], "stable")
            up.set_channel("beta")
            beta = up.check_for_updates()  # not forced: the stable answer must not be served from the cache
            self.assertTrue(beta["update_available"])
            self.assertTrue(beta["prerelease"])
            self.assertEqual(beta["latest_version"], "3.9.0-beta.1")
            up.set_channel("nonsense")
            self.assertEqual(up.channel, "stable")
        self.assertEqual(self.urls, [updater.REPO_API_URL, updater.REPO_RELEASES_URL])

    def test_a_beta_user_is_offered_the_final_release(self):
        with mock.patch.object(updater, "get_live_local_version", lambda: "3.9.0-beta.2"):
            up = GitHubUpdater()
            up.set_channel("beta")
            with self._serve({updater.REPO_RELEASES_URL: [rel("v3.9.0"), rel("v3.9.0-beta.2", prerelease=True)]}):
                self.assertTrue(up.check_for_updates(force=True)["update_available"])

    def test_a_release_still_building_its_zip_is_not_offered_and_is_checked_again_soon(self):
        # gh release create publishes the release at once; the workflow uploads the ZIPs minutes later
        up = GitHubUpdater()
        with mock.patch.object(updater.time, "time", lambda: 1000.0), self._serve({updater.REPO_API_URL: rel("v3.9.0", packaged=False)}):
            pending = up.check_for_updates(force=True)
        self.assertFalse(pending["update_available"], "no ZIP yet: the Install button would have nothing to install")
        self.assertTrue(pending["assets_pending"])
        with mock.patch.object(updater.time, "time", lambda: 1000.0 + updater.ASSETS_PENDING_RECHECK_SECONDS + 1):
            with self._serve({updater.REPO_API_URL: rel("v3.9.0")}):
                ready = up.check_for_updates()  # not forced: the pending answer is not cached for the usual 15 minutes
        self.assertTrue(ready["update_available"])
        self.assertFalse(ready["assets_pending"])
        self.assertTrue(ready["download_url"].endswith(".zip"))


if __name__ == "__main__":
    unittest.main()
