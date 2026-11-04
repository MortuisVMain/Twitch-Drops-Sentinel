"""What the Giveaways tab still needs before it can work. Only looks: installing and signing in are separate actions."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import aiohttp

import giveaways_controller as gc

logger = logging.getLogger("sentinel.giveaways")

SITE_TIMEOUT_SECONDS = 5.0
NODE_DOWNLOAD_URL = "https://nodejs.org"
STORE_SITES: Dict[str, str] = {
    "epic": "https://store.epicgames.com/",
    "gog": "https://www.gog.com/",
    "steam": "https://store.steampowered.com/",
    "fab": "https://www.fab.com/",
    "unity": "https://assetstore.unity.com/",
    "itch": "https://itch.io/",
    "prime": "https://gaming.amazon.com/",
}


def _item(item_id: str, status: str, params: Optional[dict] = None, action: Optional[dict] = None, store: Optional[str] = None) -> dict:
    """status: ok | todo (blocks work, counted in `remaining`) | warning | info (optional, not set up)."""
    item: dict = {"id": item_id, "status": status, "params": params or {}, "action": action}
    if store:
        item["store"] = store
    return item


async def _node_item() -> Tuple[dict, bool]:
    required = {"required": gc.MIN_NODE_MAJOR}
    action = {"kind": "open_url", "url": NODE_DOWNLOAD_URL}
    node = gc.shutil.which("node")
    if node is None or gc.shutil.which("npm") is None:
        return _item("node", "todo", {"reason": "missing", "version": None, **required}, action), False
    try:
        version = await gc.read_node_version(node)
    except (OSError, asyncio.TimeoutError) as e:
        logger.warning(f"Readiness: cannot read the Node.js version: {type(e).__name__}: {e}")
        return _item("node", "todo", {"reason": "unreadable", "version": None, **required}, action), False
    major = gc.node_major(version)
    if major is None or major < gc.MIN_NODE_MAJOR:
        return _item("node", "todo", {"reason": "old", "version": version or None, **required}, action), False
    return _item("node", "ok", {"reason": None, "version": version, **required}), True


def _browser_found() -> Optional[str]:
    """The browsers the engine tries, in its order; Chromium is what `patchright install` downloads."""
    roots = [os.environ.get(k) for k in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")]
    for name, relative in (("chrome", Path("Google/Chrome/Application/chrome.exe")), ("edge", Path("Microsoft/Edge/Application/msedge.exe"))):
        if any(root and (Path(root) / relative).is_file() for root in roots):
            return name
    local = os.environ.get("LOCALAPPDATA")
    if local and any((Path(local) / "ms-playwright").glob("chromium-*")):
        return "chromium"
    return None


def _selection() -> Tuple[List[str], Optional[str]]:
    """Stores a run would claim and why there are none: mirrors readScheduledStores in giveaways_engine/runner.js."""
    try:
        config = json.loads(gc.CONFIG_FILE.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return list(gc.DEFAULT_CLAIM_STORES), None
    except (OSError, ValueError) as e:
        logger.warning(f"Readiness: cannot read {gc.CONFIG_FILE}: {type(e).__name__}: {e}")
        return [], "config_broken"
    if not isinstance(config, dict):
        return [], "config_broken"
    if config.get("giveaways_enabled") is False:
        return [], "disabled"
    if "giveaways_selected_stores" not in config:
        return list(gc.DEFAULT_CLAIM_STORES), None
    selected = config["giveaways_selected_stores"]
    if not isinstance(selected, list):
        return [], "config_broken"
    known = list(dict.fromkeys(s for s in selected if isinstance(s, str) and s in gc.STORE_FILE_MAP))
    return known, (None if known else "none_selected")


async def _site_reachable(session: aiohttp.ClientSession, url: str) -> bool:
    """Any answer counts, a 403 from bot protection included: the question is whether the site can be reached."""
    try:
        async with session.head(url, allow_redirects=False):
            return True
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        logger.info(f"Readiness: {url} is not reachable: {type(e).__name__}: {e}")
        return False


async def _site_items(stores: List[str]) -> List[dict]:
    timeout = aiohttp.ClientTimeout(total=SITE_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout, trust_env=True) as session:
        answers = await asyncio.gather(*(_site_reachable(session, STORE_SITES[s]) for s in stores), return_exceptions=True)
    items = []
    for store, answer in zip(stores, answers):
        if isinstance(answer, Exception):
            logger.warning(f"Readiness: the check of {store} failed: {type(answer).__name__}: {answer}")
        items.append(_item("site", "ok" if answer is True else "warning", store=store))
    return items


def _scheduler_item(sched: dict) -> dict:
    log_file = sched.get("logFile")
    if sched.get("queryFailed"):
        return _item("scheduler", "warning", {"reason": "query_failed"})
    if sched.get("repairError"):
        return _item("scheduler", "warning", {"reason": "repair_failed", "error": sched["repairError"]})
    if not sched.get("exists"):
        return _item("scheduler", "info", {"reason": "not_created"}, {"kind": "enable_scheduler"})
    params = {"lastRunTime": sched.get("lastRunTime"), "nextRunTime": sched.get("nextRunTime"),
              "activeDays": sched.get("activeDays"), "logFile": log_file}
    if sched.get("lastRunFailed"):
        return _item("scheduler", "warning", {"reason": "last_run_failed", **params})
    return _item("scheduler", "ok", {"reason": None, **params})


async def check_readiness(orchestrator: gc.GiveawaysOrchestrator, full: bool = True) -> dict:
    """full=False is the quick check: no store site is asked and the Task Scheduler answer may come from the 2 minute cache."""
    fgc_dir = gc.resolve_fgc_root()
    module_ok = (fgc_dir / "runner.js").is_file()
    engine_ok = gc.engine_installed(fgc_dir)
    stores, selection_problem = await asyncio.to_thread(_selection)

    (node_item, node_ok), sched, (store_meta, _), browser, site_items = await asyncio.gather(
        _node_item(),
        orchestrator._query_scheduler(force=full),
        asyncio.to_thread(orchestrator._read_inventory_sync, True),
        asyncio.to_thread(_browser_found),
        _site_items(stores) if full else asyncio.sleep(0, result=[]),
    )

    selection_action = {"kind": "enable_giveaways"} if selection_problem == "disabled" else None
    items = [
        _item("module", "ok" if module_ok else "todo", {"path": str(fgc_dir)}),
        node_item,
        _item("engine", "ok" if engine_ok else "todo", action=({"kind": "install_engine"} if node_ok and not engine_ok else None)),
        _item("browser", "ok" if browser else "warning", {"found": browser}),
        _item("selection", "todo" if selection_problem else "ok", {"reason": selection_problem, "stores": stores}, selection_action),
    ]
    for store in stores:
        meta = store_meta.get(store) or {}
        account = meta.get("account")
        if account:
            items.append(_item("login", "ok", {"account": account, "confirmedAt": meta.get("loginConfirmedAt")}, store=store))
        else:
            items.append(_item("login", "todo", action={"kind": "sign_in", "store": store}, store=store))
    items.extend(site_items)
    items.append(_scheduler_item(sched))

    remaining = sum(item["status"] == "todo" for item in items)
    return {
        "ready": remaining == 0,
        "remaining": remaining,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "full": full,
        "engineInstall": orchestrator.engine_install_state(),
        "items": items,
    }
