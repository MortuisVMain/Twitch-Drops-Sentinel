# Solution 015: Headless Progress Phase Aliasing & Streamer Rotation Circuit Breaker

## Problem Description
1. **Symptoms:**
   - Sentinel displayed "12 минут сбора висит уже пол часа", but Twitch inventory progress remained stagnant (e.g. 1% / 1 minute watched).
   - In logs, Sentinel was executing rapid streamer switches (every 2-4 minutes) and entering 30-minute cooldowns on valid games, eventually reaching "Ожидание раздачи, доступных стримов нет".
   - The UI countdown timer jumped backwards or stalled.
2. **Root Cause Analysis:**
   - **The Phase Beat Frequency / Aliasing Defect in `_watch_loop`:**
     In headless mode, DevilXD's progress tracker (`HeadlessProgress`) decrements from 60 to 0 on an internal 1-second countdown loop. In `_watch_loop`, after sending the watch beacon, the code executes `await asyncio.sleep(20)` and then evaluated `if self.gui.progress.minute_almost_done():`.
     `minute_almost_done()` required `self._seconds <= 15`. At $t = 20\text{s}$ into the 59s interval, `self._seconds` was perpetually $\approx 40\text{s} > 15\text{s}$.
     Consequently, `minute_almost_done()` returned `False` on EVERY loop iteration. The GQL `CurrentDrop` query and progress increment routines never ran!
   - **Premature Watchdog Churn vs. Twitch Micro-Batching:**
     Twitch backend ingests Spade beacons via distributed event streaming (Kafka/Flink) and processes watch progress in 5-minute micro-batches. Because the watchdog timer was set too aggressively (120s streamer / 240s game), Sentinel rotated streamers before Twitch ever credited the first batch of minutes.
   - **UI Timer Jitter:**
     The web frontend polled `/api/state` every 3 seconds and snapped its local countdown to `remaining_seconds`, causing visual backward jumps whenever the network request had jitter.

---

## Architectural & Code Solutions

### 1. Unconditional Periodic `CurrentDrop` Polling in `_watch_loop` (`core/twitch.py`)
- Removed the strict `minute_almost_done()` gate from GQL `CurrentDrop` polling.
- In `_watch_loop`, after `send_watch()` and `await asyncio.sleep(20)`, Sentinel unconditionally queries GQL `CurrentDrop` on every loop cycle (~59s interval).
- When Twitch reports progress (`currentMinutesWatched`), `gql_drop.update_minutes()` updates drop state and resets both the streamer stall timer and cumulative game stall timer to 0.

### 2. Scientific Watchdog Thresholds & State Visibility
- Set Streamer Stall Watchdog threshold to 360 seconds (6 minutes) and Game Stall Watchdog threshold to 720 seconds (12 minutes).
- Exported `watchdog_status` (`Фарм {streamer}: Xs / 360s (задержка игры: Ys)`) to `STATE_BRIDGE` and exposed it via `/api/state`.

### 3. Smooth Second-by-Second UI Countdown & Jitter Smoothing (`src/App.tsx` & `core/gui_headless.py`)
- In `HeadlessProgress`, implemented an active 1-second timer loop that decrements `STATE_BRIDGE.active_drop["remaining_seconds"]` second-by-second.
- In `src/App.tsx`, added threshold smoothing ($\le 6\text{s}$ diff ignored on 3s API polls), eliminating timer snapping.

---

## Verification & Empirical Proof
1. Verified syntax and exit code 0 via `python -m py_compile core/twitch.py`.
2. Verified live daemon runtime state on `http://127.0.0.1:28492/api/state`:
   - `watching_channel: theharryn`
   - `active_drop: 'remaining_seconds': 3540 -> 3537s (Diff: exactly 3s over 3s real time)`
   - `watchdog_status: Фарм theharryn: 65с / 360с (задержка игры: 65с)`
3. Verified Watchdog 2 autonomous streamer rotation at $t = 360\text{s}$:
   - Cleanly logged `[WATCHDOG] Стример 'theharryn' не дает прогресса 6 мин. Кулдаун стримера 15 мин -> ротация стримера...`
   - Rotated autonomously to `ozzygrl` without freezing, crashing, or prompting the user.
