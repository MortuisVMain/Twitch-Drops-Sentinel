"""
Test script to diagnose GitHub repo visibility and test Updater flow.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.publish_github_release import make_request, get_token

def test():
    token = get_token()
    print("Token found. Checking repo status...")
    repo = make_request("https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel")
    print(f"Repo name: {repo.get('full_name')}")
    print(f"Is Private: {repo.get('private')}")
    print(f"Default branch: {repo.get('default_branch')}")

    releases = make_request("https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases")
    print(f"Total releases found: {len(releases)}")
    for r in releases:
        print(f"- Tag: {r.get('tag_name')}, Name: {r.get('name')}, Assets: {len(r.get('assets', []))}")
        for a in r.get('assets', []):
            print(f"    * Asset: {a.get('name')} ({a.get('size') / 1024 / 1024:.2f} MB) -> {a.get('browser_download_url')}")

    # Check /releases/latest with token
    try:
        latest = make_request("https://api.github.com/repos/MortuisVMain/Twitch-Drops-Sentinel/releases/latest")
        print(f"Latest release with auth: {latest.get('tag_name')}, Assets: {len(latest.get('assets', []))}")
    except Exception as e:
        print(f"Error checking latest with auth: {e}")

if __name__ == "__main__":
    test()
