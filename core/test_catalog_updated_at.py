"""The shelf's "обновлено N назад" showed when the window last synced (12 h for a window left open), not the catalog's own age:
the state now carries the time the catalog was last built from Twitch data."""
import inspect
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import campaigns_fetcher as cf
import sentinel_service as s


class CatalogUpdatedAt(unittest.TestCase):
    def test_unknown_until_built_then_the_build_time(self):
        tmp = Path(tempfile.mkdtemp(prefix="catalog_at_"))
        self.addCleanup(shutil.rmtree, tmp, True)
        fetcher = object.__new__(cf.CampaignsFetcher)
        fetcher._last_fetch_time = 0
        self.assertIsNone(fetcher.catalog_updated_at)
        fetcher._cached_campaigns, fetcher._source = [], "none"
        fetcher._build_catalog = lambda: None
        with mock.patch.object(cf, "CACHE_FILE", tmp / "c.json"), mock.patch.object(cf.time, "time", return_value=1_800_000_000.0):
            fetcher.set_first_party([{"gameDisplayName": "G"}])
        self.assertEqual(fetcher.catalog_updated_at, 1_800_000_000.0)

    def test_the_state_carries_it(self):
        self.assertIn('"catalog_updated_at": CAMPAIGNS_FETCHER.catalog_updated_at', inspect.getsource(s.SentinelSupervisor.get_full_state))


if __name__ == "__main__":
    unittest.main()
