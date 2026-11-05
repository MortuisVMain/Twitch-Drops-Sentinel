// Dashboard "ВНЕ ОЧЕРЕДИ" (off-queue) card check in headless Edge (same engine as WebView2).
// Idle (?pip=idle, no active drop => console collapsed, large area) must show poster cards; farming (default fixture) must show
// compact cards. Cards may never stretch to fill the free height: each card is measured against what its own children need.
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_override_cards.cjs <harness-dir>
// Matrix: idle,running x 1600x900, 2321x1251, 1180x750. Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check_override_cards.cjs <harness-dir>'); process.exit(2); }
const root = path.resolve(dir);
// document.fonts.check() is true for a family that was never declared, so also require a loaded Inter Variable face.
async function interReady(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('12px "Inter Variable"') && [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Inter Variable' && f.status === 'loaded');
  });
}
const FONT_MSG = 'INVALID TEST: "Inter Variable" is not loaded (harness built without node_modules/@fontsource-variable?); metrics would be measured on a fallback font';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Runs in the page. idle: boolean. Returns { cards, problems }.
function probe(idle) {
  const problems = [];
  const grid = document.getElementById('overrideGrid');
  const cards = grid ? [...grid.querySelectorAll('.override-pill-card')] : [];
  const collapsed = !!document.querySelector('.middle-console-island.console-collapsed');
  if (collapsed !== idle) problems.push('console collapsed=' + collapsed + ' but the state is ' + (idle ? 'idle' : 'running'));
  if (!cards.length) { problems.push('no .override-pill-card in #overrideGrid'); return { cards: 0, problems }; }
  const num = (v) => parseFloat(v) || 0;
  const rect = (el) => el.getBoundingClientRect();

  cards.forEach((card, i) => {
    const tag = 'card' + i;
    const cs = getComputedStyle(card), r = rect(card);
    const kids = [...card.children];
    const cover = card.querySelector('.override-cover');
    // 1. a cover (image or the NO POSTER fallback) with a real size
    if (!cover) problems.push(tag + ' has no .override-cover');
    else {
      const cr = rect(cover);
      if (cr.width < 8 || cr.height < 8) problems.push(tag + ' cover is ' + cr.width.toFixed(0) + 'x' + cr.height.toFixed(0));
      if (!cover.querySelector('img, div')) problems.push(tag + ' cover has neither an image nor the fallback');
    }
    // 2. height: not more than the children need (padding + border + children + row gaps) plus a small margin
    const gap = num(cs.rowGap);
    const flow = kids.filter((k) => getComputedStyle(k).position !== 'absolute');
    const chrome = num(cs.paddingTop) + num(cs.paddingBottom) + num(cs.borderTopWidth) + num(cs.borderBottomWidth);
    // grid areas may put cover beside the text (compact): count rows by distinct top offsets, take the tallest item of each
    const rows = [];
    flow.forEach((k) => { const kr = rect(k); const row = rows.find((x) => Math.abs(x.top - kr.top) < 2); if (row) row.h = Math.max(row.h, kr.height); else rows.push({ top: kr.top, h: kr.height }); });
    // compact layout: the cover sits beside the text stack (the others start at or right of the cover's right edge)
    const others = flow.filter((k) => k !== cover);
    const spanning = !!cover && others.length > 0 && others.every((k) => rect(k).left >= rect(cover).right - 1);
    const stack = others.reduce((s, k) => s + rect(k).height, 0) + gap * Math.max(0, others.length - 1);
    const need = spanning
      ? Math.max(rect(cover).height, stack) + chrome
      : rows.reduce((s, x) => s + x.h, 0) + gap * Math.max(0, rows.length - 1) + chrome;
    if (r.height > need + 4) problems.push(tag + ' is ' + r.height.toFixed(0) + 'px tall but its content needs ' + need.toFixed(0) + 'px (stretched?)');
    // 3. the name sits right under the cover (no empty band above it): offset from card top <= padding + cover + gap + margin
    const nameEl = card.querySelector(':scope > div:not(.override-cover) > div');
    if (nameEl) {
      const above = rect(nameEl).top - r.top;
      // poster: below the cover; compact: at most the slack of the taller side (cover vs text stack) from the top
      const slack = spanning ? Math.max(0, rect(cover).height - stack) : 0;
      const allowed = num(cs.paddingTop) + num(cs.borderTopWidth) + (cover && !spanning ? rect(cover).height + gap : 0) + slack + 4;
      if (above > allowed) problems.push(tag + ' name starts ' + above.toFixed(0) + 'px below the card top (allowed ' + allowed.toFixed(0) + ')');
    }
  });

  // 4. reachable: scroll each card into view; it must then sit fully inside the viewport and inside the grid's visible box
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const scrollable = grid.scrollHeight > grid.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(grid).overflowY);
  cards.forEach((card, i) => {
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = rect(card), g = rect(grid);
    if (r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5) problems.push('card' + i + ' not inside the viewport after scrolling into view (' + [r.left, r.top, r.right, r.bottom].map((n) => n.toFixed(0)).join(',') + ')');
    if (scrollable && (r.top < g.top - 1 || r.bottom > g.bottom + 1)) problems.push('card' + i + ' does not fit inside the visible grid (grid ' + g.height.toFixed(0) + 'px, card ' + r.height.toFixed(0) + 'px)');
  });
  const all = document.querySelector('.override-show-all');
  if (all) {
    all.scrollIntoView({ block: 'nearest' });
    const r = rect(all), sec = rect(document.getElementById('overrideSection'));
    if (r.width < 8 || r.height < 8) problems.push('.override-show-all has no size');
    if (r.bottom > vh + 0.5 || r.top < -0.5) problems.push('.override-show-all outside the viewport');
    if (r.bottom > sec.bottom + 1 || r.top < sec.top - 1) problems.push('.override-show-all outside #overrideSection');
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!hit || !all.contains(hit)) problems.push('.override-show-all centre is covered by ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'));
  }

  // 5. no card overlaps another (layout positions, grid scroll offset cancels out)
  const boxes = cards.map(rect);
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const x = Math.min(boxes[a].right, boxes[b].right) - Math.max(boxes[a].left, boxes[b].left);
    const y = Math.min(boxes[a].bottom, boxes[b].bottom) - Math.max(boxes[a].top, boxes[b].top);
    if (x > 1 && y > 1) problems.push('card' + a + ' overlaps card' + b + ' by ' + x.toFixed(0) + 'x' + y.toFixed(0));
  }
  return { cards: cards.length, problems };
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let failed = 0;
  for (const idle of [true, false]) {
    for (const [w, h] of [[1600, 900], [2321, 1251], [1180, 750]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + '/index.html?lang=ru&scale=100' + (idle ? '&pip=idle' : ''));
      await page.waitForSelector('#overrideGrid', { timeout: 15000 });
      await page.waitForTimeout(1200);
      if (!(await interReady(page))) { console.error(FONT_MSG); process.exit(2); }
      const res = await page.evaluate(probe, idle);
      const problems = res.problems.slice();
      if (errors.length) problems.push('page errors: ' + errors.join(' | '));
      const tag = (idle ? 'idle   ' : 'running ') + w + 'x' + h;
      if (problems.length) { failed++; console.log('FAIL ' + tag + ' (' + res.cards + ' cards)\n  ' + problems.slice(0, 30).join('\n  ')); }
      else console.log('ok   ' + tag + ' (' + res.cards + ' cards)');
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  console.log(failed ? failed + ' case(s) failed' : 'all cases passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
