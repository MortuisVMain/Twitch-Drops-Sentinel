// Diagnostic report window check in headless Edge. The report is a long multi-line text with a few very long lines:
// the text box must be tall, wrap long lines (no horizontal scroll), scroll vertically, and keep the copy button in view.
// (A `.tabular { white-space: nowrap }` rule once beat `whitespace-pre-wrap` and squashed the whole report into one 40 px line.)
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_diag_report.cjs <harness-dir> [screenshot.png]
// Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
const shot = process.argv[3];
if (!dir) { console.error('usage: node tools/check_diag_report.cjs <harness-dir> [screenshot.png]'); process.exit(2); }
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Runs in the page: geometry of the open report window.
function probe() {
  const dlg = document.querySelector('[role="dialog"][aria-labelledby="diag-title"]');
  if (!dlg) return { problems: ['report dialog is not open'] };
  const box = dlg.querySelector('.obsidian-well');
  const copy = [...dlg.querySelectorAll('button')].find((b) => /Скопировать/.test(b.textContent || ''));
  const close = dlg.querySelector('button[aria-label="Закрыть"]');
  const problems = [];
  if (!box) return { problems: ['no text box in the report dialog'] };
  const cs = getComputedStyle(box), r = box.getBoundingClientRect(), d = dlg.getBoundingClientRect();
  const lineH = parseFloat(cs.lineHeight) || 16;
  const lines = Math.round(box.scrollHeight / lineH);
  if (!/pre-wrap|pre-line/.test(cs.whiteSpace)) problems.push('white-space is ' + cs.whiteSpace + ', not pre-wrap');
  if (r.height <= 200) problems.push('text box is ' + Math.round(r.height) + ' px tall (expected > 200)');
  if (box.scrollWidth > box.clientWidth + 1) problems.push('horizontal overflow: scrollWidth ' + box.scrollWidth + ' > clientWidth ' + box.clientWidth);
  if (box.scrollHeight <= box.clientHeight) problems.push('the long report does not scroll vertically (' + box.scrollHeight + ' <= ' + box.clientHeight + ')');
  if (!/auto|scroll/.test(cs.overflowY)) problems.push('overflow-y is ' + cs.overflowY);
  if (lines < 100) problems.push('text renders as only ~' + lines + ' lines (expected >= 100: lines are squashed)');
  if (r.height > innerHeight * 0.75) problems.push('text box is taller than 75% of the window (' + Math.round(r.height) + ' of ' + innerHeight + ')');
  if (d.width < 600) problems.push('dialog is only ' + Math.round(d.width) + ' px wide');
  if (d.bottom > innerHeight + 1 || d.top < -1) problems.push('dialog leaves the window (' + Math.round(d.top) + '..' + Math.round(d.bottom) + ' of ' + innerHeight + ')');
  for (const [name, el] of [['copy button', copy], ['close button', close]]) {
    if (!el) { problems.push(name + ' missing'); continue; }
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.bottom > innerHeight || b.top < 0 || b.right > innerWidth) problems.push(name + ' is not fully visible');
  }
  // ClearType: the text surface is opaque, no outer shadow or backdrop filter on the text box and the dialog
  const dcs = getComputedStyle(dlg);
  const bg = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
  if (bg) { const c = bg[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat); if (c.length > 3 && c[3] < 1) problems.push('text box background is translucent: ' + cs.backgroundColor); }
  for (const [name, el, st] of [['text box', box, cs], ['dialog', dlg, dcs], ['overlay', dlg.parentElement, getComputedStyle(dlg.parentElement)]]) {
    if (st.backdropFilter && st.backdropFilter !== 'none') problems.push(name + ' has backdrop-filter ' + st.backdropFilter);
  }
  if (dcs.boxShadow && dcs.boxShadow !== 'none' && !/inset/.test(dcs.boxShadow)) problems.push('dialog has an outer shadow: ' + dcs.boxShadow);
  return { problems, height: Math.round(r.height), lines, dialogWidth: Math.round(d.width) };
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
    await page.waitForTimeout(800);
    await page.locator('.tab-btn', { hasText: 'Настройки' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('button[title="Диагностический отчет"]').first().click();
    await page.waitForSelector('[role="dialog"][aria-labelledby="diag-title"] .obsidian-well', { timeout: 5000 });
    await page.waitForFunction(() => /END OF DIAGNOSTIC REPORT/.test(document.querySelector('[role="dialog"] .obsidian-well')?.textContent || ''), null, { timeout: 5000 });
    await page.waitForTimeout(300);
    const res = await page.evaluate(probe);
    const problems = res.problems.slice();
    // keyboard: Escape closes the window and gives the focus back (useModalFocus)
    if (shot && w === 1600) await page.screenshot({ path: path.resolve(shot) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (await page.locator('[role="dialog"][aria-labelledby="diag-title"]').count()) problems.push('Escape does not close the report');
    if (errors.length) problems.push('page errors: ' + errors.join(' | '));
    const tag = w + 'x' + h;
    if (problems.length) { failed++; console.log('FAIL ' + tag + '\n  ' + problems.join('\n  ')); }
    else console.log('ok   ' + tag + ' (text box ' + res.height + ' px, ~' + res.lines + ' lines, dialog ' + res.dialogWidth + ' px wide)');
    await ctx.close();
  }
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SETUP ERROR: ' + e); process.exit(2); });
