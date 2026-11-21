// Popup windows follow the interface theme (headless Edge, falls back to bundled Chromium).
// Opens Help and the Ctrl+K palette under several themes and checks that the window background is the theme's --bg-chassis-base
// and its title/input text is the theme's --text-primary (they used to be hard-coded to the Apple Luna dark palette).
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_dialog_themes.cjs <harness-dir>
// Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check_dialog_themes.cjs <harness-dir>'); process.exit(2); }
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const THEMES = ['light', 'paper', 'titanium', 'apple-luna', 'midnight'];
const DIALOGS = [
  { name: 'Help', open: (page) => page.click('.help-btn'), text: '#help-title' },
  { name: 'Ctrl+K', open: (page) => page.keyboard.press('Control+k'), text: 'input' },
];

// Runs in the page: resolve a custom property to rgb() through a probe element, compare with the open dialog.
function probe(textSel) {
  const resolve = (prop, v) => {
    const el = document.createElement('div');
    el.style[prop] = v;
    document.querySelector('.field-chassis').appendChild(el);
    const out = getComputedStyle(el)[prop];
    el.remove();
    return out;
  };
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!dlg) return { problems: ['no open dialog'] };
  const problems = [];
  const bg = getComputedStyle(dlg).backgroundColor, wantBg = resolve('backgroundColor', 'var(--bg-chassis-base)');
  if (bg !== wantBg) problems.push(`background ${bg}, theme wants ${wantBg}`);
  const t = dlg.querySelector(textSel);
  if (!t) problems.push(`no ${textSel}`);
  else {
    const c = getComputedStyle(t).color, wantC = resolve('color', 'var(--text-primary)');
    if (c !== wantC) problems.push(`${textSel} color ${c}, theme wants ${wantC}`);
  }
  return { problems };
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { console.error('playwright not found (set NODE_PATH)'); process.exit(2); }
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true }));
  let failed = 0;
  try {
    for (const theme of THEMES) {
      for (const d of DIALOGS) {
        const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
        await page.goto(`${base}/index.html?theme=${theme}`);
        await page.waitForSelector('.field-chassis', { timeout: 15000 });
        await page.waitForTimeout(500);
        await d.open(page);
        await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300); // zoom-in animation
        const { problems } = await page.evaluate(probe, d.text);
        console.log(`${problems.length ? 'FAIL' : 'ok  '} ${theme.padEnd(10)} ${d.name}${problems.length ? ': ' + problems.join('; ') : ''}`);
        failed += problems.length ? 1 : 0;
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? `${failed} dialog/theme combination(s) ignore the theme` : 'all dialogs follow the theme');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
