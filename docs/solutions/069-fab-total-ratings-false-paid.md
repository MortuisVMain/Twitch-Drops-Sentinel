# 069. Fab refused every listing: "total ratings 15" read as a paid total

## Symptom
Since v3.5.9 every Fab asset ended as `failed:not-free` with "the listing page shows a paid total", including 100% off sales. The listing text read from a live en-US page:
```
Average rating 5.0 out of 5, total ratings 15.
...
PERSONAL
₹11,150.74
Free*
-100%
Sale ends 11/17/2026, 8:29 PM
Lowest price in 30 days before discount: ₹11,150.74
Buy now
```

## Cause
`clickBuyNowIfFree` (`giveaways_engine/src/orders.js`) ran `orderTotalState(readPageText(page), { freeWord: true })` over the WHOLE listing page. That reader is written for a checkout: any line with the word `total` followed by a digit above zero is a paid total ("total ratings 15." matched). A listing page also holds descriptions ("Total Tris: 45,000", "Total polycount 120000"), the crossed-out price, "Lowest price in 30 days" and other assets' prices.

## Rule
A page that is read for a decision must be read by a reader written for that page.
- `orderTotalState` stays strict and unchanged: it reads a CHECKOUT, and anything that looks like a total with a number stops the order.
- `listingShowsPaidTotal(text)` (`giveaways_engine/src/checkout.js`) reads a LISTING. A line counts only when it is a total line or a charge line AND it holds a money amount above zero WITH a currency symbol or a known ISO 4217 code ("Total $19.99", "Total: ₹500", "Итого 1 490 ₽", "Pay now $9.99", "Buy now for $5"). "45,000 TRI" and "15 PBR" are not money (the order reader's `[A-Z]{3}` branch would take them; the listing reader uses a list of codes). "Pay 10 credits" is not counted on a listing: a description can say it, and the checkout this click opens is gated by `orderTotalState` anyway.

## Decision per call site (what the click does)
- `orders.js` `clickBuyNowIfFree` (Fab "Buy now"): SWITCHED. The click only opens the checkout; the order is placed by `clickOnlyIfFree` on the checkout frame (`fab.js`), which reads the frame strictly. The button label is still checked for a price.
- `orders.js` `clickGetIfFree` (Epic "Get"): KEPT STRICT. The click can start an order and Epic's page text is not known to be safe; it also needs positive evidence of free (`getEvidence`). The same false refusal is possible there in principle (an Epic page with "total ratings 15"); cost is a refusal, never a click. Not changed because no measurement shows it and `orderTotalState` must stay as it is.
- `orders.js` `acceptEuAgreement` (EU "I Accept"): KEPT STRICT. It completes an order step after the gated order click, and refusing leaves the order unfinished, which is the safe side.
- `orders.js` `getEvidence` (Epic price block, under 500 characters around the button): unchanged, it reads a small block, not a page.
- `unity.js` (`waitForFreeOrder`, the last look before the pay click): unchanged; those read the cart/checkout, where the order reader is right.

## Honest summary of a run
`runner.js` printed `✓ <store>: сбор успешно завершен.` on exit code 0 even when every asset was refused or the store was skipped (not signed in, exit 0). Exit code 0 only says the script did not crash. Now each store script (Fab, Unity, Epic, GOG) writes its counts (`claimed`, `existed`, `refused`, `failed`, `other`, or `skipped: 'login'`) to the file named in `SENTINEL_RUN_REPORT`, and the runner prints one line from it (`src/runsummary.js`): `⚠ Fab / Unreal Engine: отклонено 3, получено 0 ...`, `⚠ Unity Asset Store: пропущено, нужен вход`, `✓ GOG: новых раздач нет`, `✓ Epic Games: получено 2`. Steam, Itch.io and Prime Gaming do not report yet and keep a neutral `<store>: завершён.` line (not a ✓). Exit codes are unchanged. The app judges a scheduled run only by the LAST line of the log (`RUN_DONE_MARK` / `RUN_FAILED_MARK` in `core/giveaways_controller.py`); the summary lines sit in the middle and do not touch that. The engine log lines are not part of the UI translator (`src/i18n`, solution 057 covers `src/` only), so no English strings were added.

## Tests
`tools/engine_tests/no_paid_orders.test.mjs`: the real listing text lets Buy now through and a checkout frame with `Total $19.99`, an empty or an unreadable total still refuses; listing lines that are not paid and paid lines; the order reader still reads `total ratings 15.` as paid; the summary for refused, skipped, clean, claimed and unknown runs; the report file round trip.

## Not verified
- The checkout frame has not been reached on live Fab since v3.5.9, so the full path (Buy now, checkout frame total, order click, `acquired` check) is untested against the live site. Only fake pages were used.
- The layout of the real checkout frame text is unknown: if its total is worded in a way the order reader does not know, the order is refused as `failed:total-unknown` (the safe side) and is claimed by hand.
- The real Buy now click and the report file under the packaged app (the runner running inside the service) were not run.

## Live result, and two more causes (v3.5.13)
The first real run after 069 showed what could not be seen on fake pages:
- **The free checkout has no total line.** Live text: `TRY 0.00`, `This is free. Add it to your library to get started.`, `Add to library`. Free now also needs that exact sentence, a zero amount on its own line and no amount above zero anywhere.
- **The Epic price block renders in two steps.** The base price comes first and `-100%` / `Free` a moment later, so one early read refused a free game. An undecided block is read again for up to 8 s; a charge is final.
- **Epic can answer Get with its account chooser.** That is now reported as `failed:login-required` at once instead of a two-minute wait.

Checked with real claims from the app's own button on 2026-11-05: Fab received 3 assets, confirmed `[Owned]` by the next run, and Epic received Flotsam. Nothing was charged: the totals were zero.

Lesson: order code must be checked on the real page. The fake pages only repeated what the author assumed the checkout says, and two releases in a row refused free games.
