"""The optional header tabs the user can turn off (setting `disabled_tabs`) and the rules that keep the value clean.

Giveaways has one source of truth, `giveaways_enabled`: an incoming `giveaways` entry is translated to it and is never stored here.
"""

from __future__ import annotations

import logging
from typing import Any, MutableMapping

logger = logging.getLogger(__name__)

OPTIONAL_TABS = ("shelf", "steamidle", "dimmer")  # also the stored order


def clean_disabled_tabs(value: Any) -> tuple[list[str], bool]:
    """Returns (known ids, deduplicated, in the fixed order; whether `giveaways` was asked off). Logs a warning for anything dropped."""
    if not isinstance(value, list):
        logger.warning("disabled_tabs must be a list, got %s: stored as an empty list", type(value).__name__)
        return [], False
    wanted = {item for item in value if isinstance(item, str)}
    giveaways_off = "giveaways" in wanted
    cleaned = [tab for tab in OPTIONAL_TABS if tab in wanted]
    dropped = [item for item in value if not (isinstance(item, str) and item in (*OPTIONAL_TABS, "giveaways"))]
    if dropped or len(value) != len(cleaned) + int(giveaways_off):
        logger.warning("disabled_tabs cleaned: %r -> %r (giveaways via giveaways_enabled: %s)", value, cleaned, giveaways_off)
    return cleaned, giveaways_off


def apply_disabled_tabs(settings: MutableMapping[str, Any]) -> None:
    """Cleans `disabled_tabs` in a settings dict in place, if the key is present; `giveaways` in it switches giveaways_enabled off."""
    if "disabled_tabs" not in settings:
        return
    cleaned, giveaways_off = clean_disabled_tabs(settings["disabled_tabs"])
    settings["disabled_tabs"] = cleaned
    if giveaways_off:
        settings["giveaways_enabled"] = False
