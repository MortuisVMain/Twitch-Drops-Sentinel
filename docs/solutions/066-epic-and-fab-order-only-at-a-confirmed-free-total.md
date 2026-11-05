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
