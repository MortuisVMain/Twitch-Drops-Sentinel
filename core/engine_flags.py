"""Saved switches of the Twitch engine: a new client starts with all of them on until it is told otherwise."""

from __future__ import annotations

from typing import Any, Mapping


def apply_engine_flags(client: Any, settings: Mapping[str, Any]) -> None:
    client.claim_channel_points_enabled = bool(settings.get("claim_channel_points", True))
    client.auto_claim_drops_enabled = bool(settings.get("auto_claim_drops", True))
    client.streamer_watchdog_enabled = bool(settings.get("streamer_watchdog_enabled", True))
