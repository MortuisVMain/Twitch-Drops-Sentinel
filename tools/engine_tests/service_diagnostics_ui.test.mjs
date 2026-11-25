// Pure functions of the "service unavailable" check. Run: node --test tools/engine_tests/service_diagnostics_ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { statusView, parseDiagnosticsMessage, overallStatus, hostAvailable, groupChecks, countProblems, AREA_ORDER } =
  await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'serviceDiagnostics.mjs')).href);

const c = (over) => ({ id: 'api', status: 'ok', title: 'T', detail: 'D', advice: '', ...over });

test('each status has its own icon and tone, an unknown one is a failure', () => {
  assert.deepEqual(statusView('ok'), { icon: 'check', tone: 'ok' });
  assert.deepEqual(statusView('warn'), { icon: 'alert', tone: 'warn' });
  assert.deepEqual(statusView('fail'), { icon: 'cross', tone: 'fail' });
  assert.deepEqual(statusView('???'), { icon: 'cross', tone: 'fail' });
  assert.deepEqual(statusView(undefined), { icon: 'cross', tone: 'fail' });
});

test('only a DIAGNOSTICS_RESULT message is read', () => {
  assert.equal(parseDiagnosticsMessage(null), null);
  assert.equal(parseDiagnosticsMessage('x'), null);
  assert.equal(parseDiagnosticsMessage({ type: 'CLOSE_ACTION' }), null);
  const r = parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [c()], report: 'R' });
  assert.deepEqual([r.checks.length, r.report, r.error], [1, 'R', null]);
});

test('a thin or broken message is filled in, rows that are not checks are dropped', () => {
  const r = parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [c(), null, 5, {}, { id: 3 }] });
  assert.equal(r.checks.length, 1);
  assert.equal(r.report, '');
  assert.equal(parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT' }).checks.length, 0);
  assert.equal(parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', error: 'boom' }).error, 'boom');
});

test('status falls back to the ok flag, then to failure', () => {
  assert.equal(parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [{ id: 'a', ok: true }] }).checks[0].status, 'ok');
  assert.equal(parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [{ id: 'a' }] }).checks[0].status, 'fail');
});

test('only the close_other action with a real pid survives', () => {
  const [a, b, d] = parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [
    c({ action: 'close_other', pid: 42 }), c({ id: 'b', action: 'rm -rf', pid: 7 }), c({ id: 'd', action: 'close_other', pid: -1 }),
  ] }).checks;
  assert.deepEqual([a.action, a.pid], ['close_other', 42]);
  assert.deepEqual([b.action, b.pid], [null, 7]);
  assert.deepEqual([d.action, d.pid], ['close_other', null]);
});

test('the worst status wins', () => {
  assert.equal(overallStatus([c(), c({ status: 'warn' })]), 'warn');
  assert.equal(overallStatus([c({ status: 'warn' }), c({ status: 'fail' })]), 'fail');
  assert.equal(overallStatus([]), 'ok');
});

test('the host exists only with chrome.webview.postMessage', () => {
  assert.equal(hostAvailable(undefined), false);
  assert.equal(hostAvailable({}), false);
  assert.equal(hostAvailable({ chrome: { webview: {} } }), false);
  assert.equal(hostAvailable({ chrome: { webview: { postMessage() {} } } }), true);
});

test('every check carries an area, a missing or unknown one is the service area', () => {
  const r = parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [c({ area: 'twitch' }), c({ id: 'b' }), c({ id: 'd', area: 'mars' })] });
  assert.deepEqual(r.checks.map((x) => x.area), ['twitch', 'service', 'service']);
});

test('rows are grouped by area in a fixed order, empty areas are left out', () => {
  assert.deepEqual(AREA_ORDER, ['service', 'twitch', 'steam', 'giveaways', 'network', 'updates', 'settings', 'system']);
  const checks = [c({ id: 'a', area: 'system' }), c({ id: 'b', area: 'twitch' }), c({ id: 'c', area: 'service' }), c({ id: 'd', area: 'twitch' }), c({ id: 'e', area: 'network' })];
  const groups = groupChecks(checks);
  assert.deepEqual(groups.map((g) => g.area), ['service', 'twitch', 'network', 'system']);
  assert.deepEqual(groups[1].checks.map((x) => x.id), ['b', 'd']);
  assert.deepEqual(groupChecks([]), []);
});

test('a row of an area the page does not know is shown under the service group, not lost', () => {
  const groups = groupChecks([c({ id: 'x', area: 'mars' })]);
  assert.deepEqual(groups.map((g) => [g.area, g.checks.length]), [['service', 1]]);
});

test('problems are counted per status', () => {
  assert.deepEqual(countProblems([c(), c({ status: 'warn' }), c({ status: 'warn' }), c({ status: 'fail' })]), { fail: 1, warn: 2 });
  assert.deepEqual(countProblems([]), { fail: 0, warn: 0 });
});

// ---- stage 2: one-click fixes (pure logic of the buttons, the confirm and the notices) ----
const fx = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'serviceDiagnostics.mjs')).href);
const fix = (over) => ({ id: 'cache_clear', label: 'Clear', confirm: null, client: false, uri: null, code: null, ...over });

test('a fix with a confirm text carries it and sends only its id to the host', () => {
  const plan = fx.planFix(fix({ id: 'logs_trim', confirm: 'Old logs will be deleted' }), false);
  assert.deepEqual(plan, { confirm: 'Old logs will be deleted', messages: [{ type: 'HEALTH_FIX', id: 'logs_trim' }], copy: null });
});

test('a harmless fix has no confirm and needs no question', () => {
  assert.equal(fx.planFix(fix(), false).confirm, null);
});

test('nothing is planned while a check or another fix is running', () => {
  assert.equal(fx.planFix(fix(), true), null);
});

test('no fix, no plan', () => {
  assert.equal(fx.planFix(null, false), null);
  assert.equal(fx.planFix(undefined, false), null);
});

test('the Twitch page fix opens the page through the host and copies the code, it never asks the service', () => {
  const plan = fx.planFix(fix({ id: 'twitch_open_code', client: true, uri: 'https://www.twitch.tv/activate', code: 'ABCD-EFGH' }), false);
  assert.deepEqual(plan, { confirm: null, messages: [{ type: 'OPEN_TWITCH_ACTIVATE', uri: 'https://www.twitch.tv/activate' }], copy: 'ABCD-EFGH' });
  const noCode = fx.planFix(fix({ id: 'twitch_open_code', client: true, uri: 'https://www.twitch.tv/activate' }), false);
  assert.equal(noCode.copy, null);
  assert.equal(fx.planFix(fix({ id: 'twitch_open_code', client: true, uri: 'https://www.twitch.tv/activate', code: 'A' }), true), null);
});

test('a page-side flag on any other fix id does nothing: only the known id runs on the page', () => {
  assert.equal(fx.planFix(fix({ id: 'format_c', client: true, uri: 'https://x' }), false), null);
});

test('a fix id that is not a plain name is never sent', () => {
  for (const id of ['', 'A', 'rm -rf', 'a'.repeat(41), '../x', 'x"y', 5, null]) assert.equal(fx.planFix(fix({ id }), false), null, String(id));
});

test('rows carry a clean fix and drop a broken one', () => {
  const r = parseDiagnosticsMessage({ type: 'DIAGNOSTICS_RESULT', checks: [
    c({ id: 'a', fix: { id: 'logs_trim', label: 'Trim', confirm: 'Sure?' } }),
    c({ id: 'b', fix: { id: 'twitch_open_code', label: 'Open', client: true, uri: 'https://www.twitch.tv/activate', code: 'AB-CD' } }),
    c({ id: 'd', fix: { id: 'bad id', label: 'x' } }),
    c({ id: 'e', fix: { id: 'cache_clear' } }),
    c({ id: 'f', fix: 'cache_clear' }),
    c({ id: 'g' }),
  ] });
  const [a, b, d, e, f, g] = r.checks;
  assert.deepEqual(a.fix, { id: 'logs_trim', label: 'Trim', confirm: 'Sure?', client: false, uri: null, code: null });
  assert.deepEqual([b.fix.client, b.fix.uri, b.fix.code], [true, 'https://www.twitch.tv/activate', 'AB-CD']);
  assert.deepEqual([d.fix, e.fix, f.fix, g.fix], [null, null, null, null]);
});

test('only a FIX_RESULT message is read as a fix result', () => {
  assert.equal(fx.parseFixResult(null), null);
  assert.equal(fx.parseFixResult({ type: 'DIAGNOSTICS_RESULT' }), null);
  assert.equal(fx.parseFixResult({ type: 'FIX_RESULT' }), null);
  assert.deepEqual(fx.parseFixResult({ type: 'FIX_RESULT', id: 'cache_clear', ok: true, message: 'Done', restart: false }), { id: 'cache_clear', ok: true, message: 'Done', restart: false });
  assert.deepEqual(fx.parseFixResult({ type: 'FIX_RESULT', id: 'x', ok: 'yes', message: 5, restart: true }), { id: 'x', ok: false, message: '', restart: false });
  assert.equal(fx.parseFixResult({ type: 'FIX_RESULT', id: 'webview_reset', ok: true, message: 'm', restart: true }).restart, true);
});

test('the notice shows on the rows that offer that fix, and on its own when no row does any more', () => {
  const notice = { id: 'cache_clear', ok: true, message: 'Done', restart: false };
  const rows = [c({ id: 'a', fix: fix() }), c({ id: 'b', fix: fix({ id: 'logs_trim' }) }), c({ id: 'd' })];
  assert.deepEqual(rows.map((r) => fx.noticeFor(r, notice)), [true, false, false]);
  assert.equal(fx.noticeOrphan(rows, notice), false);
  assert.equal(fx.noticeOrphan([rows[1], rows[2]], notice), true);
  assert.equal(fx.noticeOrphan(rows, null), false);
  assert.equal(fx.noticeFor(rows[0], null), false);
});

test('the restart is offered only after a successful fix that asks for it', () => {
  assert.equal(fx.restartOffered({ id: 'a', ok: true, message: '', restart: true }), true);
  assert.equal(fx.restartOffered({ id: 'a', ok: true, message: '', restart: false }), false);
  assert.equal(fx.restartOffered({ id: 'a', ok: false, message: '', restart: true }), false);
  assert.equal(fx.restartOffered(null), false);
});

test('buttons are disabled while a check or any fix runs', () => {
  assert.equal(fx.controlsBusy(false, null), false);
  assert.equal(fx.controlsBusy(true, null), true);
  assert.equal(fx.controlsBusy(false, 'cache_clear'), true);
});
