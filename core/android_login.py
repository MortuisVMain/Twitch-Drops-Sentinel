"""Sign-in with the Android app client (the twitch.tv implicit grant, as upstream does since 2026-10-25).

The TV client's device-code login gets an empty ViewerDropsDashboard from Twitch, so the full campaign list needs a token issued
for the ANDROID_APP client id. A token only works with the client id it was issued for: the cookie jar holds it under
ClientType.ANDROID_APP.CLIENT_URL (www.twitch.tv), the TV login keeps its token under android.tv.twitch.tv, so the jar alone says
which client the saved login belongs to. The token is never logged and never part of an error message.
"""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any

import aiohttp

from constants import ClientInfo, ClientType
from dpapi import save_cookie_jar

logger = logging.getLogger("TwitchDrops")

VALIDATE_URL = "https://id.twitch.tv/oauth2/validate"
TOKEN_COOKIE = "auth-token"
_TOKEN_RE = re.compile(r"[A-Za-z0-9]{20,100}")  # Twitch tokens are 30 characters; upstream matches \w+


class TokenError(Exception):
    """The android token could not be used; the message is safe to show."""


class TokenRejected(TokenError):
    """Twitch says the token is invalid or was issued for another client."""


class TokenCheckFailed(TokenError):
    """Twitch could not be asked (network, server error): the token may still be good."""


class CookieSaveFailed(TokenError):
    """The cookie file could not be written (DPAPI failed closed): nothing was changed."""


async def validate_android_token(
    token: Any, session: aiohttp.ClientSession, *, url: str = VALIDATE_URL, proxy: str | None = None
) -> dict[str, Any]:
    """Asks id.twitch.tv who the token belongs to; only a token of the ANDROID_APP client passes. Returns {"user_id", "login"}."""
    if not isinstance(token, str) or not _TOKEN_RE.fullmatch(token):
        raise TokenRejected("The token has an unexpected shape")
    try:
        req_kwargs: dict[str, Any] = {"headers": {"Authorization": f"OAuth {token}"}}
        if proxy:
            req_kwargs["proxy"] = proxy
        async with session.get(url, **req_kwargs) as response:
            if response.status in (400, 401, 403):
                raise TokenRejected("Twitch did not accept the token")
            if response.status != 200:
                raise TokenCheckFailed(f"Twitch answered {response.status} to the token check")
            body = await response.json()
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
        raise TokenCheckFailed(f"The token check failed: {type(err).__name__}") from None
    if not isinstance(body, dict) or body.get("client_id") != ClientType.ANDROID_APP.CLIENT_ID:
        raise TokenRejected("The token was issued for another Twitch client")
    try:
        user_id = int(body["user_id"])
    except (KeyError, TypeError, ValueError):
        raise TokenRejected("Twitch did not name the account of the token") from None
    return {"user_id": user_id, "login": str(body.get("login") or "")}


def apply_android_token(jar: aiohttp.CookieJar, token: str) -> None:
    """Makes the jar hold exactly this login: the old account's cookies are dropped, the token sits under the android client's URL."""
    jar.clear()
    jar.update_cookies({TOKEN_COOKIE: token}, response_url=ClientType.ANDROID_APP.CLIENT_URL)


def client_for_jar(jar: aiohttp.CookieJar) -> ClientInfo:
    """The client a saved login belongs to (a guess; the token check corrects it): TV when its token is in the jar, else ANDROID_APP
    when the android token is, else TV (the default). A device-code jar also holds auth-token for the whole twitch.tv domain,
    which www.twitch.tv sees, so the TV token is looked for first."""
    if TOKEN_COOKIE in jar.filter_cookies(ClientType.SMARTBOX.CLIENT_URL):
        return ClientType.SMARTBOX
    if TOKEN_COOKIE in jar.filter_cookies(ClientType.ANDROID_APP.CLIENT_URL):
        return ClientType.ANDROID_APP
    return ClientType.SMARTBOX


async def sign_in_with_token(
    token: Any, session: aiohttp.ClientSession, live_jar: aiohttp.CookieJar, cookies_path: Path, *, proxy: str | None = None
) -> dict[str, Any]:
    """Validates the token, writes it to the cookie file, then switches the running session's jar to it.

    The file comes first: when it cannot be written (DPAPI fails closed) the running session is left as it was.
    """
    info = await validate_android_token(token, session, proxy=proxy)
    saved = aiohttp.CookieJar()
    apply_android_token(saved, token)
    if not save_cookie_jar(saved, cookies_path):
        raise CookieSaveFailed("The login could not be saved safely (Windows data protection failed)")
    apply_android_token(live_jar, token)
    logger.info("Android client login stored, user ID: %s", info["user_id"])
    return info


def auth_client_name(twitch_client: Any) -> str | None:
    """"android" or "tv" for /api/state and the health view; None while there is no client yet."""
    client = getattr(twitch_client, "_client_type", None)
    if client is None:
        return None
    return "android" if client is ClientType.ANDROID_APP else "tv"
