# 083. DPAPI fails closed; the cookie jar stays pickle

## Context
An external audit (Nov 2026) flagged `core/dpapi.py`: when `CryptProtectData` failed, `protect_bytes` returned the plain data (logged at debug only), so `cookies.jar` with the Twitch `auth-token` was silently written as plaintext. It also flagged `pickle.loads` on the jar.

## Decision
- `protect_bytes` raises `DpapiError` on a failed or empty result or an exception, and logs at ERROR. Off Windows it returns the data as before and warns once.
- `save_cookie_jar` catches it, writes nothing, keeps the previous file and returns False; the service keeps running and the next save tries again.
- `core/webhooks.py` seals before any write, so a DPAPI failure there returns HTTP 500 and writes nothing.
- Loading is unchanged: `DPAPI1:` files and old plaintext jars still load.
- The pickle format stays. aiohttp's `CookieJar.save/load` is pickle; moving to another format would log every user out on update. The file is in the user's own profile, so reaching `pickle.loads` already needs code running as that user.

## Applicability
Any new secret written to disk goes through `protect_bytes` and must handle `DpapiError` as "don't write this time", never as "write it plain".
