# 072. Console reaches back five hours, a button for the log file, a log that rotates, two rows of off-queue cards

Replaces the "500 lines" figure of 071 (the buffer is now kept by age).

## 1. Console: at least the last 5 hours
`STATE_BRIDGE.recent_logs` (core/gui_headless.py) is kept **by age**: `LOG_RETENTION_SECONDS = 6 h` (a margin over the 5 h that must be visible, so nothing is dropped at 4 h 59 min), with `LOG_HARD_CAP = 5000` lines as a safety net against a runaway logger (about 830 lines/hour sustained over the full 6 h; a few MB of dicts). Counter runs ("(n/104)") are still folded on write.

Every entry has `seq` (grows by one per written or folded line), `ts` (epoch seconds) and, for a folded counter line, `replaces` (the `seq` of the line it supersedes). A service run has a `log_session` id; its numbers start again after a restart.

`/api/state` is polled every 3 s, so it carries only `recent_logs[-50:]` (`STATE_LOG_TAIL`) plus `log_seq` and `log_session`. The hours come from `GET /api/logs?after=<seq>&session=<id>` -> `{session, last_seq, reset, entries}`. No `after` = everything. `reset: true` (another session, or a cursor beyond the end) means "drop your copy": entries are the whole journal. A bad `after` is 400.

Client (`src/hooks/useConsoleLogs.ts`, `mergeConsoleLogs` in `src/utils/consoleLog.ts`): fetches only when `log_seq`/`log_session` of the state differ from its cursor (a quiet poll makes no request), one request at a time, retry after 5 s on failure with a visible notice. Until the first answer, and with an older service that sends no cursor, the console shows the tail. The console, filters, "Копировать" and the collapsed last-event line use the merged list; copy therefore holds all 5 hours. The old `slice(-200)`/`slice(-60)` display limits are gone.

Rendering cost (headless Edge, `tools/check_console_logs.cjs`): 5000 lines, switching a filter 11-137 ms, quiet polls (a new `/api/state` object every 3 s) cause no long task (>50 ms). No virtualization: not needed at the cap.

Found on the way: the short-window rule gave the console `flex: 1 0 auto`; with hours of lines the auto basis grew the console to 62 000 px. It is now `flex: 1 0 12rem` (and `height: 24rem` in the stacked layout).

## 2. "Файл логов"
Button next to "Копировать", shown only when `window.chrome.webview.postMessage` exists. It posts `{type: 'OPEN_LOG_FILE'}`, nothing else. `MainForm.cs` (after the `AppOriginPolicy` check) finds `core/sentinel_service.log` next to the service script (same candidate folders as the script lookup, `FindServiceLogFile`) and runs `explorer.exe /select,"<path>"` (the folder if the file does not exist yet). No path or argument is read from the message. Not verified: the real Explorer call (needs the signed host); checked by build and a source gate.

## 3. Rotation
`RotatingFileHandler(core/sentinel_service.log, 10 MB x 5 backups, UTF-8)` via `make_file_log_handler`. Only the service process writes the file (the host's `sentinel_stdout.log`/`stderr.log` are other files); on Windows a rollover renames while the handler holds no open stream, so a second process holding the file open would make one rollover fail (reported by logging on stderr, the service keeps running). The existing 70 MB file rolls over to `.1` at the first write. `.gitignore` and `tools/create_clean_release.py` now also exclude `sentinel_service.log.*` (the old rules matched only `.log`, so a backup would have been committed and shipped).

## 4. Off-queue panel while farming
Two rows of compact cards; columns = `floor((gridWidth + gap) / (12.5rem + gap))`, measured with a `ResizeObserver` and passed as `--override-cols`, so the cards span the panel exactly and the shown count is `2 x columns`. "Показать все · N" counts all candidates. Idle poster mode is unchanged. In a short window (<= 800 px high) the list keeps two rows with fewer columns (1180x750: 3 columns, 6 cards) and the right column scrolls; the console keeps 12 rem (about 7 lines). The old `max-height: 4.7rem` rule is gone.

Checks: `tools/check_override_cards.cjs` (two rows, last column at the panel edge, no overlap, count), `tools/check_console_logs.cjs`, gates `test_console_journal_keeps_five_hours_and_serves_only_new_lines`, `test_service_log_file_rotates_and_stays_utf8`, `test_host_opens_the_log_file_from_its_own_path`.
