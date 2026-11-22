// Paid games that are 100% off for a while (free to keep), outside the stores' giveaway blocks.
// A game that is always free (free-to-play, demo) has no original price and is never listed here.

const EPIC_SEARCH_HASH = '7d58e12d9dd8cb14c84a3ff18d360bf9f0caa96bf218f2c5fda68ba88d68a437'; // searchStoreQuery, as the store's browse page sends it
// The store's own "Discounted, Price: Low to High" list: 100%-off games come first
export const EPIC_BROWSE_URL = 'https://store.epicgames.com/en-US/browse?sortBy=currentPrice&sortDir=ASC&priceTier=tierDiscouted&category=Game&count=40';
export const GOG_CATALOG_URL = 'https://catalog.gog.com/v1/catalog?limit=48&order=asc:price&discounted=eq:true&price=between:0,0&productType=in:game,pack&countryCode=US&locale=en-US&currencyCode=USD';
export const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

const cleanSlug = s => String(s ?? '').split(/[/?#]/)[0].trim().toLowerCase();

/** Epic searchStore elements → [{ title, slug }] of paid games now at 0. */
export const epicHundredOff = elements => {
  const found = [];
  for (const el of Array.isArray(elements) ? elements : []) {
    const price = el?.price?.totalPrice;
    if (price?.discountPrice !== 0 || !(price?.originalPrice > 0)) continue;
    const pages = [...(el.offerMappings ?? []), ...(el.catalogNs?.mappings ?? [])];
    const slug = cleanSlug((pages.find(m => m?.pageType === 'productHome') ?? pages[0])?.pageSlug || el.productSlug);
    if (slug && !found.some(g => g.slug === slug)) found.push({ title: el.title, slug });
  }
  return found;
};

/** Cards read from Epic's browse page ({ href, text }) → slugs of those marked "-100%" and Free. */
export const epicHundredOffCards = cards => {
  const slugs = [];
  for (const { href, text } of Array.isArray(cards) ? cards : []) {
    const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim());
    if (!lines.some(l => /^-\s?100\s?%$/.test(l)) || !lines.some(l => /^(free|бесплатно)$/i.test(l))) continue;
    const m = String(href ?? '').match(/\/p\/([^/?#]+)/);
    const slug = m && cleanSlug(m[1]);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
};

/** GOG catalog products → [{ title, url }] of paid games now at 0. */
export const gogHundredOff = products => (Array.isArray(products) ? products : [])
  .filter(p => Number(p?.price?.finalMoney?.amount) === 0 && Number(p?.price?.baseMoney?.amount) > 0)
  .map(p => ({ title: p.title, url: p.storeLink || `https://www.gog.com/en/game/${p.slug}` }));

/** true when no 100%-off scan finished within the interval (or the time is unknown). */
export const scanDue = (lastScan, now = Date.now(), interval = SCAN_INTERVAL_MS) => {
  const t = Date.parse(lastScan);
  return !Number.isFinite(t) || now - t >= interval || t > now;
};

/**
 * Epic product URLs of 100%-off games, read in the signed-in store page (Epic's API refuses requests from outside a browser).
 * Epic's search API first; if it answers nothing usable, the cards of the browse page. Throws when both fail.
 */
export const findEpicHundredOff = async page => {
  const vars = { allowCountries: 'US', category: 'games/edition/base|bundles/games', count: 40, country: 'US', locale: 'en-US', onSale: true, sortBy: 'currentPrice', sortDir: 'ASC', start: 0, withPrice: true };
  const query = `/graphql?operationName=searchStoreQuery&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EPIC_SEARCH_HASH } }))}`;
  let apiError;
  try {
    const body = await page.evaluate(async q => {
      const r = await fetch(q, { credentials: 'include' }); // eslint-disable-line no-undef
      return { status: r.status, json: r.ok ? await r.json() : null };
    }, query);
    const elements = body.json?.data?.Catalog?.searchStore?.elements;
    if (!Array.isArray(elements)) throw new Error(`HTTP ${body.status}${body.json?.errors ? `, ${body.json.errors[0]?.message}` : ''}`);
    return epicHundredOff(elements).map(g => ({ ...g, url: `https://store.epicgames.com/en-US/p/${g.slug}` }));
  } catch (err) {
    apiError = err;
  }
  console.warn(`  Epic's search API did not answer (${apiError.message}): reading the browse page instead.`);
  await page.goto(EPIC_BROWSE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href*="/p/"]').first().waitFor({ timeout: 20000 });
  const cards = await page.evaluate(() => [...document.querySelectorAll('a[href*="/p/"]')].map(a => { // eslint-disable-line no-undef
    let el = a;
    for (let i = 0; el && i < 4 && !/%/.test(el.innerText); i++) el = el.parentElement;
    return { href: a.getAttribute('href'), text: el?.innerText ?? '' };
  }));
  return epicHundredOffCards(cards).map(slug => ({ title: slug, slug, url: `https://store.epicgames.com/en-US/p/${slug}` }));
};
