# Android Login: a TV Cookie Jar Looks Like an Android One

**Date:** 2026-11-27 · **Area:** core/android_login.py, core/twitch.py (`_AuthState._validate`)

## Symptom
The first live run of the Android-client login build wiped the user's existing device-code (TV) login. The log said `Cookie client ID mismatch`, then "The saved android client login is not usable". The device-code prompt came back, and `core\cookies.jar` was deleted.

## Cause
- **Detection guessed wrong.** The client was guessed from where `auth-token` sits in the jar: under `www.twitch.tv` meant Android. But a real device-code jar also holds `auth-token` (and `unique_id`, `server_session_id`) for the whole `twitch.tv` domain, and `filter_cookies("https://www.twitch.tv")` returns it. So the TV login was taken for an Android one.
- **The mismatch path wiped the file.** It is upstream's: on a client-id mismatch it runs `jar.clear()` + `COOKIES_PATH.unlink()`, so the good TV token was thrown away.
- **Tests did not catch it.** Their fixture jars held only the host-only token and never this domain-wide cookie.
- **The wrong file was backed up.** In the installed app `COOKIES_PATH` is `<install>\core\cookies.jar`, because `WORKING_DIR` is the folder with `lang/`. The root `<install>\cookies.jar` is a stale October file. The live login was recovered from `<install>\.backup_state\cookies.jar`.

## Fix
- `client_for_jar` looks for the TV token (`android.tv.twitch.tv`) first. Android is chosen only when the TV token is absent.
- On a client-id mismatch `_validate` now checks the token's real client. If `oauth2/validate` names one of our known clients (SMARTBOX or ANDROID_APP), it switches `_client_type` and the User-Agent and keeps the login. Only an unknown client id still falls back to the wipe-and-device-code path.
- Tests: `test_a_real_tv_login_with_a_twitch_tv_wide_token_cookie_stays_tv` and `test_a_token_that_belongs_to_the_tv_client_switches_to_it_and_keeps_the_login` in `core/test_android_login_flow.py`.

## Lessons
- Build cookie fixtures from a real jar's structure (names and domains, never values). Print them with `dpapi.load_cookie_jar` and iterate the jar.
- Before a live patch of the installed app, back up `<install>\core\cookies.jar`, not the root one.
- The login window (`TwitchLoginWindow`) also had a lifecycle bug: `using var window` disposed the form before the queued `Close`, so `OnFormClosed` (WebView2 dispose + data-folder delete) never ran. `ShowAsync` now calls `Close()` explicitly.
