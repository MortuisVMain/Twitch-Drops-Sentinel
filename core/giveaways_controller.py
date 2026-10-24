"""
Free Games Claimer Orchestrator & Bridge Controller
Twitch Drops Sentinel v3 — Giveaways Integration Module
Architected by Argon Reasoning Engine & Mortuis_V_Studio
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from aiohttp import web

logger = logging.getLogger("sentinel.giveaways")

PROJECT_DIR = Path(__file__).resolve().parent.parent
LOCAL_FGC = PROJECT_DIR / "giveaways_engine"
DEV_FGC = Path(r"C:\AI Local Projects\Scripts\Free Games Claimer")

def resolve_fgc_root() -> Path:
    env_path = os.environ.get("FGC_PATH")
    if env_path and Path(env_path).is_dir():
        return Path(env_path)
    if LOCAL_FGC.is_dir() and (LOCAL_FGC / "ClaimGames.cmd").is_file():
        return LOCAL_FGC
    if DEV_FGC.is_dir() and (DEV_FGC / "ClaimGames.cmd").is_file():
        return DEV_FGC
    return LOCAL_FGC

FGC_ROOT = resolve_fgc_root()
DATA_DIR = FGC_ROOT / "data"
CMD_ENTRY = FGC_ROOT / "ClaimGames.cmd"
TASK_NAME = "FreeGamesClaimerStudio"

STORE_FILE_MAP: Dict[str, str] = {
    "epic": "epic-games.json",
    "gog": "gog.json",
    "steam": "steam.json",
    "fab": "fab.json",
    "unity": "unity.json",
    "itch": "itch.json",
    "prime": "prime-gaming.json",
}

STORE_DISPLAY_NAMES: Dict[str, str] = {
    "epic": "Epic Games",
    "gog": "GOG",
    "steam": "Steam",
    "fab": "Fab / Unreal Engine",
    "unity": "Unity Asset Store",
    "itch": "Itch.io",
    "prime": "Prime Gaming",
}

ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


class GiveawaysOrchestrator:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._active_stores: List[str] = []
        self._started_at: Optional[str] = None
        self._headless: bool = True
        self._aborting: bool = False

        self._log_buffer: deque[dict] = deque(maxlen=500)
        self._sse_queues: Set[asyncio.Queue] = set()

        self._file_mtimes: Dict[str, float] = {}
        self._cached_inventory: List[dict] = []
        self._cached_stores: Dict[str, dict] = {}
        self._scheduler_cache: Tuple[float, dict] = (0.0, {})

    def _broadcast(self, event_type: str, data: dict) -> None:
        payload = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        for q in list(self._sse_queues):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                self._sse_queues.discard(q)

    async def _query_scheduler(self, force: bool = False) -> dict:
        now = asyncio.get_event_loop().time()
        if not force and (now - self._scheduler_cache[0] < 15.0):
            return self._scheduler_cache[1]

        ps_script = (
            f"$t = Get-ScheduledTask -TaskName '{TASK_NAME}' -ErrorAction SilentlyContinue; "
            f"if ($t) {{ $i = Get-ScheduledTaskInfo -TaskName '{TASK_NAME}'; "
            f"@{{ exists=$true; state=$t.State.ToString(); "
            f"lastRun=if($i.LastRunTime){{$i.LastRunTime.ToString('o')}}else{{$null}}; "
            f"nextRun=if($i.NextRunTime){{$i.NextRunTime.ToString('o')}}else{{$null}}; "
            f"lastResult=$i.LastTaskResult }} | ConvertTo-Json -Compress }} "
            f"else {{ @{{ exists=$false; state='Unknown'; lastRun=$null; nextRun=$null; lastResult=$null }} | ConvertTo-Json -Compress }}"
        )
        try:
            proc = await asyncio.create_subprocess_exec(
                "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_script,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                creationflags=0x08000000  # CREATE_NO_WINDOW
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
            raw = json.loads(stdout.decode("utf-8", errors="replace").strip())
            result = {
                "taskName": TASK_NAME,
                "exists": bool(raw.get("exists")),
                "state": raw.get("state", "Unknown"),
                "lastRunTime": raw.get("lastRun"),
                "nextRunTime": raw.get("nextRun"),
                "lastTaskResult": raw.get("lastResult"),
            }
        except Exception as e:
            logger.debug(f"Scheduler query fallback: {e}")
            result = {
                "taskName": TASK_NAME,
                "exists": False,
                "state": "Unknown",
                "lastRunTime": None,
                "nextRunTime": None,
                "lastTaskResult": None,
            }

        self._scheduler_cache = (now, result)
        return result

    async def toggle_scheduler(self, enable: Optional[bool] = None) -> dict:
        sched = await self._query_scheduler(force=True)
        is_disabled = (sched.get("state") == "Disabled")
        target_enable = is_disabled if enable is None else bool(enable)
        cmd = "Enable-ScheduledTask" if target_enable else "Disable-ScheduledTask"
        ps_script = f"{cmd} -TaskName '{TASK_NAME}' -ErrorAction SilentlyContinue"
        try:
            proc = await asyncio.create_subprocess_exec(
                "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_script,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                creationflags=0x08000000
            )
            await asyncio.wait_for(proc.communicate(), timeout=5.0)
            logger.info(f"Task scheduler {TASK_NAME} set to: {'Enabled' if target_enable else 'Disabled'}")
        except Exception as e:
            logger.error(f"Error toggling scheduler task: {e}")
        return await self._query_scheduler(force=True)

    def _read_inventory_sync(self, force: bool = False) -> Tuple[Dict[str, dict], List[dict]]:
        fgc_dir = resolve_fgc_root()
        data_dir = fgc_dir / "data"
        changed = force
        current_mtimes: Dict[str, float] = {}
        for store, filename in STORE_FILE_MAP.items():
            fpath = data_dir / filename
            if fpath.is_file():
                mtime = fpath.stat().st_mtime
                current_mtimes[store] = mtime
                if self._file_mtimes.get(store) != mtime:
                    changed = True
            elif store in self._file_mtimes:
                changed = True

        if not changed and self._cached_stores:
            return self._cached_stores, self._cached_inventory

        inventory: List[dict] = []
        stores_meta: Dict[str, dict] = {}

        for store, filename in STORE_FILE_MAP.items():
            fpath = data_dir / filename
            claimed_cnt = 0
            existed_cnt = 0
            latest_ts = 0.0
            latest_iso: Optional[str] = None
            exists = fpath.is_file()
            accounts: List[str] = []

            if exists:
                try:
                    raw_text = fpath.read_text(encoding="utf-8")
                    data = json.loads(raw_text)
                    if isinstance(data, dict):
                        accounts = [acc for acc, g in data.items() if isinstance(g, dict)]
                        for account, games in data.items():
                            if not isinstance(games, dict):
                                continue
                            for slug, entry in games.items():
                                if not isinstance(entry, dict):
                                    continue
                                status = entry.get("status", "claimed")
                                if status == "claimed":
                                    claimed_cnt += 1
                                else:
                                    existed_cnt += 1

                                time_str = entry.get("time", "")
                                dt = None
                                for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                                    try:
                                        dt = datetime.strptime(time_str, fmt).replace(tzinfo=timezone.utc)
                                        break
                                    except ValueError:
                                        pass
                                if dt is None:
                                    dt = datetime.fromtimestamp(0, tz=timezone.utc)

                                ts_ms = int(dt.timestamp() * 1000)
                                iso_str = dt.isoformat()
                                if status == "claimed" and ts_ms > latest_ts:
                                    latest_ts = ts_ms
                                    latest_iso = iso_str

                                inventory.append({
                                    "id": f"{store}:{account}:{slug}",
                                    "store": store,
                                    "account": account,
                                    "slug": slug,
                                    "title": entry.get("title") or slug,
                                    "claimedAt": iso_str,
                                    "timestampMs": ts_ms,
                                    "url": entry.get("url", ""),
                                    "status": status if status in ("claimed", "existed") else "claimed",
                                })
                except (OSError, json.JSONDecodeError) as e:
                    logger.warning(f"Error reading FGC data file {fpath}: {e}")
                    if store in self._cached_stores:
                        return self._cached_stores, self._cached_inventory

            stores_meta[store] = {
                "store": store,
                "displayName": STORE_DISPLAY_NAMES.get(store, store.upper()),
                "claimedCount": claimed_cnt,
                "existedCount": existed_cnt,
                "lastClaimedAt": latest_iso,
                "dbFileExists": exists,
                "account": accounts[0] if accounts else None,
            }

        inventory.sort(key=lambda x: x["timestampMs"], reverse=True)
        self._file_mtimes = current_mtimes
        self._cached_stores = stores_meta
        self._cached_inventory = inventory
        return stores_meta, inventory

    def _get_latest_log_file(self) -> Optional[Path]:
        fgc_dir = resolve_fgc_root()
        if not fgc_dir.is_dir():
            return None
        logs = sorted(fgc_dir.glob("ClaimOutput_*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
        return logs[0] if logs else None

    async def get_state(self, force_refresh: bool = False) -> dict:
        fgc_dir = resolve_fgc_root()
        cmd_file = fgc_dir / "ClaimGames.cmd"
        scheduler = await self._query_scheduler(force=force_refresh)
        stores, inventory = await asyncio.to_thread(self._read_inventory_sync, force_refresh)

        if self._proc and self._proc.returncode is None:
            r_state = "aborting" if self._aborting else "running"
        elif scheduler.get("state") == "Running":
            r_state = "external_running"
        else:
            r_state = "idle"

        latest_log = await asyncio.to_thread(self._get_latest_log_file)
        return {
            "runner": {
                "state": r_state,
                "activeStores": self._active_stores if r_state in ("running", "aborting") else [],
                "pid": self._proc.pid if (self._proc and self._proc.returncode is None) else None,
                "startedAt": self._started_at if r_state in ("running", "aborting") else None,
                "headless": self._headless,
            },
            "scheduler": scheduler,
            "stores": stores,
            "inventory": inventory,
            "recentLogs": list(self._log_buffer),
            "lastLogFile": latest_log.name if latest_log else None,
            "fgcInstalled": cmd_file.is_file() or (fgc_dir / "runner.js").is_file(),
            "totalClaimed": sum(s.get("claimedCount", 0) for s in stores.values()),
        }

    async def start_claim(self, stores: List[str], headless: bool = True) -> dict:
        async with self._lock:
            fgc_dir = resolve_fgc_root()
            cmd_file = fgc_dir / "ClaimGames.cmd"
            if self._proc and self._proc.returncode is None:
                raise web.HTTPConflict(reason="Сбор раздач уже запущен.")
            sched = await self._query_scheduler(force=True)
            if sched.get("state") == "Running":
                raise web.HTTPConflict(reason="Системное задание 'FreeGamesClaimerStudio' сейчас активно в фоне.")
            runner_file = fgc_dir / "runner.js"
            if not runner_file.is_file() and not cmd_file.is_file():
                raise web.HTTPNotFound(reason=f"Модуль раздач не найден по пути {fgc_dir}")

            valid_stores = [s for s in stores if s in STORE_FILE_MAP]
            if not valid_stores:
                valid_stores = ["epic", "gog", "steam", "fab", "unity"]

            if runner_file.is_file():
                args = ["node", str(runner_file)]
            else:
                args = ["cmd.exe", "/c", str(cmd_file)]
            if headless:
                args.append("--headless")
            else:
                args.append("--show")
            args.append("--claim")
            args.extend(valid_stores)

            self._log_buffer.clear()
            self._active_stores = valid_stores
            self._headless = headless
            self._aborting = False
            self._started_at = datetime.now(timezone.utc).isoformat()

            # Auto-install browser dependencies if patchright is missing
            patchright_dir = fgc_dir / "node_modules" / "patchright"
            if not patchright_dir.is_dir():
                logger.warning("Giveaways browser engine missing. Executing automatic 'npm install'...")
                self._broadcast("log", {
                    "line": "[SENTINEL] Установка браузерного движка раздач (npm install)... Пожалуйста, подождите...",
                    "ts": datetime.now(timezone.utc).isoformat()
                })
                npm_proc = await asyncio.create_subprocess_exec(
                    "cmd.exe", "/c", "npm", "install",
                    cwd=str(fgc_dir),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    creationflags=0x08000000
                )
                if npm_proc.stdout:
                    async for raw_l in npm_proc.stdout:
                        l = raw_l.decode("utf-8", errors="replace").strip()
                        if l:
                            self._broadcast("log", {"line": f"[npm] {l}", "ts": datetime.now(timezone.utc).isoformat()})
                await npm_proc.wait()
                br_proc = await asyncio.create_subprocess_exec(
                    "cmd.exe", "/c", "npx", "patchright", "install", "chromium",
                    cwd=str(fgc_dir),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                    creationflags=0x08000000
                )
                await br_proc.wait()

            logger.info(f"Starting FGC claim run: stores={valid_stores}, headless={headless}")
            self._proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=str(fgc_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                creationflags=0x08000000  # CREATE_NO_WINDOW
            )
            self._broadcast("state", {"state": "running", "pid": self._proc.pid, "stores": valid_stores})
            asyncio.create_task(self._monitor_process(self._proc))
            return {"status": "started", "pid": self._proc.pid, "stores": valid_stores}

    async def _monitor_process(self, proc: asyncio.subprocess.Process) -> None:
        try:
            assert proc.stdout is not None
            async for raw_line in proc.stdout:
                line = ANSI_ESCAPE_RE.sub("", raw_line.decode("utf-8", errors="replace")).rstrip("\r\n")
                if line:
                    entry = {"line": line, "ts": datetime.now(timezone.utc).isoformat()}
                    self._log_buffer.append(entry)
                    self._broadcast("log", entry)
            await asyncio.wait_for(proc.wait(), timeout=1800.0)  # 30-min hard ceiling
        except asyncio.TimeoutError:
            logger.warning("FGC process exceeded 30-minute ceiling. Forcing tree abort.")
            await self.abort_claim()
        except Exception as e:
            logger.error(f"FGC process monitor error: {e}")
        finally:
            rc = proc.returncode
            logger.info(f"FGC process terminated with exit code {rc}")
            self._proc = None
            self._aborting = False
            # Invalidate cache to immediately show newly claimed games
            self._read_inventory_sync(force=True)
            self._broadcast("state", {"state": "idle", "exitCode": rc})

    async def abort_claim(self) -> dict:
        if not self._proc or self._proc.returncode is not None:
            return {"status": "not_running"}
        self._aborting = True
        pid = self._proc.pid
        logger.info(f"Aborting FGC process tree PID {pid} via taskkill...")
        self._broadcast("state", {"state": "aborting", "pid": pid})
        kill_proc = await asyncio.create_subprocess_exec(
            "taskkill.exe", "/F", "/T", "/PID", str(pid),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            creationflags=0x08000000
        )
        await kill_proc.wait()
        return {"status": "aborted", "pid": pid}

    async def handle_stream(self, request: web.Request) -> web.StreamResponse:
        resp = web.StreamResponse(
            status=200,
            reason="OK",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            },
        )
        await resp.prepare(request)
        queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._sse_queues.add(queue)

        try:
            # Send initial replay buffer
            for item in self._log_buffer:
                msg = f"event: log\ndata: {json.dumps(item, ensure_ascii=False)}\n\n"
                await resp.write(msg.encode("utf-8"))

            state_info = await self.get_state()
            init_state = f"event: state\ndata: {json.dumps(state_info['runner'], ensure_ascii=False)}\n\n"
            await resp.write(init_state.encode("utf-8"))

            while True:
                msg = await queue.get()
                await resp.write(msg.encode("utf-8"))
        except (asyncio.CancelledError, ConnectionResetError):
            pass
        finally:
            self._sse_queues.discard(queue)
        return resp
