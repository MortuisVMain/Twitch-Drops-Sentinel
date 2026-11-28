"""The ViewerDropsDashboard query (hash 69750554, 4.4.2) lists each campaign's timeBasedDrops as bare skeletons: id and minutes,
no name, benefits or dates. Merged over CampaignDetails with the dashboard first, the skeleton list won, so every campaign not
already in the inventory had drops without benefits that "cannot be earned" and nothing was farmed (live 2026-11-28: MARVEL SNAP,
World of Tanks, Albion Online)."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

import twitch

DASHBOARD = {
    "id": "snap", "name": "DRAFT", "status": "ACTIVE", "startAt": "2026-11-27T19:00:00Z", "endAt": "2099-01-01T00:00:00Z",
    "self": {"isAccountConnected": True}, "game": {"id": "1", "displayName": "MARVEL SNAP"},
    "timeBasedDrops": [{"id": "d1", "requiredMinutesWatched": 120, "requiredSubs": 0}],
}
DETAILS = {
    "id": "snap", "name": "DRAFT", "status": "ACTIVE", "startAt": "2026-11-27T19:00:00Z", "endAt": "2099-01-01T00:00:00Z",
    "self": {"isAccountConnected": True}, "game": {"id": "1", "name": "MARVEL SNAP"},
    "timeBasedDrops": [{"id": "d1", "name": "Draft Tickets", "requiredMinutesWatched": 120, "startAt": "2026-11-27T19:00:00Z",
                        "endAt": "2099-01-01T00:00:00Z", "preconditionDrops": None,
                        "benefitEdges": [{"benefit": {"id": "b1", "name": "Tickets", "distributionType": "DIRECT_ENTITLEMENT"}}]}],
}


class DetailsWinOverTheDashboardSkeleton(unittest.TestCase):
    def test_the_details_drops_replace_the_dashboard_skeleton(self):
        tw = object.__new__(twitch.Twitch)
        tw.get_auth = mock.AsyncMock(return_value=SimpleNamespace(user_id=5))
        tw.gql_request = mock.AsyncMock(return_value=[{"data": {"user": {"dropCampaign": DETAILS}}}])
        merged = asyncio.run(tw.fetch_campaigns([("snap", DASHBOARD)]))["snap"]
        drop = merged["timeBasedDrops"][0]
        self.assertEqual(drop.get("name"), "Draft Tickets")
        self.assertEqual(len(drop.get("benefitEdges") or []), 1)
        self.assertEqual(drop.get("startAt"), "2026-11-27T19:00:00Z")

    def test_a_none_on_one_side_takes_the_other_instead_of_failing_the_inventory(self):
        tw = object.__new__(twitch.Twitch)
        merged = tw._merge_data({"allow": None, "self": {"a": 1}}, {"allow": {"isEnabled": True}, "self": None})
        self.assertEqual(merged, {"allow": {"isEnabled": True}, "self": {"a": 1}})

    def test_a_campaign_whose_details_failed_keeps_the_dashboard_data(self):
        tw = object.__new__(twitch.Twitch)
        tw.get_auth = mock.AsyncMock(return_value=SimpleNamespace(user_id=5))
        tw.gql_request = mock.AsyncMock(return_value=[{"data": {"user": {"dropCampaign": None}}}])
        merged = asyncio.run(tw.fetch_campaigns([("snap", DASHBOARD)]))["snap"]
        self.assertEqual(merged["timeBasedDrops"], DASHBOARD["timeBasedDrops"])
        self.assertEqual(merged["game"]["displayName"], "MARVEL SNAP")


if __name__ == "__main__":
    unittest.main()
