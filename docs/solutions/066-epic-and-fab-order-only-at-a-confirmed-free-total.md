# 066. Epic and Fab could click an order that costs money

## Symptom (found by reading the code)
- Epic: the GET branch clicked the purchase button for any text ("Buy Now", "$9.99"). The modal loop clicked "Place Order", "Yes, buy now" and "Add to library" with no check. The checkout button inside the iframe and the page-level order button were clicked with no total check. An add-on that "requires base game" queued the base game and itself again with no price check, and the loop could never end.
- Fab: "Buy now" and then "Place Order" in the checkout frame were clicked for every listing, including the ones read from the page, which have no price at all. A search result with any promotional discount counted as free.
- The Giveaways tab listed every entry of the engine's database as claimed or existed, so a refused or failed game would have shown as claimed.

## Rule
An order, purchase or "Get" click happens only when free is positively confirmed. Unknown, unreadable or not free: no click, a `failed:not-free` or `failed:total-unknown` status and a log line.

## What changed
- `giveaways_engine/src/checkout.js`: `readPageText` also reads an iframe (a frameLocator has no page text, it is read through its body); `settledOrderState` returns free/paid/unknown; `clickOnlyIfFree` clicks only when the button names no price, the total holds at zero for three reads and reads zero once more right before the click. With `freeWord` the words Free / Бесплатно in place of an amount count as zero. Unity keeps its behaviour.
- `giveaways_engine/src/orders.js`: the Epic Get button (exactly Get / Получить), the modal loop (dismissals apart from order buttons, bounded), Fab's Buy now, and the Fab 100% discount filter.
- `epic-games.js`, `fab.js`: every order click goes through the gate. "Requires base game" queues nothing: the add-on is claimed in a later run once its base game is in the library.
- `core/giveaways_controller.py`: `owned_status` lists only claimed, existed and manual entries.
- `giveaways_engine/dist/*.mjs` are what the runner starts: rebuild them (`npm run build` in `giveaways_engine` with the engine's dependencies installed, `--preserve-symlinks` if `node_modules` is a junction) so that the bundles hold the same code as the sources.

## Cost
A truly free game is refused when its checkout shows no total line, or words the total in a way the reader does not know. It stays in the store's free list and is claimed by hand.

## Tests
`tools/engine_tests/no_paid_orders.test.mjs` (fake pages only) and `test_no_order_without_a_confirmed_free_total` in `test_sentinel_suite.py`.

## Second pass: an order-capable click needs positive evidence of free
A review found no way to place a paid order on its own, but these gaps. The principle: a refusal of a truly free game is acceptable, a paid click is not.
- Dialog buttons: `:has-text` is a substring, so "Continue to payment" or "Accept and pay $9.99" was dismissed without a check. `DISMISS_SELECTOR` now only finds candidates; `classifyModalLabel` dismisses an exact allowlisted label (Continue, Продолжить, View Product, Agree, I Agree, Accept, I Accept, Принять, Согласен, I understand). A digit or an order word (pay, buy, order, purchase, place, checkout, library, оплат, купить, заказ, библиотек) never takes the dismiss route; a button that fits nothing ends the loop with a refusal.
- Epic "Get": only Epic's call to action (`purchase-cta-button` / `sidebarBuyButton`) is located; the element is pinned (`elementHandle`), its label is read again right before the click, and the click has a 2 s timeout. The age gate can `goto` between the early read and the click, so the early label is only a hint.
- Epic "Get" needs positive evidence of free; an unknown total is refused as `failed:total-unknown`. Chosen: (1) Epic's public `freeGamesPromotions` list, read once per run, names this page's slug with a running promotional offer and `discountPrice === 0` (`freePromoSlugs`, `promoFreeForPage`); or (2) the text around the button (a few levels up, under 500 characters) shows a `-100%` badge, or Free / Бесплатно with no other amount. A struck-out original price beside `-100%` is normal and does not count as a price. A charge in that text ("Pay now", "Then $9.99/month", a total) is paid. A price with no free mark is unknown even if the list names the game. The decision is the pure function `getEvidence`. Not checked against live pages: the markup of the price block and the slug mapping are assumptions; if either is wrong the cost is a refusal, never a click.
- `clickOnlyIfFree`, `clickBuyNowIfFree` and Unity's pay click pin the element, compare its label again right before the click and click with a 2 s timeout.
- `orderTotalState`: a line with a charge word (pay now, you pay, to pay, charged, amount due, payment due, buy now for, к оплате, списан, оплатить; and pay / then / due / per month / в месяц beside an amount with a currency) and a number above zero makes the order paid even beside `Total $0.00`. "Total $9.99 (includes discount)" is paid: a saving word skips a total line only when it stands before the amount.
- Small clicks (EULA accept, parental PIN Continue, the EU "I Accept") are exact-label, `.first()`, bounded and awaited before the game is left; the EU accept happens only after a successful gated order click and never beside a paid total.
- No iframe: the fallback is entered only on a timeout. Any other error ends the game as failed. The page-level order button must be inside a dialog (`ORDER_DIALOG`) with an exact order label, and the total is read from that dialog, not from the page. "Claim", "Get Now" and "Order Now" are no longer matched.
- A claim is written only on proof: the detached "Claim" text (which resolved almost at once) is gone. No proof in time is `failed:unconfirmed`; the next run reads "In Library" and turns it into `manual`.
- Epic creates its entry with `status: 'failed'`, like Fab and Unity, so a game that was only opened is not listed as claimed. An entry seen in the library becomes `existed` (new or older without a status) or `manual` (it was failed). `owned_status` keeps counting an entry with no status key as claimed (older data).

## Second pass: cost
Free games are now refused when the promotions list is unreachable or does not name the game and the price block shows no `-100%` or Free; when a dialog button has a label outside the list; when a claim is real but its confirmation text is not recognised (shown as `failed:unconfirmed`); and a page-level order button outside a dialog. Each stays in the store's free list and is claimed by hand.

## Correction (see 069): cost of reading a listing as an order
Fab's "Buy now" read the whole LISTING page with the checkout reader `orderTotalState`, so "total ratings 15" counted as a paid total and every Fab asset was refused as `failed:not-free`. The Buy now click only opens the checkout, which is gated separately by `clickOnlyIfFree`, so it now reads the listing with `listingShowsPaidTotal` (a total or charge line with a real currency amount). Every order-capable click (Epic Get, EU accept, the checkout gate) still uses the strict reader. Details: `069-fab-total-ratings-false-paid.md`.
