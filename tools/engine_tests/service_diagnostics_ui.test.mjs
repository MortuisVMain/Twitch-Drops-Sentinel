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
