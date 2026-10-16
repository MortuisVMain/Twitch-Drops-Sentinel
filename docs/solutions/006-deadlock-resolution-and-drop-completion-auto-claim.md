# Solution 006: Deadlock Resolution on 100% Drops & Automatic Claim Progression

## Context & Problem
When a drop reached 100% progress (e.g. 30/30 minutes) on Twitch or locally, Sentinel would enter a deadlock:
1. `drop.claim_id` was `None` because Twitch's websocket did not immediately deliver a `drop-claim` event with `drop_instance_id`.
2. Because `BaseDrop.can_claim` strictly checked `self.claim_id is not None`, `can_claim` was `False`.
3. Because `is_claimed` was `False`, `TimedDrop._base_earn_conditions()` continued returning `True` (it lacked a check for `current_minutes < required_minutes`).
4. This caused `campaign.can_earn(channel)` to evaluate to `True`, so `can_watch(channel)` remained `True`.
5. In `_watch_loop`, Sentinel stayed permanently locked onto the completed streamer (e.g. Polita for PAYDAY 3), sending useless watch payloads while drop progress was already at 100%. Manual claim requests from the UI were ignored or failed.

## Root Cause
- `TimedDrop._base_earn_conditions()` only verified `not self.is_claimed`, failing to recognize that once `current_minutes >= required_minutes`, the drop is fully completed and cannot earn further minutes.
- `_watch_loop` and `process_drops` lacked automatic claim triggers when progress reached 100%.
- `BaseDrop.can_claim` rejected drops whose minutes were complete but whose `claim_id` was absent.

## Solution Architecture
1. **Earn Condition Bounds in `inventory.py`**:
   Added `and self.current_minutes < self.required_minutes` to `TimedDrop._base_earn_conditions()`. A completed drop is immediately marked as no longer earnable, allowing `campaign.can_earn()` to transition to `False` and triggering channel switching.
2. **Auto-Claim Generation**:
   In `BaseDrop.can_claim`, allow claiming when `current_minutes >= required_minutes`. If `claim_id` is missing, `BaseDrop._claim()` invokes `await self.generate_claim()` (`UserID#CampaignID#DropID`).
3. **Reactive Auto-Claim on Progress**:
   In both GQL polling (`_watch_loop`) and WebSocket push (`process_drops`), when `drop.current_minutes >= drop.required_minutes and not drop.is_claimed`:
   - Auto-generate claim ID if missing.
   - Execute `await drop.claim()`.
   - Update GUI and Trophy Vault.
   - If the campaign has no more earnable drops, trigger `State.GAMES_UPDATE` or `State.CHANNEL_SWITCH`.
4. **Channel Switch Circuit Breaker in `_watch_loop`**:
   Checked `if not self.can_watch(channel)` on each loop tick; if the stream no longer qualifies, immediately changes state to `State.CHANNEL_SWITCH`.

## Verification
- Captured and auto-claimed all 3 pending PAYDAY 3 drops (`Wolf`, `Chains`, `Hoxton`) at startup.
- Successfully appended rows to `Trophies.md`.
- Switched automatically to next priority stream (`CharlesCimeaurant`, Tom Clancy's The Division 2) with 0 unhandled exceptions.
