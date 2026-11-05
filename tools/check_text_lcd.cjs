// Subpixel (ClearType/LCD) text check in headed Edge (same engine as WebView2). Headless never does LCD, so the window is headed and parked off-screen.
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_text_lcd.cjs <harness-dir>
// For each theme x backdrop x tab it screenshots at DPR 1, samples neutral-coloured text and scores mean |R-B| over edge pixels
// (grayscale AA ~ 4-6, ClearType ~ 90+). A control page must score >= 60 or the test is invalid (exit 2).
// Exit 1 unless every tab in every combo has >= 90% of sampled text passing (score >= 40).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check_text_lcd.cjs <harness-dir>'); process.exit(2); }

const THEMES = ['titanium', 'apple-luna', 'light'];
const BACKDROPS = ['photo', '3d'];
const TABS = ['Дашборд', 'Полка', 'Раздачи', 'Диммер', 'Настройки'];
// Measured gap: grayscale AA scores 3-6, the dimmest small LCD text 31-39. PASS_SCORE sits inside that gap.
const PASS_SCORE = 25, PASS_SHARE = 0.9, CONTROL_MIN = 60;
// A tab with fewer samples proves nothing (real tabs yield 9-61 samples; the sparsest, the shelf in light themes, yields 9).
// A single surface (one panel) with at least SURFACE_MIN_SAMPLES samples must also have a majority of samples above
// GRAY_SCORE (grayscale AA scores 3-6, weak or small LCD text 30-40), so one entirely gray panel cannot hide inside
// the tab-wide 90% allowance.
const MIN_SAMPLES = 8, SURFACE_MIN_SAMPLES = 2, SURFACE_MIN_SHARE = 0.5, GRAY_SCORE = 15;

const CONTROL_HTML = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;color:#000;font:16px Arial"><p id="c" style="margin:40px">The quick brown fox jumps over the lazy dog, Съешь же ещё этих мягких французских булок.</p>';
const root = path.resolve(dir);
// document.fonts.check() is true for a family that was never declared, so also require a loaded Inter Variable face.
async function interReady(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('12px "Inter Variable"') && [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Inter Variable' && f.status === 'loaded');
  });
}
const FONT_MSG = 'INVALID TEST: "Inter Variable" is not loaded (harness built without node_modules/@fontsource-variable?); LCD scores would be measured on a fallback font';
const SURFACES = ['.titanium-island', '.cartridge-card', '.store-pod', '.console-header', '.danger-zone'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (rel === 'control.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(CONTROL_HTML); return; }
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Runs in the page: text rects worth sampling.
function collectRects(surfaces) {
  const out = [];
  const pathOf = (el) => { const p = []; for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) p.unshift(n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join(' > '); };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'CANVAS'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const m = cs.color.match(/rgba?\(([^)]+)\)/); if (!m) continue;
    const c = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    if (Math.abs(c[0] - c[2]) >= 12 || (c.length > 3 && c[3] < 0.9)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    const r = rg.getBoundingClientRect();
    if (r.width < 40 || r.height < 6 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) continue;
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
    const sel = surfaces.find((q) => el.closest(q));
    const host = sel ? el.closest(sel) : null;
    const surface = sel ? sel + '#' + [...document.querySelectorAll(sel)].indexOf(host) : 'other';
    out.push({ surface, x: Math.floor(r.left), y: Math.floor(r.top), w: Math.ceil(r.width), h: Math.ceil(r.height), path: pathOf(el), text: t.nodeValue.trim().slice(0, 24), fs: parseFloat(cs.fontSize) });
  }
  return out;
}

// Runs in the page: score rects against a screenshot (base64 PNG).
async function score({ b64, rects }) {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  return rects.map((r) => {
    const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
    // Background = most common brightness in the rect; edge pixels are mid-tone AND clearly off the background
    // (a light theme background itself sits at 60-230 and would otherwise dilute the score).
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) hist[Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)]++;
    const bg = hist.indexOf(Math.max(...hist));
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mean = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (mean > 60 && mean < 230 && Math.abs(mean - bg) > 20) { sum += Math.abs(d[i] - d[i + 2]); n++; }
    }
    return Object.assign({}, r, { edges: n, score: n >= 10 ? sum / n : null });
  });
}

async function shoot(page) {
  const rects = await page.evaluate(collectRects, SURFACES);
  const png = await page.screenshot();
  const scored = await page.evaluate(score, { b64: png.toString('base64'), rects });
  return scored.filter((s) => s.score !== null);
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--window-position=-3000,2000', '--force-device-scale-factor=1'] });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const newCtx = () => browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  // Control: plain opaque page must show ClearType, else the environment cannot prove anything.
  const cctx = await newCtx(); const cpage = await cctx.newPage();
  await cpage.goto(base + '/control.html');
  const ctl = await shoot(cpage);
  await cctx.close();
  const ctlScore = ctl.length ? ctl.reduce((a, s) => a + s.score, 0) / ctl.length : 0;
  console.log('control page score ' + ctlScore.toFixed(1) + ' (needs >= ' + CONTROL_MIN + ')');
  if (ctlScore < CONTROL_MIN) { console.error('INVALID TEST: control page is grayscale, LCD text unavailable in this environment'); await browser.close(); server.close(); process.exit(2); }

  let failedTabs = 0, total = 0;
  for (const theme of THEMES) for (const bd of BACKDROPS) {
    const ctx = await newCtx();
    await ctx.addInitScript((a) => { localStorage.setItem('sentinel_backdrop_type', a.bd); localStorage.setItem('sentinel_relief_mode', 'globe'); }, { bd });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/index.html?lang=ru&scale=100&theme=' + theme);
    await page.waitForSelector('.field-chassis', { timeout: 15000 });
    if (!(await interReady(page))) { console.error(FONT_MSG); await browser.close(); server.close(); process.exit(2); }
    await page.waitForTimeout(1500);
    for (const tab of TABS) {
      total++;
      await page.locator('.tab-btn', { hasText: tab }).first().click();
      await page.mouse.move(1599, 899);
      await page.waitForTimeout(900);
      const s = await shoot(page);
      const pass = s.filter((x) => x.score >= PASS_SCORE);
      const share = s.length ? pass.length / s.length : 0;
      const bySurface = new Map();
      for (const x of s) { const g = bySurface.get(x.surface) || { n: 0, pass: 0, lcd: 0 }; g.n++; if (x.score >= PASS_SCORE) g.pass++; if (x.score >= GRAY_SCORE) g.lcd++; bySurface.set(x.surface, g); }
      const grayPanels = [...bySurface].filter(([, g]) => g.n >= SURFACE_MIN_SAMPLES && g.lcd / g.n < SURFACE_MIN_SHARE);
      const ok = s.length >= MIN_SAMPLES && share >= PASS_SHARE && grayPanels.length === 0;
      if (!ok) failedTabs++;
      console.log((ok ? 'ok   ' : 'FAIL ') + theme + '/' + bd + '/' + tab + ': sampled ' + s.length + ', passing ' + (share * 100).toFixed(0) + '%');
      const kinds = [...SURFACES, 'other'].map((k) => {
        const gs = [...bySurface].filter(([key]) => key.split('#')[0] === k).map(([, g]) => g);
        const n = gs.reduce((a, g) => a + g.n, 0), p = gs.reduce((a, g) => a + g.pass, 0);
        return gs.length ? k + ' ' + gs.length + 'x/' + n + ' ' + (p / n * 100).toFixed(0) + '%' : (k === 'other' ? null : k + ' no samples');
      }).filter(Boolean);
      console.log('       surfaces: ' + kinds.join(' | '));
      if (s.length < MIN_SAMPLES) console.log('       too few samples (' + s.length + ' < ' + MIN_SAMPLES + ')');
      grayPanels.forEach(([key, g]) => console.log('       gray panel ' + key + ': ' + g.lcd + '/' + g.n + ' above ' + GRAY_SCORE));
      if (!ok || share < 1) s.filter((x) => x.score < PASS_SCORE).sort((a, b) => a.score - b.score).slice(0, 3).forEach((x) => console.log('       worst ' + x.score.toFixed(1) + '  "' + x.text + '"  ' + x.path));
    }
    if (errors.length) console.log('  page errors: ' + errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failedTabs ? failedTabs + ' of ' + total + ' tab/combos below ' + PASS_SHARE * 100 + '%' : 'all ' + total + ' tab/combos passed');
  process.exit(failedTabs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
