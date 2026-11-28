// Pure functions of the "other copies" block in Settings. Run: node --test tools/engine_tests/startup_copies_ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { normalizeState, sortFindings, removableCount, importCandidates, needsOwnDataConfirm, errorMessage, createSequencer, removalMessage, importWarning } =
  await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'startupCopies.mjs')).href);

const f = (over) => ({ id: 'aaaaaaaaaaaa', kind: 'run_value', name: 'X', target: 'C:\\a\\TwitchDropsSentinel.exe', copyDir: 'C:\\a', version: '3.7.0', dirExists: true, removable: true, closable: false, ...over });

test('anything that is not a state answer is refused, a thin answer is filled in', () => {
  assert.equal(normalizeState(null), null);
  assert.equal(normalizeState({}), null);
  assert.equal(normalizeState({ status: 'error' }), null);
  const s = normalizeState({ status: 'ok', findings: [f()] });
  assert.deepEqual([s.copies, s.autostartOwner, s.installerHint.show, s.ownData.signedIn], [[], null, false, false]);
});

test('findings that are not objects are dropped, not rendered', () => {
  const s = normalizeState({ status: 'ok', findings: [f(), null, 5, 'x', {}] });
  assert.equal(s.findings.length, 1);
});

test('running copies come first, then by folder, dead folders last within one folder', () => {
  const rows = sortFindings([
    f({ id: '1', copyDir: 'C:\\b', kind: 'run_value' }),
    f({ id: '2', copyDir: 'C:\\a', kind: 'scheduler_task' }),
    f({ id: '3', copyDir: 'C:\\b', kind: 'process', removable: false, closable: true }),
    f({ id: '4', copyDir: 'C:\\a', kind: 'run_value' }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['3', '4', '2', '1']);
});

test('only removable rows count for "remove all"; processes and HKLM never do', () => {
  assert.equal(removableCount([f(), f({ kind: 'process', removable: false, closable: true }), f({ kind: 'hklm_run', removable: false })]), 1);
  assert.equal(removableCount([]), 0);
});

test('only importable copies are offered, once per folder', () => {
  const copies = [{ dir: 'C:\\a', importable: true }, { dir: 'C:\\b', importable: false }, { dir: 'C:\\a', importable: true }];
  assert.deepEqual(importCandidates(copies).map((c) => c.dir), ['C:\\a']);
});

test('the replace-confirmation is needed for own settings or an own sign-in', () => {
  assert.equal(needsOwnDataConfirm({ nonDefaultConfig: false, signedIn: false }), false);
  assert.equal(needsOwnDataConfirm({ nonDefaultConfig: true, signedIn: false }), true);
  assert.equal(needsOwnDataConfirm({ nonDefaultConfig: false, signedIn: true }), true);
  assert.equal(needsOwnDataConfirm(undefined), false);
});

test('an error shows the service message, else the status', () => {
  assert.equal(errorMessage({ message: 'запись не найдена' }, 404), 'запись не найдена');
  assert.equal(errorMessage({}, 500), 'HTTP 500');
  assert.equal(errorMessage(null, 0), 'HTTP 0');
});

test('copies that are not valid are dropped and the rest is cleaned like the findings', () => {
  const s = normalizeState({ status: 'ok', findings: [], copies: [null, 5, 'x', {}, { dir: '' }, { dir: 'C:\a', version: 7, running: 1, exists: 'yes', importable: true, extra: 1 }] });
  assert.deepEqual(s.copies, [{ dir: 'C:\a', version: null, running: true, exists: true, importable: true, dataTime: null }]);
});

test('only the newest request may change the screen', () => {
  const seq = createSequencer();
  const slowRescan = seq.next();
  assert.equal(seq.isLatest(slowRescan), true);
  const action = seq.next();
  assert.equal(seq.isLatest(slowRescan), false, 'a rescan started before the action is stale');
  assert.equal(seq.isLatest(action), true);
});

test('remove-all says how many went and flags the ones that did not', () => {
  assert.deepEqual(removalMessage({ results: [{ ok: true }, { ok: true }] }), { text: 'Записи убраны, оригиналы сохранены', error: false });
  const partial = removalMessage({ results: [{ ok: true }, { ok: false }, { ok: false }] });
  assert.equal(partial.error, true);
  assert.match(partial.text, /^Убрано 1 из 3;/);
  assert.equal(removalMessage(undefined).error, false);
});

test('the import warns when this copy holds newer data than the copy it would take it from', () => {
  const day = 86400;
  const fmt = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  const newer = importWarning({ dataTime: 20 * day }, { dataTime: 10 * day }, fmt);
  assert.equal(newer.newer, true);
  assert.match(newer.text, /новее/);
  assert.match(newer.text, /1970-01-21/);
  assert.match(newer.text, /1970-01-11/);
  const older = importWarning({ dataTime: 10 * day }, { dataTime: 20 * day }, fmt);
  assert.equal(older.newer, false);
  assert.equal(importWarning({ dataTime: null }, { dataTime: 5 }, fmt).newer, false, 'unknown times never claim newer');
  const s = normalizeState({ status: 'ok', findings: [], ownData: { dataTime: 123 }, copies: [{ dir: 'C:\\b', dataTime: 'x' }] });
  assert.equal(s.ownData.dataTime, 123);
  assert.equal(s.copies[0].dataTime, null);
});
