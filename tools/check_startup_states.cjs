// Startup states check in headless Edge. While the local service has not answered yet (it took over 15 s after launch),
// the Dashboard must say that it is starting, not claim that the queue is empty, the service is broken or the version is v7.0.
// Once the service answers there is real data and no starting line; when it never answers, the red banner shows after the grace period.
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_startup_states.cjs <harness-dir>
// Fixture: ?service=slow (fetch of /api/state rejects for 5 s) and ?service=down&grace=2000 (never answers, grace period 2 s), see tools/ui_fixture.js.
// Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check_startup_states.cjs <harness-dir>'); process.exit(2); }
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const STARTING = { ru: 'Запускаем службу Sentinel…', en: 'Starting the Sentinel service…' };
const UNAVAILABLE = { ru: 'Локальный сервис Sentinel недоступен', en: 'The local Sentinel service is unavailable' };
// What the Dashboard said before the service had answered, and none of it was true
const FALSE_TEXTS = ['Очередь кампаний пуста', 'Очередь пуста: добавьте игры', 'Нет подходящих кампаний для ручного переключения'];

// Runs in the page: everything the checks look at
function probe() {
  const body = document.body.innerText;
  const status = [...document.querySelectorAll('[role="status"]')].map((e) => e.innerText.trim());
  const shelf = [...document.querySelectorAll('.tab-btn')].find((b) => /Полка|Shelf/i.test(b.innerText));
  const chip = document.querySelector('#headerThemeBadge');
  return {
    body, status,
    shelfText: shelf ? shelf.innerText.replace(/\s+/g, ' ').trim() : null,
    chipText: chip ? chip.innerText.trim() : null,
    queueCount: document.querySelector('#queueCount') ? document.querySelector('#queueCount').innerText.trim() : null,
  };
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let failed = 0;
  const report = (tag, problems) => {
    if (problems.length) { failed++; console.log('FAIL ' + tag + '\n  ' + problems.join('\n  ')); } else console.log('ok   ' + tag);
  };
  const open = async (query) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/index.html?' + query);
    await page.waitForSelector('.field-chassis', { timeout: 15000 });
    return { ctx, page, errors };
  };

  for (const lang of ['ru', 'en']) {
    // The service answers after about 6 s: at 1 s it is starting
    const { ctx, page, errors } = await open('lang=' + lang + '&scale=100&service=slow');
    await page.waitForTimeout(1000);
    let res = await page.evaluate(probe);
    let problems = [];
    if (!res.status.includes(STARTING[lang])) problems.push('no neutral status line "' + STARTING[lang] + '", role=status texts: ' + JSON.stringify(res.status));
    if (res.body.includes(UNAVAILABLE[lang])) problems.push('the red "unavailable" banner shows while starting');
    if (lang === 'ru') {
      for (const text of FALSE_TEXTS) if (res.body.includes(text)) problems.push('false text while starting: ' + text);
      if (/\b0 ИГР/i.test(res.body)) problems.push('a fake zero count "0 ИГР" while starting');
      if (/Полка Игр\s*0/.test(res.shelfText || '')) problems.push('a fake zero on the shelf tab: ' + res.shelfText);
    }
    if (/v?7\.0/i.test(res.chipText || '')) problems.push('version chip shows the v7.0 fallback: ' + res.chipText);
    if (/\b0 (IDLE|GAMES?)\b/i.test(res.body) || /(^|\s)Shelf\s*0\b/.test(res.shelfText || '')) problems.push('a fake zero count in English: ' + res.shelfText);
    report('starting (' + lang + ', t=1s)', problems);

    // It answers: real data, no starting line
    await page.waitForFunction(() => /\d+\s+(игра|игры|игр|game|games)\b/i.test((document.querySelector('#queueCount') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    res = await page.evaluate(probe);
    problems = [];
    if (res.status.includes(STARTING[lang])) problems.push('the starting line is still there after the service answered');
    if (res.body.includes(UNAVAILABLE[lang])) problems.push('the red banner shows after the service answered');
    if (!/^\d+\s+\S+/.test(res.queueCount || '')) problems.push('no real queue count after recovery: ' + res.queueCount);
    if (!/\d/.test(res.shelfText || '')) problems.push('no shelf count after recovery: ' + res.shelfText);
    if (!/3\.5\.10/.test(res.chipText || '')) problems.push('version chip should show the service version: ' + res.chipText);
    if (errors.length) problems.push('page errors: ' + errors.join(' | '));
    report('recovered (' + lang + ')', problems);
    await ctx.close();
  }

  {
    // The service never answers and the grace period is 2 s: first starting, then the red banner
    const { ctx, page, errors } = await open('lang=ru&scale=100&service=down&grace=2000');
    await page.waitForTimeout(500);
    let res = await page.evaluate(probe);
    let problems = [];
    if (!res.status.includes(STARTING.ru)) problems.push('no starting line at t=0.5s (grace 2 s): ' + JSON.stringify(res.status));
    if (res.body.includes(UNAVAILABLE.ru)) problems.push('the red banner shows inside the grace period');
    report('down, inside the grace period', problems);

    await page.waitForFunction((t) => document.body.innerText.includes(t), UNAVAILABLE.ru, { timeout: 10000 }).catch(() => {});
    res = await page.evaluate(probe);
    problems = [];
    if (!res.body.includes(UNAVAILABLE.ru)) problems.push('no red banner after the grace period');
    if (res.status.includes(STARTING.ru)) problems.push('the starting line stays after the grace period');
    if (errors.length) problems.push('page errors: ' + errors.join(' | '));
    report('down, after the grace period', problems);
    await ctx.close();
  }

  {
    // A service that answers at once never shows the starting line for longer than the first request
    const { ctx, page } = await open('lang=ru&scale=100');
    await page.waitForTimeout(1000);
    const res = await page.evaluate(probe);
    const problems = [];
    if (res.status.includes(STARTING.ru)) problems.push('starting line with a service that answers');
    if (res.body.includes(UNAVAILABLE.ru)) problems.push('red banner with a service that answers');
    if (!/^\d+\s+\S+/.test(res.queueCount || '')) problems.push('no queue count: ' + res.queueCount);
    report('connected from the first answer', problems);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
