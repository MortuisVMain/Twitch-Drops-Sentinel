// Dashboard console check in headless Edge (same engine as WebView2): the journal reaches back about 5 hours, new lines arrive through
// GET /api/logs?after=<seq> only when something is new, a service restart starts the journal over, the filters and the copy button use all of it,
// and the "Файл логов" button exists only inside the WebView2 host and posts one message without a path. Also prints the rendering cost of a full journal.
// The fixture (tools/ui_fixture.js ?logs=&host=1) plays the service and the host: 3000 lines over ~4h57m, /api/state carries the last 50 only.
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_console_logs.cjs <harness-dir> [screenshot-dir]
// Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
const shotDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (!dir) { console.error('usage: node tools/check_console_logs.cjs <harness-dir> [screenshot-dir]'); process.exit(2); }
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const TOTAL = 3000;
// the fixture's level of line n (tools/ui_fixture.js journalLine)
const levelOf = (n) => (n % 40 === 0 ? 'CLAIM' : n % 10 === 0 ? 'WATCH' : n % 25 === 0 ? 'CORE' : 'INFO');
const expectedCount = (level) => { let c = 0; for (let n = 1; n <= TOTAL; n++) if (levelOf(n) === level) c++; return c; };

const viewportText = () => document.getElementById('mainConsoleViewport')?.textContent || '';
const rowLevels = () => [...document.querySelectorAll('#mainConsoleViewport > div')].map((r) => (r.children[1]?.textContent || '').replace(/[\[\]]/g, '')).filter(Boolean);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let failed = 0;
  const report = (tag, problems, note) => {
    if (problems.length) { failed++; console.log('FAIL ' + tag + '\n  ' + problems.join('\n  ')); } else console.log('ok   ' + tag + (note ? ' (' + note + ')' : ''));
  };
  const open = async (w, h, query) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/index.html?lang=ru&scale=100&' + query);
    await page.waitForSelector('#mainConsoleViewport', { timeout: 15000 });
    return { ctx, page, errors };
  };

  for (const [w, h] of [[1600, 900], [1180, 750]]) {
    const { ctx, page, errors } = await open(w, h, 'logs=5h&host=1');
    const problems = [];
    const tag = 'console ' + w + 'x' + h;
    try {
      // 1. the oldest line of the journal (not in the 50-line tail of /api/state) is on screen after the history is fetched
      await page.waitForFunction(() => /самая старая строка/.test(document.getElementById('mainConsoleViewport')?.textContent || ''), null, { timeout: 10000 });
      const rows = (await page.evaluate(rowLevels)).length;
      if (rows < TOTAL - 10) problems.push('only ' + rows + ' rows in the console, the journal has ' + TOTAL);
      // the newest line is in view (auto-scroll to the bottom)
      const atEnd = await page.evaluate(() => { const v = document.getElementById('mainConsoleViewport'); return v.scrollHeight - v.scrollTop - v.clientHeight <= 45; });
      if (!atEnd) problems.push('the console is not scrolled to the newest line');
      // 2. one history request, then nothing while the cursor does not move (two polls of /api/state pass)
      await page.waitForTimeout(7000);
      const requests = await page.evaluate(() => window.__logRequests);
      if (requests.length !== 1 || !/after=0\b/.test(requests[0])) problems.push('expected one /api/logs?after=0 request, got ' + JSON.stringify(requests));

      // 3. copy has all of it
      await page.getByRole('button', { name: /Копировать/ }).click();
      const copied = await page.evaluate(() => window.__copied);
      const copiedLines = copied ? copied.split('\n') : [];
      if (copiedLines.length !== TOTAL) problems.push('copied ' + copiedLines.length + ' lines, expected ' + TOTAL);
      if (!/самая старая строка/.test(copiedLines[0] || '') || !/^\[\d\d:\d\d:\d\d\] \[INFO\] /.test(copiedLines[0] || '')) problems.push('first copied line is ' + JSON.stringify(copiedLines[0]));
      if (!/самая новая строка/.test(copiedLines[TOTAL - 1] || '')) problems.push('last copied line is ' + JSON.stringify(copiedLines[TOTAL - 1]));

      // 4. filters reach back past the tail
      for (const [name, level] of [['Трофеи', 'CLAIM'], ['Стримы', 'WATCH'], ['Ядро', 'CORE']]) {
        await page.locator('.node-chip', { hasText: new RegExp('^' + name + '$') }).click();
        await page.waitForTimeout(150);
        const levels = await page.evaluate(rowLevels);
        const want = expectedCount(level);
        if (levels.length !== want || levels.some((l) => l !== level)) problems.push('filter ' + name + ': ' + levels.length + ' rows (expected ' + want + ' of ' + level + ')');
      }
      await page.locator('.node-chip', { hasText: /^Все$/ }).click();

      // 5. the file button: only a host has it; it posts one message with no path; keyboard works and the focus is visible
      const fileButton = page.getByRole('button', { name: /Файл логов/ });
      if ((await fileButton.count()) !== 1) problems.push('«Файл логов» button count is ' + (await fileButton.count()) + ' with a host');
      else {
        await fileButton.click();
        let messages = await page.evaluate(() => window.__hostMessages.filter((m) => m && m.type === 'OPEN_LOG_FILE'));
        if (messages.length !== 1 || JSON.stringify(messages[0]) !== '{"type":"OPEN_LOG_FILE"}') problems.push('host messages after a click: ' + JSON.stringify(messages));
        let focused = false;
        await page.locator('#mainConsoleViewport').focus();
        for (let i = 0; i < 40 && !focused; i++) { await page.keyboard.press('Shift+Tab'); focused = await fileButton.evaluate((el) => el === document.activeElement); }
        if (!focused) problems.push('«Файл логов» cannot be reached with Tab');
        else {
          const ring = await fileButton.evaluate((el) => { const s = getComputedStyle(el); return { matches: el.matches(':focus-visible'), outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow }; });
          if (!ring.matches || (/^none/.test(ring.outline) && ring.shadow === 'none')) problems.push('no visible focus on «Файл логов»: ' + JSON.stringify(ring));
          await page.keyboard.press('Enter');
          messages = await page.evaluate(() => window.__hostMessages.filter((m) => m && m.type === 'OPEN_LOG_FILE'));
          if (messages.length !== 2) problems.push('Enter on the focused button posted ' + (messages.length - 1) + ' message(s)');
        }
      }

      // 6. new lines: one more request, from the cursor, and only the new lines are added
      await page.evaluate(() => window.__pushLog(3));
      await page.waitForFunction(() => /Новая строка после загрузки/.test(document.getElementById('mainConsoleViewport')?.textContent || ''), null, { timeout: 9000 });
      const after = await page.evaluate(() => window.__logRequests);
      if (after.length !== 2 || !/after=3000\b/.test(after[1]) || !/session=s1\b/.test(after[1])) problems.push('expected a second request after=3000&session=s1, got ' + JSON.stringify(after));
      const rowsAfter = (await page.evaluate(rowLevels)).length;
      if (rowsAfter !== TOTAL + 3) problems.push('rows after 3 new lines: ' + rowsAfter + ' (expected ' + (TOTAL + 3) + ')');
      await page.getByRole('button', { name: /Копировать/ }).click();
      const copied2 = await page.evaluate(() => window.__copied);
      if (!copied2 || copied2.split('\n').length !== TOTAL + 3 || !/самая старая строка/.test(copied2)) problems.push('copy after new lines has ' + (copied2 ? copied2.split('\n').length : 0) + ' lines');

      // 7. a service restart: the old journal is gone, the new one is shown
      await page.evaluate(() => window.__restartLogs());
      await page.waitForFunction(() => /После перезапуска 5/.test(document.getElementById('mainConsoleViewport')?.textContent || ''), null, { timeout: 9000 });
      const text = await page.evaluate(viewportText);
      const rowsRestart = (await page.evaluate(rowLevels)).length;
      if (/самая старая строка/.test(text) || rowsRestart !== 5) problems.push('after a restart the console shows ' + rowsRestart + ' rows and ' + (/самая старая строка/.test(text) ? 'still' : 'no longer') + ' the old journal');
    } catch (e) {
      problems.push('check aborted: ' + e);
    }
    if (errors.length) problems.push('page errors: ' + errors.join(' | '));
    report(tag, problems);
    await ctx.close();
  }

  // Without a host (fixture or browser) there is no file button
  {
    const { ctx, page } = await open(1600, 900, 'logs=5h');
    const count = await page.getByRole('button', { name: /Файл логов/ }).count();
    report('no host, no «Файл логов»', count === 0 ? [] : ['button count is ' + count]);
    await ctx.close();
  }

  // Rendering cost of a journal at the service's hard cap: switching a filter and a quiet poll with nothing new
  {
    const { ctx, page } = await open(1600, 900, 'logs=5000&host=1');
    const problems = [];
    let timings = [], longTasks = [], requests = 0;
    try {
    await page.waitForFunction(() => /самая новая строка/.test(document.getElementById('mainConsoleViewport')?.textContent || '') && document.querySelectorAll('#mainConsoleViewport > div').length > 4900, null, { timeout: 20000 });
    await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); });
    for (const name of ['Трофеи', 'Все', 'Стримы', 'Все']) {
      const ms = await page.evaluate(async (label) => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === label);
        const t0 = performance.now(); b.click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(performance.now() - t0);
      }, name);
      timings.push(ms);
    }
    await page.evaluate(() => { window.__long.length = 0; }); // only what the quiet polls cost
    await page.waitForTimeout(7000); // two quiet polls of /api/state, a new array every time
    longTasks = await page.evaluate(() => window.__long);
    requests = await page.evaluate(() => window.__logRequests.length);
    } catch (e) { problems.push('check aborted: ' + e); }
    const worstSwitch = timings.length ? Math.max(...timings) : 0, worstTask = longTasks.length ? Math.max(...longTasks) : 0;
    if (worstSwitch > 600) problems.push('switching a filter over 5000 lines took ' + worstSwitch + ' ms (budget 600)');
    if (worstTask > 250) problems.push('a quiet poll blocked the page for ' + worstTask + ' ms (budget 250)');
    if (requests !== 1) problems.push('quiet polls made ' + requests + ' /api/logs requests, expected 1');
    report('render cost, 5000 lines', problems, 'filter switches ' + timings.join('/') + ' ms; long tasks while idle: ' + (longTasks.length ? longTasks.join(',') + ' ms' : 'none'));
    await ctx.close();
  }

  // Screenshots of the running console for the report
  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    for (const [w, h, name] of [[2321, 1251, 'console-running-2321.png'], [1180, 750, 'console-running-1180.png']]) {
      const { ctx, page } = await open(w, h, 'logs=5h&host=1&games=40');
      await page.waitForFunction(() => /самая старая строка/.test(document.getElementById('mainConsoleViewport')?.textContent || ''), null, { timeout: 10000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(shotDir, name) });
      const geometry = await page.evaluate(() => { const v = document.getElementById('mainConsoleViewport').getBoundingClientRect(); return { consoleHeight: Math.round(v.height), rows: Math.floor(v.height / 17) }; });
      console.log('shot ' + name + ' (console viewport ' + geometry.consoleHeight + ' px tall, about ' + geometry.rows + ' lines visible)');
      await ctx.close();
    }
  }

  await browser.close();
  server.close();
  console.log(failed ? failed + ' case(s) failed' : 'all cases passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SETUP ERROR: ' + e); process.exit(2); });
