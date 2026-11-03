// Stands between a claim and a real charge: anything but a clear zero on the page must stop the order.
const CURRENCY = '[$€£¥₽]';
const NUMBER = '\\d(?:[\\d\\s.,]*\\d)?';
const AMOUNT = `(?:[A-Z]{0,2}${CURRENCY}|[A-Z]{3}\\s)\\s*${NUMBER}|${NUMBER}\\s*(?:${CURRENCY}|[A-Z]{3}\\b|руб)`;
const WHOLE_AMOUNT = new RegExp(`^-?(?:${AMOUNT})\\.?$`);
const ANY_AMOUNT = new RegExp(AMOUNT, 'g');
const STARTS_LIKE_AMOUNT = new RegExp(`^-?(?:${CURRENCY}|\\d)`);
const TOTAL_LINE = /^(order total|grand total|total due|total to pay|amount due|total|итого к оплате|всего к оплате|сумма к оплате|к оплате|итого|всего|сумма)(?=[\s:(]|$)[\s:]*(?:\([^)]*\))?[\s:]*(.*)$/i;

// A price is zero when it has no digit but 0, whatever the locale's separators are.
const isZero = amount => !/[1-9]/.test(amount);

/** 'free' only if every total line says zero; 'paid' if any names a price; 'unknown' if the page does not say. */
export const orderTotalState = text => {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let state = 'unknown';
  let unreadable = false;
  for (const [i, line] of lines.entries()) {
    const match = TOTAL_LINE.exec(line);
    if (!match) continue;
    const amount = match[2] || lines[i + 1] || '';
    if (WHOLE_AMOUNT.test(amount)) {
      if (!isZero(amount)) return 'paid';
      state = 'free';
    } else if (match[2] && STARTS_LIKE_AMOUNT.test(match[2])) {
      unreadable = true; // reads like a price, but not one we understand
    }
  }
  return unreadable ? 'unknown' : state;
};

/** True if the text, such as the label of the order button, names a price above zero. */
export const hasPaidAmount = text => (String(text).match(ANY_AMOUNT) || []).some(amount => !isZero(amount));

export const readPageText = page => page.evaluate(() => document.body.innerText).catch(err => {
  console.warn(`Cannot read the checkout page: ${err.message}`);
  return '';
});

/** The total keeps changing while a coupon applies, so zero has to hold for three checks in a row. */
export const waitForFreeOrder = async page => {
  let zeroChecks = 0;
  for (let i = 0; i < 20 && zeroChecks < 3; i++) {
    zeroChecks = orderTotalState(await readPageText(page)) === 'free' ? zeroChecks + 1 : 0;
    if (zeroChecks < 3) await page.waitForTimeout(1000);
  }
  return zeroChecks === 3;
};
