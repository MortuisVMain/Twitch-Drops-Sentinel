# Solution 008: Headless GQL Polling, Completed Campaign Filter & Idle Rescan Loop

## Context & Problem
User noticed that Twitch Drops Sentinel v3.0 appeared "stuck" or frozen on streamer `GALIL_Weevil33` (PAYDAY 3) with `0/30` minutes progress for over 47 minutes. The UI displayed `Hoxton / Chains` drop as unearned (`is_claimed: False`), even though the user had already claimed all PAYDAY 3 drops on Twitch previously. Furthermore, drop progress never updated unless websocket pushed an event, and when no active channels were online for priority games, Sentinel would remain in `State.IDLE` for up to an hour before re-checking for newly live streamers.

## Root Causes
1. **`HeadlessProgress.minute_almost_done()` Stub**:
   In `core/gui_headless.py`, `minute_almost_done()` was hardcoded to `return False`. In DevilXD's engine, `_watch_loop` periodically queries Twitch GQL `DropCurrentSessionContext` only when `self.progress.minute_almost_done()` is True (every ~45–50s). Because it always returned `False`, GQL was never polled, making the watcher 100% dependent on websocket notifications.
2. **Missing Completed Campaign Detection**:
   When priority games were not in Twitch's active `dropCampaignsInProgress` inventory (e.g. PAYDAY 3 was already 100% finished), `discover_campaigns_for_game` queried Twitch streamers and created synthetic drops initialized with `currentMinutesWatched: 0, isClaimed: False`. It never cross-referenced `Trophies.md` to check if all drops in the campaign had already been claimed.
3. **Missing Stall Watchdog**:
   If a channel stopped awarding minutes (due to pre-rolls, stream pause, or drop bug) and the drop was already 100% complete, Sentinel stayed locked onto the channel indefinitely.
4. **Infinite IDLE Sleep on Channel Exhaustion**:
   When all priority games had 0 online streamers with drops enabled, `_state_change.wait()` slept until an external trigger or the 60-minute maintenance task occurred, preventing automatic detection of streamers who went live a few minutes later.

## Solution Architecture & Actions
1. **Implemented Real `HeadlessProgress` Timer (`core/gui_headless.py`)**:
   - Added `_last_progress_time` tracking to `start_timer()` and `update()`.
   - Implemented `minute_almost_done()` to return `True` when `(time() - self._last_progress_time) >= 45.0`, triggering GQL polling every 45s.
2. **Trophies Cross-Referencing in Drops & Discovery (`core/inventory.py` & `core/twitch.py`)**:
   - `BaseDrop.__init__`: Parses `Trophies.md` — if a drop for the given game is marked `✅ Забран`, sets `self.is_claimed = True`.
   - `discover_campaigns_for_game`: Checks if all drops for the campaign are claimed in `Trophies.md`. If so, logs `Campaign '{name}' for '{game}' is already completed in Trophies.md. Skipping.` and aborts discovery.
3. **5-Minute Watchdog (`core/twitch.py`)**:
   - Added a 300-second stall detector to `_watch_loop`. If a channel fails to increment minutes for 5 minutes, it is marked offline and Sentinel automatically switches to the next candidate.
4. **120-Second Idle Rescan Loop (`core/twitch.py`)**:
   - Replaced indefinite `await self._state_change.wait()` in `State.IDLE` with `asyncio.wait_for(self._state_change.wait(), timeout=120.0)`.
   - When timeout occurs and no state change is pending, Sentinel automatically triggers `State.CHANNELS_CLEANUP` to search for newly live streamers across priority games.
5. **Drop Completion Precondition Auto-Advance**:
   - In `_watch_loop`, when GQL reports a drop at 100%, any prerequisite drops in the campaign are automatically set to `is_claimed = True`, unblocking downstream items.

## Verification
- Verified completed campaigns (PAYDAY 3, Fortnite, Marvel Rivals, Division 2) are detected and skipped in logs.
- Confirmed active inventory correctly pruned to 4 real games (`WARDOGS`, `Black Desert`, `Rust`, `Skull and Bones`).
- Verified headless GQL polling runs every 45s with clean websocket fallback.
- Python syntax check passed with `python -m py_compile` (exit code 0).
- `sentinel_service.py` is live and serving `127.0.0.1:28492/api/state`.
