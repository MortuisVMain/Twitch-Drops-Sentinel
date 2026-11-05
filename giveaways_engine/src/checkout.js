// Stands between a claim and a real charge: anything but a clear zero on the page must stop the order.
const CURRENCY = '\\p{Sc}';
const NUMBER = '\\d(?:[\\d\\s.,]*\\d)?';
const AMOUNT = `(?:[A-Z]{0,2}${CURRENCY}|[A-Z]{3}\\s)\\s*${NUMBER}|${NUMBER}\\s*(?:${CURRENCY}|[A-Z]{3}\\b|руб)`;
const WHOLE_AMOUNT = new RegExp(`^-?(?:${AMOUNT})\\.?$`, 'u');
const STARTS_LIKE_AMOUNT = new RegExp(`^-?(?:${CURRENCY}|\\d)`, 'u');
const TOTAL_LINE = /(?<![\p{L}\d])(?<!sub[\s-])(order total|grand total|total due|total to pay|amount due|total|итого к оплате|всего к оплате|сумма к оплате|к оплате|итого|всего|сумма)(?=[\s:(]|$)[\s:]*(?:\([^)]*\))?[\s:]*(.*)$/iu;
const NOT_THE_PRICE = /saving|saved|discount|скидк|эконом/i; // a saving next to the word "total" is not what gets charged
const FREE_WORD = /^(?:free|бесплатно)\.?$/iu; // Epic and Fab may write the word where the amount would be

/** Statuses of an order that was not placed; they start with "failed" and are not shown as claimed. */
export const NOT_FREE = 'failed:not-free';
export const TOTAL_UNKNOWN = 'failed:total-unknown';

// A price is zero when it has no digit but 0, whatever the locale's separators are.
const hasNonZeroDigit = text => /[1-9]/.test(text);

/**
 * 'free' only if every total line says zero; 'paid' if any names a price; 'unknown' if the page does not say.
 * With `freeWord` the word Free / Бесплатно in place of the amount counts as zero (it never beats a price).
 */
export const orderTotalState = (text, { freeWord = false } = {}) => {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let state = 'unknown';
  let unreadable = false;
  for (const [i, line] of lines.entries()) {
    const match = TOTAL_LINE.exec(line);
    if (!match) continue;
    if (NOT_THE_PRICE.test(match[2])) continue;
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

/**
 * Clicks an order button only when the page (or iframe) `source` clearly says the order is free: the button names no
 * price, the total holds at zero for three reads and reads zero once more right before the click.
 * Anything unreadable or unknown is refused with a status and a reason; nothing is clicked.
 */
export const clickOnlyIfFree = async (button, source, { timer = source, tries = 10, clickOptions } = {}) => {
  let label;
  try {
    label = String(await button.innerText({ timeout: 5000 })).trim();
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
  await button.click(clickOptions);
  return { refused: false, clicked: true, label };
};
