# Steam IDLE Achievements API (contract v1)

Working contract between the service (`core/steam_idle`) and the UI tab. All routes live under `/api/v1/steam-idle`. No account identifiers appear in any payload, log or error.

## Rules

- One activity at a time: a card farm run and an achievements run are mutually exclusive. Starting one while the other is active is refused with `busy`.
- Achievements need their own acknowledgement (`steam_idle_achievements_ack` in settings) in addition to the general risk acknowledgement.
- The write permission for the helper is set only for the child process of an acknowledged, user-started run.
- Any uncertain outcome stops the run: an error with `wrote` true, or an outcome with `uncertain` true. The run never continues past an unknown account state.
- The run is suspended while the user plays a real game, stops when the Steam account changes, and is released on shutdown, exactly like the card farm.
- Hidden achievements are skipped unless `skipHidden` is false.
- Correction: hidden achievements are skipped only for the `all` (game) and `library` shapes. An explicit `names` list is honoured as sent, hidden or not, because the user ticked those names explicitly; `skipHidden` does not apply to it.
- While an achievements run is active (including its prepare phase) and while a library or achievements read is in flight, `POST /scan`, `POST /library/scan`, `GET /achievements`, `POST /login`, `POST /check` and `POST /farm/start` all answer `busy`.
- Withdrawing either acknowledgement (the general risk acknowledgement via `POST /ack` or the achievements one) stops a running achievements run; the write guard checks both right before every unlock call.
- On shutdown the queue is closed first (nothing new is written), then an unlock call already in flight is awaited for at most 12 seconds and never killed; if it has not returned a warning is logged that the account state may be incomplete.
- There is no lock or clear operation.
- State is in memory only. After a restart the user starts again; "all missing" re-reads the real state, so nothing is repeated.

## State

`GET /state` gains the key `achievements`:

```json
{
  "acknowledged": false,
  "settings": {"minMinutes": 0, "maxMinutes": 0, "skipHidden": true},
  "run": {
    "state": "idle",
    "mode": null,
    "current": null,
    "nextUnlockInSeconds": null,
    "queue": [],
    "finished": [],
    "totals": {"unlocked": 0, "already": 0, "skipped": 0, "rejected": 0, "failed": 0},
    "lastError": null,
    "paused": false,
    "suspended": false
  }
}
```

- `run.state`: `idle`, `scanning`, `unlocking`, `waiting` (pause between unlocks), `paused`, `suspended`, `done`, `stopped`.
- `run.mode`: `null`, `selected`, `game`, `library`.
- `run.current`: `{"appId", "name", "done", "total"}` or null. `done` and `total` count the achievements planned for this game in this run.
- `run.queue`: `[{"appId", "name"}]`, games still to process, at most 200 entries (the run still processes all).
- `run.finished`: `[{"appId", "name", "unlocked", "skipped", "failed", "note"}]`, newest first, at most 200 entries. `note` is null or a short code such as `no_achievements`, `nothing_missing`, `read_failed`, `skipped_by_user`.
- `run.finished` notes also include `uncertain` (an unlock call raised after it may have written, or raised an unexpected error; every remaining target of that game counts as failed and the run stops) and `only_hidden` (every missing achievement of the game is hidden and was skipped).
- Each `run.finished` entry also carries `already` and `rejected`: the per-game counts of requested names that were already achieved or not found in the game, mirroring the totals.
- `run.finished` notes also include `protected_app` (the game has anti-cheat; nothing of it was read or written) and `protection_unknown` (the anti-cheat check gave no answer; the game is skipped the same way). The check runs for every game of every plan kind, right before its achievements are read (see "Anti-cheat" below). After 5 games in a row noted `protection_unknown` the run stops with `lastError` `protection_unavailable` (the store is not answering).
- `achievements.interrupted`: `null`, or `{"kind": "game"|"selected"|"library", "startedAt": epochSeconds, "gamesDone", "gamesTotal", "unlocked"}`, the summary of a run the last session did not finish (see "Interrupted run" below). It is `null` while a run is active and after any new start.
- `state.busy`: true while the card farm or an achievements run is active (the farm loop or the achievements loop is live, paused included), otherwise false. The Settings block reads it to decide whether turning the Steam IDLE tab off needs a confirmation: "Выключить Steam IDLE? Фарм и выдача остановятся, прерванную выдачу можно будет продолжить."
- `state.library` becomes `{"count": number|null, "status": "none"|"scanning"|"ready"|"failed", "ageSeconds": number|null, "achievementsChecking": bool, "achievementsVersion": number}`. `achievementsChecking` is true while the service asks the store which listed games have achievements (see "Achievement index" below); `achievementsVersion` goes up each time such a lookup ends, and the page reads `GET /library` again when it changes.

## Routes

| Method and path | Body | Success | Notes |
|---|---|---|---|
| `POST /achievements/ack` | `{"accepted": true}` | 200 `{"ok": true}` | `accepted: false` withdraws it and stops a running achievements run |
| `POST /achievements/settings` | `{"minMinutes": n, "maxMinutes": n, "skipHidden": bool}` | 200 `{"ok": true}` | integers 0..1440, min <= max, stored in settings |
| `POST /library/scan` | none | 202 `{"ok": true}` | reads the owned games list |
| `GET /library` | none | 200 `{"games": [{"appId", "name", "playtimeMinutes", "protected", "userDenied", "hasAchievements", "achievements"}]}` | 409 `not_ready` when no list is cached; `hasAchievements` is true, false or null (unknown); `achievements` is `{"achieved", "total"}` from the last live read of that game, or null |
| `GET /achievements?appId=N` | none | 200 `{"appId", "achievements": [{"apiName", "name", "description", "hidden", "achieved", "unlockTime"}]}` | reads live through the helper; can take a few seconds |
| `POST /achievements/start` | one of the three shapes below | 200 `{"ok": true}` | |
| `POST /achievements/resume-interrupted` | none, `{}` or `{"confirm": "ALL"}` | 200 `{"ok": true}` | starts the interrupted run again minus its finished games; a library run needs `{"confirm": "ALL"}` (otherwise 400 `invalid_request`); refusals: the normal start ones, `account_changed`, `no_interrupted_run` |
| `POST /achievements/discard-interrupted` | none | 200 `{"ok": true}` | forgets the record; always 200; never touches the record of a run in progress |
| `POST /achievements/stop`, `/pause`, `/resume`, `/skip` | none | 200 `{"ok": true}` | `skip` skips the current game |

Start shapes:

- `{"appId": N, "names": ["API_NAME", ...]}`: 1..200 names of that game.
- `{"appId": N, "all": true}`: every missing achievement of that game.
- `{"library": true, "exclude": [appId, ...], "confirm": "ALL"}`: every missing achievement of every owned game except the excluded ones. The literal `confirm` value is required.

## Refusals

HTTP 409 `{"error": code}` with the existing codes (`risk_not_acknowledged`, `unavailable`, `engine_missing`, `steam_not_running`, `steam_signed_out`, `community_signed_out`, `account_mismatch`, `busy`) plus `achievements_not_acknowledged`, `not_ready`, `account_changed` and `no_interrupted_run` (resume only) and `protected_app` (a single-game or selected-names start for an app of the built-in anti-cheat table; same 409 shape, checked after the gates above). Malformed bodies give HTTP 400 `{"error": "invalid_request"}`.

`engine_missing`: every operation that reads the Steam Community site (`/login`, `/check`, `/scan`, `/library/scan`, `/farm/start`, `GET /achievements`, the achievements starts) first checks that the giveaways browser engine is installed (the same check as the giveaways readiness item "engine": `engine_installed`). A release archive ships the engine without its modules; it is installed from the giveaways readiness window. When it is missing the command is refused with HTTP 409 `{"error": "engine_missing"}` right after `unavailable` (Node.js missing is already `unavailable` with reason `node_missing`), and nothing is launched. `GET /state` then reports `community.session = "engine_missing"` (with `checkedAgeSeconds` null) while the helper is available; the value is computed on every read, so it clears as soon as the engine is installed, and the remembered session (`unknown`, `signed_in`, ...) comes back. The full set of `community.session` values: `unknown`, `checking`, `signed_in`, `signed_out`, `login_open`, `account_mismatch`, `engine_missing`, `error`.

`module_disabled`: the Steam IDLE tab is turned off (`disabled_tabs` holds `steamidle`). Every command is refused with HTTP 409 `{"error": "module_disabled"}` before anything else is looked at, and nothing is launched (no helper, no node): the farm start, pause, resume, skip and release, `/login`, `/check`, `/scan`, `/library/scan`, `GET /achievements`, the achievements start, pause, resume, skip and resume-interrupted, `/ack`, `/achievements/ack` and `/achievements/settings`. Two stay allowed because they only wind things down: the stops (`/farm/stop`, `/achievements/stop`) and `/achievements/discard-interrupted`. `GET /state` still answers, without reading the Steam client or looking for the helper: `available: false`, `unavailableReason: "module_disabled"`, `steam` all false, `busy: false` once stopped, and the remembered `achievements.interrupted` summary.

Turning the tab off while something runs (the settings update that adds `steamidle` to `disabled_tabs`, once per change; a settings reset that brings it back calls the same hook with `true`): the card farm is stopped and the held game released, and the achievements run is stopped like a service shutdown, not like a user stop: its interrupted-run record stays on disk and `achievements.interrupted` shows it. An unlock call in flight is waited for (at most `SHUTDOWN_BUDGET_SECONDS`), never killed. Turning the tab back on needs no restart: commands work again and the interrupted run can be resumed.

`GET /achievements` and `POST /library/scan` use the same gates as `POST /scan`. `GET /achievements` additionally needs the achievements acknowledgement.

`GET /achievements` answers HTTP 502 `{"error": "read_failed", "reason": code}` when the helper read fails. `POST /achievements/start` and `POST /achievements/settings` bodies are rejected with HTTP 400 `{"error": "invalid_request"}` when they contain unknown keys (the key sets above are exact).

## Interrupted run

While a run is active the service keeps `steam_idle_interrupted_run.json` next to `config.json`: `{"version": 1, "kind", "startedAt", "appId", "name", "names", "exclude", "finished": [appId...], "gamesDone", "gamesTotal", "unlocked", "accountHash"}`. `appId`/`name` (and `names` for `selected`) belong to the single-game kinds, `exclude` to `library`. `accountHash` is the SHA-256 (hex) of the SteamID64 string the run was started for; the id itself is never stored. The record is written when the queue starts and rewritten whenever a game is done with (a game cut short or not checked, noted `stopped`, `uncertain`, `unlock_uncertain` or `protection_unknown`, is not added to `finished`, so a resume does it again). The old record is not deleted when a new run starts: the new run's own record replaces it in one atomic write, so a start that fails while preparing (for example the library read) or is stopped meanwhile leaves the old record and `achievements.interrupted` as they were. The record is deleted when the queue ends `done` or the user stops the run. A run that halts with an error code (`account_changed`, `not_acknowledged`, `unlock_uncertain` or another uncertain write, a helper fatal code, `protection_unavailable`, `internal_error`) keeps it and `achievements.interrupted` is reported right after the stop. A service shutdown or crash mid-run leaves it too. On the next start the service loads it, reports `achievements.interrupted` and starts nothing. A corrupt or malformed file is logged and renamed to `steam_idle_interrupted_run.json.corrupt`; malformed means, besides the shape, an app id (`appId`, `finished`, `exclude`) that is not an integer in 1..4294967295, a name (`names`) the unlock path would refuse, or lists over the caps (100000 ids, 200 names).

Resume goes through the normal start path (both acknowledgements, the account check, every refusal) with the original plan: for `library`, the original `exclude` plus the finished ids; for `game` and `selected`, the same app (nothing to do, `no_interrupted_run`, when it is already finished). If the hash of the current account differs, resume is refused with `account_changed` and the record is kept until it is discarded. Counts of a resumed run restart from zero: they describe the latest run only.

## Anti-cheat

No achievement of a game with anti-cheat is ever written. `core/steam_idle/protection.py` classifies an app id as `protected`, `clear` or `unknown`: the built-in table first (ids confirmed against the public store data), then the cache file `steam_idle_protection_cache.json` next to `config.json`, then one request to the public store `appdetails` endpoint (app id only) that looks for category 8 ("Valve Anti-Cheat enabled"). Requests are one at a time, at least 1.5 s apart, 10 s timeout; after an HTTP 429 or 5xx the next request waits 30 s. Redirects are not followed, a status other than 200 is `unknown`, and a body over 1 MB is `unknown`. An HTTP error, timeout, 429 or unexpected body is `unknown`, is logged with the app id and is not cached. The cache file carries `"version": 1`; a file with another version is logged and renamed to `steam_idle_protection_cache.json.corrupt`. `clear` entries expire after 30 days, `protected` entries never do. Only `clear` opens a game; `protected` and `unknown` finish it with the notes above. Covered: the built-in table and games the store flags with Valve Anti-Cheat. Other anti-cheat (for example BattlEye or Easy Anti-Cheat) outside the table is not detected.

## Pace

After each unlocked achievement the run waits a random number of seconds between `minMinutes * 60` and `maxMinutes * 60`. With both at 0 the achievements of one game are written in one helper call (at most 200 per call). With a non-zero pace each achievement is its own helper call.

Correction: the wait happens only between two writes. It is armed lazily, immediately before the next write call, so reading the next game is never delayed, and no wait happens when the run ends without another write (for example when the remaining games have nothing missing).

## Refund hold (card farm)

Idling raises playtime, and a game bought under 14 days ago with under 2 hours played can still be refunded. The pages the app reads carry no purchase date, so the moment the app first saw the game in a drops preview stands in for it. `core/steam_idle/first_seen.py` keeps `steam_idle_first_seen.json` next to `config.json`: `{"version": 1, "firstSeen": {"<appId>": epochSeconds}, "released": [appId...]}`. The first preview ever read (no file yet) is recorded with timestamp 0, so an existing library is not held back; games first seen later get the current time; entries of games that left the preview are kept. A corrupt file is logged, renamed to `steam_idle_first_seen.json.corrupt` and the store starts empty without a baseline, so every game seen afterwards counts as new.

A game is held while `now - firstSeen < 14 days` and `playtimeHours < 2` (a missing value counts as 0) and it was not released by hand. Held games are left out of the queue but are not failed, skipped or done; they farm normally once the window or the playtime limit passes (seen on the next read) or when released. A held game that is being idled when the rule first applies is not interrupted.

`GET /state` farm gains `refundHeld`: `[{"appId", "name", "reason": "refund_window", "daysLeft"}]` (`daysLeft` rounded up, at least 1). The other farm keys are unchanged.

| Method and path | Body | Success | Notes |
|---|---|---|---|
| `POST /farm/release` | `{"appId": N}` (exact key set) | 200 `{"ok": true}` | stores the release, rebuilds the queue; 409 `not_held` for an unknown app id or a game that is not in `refundHeld`; 400 `invalid_request` for a bad body |

## Achievement index

`GET /library` labels each game with `hasAchievements`, so the picker can leave out games without achievements. The answer comes from the public store (`IStoreBrowseService/GetItems`, no key, app ids only, up to 100 per request, 1 s between requests): feature category 22 "Steam Achievements". It is cached in `steam_idle_achievement_index.json` next to the app: true for 90 days, false for 14 days. An app the store does not answer for stays `null` and is shown; it is not asked again until the service restarts. A `GET /library` with unanswered games starts the lookup in the background (`state.library.achievementsChecking`). A live `GET /achievements` read overrides the store: an empty list records false, a non-empty one true, and it stores the achieved and total counts the cards show (kept when the store answer is refreshed).
