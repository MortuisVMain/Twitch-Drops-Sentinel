"""Transparent Windows DPAPI encryption for cookies.jar using ctypes (crypt32.dll)."""

from __future__ import annotations

import ctypes
import ctypes.wintypes
import json
import logging
import os
import pickle
from pathlib import Path
from typing import Any
from yarl import URL

logger = logging.getLogger("TwitchDrops")

DPAPI_MAGIC = b"DPAPI1:"
CRYPTPROTECT_UI_FORBIDDEN = 0x01
_warned_unprotected = False


class DpapiError(RuntimeError):
    """DPAPI could not protect the data; callers must not fall back to writing it in the clear."""


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def _make_blob(data: bytes) -> tuple[_DATA_BLOB, ctypes.Array[ctypes.c_char]]:
    buf = ctypes.create_string_buffer(data, len(data))
    blob = _DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    return blob, buf


def _read_and_free_blob(blob: _DATA_BLOB) -> bytes:
    try:
        if not blob.cbData or not blob.pbData:
            return b""
        return ctypes.string_at(blob.pbData, blob.cbData)
    finally:
        if blob.pbData:
            ctypes.windll.kernel32.LocalFree(blob.pbData)


def protect_bytes(data: bytes) -> bytes:
    """Encrypt bytes with Windows DPAPI (CurrentUser scope) and prefix with DPAPI_MAGIC.

    Raises DpapiError on Windows when encryption fails. Off Windows the data comes back unchanged (warned once).
    """
    global _warned_unprotected
    if not data:
        return data
    if os.name != "nt":
        if not _warned_unprotected:
            _warned_unprotected = True
            logger.warning("DPAPI is only available on Windows: secrets are stored without encryption")
        return data
    try:
        in_blob, _buf = _make_blob(data)
        out_blob = _DATA_BLOB()
        crypt32 = ctypes.windll.crypt32
        ok = crypt32.CryptProtectData(
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(out_blob),
        )
        if not ok:
            raise DpapiError(f"CryptProtectData failed (WinError {ctypes.GetLastError()})")
        encrypted = _read_and_free_blob(out_blob)
        if not encrypted:
            raise DpapiError("CryptProtectData returned an empty blob")
        return DPAPI_MAGIC + encrypted
    except DpapiError as exc:
        logger.error("DPAPI protect failed, refusing to fall back to plaintext: %s", exc)
        raise
    except Exception as exc:
        logger.error("DPAPI protect failed, refusing to fall back to plaintext: %s", exc, exc_info=True)
        raise DpapiError(str(exc)) from exc


def unprotect_bytes(data: bytes) -> bytes:
    """Decrypt DPAPI_MAGIC-prefixed bytes, or return plaintext bytes unchanged."""
    if not data.startswith(DPAPI_MAGIC):
        return data
    payload = data[len(DPAPI_MAGIC) :]
    if os.name != "nt" or not payload:
        return payload
    in_blob, _buf = _make_blob(payload)
    out_blob = _DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    ok = crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        CRYPTPROTECT_UI_FORBIDDEN,
        ctypes.byref(out_blob),
    )
    if not ok:
        raise RuntimeError("CryptUnprotectData failed to decrypt cookies.jar")
    return _read_and_free_blob(out_blob)


def load_cookie_jar(cookie_jar: Any, path: Path) -> None:
    """Load cookies from DPAPI-encrypted, JSON, or plaintext pickled cookie jar without mutating disk."""
    if not path.exists():
        return
    raw_bytes = path.read_bytes()
    data_bytes = unprotect_bytes(raw_bytes)
    clean_bytes = data_bytes.lstrip(b"\xef\xbb\xbf \t\r\n")
    if clean_bytes.startswith(b"{"):
        raw_cookies = json.loads(clean_bytes.decode("utf-8"))
        for domain, cookies_dict in raw_cookies.items():
            dom = domain.split("|")[0].lstrip(".").strip()
            if not dom:
                continue
            url = URL(f"https://{dom}")
            for name, cdata in cookies_dict.items():
                val = cdata.get("value", "") if isinstance(cdata, dict) else str(cdata)
                cookie_jar.update_cookies({name: val}, response_url=url)
    elif raw_bytes.startswith(DPAPI_MAGIC):
        loaded = pickle.loads(data_bytes)
        if isinstance(loaded, dict) and hasattr(cookie_jar, "_cookies"):
            cookie_jar._cookies.clear()
            cookie_jar._cookies.update(loaded)
    else:
        cookie_jar.load(path)


def save_cookie_jar(cookie_jar: Any, path: Path) -> bool:
    """Save aiohttp.CookieJar to disk encrypted with Windows DPAPI.

    Returns False when encryption failed: nothing is written and the previous file stays as it was.
    """
    raw_pickle = pickle.dumps(cookie_jar._cookies, pickle.HIGHEST_PROTOCOL)
    try:
        protected = protect_bytes(raw_pickle)
    except DpapiError:
        logger.error("cookies were not saved to %s this time, the previous file is kept", path)
        return False
    tmp_path = path.with_name(path.name + ".tmp")
    try:
        tmp_path.write_bytes(protected)
        os.replace(tmp_path, path)
        return True
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
