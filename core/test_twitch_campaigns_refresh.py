"""fetch_inventory rebuilds the campaign lookup channel.py reads, so campaigns that ended must not stay in it."""
import os as _os
_os.environ["SENTINEL_NO_BROWSER"] = "1"
import inspect
import unittest

import twitch


class CampaignLookupRefresh(unittest.TestCase):
    def test_campaign_lookup_is_cleared_with_the_inventory_before_it_is_refilled(self):
        src = inspect.getsource(twitch.Twitch.fetch_inventory)
        clear = src.find("self._campaigns.clear()")
        self.assertGreater(clear, 0, "fetch_inventory must clear self._campaigns")
        self.assertGreater(clear, src.find("self.inventory.clear()"))
        self.assertLess(clear, src.find("self._campaigns[campaign.id] = campaign"))


if __name__ == "__main__":
    unittest.main()
