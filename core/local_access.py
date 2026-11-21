"""Who may talk to the local service. CORS alone only decides what a page may read, not what it may trigger."""

from __future__ import annotations

import hmac
import os
from typing import Mapping, MutableMapping, Optional
from urllib.parse import urlsplit

API_TOKEN_ENV = "SENTINEL_API_TOKEN"  # set by the desktop host for each launch, never written to disk or the command line
TOKEN_HEADER = "X-Sentinel-Token"
TOKEN_QUERY_PATHS = frozenset({"/ws", "/api/v1/giveaways/stream"})  # WebSocket and EventSource cannot send headers
APP_ORIGIN = "https://app.sentinel"  # the WebView2 virtual host
LOOPBACK_HOSTS = {"127.0.0.1", "localhost"}
DEV_ORIGINS = {f"http://{host}:{port}" for host in LOOPBACK_HOSTS for port in (5173, 4173)}  # the Vite dev and preview servers


def origin_allowed(origin: Optional[str]) -> bool:
    """No Origin means no browser page: the desktop shell and local tools. Browsers send it on every POST and on CORS reads."""
    if origin is None:
        return True
    if origin == APP_ORIGIN:
        return True
    return origin in DEV_ORIGINS


def host_allowed(host: Optional[str]) -> bool:
    """A foreign Host means a site rebound its own name to this address."""
    if not host:
        return False
    try:
        return (urlsplit(f"//{host}").hostname or "").lower() in LOOPBACK_HOSTS
    except ValueError:
        return False


def take_api_token(environ: MutableMapping[str, str] = os.environ) -> Optional[str]:
    """Read the per-launch secret and remove it, so no child process (engine, helper) inherits it. None means the host set none."""
    return environ.pop(API_TOKEN_ENV, "") or None


def token_allowed(expected: Optional[str], path: str, headers: Mapping[str, str], query: Mapping[str, str]) -> bool:
    """No expected secret: nothing is required. Otherwise the header always counts, the query parameter only for the two streams."""
    if not expected:
        return True
    supplied = headers.get(TOKEN_HEADER)
    if supplied is None and path in TOKEN_QUERY_PATHS:
        supplied = query.get("token")
    if not supplied:
        return False
    return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))
