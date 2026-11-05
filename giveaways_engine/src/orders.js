// Epic and Fab: what may be clicked on the way to an order. Anything not clearly free is refused, never clicked.
import { NOT_FREE, TOTAL_UNKNOWN, clickOnlyIfFree, hasPaidAmount, orderTotalState, readPageText, refusal } from './checkout.js';

const BUTTON = 'button:not([disabled]):not(:has(.payment-loading--loading))';
const buttonsWith = texts => texts.map(text => `${BUTTON}:has-text("${text}")`).join(', ');

/** Dialogs that only ask to be dismissed. None of them places an order. */
export const DISMISS_SELECTOR = buttonsWith(['Continue', 'Продолжить', 'View Product', 'Agree', 'Accept', 'I understand']);
/** Buttons that place an order: they are clicked only through the free-total gate. */
export const ORDER_SELECTOR = buttonsWith(['Yes, buy now', 'Place Order', 'Оформить заказ', 'Add to library', 'Добавить в библиотеку']);

/** The only labels of Epic's purchase button that mean a free claim. */
const FREE_GET_LABEL = /^(?:get|получить)$/i;

/** Writes a refusal where the run keeps its status (db entry and notification), and says why. */
export const recordRefusal = (dbEntry, notifyItem, result) => {
  console.error(`  Not ordering (${result.status}): ${result.reason}`);
  dbEntry.status = result.status;
  notifyItem.status = result.status;
};

/** Epic's "Get" button: clicked only if it says exactly Get / Получить and the page shows no paid total. */
export const clickGetIfFree = async (button, label, page) => {
  const text = String(label ?? '').trim();
  if (!text) return refusal(TOTAL_UNKNOWN, 'the purchase button has no text');
  if (!FREE_GET_LABEL.test(text) || hasPaidAmount(text)) return refusal(NOT_FREE, `the purchase button says "${text}", not a free "Get"`);
  if (orderTotalState(await readPageText(page), { freeWord: true }) === 'paid') return refusal(NOT_FREE, 'the page shows a paid total');
  await button.click({ delay: 11 });
  return { refused: false, clicked: true, label: text };
};

/**
 * Age gates, content warnings and edition dialogs after the click on Get. A dialog that places an order goes through
 * the free-total gate; the first one that is refused ends the loop and is returned. The loop ends after `attempts`.
 */
export const settleModals = async (page, { attempts = 10, log = console.log } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await page.waitForTimeout(500);
    const dismiss = page.locator(DISMISS_SELECTOR).first();
    if (await dismiss.isVisible().catch(() => false)) {
      log(`  Dismissing modal: "${(await dismiss.innerText().catch(() => '')).trim()}"...`);
      await dismiss.click().catch(() => {});
      await page.waitForTimeout(1000);
      continue;
    }
    const order = page.locator(ORDER_SELECTOR).first();
    if (!await order.isVisible().catch(() => false)) break;
    const result = await clickOnlyIfFree(order, page);
    if (result.refused) return result;
    log(`  Clicked order button: "${result.label}"`);
    await page.waitForTimeout(1000);
  }
  return { refused: false, clicked: false };
};

/** Fab's "Buy now" only opens the checkout; still, a button with a price or a page with a paid total is not opened. */
export const clickBuyNowIfFree = async (button, page) => {
  let label;
  try {
    label = String(await button.innerText({ timeout: 5000 })).trim();
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `cannot read the Buy now button: ${err.message}`);
  }
  if (!label) return refusal(TOTAL_UNKNOWN, 'the Buy now button has no text');
  if (hasPaidAmount(label)) return refusal(NOT_FREE, `the Buy now button names a price: "${label}"`);
  if (orderTotalState(await readPageText(page), { freeWord: true }) === 'paid') return refusal(NOT_FREE, 'the listing page shows a paid total');
  await button.click();
  return { refused: false, clicked: true, label };
};

/** A Fab search result is free only at 100% off: "promotional" alone can mean any discount. */
export const isFreeListing = result => result?.priceTier?.discountPercentage === 100;
