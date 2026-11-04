"""Who may talk to the local service. CORS alone only decides what a page may read, not what it may trigger."""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlsplit

APP_ORIGIN = "https://app.sentinel"  # the WebView2 virtual host
LOOPBACK_HOSTS = {"127.0.0.1", "localhost"}


def origin_allowed(origin: Optional[str]) -> bool:
    """No Origin means no browser page: the desktop shell and local tools. Browsers send it on every POST and on CORS reads."""
    if origin is None:
        return True
    if origin == APP_ORIGIN:
        return True
    try:
        parsed = urlsplit(origin)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and (parsed.hostname or "") in LOOPBACK_HOSTS


def host_allowed(host: Optional[str]) -> bool:
    """A foreign Host means a site rebound its own name to this address."""
    if not host:
        return False
    try:
        return (urlsplit(f"//{host}").hostname or "").lower() in LOOPBACK_HOSTS
    except ValueError:
        return False
