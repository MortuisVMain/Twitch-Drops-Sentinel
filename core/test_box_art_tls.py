"""The cover resolver must keep TLS verification on (the app injects truststore for the system cert store)."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import box_art_resolver


class _Connector:
    """Records the kwargs of every TCPConnector built and still behaves like a connector for ClientSession."""
    calls: list = []

    def __init__(self, *args, **kwargs):
        type(self).calls.append(kwargs)
        self._real = box_art_resolver.aiohttp.connector.TCPConnector(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._real, name)


class BoxArtTlsTests(unittest.TestCase):
    def setUp(self):
        _Connector.calls = []

    def _assert_verified(self):
        self.assertEqual(len(_Connector.calls), 1)
        self.assertIsNot(_Connector.calls[0].get("ssl", True), False)

    def test_hydrate_keeps_tls_verification(self):
        tmp = Path(tempfile.mkdtemp(prefix="box_art_tls_"))
        with mock.patch.object(box_art_resolver, "CACHE_PATH", tmp / "cache.json"), \
                mock.patch.object(box_art_resolver, "INSTALLED_PATH", tmp / "none.json"), \
                mock.patch.object(box_art_resolver.aiohttp, "TCPConnector", _Connector):
            asyncio.run(box_art_resolver.hydrate_installed_games())
        self._assert_verified()

    def test_cover_keeper_keeps_tls_verification(self):
        keeper = mock.Mock(refresh=mock.AsyncMock(return_value=0))
        with mock.patch("cover_keeper.COVER_KEEPER", keeper), \
                mock.patch.object(box_art_resolver.aiohttp, "TCPConnector", _Connector):
            asyncio.run(box_art_resolver.keep_covers_alive([]))
        self._assert_verified()


if __name__ == "__main__":
    unittest.main()
