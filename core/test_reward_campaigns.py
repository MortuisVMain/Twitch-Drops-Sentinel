"""Reward campaigns: the parser, the per-call request variable and the setting helpers. Synthetic data only.

Run: python -m unittest test_reward_campaigns   (from the core folder)
"""
from __future__ import annotations

import logging
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

import reward_campaigns as rc
from constants import GQL_QUERIES

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)
LOGGER_NAME = "TwitchDrops.RewardCampaigns"


def dashboard(*entries, key="rewardCampaignsAvailableToUser"):
    return {"data": {"currentUser": {"dropCampaigns": []}, key: list(entries)}}


def full_entry(**over):
    entry = {
        "id": "rc-1",
        "name": "Synthetic Launch Celebration",
        "brand": "Example Brand",
        "startsAt": "2026-11-01T00:00:00Z",
        "endsAt": "2026-12-31T23:59:00Z",
        "status": "ACTIVE",
        "summary": "Watch and get a thing.",
        "instructions": "Do the steps.",
        "externalURL": "https://example.test/promo",
        "aboutURL": "https://example.test/about",
        "isSitewide": False,
        "game": {"id": "g1", "displayName": "Synthetic Game"},
        "image": {"image1xURL": "https://cdn.example.test/banner.png"},
        "rewards": [
            {
                "id": "r1",
                "name": "Synthetic Skin",
                "bannerImage": {"image1xURL": "https://cdn.example.test/skin-banner.png"},
                "thumbnailImage": {"image1xURL": "https://cdn.example.test/skin.png"},
                "earnableUntil": "2026-12-30T00:00:00Z",
                "redemptionInstructions": "ignored",
                "redemptionURL": "https://example.test/redeem",
            }
        ],
        "unlockRequirement": {"subsGoal": 1, "minuteWatchedGoal": 30},
    }
    entry.update(over)
    return entry


def parse(*entries, **kw):
    return rc.parse_reward_campaigns(dashboard(*entries), now=NOW, **kw)


class ParseTests(unittest.TestCase):
    def setUp(self):
        rc._reset_missing_key_note()

    def test_full_entry_keeps_only_what_the_page_needs(self):
        got = parse(full_entry())
        self.assertEqual(got, [{
            "id": "rc-1",
            "name": "Synthetic Launch Celebration",
            "brand": "Example Brand",
            "startsAt": "2026-11-01T00:00:00Z",
            "endsAt": "2026-12-31T23:59:00Z",
            "summary": "Watch and get a thing.",
            "instructions": "Do the steps.",
            "url": "https://example.test/promo",
            "game": "Synthetic Game",
            "image": "https://cdn.example.test/banner.png",
            "rewards": [{"name": "Synthetic Skin", "image": "https://cdn.example.test/skin.png",
                         "earnableUntil": "2026-12-30T00:00:00Z"}],
            "minutesGoal": 30,
            "subsGoal": 1,
            "sitewide": False,
            "groups": [{"goalKind": "watch", "minutes": 30, "subs": 1,
                        "rewards": [{"name": "Synthetic Skin", "image": "https://cdn.example.test/skin.png",
                                     "earnableUntil": "2026-12-30T00:00:00Z"}]}],
        }])

    def test_minimal_entry_fills_every_field(self):
        got = parse({"id": "x", "name": "Only a name"})
        self.assertEqual(got, [{
            "id": "x", "name": "Only a name", "brand": None, "startsAt": None, "endsAt": None, "summary": None,
            "instructions": None, "url": None, "game": None, "image": None, "rewards": [],
            "minutesGoal": None, "subsGoal": None, "sitewide": False, "groups": [],
        }])

    def test_entries_without_id_or_name_are_skipped(self):
        got = parse({"name": "no id"}, {"id": "no-name"}, {"id": "", "name": "x"}, {"id": "ok", "name": "  "},
                    {"id": 7, "name": "int id"}, {"id": "good", "name": "Good"})
        self.assertEqual([c["id"] for c in got], ["good"])

    def test_http_urls_are_rejected(self):
        got = parse(full_entry(externalURL="http://example.test/p", aboutURL="http://example.test/a",
                               image={"image1xURL": "http://cdn.example.test/b.png"},
                               rewards=[{"name": "R", "thumbnailImage": {"image1xURL": "http://cdn.example.test/t.png"}}]))
        self.assertIsNone(got[0]["url"])
        self.assertIsNone(got[0]["image"])
        self.assertIsNone(got[0]["rewards"][0]["image"])

    def test_url_falls_back_from_external_to_about_and_rejects_other_schemes(self):
        self.assertEqual(parse(full_entry(externalURL="http://example.test/p"))[0]["url"], "https://example.test/about")
        self.assertIsNone(parse(full_entry(externalURL="javascript:alert(1)", aboutURL="file:///c:/x"))[0]["url"])

    def test_reward_image_falls_back_to_banner(self):
        entry = full_entry(rewards=[{"name": "R", "bannerImage": {"image1xURL": "https://cdn.example.test/b.png"}}])
        self.assertEqual(parse(entry)[0]["rewards"][0]["image"], "https://cdn.example.test/b.png")

    def test_ended_campaign_is_dropped_future_and_unknown_end_are_kept(self):
        got = parse(full_entry(id="past", endsAt="2026-11-19T11:59:59Z"),
                    full_entry(id="exact", endsAt="2026-11-19T12:00:00+00:00"),
                    full_entry(id="future", endsAt="2026-11-19T12:00:01Z"),
                    full_entry(id="none", endsAt=None),
                    full_entry(id="odd", endsAt="soon"))
        self.assertEqual([c["id"] for c in got], ["future", "none", "odd"])
        self.assertIsNone(got[2]["endsAt"], "an end we cannot read is not shown as a date")

    def test_garbage_types_never_raise(self):
        garbage = [None, 5, "text", [], True, {"id": ["a"], "name": {"x": 1}}]
        for bad in garbage:
            with self.subTest(top=bad):
                self.assertEqual(rc.parse_reward_campaigns(bad, now=NOW), [])
                self.assertEqual(rc.parse_reward_campaigns({"data": bad}, now=NOW), [])
                self.assertEqual(rc.parse_reward_campaigns({"data": {"rewardCampaignsAvailableToUser": bad}}, now=NOW), [])
        got = parse(None, 7, "x", ["y"], full_entry(
            name="Odd fields", brand=5, summary=["a"], instructions={"a": 1}, game=[], image="not a dict",
            rewards="nope", unlockRequirement=[1], startsAt=12, endsAt=object()))
        self.assertEqual(len(got), 1)
        odd = got[0]
        self.assertEqual((odd["brand"], odd["summary"], odd["instructions"], odd["game"], odd["image"]), (None,) * 5)
        self.assertEqual((odd["rewards"], odd["minutesGoal"], odd["subsGoal"], odd["startsAt"], odd["endsAt"]), ([], None, None, None, None))

    def test_goals_must_be_positive_whole_numbers(self):
        for value in (0, -3, "30", 2.5, True, None):
            with self.subTest(value=value):
                got = parse(full_entry(unlockRequirement={"subsGoal": value, "minuteWatchedGoal": value}))
                self.assertEqual((got[0]["minutesGoal"], got[0]["subsGoal"]), (None, None))

    def test_goals_and_rewards_come_from_reward_groups_as_twitch_sends_them(self):
        groups = [
            {"unlockRequirements": {"subsGoal": 0, "minuteWatchedGoal": 60}, "rewards": [{"id": "g1", "name": "Watch chest"}]},
            {"unlockRequirements": {"subsGoal": 1, "minuteWatchedGoal": 0}, "rewards": [{"id": "g2", "name": "Sub chest"}]},
            "junk",
        ]
        got = parse(full_entry(unlockRequirement=None, unlockRequirements=None, rewards=[], rewardGroups=groups))[0]
        self.assertEqual((got["minutesGoal"], got["subsGoal"]), (60, 1))
        self.assertEqual([r["name"] for r in got["rewards"]], ["Watch chest", "Sub chest"])

    def test_bad_rewards_are_skipped_and_the_list_is_capped(self):
        rewards = [None, "x", {"id": "no name"}, {"name": "Good"}] + [{"name": f"R{i}"} for i in range(40)]
        got = parse(full_entry(rewards=rewards))[0]["rewards"]
        self.assertEqual(got[0]["name"], "Good")
        self.assertLessEqual(len(got), rc.REWARDS_PER_CAMPAIGN_LIMIT)

    def test_the_list_is_capped_at_fifty(self):
        got = parse(*[full_entry(id=f"c{i}", name=f"C{i}") for i in range(80)])
        self.assertEqual(len(got), 50)
        self.assertEqual(got[0]["id"], "c0")

    def test_long_text_is_trimmed(self):
        got = parse(full_entry(name="n" * 1000, summary="s" * 5000))[0]
        self.assertLessEqual(len(got["name"]), rc.NAME_LIMIT)
        self.assertLessEqual(len(got["summary"]), rc.TEXT_LIMIT)

    def test_missing_key_returns_empty_and_logs_once_at_info(self):
        with self.assertLogs(LOGGER_NAME, level="INFO") as first:
            self.assertEqual(rc.parse_reward_campaigns({"data": {"currentUser": {}}}, now=NOW), [])
        self.assertEqual(len(first.records), 1)
        self.assertEqual(first.records[0].levelno, logging.INFO)
        self.assertIn("rewardCampaignsAvailableToUser", first.output[0])
        with self.assertNoLogs(LOGGER_NAME, level="INFO"):
            rc.parse_reward_campaigns({"data": {}}, now=NOW)

    def test_an_empty_list_is_an_answer_not_a_missing_key(self):
        with self.assertNoLogs(LOGGER_NAME, level="INFO"):
            self.assertEqual(parse(), [])

    def test_skipped_entries_are_explained_at_debug(self):
        with self.assertLogs(LOGGER_NAME, level="DEBUG") as logs:
            parse({"name": "no id"}, full_entry(id="old", endsAt="2020-01-01T00:00:00Z"))
        text = "\n".join(logs.output)
        self.assertIn("no id", text)
        self.assertIn("ended", text)


class RequestTests(unittest.TestCase):
    def test_dashboard_query_asks_for_reward_campaigns_only_when_enabled(self):
        base = GQL_QUERIES["Campaigns"]
        on = rc.dashboard_query(base, True)
        off = rc.dashboard_query(base, False)
        self.assertIs(on["variables"]["fetchRewardCampaigns"], True)
        self.assertIs(off["variables"]["fetchRewardCampaigns"], False)
        self.assertEqual(on["operationName"], "ViewerDropsDashboard")
        self.assertEqual(on["extensions"], base["extensions"])

    def test_the_shared_query_constant_is_never_changed(self):
        base = GQL_QUERIES["Campaigns"]
        rc.dashboard_query(base, False)
        self.assertIs(base["variables"]["fetchRewardCampaigns"], True)
        self.assertIs(GQL_QUERIES["Inventory"]["variables"]["fetchRewardCampaigns"], False)

    def test_the_dashboard_request_is_the_one_twitch_web_sends(self):
        # captured from www.twitch.tv/drops/campaigns on 2026-11-27: 115 drop campaigns, 80 games for a live account;
        # the older hash c16bb890... with false came back almost empty (the third-party feed used to hide that)
        base = GQL_QUERIES["Campaigns"]
        self.assertEqual(base["extensions"]["persistedQuery"]["sha256Hash"],
                         "69750554e0a81492f2d343558f84bdf3e324767650a2dbb6e79a3c629b4548cf")
        self.assertIs(base["variables"]["fetchRewardCampaigns"], True)


class SettingTests(unittest.TestCase):
    def test_non_bool_values_are_dropped_with_a_warning(self):
        for bad in ("yes", 1, 0, None, [True]):
            with self.subTest(bad=bad):
                data = {"reward_campaigns_enabled": bad, "other": 1}
                with self.assertLogs(LOGGER_NAME, level="WARNING"):
                    rc.drop_invalid_setting(data)
                self.assertEqual(data, {"other": 1})

    def test_bools_and_absent_values_pass_quietly(self):
        for data in ({"reward_campaigns_enabled": True}, {"reward_campaigns_enabled": False}, {}):
            before = dict(data)
            with self.assertNoLogs(LOGGER_NAME, level="WARNING"):
                rc.drop_invalid_setting(data)
            self.assertEqual(data, before)

    def test_turning_it_off_clears_the_list_at_once(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=True, reward_campaigns=[{"id": "a"}])
        rc.apply_setting(bridge, {"reward_campaigns_enabled": False})
        self.assertEqual((bridge.reward_campaigns_enabled, bridge.reward_campaigns), (False, []))

    def test_turning_it_on_keeps_the_list_empty_until_a_fetch(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=False, reward_campaigns=[])
        rc.apply_setting(bridge, {"reward_campaigns_enabled": True})
        self.assertEqual((bridge.reward_campaigns_enabled, bridge.reward_campaigns), (True, []))

    def test_default_is_off(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=True, reward_campaigns=[{"id": "a"}])
        rc.apply_setting(bridge, {})
        self.assertEqual((bridge.reward_campaigns_enabled, bridge.reward_campaigns), (False, []))

    def test_state_list_is_empty_when_off_and_capped_when_on(self):
        listed = [{"id": str(i)} for i in range(70)]
        bridge = SimpleNamespace(reward_campaigns_enabled=True, reward_campaigns=listed)
        self.assertEqual(len(rc.state_list(bridge, {"reward_campaigns_enabled": True})), 50)
        self.assertEqual(rc.state_list(bridge, {"reward_campaigns_enabled": False}), [])
        self.assertEqual(rc.state_list(bridge, {}), [])

    def test_publish_is_ignored_when_the_setting_was_turned_off_meanwhile(self):
        bridge = SimpleNamespace(reward_campaigns_enabled=False, reward_campaigns=[])
        rc.publish(bridge, dashboard(full_entry()), now=NOW)
        self.assertEqual(bridge.reward_campaigns, [])
        bridge.reward_campaigns_enabled = True
        rc.publish(bridge, dashboard(full_entry()), now=NOW)
        self.assertEqual([c["id"] for c in bridge.reward_campaigns], ["rc-1"])


if __name__ == "__main__":
    unittest.main()
