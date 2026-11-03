# 061. No update badge although a newer release exists

## Symptom
A friend's header showed v3.4.1 with no update badge while v3.5.5 was already released. The version number was right, it
comes from `core/version.py`. The real cause on that machine is unknown: its logs were not available, and the failure
path logged at `DEBUG`, below the file's `INFO`, so older logs would not show it anyway.

## Cause
Two gaps, either of which gives this symptom:
- `App.tsx` checked once on mount, so an app left in the tray never saw a release published later.
- `check_for_updates` swallowed any failure at `logger.debug` and returned a normal-looking result. The UI could not tell
  "the check failed" from "you are up to date", and the manual button even showed the "latest version" toast. A reply
  without `tag_name` silently meant version 3.0.0, which also read as "no update".

## Fix
- `check_for_updates` adds `error` (the reason) to the result on failure and logs it at `WARNING`. The other fields stay
  the last known result, and the cache never stores `error`.
- `App.tsx` repeats the check every 30 minutes and when the window is shown again. Hidden windows get throttled timers,
  so the second trigger covers a long stay in the tray.
- Settings show "Не удалось проверить обновления: <reason>" and the manual button reports the failure.

## Limits
- GitHub allows 60 unauthenticated requests per hour. A periodic check uses the 15-minute cache of a success, pauses
  15 minutes after any failure, and on 403/429 waits for `Retry-After` or `X-RateLimit-Reset`. The manual button always
  goes to GitHub.
- The update window opens once per version for periodic checks, otherwise it would come back every 30 minutes after
  being dismissed.
- `git credential fill` now runs with `CREATE_NO_WINDOW`: with periodic checks it would otherwise flash a console over
  a game.

## Regression test
`test_update_check_failure_is_visible_and_retried` in `test_sentinel_suite.py`.
