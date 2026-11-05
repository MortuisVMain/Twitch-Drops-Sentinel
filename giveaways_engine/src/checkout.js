// Stands between a claim and a real charge: anything but a clear zero on the page must stop the order.
const CURRENCY = '\\p{Sc}';
const NUMBER = '\\d(?:[\\d\\s.,]*\\d)?';
const AMOUNT = `(?:[A-Z]{0,2}${CURRENCY}|[A-Z]{3}\\s)\\s*${NUMBER}|${NUMBER}\\s*(?:${CURRENCY}|[A-Z]{3}\\b|руб)`;
const WHOLE_AMOUNT = new RegExp(`^-?(?:${AMOUNT})\\.?$`, 'u');
const STARTS_LIKE_AMOUNT = new RegExp(`^-?(?:${CURRENCY}|\\d)`, 'u');
const TOTAL_LINE = /(?<![\p{L}\d])(?<!sub[\s-])(order total|grand total|total due|total to pay|amount due|total|итого к оплате|всего к оплате|сумма к оплате|к оплате|итого|всего|сумма)(?=[\s:(]|$)[\s:]*(?:\([^)]*\))?[\s:]*(.*)$/iu;
const NOT_THE_PRICE = /saving|saved|discount|скидк|эконом/i; // a saving next to the word "total" is not what gets charged
const FREE_WORD = /^(?:free|бесплатно)\.?$/iu; // Epic and Fab may write the word where the amount would be
// A line that says what is charged. STRICT words name a charge by themselves: any number above zero on the line counts.
// SOFT words also occur in ordinary text ("Pay", "then", "due"): they count only beside an amount with a currency.
const CHARGE_STRICT = /pay now|you pay|to pay|charged|amount due|payment due|due now|due today|buy now for|к оплате|списан|оплатить|оплата/iu;
const CHARGE_SOFT = /(?<![\p{L}\d])(?:pay|then|due)(?![\p{L}\d])|per month|\/\s?month|в месяц/iu;
const CHARGE_LINE_MAX = 160; // a description is not a price list

/** Statuses of an order that was not placed; they start with "failed" and are not shown as claimed. */
export const NOT_FREE = 'failed:not-free';
export const TOTAL_UNKNOWN = 'failed:total-unknown';

// A price is zero when it has no digit but 0, whatever the locale's separators are.
const hasNonZeroDigit = text => /[1-9]/.test(text);

/** True if the text holds an amount with a currency (or a plain price) above zero, such as "$9.99" or "499 ₽". */
export const hasNonZeroAmount = text => [...String(text).matchAll(new RegExp(AMOUNT, 'gu'))].some(m => hasNonZeroDigit(m[0]));

/** True if a line says that money is charged: a charge word beside a number above zero. */
const isChargeLine = line => line.length <= CHARGE_LINE_MAX &&
  ((CHARGE_STRICT.test(line) && hasNonZeroDigit(line)) || (CHARGE_SOFT.test(line) && hasNonZeroAmount(line)));

/**
 * 'free' only if every total line says zero and no line says money is charged; 'paid' if any names a price or a charge;
 * 'unknown' if the page does not say. With `freeWord` the word Free / Бесплатно in place of the amount counts as zero
 * (it never beats a price).
 */
export const orderTotalState = (text, { freeWord = false } = {}) => {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let state = 'unknown';
  let unreadable = false;
  if (lines.some(isChargeLine)) return 'paid'; // "Total $0.00" beside "Pay now $9.99" is not free
  for (const [i, line] of lines.entries()) {
    const match = TOTAL_LINE.exec(line);
    if (!match) continue;
    // A saving is skipped only when the saving word comes before the amount: "Total savings $5.00", but not "Total $9.99 (includes discount)"
    if (NOT_THE_PRICE.test(match[2].split(/\d/)[0])) continue;
    const amount = match[2] || lines[i + 1] || '';
    if (hasNonZeroDigit(amount)) return 'paid'; // also a price in a form we cannot read: the order stops either way
    if (WHOLE_AMOUNT.test(amount) || (freeWord && FREE_WORD.test(amount))) {
      state = 'free';
    } else if (match[2] && STARTS_LIKE_AMOUNT.test(match[2])) {
      unreadable = true; // reads like a price, but not one we understand
    }
  }
  return unreadable ? 'unknown' : state;
};

/** True if the text, such as the label of the order button, has any number above zero: a free order's button has no reason to. */
export const hasPaidAmount = text => hasNonZeroDigit(String(text));

/** The text of a page or of an iframe: a frameLocator has no page text, so it is read through its body. */
export const readPageText = async source => {
  try {
    const text = typeof source.evaluate === 'function'
      ? await source.evaluate(() => document.body.innerText)
      : await source.locator('body').innerText({ timeout: 5000 });
    return typeof text === 'string' ? text : '';
  } catch (err) {
    console.warn(`Cannot read the checkout page: ${err.message}`);
    return '';
  }
};

/** The total keeps changing while a coupon applies, so zero has to hold for three checks in a row. Returns 'free', 'paid' or 'unknown'. */
export const settledOrderState = async (source, { timer = source, tries = 20, freeWord = false } = {}) => {
  let zeroChecks = 0;
  let last = 'unknown';
  for (let i = 0; i < tries && zeroChecks < 3; i++) {
    last = orderTotalState(await readPageText(source), { freeWord });
    zeroChecks = last === 'free' ? zeroChecks + 1 : 0;
    if (zeroChecks < 3) await timer.waitForTimeout(1000);
  }
  return zeroChecks === 3 ? 'free' : last;
};

export const waitForFreeOrder = async page => (await settledOrderState(page)) === 'free';

/** A refused order: nothing was clicked. `status` is stored in place of "claimed". */
export const refusal = (status, reason) => ({ refused: true, clicked: false, status, reason });

/** A click that waits longer than this for the button to be actionable is not clicking the button that was checked. */
export const CLICK_TIMEOUT = 2000;

/**
 * Pins the one element behind a locator, so that the label that was read and the element that is clicked are the same
 * even if the page moves on. A fake without elementHandle() is used as it is. A missing element throws.
 */
export const pinElement = async (locator, timeout = 5000) => {
  if (typeof locator?.elementHandle !== 'function') return { target: locator, release: async () => {} };
  const handle = await locator.elementHandle({ timeout });
  return { target: handle, release: () => Promise.resolve(handle.dispose?.()).catch(() => {}) };
};

/** The visible label of a pinned element or locator. */
export const readLabel = async target => String(await target.innerText({ timeout: 2000 })).trim();

/**
 * The last step before every order-capable click: the label is read again from the pinned element and must be the one
 * that was checked; then the click is bounded by CLICK_TIMEOUT. A click that does not go through is a refusal.
 */
export const clickPinned = async (target, label, clickOptions) => {
  let again;
  try {
    again = await readLabel(target);
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `cannot read the button right before the click: ${err.message}`);
  }
  if (again !== label || hasPaidAmount(again)) return refusal(NOT_FREE, `the button changed right before the click: "${label}" is now "${again}"`);
  try {
    await target.click({ ...clickOptions, timeout: CLICK_TIMEOUT });
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `the click did not go through (${String(err.message).split(/\r?\n/)[0]}): check the game by hand`);
  }
  return { refused: false, clicked: true, label };
};

/**
 * Clicks an order button only when the page (or iframe) `source` clearly says the order is free: the button names no
 * price, the total holds at zero for three reads and reads zero once more right before the click, and the button that
 * is clicked is the very element that was read (pinned), with the same label.
 * Anything unreadable or unknown is refused with a status and a reason; nothing is clicked.
 */
export const clickOnlyIfFree = async (button, source, { timer = source, tries = 10, clickOptions } = {}) => {
  let pin;
  try {
    pin = await pinElement(button);
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `cannot find the order button: ${err.message}`);
  }
  try {
    let label;
    try {
      label = await readLabel(pin.target);
    } catch (err) {
      return refusal(TOTAL_UNKNOWN, `cannot read the order button: ${err.message}`);
    }
    if (!label) return refusal(TOTAL_UNKNOWN, 'the order button has no text');
    if (hasPaidAmount(label)) return refusal(NOT_FREE, `the order button names a price: "${label}"`);
    const state = await settledOrderState(source, { timer, tries, freeWord: true });
    if (state !== 'free') {
      return refusal(state === 'paid' ? NOT_FREE : TOTAL_UNKNOWN, state === 'paid'
        ? `the order total is not zero (button: "${label}")`
        : `the page does not clearly say the order is free (button: "${label}")`);
    }
    const last = orderTotalState(await readPageText(source), { freeWord: true });
    if (last !== 'free') return refusal(last === 'paid' ? NOT_FREE : TOTAL_UNKNOWN, `the total changed right before the order (button: "${label}")`);
    return await clickPinned(pin.target, label, clickOptions);
  } finally {
    await pin.release();
  }
};

/** A source that reads the text of one element (a dialog) instead of the whole page. `timer` waits between reads. */
export const scopedSource = (locator, timer) => ({
  evaluate: () => locator.first().innerText({ timeout: 5000 }),
  waitForTimeout: ms => timer.waitForTimeout(ms),
});
