// Pure functions behind the health center: the header button, the sections and their keys, the hotkey, the last-check time, the history list.
// Run: node --test tools/engine_tests/health_center.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hc = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'healthCenter.mjs')).href);

const watch = (over) => ({ enabled: true, hours: 1, problems: 0, fails: 0, lastRun: null, lastManual: null, ...over });

test('no state, watch off or nothing wrong: a neutral button without a badge', () => {
  for (const state of [undefined, null, 'x', watch({ enabled: false, problems: 4, fails: 2 }), watch(), watch({ problems: -1 }), watch({ problems: 'many' })]) {
    const view = hc.healthButtonView(state);
    assert.equal(view.tone, 'neutral', JSON.stringify(state));
    assert.equal(view.badge, null);
  }
});

test('warnings only: amber, no badge', () => {
  const view = hc.healthButtonView(watch({ problems: 2, fails: 0 }));
  assert.equal(view.tone, 'amber');
  assert.equal(view.badge, null);
});

test('failures: rose with the failure count, capped at 99', () => {
  assert.deepEqual([hc.healthButtonView(watch({ problems: 3, fails: 2 })).tone, hc.healthButtonView(watch({ problems: 3, fails: 2 })).badge], ['rose', 2]);
  assert.equal(hc.healthButtonView(watch({ problems: 500, fails: 500 })).badge, 99);
  assert.equal(hc.healthButtonView(watch({ problems: 2, fails: 2.9 })).badge, 2, 'a fraction is made whole');
});

test('aria-label and title describe the state', () => {
  const ok = hc.healthButtonView(watch());
  const warn = hc.healthButtonView(watch({ problems: 1 }));
  const fail = hc.healthButtonView(watch({ problems: 2, fails: 2 }));
  assert.match(ok.label, /Центр проверки/);
  assert.match(warn.label, /предупрежд/i);
  assert.match(fail.label, /проблем/i);
  assert.match(fail.label, /2/);
  assert.ok(fail.title.includes('Ctrl+Shift+H'), 'the title names the hotkey');
  assert.notEqual(ok.label, fail.label);
});

test('four sections in a fixed order', () => {
  assert.deepEqual(hc.SECTIONS.map((s) => s.id), ['summary', 'checks', 'developer', 'maintenance']);
  assert.deepEqual(hc.SECTIONS.map((s) => s.label), ['Сводка', 'Проверки', 'Для разработчика', 'Обслуживание']);
});

test('arrow keys move between sections, wrap, Home and End jump, other keys do nothing', () => {
  assert.equal(hc.nextSection('summary', 'ArrowRight'), 'checks');
  assert.equal(hc.nextSection('maintenance', 'ArrowRight'), 'summary');
  assert.equal(hc.nextSection('summary', 'ArrowLeft'), 'maintenance');
  assert.equal(hc.nextSection('checks', 'ArrowDown'), 'developer');
  assert.equal(hc.nextSection('checks', 'ArrowUp'), 'summary');
  assert.equal(hc.nextSection('checks', 'Home'), 'summary');
  assert.equal(hc.nextSection('checks', 'End'), 'maintenance');
  assert.equal(hc.nextSection('checks', 'Enter'), null);
  assert.equal(hc.nextSection('nope', 'ArrowRight'), 'checks', 'an unknown section counts as the first');
});

test('the hotkey is Ctrl+Shift+H on any layout, and only that', () => {
  const key = (over) => ({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: 'KeyH', key: 'Р', ...over });
  assert.equal(hc.isHealthHotkey(key()), true, 'a Russian layout sends another character but the same code');
  assert.equal(hc.isHealthHotkey(key({ ctrlKey: false, metaKey: true })), true);
  assert.equal(hc.isHealthHotkey(key({ shiftKey: false })), false, 'Ctrl+H is the browser history');
  assert.equal(hc.isHealthHotkey(key({ altKey: true })), false);
  assert.equal(hc.isHealthHotkey(key({ ctrlKey: false })), false);
  assert.equal(hc.isHealthHotkey(key({ code: 'KeyK' })), false);
  assert.equal(hc.isHealthHotkey(null), false);
});

test('the last check is the newer of the background and the manual one', () => {
  assert.equal(hc.lastCheckTime(watch({ lastRun: 100, lastManual: 200 })), 200);
  assert.equal(hc.lastCheckTime(watch({ lastRun: 300, lastManual: 200 })), 300);
  assert.equal(hc.lastCheckTime(watch({ lastRun: null, lastManual: 200 })), 200);
  assert.equal(hc.lastCheckTime(watch()), null);
  assert.equal(hc.lastCheckTime(undefined), null);
  assert.equal(hc.lastCheckTime(watch({ lastRun: 'x', lastManual: NaN })), null);
});

test('times are shown in the local zone', () => {
  const shown = hc.formatLocalTime(Date.UTC(2026, 10, 25, 12, 5, 0) / 1000, 'ru-RU', 'UTC');
  assert.match(shown, /12:05/);
  assert.equal(hc.formatLocalTime(null, 'ru-RU'), '');
});

test('history: only well-formed events, newest first as given, at most 20, texts are strings', () => {
  const ev = (i, over) => ({ time: 1000 + i, checkId: `c${i}`, area: 'steam', title: `T${i}`, status: 'fail', event: 'found', ...over });
  const parsed = hc.parseHistory({ events: [ev(1), { checkId: 'x' }, null, ev(2, { event: 'bogus' }), ev(3, { event: 'fixed', status: 'ok' }), ev(4, { title: 5 })] });
  assert.deepEqual(parsed.map((e) => e.checkId), ['c1', 'c3']);
  assert.equal(parsed[1].event, 'fixed');
  assert.equal(hc.parseHistory({ events: Array.from({ length: 30 }, (_, i) => ev(i)) }).length, 20);
  assert.deepEqual(hc.parseHistory(undefined), []);
  assert.deepEqual(hc.parseHistory({ events: 'x' }), []);
});

test('export results: the host answer made safe', () => {
  assert.deepEqual(hc.parseExportResult({ type: 'HEALTH_EXPORT_RESULT', kind: 'logs', ok: true, message: 'Saved' }), { kind: 'logs', ok: true, message: 'Saved' });
  assert.equal(hc.parseExportResult({ type: 'HEALTH_EXPORT_RESULT', kind: 'rm -rf', ok: true, message: 'x' }), null, 'only known kinds');
  assert.equal(hc.parseExportResult({ type: 'OTHER' }), null);
  assert.equal(hc.parseExportResult({ type: 'HEALTH_EXPORT_RESULT', kind: 'report', ok: 'yes', message: 3 }).ok, false);
});

test('the host message that opens the center', () => {
  assert.equal(hc.isOpenCenterMessage({ type: 'OPEN_HEALTH_CENTER' }), true);
  assert.equal(hc.isOpenCenterMessage({ type: 'OTHER' }), false);
  assert.equal(hc.isOpenCenterMessage(null), false);
});

test('the history fetch of the panel carries the service token through the global fetch wrapper', async () => {
  const fs = await import('node:fs');
  const panel = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ServiceDiagnosticsPanel.tsx'), 'utf8');
  const url = /HISTORY_URL = '([^']+)'/.exec(panel)[1];
  const { installServiceAuth, TOKEN_HEADER } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'serviceAuth.mjs')).href);
  const seen = [];
  const win = { __SENTINEL_TOKEN: 'tok-123', fetch: async (input, init) => { seen.push(init); return {}; } };
  installServiceAuth(win);
  await win.fetch(url);
  assert.equal(new Headers(seen[0].headers).get(TOKEN_HEADER), 'tok-123', 'the page uses plain fetch(HISTORY_URL): the wrapper adds the header');
  assert.match(panel, /await fetch\(HISTORY_URL\)/);
});
