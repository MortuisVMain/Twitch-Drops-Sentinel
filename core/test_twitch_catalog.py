"""First-party campaigns catalog: Twitch dashboard + details -> the per-game list the catalog consumes. Synthetic data only.

Run: python -m unittest test_twitch_catalog   (from the core folder)
"""
from __future__ import annotations

import os
os.environ.setdefault("SENTINEL_NO_BROWSER", "1")

import json
import logging
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import campaigns_fetcher as cf
import twitch_catalog as tc

NOW = datetime.now(timezone.utc)


def iso(delta_days):
    return (NOW + timedelta(days=delta_days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def campaign(cid, game_id="100", game="Synthetic Quest", status="ACTIVE", start=-2, end=5, connected=True,
             link="", drops=(("Reward A", 60),), box="https://static-cdn.jtvnw.net/ttv-boxart/100-52x72.jpg"):
    return {
        "id": cid, "name": f"{game} campaign {cid}", "status": status,
        "startAt": iso(start), "endAt": iso(end),
        "game": {"id": game_id, "displayName": game, "boxArtURL": box},
        "self": {"isAccountConnected": connected},
        "accountLinkURL": link,
        "allow": {"channels": [{"id": "1", "name": "chan"}], "isEnabled": True},
        "timeBasedDrops": [{"id": f"{cid}-{i}", "name": n, "requiredMinutesWatched": m,
                            "benefitEdges": [{"benefit": {"id": "b", "name": n}}]} for i, (n, m) in enumerate(drops)],
    }


class BuildCatalogCampaigns(unittest.TestCase):
    def test_groups_campaigns_per_game_with_catalog_fields(self):
        out = tc.build_catalog_campaigns([
            campaign("c1", end=3, drops=(("Hat", 30), ("Coat", 90))),
            campaign("c2", end=9, connected=False, link="https://example.test/link"),
            campaign("c3", game_id="200", game="Other Game", box="https://x.test/art-{width}x{height}.jpg"),
        ])
        self.assertEqual([g["gameDisplayName"] for g in out], ["Synthetic Quest", "Other Game"])
        g = out[0]
        self.assertEqual(g["gameId"], "100")
        self.assertEqual(g["status"], "ACTIVE")
        self.assertEqual(g["startAt"], iso(-2))
        self.assertEqual(g["endAt"], iso(9), "the group ends with its latest campaign")
        self.assertFalse(g["isAccountConnected"], "one unlinked campaign makes the game unlinked")
        self.assertEqual(g["accountLinkURL"], "https://example.test/link")
        self.assertEqual(g["gameBoxArtURL"], "https://static-cdn.jtvnw.net/ttv-boxart/100-285x380.jpg")
        self.assertEqual(out[1]["gameBoxArtURL"], "https://x.test/art-285x380.jpg")
        self.assertEqual([r["id"] for r in g["rewards"]], ["c1", "c2"])
        r = g["rewards"][0]
        self.assertEqual(r["status"], "ACTIVE")
        self.assertEqual(r["endAt"], iso(3))
        self.assertEqual(r["game"]["displayName"], "Synthetic Quest")
        self.assertEqual(r["game"]["name"], "Synthetic Quest")
        self.assertTrue(r["allow"]["isEnabled"])
        self.assertEqual(r["self"], {"isAccountConnected": True})
        self.assertEqual(r["timeBasedDrops"], [
            {"id": "c1-0", "name": "Hat", "requiredMinutesWatched": 30},
            {"id": "c1-1", "name": "Coat", "requiredMinutesWatched": 90},
        ])

    def test_catalog_consumer_treats_the_result_as_active(self):
        out = tc.build_catalog_campaigns([campaign("c1")])
        self.assertTrue(cf.is_campaign_active_now(out[0]))

    def test_upcoming_only_game_is_not_active_and_mixed_game_is_active(self):
        out = tc.build_catalog_campaigns([
            campaign("u1", game_id="1", game="Soon", status="UPCOMING", start=3, end=9),
            campaign("a1", game_id="2", game="Mixed", status="ACTIVE", start=-1, end=4),
            campaign("u2", game_id="2", game="Mixed", status="UPCOMING", start=2, end=8),
        ])
        by = {g["gameDisplayName"]: g for g in out}
        self.assertEqual(by["Soon"]["status"], "UPCOMING")
        self.assertFalse(cf.is_campaign_active_now(by["Soon"]))
        self.assertEqual(by["Mixed"]["status"], "ACTIVE")
        self.assertTrue(cf.is_campaign_active_now(by["Mixed"]))

    def test_expired_and_broken_entries_are_dropped(self):
        broken_game = campaign("b1")
        broken_game["game"] = None
        out = tc.build_catalog_campaigns([
            campaign("e1", status="EXPIRED"), broken_game, "junk", None, {"id": "x"},
            campaign("ok"),
        ])
        self.assertEqual([r["id"] for g in out for r in g["rewards"]], ["ok"])

    def test_missing_self_falls_back_to_link_url(self):
        c = campaign("c1")
        del c["self"]
        self.assertTrue(tc.build_catalog_campaigns([c])[0]["isAccountConnected"])
        c["accountLinkURL"] = "https://example.test/link"
        self.assertFalse(tc.build_catalog_campaigns([c])[0]["isAccountConnected"])

    def test_empty_input(self):
        self.assertEqual(tc.build_catalog_campaigns([]), [])


class Publish(unittest.TestCase):
    class Recorder:
        def __init__(self):
            self.got = None

        def set_first_party(self, campaigns):
            self.got = campaigns

    def test_only_dashboard_campaigns_are_published(self):
        inventory = {"c1": campaign("c1"), "mine": campaign("mine", game_id="9", game="Inventory Only")}
        rec = self.Recorder()
        tc.publish_first_party(rec, inventory, {"c1"})
        self.assertEqual([g["gameDisplayName"] for g in rec.got], ["Synthetic Quest"])

    def test_failure_is_logged_and_never_raised(self):
        class Broken:
            def set_first_party(self, campaigns):
                raise RuntimeError("disk gone")

        with self.assertLogs("TwitchDropsSentinel.TwitchCatalog", level=logging.ERROR):
            tc.publish_first_party(Broken(), {"c1": campaign("c1")}, {"c1"})

    def test_fetch_inventory_publishes_after_details_merge(self):
        import inspect
        import twitch
        src = inspect.getsource(twitch.Twitch.fetch_inventory)
        merge = src.index("inventory_data = self._merge_data(inventory_data, chunk_campaigns_data)")
        publish = src.index("publish_first_party(")
        self.assertLess(merge, publish)


class FirstPartyPrecedence(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        tmp = Path(self.tmp.name)
        self._saved = (cf.DATA_DIR, cf.CACHE_FILE, cf.INSTALLED_GAMES_FILE, cf.BOX_ART_CACHE_FILE)
        cf.DATA_DIR, cf.CACHE_FILE = tmp, tmp / "active_campaigns_cache.json"
        cf.INSTALLED_GAMES_FILE, cf.BOX_ART_CACHE_FILE = tmp / "installed.json", tmp / "box.json"
        self.addCleanup(lambda: (setattr(cf, "DATA_DIR", self._saved[0]), setattr(cf, "CACHE_FILE", self._saved[1]),
                                 setattr(cf, "INSTALLED_GAMES_FILE", self._saved[2]), setattr(cf, "BOX_ART_CACHE_FILE", self._saved[3])))
        self.grouped = tc.build_catalog_campaigns([campaign("c1")])

    def test_set_first_party_publishes_catalog_and_persists_marked_cache(self):
        f = cf.CampaignsFetcher()
        self.assertEqual(f.catalog_source, "none")
        self.assertTrue(f.set_first_party(self.grouped))
        self.assertEqual(f.catalog_source, "twitch")
        self.assertEqual(f.get_raw_campaigns(), self.grouped)
        names = [g["name"] for g in f.get_catalog() if g.get("has_drops")]
        self.assertEqual(names, ["Synthetic Quest"])
        saved = json.loads(cf.CACHE_FILE.read_text(encoding="utf-8"))
        self.assertEqual(saved["source"], "twitch")
        self.assertIsInstance(saved["saved_at"], (int, float))
        self.assertEqual(saved["campaigns"], self.grouped)

    def test_first_party_cache_survives_restart_at_any_age_without_network(self):
        cf.CampaignsFetcher().set_first_party(self.grouped)
        old = NOW.timestamp() - 30 * 86400
        os.utime(cf.CACHE_FILE, (old, old))
        calls = []
        real = cf.urllib.request.urlopen
        cf.urllib.request.urlopen = lambda *a, **k: calls.append(a) or (_ for _ in ()).throw(AssertionError("network called"))
        try:
            f = cf.CampaignsFetcher()
            self.assertEqual(f.catalog_source, "twitch")
            self.assertEqual(f.sync_active_drops()["total_campaigns"], len(self.grouped))
        finally:
            cf.urllib.request.urlopen = real
        self.assertEqual(calls, [])

    def test_legacy_list_cache_is_ignored_and_logged_once(self):
        cf.CACHE_FILE.write_text(json.dumps([{"gameDisplayName": "Old", "rewards": []}]), encoding="utf-8")
        with self.assertLogs("TwitchDropsSentinel.CampaignsFetcher", level=logging.INFO) as logs:
            f = cf.CampaignsFetcher()
        self.assertEqual(sum("Ignoring a campaigns cache" in m for m in logs.output), 1)
        self.assertEqual(f.catalog_source, "none")
        self.assertEqual(f.get_raw_campaigns(), [])
        f.set_first_party(self.grouped)
        self.assertEqual(f.catalog_source, "twitch")
        self.assertEqual(f.get_raw_campaigns(), self.grouped)

    def test_empty_first_party_result_is_refused_and_logged(self):
        f = cf.CampaignsFetcher()
        with self.assertLogs("TwitchDropsSentinel.CampaignsFetcher", level=logging.WARNING):
            self.assertFalse(f.set_first_party([]))
        self.assertEqual(f.catalog_source, "none")


class CatalogTaskPerProcess(unittest.IsolatedAsyncioTestCase):
    """A crashed engine is replaced by a new Twitch client without shutdown(): its poller must not live on."""

    async def test_a_new_client_replaces_the_previous_clients_poller(self):
        import asyncio
        from unittest import mock
        import twitch

        async def idle(self):
            await asyncio.sleep(3600)

        def client():
            c = object.__new__(twitch.Twitch)
            c._catalog_refresher, c._catalog_task = None, None
            return c

        with mock.patch.object(twitch.Twitch, "_catalog_refresh_loop", idle):
            old, new = client(), client()
            old._start_catalog_refresh(None, {}, {})
            new._start_catalog_refresh(None, {}, {})
            await asyncio.sleep(0)
            self.assertTrue(old._catalog_task.cancelled() or old._catalog_task.cancelling())
            self.assertFalse(new._catalog_task.done())
            new._catalog_task.cancel()


class CatalogRefreshTests(unittest.IsolatedAsyncioTestCase):
    """Light background refresh: dashboard every tick, details only for ids not known yet."""

    def setUp(self):
        self.published = []

        class Fetcher:
            def set_first_party(inner, groups):
                self.published.append(groups)

        self.fetcher = Fetcher()
        self.dashboard_calls = 0
        self.detail_chunks = []
        self.dash = [campaign("a"), campaign("b"), campaign("x", status="EXPIRED")]

    async def request(self):
        self.dashboard_calls += 1
        return {"data": {"currentUser": {"dropCampaigns": self.dash}}}

    async def details(self, chunk):
        self.detail_chunks.append([cid for cid, _ in chunk])
        return {cid: dict(c, detailed=True) for cid, c in chunk}

    def test_skip_when_inventory_is_fresh(self):
        self.assertFalse(tc.should_refresh(1000.0, 1000.0 + 899))
        self.assertTrue(tc.should_refresh(1000.0, 1000.0 + 900))
        self.assertTrue(tc.should_refresh(None, 5.0))

    async def test_fresh_inventory_means_no_request_at_all(self):
        r = tc.CatalogRefresher(self.fetcher)
        r.note_inventory({"a": campaign("a")}, now=1000.0)
        self.assertFalse(await r.refresh(self.request, self.details, now=1100.0))
        self.assertEqual((self.dashboard_calls, self.detail_chunks, self.published), (0, [], []))

    async def test_only_unknown_live_ids_get_details(self):
        r = tc.CatalogRefresher(self.fetcher)
        r.note_inventory({"a": dict(campaign("a"), detailed=True)}, now=1000.0)
        self.assertTrue(await r.refresh(self.request, self.details, now=1000.0 + 901))
        self.assertEqual(self.dashboard_calls, 1)
        self.assertEqual(self.detail_chunks, [["b"]])
        rewards = [rw for g in self.published[-1] for rw in g["rewards"]]
        self.assertEqual(sorted(rw["id"] for rw in rewards), ["a", "b"])

    async def test_details_are_cached_between_ticks(self):
        r = tc.CatalogRefresher(self.fetcher)
        self.assertTrue(await r.refresh(self.request, self.details, now=0.0))
        self.assertTrue(await r.refresh(self.request, self.details, now=901.0))
        self.assertEqual(self.detail_chunks, [["a", "b"]])
        self.assertEqual(self.dashboard_calls, 2)

    async def test_details_are_chunked_by_twenty(self):
        self.dash = [campaign(f"c{i:02d}") for i in range(45)]
        r = tc.CatalogRefresher(self.fetcher)
        await r.refresh(self.request, self.details, now=0.0)
        self.assertEqual([len(c) for c in self.detail_chunks], [20, 20, 5])

    async def test_failure_keeps_old_catalog_and_waits_a_full_interval(self):
        r = tc.CatalogRefresher(self.fetcher)
        await r.refresh(self.request, self.details, now=0.0)
        before = list(self.published)

        async def boom():
            raise RuntimeError("gql down")

        with self.assertLogs("TwitchDropsSentinel.TwitchCatalog", level="ERROR"):
            self.assertFalse(await r.refresh(boom, self.details, now=901.0))
        self.assertEqual(self.published, before)
        self.assertFalse(tc.should_refresh(r.last_activity, 901.0 + 60), "a failing Twitch must not be retried every minute")
        self.assertTrue(tc.should_refresh(r.last_activity, 901.0 + 900))


if __name__ == "__main__":
    unittest.main()
