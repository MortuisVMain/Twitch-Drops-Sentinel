# 006 - Steam card farm: hours phase with several games held at once

Status: accepted for implementation; that Steam counts playtime for every held game must be verified live on the disposable test account.

## Context

Restricted Steam accounts (new, or after refunds) get no card drop from a game until it has N hours of playtime; ArchiSteamFarm calls this `HoursUntilCardDrops` (default 3). The farm held one game at a time, so on such an account every fresh game spent its first N hours without a drop. Steam counts up to 32 games played at once and accrues hours on all of them, but drops almost never come while several are held. Research notes: `docs/internal/steam-card-farming-research.md`.

## Decision

The farm gains an hours phase (ASF's "Complex" algorithm). When `steam_idle_hours_until_drops` > 0 (default 3, range 0..10, 0 = off) and at least two queued games are under the threshold, up to 32 of them are held at once, one presence (one helper `hold` process) each, started one per farm step. Each recheck reads the badge page: games at the threshold leave for the one-game-at-a-time queue, finished games leave as done, and free slots are refilled. Fewer than two under-threshold games ends the phase. If no batched game gains playtime for 3600 s, the phase is switched off for the rest of the run (`batchDisabled: "no_hours"`). The multi-presence logic lives in `core/steam_idle/batch.py`; the native helper is unchanged.

## Alternatives considered

- One helper process holding many AppIDs: fewer processes, but it needs a new helper command, protocol bump and signing pass, and `SteamAppId` is per process. Rejected for now.
- Auto-detecting a restricted account (watch whether the first drop comes before N hours): no setting needed, but it takes hours to learn and still guesses. Rejected; a setting with ASF's default is simpler.
- Default 0 (phase off): no change for unrestricted accounts, but users with restricted accounts would never find it. ASF calls 3 the lesser evil: about +6% time on unrestricted accounts, about 3x faster on restricted ones.
- Start/stop toggling to trigger drops: treated by ASF as a Steam bug and an Online Conduct risk. Not used.

## Consequences

- Up to 32 helper processes (parent and worker each) run during the phase; their memory must be measured live, and `batch_size` lowered if it is too high.
- Unrestricted accounts lose a little time on fresh games (about 3 h per batch of 32).
- Stop, pause, suspend and shutdown release every batch presence; a dead presence is restarted once, a second loss fails the game.
- Badge-page hours lag and round to 0.1 h, hence the time-based guard rather than a recheck count.

## Follow-ups

- Restricted-account auto-detect (suggests, never sets): a game farmed alone from under 0.1 h that drops its first card records the playtime of that read (the hold duration if the read has none). Three or more samples per account (newest 10, hashed account key) give a median: under 1 h suggests 0 (unrestricted), otherwise that median rounded to half hours, 0.5 to 10. The hint under the setting has an Apply button; the setting itself is only ever changed by the user.
- Pause while the user plays: `HKCU\Software\Valve\Steam\RunningAppID` is read once a minute during a run. What Steam writes there while the app's own helper processes hold games through SteamAppId is unverified, so a value counts as the user's game only when it is not an id the app holds itself and has been seen on 2 consecutive checks (the decision logic is in play_watch.py, the reader is injectable). The pause is the farm's normal pause, tracked as the watch's own; a manual pause, resume or stop takes it over and is never undone, and a game the user resumed over is ignored until it closes. Resume happens 120 s after the game is gone.
