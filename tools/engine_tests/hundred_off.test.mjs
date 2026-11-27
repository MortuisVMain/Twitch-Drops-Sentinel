// Paid games at 100% off outside the giveaway blocks: found in Epic's and GOG's store lists, free-to-play never.
// Run: node --test tools/engine_tests/hundred_off.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { epicHundredOff, epicHundredOffCards, gogHundredOff, scanDue, findEpicHundredOff, SCAN_INTERVAL_MS } =
  await import(pathToFileURL(path.join(ROOT, 'giveaways_engine', 'src', 'discounts.js')).href);

const epicEl = (title, slug, discountPrice, originalPrice, extra = {}) => ({
  title, productSlug: null, urlSlug: 'abc123',
  offerMappings: [{ pageSlug: slug, pageType: 'productHome' }],
  price: { totalPrice: { discountPrice, originalPrice } }, ...extra,
});
const ELEMENTS = [
  epicEl('Contractor: The Clean Up Part II', 'contractor-the-clean-up-part-ii-1b1b57', 0, 399),
  epicEl('Always Free', 'always-free-f2p', 0, 0),
  epicEl('Plaguetrix', 'plaguetrix-3a484f', 9, 99),
  epicEl('Old Mapping', null, 0, 1999, { offerMappings: [], catalogNs: { mappings: [{ pageSlug: 'Mark-Of-The-Deep-f7dc08/home', pageType: 'productHome' }] } }),
];

test('Epic: only paid games now at 0 are found, by their store page', () => {
  assert.deepEqual(epicHundredOff(ELEMENTS), [
    { title: 'Contractor: The Clean Up Part II', slug: 'contractor-the-clean-up-part-ii-1b1b57' },
    { title: 'Old Mapping', slug: 'mark-of-the-deep-f7dc08' },
  ]);
  assert.deepEqual(epicHundredOff(null), []);
});

test('Epic browse cards: "-100%" with Free is taken, a smaller discount or a missing badge is not', () => {
  const cards = [
    { href: '/en-US/p/contractor-the-clean-up-part-ii-1b1b57', text: 'Contractor\nBase Game\n-100%\n₹179.00*\nFree' },
    { href: '/p/plaguetrix-3a484f', text: 'Plaguetrix\n-90%\n₹35.00*\n₹3.50' },
    { href: '/p/always-free', text: 'Always Free\nFree' },
    { href: '/p/ru-game', text: 'Игра\n-100 %\nБесплатно' },
  ];
  assert.deepEqual(epicHundredOffCards(cards), ['contractor-the-clean-up-part-ii-1b1b57', 'ru-game']);
});

test('GOG: free-to-play and demos at 0 are not taken', () => {
  const p = (title, final, base, slug) => ({ title, slug, storeLink: `https://www.gog.com/en/game/${slug}`, price: { finalMoney: { amount: final }, baseMoney: { amount: base } } });
  assert.deepEqual(gogHundredOff([p('Paid Game', '0.00', '9.99', 'paid_game'), p('Demo', '0.00', '0.00', 'demo'), p('Sale', '0.29', '0.99', 'sale')]),
    [{ title: 'Paid Game', url: 'https://www.gog.com/en/game/paid_game' }]);
});

test('the store is searched again only after the interval', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  assert.equal(scanDue(undefined, now), true);
  assert.equal(scanDue('garbage', now), true);
  assert.equal(scanDue(new Date(now - 60_000).toISOString(), now), false);
  assert.equal(scanDue(new Date(now - SCAN_INTERVAL_MS).toISOString(), now), true);
  assert.equal(scanDue(new Date(now + 3_600_000).toISOString(), now), true, 'a time in the future is not trusted');
});

const fakePage = ({ api, cards }) => {
  const visited = [];
  return {
    visited,
    async evaluate(fn, arg) { return arg === undefined ? cards : api(arg); },
    async goto(url) { visited.push(url); },
    locator() { return { first: () => ({ waitFor: async () => {} }) }; },
  };
};

test('findEpicHundredOff: the search API answer gives the store URLs', async () => {
  const page = fakePage({ api: async () => ({ status: 200, json: { data: { Catalog: { searchStore: { elements: ELEMENTS } } } } }) });
  const found = await findEpicHundredOff(page);
  assert.deepEqual(found.map(g => g.url), [
    'https://store.epicgames.com/en-US/p/contractor-the-clean-up-part-ii-1b1b57',
    'https://store.epicgames.com/en-US/p/mark-of-the-deep-f7dc08',
  ]);
  assert.deepEqual(page.visited, [], 'no page is opened when the API answers');
});

test('findEpicHundredOff: a refused API falls back to the browse page cards', async () => {
  const page = fakePage({
    api: async () => ({ status: 403, json: null }),
    cards: [{ href: '/p/contractor-the-clean-up-part-ii-1b1b57', text: 'Contractor\n-100%\nFree' }],
  });
  const found = await findEpicHundredOff(page);
  assert.deepEqual(found.map(g => g.slug), ['contractor-the-clean-up-part-ii-1b1b57']);
  assert.equal(page.visited.length, 1);
  assert.match(page.visited[0], /browse\?sortBy=currentPrice&sortDir=ASC&priceTier=tierDiscouted/);
});
