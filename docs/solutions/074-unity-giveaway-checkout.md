# 074. Unity: signed in, but the weekly giveaway was never claimed

## Symptom
The user was signed in to Unity, but every Unity run still failed. First it was "Could not parse giveaway details". After that came "Safety guard tripped: Cart total is not a clear 0", and at the end "Checkout confirmation button not visible". From the outside it looked as if Unity kept signing the user out.

## Causes (one behind the other)
1. **The giveaway link was renamed.** The button said "GET YOUR FREE GIFT"; since November 2026 it says "SHOP NOW". The engine looked for the old label and found no link.
2. **The VAT question was answered too early.** The checkout (pay.unity.com) draws `#org_address_form` a few seconds after the page loads. The engine checked once, found no form, and skipped the "Not VAT-registered" answer. With "Yes" saved and no tax number, Unity refuses the coupon: "Organization address info is not complete or correct". It shows this message beside the coupon field, nowhere else.
3. **The coupon field also appears late**, so sometimes no Apply happened at all. And an Apply clicked while the page redraws after the VAT answer can be lost.
4. **The money gate could not read the Unity total.** The English page calls it "To pay now", a label the gate did not know, so the gate answered `unknown`. The item table has a "Total" / «Всего» column heading followed by the asset's name, "2D Minimal - Character Maker", and the gate read the "2" as a price.
5. **Every control is drawn twice, and one copy is hidden.** That includes the coupon field, Apply and Pay now. The engine took the hidden copy. After Pay now, the redirect takes longer than the 2-second click timeout.

## Fix
- The link is taken from the giveaway block: the nearest ancestor of the "PUBLISHER ASSET GIVEAWAY" heading that holds a `/packages/` link.
- The engine waits up to 15 s for the billing form and up to 15 s for the coupon field. It logs whether the VAT question is now answered "No".
- The coupon is applied only if the total is not already free (the code can equal the publisher's name, "LAYERLAB"). Up to 3 attempts, each waiting up to 8 s for the total to become free.
- `orderTotalState` (src/checkout.js) now knows "to pay now". A line under a total heading that starts with digits glued to letters ("2D", "3D") and holds no money amount is treated as a name. Any line with money ("10руб", "9.99USD", "2x $5", "3D pack $4.99") still counts, so the gate stays strict. The tests are in `tools/engine_tests/no_paid_orders.test.mjs`.
- Only visible copies of the coupon field, Apply and the pay button are used. The pay click has `noWaitAfter`, and the confirmation loop that follows waits for the redirect.
- If the gate refuses, the log quotes Unity's coupon-block message: only the summary block, never the billing form.

The user's billing data is never filled in or changed. The only answer the engine gives is "No" to the VAT question, as before.

## Checked live (2026-11-06)
Background runs on the user's account, Russian and English pages. On the final run the engine answered VAT "No", applied the coupon on the first attempt, saw "To pay now $0.00", and clicked Pay now. The next run reported "2D Minimal - Character Maker is already in your Unity library". Before that, every failed run stopped at the gate, and nothing was charged.

## Not verified
The full path including the confirmation page with the `noWaitAfter` click: the asset was already owned after the run that placed the order, so the next giveaway will be the first full run.
