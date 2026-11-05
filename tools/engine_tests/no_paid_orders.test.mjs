// An order, purchase or "Get" click happens only when free is positively confirmed.
// Every page here is a fake object or static text: no browser, no store, no account.
// Run: node --test tools/engine_tests/no_paid_orders.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE = path.join(ROOT, 'giveaways_engine');
const load = file => import(pathToFileURL(path.join(ENGINE, 'src', file)).href);
const { orderTotalState, readPageText, settledOrderState, clickOnlyIfFree, NOT_FREE, TOTAL_UNKNOWN } = await load('checkout.js');
const orders = await load('orders.js').catch(err => ({ missing: err.message }));

// ---------- fakes ----------
const timer = { waitForTimeout: async () => {} };
const button = (text, log, { visible = true } = {}) => ({
  first() { return this; }, // a locator is narrowed with first(); the fake is its own first match
  innerText: async () => { if (text instanceof Error) throw text; return text; },
  isVisible: async () => visible,
  click: async () => { log.push(`click:${text}`); },
});
/** A page: evaluate() gives its text. `texts` may be a list that advances on every read (last one repeats). */
const fakePage = (texts, buttons = {}) => {
  const list = [].concat(texts);
  let i = 0;
  return {
    ...timer,
    evaluate: async () => list[Math.min(i++, list.length - 1)],
    locator: sel => buttons[sel] ?? button('', [], { visible: false }),
  };
};
/** An iframe as playwright gives it: a frameLocator, which has locator() and NO evaluate(). */
const fakeFrame = (texts) => {
  const list = [].concat(texts);
  let i = 0;
  return {
    locator: sel => {
      assert.equal(sel, 'body', 'the frame is read through its body');
      return { innerText: async () => { const t = list[Math.min(i++, list.length - 1)]; if (t instanceof Error) throw t; return t; } };
    },
  };
};

// ---------- the total reader on Epic and Fab wording ----------
test('order totals: EN and RU wording of Epic and Fab checkouts', () => {
  const free = ['Total $0.00', 'Total\n$0.00', 'Итого 0,00 ₽', 'Итого\n0 ₽', 'Total 0,00 €', 'Order total $0.00',
    'Price $29.99\nSale discount -$29.99\nTotal $0.00', 'Item $0.00\nTotal $0.00'];
  const paid = ['Total $0.99', 'Total 20,00 €', 'Итого 1 490 ₽', 'Итого 1 490 ₽', 'Total $9.99\nTotal $0.00',
    'Item $0.00\nTotal $19.99', 'Add-on $0.00\nTotal 20,00 €', 'Total $0.00\nOrder total $5.00', 'Итого 0 ₽\nИтого 199 ₽'];
  const unknown = ['', 'Your order', 'Add to library', 'Price $0.00', 'Subtotal $0.00', 'Total', 'Total 0', 'Total $0.00 or so'];
  for (const text of free) assert.equal(orderTotalState(text), 'free', JSON.stringify(text));
  for (const text of paid) assert.equal(orderTotalState(text), 'paid', JSON.stringify(text));
  for (const text of unknown) assert.equal(orderTotalState(text), 'unknown', JSON.stringify(text));
  // The words Free / Бесплатно count as a zero total only where the caller asks for them, and never beat a price
  assert.equal(orderTotalState('Total Free'), 'unknown');
  for (const text of ['Total Free', 'Total\nFree', 'Итого Бесплатно', 'Итого\nБесплатно']) {
    assert.equal(orderTotalState(text, { freeWord: true }), 'free', JSON.stringify(text));
  }
  for (const text of ['Total Free\nTotal due $5.00', 'Total Free shipping', 'Total Free $5.00']) {
    assert.notEqual(orderTotalState(text, { freeWord: true }), 'free', JSON.stringify(text));
  }
});

test('the reader really reads an iframe (a frameLocator has no page text)', async () => {
  assert.equal(await readPageText(fakeFrame('Total $0.00')), 'Total $0.00');
  assert.equal(await readPageText(fakeFrame(new Error('detached'))), '');
  assert.equal(await readPageText(fakePage('Итого 0 ₽')), 'Итого 0 ₽');
  assert.equal(await settledOrderState(fakeFrame('Total $0.00'), { timer }), 'free');
  assert.equal(await settledOrderState(fakeFrame('Total $4.00'), { timer, tries: 3 }), 'paid');
  assert.equal(await settledOrderState(fakeFrame(''), { timer, tries: 3 }), 'unknown');
});

// ---------- the shared order gate ----------
test('clickOnlyIfFree: refuses everything but a confirmed free total', async () => {
  const cases = [
    ['paid iframe', fakeFrame('Total $19.99'), 'Place Order', NOT_FREE],
    ['paid iframe in RU', fakeFrame('Итого 1 490 ₽'), 'Оформить заказ', NOT_FREE],
    ['iframe that cannot be read', fakeFrame(new Error('frame detached')), 'Place Order', TOTAL_UNKNOWN],
    ['iframe with no total at all', fakeFrame('Your order\nAdd to library'), 'Add to library', TOTAL_UNKNOWN],
    ['zero line next to a paid total', fakeFrame('Item $0.00\nTotal $19.99'), 'Place Order', NOT_FREE],
    ['price on the button', fakeFrame('Total $0.00'), 'Pay $9.99', NOT_FREE],
    ['page with a paid total', fakePage('Total 20,00 €'), 'Place Order', NOT_FREE],
    ['page with no total', fakePage('Epic Games Store'), 'Place Order', TOTAL_UNKNOWN],
    ['button without text', fakeFrame('Total $0.00'), '', TOTAL_UNKNOWN],
    ['button that cannot be read', fakeFrame('Total $0.00'), new Error('gone'), TOTAL_UNKNOWN],
    ['total flips to paid before the click', fakeFrame(['Total $0.00', 'Total $0.00', 'Total $0.00', 'Total $9.99']), 'Place Order', NOT_FREE],
  ];
  for (const [name, source, label, status] of cases) {
    const log = [];
    const res = await clickOnlyIfFree(button(label, log), source, { timer, tries: 4 });
    assert.deepEqual(log, [], `${name}: no click may happen`);
    assert.equal(res.refused, true, name);
    assert.equal(res.status, status, name);
    assert.ok(res.reason, `${name}: a clear reason`);
  }
});

test('clickOnlyIfFree: clicks when free is confirmed (the guard does not block everything)', async () => {
  for (const [source, label] of [
    [fakeFrame('Price $29.99\nSale discount -$29.99\nTotal $0.00'), 'Place Order'],
    [fakeFrame('Итого 0 ₽'), 'Оформить заказ'],
    [fakeFrame('Total Free'), 'Add to library'],
    [fakePage('Total $0.00'), 'Add to library'],
    [fakeFrame(['Total $29.99', 'Total $0.00']), 'Place Order'], // a coupon applies, then it holds at zero
  ]) {
    const log = [];
    const res = await clickOnlyIfFree(button(label, log), source, { timer });
    assert.equal(res.refused, false, label);
    assert.deepEqual(log, [`click:${label}`]);
  }
});

// ---------- Epic: the "Get" button ----------
test('Epic Get click: only a positively recognised free action', async () => {
  for (const label of ['buy now', '$9.99', 'get $9.99', 'купить сейчас', 'pre-purchase', 'add to cart', 'get started', 'в корзину', '']) {
    const log = [];
    const res = await orders.clickGetIfFree(button(label, log), label, fakePage('Epic Games Store'));
    assert.deepEqual(log, [], `${JSON.stringify(label)} must not be clicked`);
    assert.equal(res.refused, true);
    assert.ok(res.status === NOT_FREE || res.status === TOTAL_UNKNOWN);
  }
  const paidPage = button('get', []);
  const res = await orders.clickGetIfFree(paidPage, 'get', fakePage('Total $4.99'));
  assert.equal(res.refused, true, 'a page that shows a paid total is not free');
  for (const label of ['get', 'Get', 'получить', ' Получить ']) {
    const log = [];
    const res2 = await orders.clickGetIfFree(button(label, log), label, fakePage('Epic Games Store'));
    assert.equal(res2.refused, false, label);
    assert.equal(log.length, 1, `${label} is a free action and is clicked`);
  }
});

// ---------- Epic: the modal loop ----------
test('Epic modal loop: harmless dialogs are dismissed, an order button goes through the gate', async () => {
  const log = [];
  let dismissed = false;
  const dismiss = { first() { return this; }, innerText: async () => 'Continue', isVisible: async () => !dismissed, click: async () => { dismissed = true; log.push('click:Continue'); } };
  const paid = fakePage('Total $19.99', { [orders.DISMISS_SELECTOR]: dismiss, [orders.ORDER_SELECTOR]: button('Place Order', log) });
  const res = await orders.settleModals(paid, { log: () => {} });
  assert.deepEqual(log, ['click:Continue'], 'the harmless dialog is dismissed, the order is not placed');
  assert.equal(res.refused, true);
  assert.equal(res.status, NOT_FREE);

  // free total: the order button is clicked, once
  const log2 = [];
  const free = fakePage('Total $0.00', { [orders.ORDER_SELECTOR]: button('Place Order', log2) });
  const res2 = await orders.settleModals(free, { log: () => {}, attempts: 3 });
  assert.equal(res2.refused, false);
  assert.ok(log2.includes('click:Place Order'));

  // no total on the dialog: refused as unknown
  const log3 = [];
  const bare = fakePage('Epic Games Store', { [orders.ORDER_SELECTOR]: button('Yes, buy now', log3) });
  const res3 = await orders.settleModals(bare, { log: () => {} });
  assert.deepEqual(log3, []);
  assert.equal(res3.status, TOTAL_UNKNOWN);
});

test('Epic modal loop: a dialog that never goes away still ends', async () => {
  const log = [];
  const stuck = fakePage('Epic Games Store', { [orders.DISMISS_SELECTOR]: button('Continue', log) });
  const res = await orders.settleModals(stuck, { log: () => {}, attempts: 4 });
  assert.equal(res.refused, false);
  assert.equal(log.length, 4, 'one click per attempt, then it stops');
});

test('the selectors keep orders and dismissals apart', () => {
  for (const word of ['Place Order', 'Оформить заказ', 'Add to library', 'Добавить в библиотеку', 'Yes, buy now']) {
    assert.ok(orders.ORDER_SELECTOR.includes(word), `${word} is an order`);
    assert.ok(!orders.DISMISS_SELECTOR.includes(word), `${word} must not be dismissed without a check`);
  }
  for (const word of ['Continue', 'Продолжить', 'I understand']) assert.ok(orders.DISMISS_SELECTOR.includes(word));
});

// ---------- Fab ----------
test('Fab: Buy now needs a button without a price and a page that shows no paid total', async () => {
  for (const [label, text] of [['Buy now $19.99', 'Listing'], ['Buy now', 'Total $19.99'], ['', 'Listing']]) {
    const log = [];
    const res = await orders.clickBuyNowIfFree(button(label, log), fakePage(text));
    assert.deepEqual(log, [], `${label} / ${text}`);
    assert.equal(res.refused, true);
  }
  const log = [];
  const res = await orders.clickBuyNowIfFree(button('Buy now', log), fakePage('Free listing'));
  assert.equal(res.refused, false);
  assert.deepEqual(log, ['click:Buy now']);
});

test('Fab: the checkout frame decides the order, paid or unknown never reaches the click', async () => {
  for (const [frame, status] of [
    [fakeFrame('Total $19.99'), NOT_FREE],
    [fakeFrame('Итого 1 490 ₽'), NOT_FREE],
    [fakeFrame(''), TOTAL_UNKNOWN],
    [fakeFrame(new Error('x')), TOTAL_UNKNOWN],
  ]) {
    const log = [];
    const res = await clickOnlyIfFree(button('Add to library', log), frame, { timer, tries: 3 });
    assert.deepEqual(log, []);
    assert.equal(res.status, status);
  }
  const log = [];
  const res = await clickOnlyIfFree(button('Add to library', log), fakeFrame('Total $0.00'), { timer });
  assert.equal(res.refused, false);
  assert.deepEqual(log, ['click:Add to library']);
});

test('Fab API listings: only a 100% discount counts as free', () => {
  assert.equal(orders.isFreeListing({ priceTier: { discountPercentage: 100 } }), true);
  assert.equal(orders.isFreeListing({ priceTier: { isPromotional: true, discountPercentage: 50 } }), false);
  assert.equal(orders.isFreeListing({ priceTier: { isPromotional: true } }), false);
  assert.equal(orders.isFreeListing({}), false);
  assert.equal(orders.isFreeListing(null), false);
});

// ---------- sources: no bare order click ----------
const read = file => readFileSync(path.join(ENGINE, file), 'utf8');
const BARE_ORDER_CLICKS = ['purchaseBtn.click', 'warningBtn.click', 'checkoutBtn.click', 'pageOrderBtn.click', 'buyBtn.click', 'addBtn.click', 'payBtn.click'];

test('sources and bundles hold no bare order click and use the gate', () => {
  const epic = read('epic-games.js');
  const fab = read('fab.js');
  for (const [name, code] of [['epic-games.js', epic], ['fab.js', fab], ['dist/epic-games.mjs', read('dist/epic-games.mjs')], ['dist/fab.mjs', read('dist/fab.mjs')]]) {
    for (const bare of BARE_ORDER_CLICKS) assert.ok(!code.includes(bare), `${name} still has ${bare}`);
    assert.ok(code.includes('clickOnlyIfFree'), `${name} must use the gate (rebuild dist?)`);
  }
  assert.ok(!/urls\.push\(/.test(epic), 'epic-games.js must not queue games again: that loop never ended');
  assert.ok(!read('dist/epic-games.mjs').includes('urls.push('), 'dist/epic-games.mjs still queues games again');
  assert.ok(read('dist/epic-games.mjs').includes('clickGetIfFree') && read('dist/fab.mjs').includes('clickBuyNowIfFree'));
  // any other click in these two scripts must not be aimed at an order, purchase or checkout
  for (const [name, code] of [['epic-games.js', epic], ['fab.js', fab]]) {
    for (const [n, line] of code.split('\n').entries()) {
      if (!/\.click\(/.test(line) || line.trim().startsWith('//')) continue;
      assert.ok(!/order|purchase|checkout|buy|library|get now|claim|place/i.test(line), `${name}:${n + 1} clicks something that looks like an order: ${line.trim()}`);
    }
  }
});

test('the other stores: their order clicks stay behind their own checks', () => {
  const unity = read('unity.js');
  assert.ok(unity.includes('waitForFreeOrder') && unity.includes("orderTotalState(await readPageText(page)) !== 'free'"));
  assert.ok(unity.indexOf("orderTotalState(await readPageText(page)) !== 'free'") < unity.indexOf('payBtn.click'));
});
