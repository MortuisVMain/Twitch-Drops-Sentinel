# 078. Old copies kept the autostart, the port and the giveaways task

## Symptom
Users unpack every release into a new folder instead of updating. The old copy keeps starting with Windows (the Run value
`TwitchDropsSentinel` always has the same name, so it points at whichever folder wrote it last), holds the
`Global\TwitchDropsSentinel_v3_Mutex` mutex and port 28492, so the new copy cannot start. The old copies' scheduler tasks
claim giveaways in parallel with the same logins, and v2 left a Startup shortcut to `start_sentinel_silent.bat`.

## Design
- `core/startup_copies.py`: a read-only finder behind an injectable `Backend` (registry Run/RunOnce of HKCU, HKLM read-only,
  Startup `.lnk` targets, `FreeGamesClaimerStudio*` tasks, running `TwitchDropsSentinel.exe`), `StartupCopies` with the cached
  state and the actions. Every system access is a fake in the tests; a test run of the service uses `NullBackend`.
- Removal appends the original (value name and data, shortcut bytes, task XML from Export-ScheduledTask) to
  `data/startup_cleanup_backup.json` first and only then deletes; the only thing removed from disk is the `.lnk` itself. `restore()` puts an entry back.
- Closing a running copy: WM_CLOSE, then a kill of its process tree after 3 s; only a `TwitchDropsSentinel.exe` from another folder.
- Start check once per service start: entries whose folder is gone (and whose drive exists, so an unplugged disk is not a deleted copy)
  are removed automatically; live findings produce one notification per set (key = hash of the finding ids).
- API (`core/startup_copies_routes.py`, same auth as the rest): `GET /api/startup-copies[?rescan=1]`, `POST .../remove {id}|{all:true}`,
  `.../move-autostart`, `.../close {id}`, `.../import {dir, confirm}`, `.../dismiss-hint`. Unknown id 404, malformed body 400, refusal 409.
- Data import (`core/copy_import.py`): staged marker `data/import_pending.json`, applied at the next start before settings load,
  after saving the replaced files to `data/import_backup_<time>/`; runtime state (browser profiles, screenshots, logs, backups) is not copied.
- Start conflict (`desktop/StartConflict.cs`, checked by `tools/start_conflict_check`): when the mutex is taken by an older (or unknown-version)
  copy from another folder the user is asked; Yes closes it (CloseMainWindow, kill tree after 5 s) and takes the mutex over (an abandoned mutex counts).
- Installer hint: shown once (`installer_hint_dismissed`) when this copy has no `unins*.exe` and sits in Downloads or other copies were found.

## Pitfalls
- Never touch the machine in tests: `Backend` fakes, `NullBackend` under `SENTINEL_TEST_MODE`.
- A legacy task named `FreeGamesClaimerStudio` whose runner is this folder is ours (it is adopted at start), a task of unknown origin is shown but never removed.
