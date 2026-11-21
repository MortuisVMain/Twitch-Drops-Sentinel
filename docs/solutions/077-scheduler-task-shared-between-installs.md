# 077. Every installed copy took the same scheduler task for its own

## Symptom
A live check of installer 3.7.0 showed that every installed copy treats the `FreeGamesClaimerStudio` task as its own:
any copy shows its status, can switch it off or change its days, and its uninstaller may remove the task the user's
working copy relies on.

## Cause
`TASK_NAME` was one constant for every install. The task is per install (its action points into one folder), but its
name was not, so status, toggle, day changes and the uninstaller all addressed whatever task held the name.

## Fix
- `install_task_name(PROJECT_DIR)`: `FreeGamesClaimerStudio-` + first 8 hex of SHA-1 of the install path, casefolded.
- `repair_task_paths` at service start calls `_adopt_legacy_task`: a task under the old name moves to this install's
  name with `Register-ScheduledTask -InputObject` (days, time, settings and Disabled state kept, checked on Windows 11
  with a throwaway task), then the old name is unregistered.
- The uninstaller enumerates `FreeGamesClaimerStudio*` and removes only tasks whose action points into its folder.

## Non-obvious decisions
- **Who gets the old task.** The install whose `runner.js` it points to. If that file no longer exists (a deleted ZIP
  folder), the first install without a task of its own takes it and re-points it; an install that already has one leaves
  it for the copy it belongs to. A task whose `runner.js` still exists elsewhere is never touched.
- **A leftover copy is removed.** If the move registered the new task but failed to unregister the old one, the next start
  sees the old task pointing here while the own one exists, and only unregisters it, so the job never runs twice.
- **The installer does not compute the hash.** Matching by action path is what it already did; recomputing SHA-1 in
  Pascal would have to reproduce Python's path normalisation exactly.
