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
- `run.finished` notes also include `protected_app` (the game has anti-cheat; nothing of it was read or written) and `protection_unknown` (the anti-cheat check gave no answer; the game is skipped the same way). The check runs for every game of every plan kind, right before its achievements are read (see "Anti-cheat" below).
- `state.library` becomes `{"count": number|null, "status": "none"|"scanning"|"ready"|"failed", "ageSeconds": number|null}`.

## Routes

| Method and path | Body | Success | Notes |
|---|---|---|---|
| `POST /achievements/ack` | `{"accepted": true}` | 200 `{"ok": true}` | `accepted: false` withdraws it and stops a running achievements run |
| `POST /achievements/settings` | `{"minMinutes": n, "maxMinutes": n, "skipHidden": bool}` | 200 `{"ok": true}` | integers 0..1440, min <= max, stored in settings |
| `POST /library/scan` | none | 202 `{"ok": true}` | reads the owned games list |
| `GET /library` | none | 200 `{"games": [{"appId", "name", "playtimeMinutes"}]}` | 409 `not_ready` when no list is cached |
| `GET /achievements?appId=N` | none | 200 `{"appId", "achievements": [{"apiName", "name", "description", "hidden", "achieved", "unlockTime"}]}` | reads live through the helper; can take a few seconds |
| `POST /achievements/start` | one of the three shapes below | 200 `{"ok": true}` | |
| `POST /achievements/stop`, `/pause`, `/resume`, `/skip` | none | 200 `{"ok": true}` | `skip` skips the current game |

Start shapes:

- `{"appId": N, "names": ["API_NAME", ...]}`: 1..200 names of that game.
- `{"appId": N, "all": true}`: every missing achievement of that game.
- `{"library": true, "exclude": [appId, ...], "confirm": "ALL"}`: every missing achievement of every owned game except the excluded ones. The literal `confirm` value is required.

## Refusals

HTTP 409 `{"error": code}` with the existing codes (`risk_not_acknowledged`, `unavailable`, `steam_not_running`, `steam_signed_out`, `community_signed_out`, `account_mismatch`, `busy`) plus `achievements_not_acknowledged`, `not_ready` and `protected_app` (a single-game or selected-names start for an app of the built-in anti-cheat table; same 409 shape, checked after the gates above). Malformed bodies give HTTP 400 `{"error": "invalid_request"}`.

`GET /achievements` and `POST /library/scan` use the same gates as `POST /scan`. `GET /achievements` additionally needs the achievements acknowledgement.

`GET /achievements` answers HTTP 502 `{"error": "read_failed", "reason": code}` when the helper read fails. `POST /achievements/start` and `POST /achievements/settings` bodies are rejected with HTTP 400 `{"error": "invalid_request"}` when they contain unknown keys (the key sets above are exact).

## Anti-cheat

No achievement of a game with anti-cheat is ever written. `core/steam_idle/protection.py` classifies an app id as `protected`, `clear` or `unknown`: the built-in table first (ids confirmed against the public store data), then the cache file `steam_idle_protection_cache.json` next to `config.json`, then one request to the public store `appdetails` endpoint (app id only) that looks for category 8 ("Valve Anti-Cheat enabled"). Requests are one at a time, at least 1.5 s apart, 10 s timeout. An HTTP error, timeout, 429 or unexpected body is `unknown`, is logged with the app id and is not cached. `clear` entries expire after 30 days, `protected` entries never do. Only `clear` opens a game; `protected` and `unknown` finish it with the notes above. The built-in table is incomplete by design: engines the store does not flag (for example BattlEye or Easy Anti-Cheat) are only caught when listed.

## Pace

After each unlocked achievement the run waits a random number of seconds between `minMinutes * 60` and `maxMinutes * 60`. With both at 0 the achievements of one game are written in one helper call (at most 200 per call). With a non-zero pace each achievement is its own helper call.

Correction: the wait happens only between two writes. It is armed lazily, immediately before the next write call, so reading the next game is never delayed, and no wait happens when the run ends without another write (for example when the remaining games have nothing missing).
