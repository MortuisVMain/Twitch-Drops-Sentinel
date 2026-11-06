# 073. Epic: "Confirm Your Account" after Get, so signing in again never helped

## Symptom
Every Epic run ended with "Epic asks to sign in again (account page after Get)". The user signed in to Epic from the store card five times and nothing changed. The store page showed "Get" for games that were already owned.

## Cause
The store session was valid ("Signed in as MORTUIS_V"), but Epic wanted the account confirmed before the purchase flow. After Get it opened `epicgames.com/id/login/switch-account` ("Confirm Your Account", "Welcome back") with the remembered account as a tile. Nobody picks it in a background window, so the run gave up. Signing in again from the card does not reach this page: it only checks that the store is signed in, which it already was.

## Fix
`confirmEpicAccount()` in `giveaways_engine/src/orders.js` picks the tile whose text is exactly the signed-in account. That is a sign-in choice, no credential is typed and no order is placed. When Epic returns to the store, the game is tried once more (`retriedAfterConfirm`, once per game; an unbounded re-queue once never ended). A password prompt or anything else still ends as `failed:login-required`.

## Checked live (2026-11-06)
A visible run on the user's account: the tile was picked, Epic returned to the Flotsam page, and both Flotsam and Idle Champions then read "In library". So "Get" had only reflected the unconfirmed store session; the games were owned already. No password was asked.

## Not verified
The same step in background mode on a real run (the click is programmatic and needs no visible window, but it was not observed there). A password prompt after the tile: it did not happen, so only the fake-page test covers it.
