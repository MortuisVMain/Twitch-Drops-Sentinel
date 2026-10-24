# Solution 033: FGC Node.js Dependencies Resolution & Runtime Self-Healing

## 1. Problem Statement
When running the Giveaways Claimer ("Раздачи игр") in Twitch Drops Sentinel, Node.js scripts exited immediately with errors:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'otplib' imported from .../epic-games.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'chalk' imported from .../gog.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'lowdb' imported from .../src/util.js
```
The giveaway engine terminated with `[WARN] ... script exited with an error` for Epic Games, GOG, Steam, Fab, and Unity.

## 2. Root Cause Analysis
The Free Games Claimer engine located in `giveaways_engine/` is a standalone Node.js ES module application. Its `node_modules/` directory was ignored in `.gitignore` and had not been populated via `npm install`. Consequently, runtime dependency resolution for ES packages (`otplib`, `chalk`, `lowdb`, `patchright`) failed.

## 3. Resolution & Architectural Hardening

### 3.1. Direct Package Installation
Executed in `giveaways_engine/`:
1. `npm install` (199 packages added, lockfile resolved).
2. `npx patchright install chromium` (stealth browser engine binary provisioned).

### 3.2. Runtime Auto-Healing Guard in Sentinel Microservice
In `core/giveaways_controller.py`, added proactive dependency validation inside `start_claim()`:
```python
# Auto-install dependencies if node_modules is missing
otplib_dir = fgc_dir / "node_modules" / "otplib"
if not otplib_dir.is_dir():
    logger.warning("FGC dependencies missing. Executing automatic 'npm install'...")
    self._broadcast("log", {
        "line": "[SENTINEL] Установка зависимостей Free Games Claimer (npm install)... Пожалуйста, подождите...",
        "ts": datetime.now(timezone.utc).isoformat()
    })
    npm_proc = await asyncio.create_subprocess_exec(
        "cmd.exe", "/c", "npm", "install",
        cwd=str(fgc_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        creationflags=0x08000000
    )
    ...
```
If `node_modules` is ever missing (e.g. after fresh checkout or clean setup), Sentinel automatically installs the packages and stealth browser, broadcasting real-time progress to the UI log terminal instead of failing.

## 4. Verification
1. `node --input-type=module -e "await import('chalk'); await import('otplib'); await import('lowdb');"` -> Exit Code 0 (`ALL IMPORTS PASS!`).
2. `node epic-games.js` launched cleanly (`started checking epic-games`).
3. `test_sentinel_suite.py` 36/36 verification gates passed with Exit Code 0.
