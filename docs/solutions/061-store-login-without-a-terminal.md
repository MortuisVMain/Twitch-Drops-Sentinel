# 061. Store sign-in on the Giveaways tab never finished

## Symptom
A friend's install: all 7 stores stay on "Sign-in required". The log stops at `Press ESC to skip the prompts ...`.

## Root causes
Checked with the app's process chain (Python without stdin -> `runner.js` -> store script), a real browser and a clean profile, nobody signing in, Node 24.19:

| Store | Before |
|---|---|
| Epic, GOG, Steam, Prime | `prompt()` waits for a terminal answer for the whole login timeout, then `ERR_USE_AFTER_CLOSE` kills the process and the browser window with it |
| Fab | Fails about 10 s after the window opens: it never waited for a login |
| Unity | `waitForURL` matches the store page a signed-out visitor is already on: false "Login detected" |
| Itch.io | Waits correctly |

On top of that, the card showed an account only when `total_items > 0`, so a successful login with nothing to claim still read "Sign-in required" (all 7 stores). The UI also threw away every refusal (`actionError` was never rendered, `handleStoreAuth` did not check `res.ok`), and SSE `state` events, which carry no store data, replaced the store data for up to 5 s.

## Why it was non-obvious
- The app has no terminal: a child of the service gets stdin at EOF, so Enquirer's prompt can never be answered. `process.stdin.isTTY` tells the two apart.
- The crash needs a recent Node: the readline `pause()` after close throws on 24.19. Older versions were not run; there the prompt only blocks the login for the timeout.
- Prompts print no newline, so the line-based log shows nothing while one is waiting.

## Fix
- `prompt()` answers immediately without a TTY; the login happens in the browser window. `loginHint()` replaces the terminal instructions.
- Stores record a confirmed login in `giveaways_engine/data/sessions.json` via `markSignedIn()`; the controller reads it for the card. Older installs still get the account from claimed games.
- Fab and Unity poll for a real login. Unity needs the sign-in controls gone twice in a row on the store page. Steam exits at once in background mode, like the other stores.
- The UI shows refusals and a hint during the login, and says so when a login run ends without an account.

After changing engine sources, rebuild `giveaways_engine/dist`: `runner.js` prefers it over the sources. With `node_modules` as a junction, pass `--preserve-symlinks` to esbuild or the bundle comments pick up relative paths.

## Tests
`test_store_login_finishes_without_a_terminal` runs the shipped `dist/*.mjs` at stdin EOF against a stub `patchright`. A stub missing a page method makes a script throw before the code under test: check that the test can fail. `test_store_card_shows_login_even_with_nothing_claimed` covers the card.

## Not verified
A real login to each store: it needs real accounts. Prime's `waitForURL(.../claims/home?signedIn=true)` and Epic's exact redirect are the likeliest to break next.
