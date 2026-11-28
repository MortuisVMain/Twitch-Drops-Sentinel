"""A drop Twitch confirmed as claimed stays claimed after a restart: linked-account campaigns keep reporting isClaimed=false,
so without a saved list every start claimed, announced and journaled the same drops again (live log 2026-11-27: one Star Citizen
drop journaled 40+ times)."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import inventory
import twitch
from inventory import DropsCampaign
from settings import Settings
from test_reward_progress import Args


def payload(camp_id="sc", drop_id="sc_drop"):
    return {
        "id": camp_id, "name": "IAE", "status": "ACTIVE", "self": {"isAccountConnected": True},
        "game": {"id": 7, "displayName": "Star Citizen"},
        "startAt": "2026-11-10T02:00:00Z", "endAt": "2099-01-01T00:00:00Z",
        "timeBasedDrops": [{
            "id": drop_id, "name": "Undersuit", "requiredMinutesWatched": 60,
            "startAt": "2026-11-10T02:00:00Z", "endAt": "2099-01-01T00:00:00Z",
            "benefitEdges": [{"benefit": {"id": drop_id + "_b", "name": "Undersuit", "distributionType": "DIRECT_ENTITLEMENT"}}],
            "self": {"currentMinutesWatched": 60, "dropInstanceID": f"u#{camp_id}#{drop_id}", "isClaimed": False},
        }],
    }


class ClaimedDropsSurviveARestart(unittest.TestCase):
    def setUp(self):
        tmp = Path(tempfile.mkdtemp(prefix="claimed_drops_"))
        self.addCleanup(shutil.rmtree, tmp, True)
        self.store = tmp / "claimed_drops.json"
        patches = [mock.patch.object(inventory, "CLAIMED_STORE", self.store),
                   mock.patch.object(inventory, "_CONFIRMED_CLAIMED_DROPS", set()),
                   mock.patch.object(inventory, "_RECORDED_CLAIMS", set())]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.engine = twitch.Twitch(Settings(Args()))
        self.engine.print = lambda *a, **k: None

    def drop(self):
        return DropsCampaign(self.engine, payload(), {}).timed_drops["sc_drop"]

    def test_a_confirmed_claim_is_saved_and_the_next_start_sees_the_drop_as_claimed(self):
        d = self.drop()
        d._claim = mock.AsyncMock(return_value=inventory.CLAIM_NEW)
        with mock.patch("notifications.NOTIFIER.notify", return_value=True), mock.patch("builtins.open", mock.mock_open()):
            self.assertTrue(asyncio.run(d.claim()))
        self.assertIn("sc_drop", inventory.load_claimed_drops(self.store))
        # a restart: the in-memory sets are empty again, only the file is left
        with mock.patch.object(inventory, "_CONFIRMED_CLAIMED_DROPS", inventory.load_claimed_drops(self.store)):
            again = self.drop()
            self.assertTrue(again.is_claimed)
            self.assertFalse(again.can_claim)

    def test_a_save_keeps_ids_another_process_wrote_meanwhile(self):
        self.store.write_text('["written_by_the_other_copy"]', encoding="utf-8")
        inventory._remember_claimed("mine")
        self.assertEqual(inventory.load_claimed_drops(self.store), {"written_by_the_other_copy", "mine"})

    def test_a_failed_claim_is_not_saved(self):
        d = self.drop()
        d._claim = mock.AsyncMock(return_value=None)
        self.assertFalse(asyncio.run(d.claim()))
        self.assertEqual(inventory.load_claimed_drops(self.store), set())

    def test_a_missing_or_broken_file_means_nothing_is_known(self):
        self.assertEqual(inventory.load_claimed_drops(self.store), set())
        self.store.write_text("{not json", encoding="utf-8")
        with self.assertLogs("TwitchDrops", level="WARNING"):
            self.assertEqual(inventory.load_claimed_drops(self.store), set())


if __name__ == "__main__":
    unittest.main()
