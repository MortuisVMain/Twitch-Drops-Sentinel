// Epic and Fab: what may be clicked on the way to an order. Anything not clearly free is refused, never clicked.
import { NOT_FREE, TOTAL_UNKNOWN, clickOnlyIfFree, clickPinned, hasNonZeroAmount, hasPaidAmount, listingShowsPaidTotal, orderTotalState, pinElement, readLabel, readPageText, refusal, scopedSource } from './checkout.js';

const BUTTON = 'button:not([disabled]):not(:has(.payment-loading--loading))';
const buttonsWith = texts => texts.map(text => `${BUTTON}:has-text("${text}")`).join(', ');

/**
 * Candidates for a dismissal. `:has-text` is a case-insensitive substring, so this only FINDS buttons: whether one is
 * clicked is decided by its exact label (classifyModalLabel).
 */
export const DISMISS_SELECTOR = buttonsWith(['Continue', 'Продолжить', 'View Product', 'Agree', 'Accept', 'Принять', 'Согласен', 'I understand']);
/** Buttons that place an order: they are clicked only through the free-total gate. */
export const ORDER_SELECTOR = buttonsWith(['Yes, buy now', 'Place Order', 'Оформить заказ', 'Add to library', 'Добавить в библиотеку']);

/** The whole label of a dialog button that only asks to be dismissed. */
const DISMISS_LABEL = /^(?:continue|продолжить|view product|agree|i agree|accept|i accept|принять|согласен|i understand)$/i;
/** Words that make a button a possible order whatever else it says. */
const ORDER_WORDS = /pay|buy|order|purchase|place|checkout|library|оплат|купить|заказ|библиотек/i;

/** 'dismiss' only for an exact, harmless label; everything else, a digit or an order word included, is 'refuse'. */
export const classifyModalLabel = label => {
  const text = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!text || /\d/.test(text) || ORDER_WORDS.test(text)) return 'refuse';
  return DISMISS_LABEL.test(text) ? 'dismiss' : 'refuse';
};

/** The dialog that holds the order button when there is no checkout iframe. */
export const ORDER_DIALOG = '[role="dialog"], [aria-modal="true"], dialog, #webPurchaseContainer';
/** The whole label of a page-level order button. "Claim" or "Get Now" on a banner is not one. */
export const PAGE_ORDER_LABEL = /^(?:place order|add to library|оформить заказ|добавить в библиотеку)$/i;
/** Epic's call to action on a product page; a button that merely contains "Get" is not it. */
export const CTA_SELECTOR = 'button[data-testid="purchase-cta-button"], button[class*="sidebarBuyButton"]';

/** The only labels of Epic's purchase button that mean a free claim. */
const FREE_GET_LABEL = /^(?:get|получить)$/i;

/** Writes a refusal where the run keeps its status (db entry and notification), and says why. */
export const recordRefusal = (dbEntry, notifyItem, result) => {
  console.error(`  Not ordering (${result.status}): ${result.reason}`);
  dbEntry.status = result.status;
  notifyItem.status = result.status;
};

// ---------- Epic: is this game free? Positive evidence only ----------

const PROMOTIONS_URL = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
const HUNDRED_OFF = /^[-−–]\s?100\s?%$/u; // the discount badge of a free promotion
const FREE_WORD = /^(?:free|бесплатно)\.?$/iu;

/** The page slug of a store URL, lower case: .../p/some-game?x=1 -> some-game. '' if there is none. */
export const slugFromUrl = url => {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]).toLowerCase() : '';
  } catch {
    return '';
  }
};

/**
 * The slugs of the games that Epic's promotions list (freeGamesPromotions) sells at exactly 0 right now: a running
 * promotional offer and `discountPrice === 0`. Anything else (a discount, a coming offer, an expired one) is left out.
 */
export const freePromoSlugs = (elements, now = Date.now()) => {
  const slugs = new Set();
  for (const el of Array.isArray(elements) ? elements : []) {
    if (el?.price?.totalPrice?.discountPrice !== 0) continue;
    const offers = (el.promotions?.promotionalOffers ?? []).flatMap(group => group?.promotionalOffers ?? []);
    if (!offers.some(offer => Date.parse(offer?.startDate) <= now && now < Date.parse(offer?.endDate))) continue;
    const names = [el.productSlug, el.urlSlug, ...(el.catalogNs?.mappings ?? []).map(m => m?.pageSlug), ...(el.offerMappings ?? []).map(m => m?.pageSlug)];
    for (const name of names) {
      const key = String(name ?? '').split(/[/?#]/)[0].trim().toLowerCase(); // "some-game/home" -> some-game
      if (key) slugs.add(key);
    }
  }
  return slugs;
};

/** Epic's current free promotions as a Set of slugs, or null if the list cannot be read (then it proves nothing). */
export const fetchFreePromoSlugs = async (fetchImpl = fetch, now = Date.now()) => {
  try {
    const res = await fetchImpl(PROMOTIONS_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const elements = (await res.json())?.data?.Catalog?.searchStore?.elements;
    if (!Array.isArray(elements)) throw new Error('the list has an unexpected shape');
    return freePromoSlugs(elements, now);
  } catch (err) {
    console.warn(`  Cannot read Epic's free promotions list (${err.message}): a "Get" then needs the price block of the page to say free.`);
    return null;
  }
};

/** true: this page's game is in the list at 0; false: the list is known and does not name it; null: no list. */
export const promoFreeForPage = (slugs, url) => (slugs instanceof Set ? slugs.has(slugFromUrl(url)) : null);

/**
 * Does the game on this page cost nothing? Decided from two things only, and 'free' needs one of them to say so:
 *  - `promoFree`: Epic's promotions list names this page's game at 0 (the preferred evidence);
 *  - `priceBlock`: the text around the purchase button. A "-100%" badge is free (the struck-out original price beside it
 *    is normal); the word Free / Бесплатно is free only when no other amount is shown.
 * A charge in the block (a total, "Pay now", "Then $9.99/month") is 'paid' whatever else is said. A block that shows a
 * price and no free mark, even next to a promotions entry, is 'unknown'. Returns { state, reason, source }.
 */
export const getEvidence = ({ promoFree = null, priceBlock = '' } = {}) => {
  const block = String(priceBlock ?? '');
  if (orderTotalState(block, { freeWord: true }) === 'paid') return { state: 'paid', reason: 'the price block next to the button shows a charge' };
  const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const percent = lines.some(line => HUNDRED_OFF.test(line));
  const word = lines.some(line => FREE_WORD.test(line));
  const priced = lines.some(hasNonZeroAmount);
  if (promoFree === true) {
    if (priced && !percent && !word) return { state: 'unknown', reason: 'Epic lists the game at 0, but the page shows a price with no free mark' };
    return { state: 'free', source: 'promotions-list', reason: 'Epic\'s promotions list has this game at 0' };
  }
  if (percent || (word && !priced)) return { state: 'free', source: 'price-block', reason: 'the price block says free' };
  return { state: 'unknown', reason: 'neither Epic\'s promotions list nor the price block next to the button says this game is free' };
};

/** The text around a purchase button (a few levels up, as long as it stays short), where the price is. '' if unreadable. */
const readPriceBlock = async target => {
  if (typeof target?.evaluate !== 'function') return '';
  try {
    const text = await target.evaluate(el => {
      let block = el;
      for (let i = 0; i < 4; i++) {
        const up = block.parentElement;
        if (!up || (up.innerText || '').length > 500) break;
        block = up;
      }
      return block.innerText || '';
    });
    return typeof text === 'string' ? text : '';
  } catch (err) {
    console.warn(`  Cannot read the price block: ${err.message}`);
    return '';
  }
};

/**
 * Epic's "Get" button. Clicked only if (1) the element, pinned and read again right now, says exactly Get / Получить,
 * (2) the page shows no paid total, (3) free is positively confirmed (see getEvidence), (4) its label is unchanged
 * right before the click. `label` is only the label read earlier; it is no evidence by itself.
 */
export const clickGetIfFree = async (button, label, page, { promoFree = null } = {}) => {
  const earlier = String(label ?? '').trim();
  if (!earlier) return refusal(TOTAL_UNKNOWN, 'the purchase button has no text');
  if (!FREE_GET_LABEL.test(earlier) || hasPaidAmount(earlier)) return refusal(NOT_FREE, `the purchase button says "${earlier}", not a free "Get"`);
  let pin;
  try {
    pin = await pinElement(button);
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `cannot find the purchase button: ${err.message}`);
  }
  try {
    let now;
    try {
      now = await readLabel(pin.target);
    } catch (err) {
      return refusal(TOTAL_UNKNOWN, `cannot read the purchase button: ${err.message}`);
    }
    if (!FREE_GET_LABEL.test(now) || hasPaidAmount(now)) return refusal(NOT_FREE, `the purchase button now says "${now}", not a free "Get"`);
    if (orderTotalState(await readPageText(page), { freeWord: true }) === 'paid') return refusal(NOT_FREE, 'the page shows a paid total');
    const evidence = getEvidence({ promoFree, priceBlock: await readPriceBlock(pin.target) });
    if (evidence.state !== 'free') return refusal(evidence.state === 'paid' ? NOT_FREE : TOTAL_UNKNOWN, evidence.reason);
    console.log(`  Free confirmed (${evidence.source}): ${evidence.reason}`);
    return await clickPinned(pin.target, now, { delay: 11 });
  } finally {
    await pin.release();
  }
};

// ---------- the modal loop ----------

const modalRefusal = label => (!label || (!/\d/.test(label) && !ORDER_WORDS.test(label))
  ? refusal(TOTAL_UNKNOWN, `a dialog button ("${label}") is not on the list of harmless ones and was not clicked`)
  : refusal(NOT_FREE, `a dialog button ("${label}") may place an order and was not clicked`));

/** Dismisses the dialog button `dismiss` if its exact label is harmless. Returns a refusal when it is not clicked, else null. */
const dismissModal = async (dismiss, log) => {
  let pin;
  try {
    pin = await pinElement(dismiss);
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `cannot find the dialog button: ${err.message}`);
  }
  try {
    let label;
    try {
      label = await readLabel(pin.target);
    } catch (err) {
      return refusal(TOTAL_UNKNOWN, `cannot read the dialog button: ${err.message}`);
    }
    if (classifyModalLabel(label) !== 'dismiss') return modalRefusal(label);
    log(`  Dismissing modal: "${label}"...`);
    const result = await clickPinned(pin.target, label);
    // a click that did not go through only leaves the dialog where it was (the loop is bounded); a changed label stops it
    return result.refused && result.status === NOT_FREE ? result : null;
  } finally {
    await pin.release();
  }
};

/**
 * Age gates, content warnings and edition dialogs after the click on Get. A dialog button is dismissed only on an exact
 * harmless label; any other button that matches (a "Continue to payment", an "Accept and pay $9.99") ends the loop
 * with a refusal. A dialog that places an order goes through the free-total gate; the first one that is refused ends
 * the loop and is returned. The loop ends after `attempts`.
 */
export const settleModals = async (page, { attempts = 10, log = console.log } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await page.waitForTimeout(500);
    const dismiss = page.locator(DISMISS_SELECTOR).first();
    if (await dismiss.isVisible().catch(() => false)) {
      const refused = await dismissModal(dismiss, log);
      if (refused) return refused;
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

// ---------- the small clicks around an order: exact label, one element, bounded ----------

/** Clicks the one element behind `locator` only if its whole label matches `labelRe` and names no number. Never throws. */
export const clickExactLabel = async (locator, labelRe, clickOptions = {}) => {
  let pin;
  try {
    pin = await pinElement(locator, 3000);
  } catch {
    return false;
  }
  try {
    const label = await readLabel(pin.target);
    if (!labelRe.test(label) || hasPaidAmount(label)) return false;
    return !(await clickPinned(pin.target, label, clickOptions)).refused;
  } catch (err) {
    console.warn(`  Not clicking "${labelRe}": ${err.message}`);
    return false;
  } finally {
    await pin.release();
  }
};

const EU_ACCEPT = /^(?:i accept|i agree|принять)$/i;
const EULA_ACCEPT = /^(?:accept|принять)$/i;
const PIN_CONTINUE = /^(?:continue|продолжить)$/i;

/**
 * The "I Accept" that EU accounts get after the order click. Called only after a gated order click; waits `timeout` ms
 * for the button in `scope` (page or iframe), clicks only that exact label, and never beside a paid total on `source`.
 */
export const acceptEuAgreement = async (scope, source, { timeout = 4000 } = {}) => {
  try {
    const button = scope.locator(BUTTON).filter({ hasText: EU_ACCEPT }).first();
    try {
      await button.waitFor({ state: 'visible', timeout });
    } catch {
      return false; // not an EU account: nothing to accept
    }
    if (orderTotalState(await readPageText(source), { freeWord: true }) === 'paid') {
      console.error('  Not accepting: the page shows a paid total.');
      return false;
    }
    return await clickExactLabel(button, EU_ACCEPT);
  } catch (err) {
    console.warn(`  EU agreement not accepted: ${err.message}`); // never rejects: the caller awaits it later, next to the confirmation
    return false;
  }
};

/** The End User License Agreement (shown once per account), answered before the game is left. */
export const acceptEulaIfShown = async (page, { timeout = 3000 } = {}) => {
  try {
    await page.locator('text=/end user license agreement/i').first().waitFor({ timeout });
  } catch {
    return false;
  }
  console.log('  Accept End User License Agreement (only needed once)');
  await page.locator('input#agree').first().check({ timeout: 2000 }).catch(err => console.warn(`  Cannot tick the agreement: ${err.message}`));
  return clickExactLabel(page.locator('button').filter({ hasText: EULA_ACCEPT }).first(), EULA_ACCEPT);
};

/** The parental-control PIN box inside the checkout frame: typed and confirmed only if a PIN is set. */
export const enterParentalPin = async (frame, pin, { timeout = 2500, notify = () => {} } = {}) => {
  try {
    await frame.locator('.payment-pin-code').first().waitFor({ timeout });
  } catch {
    return false;
  }
  if (!pin) {
    console.error('  EG_PARENTALPIN not set. Need to enter Parental Control PIN manually.');
    notify('epic-games: EG_PARENTALPIN not set. Need to enter Parental Control PIN manually.');
    return false;
  }
  await frame.locator('input.payment-pin-code__input').first().pressSequentially(String(pin), { timeout: 3000 });
  return clickExactLabel(frame.locator('button').filter({ hasText: PIN_CONTINUE }).first(), PIN_CONTINUE, { delay: 11 });
};

/**
 * The order button of the page-level flow (no checkout iframe): only inside a dialog, only with an exact order label,
 * and the total is read from that dialog, not from the whole page. Returns { button, source }.
 */
export const pageOrderTarget = page => {
  const orderButtons = page.locator(BUTTON).filter({ hasText: PAGE_ORDER_LABEL });
  const dialog = page.locator(ORDER_DIALOG).filter({ has: orderButtons }).first();
  return { button: dialog.locator(BUTTON).filter({ hasText: PAGE_ORDER_LABEL }).first(), source: scopedSource(dialog, page) };
};

/** Fab's "Buy now" only opens the checkout; still, a button with a price or a listing with a paid total is not opened. */
export const clickBuyNowIfFree = async (button, page) => {
  let pin;
  try {
    pin = await pinElement(button);
  } catch (err) {
    return refusal(TOTAL_UNKNOWN, `cannot find the Buy now button: ${err.message}`);
  }
  try {
    let label;
    try {
      label = await readLabel(pin.target);
    } catch (err) {
      return refusal(TOTAL_UNKNOWN, `cannot read the Buy now button: ${err.message}`);
    }
    if (!label) return refusal(TOTAL_UNKNOWN, 'the Buy now button has no text');
    if (hasPaidAmount(label)) return refusal(NOT_FREE, `the Buy now button names a price: "${label}"`);
    // Read as a listing, not as an order: "total ratings 15" is no total. The checkout this click opens is gated by clickOnlyIfFree.
    if (listingShowsPaidTotal(await readPageText(page))) return refusal(NOT_FREE, 'the listing page shows a paid total');
    return await clickPinned(pin.target, label);
  } finally {
    await pin.release();
  }
};

/** A Fab search result is free only at 100% off: "promotional" alone can mean any discount. */
export const isFreeListing = result => result?.priceTier?.discountPercentage === 100;
