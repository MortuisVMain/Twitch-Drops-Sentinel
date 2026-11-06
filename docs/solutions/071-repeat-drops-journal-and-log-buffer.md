# 071. Repeat drops were not journaled, old drops were announced again, the log held five minutes

## Problem
On the night of 2026-11-06 the user saw "one drop all night". The service log shows **three** new claims: Brawlhalla "Nix CCv3 Colors" 00:35, World of Warcraft "Pouch of Violet Dust" 03:43, Albion Online "Dragonfire Chest" 06:44 (each "Drop reached 100% progress via websocket ... Auto-claiming..." followed by "[CORE] Drop получено"). Farming worked; four faults hid it.

| # | Cause | Effect |
|---|---|---|
| 1 | `inventory.py claim()` skipped the `Trophies.md` row when any line already held the same game and reward text | A weekly or daily campaign is recorded once, ever. Albion "Dragonfire Chest" (11-01) and WoW "Pouch of Violet Dust" (11-05) were already in the file, so the new claims got no row |
| 2 | `_claim()` returned `True` for both `ELIGIBLE_FOR_ALL` and `DROP_INSTANCE_ALREADY_CLAIMED` (and for an empty answer, and for a drop already marked claimed), and `claim()` printed, toasted and journaled on any `True` | Every hourly inventory sync re-announced "Drop получено: Crimson Desert (1/3)", "(2/3)", "Hunt Red (2/2)" for drops claimed long ago. The name dedupe of fault 1 existed only to hide this |
| 3 | `STATE_BRIDGE.recent_logs` kept 60 entries; the hourly sync writes ~104 "Добавление кампаний... (n/104)" lines | The app console, "copy logs" and the report's RECENT LOGS showed about 5 minutes |
| 4 | The report window text box had `tabular`, and `.tabular, .badge-num, .version-chip { white-space: nowrap }` is unlayered CSS, so it beats the Tailwind `whitespace-pre-wrap` utility | The whole report was one line (scrollWidth 49758 px, 53 px tall) with a horizontal scrollbar |

## Fix
- `_claim()` now returns `CLAIM_NEW` ("claimed"), `CLAIM_ALREADY` ("already_claimed") or `None` (failed). `claim()` still returns a bool for its callers (`twitch.py` loops, websocket handlers, `handle_claim`), so their behaviour is unchanged.
- Only `CLAIM_NEW` prints "Drop получено", sends the toast, and appends one `Trophies.md` row. `CLAIM_ALREADY` marks the drop claimed and writes a debug line. A drop already marked claimed, and an empty Twitch answer, count as already claimed.
- The name dedupe is gone. A claim instance (`claim_id`) is kept in memory for the process (`_RECORDED_CLAIMS`); the same instance never prints or journals twice. The row format is unchanged and carries no id, so the file is not searched; it stays append-only. The toast key is the claim instance too (it was the drop id, which a recurring drop reuses).
- `add_log` keeps `RECENT_LOGS_LIMIT = 500` entries and folds on write: a line that differs from the previous one of the same level only by its "(n/m)" counter replaces it. The diagnostic report tail is 120 lines (was 40). "Copy logs" in the dashboard strips the level prefix that the message already carries (it printed `[STATUS] [STATUS]`).
- Report window: the text box lost `tabular`; `.report-text` (monospace stack, `pre-wrap`, `overflow-wrap: anywhere`, `max-height: 60vh`, vertical scroll, opaque background), the dialog is `max-w-4xl`, with no outer shadow and no `backdrop-filter` on the dialog or its overlay (ClearType rule of 067). The dialog background used `bg-[var(--bg-island)]`, which is a gradient and not a colour, so it was transparent; it now uses `background`.

## Guards
- `test_sentinel_suite.py`: `test_claim_status_decides_what_is_announced_and_journaled` (status mapping from the HTTP answer, already claimed is silent, a repeat reward of an earlier week is recorded, the same instance twice is recorded once, a failed claim records nothing, old rows untouched) and `test_console_log_buffer_keeps_an_hour_and_folds_counters`.
- `tools/check_diag_report.cjs` (fixture route `/api/diagnostic-report` in `tools/ui_fixture.js`): text box > 200 px, wraps, no horizontal overflow, scrolls vertically, buttons visible, Escape closes, no shadow or blur.

## Limits
- `_RECORDED_CLAIMS` is per process. A claim id of the form `user#campaign#drop` that Twitch reuses for a later week would be skipped until the service restarts; a websocket `drop_instance_id` is unique per claim.
- Nothing here was checked against real Twitch claims.
