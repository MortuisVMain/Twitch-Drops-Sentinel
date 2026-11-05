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
- Stores record what they see in `giveaways_engine/data/sessions.json`: `{account, confirmedAt}` after a login (`markSignedIn()`), `{account: null}` when signed out (`markSignedOut()`). The controller reads it for the card. Claimed games only name the account while the engine has not reported the store yet (older installs), so a sign-out does not bring the old account back. A write failure is logged and never stops the run; a damaged file is replaced, because it only holds what the next run finds out again.
- Fab polls for a real login. Steam exits at once in background mode, like the other stores.
- Unity trusts only the store's own answer: `/account/cart` requests `CurrentUser` through `/api/graphql/batch`, and signed out that returns `{id: "0", name: "Anonymous"}`. The old check looked for sign-in controls, but its selector matches the newsletter "Sign up" button and e-mail input that are on the page for everyone. The home page does not send this request, so after coming back from Unity ID the script opens the cart page to read the answer.
- A Steam Guard code without a terminal goes through the browser window: `locator.fill(undefined)` really throws (`value: expected string, got undefined`).
- The UI shows refusals and a hint during the login. It judges the login by this attempt (`loginConfirmedAt` not older than the click, `src/utils/loginAttempt.ts`), not by an account known from before, and says so when the attempt failed.
- Review round 2: Itch accepts a login only by host (`itch.io` or `*.itch.io`) and a path without `/login`, so an OAuth page with `redirect_uri=...itch.io` is not a login. GOG, Epic and Prime log a `[SENTINEL]` line instead of typing when no code was entered; Prime logs why `INTERACTIVE=1` skipped a game. The hint «войдите в окне браузера» goes away once the attempt is confirmed. The service starts the engine with `stdin=DEVNULL` (a console would make `isTTY` true), and a failed `npm install` counts by exit code, not only by a leftover `patchright` folder. `ClaimGames.cmd` has no `pause`/`set /p` and does not go through the controller.

After changing engine sources, rebuild `giveaways_engine/dist`: `runner.js` prefers it over the sources. With `node_modules` as a junction, pass `--preserve-symlinks` to esbuild or the bundle comments pick up relative paths.

## Tests
`test_store_login_finishes_without_a_terminal` runs the shipped `dist/*.mjs` at stdin EOF against a stub `patchright`. A stub missing a page method makes a script throw before the code under test: check that the test can fail. `test_login_state_follows_the_latest_attempt` covers sign-out after a login, Steam Guard and a broken or unwritable file. `test_store_card_shows_login_even_with_nothing_claimed` covers the card. Check stubs against the real site: the Unity stub first answered on every page, and only a run against the real home page showed that it does not.

## Not verified
A real login to each store: it needs real accounts. Prime's `waitForURL(.../claims/home?signedIn=true)` and Epic's exact redirect are the likeliest to break next. For Unity, only the signed-out answer was seen; that a signed-in user gets another `id` from the same request, and that the login returns in the same tab, are assumptions. If they are wrong, the login is reported as failed, not falsely as done.

## Unity checkout: the zero check let paid orders through
Fixing the login made this path reachable for scheduled runs, so it matters more than it did. The old regex looked for a
total label, then up to 40 of any characters, then `$0` or `0 $`. It passed `Итого 1000,00 ₽` (the end of the number), `Total $0.50`
(no boundary after the zero) and `Subtotal $49.00 Tax $0.00 Total $49.00` (the tax line). `giveaways_engine/src/checkout.js` now
reads whole lines: a price is zero when it has no digit but 0, one price above zero means paid, and a page that does not say
means no order. Zero must hold for three checks while the coupon applies and is read again right before the click. The script
no longer fills in made-up billing details or ticks every checkbox on the page. Page wording was not checked on a real order:
a label the code does not know stops the order instead of charging, so the failure to expect is a missed claim.

## Switch account
All stores share one browser profile, so a valid login used to make the button start a claim under the old account. With
`?switch=1` the engine gets `FGC_SWITCH_ACCOUNT=<store>` and `launchContext` clears that store's cookies only
(`STORE_LOGIN_COOKIES` in `src/browser.js`), then the store's normal login wait takes over. Fab also clears Epic, because it
signs in through Epic and would come straight back. Sites that keep a login outside cookies were not checked on real accounts.

## The sign-in window opened almost entirely off-screen
All stores share one browser profile, and Chromium saves the window position in `Default/Preferences`. A background run moves the window off-screen, so a later visible window reopened there: `left -1250`, 1280 wide, 30 px on screen, impossible to grab. A visible window now always starts with `--window-position=100,80 --window-size=1280,900`, which overrides the saved position. Checked on a throwaway profile with that saved position: without the flags `left -1250`, with them `left 100`. No real sign-in was run.
