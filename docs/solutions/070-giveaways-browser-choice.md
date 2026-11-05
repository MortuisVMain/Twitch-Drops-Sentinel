# 070. Browser choice for giveaway sign-in and claims

## Problem
Every store script asked for `channel: 'chrome'`. When Chrome was missing, `src/browser.js` silently moved to Edge and then to the bundled Chromium. The user could not say which browser signs in and claims, and a run could end in a browser they never meant to use. One shared profile (`giveaways_engine/data/browser`) held every sign-in.

## Decision
The user picks the browser in the "Проверить готовность" window (Giveaways tab): **Автовыбор** (default), **Google Chrome**, **Microsoft Edge**, **Встроенный Chromium**. Chromium-family only: no Firefox, Brave or Yandex.

| Step | Where |
|---|---|
| Saved as `giveaways_browser` in `config.json` (`auto`, `chrome`, `msedge`, `chromium`; missing or unknown reads as `auto`, an unknown value is named once in the log) | `core/giveaways_controller.py` `read_browser_setting`, written by `POST /api/v1/giveaways/browser` |
| Manual runs (claim, sign-in, switch account) get `FGC_BROWSER` in the child environment | `GiveawaysOrchestrator._child_env` |
| Scheduled runs read `giveaways_browser` from `--config` when the task runs, like the store choice | `giveaways_engine/runner.js` `applyScheduledBrowser` |
| The one place that acts on it: channel, fallback policy, profile | `giveaways_engine/src/browser_choice.js`, used by `launchContext` and `src/config.js`. No store script changed |
| Readiness shows the offered browsers (installed ones; Chromium is always offered, the engine downloads it through the existing `npx patchright install chromium`) and a chosen browser that is gone as a `todo` item | `core/giveaways_readiness.py` |

`auto` keeps the old order (Chrome, Edge, bundled Chromium with auto-install) and the old profile. An explicit `chrome` or `msedge` that cannot start fails that store's run with one log line that names the browser and says where to change it. Nothing else is launched. `chromium` uses the bundled build only.

## One profile and one record of sign-ins per browser
| Choice | Profile | Sign-in record |
|---|---|---|
| `auto`, `chrome` | `data/browser` (unchanged) | `data/sessions.json` (unchanged) |
| `msedge` | `data/browser-msedge` | `data/sessions-msedge.json` |
| `chromium` | `data/browser-chromium` | `data/sessions-chromium.json` |

`BROWSER_DIR`, when set, still wins for the profile folder. The "switch account" cookie clear acts on the context `launchContext` opened, so it acts on the selected profile by construction.

**Why sessions per browser.** `sessions.json` says "this store was signed in" and drives the store cards and the readiness list. After a switch to Edge the Edge profile has no cookies, so a card that still said "signed in" would be false. The smallest correct change is one file per profile: the existing file stays the record of the shared profile, nothing is migrated, nothing is lost. For the new profiles the card does not fall back to the account named by claimed games (that fallback exists only for old installs of the shared profile). The claimed-games databases (`epic-games.json`, ...) stay shared: a game that is owned is owned in every browser.

The cards follow the setting without a restart: the inventory cache is keyed by the browser as well as by file times.

Changing the browser is refused (409) while a claim, a sign-in, an engine install or the scheduled task is running. The check and the write happen under the same lock `start_claim` uses.

## Why cookies are not imported from the user's own browser
Known, not re-measured here:
- Chrome 127+ on Windows encrypts cookies with app-bound encryption: only Chrome's own elevation service can unwrap the key. Reading them from outside means bypassing that protection.
- Chrome 136+ refuses `--remote-debugging-port` and automation against the default user data directory, so the engine could not reuse the user's real profile either way. It needs its own profile folder, which is what it has always had.
- Copying another browser's cookie store is what credential stealers do. Antivirus tools flag it, and the user's app would carry that behaviour.
- Replaying a session in a different browser fingerprint is a good way to get a store account locked.

So each browser signs in once, by hand, in its own profile. The window says so ("В этом браузере нужно войти в магазины заново…").

## Checks
- `tools/engine_tests/browser_choice.test.mjs`: resolver, profile and sessions names, no fallback for explicit `chrome`/`msedge`, fallback intact for `auto`, `chromium` path, `BROWSER_DIR` override, invalid value, cookie clear on the selected profile (stub browsers, no store).
- `test_sentinel_suite.py`: `test_giveaways_browser_choice_in_the_service` (setting, env of a run, route validation and refusals, readiness, sessions per browser with the old file byte for byte) and `test_giveaways_browser_choice_in_the_runner_and_engine` (scheduled and manual runner env, UI texts).
- `tools/check_browser_choice.cjs`: labelled native select, keyboard, posted value, offered list only, note, missing browser, refusal shown, narrow screen, English.
- New Russian strings are in `src/i18n/en/giveaways.ts` (see 057); `tools/check_text_lcd.cjs` still passes (the select is a `tactile-btn`: inset shadow only, see 067).

## Not checked on this machine
- Any real store: no store site was opened, no sign-in or claim was run.
- Firefox, Brave, Yandex: not supported by design.
- An uninstalled Chrome or Edge: both are installed here. The "missing browser" path was driven with a stub launcher and with a real channel that is not installed (`msedge-dev`).
- A first-time download of the bundled Chromium (`npx patchright install chromium`): the build was already present, so the download branch ran only against stubs.
- The scheduled task itself (Windows Task Scheduler): the runner was run by hand with `--scheduled --config`, the task was not touched.
- The readiness window inside the real WebView2 shell: checked in headless Edge against the offline fixture only. A native `<select>` list popup looks different in WebView2.
- `tools/check_text_lcd.cjs` does not open the readiness window, so ClearType in that window is covered by the styling rule, not by a measurement.
