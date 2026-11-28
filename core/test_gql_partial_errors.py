"""Twitch answers CampaignDetails of a streamer's own campaign with "service error" on the owner fields only (live 2026-11-28),
every other field filled. After the one retry such a field is nulled and the rest is used, as for "server error"; an error
without a path still fails."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import asyncio
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest import mock

import twitch
from constants import GQL_QUERIES


def answer(errors, owner=None):
    return {
        "data": {"user": {"dropCampaign": {"id": "c", "name": "Creator drops", "owner": owner,
                                          "timeBasedDrops": [{"id": "d", "requiredMinutesWatched": 60}]}}},
        "errors": errors,
        "extensions": {"operationName": "DropCampaignDetails"},
    }


def make(responses):
    tw = object.__new__(twitch.Twitch)
    tw._qgl_limiter = asyncio.Semaphore(1) if False else mock.MagicMock(__aenter__=mock.AsyncMock(), __aexit__=mock.AsyncMock(return_value=False))
    tw._client_type = twitch.ClientType.ANDROID_APP
    tw.get_auth = mock.AsyncMock(return_value=SimpleNamespace(headers=lambda **kw: {}))
    sent = []

    @asynccontextmanager
    async def request(method, url, json=None, headers=None):
        sent.append(json)
        body = responses.pop(0)
        yield SimpleNamespace(json=mock.AsyncMock(return_value=body))
    tw.request = request
    tw.sent = sent
    return tw


OWNER_ERRORS = [{"message": "service error", "path": ["user", "dropCampaign", "owner"]}]


class PartialServiceErrors(unittest.TestCase):
    def run_gql(self, tw):
        with mock.patch.object(twitch.asyncio, "sleep", mock.AsyncMock()):
            return asyncio.run(tw.gql_request(GQL_QUERIES["CampaignDetails"].with_variables({"channelLogin": "1", "dropID": "c"})))

    def test_a_field_error_that_survives_the_retry_nulls_that_field_and_keeps_the_rest(self):
        tw = make([answer(OWNER_ERRORS, owner={"x": 1}), answer(OWNER_ERRORS, owner={"x": 1})])
        result = self.run_gql(tw)
        camp = result["data"]["user"]["dropCampaign"]
        self.assertIsNone(camp["owner"])
        self.assertEqual(camp["timeBasedDrops"][0]["requiredMinutesWatched"], 60)
        self.assertEqual(len(tw.sent), 2, "one retry first")

    def test_an_error_without_a_path_still_fails(self):
        no_path = [{"message": "service error"}]
        tw = make([answer(no_path), answer(no_path)])
        with self.assertRaises(twitch.GQLException):
            self.run_gql(tw)

    def test_a_path_through_a_null_parent_does_not_crash(self):
        deep = [{"message": "service error", "path": ["user", "dropCampaign", "timeBasedDrops", 5, "benefitEdges", 0, "benefit", "ownerOrganization"]}]
        tw = make([answer(deep), answer(deep)])
        result = self.run_gql(tw)
        self.assertEqual(result["data"]["user"]["dropCampaign"]["name"], "Creator drops")


if __name__ == "__main__":
    unittest.main()
