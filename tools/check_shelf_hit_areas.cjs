// Shelf tile hit-area check in headless Edge. The exclude button must not own more than its own strip:
// clicks on a tile's title, cover or status lines must never reach it (a lost `position: relative` once let its
// ::before hit area anchor to the whole tile and exclude the game on any click).
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_shelf_hit_areas.cjs <harness-dir>
// (A real click cannot be observed here: the fixture does not apply an exclusion, so hit-testing is the proof.)
// Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check_shelf_hit_areas.cjs <harness-dir>'); process.exit(2); }
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Runs in the page: where does elementFromPoint land for each tile?
function probe() {
  const out = { tiles: 0, problems: [] };
  const cards = [...document.querySelectorAll('.cartridge-card')].filter((c) => c.querySelector('.cover-exclude-btn'));
  out.tiles = cards.length;
  const hitsBtn = (x, y) => { const h = document.elementFromPoint(x, y); return !!(h && h.closest('.cover-exclude-btn')); };
  cards.forEach((card, i) => {
    const btn = card.querySelector('.cover-exclude-btn');
    const b = btn.getBoundingClientRect(), c = card.getBoundingClientRect();
    const tag = 'tile' + i;
    if (c.width < 40 || c.height < 40 || b.width === 0) { out.problems.push(tag + ' not measurable'); return; }
    // The button itself and its 2 px vertical strip still work.
    if (!hitsBtn((b.left + b.right) / 2, (b.top + b.bottom) / 2)) out.problems.push(tag + ' button centre does not hit the button');
    // Hit box stays near the button: nothing farther than 3 px above/below it, nothing sideways.
    for (const [name, x, y] of [['above', (b.left + b.right) / 2, b.top - 4], ['below', (b.left + b.right) / 2, b.bottom + 4], ['left', b.left - 2, (b.top + b.bottom) / 2], ['right', b.right + 2, (b.top + b.bottom) / 2]]) {
      if (x > 0 && y > 0 && x < innerWidth && y < innerHeight && hitsBtn(x, y)) out.problems.push(tag + ' button hit area extends ' + name + ' of the button');
    }
    // Tile title, cover and the card corners must not reach the button.
    const spots = [['title', card.querySelector('[class*="title"], h3, h4, .game-title')], ['cover', card.querySelector('img, [class*="cover"]:not(.cover-exclude-btn)')]];
    for (const [name, el] of spots) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && hitsBtn((r.left + r.right) / 2, (r.top + r.bottom) / 2)) out.problems.push(tag + ' ' + name + ' centre hits the exclude button');
    }
    for (const [name, fx, fy] of [['card centre', .5, .5], ['card top', .5, .08], ['card bottom-left', .1, .92]]) {
      const x = c.left + c.width * fx, y = c.top + c.height * fy;
      if (!(x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 3 && y <= b.bottom + 3) && hitsBtn(x, y)) out.problems.push(tag + ' ' + name + ' hits the exclude button');
    }
  });
  return out;
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let failed = 0;
  for (const [w, h] of [[1600, 900], [1180, 750]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/index.html?lang=ru&scale=100');
    await page.waitForSelector('.field-chassis', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.locator('.tab-btn', { hasText: 'Полка' }).first().click();
    await page.waitForTimeout(600);
    await page.locator('.node-chip', { hasText: 'Плитки' }).first().click();
    await page.waitForTimeout(600);
    const res = await page.evaluate(probe);
    const problems = res.problems.slice();
    if (res.tiles < 3) problems.push('only ' + res.tiles + ' tiles with an exclude button (expected >= 3)');
    if (errors.length) problems.push('page errors: ' + errors.join(' | '));
    const tag = w + 'x' + h;
    if (problems.length) { failed++; console.log('FAIL ' + tag + ' (' + res.tiles + ' tiles)\n  ' + problems.slice(0, 40).join('\n  ')); }
    else console.log('ok   ' + tag + ' (' + res.tiles + ' tiles)');
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failed ? failed + ' viewport(s) failed' : 'all viewports passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
