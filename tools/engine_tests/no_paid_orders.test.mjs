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
const button = (text, log, { visible = true, waitFails = false } = {}) => ({
  first() { return this; }, // a locator is narrowed with first(); the fake is its own first match
  filter() { return this; },
  locator() { return this; },
  waitFor: async () => { if (waitFails) throw new Error('Timeout'); },
  innerText: async () => { if (text instanceof Error) throw text; return text; },
  isVisible: async () => visible,
  click: async () => { log.push(`click:${text}`); },
  check: async () => { log.push('check'); },
  pressSequentially: async s => { log.push(`type:${s}`); },
});
/**
 * A locator that can be pinned like a real one: elementHandle() gives the element, which keeps its own label.
 * `labels` advances on every read of the element (the last one repeats), `clicks` records the options of each click.
 */
const pinnable = (labels, log, clicks = []) => {
  const list = [].concat(labels);
  let i = 0;
  const handle = {
    innerText: async () => list[Math.min(i++, list.length - 1)],
    isVisible: async () => true,
    evaluate: async () => handle.block ?? '',
    click: async opts => { log.push('click:handle'); clicks.push(opts); },
    dispose: async () => { log.push('dispose'); },
  };
  return {
    handle,
    first() { return this; },
    elementHandle: async () => handle,
    innerText: async () => { throw new Error('the lazy locator must not be read once the element is pinned'); },
    click: async () => { log.push('click:LAZY'); },
  };
};
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
    // positive evidence of free (Epic's promotions list names this game at 0) is now required as well
    const res2 = await orders.clickGetIfFree(button(label, log), label, fakePage('Epic Games Store'), { promoFree: true });
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
  // A game is queued again only once, after Epic's account confirmation: an unbounded re-queue once never ended
  assert.equal((epic.match(/urls\.push\(/g) || []).length, 1, 'epic-games.js queues a game again in one place only');
  assert.ok(/if \(confirmed === 'confirmed' && !retriedAfterConfirm\.has\(url\)\)[\s\S]{0,400}retriedAfterConfirm\.add\(url\);[\s\S]{0,200}urls\.push\(url\)/.test(epic),
    'the one re-queue is guarded: once per game, only after a confirmed account');
  assert.equal((read('dist/epic-games.mjs').match(/urls\.push\(/g) || []).length, 1, 'dist/epic-games.mjs matches the source: one guarded re-queue (rebuild dist?)');
  assert.ok(read('dist/epic-games.mjs').includes('retriedAfterConfirm.has(url)'), 'dist/epic-games.mjs carries the once-per-game guard');
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

// ======================================================================================================
// Second pass: an order-capable click happens only on positive evidence of free
// ======================================================================================================

// ---------- totals: a charge line beats a zero total line ----------
test('order totals: a line that says what is charged makes the order paid', () => {
  const paid = [
    'Total $0.00\nPay now $9.99', 'You will be charged $9.99 today', 'Payment due: $9.99', 'Buy now for $9.99',
    'Total Free\nPay $9.99', 'Free trial\nThen $9.99/month\nTotal $0.00', 'Total $0.00\nYou pay $4.99',
    'Total $0.00\nTo pay: 4,99 €', 'Итого 0 ₽\nК оплате 499 ₽', 'Итого 0 ₽\nБудет списано 499 ₽', 'Total $0.00\n$4.99 per month',
    'Total $0.00\nОплатить 499 ₽', 'Итого 0 ₽\n299 ₽ в месяц', 'Total $9.99 (includes discount)\nTotal $0.00',
  ];
  for (const text of paid) {
    assert.equal(orderTotalState(text, { freeWord: true }), 'paid', JSON.stringify(text));
    assert.notEqual(orderTotalState(text), 'free', JSON.stringify(text));
  }
  // a savings line or a zero charge is still not what gets charged
  for (const text of ['Total savings $5.00\nTotal $0.00', 'Pay now $0.00\nTotal $0.00', 'Amount due $0.00\nTotal $0.00', 'You pay $0.00\nTotal $0.00']) {
    assert.equal(orderTotalState(text), 'free', JSON.stringify(text));
  }
  // the description of a game is not a price list
  assert.equal(orderTotalState('Survive 100 days, then escape.\nTotal $0.00'), 'free');
});

// ---------- modal loop: a dismissal is an exact label ----------
test('modal labels: only an exact harmless label is dismissed', () => {
  for (const label of ['Continue', 'continue', ' CONTINUE ', 'Продолжить', 'View Product', 'Agree', 'I Agree', 'Accept', 'I Accept', 'Принять', 'Согласен', 'I understand']) {
    assert.equal(orders.classifyModalLabel(label), 'dismiss', label);
  }
  for (const label of ['Continue to payment', 'Accept and pay $9.99', 'Agree and Place Order', 'Продолжить к оплате', 'Continue to checkout', 'Continue 2', 'Accept & buy',
    'Add to library and continue', 'Accept purchase', 'Согласен и купить', 'Принять заказ', 'Agree to the terms', 'Continue shopping', '']) {
    assert.equal(orders.classifyModalLabel(label), 'refuse', JSON.stringify(label));
  }
});

test('modal loop: a button that merely contains Continue or Accept is never clicked, free total or not', async () => {
  for (const label of ['Continue to payment', 'Accept and pay $9.99', 'Agree and Place Order', 'Продолжить к оплате', 'Continue to checkout', 'Accept & buy']) {
    const log = [];
    const page = fakePage('Total $0.00', { [orders.DISMISS_SELECTOR]: button(label, log), [orders.ORDER_SELECTOR]: button('Place Order', log) });
    const res = await orders.settleModals(page, { log: () => {}, attempts: 3 });
    assert.deepEqual(log, [], `${label}: nothing may be clicked`);
    assert.equal(res.refused, true, label);
    assert.ok(res.status === NOT_FREE || res.status === TOTAL_UNKNOWN);
  }
  // a pinned button is clicked through its handle, with a short timeout
  const log = [];
  const clicks = [];
  let gone = false;
  const pin = pinnable('Continue', log, clicks);
  pin.isVisible = async () => !gone;
  pin.handle.click = async o => { gone = true; log.push('click:handle'); clicks.push(o); };
  const res = await orders.settleModals(fakePage('Epic Games Store', { [orders.DISMISS_SELECTOR]: pin }), { log: () => {}, attempts: 3 });
  assert.equal(res.refused, false);
  assert.deepEqual(log.filter(x => x.startsWith('click')), ['click:handle']);
  assert.ok(clicks[0].timeout <= 5000, 'a bounded click');
});

// ---------- Epic Get: the element is pinned and read again right before the click ----------
test('Get click: the label is read again from the same element right before the click', async () => {
  // the button changes after the first read (the page moved on): nothing is clicked
  for (const labels of [['Get', 'Buy Now'], ['Get', '$9.99'], ['Get', 'Add to cart'], ['Get', 'In Library'], ['Buy Now', 'Get'], ['Get', '']]) {
    const log = [];
    const pin = pinnable(labels, log);
    const res = await orders.clickGetIfFree(pin, 'get', fakePage('Epic Games Store'), { promoFree: true });
    assert.equal(res.refused, true, labels.join('>'));
    assert.ok(!log.some(x => x.startsWith('click')), `${labels.join('>')}: no click`);
    assert.ok(log.includes('dispose'), 'the handle is released');
  }
  const log = [];
  const clicks = [];
  const pin = pinnable(['Get', 'Get', 'Get', 'Get'], log, clicks);
  const res = await orders.clickGetIfFree(pin, 'get', fakePage('Epic Games Store'), { promoFree: true });
  assert.equal(res.refused, false);
  assert.deepEqual(log.filter(x => x.startsWith('click')), ['click:handle'], 'the pinned element is clicked, not the lazy locator');
  assert.ok(clicks[0].timeout <= 3000, 'a short click timeout');
});

// ---------- Epic Get: positive evidence of free ----------
test('Get evidence: promotions list or the price block must say free; unknown is refused', async () => {
  const E = orders.getEvidence;
  const cases = [
    ['promotion at 0, no block', { promoFree: true, priceBlock: '' }, 'free'],
    ['promotion at 0, struck-out original', { promoFree: true, priceBlock: '-100%\n$29.99\nFree\nGet' }, 'free'],
    ['promotion at 0, block reads Get only', { promoFree: true, priceBlock: 'Get' }, 'free'],
    ['no promotion, no block', { promoFree: false, priceBlock: '' }, 'unknown'],
    ['no promotion data', { promoFree: null, priceBlock: 'Get' }, 'unknown'],
    ['block: -100% with struck-out original', { promoFree: null, priceBlock: '-100%\n$29.99\nFree\nGet' }, 'free'],
    ['block: RU free', { promoFree: null, priceBlock: 'Бесплатно\nПолучить' }, 'free'],
    ['block: free with a price and no discount mark', { promoFree: null, priceBlock: 'Free\n$29.99\nGet' }, 'unknown'],
    ['block: plain price', { promoFree: null, priceBlock: '$29.99\nGet' }, 'unknown'],
    ['block: -50%', { promoFree: null, priceBlock: '-50%\n$29.99\n$14.99\nGet' }, 'unknown'],
    ['promotion at 0 but the block shows a plain price', { promoFree: true, priceBlock: '$29.99\nGet' }, 'unknown'],
    ['promotion at 0 but the block charges', { promoFree: true, priceBlock: 'Free\nThen $9.99/month\nGet' }, 'paid'],
    ['block: free word beside a pay line', { promoFree: null, priceBlock: 'Free\nPay now $9.99' }, 'paid'],
  ];
  for (const [name, input, state] of cases) assert.equal(E(input).state, state, name);

  // through the click: unknown never clicks, and says so
  for (const opts of [{}, { promoFree: null }, { promoFree: false }]) {
    const log = [];
    const res = await orders.clickGetIfFree(button('Get', log), 'get', fakePage('Epic Games Store'), opts);
    assert.deepEqual(log, [], JSON.stringify(opts));
    assert.equal(res.status, TOTAL_UNKNOWN);
    assert.match(res.reason, /free/i);
  }
  // the price block is read from the element's neighbourhood
  const log = [];
  const pin = pinnable(['Get', 'Get', 'Get'], log);
  pin.handle.block = '-100%\n$29.99\nFree\nGet';
  const res = await orders.clickGetIfFree(pin, 'get', fakePage('Epic Games Store'), { promoFree: null });
  assert.equal(res.refused, false, 'the block alone is positive evidence');
  const log2 = [];
  const pin2 = pinnable(['Get', 'Get', 'Get'], log2);
  pin2.handle.block = '$29.99\nGet';
  const res2 = await orders.clickGetIfFree(pin2, 'get', fakePage('Epic Games Store'), { promoFree: null });
  assert.equal(res2.refused, true);
  assert.ok(!log2.some(x => x.startsWith('click')));
});

test('promotions list: only an active offer at exactly 0 for this page counts', async () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const offer = (start, end) => [{ promotionalOffers: [{ startDate: start, endDate: end }] }];
  const el = (over = {}) => ({
    title: 'Game', productSlug: 'game-a/home', urlSlug: 'wrong-id-1234', catalogNs: { mappings: [{ pageSlug: 'game-a' }] },
    price: { totalPrice: { discountPrice: 0, originalPrice: 2999 } },
    promotions: { promotionalOffers: offer('2026-11-01T00:00:00Z', '2026-11-12T00:00:00Z') }, ...over,
  });
  const named = (slug, over) => el({ productSlug: slug, urlSlug: slug, catalogNs: { mappings: [{ pageSlug: slug }] }, ...over });
  const slugs = orders.freePromoSlugs([
    el(),
    named('game-b', { price: { totalPrice: { discountPrice: 1499 } } }),
    named('game-c', { promotions: { promotionalOffers: [] } }),
    named('game-d', { promotions: { promotionalOffers: offer('2026-11-10T00:00:00Z', '2026-11-17T00:00:00Z') } }),
    named('game-e', { promotions: { promotionalOffers: offer('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z') } }),
    named('game-f', { price: {} }),
    null,
  ], now);
  assert.ok(slugs instanceof Set);
  assert.deepEqual([...slugs].filter(s => s.startsWith('game-')).sort(), ['game-a']);
  assert.equal(orders.slugFromUrl('https://store.epicgames.com/en-US/p/game-a'), 'game-a');
  assert.equal(orders.slugFromUrl('https://store.epicgames.com/en-US/p/Game-A?x=1#top'), 'game-a');
  assert.equal(orders.slugFromUrl('not a url'), '');
  assert.equal(orders.promoFreeForPage(slugs, 'https://store.epicgames.com/en-US/p/game-a'), true);
  assert.equal(orders.promoFreeForPage(slugs, 'https://store.epicgames.com/en-US/p/game-b'), false);
  assert.equal(orders.promoFreeForPage(null, 'https://store.epicgames.com/en-US/p/game-a'), null);

  // the fetch is injected; a failure gives null (unknown), never an empty "all clear"
  const body = { data: { Catalog: { searchStore: { elements: [el()] } } } };
  const ok = await orders.fetchFreePromoSlugs(async () => ({ ok: true, json: async () => body }), now);
  assert.ok(ok.has('game-a'));
  assert.equal(await orders.fetchFreePromoSlugs(async () => { throw new Error('offline'); }, now), null);
  assert.equal(await orders.fetchFreePromoSlugs(async () => ({ ok: false, status: 503 }), now), null);
  assert.equal(await orders.fetchFreePromoSlugs(async () => ({ ok: true, json: async () => ({}) }), now), null);
});

// ---------- the shared gate pins the element ----------
test('clickOnlyIfFree: the element is pinned, read again right before the click, clicked with a short timeout', async () => {
  const log = [];
  const clicks = [];
  const pin = pinnable(['Place Order', 'Place Order', 'Place Order'], log, clicks);
  const res = await clickOnlyIfFree(pin, fakeFrame('Total $0.00'), { timer, clickOptions: { delay: 50 } });
  assert.equal(res.refused, false);
  assert.deepEqual(log.filter(x => x.startsWith('click')), ['click:handle']);
  assert.ok(clicks[0].timeout <= 3000 && clicks[0].delay === 50, JSON.stringify(clicks[0]));
  assert.ok(log.includes('dispose'));

  // the label changed between the check and the click (the locator now points elsewhere): refused
  for (const labels of [['Place Order', 'Place Order $9.99'], ['Add to library', 'Buy now'], ['Place Order', '']]) {
    const log2 = [];
    const res2 = await clickOnlyIfFree(pinnable(labels, log2), fakeFrame('Total $0.00'), { timer });
    assert.equal(res2.refused, true, labels.join('>'));
    assert.ok(!log2.some(x => x.startsWith('click')), `${labels.join('>')}: no click`);
  }
  // a click that cannot complete is a refusal, not a hang or a throw
  const log3 = [];
  const bad = pinnable(['Place Order'], log3);
  bad.handle.click = async () => { throw new Error('Timeout 2000ms exceeded'); };
  const res3 = await clickOnlyIfFree(bad, fakeFrame('Total $0.00'), { timer });
  assert.equal(res3.refused, true);
  // an element that cannot be found is a refusal
  const missing = { first() { return this; }, elementHandle: async () => { throw new Error('Timeout'); } };
  assert.equal((await clickOnlyIfFree(missing, fakeFrame('Total $0.00'), { timer })).status, TOTAL_UNKNOWN);
});

test('Fab Buy now: pinned and read again before the click', async () => {
  const log = [];
  const clicks = [];
  const ok = await orders.clickBuyNowIfFree(pinnable(['Buy now', 'Buy now'], log, clicks), fakePage('Free listing'));
  assert.equal(ok.refused, false);
  assert.deepEqual(log.filter(x => x.startsWith('click')), ['click:handle']);
  assert.ok(clicks[0].timeout <= 3000);
  const log2 = [];
  const res = await orders.clickBuyNowIfFree(pinnable(['Buy now', 'Buy now $19.99'], log2), fakePage('Free listing'));
  assert.equal(res.refused, true);
  assert.ok(!log2.some(x => x.startsWith('click')));
});

// ---------- the small clicks around an order: exact text, bounded, awaited ----------
test('exact-label click: refuses anything but the expected word', async () => {
  const RE = /^(?:i accept|i agree|принять)$/i;
  for (const label of ['Accept and pay $9.99', 'I Accept the purchase', 'Принять и оплатить', '', 'Accept 1']) {
    const log = [];
    assert.equal(await orders.clickExactLabel(button(label, log), RE), false, label);
    assert.deepEqual(log, [], label);
  }
  const log = [];
  assert.equal(await orders.clickExactLabel(button('I Accept', log), RE), true);
  assert.deepEqual(log, ['click:I Accept']);
  assert.equal(await orders.clickExactLabel(button(new Error('gone'), []), RE), false, 'unreadable: not clicked, not thrown');
});

test('EU accept: only after the wait, only the exact word, never beside a paid total', async () => {
  const mk = (label, log, opts) => ({ locator: () => button(label, log, opts) });
  let log = [];
  assert.equal(await orders.acceptEuAgreement(mk('I Accept', log), fakeFrame('Total $0.00'), { timeout: 10 }), true);
  assert.deepEqual(log, ['click:I Accept']);
  log = [];
  assert.equal(await orders.acceptEuAgreement(mk('Принять', log), fakeFrame(''), { timeout: 10 }), true, 'after the gated order the total may be gone');
  log = [];
  assert.equal(await orders.acceptEuAgreement(mk('I Accept', log), fakeFrame('Total $9.99'), { timeout: 10 }), false);
  assert.deepEqual(log, [], 'a paid total: no click');
  log = [];
  assert.equal(await orders.acceptEuAgreement(mk('I Accept', log, { waitFails: true }), fakeFrame('Total $0.00'), { timeout: 10 }), false);
  assert.deepEqual(log, [], 'no EU button: nothing to do, no throw');
  log = [];
  assert.equal(await orders.acceptEuAgreement(mk('Accept and pay $9.99', log), fakeFrame('Total $0.00'), { timeout: 10 }), false);
  assert.deepEqual(log, []);
});

test('EULA and parental PIN: bounded, exact, answered before the game is left', async () => {
  let log = [];
  const page = label => ({ locator: () => button(label, log) });
  assert.equal(await orders.acceptEulaIfShown(page('Accept'), { timeout: 10 }), true);
  assert.ok(log.includes('check') && log.includes('click:Accept'));
  log = [];
  assert.equal(await orders.acceptEulaIfShown(page('Accept and pay $9.99'), { timeout: 10 }), false);
  assert.ok(!log.some(x => x.startsWith('click')));
  log = [];
  assert.equal(await orders.acceptEulaIfShown({ locator: () => button('Accept', log, { waitFails: true }) }, { timeout: 10 }), false, 'no EULA shown');
  assert.deepEqual(log, []);

  log = [];
  const frame = label => ({ locator: () => button(label, log) });
  const notes = [];
  assert.equal(await orders.enterParentalPin(frame('Continue'), '1234', { timeout: 10, notify: m => notes.push(m) }), true);
  assert.deepEqual(log, ['type:1234', 'click:Continue']);
  log = [];
  assert.equal(await orders.enterParentalPin(frame('Continue to payment'), '1234', { timeout: 10, notify: () => {} }), false);
  assert.ok(!log.some(x => x.startsWith('click')));
  log = [];
  assert.equal(await orders.enterParentalPin(frame('Continue'), undefined, { timeout: 10, notify: m => notes.push(m) }), false);
  assert.deepEqual(log, [], 'no PIN configured: nothing typed or clicked');
  assert.ok(notes.length >= 1, 'and the user is told');
});

// ---------- the page-level fallback is a dialog, not the whole page ----------
test('page-level order button: only inside a dialog and with the dialog text as the source', async () => {
  assert.ok(!/Claim|Get Now|Order Now/i.test(orders.PAGE_ORDER_LABEL.source), 'banners are not orders');
  for (const text of ['Place Order', 'Add to library', 'Оформить заказ', 'Добавить в библиотеку']) assert.ok(orders.PAGE_ORDER_LABEL.test(text), text);
  for (const text of ['Claim', 'Get Now', 'Order Now', 'Get']) assert.ok(!orders.PAGE_ORDER_LABEL.test(text), text);
  assert.ok(/dialog/.test(orders.ORDER_DIALOG));

  // the text gate reads the dialog, so a stray "Total $0.00" elsewhere on the page proves nothing
  const seen = [];
  const dialog = { first() { return this; }, innerText: async () => 'Place Order\nTotal $9.99' };
  const inner = { filter: () => ({ first: () => button('Place Order', []) }) };
  const target = orders.pageOrderTarget({
    waitForTimeout: async () => {},
    locator: sel => { seen.push(sel); return { filter: () => ({ first: () => ({ ...dialog, locator: () => inner }) }) }; },
  });
  assert.ok(target.button && target.source);
  assert.equal(await readPageText(target.source), 'Place Order\nTotal $9.99');
  assert.equal(await settledOrderState(target.source, { timer, tries: 2 }), 'paid');
  assert.ok(seen.some(s => s === orders.ORDER_DIALOG), 'it looks inside a dialog');
});

// ---------- sources ----------
test('epic-games.js: no blind clicks, no catch-all fallback, no claim without proof, no status-less entry', () => {
  for (const [name, code] of [['epic-games.js', read('epic-games.js')], ['dist/epic-games.mjs', read('dist/epic-games.mjs')]]) {
    assert.ok(!/_iframeTimeout/.test(code), `${name}: the catch-all fallback is gone`);
    assert.ok(!code.includes('text=Claim'), `${name}: a detached "Claim" is not proof of a claim`);
    assert.ok(!/Get Now|Order Now/.test(code), `${name}: banner buttons are not orders`);
    assert.ok(!/btnAgree|waitFor\([^)]*\)\.then\([^)]*click/.test(code), `${name}: fire-and-forget clicks`);
    assert.ok(!/end user license agreement"\)'\)\.waitFor/.test(code), `${name}: the EULA click is awaited`);
    for (const fn of ['acceptEulaIfShown', 'enterParentalPin', 'acceptEuAgreement', 'fetchFreePromoSlugs', 'promoFreeForPage', 'pageOrderTarget']) assert.ok(code.includes(fn), `${name} uses ${fn}`);
    assert.ok(/failed:unconfirmed/.test(code), `${name}: an unconfirmed claim is a failure`);
    assert.ok(/\|\|= \{ title, time: datetime\(\), url: page\.url\(\), status: ['"]failed['"] \}/.test(code), `${name}: Epic's entry starts as failed`);
  }
  assert.ok(/TimeoutError/.test(read('epic-games.js')), 'only a timeout means "no iframe"');
});

test('unity pay click is pinned', () => {
  const unity = read('unity.js');
  assert.ok(/payBtn\.click\(\{[^}]*timeout/.test(unity), 'a short click timeout');
  assert.ok(unity.includes('elementHandle'), 'the button is pinned');
});

// ======================================================================================================
// Fab listing page: "total ratings 15" is not a total (docs/solutions/069)
// ======================================================================================================
const checkout = await load('checkout.js');
const runsummary = await load('runsummary.js').catch(err => ({ missing: err.message }));

/** The text of a real en-US Fab listing, read from a live page (a sale at 100% off). */
const REAL_FAB_LISTING = [
  'Average rating 5.0 out of 5, total ratings 15.', '5.0', '(15)', 'License', 'Select a license', 'PERSONAL', '₹11,150.74',
  'Free*', '-100%', 'Sale ends 11/17/2026, 8:29 PM', 'Lowest price in 30 days before discount: ₹11,150.74', 'Buy now',
].join('\n');

test('the real Fab listing text lets Buy now through, and the checkout then decides', async () => {
  const log = [];
  const res = await orders.clickBuyNowIfFree(button('Buy now', log), fakePage(REAL_FAB_LISTING));
  assert.equal(res.refused, false, res.reason);
  assert.deepEqual(log, ['click:Buy now']);
  // Buy now only opened the checkout: a paid, empty or unreadable total in the checkout frame never reaches the order click
  for (const [frame, status] of [[fakeFrame('Total $19.99'), NOT_FREE], [fakeFrame(''), TOTAL_UNKNOWN], [fakeFrame(new Error('detached')), TOTAL_UNKNOWN]]) {
    const orderLog = [];
    const order = await clickOnlyIfFree(button('Add to library', orderLog), frame, { timer, tries: 3 });
    assert.deepEqual(orderLog, []);
    assert.equal(order.status, status);
  }
});

test('listing reader: description and rating lines are not a paid total', () => {
  const notPaid = [
    REAL_FAB_LISTING, 'Average rating 5.0 out of 5, total ratings 15.', 'total ratings 15.', 'Total Tris: 45,000', 'Total of 12 meshes',
    'Total polycount 120000', 'Total 45,000 TRI', 'Total 15 PBR textures', 'Всего 12 моделей', '₹11,150.74\nFree*\n-100%',
    'Lowest price in 30 days before discount: ₹11,150.74', 'From ₹6,689.99', 'От 6 689,99 ₹', 'Pay 10 credits', '', 'Buy now',
    'Total $0.00', 'Total savings $5.00', 'Sale ends 11/17/2026, 8:29 PM',
  ];
  for (const text of notPaid) assert.equal(checkout.listingShowsPaidTotal(text), false, JSON.stringify(text));
});

test('listing reader: a total or charge line with a real amount is paid', () => {
  const paid = [
    'Total $19.99', 'Total: ₹500', 'Итого 1 490 ₽', 'Pay now $9.99', 'Buy now for $5', 'Total\n$19.99', 'Order total 20,00 €',
    'Total 19.99 USD', 'Total 499 руб', 'Total $0.00\nPay now $9.99', 'You pay $4.99', 'К оплате 499 ₽', 'Total $9.99 (includes discount)',
    'Free trial\nThen $9.99/month', 'Average rating 5.0, total ratings 15.\nTotal $19.99',
  ];
  for (const text of paid) assert.equal(checkout.listingShowsPaidTotal(text), true, JSON.stringify(text));
});

test('Fab Buy now: a listing that shows a real total or a price on the button is still refused', async () => {
  for (const [label, text] of [['Buy now', 'Total $19.99'], ['Buy now', 'Pay now ₹500'], ['Buy now', 'Итого 1 490 ₽'], ['Buy now $19.99', REAL_FAB_LISTING]]) {
    const log = [];
    const res = await orders.clickBuyNowIfFree(button(label, log), fakePage(text));
    assert.deepEqual(log, [], `${label} / ${text}`);
    assert.equal(res.refused, true);
  }
});

test('the order reader is not widened: totals on checkout pages read as before', () => {
  assert.equal(orderTotalState('total ratings 15.'), 'paid'); // strict on purpose: the order gates keep refusing this
  assert.equal(orderTotalState('Total $19.99'), 'paid');
  assert.equal(orderTotalState('Free*\n-100%', { freeWord: true }), 'unknown');
});

// ---------- the summary of a store run ----------
test('run summary: counts come from the statuses the store script wrote', () => {
  const s = runsummary.tallyGames;
  assert.deepEqual(s([{ status: 'claimed' }, { status: 'existed' }, { status: 'failed:not-free' }, { status: 'failed:total-unknown' }, { status: 'failed' }, { status: 'manual' }]),
    { claimed: 1, existed: 1, refused: 2, failed: 1, other: 1 });
  assert.deepEqual(s([]), { claimed: 0, existed: 0, refused: 0, failed: 0, other: 0 });
});

test('run summary: refused is not success, a skipped store is not success, unknown is neutral', () => {
  const sum = runsummary.summarizeRun;
  const none = { claimed: 0, existed: 0, refused: 0, failed: 0, other: 0 };
  const refused = sum('Fab / Unreal Engine', { ...none, refused: 3 });
  assert.equal(refused.level, 'warn');
  assert.ok(refused.text.includes('⚠ Fab / Unreal Engine: отклонено 3, получено 0'), refused.text);
  assert.ok(!refused.text.includes('✓'));
  const skipped = sum('Unity Asset Store', { skipped: 'login' });
  assert.equal(skipped.level, 'warn');
  assert.ok(skipped.text.includes('⚠ Unity Asset Store: пропущено, нужен вход'), skipped.text);
  assert.ok(sum('GOG', none).text.includes('✓ GOG: новых раздач нет'));
  assert.ok(sum('Epic Games', { ...none, claimed: 2 }).text.includes('✓ Epic Games: получено 2'));
  const mixed = sum('Epic Games', { ...none, claimed: 1, refused: 1 });
  assert.equal(mixed.level, 'warn');
  assert.ok(mixed.text.includes('отклонено 1') && mixed.text.includes('получено 1'));
  assert.equal(sum('Epic Games', { ...none, failed: 1 }).level, 'warn');
  for (const unknown of [null, undefined, 'x', {}, { claimed: 'many' }]) {
    const res = sum('Steam', unknown);
    assert.equal(res.level, 'log');
    assert.ok(res.text.includes('Steam: завершён') && !res.text.includes('✓'), res.text);
  }
});

test('run summary: the child writes a report file, the runner reads it back', async () => {
  const { mkdtempSync, rmSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'sentinel-report-'));
  const old = process.env.SENTINEL_RUN_REPORT;
  try {
    const file = path.join(dir, 'report.json');
    process.env.SENTINEL_RUN_REPORT = file;
    runsummary.writeRunReport([{ status: 'failed:not-free' }, { status: 'failed:not-free' }, { status: 'claimed' }]);
    assert.deepEqual(runsummary.readRunReport(file), { claimed: 1, existed: 0, refused: 2, failed: 0, other: 0 });
    assert.equal(existsSync(file), false, 'the report is consumed');
    assert.equal(runsummary.readRunReport(file), null, 'no file: unknown');
    writeFileSync(file, '{broken');
    assert.equal(runsummary.readRunReport(file), null, 'a damaged file: unknown');
    delete process.env.SENTINEL_RUN_REPORT;
    assert.doesNotThrow(() => runsummary.writeRunReport([])); // run by hand, no report wanted
  } finally {
    if (old === undefined) delete process.env.SENTINEL_RUN_REPORT; else process.env.SENTINEL_RUN_REPORT = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runner and the store scripts use the honest summary', () => {
  const runner = read('runner.js');
  assert.ok(!runner.includes('сбор успешно завершен'), 'the runner no longer says success on exit code 0 alone');
  assert.ok(runner.includes('summarizeRun') && runner.includes('SENTINEL_RUN_REPORT'));
  for (const file of ['fab.js', 'unity.js', 'epic-games.js', 'gog.js']) assert.ok(read(file).includes('writeRunReport'), `${file} reports its run`);
});

// ---------- the real Epic/Fab free checkout: no "Total" line, a zero amount and a plain statement ----------
const FREE_CHECKOUT = 'Checkout\nMORTUIS_V\nUnderground Tunnel\nTRY 0.00\nThis is free. Add it to your library to get started.\nAdd to library';
test('free checkout seen live: statement plus zero amount is free, for both the reader and the click', async () => {
  assert.equal(orderTotalState(FREE_CHECKOUT, { freeWord: true }), 'free');
  const log = [];
  const res = await clickOnlyIfFree(button('Add to library', log), fakeFrame(FREE_CHECKOUT), { timer });
  assert.equal(res.refused, false);
  assert.deepEqual(log, ['click:Add to library']);
});
test('free checkout: the statement alone, or with any price beside it, never makes an order free', () => {
  for (const text of [
    'This is free. Add it to your library to get started.', // no zero amount
    'Underground Tunnel\nTRY 0.00', // no statement
    'Underground Tunnel\nTRY 0.00\nThis is free for members.\nTRY 19.99', // a price elsewhere
    'Underground Tunnel\n$19.99\nThis is free. Add it to your library.',
    'TRY 0.00\nThis is free.\nPay now $9.99',
    'TRY 0.00\nThis is free.\nTotal $9.99',
    'TRY 0.00\nThis is not free.',
    'TRY 0.00\nIs this free?',
  ]) assert.notEqual(orderTotalState(text, { freeWord: true }), 'free', JSON.stringify(text));
  assert.notEqual(orderTotalState(FREE_CHECKOUT), 'free', 'without freeWord the old strict answer stays');
});

test('Epic: the account chooser after Get is recognised, the store is not', () => {
  assert.equal(orders.isEpicLoginPage('https://www.epicgames.com/id/login?redirectUrl=x'), true);
  assert.equal(orders.isEpicLoginPage('https://www.epicgames.com/id'), true);
  for (const url of ['https://store.epicgames.com/p/flotsam-266287', 'https://www.epicgames.com/idea', 'https://evil.example/id/login', 'nonsense']) {
    assert.equal(orders.isEpicLoginPage(url), false, url);
  }
});

test('Epic Get: the price block is read until the sale has rendered, and an undecided block still refuses', async () => {
  const getButton = (blocks, log) => {
    let reads = 0;
    return {
      innerText: async () => 'Get',
      evaluate: async () => blocks[Math.min(reads++, blocks.length - 1)],
      click: async () => { log.push('click'); },
    };
  };
  const page = { evaluate: async () => 'Flotsam', waitForTimeout: async () => {} };
  const late = [];
  const res = await orders.clickGetIfFree(getButton(['₹589.00\nGet', '₹589.00\nGet', '-100%\n₹589.00*\nFree\nGet'], late), 'Get', page, { promoFree: true });
  assert.equal(res.refused, false, 'the sale appears on a later read');
  assert.deepEqual(late, ['click']);
  const never = [];
  const stuck = await orders.clickGetIfFree(getButton(['₹589.00\nGet'], never), 'Get', page, { promoFree: true });
  assert.equal(stuck.refused, true, 'a price with no free mark at the end is still refused');
  assert.deepEqual(never, []);
  const paid = [];
  const charged = await orders.clickGetIfFree(getButton(['Pay now ₹589.00\nGet', '-100%\nFree\nGet'], paid), 'Get', page, { promoFree: true });
  assert.equal(charged.refused, true, 'a charge is final, it is not read again');
  assert.deepEqual(paid, []);
});

// ---------- Epic "Confirm Your Account" (switch-account) after Get ----------
const confirmPage = ({ url, afterClick, tiles = ['MORTUIS_V'], password = false }) => {
  const state = { url, clicked: [] };
  return {
    state,
    url: () => state.url,
    getByText: (text, opts) => ({
      first() { return this; },
      waitFor: async () => { if (!tiles.includes(text) || !opts?.exact) throw new Error('Timeout: no tile'); },
      click: async () => { state.clicked.push(text); state.url = afterClick ?? state.url; },
    }),
    locator: () => ({ first() { return this; }, isVisible: async () => password }),
    waitForTimeout: async () => {},
  };
};
const SWITCH = 'https://www.epicgames.com/id/login/switch-account?redirect_uri=https%3A%2F%2Fstore.epicgames.com%2Fp%2Fflotsam';
test('Epic confirm account: the exact remembered account is picked and the store return counts as confirmed', async () => {
  const back = confirmPage({ url: SWITCH, afterClick: 'https://store.epicgames.com/p/flotsam-266287?purchaseIntentId=x' });
  assert.equal(await orders.confirmEpicAccount(back, 'MORTUIS_V', { timeout: 50 }), 'confirmed');
  assert.deepEqual(back.state.clicked, ['MORTUIS_V']);
  const pw = confirmPage({ url: SWITCH, password: true });
  assert.equal(await orders.confirmEpicAccount(pw, 'MORTUIS_V', { timeout: 50 }), 'password');
  const other = confirmPage({ url: SWITCH, tiles: ['SOMEONE_ELSE'] });
  assert.equal(await orders.confirmEpicAccount(other, 'MORTUIS_V', { timeout: 50 }), 'unknown');
  assert.deepEqual(other.state.clicked, [], 'another account is never picked');
  const login = confirmPage({ url: 'https://www.epicgames.com/id/login?x=1' });
  assert.equal(await orders.confirmEpicAccount(login, 'MORTUIS_V', { timeout: 50 }), 'unknown', 'only the switch-account page is handled');
  assert.deepEqual(login.state.clicked, []);
  assert.equal(await orders.confirmEpicAccount(back, '', { timeout: 50 }), 'unknown', 'no user, no click');
});
