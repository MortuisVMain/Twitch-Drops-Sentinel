# 065. A swallowed NameError hid a dangerous default

## Symptom
A clean install had power-off after farming switched ON, although `config.default.json` says `false`. "Reset settings"
did the same.

## Cause
- `load_settings` copies `config.default.json` to `config.json` when the latter is missing. The copy sat in
  `except Exception` and the module had no `import shutil`, so the copy raised `NameError` on every clean start and the
  handler logged it at `DEBUG`, below the file's `INFO`. Nothing showed in the logs.
- Without the copy the code fell back to `SUPERVISOR_DEFAULTS`, which held `auto_shutdown_on_complete: True` and the
  author's own `user_linked_games`. The same dict feeds `handle_reset_settings`, so reset turned power-off on too.
- Two sources of defaults had drifted apart, and the one that won was the unreviewed one.

## Fix
- `SUPERVISOR_DEFAULTS`: `auto_shutdown_on_complete` is `False`, `user_linked_games` is `[]`.
- The failed template copy is logged at `WARNING`: a failed copy now changes what the user gets.
- Existing users are unaffected: `load_settings` overlays their `config.json` on the defaults.

## Rule
A catch-all around an optional step must not log at `DEBUG` when the fallback is not equivalent. Defaults that can
trigger a destructive action (power-off) ship off, in code and in the template.

## Regression test
`test_safe_defaults_power_off_and_linked_games` and `test_clean_install_copies_the_default_config_template` in
`test_sentinel_suite.py`.
