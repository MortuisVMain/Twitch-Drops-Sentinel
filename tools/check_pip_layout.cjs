// Mini-window (PiP) layout check in headless Edge (same engine as WebView2).
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_pip_layout.cjs <dir> [--size WxH] [--shots <png-dir>]
// Default size is read from desktop/MainForm.cs (PipWidthDip / PipHeightDip) so the test cannot drift from the host.
// Matrix: lang ru,en x text scale 90,100,130 x pip state long,short,idle. Exit 1 on any failure.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const sizeArg = flag('--size');
const shotsDir = flag('--shots');
const dir = args[0];
if (!dir) { console.error('usage: node tools/check_pip_layout.cjs <harness-dir> [--size WxH] [--shots <dir>]'); process.exit(2); }

function hostSize() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'MainForm.cs'), 'utf8');
  const w = /PipWidthDip\s*=\s*(\d+)/.exec(src), h = /PipHeightDip\s*=\s*(\d+)/.exec(src);
  if (!w || !h) { console.error('PipWidthDip / PipHeightDip not found in desktop/MainForm.cs; pass --size WxH'); process.exit(2); }
  return { w: +w[1], h: +h[1] };
}
const size = sizeArg ? { w: +sizeArg.split('x')[0], h: +sizeArg.split('x')[1] } : hostSize();

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

// Runs in the page. Returns { problems: string[], rects: {} }.
function measure(minHit) {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const problems = [], rects = {};
  const inside = (name, r, box) => { if (!r) problems.push(name + ' missing'); else if (r.l < box.l - 0.5 || r.t < box.t - 0.5 || r.r > box.r + 0.5 || r.b > box.b + 0.5) problems.push(name + ' outside ' + box.name); };
  const view = { l: 0, t: 0, r: vw, b: vh, name: 'viewport ' + vw + 'x' + vh };

  const btns = [...document.querySelectorAll('.pip-action-btn')];
  if (btns.length !== 4) problems.push('expected 4 .pip-action-btn, found ' + btns.length);
  btns.forEach((b, i) => {
    const r = R(b); rects['btn' + i] = r;
    inside('btn' + i, r, view);
    if (r.h < minHit - 0.01 || r.w < minHit - 0.01) problems.push('btn' + i + ' ' + r.w + 'x' + r.h + ' < ' + minHit);
    const hit = document.elementFromPoint((r.l + r.r) / 2, (r.t + r.b) / 2);
    if (!hit || !b.contains(hit)) problems.push('btn' + i + ' centre hits ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'));
  });

  const hud = document.querySelector('.pip-dedicated-hud');
  const hr = R(hud); rects.hud = hr;
  if (!hr) problems.push('.pip-dedicated-hud missing');
  else {
    const pad = parseFloat(getComputedStyle(document.getElementById('chassis') || hud.parentElement).paddingBottom) || 0;
    if (hr.b + pad > vh + 0.5) problems.push('hud bottom ' + hr.b + ' + chassis padding ' + pad + ' > ' + vh);
    const hbox = { l: hr.l, t: hr.t, r: hr.r, b: hr.b, name: 'hud' };
    const info = document.querySelector('.pip-top-row > :last-child');
    const chipRow = info && info.children[0];
    const items = { chip: chipRow && chipRow.children[0], channel: chipRow && chipRow.children[1], reward: info && info.children[1] };
    const got = {};
    for (const k in items) { got[k] = R(items[k]); rects[k] = got[k]; inside(k, got[k], hbox); }
    const names = Object.keys(got);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = got[names[i]], b = got[names[j]];
      if (a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) problems.push(names[i] + ' overlaps ' + names[j]);
    }
  }

  const pip = document.getElementById('pipToggleBtn');
  const pr = R(pip); rects.pipToggleBtn = pr;
  if (!pip || !pr || pr.w === 0 || getComputedStyle(pip).visibility === 'hidden') problems.push('#pipToggleBtn not visible');
  else inside('#pipToggleBtn', pr, view);

  if (typeof window.checkOverflow !== 'function') problems.push('window.checkOverflow missing (harness not built?)');
  else window.checkOverflow().forEach((v) => problems.push('overflow ' + v.kind + ' ' + v.el + ' ' + v.detail));
  return { problems, rects };
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  console.log('PiP size ' + size.w + 'x' + size.h + (sizeArg ? ' (--size)' : ' (desktop/MainForm.cs)'));
  let failed = 0;
  for (const lang of ['ru', 'en']) for (const scale of [90, 100, 130]) for (const pip of ['long', 'short', 'idle']) {
    const tag = lang + '/' + scale + '/' + pip;
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
      await page.goto(base + '/index.html?lang=' + lang + '&scale=' + scale + '&pip=' + pip);
      await page.waitForSelector('.field-chassis', { timeout: 10000 });
      if (!(await interReady(page))) { console.error(FONT_MSG); await browser.close(); server.close(); process.exit(2); }
      await page.waitForTimeout(500);
      await page.keyboard.press('Control+m');
      await page.waitForSelector('.field-chassis.pip-mode', { timeout: 5000 });
      await page.waitForTimeout(600);
      const res = await page.evaluate(measure, 48);
      if (errors.length) res.problems.push('page errors: ' + errors.join(' | '));
      if (shotsDir && pip === 'long' && lang === 'ru' && (scale === 100 || scale === 130)) await page.screenshot({ path: path.join(shotsDir, 'pip-' + lang + '-' + scale + '-' + pip + '.png') });
      if (res.problems.length) {
        failed++;
        console.log('FAIL ' + tag + '\n  ' + res.problems.join('\n  ') + '\n  rects ' + JSON.stringify(res.rects));
      } else console.log('ok   ' + tag);
    } catch (e) {
      failed++;
      console.log('FAIL ' + tag + ' ' + e.message);
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failed ? failed + ' of 18 combos failed' : 'all 18 combos passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
