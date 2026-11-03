"""
Free Games Claimer Orchestrator & Bridge Controller
Twitch Drops Sentinel — giveaways integration
Architected by Argon Reasoning Engine & Mortuis_V_Studio
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from aiohttp import web

logger = logging.getLogger("sentinel.giveaways")

PROJECT_DIR = Path(__file__).resolve().parent.parent
LOCAL_FGC = PROJECT_DIR / "giveaways_engine"

def resolve_fgc_root() -> Path:
    env_path = os.environ.get("FGC_PATH")
    if env_path and Path(env_path).is_dir():
        return Path(env_path)
    if LOCAL_FGC.is_dir() and (LOCAL_FGC / "ClaimGames.cmd").is_file():
        return LOCAL_FGC
    return LOCAL_FGC

CONFIG_FILE = PROJECT_DIR / "config.json"
SCHEDULED_LOG = PROJECT_DIR / "giveaways_scheduled.log"
RUN_FAILED_MARK = "[SENTINEL] \u2715"  # runner.js ends the log of a failed run with such a line
RUN_DONE_MARK = "[SENTINEL] ■"  # runner.js ends every normal run with such a line; a log without it was cut off
RUN_LOG_FORMAT_MARK = "[SENTINEL] ◆"  # first line of a log by a runner that writes the line above; older logs lack both
RUN_LOG_CLOCK_SLACK_SECONDS = 2.0  # the log is touched after the scheduler stamps the start; file times are coarser than that
RUN_LOG_TAIL_BYTES = 4096
FGC_ROOT = resolve_fgc_root()
DATA_DIR = FGC_ROOT / "data"
CMD_ENTRY = FGC_ROOT / "ClaimGames.cmd"
TASK_NAME = "FreeGamesClaimerStudio"
SESSIONS_FILE = "sessions.json"  # store -> last login state the engine saw: {account, confirmedAt} or {account: null}

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
DAY_BITS: Dict[str, int] = {
    "Sunday": 1,
    "Monday": 2,
    "Tuesday": 4,
    "Wednesday": 8,
    "Thursday": 16,
    "Friday": 32,
    "Saturday": 64,
}

def bitmask_to_days(mask: Optional[int]) -> List[str]:
    if mask is None:
        return ["Tuesday", "Friday", "Sunday"]
    ordered = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return [d for d in ordered if (mask & DAY_BITS[d]) != 0]


FGC_RUN_CEILING_SECONDS = 1800.0  # hard limit for one claim run, including time spent without output
FGC_SETUP_CEILING_SECONDS = 900.0  # npm install / browser download
SCHEDULER_QUERY_TIMEOUT_SECONDS = 15.0  # the ScheduledTasks module alone can take seconds to load; a miss blocks writes
SCHEDULER_WRITE_TIMEOUT_SECONDS = 30.0
# A scheduled first run also installs the engine, hence the room above the run ceiling
TASK_TIME_LIMIT_SECONDS = int(FGC_RUN_CEILING_SECONDS + 2 * FGC_SETUP_CEILING_SECONDS)
TASK_DEFAULT_TIME = "13:30"
MIN_NODE_MAJOR = 20
NODE_VERSION_TIMEOUT_SECONDS = 10.0
DEFAULT_CLAIM_STORES = ["epic", "gog", "steam", "fab", "unity"]

ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def _ps_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _scheduler_refusal(error: type[web.HTTPException], detail: str) -> web.HTTPException:
    return error(text=json.dumps({"detail": detail}, ensure_ascii=False), content_type="application/json")


def _task_action(node: str) -> Tuple[str, str]:
    """Arguments and working directory of the task for this install; the store choice is read when the task runs.

    node.exe is a console program: a task in the interactive session would open its window at every run.
    """
    fgc_dir = resolve_fgc_root()
    runner_file = fgc_dir / "runner.js"
    arguments = f'--headless "{node}" "{runner_file}" --scheduled --config "{CONFIG_FILE}" --log "{SCHEDULED_LOG}"'
    return arguments, str(fgc_dir)


def _parse_task_time(value: Optional[str]) -> Optional[float]:
    """Epoch seconds of a scheduler time (PowerShell 'o': local time with its UTC offset); None for 'never' or unreadable."""
    if not value:
        return None
    try:
        when = datetime.fromisoformat(re.sub(r"(\.\d{6})\d+", r"\1", str(value)))  # 7 fraction digits are too many for fromisoformat
    except ValueError:
        logger.warning(f"Unreadable scheduler time {value!r}")
        return None
    # The scheduler reports 1999-11-30 for a task that never ran
    return None if when.year < 2000 else when.timestamp()


def _last_run_failed(code: Optional[int], state: Optional[str] = None, last_run: Optional[str] = None,
                     arguments: Optional[str] = None) -> bool:
    if state == "Running":
        return False
    # 0x413xx are SCHED_S_* statuses such as "still running" or "has not run yet", not results of a run
    if code and not 0x41300 <= code <= 0x413FF:
        return True
    # conhost does not pass node's exit code on, so a task of this app always reports 0: its run log tells
    ran_at = _parse_task_time(last_run)
    try:
        with open(SCHEDULED_LOG, "rb") as log:
            modified = os.fstat(log.fileno()).st_mtime
            head = log.read(len(RUN_LOG_FORMAT_MARK.encode("utf-8")) + 3)
            log.seek(0, os.SEEK_END)
            log.seek(max(0, log.tell() - RUN_LOG_TAIL_BYTES))
            lines = log.read().decode("utf-8", errors="replace").strip().splitlines()
    except FileNotFoundError:
        # The task writes a log and has run, but there is none: runner.js died before it opened the file
        return ran_at is not None and "--log" in (arguments or "")
    except OSError as e:
        logger.warning(f"Could not read {SCHEDULED_LOG}: {e}")
        return False
    # A log older than the last run is from an earlier one: runner.js failed before it could start over (Node.js below 20)
    if ran_at is not None and modified < ran_at - RUN_LOG_CLOCK_SLACK_SECONDS:
        return True
    if not lines:
        return ran_at is not None
    if ran_at is None or not head.decode("utf-8", errors="replace").startswith(RUN_LOG_FORMAT_MARK):
        # Not known to belong to a run (the task was recreated), or written by a runner that did not mark its end:
        # only an explicit failure line counts, until the new runner has run
        return lines[-1].startswith(RUN_FAILED_MARK)
    return not lines[-1].startswith(RUN_DONE_MARK)


class GiveawaysOrchestrator:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._scheduler_write_lock = asyncio.Lock()  # read-then-write: two quick clicks must not both see "no task"
        self._repair_error: Optional[str] = None
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
        if not force and (now - self._scheduler_cache[0] < 120.0):
            return self._scheduler_cache[1]

        ps_script = (
            f"[Console]::OutputEncoding = [Text.Encoding]::UTF8; "
            f"$t = Get-ScheduledTask -TaskName '{TASK_NAME}' -ErrorAction SilentlyContinue; "
            f"if ($t) {{ $i = Get-ScheduledTaskInfo -TaskName '{TASK_NAME}'; "
            f"$a = $t.Actions[0]; "
            f"$d = if ($t.Triggers[0].DaysOfWeek) {{ [int]$t.Triggers[0].DaysOfWeek }} else {{ 37 }}; "
            f"@{{ exists=$true; state=$t.State.ToString(); "
            f"lastRun=if($i.LastRunTime){{$i.LastRunTime.ToString('o')}}else{{$null}}; "
            f"nextRun=if($i.NextRunTime){{$i.NextRunTime.ToString('o')}}else{{$null}}; "
            f"lastResult=$i.LastTaskResult; daysOfWeek=$d; "
            f"execute=$a.Execute; arguments=$a.Arguments; workingDirectory=$a.WorkingDirectory }} | ConvertTo-Json -Compress }} "
            f"else {{ @{{ exists=$false; state='Unknown'; lastRun=$null; nextRun=$null; lastResult=$null; daysOfWeek=$null }} | ConvertTo-Json -Compress }}"
        )
        try:
            proc = await asyncio.create_subprocess_exec(
                "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_script,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                creationflags=0x08000000  # CREATE_NO_WINDOW
            )
            stdout, _ = await self._communicate_or_kill(proc, SCHEDULER_QUERY_TIMEOUT_SECONDS)
            raw = json.loads(stdout.decode("utf-8-sig", errors="replace").strip())
            raw_mask = raw.get("daysOfWeek")
            mask: Optional[int] = None
            if raw_mask is not None:
                try:
                    mask = int(raw_mask)
                except (ValueError, TypeError):
                    mask = 37
            elif bool(raw.get("exists")):
                mask = 37

            result = {
                "taskName": TASK_NAME,
                "exists": bool(raw.get("exists")),
                "state": raw.get("state", "Unknown"),
                "lastRunTime": raw.get("lastRun"),
                "nextRunTime": raw.get("nextRun"),
                "lastTaskResult": raw.get("lastResult"),
                "daysOfWeek": mask,
                "activeDays": bitmask_to_days(mask),
                "lastRunFailed": _last_run_failed(raw.get("lastResult"), raw.get("state"), raw.get("lastRun"), raw.get("arguments")),
                "action": {key: raw.get(key) for key in ("execute", "arguments", "workingDirectory")},
            }
        except Exception as e:
            logger.warning(f"Windows Task Scheduler query failed: {type(e).__name__}: {e}")
            result = {
                "taskName": TASK_NAME,
                "exists": False,
                "queryFailed": True,
                "state": "Unknown",
                "lastRunTime": None,
                "nextRunTime": None,
                "lastTaskResult": None,
                "daysOfWeek": None,
                "activeDays": [],
                "lastRunFailed": False,
                "action": {},
            }

        result["repairError"] = self._repair_error
        result["logFile"] = str(SCHEDULED_LOG)
        self._scheduler_cache = (now, result)
        return result

    @staticmethod
    async def _communicate_or_kill(proc: asyncio.subprocess.Process, timeout: float) -> tuple:
        """proc.communicate() with a ceiling; a process that misses it is killed and reaped before TimeoutError propagates."""
        try:
            return await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise

    async def _run_scheduler_write(self, ps_script: str) -> None:
        """Runs a task-changing script; any failure reaches the caller, the UI must not show a change that did not happen."""
        proc = await asyncio.create_subprocess_exec(
            "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
            "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.Encoding]::UTF8; " + ps_script,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            creationflags=0x08000000
        )
        try:
            _, stderr = await self._communicate_or_kill(proc, SCHEDULER_WRITE_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            logger.error(f"Task scheduler write timed out after {SCHEDULER_WRITE_TIMEOUT_SECONDS:.0f}s")
            raise _scheduler_refusal(web.HTTPInternalServerError, "Планировщик Windows не ответил вовремя. Попробуйте ещё раз.")
        finally:
            # Even a killed script may have applied the change
            self._scheduler_cache = (0.0, {})
        if proc.returncode != 0:
            logger.error(f"Task scheduler write failed (exit {proc.returncode}): {stderr.decode('utf-8', errors='replace').strip()}")
            raise _scheduler_refusal(web.HTTPInternalServerError, "Не удалось изменить задание в Планировщике Windows. Подробности в журнале приложения.")

    async def _known_scheduler_state(self) -> dict:
        sched = await self._query_scheduler(force=True)
        if sched.get("queryFailed"):
            raise _scheduler_refusal(web.HTTPServiceUnavailable, "Планировщик Windows не ответил. Попробуйте ещё раз.")
        return sched

    async def _usable_node(self) -> str:
        """Path of a Node.js the engine can run on; refuses with an explanation otherwise."""
        node = shutil.which("node")
        if node is None:
            raise _scheduler_refusal(web.HTTPPreconditionFailed, f"Для автосбора раздач нужен Node.js {MIN_NODE_MAJOR} или новее (nodejs.org). "
                                                                 "Установите его и включите автосбор ещё раз.")
        proc = await asyncio.create_subprocess_exec(
            node, "--version",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            creationflags=0x08000000
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=NODE_VERSION_TIMEOUT_SECONDS)
        version = stdout.decode("utf-8", errors="replace").strip()
        found = re.match(r"v(\d+)\.", version)
        if not found or int(found.group(1)) < MIN_NODE_MAJOR:
            raise _scheduler_refusal(web.HTTPPreconditionFailed, f"Для автосбора раздач нужен Node.js {MIN_NODE_MAJOR} или новее (nodejs.org), "
                                                                 f"установлен {version or 'неизвестной версии'}. Обновите его и включите автосбор ещё раз.")
        return node

    async def _create_task(self, days: List[str]) -> None:
        """Registers the task for the current install. No -Force: a task that already exists stays as the user set it up."""
        fgc_dir = resolve_fgc_root()
        runner_file = fgc_dir / "runner.js"
        if not runner_file.is_file():
            raise _scheduler_refusal(web.HTTPNotFound, f"Модуль раздач не найден по пути {fgc_dir}")
        node = await self._usable_node()
        arguments, work_dir = _task_action(node)
        days_quoted = ",".join(f"'{d}'" for d in days)
        await self._run_scheduler_write(
            f"$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument {_ps_literal(arguments)} "
            f"-WorkingDirectory {_ps_literal(work_dir)}; "
            f"$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek @({days_quoted}) -At '{TASK_DEFAULT_TIME}'; "
            f"$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries "
            f"-MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds {TASK_TIME_LIMIT_SECONDS}); "
            f"$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) "
            f"-LogonType Interactive -RunLevel Limited; "
            f"Register-ScheduledTask -TaskName '{TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null"
        )
        logger.info(f"Created scheduler task {TASK_NAME}: days={days}, runner={runner_file}")

    async def repair_task_paths(self) -> None:
        """At service start: re-points a task created by this app when the app or Node.js moved. Never raises, never creates."""
        async with self._scheduler_write_lock:
            self._repair_error = None
            try:
                sched = await self._query_scheduler(force=True)
                action = sched.get("action") or {}
                is_ours = (action.get("execute") or "").lower() == "conhost.exe" and "runner.js" in (action.get("arguments") or "")
                if not sched.get("exists") or not is_ours:
                    return
                arguments, work_dir = _task_action(await self._usable_node())
                task_runner = re.search(r'"([^"]*runner\.js)"', action.get("arguments") or "")
                if task_runner and task_runner.group(1) not in arguments and Path(task_runner.group(1)).is_file():
                    logger.info(f"Scheduler task {TASK_NAME} belongs to another install, left as is: {task_runner.group(1)}")
                    return
                if (action.get("arguments", "").casefold(), (action.get("workingDirectory") or "").casefold()) == (arguments.casefold(), work_dir.casefold()):
                    return
                await self._run_scheduler_write(
                    f"$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument {_ps_literal(arguments)} "
                    f"-WorkingDirectory {_ps_literal(work_dir)}; "
                    f"Set-ScheduledTask -TaskName '{TASK_NAME}' -Action $action | Out-Null"
                )
                logger.info(f"Re-pointed scheduler task {TASK_NAME} to the current install: {arguments}")
            except web.HTTPException as e:
                self._repair_error = json.loads(e.text)["detail"]
                logger.error(f"Could not check scheduler task {TASK_NAME} at startup: {self._repair_error}")
            except Exception as e:
                self._repair_error = "Не удалось проверить задание автосбора. Подробности в журнале приложения."
                logger.error(f"Could not check scheduler task {TASK_NAME} at startup: {type(e).__name__}: {e}", exc_info=True)
            self._scheduler_cache = (0.0, {})

    async def toggle_scheduler(self, enable: Optional[bool] = None) -> dict:
        async with self._scheduler_write_lock:
            sched = await self._known_scheduler_state()
            is_active = bool(sched.get("exists")) and sched.get("state") != "Disabled"
            target_enable = (not is_active) if enable is None else bool(enable)
            if not sched.get("exists"):
                if not target_enable:
                    return sched
                await self._create_task(bitmask_to_days(None))
                return await self._query_scheduler(force=True)
            cmd = "Enable-ScheduledTask" if target_enable else "Disable-ScheduledTask"
            await self._run_scheduler_write(f"{cmd} -TaskName '{TASK_NAME}' | Out-Null")
            logger.info(f"Task scheduler {TASK_NAME} set to: {'Enabled' if target_enable else 'Disabled'}")
            return await self._query_scheduler(force=True)

    async def update_scheduler_days(self, days: List[str]) -> dict:
        """
        Updates the weekly scheduled days for FreeGamesClaimerStudio in Windows Task Scheduler, creating the task if it
        does not exist yet. Preserves StartBoundary (execution time). If days is empty, disables the task.
        """
        valid_days = [d.capitalize() for d in days if d.capitalize() in DAY_BITS]

        if not valid_days:
            logger.info("All scheduler days unselected; disabling scheduled task.")
            return await self.toggle_scheduler(enable=False)

        async with self._scheduler_write_lock:
            sched = await self._known_scheduler_state()
            if not sched.get("exists"):
                await self._create_task(valid_days)
                return await self._query_scheduler(force=True)

            days_quoted = ",".join(f"'{d}'" for d in valid_days)
            ps_script = (
                f"$t = Get-ScheduledTask -TaskName '{TASK_NAME}'; "
                f"$sb = $t.Triggers[0].StartBoundary; "
                f"$timeStr = if ($sb) {{ ([datetime]::Parse($sb)).ToString('HH:mm') }} else {{ '{TASK_DEFAULT_TIME}' }}; "
                f"$newTr = New-ScheduledTaskTrigger -Weekly -DaysOfWeek @({days_quoted}) -At $timeStr; "
                f"Set-ScheduledTask -TaskName '{TASK_NAME}' -Trigger $newTr | Out-Null; "
                f"if ($t.State -eq 'Disabled') {{ Enable-ScheduledTask -TaskName '{TASK_NAME}' | Out-Null }}"
            )
            await self._run_scheduler_write(ps_script)
            logger.info(f"Updated scheduler {TASK_NAME} days to: {valid_days}")
            return await self._query_scheduler(force=True)

    def _read_sessions(self, data_dir: Path) -> Dict[str, dict]:
        fpath = data_dir / SESSIONS_FILE
        if not fpath.is_file():
            return {}
        try:
            data = json.loads(fpath.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as e:
            logger.warning(f"Error reading store logins from {fpath}: {e}")
            return {}
        if not isinstance(data, dict):
            return {}
        return {store: entry for store, entry in data.items() if isinstance(entry, dict)}

    def _read_inventory_sync(self, force: bool = False) -> Tuple[Dict[str, dict], List[dict]]:
        fgc_dir = resolve_fgc_root()
        data_dir = fgc_dir / "data"
        changed = force
        current_mtimes: Dict[str, float] = {}
        sessions_path = data_dir / SESSIONS_FILE
        if sessions_path.is_file():
            current_mtimes[SESSIONS_FILE] = sessions_path.stat().st_mtime
            if self._file_mtimes.get(SESSIONS_FILE) != current_mtimes[SESSIONS_FILE]:
                changed = True
        elif SESSIONS_FILE in self._file_mtimes:
            changed = True
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
        sessions = self._read_sessions(data_dir)

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
                                if ts_ms > latest_ts:
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

            total_items = claimed_cnt + existed_cnt
            session = sessions.get(store)
            stores_meta[store] = {
                "store": store,
                "displayName": STORE_DISPLAY_NAMES.get(store, store.upper()),
                "claimedCount": total_items,
                "newlyClaimedCount": claimed_cnt,
                "existedCount": existed_cnt,
                "lastClaimedAt": latest_iso,
                "dbFileExists": exists,
                # A login counts without any claimed game. Claimed games only name the account while the engine has not
                # reported this store yet (older installs): after a sign-out they must not bring the old account back.
                "account": (session.get("account") or None) if session else (accounts[0] if (accounts and total_items > 0) else None),
                "loginConfirmedAt": session.get("confirmedAt") if session else None,
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

    async def start_claim(self, stores: List[str], headless: bool = True, switch_account: bool = False) -> dict:
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
                valid_stores = list(DEFAULT_CLAIM_STORES)

            if runner_file.is_file():
                # Node.js is not bundled (the browser engine is installed on first use): say so instead of crashing
                if shutil.which("node") is None or shutil.which("npm") is None:
                    raise web.HTTPPreconditionFailed(
                        text=json.dumps({"detail": "Для бесплатных раздач нужен Node.js 20 или новее (nodejs.org). "
                                                   "Установите его и запустите сбор ещё раз."}, ensure_ascii=False),
                        content_type="application/json",
                    )
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
                await self._wait_or_kill(npm_proc, "npm install")
                if npm_proc.returncode != 0 or not patchright_dir.is_dir():  # None: killed after the timeout
                    logger.error(f"npm install failed with exit code {npm_proc.returncode}, patchright dir present: {patchright_dir.is_dir()}")
                    raise web.HTTPServiceUnavailable(
                        text=json.dumps({"detail": "Не удалось скачать браузерный движок раздач. "
                                                   "Проверьте интернет и запустите ещё раз."}, ensure_ascii=False),
                        content_type="application/json",
                    )
                br_proc = await asyncio.create_subprocess_exec(
                    "cmd.exe", "/c", "npx", "patchright", "install", "chromium",
                    cwd=str(fgc_dir),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                    creationflags=0x08000000
                )
                await self._wait_or_kill(br_proc, "patchright install")

            logger.info(f"Starting FGC claim run: stores={valid_stores}, headless={headless}")
            self._proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=str(fgc_dir),
                stdin=asyncio.subprocess.DEVNULL,  # a service started from a console would make the engine wait for a terminal
                env={**os.environ, "FGC_SWITCH_ACCOUNT": valid_stores[0]} if switch_account else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                creationflags=0x08000000  # CREATE_NO_WINDOW
            )
            self._broadcast("state", {"state": "running", "pid": self._proc.pid, "stores": valid_stores})
            asyncio.create_task(self._monitor_process(self._proc))
            return {"status": "started", "pid": self._proc.pid, "stores": valid_stores}

    async def start_auth(self, store: str, switch_account: bool = False) -> dict:
        if store not in STORE_FILE_MAP:  # start_claim would replace it with the default stores
            raise web.HTTPBadRequest(text=json.dumps({"detail": f"Неизвестный магазин: {store}"}, ensure_ascii=False),
                                     content_type="application/json")
        return await self.start_claim(stores=[store], headless=False, switch_account=switch_account)

    async def _monitor_process(self, proc: asyncio.subprocess.Process) -> None:
        async def pump_output() -> None:
            assert proc.stdout is not None
            async for raw_line in proc.stdout:
                line = ANSI_ESCAPE_RE.sub("", raw_line.decode("utf-8", errors="replace")).rstrip("\r\n")
                if line:
                    entry = {"line": line, "ts": datetime.now(timezone.utc).isoformat()}
                    self._log_buffer.append(entry)
                    self._broadcast("log", entry)
            await proc.wait()

        try:
            # The ceiling covers the output loop too: a hung process never reaches EOF on stdout.
            await asyncio.wait_for(pump_output(), timeout=FGC_RUN_CEILING_SECONDS)
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

    async def _wait_or_kill(self, proc: asyncio.subprocess.Process, label: str) -> None:
        """Wait for a setup subprocess; kill its tree if it hangs past the setup ceiling."""
        try:
            await asyncio.wait_for(proc.wait(), timeout=FGC_SETUP_CEILING_SECONDS)
        except asyncio.TimeoutError:
            logger.warning(f"{label} exceeded {FGC_SETUP_CEILING_SECONDS:.0f}s, killing process tree PID {proc.pid}.")
            killer = await asyncio.create_subprocess_exec(
                "taskkill.exe", "/F", "/T", "/PID", str(proc.pid),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                creationflags=0x08000000
            )
            await killer.wait()

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
