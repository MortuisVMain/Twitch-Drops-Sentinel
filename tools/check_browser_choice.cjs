// Browser choice in the giveaways readiness window, in headless Edge against the offline fixture (no service, no store).
// The control must be a labelled native select, reachable and changeable from the keyboard, with a click area like the app's buttons;
// it posts the chosen value, lists only the browsers the service offers, shows the note for a browser that has no sign-ins,
// names a chosen browser that is gone, and shows the error when the service refuses.
// Usage: node tools/build_ui_harness.mjs <dir>
//        NODE_PATH=<node_modules with playwright> node tools/check_browser_choice.cjs <harness-dir>
// Exit 1 on any failure, 2 on a broken setup.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check_browser_choice.cjs <harness-dir>'); process.exit(2); }
const root = path.resolve(dir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const NOTE = 'В этом браузере нужно войти в магазины заново: вход хранится отдельно для каждого браузера.';

async function openWindow(browser, base, query, viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/index.html?lang=ru&scale=100&' + query);
  await page.waitForSelector('.field-chassis', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator('.tab-btn', { hasText: 'Раздачи' }).first().click();
  await page.getByRole('button', { name: /Проверить готовность/ }).first().click();
  await page.waitForSelector('#readiness-browser', { timeout: 15000 });
  return { ctx, page, errors };
}

const optionTexts = (page) => page.$$eval('#readiness-browser option', (opts) => opts.map((o) => o.textContent.trim()));
const selectedValue = (page) => page.$eval('#readiness-browser', (s) => s.value);
const posts = (page) => page.evaluate(() => window.__browserPosts);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const problems = [];
  const check = (cond, message) => { if (!cond) problems.push(message); };

  // 1. The control: labelled, native, current choice, full list, click area
  {
    const { ctx, page, errors } = await openWindow(browser, base, 'browser=auto');
    const info = await page.$eval('#readiness-browser', (s) => {
      const r = s.getBoundingClientRect();
      const label = document.querySelector('label[for="readiness-browser"]');
      return { tag: s.tagName, height: r.height, width: r.width, label: label && label.textContent.trim(), disabled: s.disabled };
    });
    check(info.tag === 'SELECT', 'the control is not a native select: ' + info.tag);
    check(info.label === 'Браузер для входа и сбора', 'no visible label tied to the control: ' + info.label);
    check(info.height >= 31, 'click area is smaller than the app buttons (31 px): ' + info.height);
    check(!info.disabled, 'the control starts disabled');
    check((await selectedValue(page)) === 'auto', 'the current choice is not shown');
    check(JSON.stringify(await optionTexts(page)) === JSON.stringify(['Автовыбор', 'Google Chrome', 'Microsoft Edge', 'Встроенный Chromium']), 'options: ' + JSON.stringify(await optionTexts(page)));
    check((await page.getByText(NOTE).count()) === 0, 'the sign-in note shows for auto');
    check(errors.length === 0, 'page errors: ' + errors.join(' | '));

    // 2. Keyboard: reach the control with Tab from the dialog, change it with the arrow keys, nothing needs the mouse
    await page.locator('#readiness-browser').focus();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    check(focused === 'readiness-browser', 'the control does not take focus');
    await page.keyboard.press('ArrowDown'); // auto -> chrome
    await page.waitForTimeout(400);
    check(JSON.stringify(await posts(page)) === JSON.stringify([{ browser: 'chrome' }]), 'keyboard change posted: ' + JSON.stringify(await posts(page)));
    check((await selectedValue(page)) === 'chrome', 'the new choice is not shown after the refresh: ' + (await selectedValue(page)));
    check((await page.getByText(NOTE).count()) === 0, 'chrome shares the old profile: no note');
    await page.locator('#readiness-browser').selectOption('msedge');
    await page.waitForTimeout(500);
    const all = await posts(page);
    check(all.length === 2 && all[1].browser === 'msedge', 'posted values: ' + JSON.stringify(all));
    check((await selectedValue(page)) === 'msedge', 'edge is not shown as chosen');
    check((await page.getByText(NOTE).count()) === 1, 'the note for a browser without sign-ins is missing');
    const described = await page.$eval('#readiness-browser', (s) => s.getAttribute('aria-describedby'));
    check(described === 'readiness-browser-note', 'the note is not tied to the control: ' + described);
    check((await page.locator('[role="alert"]').count()) === 0, 'an alert shows after a successful change');
    await ctx.close();
  }

  // 3. Only the offered browsers are listed
  {
    const { ctx, page } = await openWindow(browser, base, 'browser=auto&browsers=edge-only');
    const texts = await optionTexts(page);
    check(JSON.stringify(texts) === JSON.stringify(['Автовыбор', 'Microsoft Edge', 'Встроенный Chromium (скачается при первом запуске)']), 'offered list: ' + JSON.stringify(texts));
    await ctx.close();
  }

  // 4. A chosen browser that is gone stays visible, is a problem item and says why
  {
    const { ctx, page } = await openWindow(browser, base, 'browser=chrome&browserstate=missing');
    const texts = await optionTexts(page);
    check(texts.includes('Google Chrome (не найден)'), 'the missing choice is not listed as missing: ' + JSON.stringify(texts));
    check((await selectedValue(page)) === 'chrome', 'the missing choice is not the selected one');
    check((await page.getByText('Выбранный Google Chrome не найден').count()) === 1, 'the readiness row does not name the missing browser');
    check((await page.getByText(/Осталось шагов/).count()) === 1, 'the missing browser is not counted as a step left');
    await ctx.close();
  }

  // 5. The service refuses (a run is going): the error is visible in the window and the old choice stays
  {
    const { ctx, page } = await openWindow(browser, base, 'browser=auto&browserpost=refuse');
    await page.locator('#readiness-browser').selectOption('msedge');
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const alertText = await page.locator('[role="alert"]').first().innerText();
    check(/нельзя сменить/.test(alertText), 'the refusal is not readable: ' + alertText);
    check((await selectedValue(page)) === 'auto', 'the choice moved although the service refused: ' + (await selectedValue(page)));
    await ctx.close();
  }

  // 6. The window still fits a narrow screen with the control in it
  {
    const { ctx, page } = await openWindow(browser, base, 'browser=chromium', { width: 360, height: 700 });
    const overflow = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      const sel = document.getElementById('readiness-browser').getBoundingClientRect();
      const d = dlg.getBoundingClientRect();
      return { right: sel.right, dialogRight: d.right, left: sel.left, dialogLeft: d.left };
    });
    check(overflow.right <= overflow.dialogRight + 1 && overflow.left >= overflow.dialogLeft - 1, 'the control overflows the window on a narrow screen: ' + JSON.stringify(overflow));
    await ctx.close();
  }

  // 7. English interface: label, options and note are translated
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(base + '/index.html?lang=en&scale=100&browser=msedge');
    await page.waitForSelector('.field-chassis', { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.locator('.tab-btn', { hasText: /Giveaways/ }).first().click();
    await page.getByRole('button', { name: /readiness/i }).first().click();
    await page.waitForSelector('#readiness-browser', { timeout: 15000 });
    await page.waitForTimeout(400);
    const body = await page.locator('[role="dialog"]').innerText();
    check(/Browser for sign-in and claiming/.test(body), 'the label is not translated');
    check(/sign in to the stores again/i.test(body), 'the note is not translated');
    check(!/[А-Яа-яЁё]/.test(await page.$eval('#readiness-browser', (s) => s.innerText)), 'options are not translated: ' + (await optionTexts(page)));
    await ctx.close();
  }

  await browser.close();
  server.close();
  if (problems.length) { console.log('FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log('ok   browser choice: control, keyboard, post, list, note, missing browser, refusal, narrow screen, English');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
