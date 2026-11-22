"""The updater trusts release assets of the current repository and of the future Hell-Harvest repository, nothing else."""
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlsplit

import updater
from updater import is_trusted_release_url

REPOS = ("MortuisVMain/Twitch-Drops-Sentinel", "MortuisVMain/Hell-Harvest")


class TrustedRepos(unittest.TestCase):
    def test_both_repos_are_listed_and_api_stays_on_the_current_one(self):
        self.assertEqual(tuple(updater.TRUSTED_RELEASE_REPOS), REPOS)
        self.assertEqual(updater.TRUSTED_RELEASE_REPO, REPOS[0])

    def test_asset_urls_of_both_repos_are_trusted(self):
        for repo in REPOS:
            with self.subTest(repo=repo):
                self.assertTrue(is_trusted_release_url(f"https://github.com/{repo}/releases/download/v4.0.0/Hell_Harvest_Patch_v4.0.0.zip"))
                self.assertTrue(is_trusted_release_url(f"https://api.github.com/repos/{repo}/releases/assets/123"))

    def test_look_alikes_are_refused(self):
        bad = [
            "https://github.com/MortuisVMain/Hell-Harvest-evil/releases/download/v1/a.zip",
            "https://api.github.com/repos/MortuisVMain/Hell-Harvest-evil/releases/assets/1",
            "https://github.com/MortuisVMain/Hell-Harvestx/releases/download/v1/a.zip",
            "https://github.com/evil/Hell-Harvest/releases/download/v1/a.zip",
            "https://github.com/evil/Twitch-Drops-Sentinel/releases/download/v1/a.zip",
            "https://github.com/MortuisVMain/Twitch-Drops-Sentinel-evil/releases/download/v1/a.zip",
            "https://api.github.com/repos/evil/Hell-Harvest/releases/assets/1",
            "https://evil.com/MortuisVMain/Hell-Harvest/releases/download/v1/a.zip",
        ]
        for url in bad:
            with self.subTest(url=url):
                self.assertFalse(is_trusted_release_url(url))

    def test_sha_resolver_accepts_download_paths_of_both_repos(self):
        for repo in REPOS:
            path = urlsplit(f"https://github.com/{repo}/releases/download/v4.0.0/a.zip").path
            self.assertTrue(updater._ASSET_DOWNLOAD_PATH_RE.fullmatch(path), repo)
            api = urlsplit(f"https://api.github.com/repos/{repo}/releases/assets/9").path
            self.assertTrue(updater._ASSET_API_PATH_RE.fullmatch(api), repo)
        evil = urlsplit("https://github.com/MortuisVMain/Hell-Harvest-evil/releases/download/v4.0.0/a.zip").path
        self.assertIsNone(updater._ASSET_DOWNLOAD_PATH_RE.fullmatch(evil))

    def test_patch_asset_pick_works_for_the_new_name(self):
        name = "Hell_Harvest_Patch_v4.0.0.zip".lower()
        self.assertTrue("patch" in name and name.endswith(".zip"))
        full = "Hell_Harvest_v4.0.0_Public_Release.zip".lower()
        self.assertFalse("patch" in full)
    def test_a_hell_harvest_wrapper_folder_is_stripped_like_the_old_one(self):
        root = Path(tempfile.mkdtemp()).resolve()
        for wrapper in ("Hell Harvest v4.0.0", "Twitch Drops Sentinel v3.0"):
            self.assertEqual(updater.archive_member_target(root, f"{wrapper}/core/version.py"), root / "core" / "version.py")


if __name__ == "__main__":
    unittest.main()
