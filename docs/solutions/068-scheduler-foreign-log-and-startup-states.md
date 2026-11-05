# 068. Scheduler message named a log that does not exist; startup looked like a failure

## What the user saw
1. Giveaways tab: "Последний запуск по расписанию завершился с ошибкой. Лог: <project>\giveaways_scheduled.log". That file did not exist. The scheduler reported `lastTaskResult: 3221225786` (0xC000013A, STATUS_CONTROL_C_EXIT) and the task action was the user's own launcher (`StudioClaimLauncher.bat`, see 062 "An existing task keeps its action"), which writes `ClaimOutput_<timestamp>.log` next to itself.
2. For the first 15+ seconds after launch (before the Python service answered) the Dashboard showed the red "service unavailable" banner, "ОЧЕРЕДЬ · 0 ИГР", "Очередь кампаний пуста", "Нет подходящих кампаний для ручного переключения", "Полка Игр 0" and the version chip "V7.0". None of it was true yet: nothing was empty or broken, the service was only starting.

## Cause
1. `_query_scheduler` always set `logFile = SCHEDULED_LOG`, whatever the task ran. The readiness window used the same field.
2. The UI had two states only (`connected` true/false). Before the first answer `connected` is false, the lists are the empty INITIAL_STATE, and `App.tsx` fell back to `'v7.0'` for the version.

## Fix
Scheduler (`core/giveaways_controller.py`, `core/giveaways_readiness.py`, `GiveawaysView.tsx`, `giveawaysReadiness.ts`):
- `logFile` is a file that exists, or null. Own task (arguments carry `--log`): `SCHEDULED_LOG` if it is a file. Foreign launcher: the newest `ClaimOutput_*.log` in the directory of `action.execute`, only if it is at least as new as the last run (2 s clock margin, `RUN_LOG_CLOCK_SLACK_SECONDS`). A missing directory or an OSError is logged as a warning and gives null. Only a directory listing is read.
- `lastRunInterrupted` is true for 0xC000013A. The text says only that the run was interrupted and did not check all the stores; the code does not know why, so no cause is stated. " Лог: <path>" is appended only when `logFile` is not null. The readiness window has the reason `last_run_interrupted` with the same rule.
- i18n: `patterns.ts` has one pattern per sentence with an optional " Лог: ..." tail (covers both variants); `en/giveaways.ts` has the readiness line.

Startup (`useSentinelState.ts`, `LiveDashboard.tsx`, `App.tsx`):
- The hook exposes `connectionPhase: 'starting' | 'connected' | 'unavailable'`. `connected` wins; otherwise `serviceLost` (set by a failed poll once the service has answered before, or once `START_GRACE_MS` = 60 s since mount passed; it is also checked at the top of every poll so a hanging request cannot keep "starting" forever). No new timer: the existing 3 s poll decides.
- Starting: a neutral `role="status"` line "Запускаем службу Sentinel…", and loading texts in the queue, current target and off-queue panels; no count after "ОЧЕРЕДЬ" and no count on the shelf tab. Unavailable: the red banner as before, and a loss after being connected shows it at once.
- The version chip is rendered only when a version is known (`sentinelState.version` or `updateInfo.local_version`). The `'v7.0'` fallback is gone. The fallback near `App.tsx` "Текущая версия" is `'3.5.10'`, matches `package.json`, left alone.
- Everything keeps `ClearType` rules of 067: no shadow, backdrop-filter or translucent layer was added to a text surface.

## Checks
- `test_scheduler_log_file_is_a_file_that_exists_and_an_interrupted_run_is_named` in `test_sentinel_suite.py` (temp dir with a fake launcher and old and new ClaimOutput logs).
- `tools/check_startup_states.cjs` with the fixture params `?service=slow|down` and `?grace=<ms>` (documented in the header of `tools/ui_fixture.js`).

## Gotchas
- The fixture also rejects `/api/updates/check` in `service=slow|down`: that request goes to the same service, and without it the chip would show a version the real app cannot know yet.
- `window.__SENTINEL_START_GRACE_MS` is read only if it is a number; only the fixture sets it.
- `test_console_collapse_tray_filter_and_plain_labels` pins the idle hero title in the source text; it now pins the ternary.
- The "Лог:" tail is a separate text node in the view, so the translator sees it as its own `Лог: (.+)` pattern match; the sentence itself has no placeholder.
- Not verified: the interrupted run itself. The code does not know why it was interrupted, and the UI says nothing about the cause.

## Live check (2026-11-05)
On the real task the message named the interrupted run and its real `ClaimOutput_*.log`. The starting line was not seen live: the app had its data before the first capture at 6 s, so that state is proven only on the fixture.
