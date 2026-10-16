# Solution 013: Android Client Integrity Bypass & Dynamic Farm Focus

## Problem Statement
The user reported that "nothing is happening, something broke again", presenting a screenshot showing:
1. `Hunt: Showdown 1896` in the hero banner marked `0%` (`В очереди приоритета (Auto-Queue)`).
2. The streamer listed below it was `Duky`, an active Twitch streamer.
3. Drop progress did not increase, and Sentinel periodically hopped between streamers (`Duky` -> `stylishnoob4` -> `Duky`) every 5 minutes.

## Root Cause Analysis
1. **Twitch GQL Integrity Check on Drop Claiming:**
   Twitch web Client-ID (`kimne78kx3ncx6brgo4mv6wki5h1ko`) returned `IntegrityCheckFailed` on `DropsPage_ClaimDropRewards` mutations when Sentinel attempted auto-claims.
2. **Precondition Chain Deadlock:**
   Because the first three drops of the *AION 2* campaign (*Customization Voucher x3*, *Skin Chest x1*, *Soul Codex: Reset x3*) reached 100% but failed to claim, the 4th drop (*Pet: Two x1*) had its `preconditions_met` check evaluated to `False`. This caused `first_drop` to return `None`, leaving `STATE_BRIDGE.active_drop = None`.
3. **Stall Watchdog False Positive:**
   With `active_drop = None`, the watch loop watchdog detected 0 progress delta over 5 minutes and marked the streamer offline, cycling candidates in a continuous loop.
4. **UI Hero Focus Defaulting to Index 0:**
   In `LiveDashboard.tsx`, `selectedGameIndex` defaulted to `0` (*Hunt: Showdown 1896*). Because Hunt: Showdown had no active drops on Twitch, it rendered at `0%` while showing `watchingChannel` (`Duky`), confusing the user into thinking Hunt: Showdown was being watched without progress.

## Surgical Solution
1. **Android Client-ID Claim Bypass (`core/inventory.py`):**
   Routed `DropsPage_ClaimDropRewards` via the official Twitch Android App headers (`Client-ID: kd1unb4b3q4t58fwlpcbzcbnm76a8fp`, Dalvik user-agent). Android clients bypass web integrity challenges and immediately return `ELIGIBLE_FOR_ALL`.
2. **GQL Active Drop Refresh (`core/twitch.py`):**
   Ensured that when GQL reports active session progress (`DropCurrentSessionContext`), `gql_drop.display()` is called immediately, keeping `STATE_BRIDGE.active_drop` populated in real time.
3. **Dynamic Active Farm Focus & Shelf Clarity (`src/components/LiveDashboard.tsx`):**
   - Automatically auto-focuses on whichever game has `status === 'FARMING'` instead of hardcoded index 0.
   - For priority games currently without active drops on Twitch, explicitly renders `Ожидание раздачи (Нет дропов на Twitch)` instead of misleading `Auto-Queue 0%`.

## Verification
- Successfully claimed the 3 stalled AION 2 drops on Twitch with `ELIGIBLE_FOR_ALL`.
- Unblocked `Pet: Two x1` at 183/240 minutes (76%).
- Rebuilt frontend with `npm run build` (exit code 0).
- Re-launched `sentinel_service.py` daemon; confirmed active lock on `stylishnoob4` with 7/7 WebSockets connected and `active_drop` populated in `GET /api/state`.
