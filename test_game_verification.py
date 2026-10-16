"""
Twitch Drops Sentinel v3.0 — Guaranteed Game Addition & Verification Test Gate
Mortuis_V_Studio
"""

import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent
CORE_DIR = WORKSPACE / "core"
sys.path.insert(0, str(CORE_DIR))

from campaigns_fetcher import CAMPAIGNS_FETCHER
from sentinel_service import normalize_game_name

def test_game_verification():
    print("Testing 3-Tier Game Verification Engine...")
    
    # 1. Active Drops Verification
    witcher_res = CAMPAIGNS_FETCHER.verify_game("Witcher")
    print("Witcher verification:", witcher_res)
    assert witcher_res["verified"] is True
    assert witcher_res["status"] == "ACTIVE_DROPS_NOW"
    assert "The Witcher 3" in witcher_res["canonical_name"]
    assert witcher_res["has_active_drops"] is True
    assert witcher_res["rewards_count"] > 0
    assert len(witcher_res["rewards"]) > 0

    # 2. Hunt: Showdown 1896 normalization & verification
    hunt_norm = normalize_game_name("hunt")
    print("Normalized 'hunt' ->", hunt_norm)
    assert hunt_norm == "Hunt: Showdown 1896"

    witcher_norm = normalize_game_name("witcher")
    print("Normalized 'witcher' ->", witcher_norm)
    assert witcher_norm == "The Witcher 3: Wild Hunt"

    poe_norm = normalize_game_name("poe2")
    print("Normalized 'poe2' ->", poe_norm)
    assert poe_norm == "Path of Exile 2"

    # 3. Game without active drops (e.g. Cyberpunk)
    cb_res = CAMPAIGNS_FETCHER.verify_game("Cyberpunk 2077")
    print("Cyberpunk verification:", cb_res)
    assert cb_res["has_active_drops"] is False

    # 4. Catalog sanity check
    catalog = CAMPAIGNS_FETCHER.get_catalog()
    assert len(catalog) > 50, f"Expected catalog > 50, got {len(catalog)}"
    has_drops_count = sum(1 for g in catalog if g.get("has_drops"))
    print(f"Total catalog games: {len(catalog)}, with active drops: {has_drops_count}")
    assert has_drops_count > 0, "Expected active drop campaigns in catalog"

    print("ALL VERIFICATION CHECKS PASSED [EXIT CODE 0]!")

if __name__ == "__main__":
    test_game_verification()
