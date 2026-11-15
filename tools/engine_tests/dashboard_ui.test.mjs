// Dashboard layout rules: console default, queue "waiting" group, off-queue ordering and the single primary chip.
// Imports the TS modules directly (Node type stripping; the modules import only types).
// Run: node --test tools/engine_tests/dashboard_ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = file => import(pathToFileURL(path.join(ROOT, 'src', 'utils', file)).href);
const { resolveConsoleCollapsed, parseConsoleFilter } = await load('consoleLog.ts');
const { splitQueueRows, sortOffQueue, primaryChipIndex } = await load('dashboardLayout.ts');

test('console is collapsed by default whether idle or farming', () => {
  assert.equal(resolveConsoleCollapsed(null), true);
  assert.equal(resolveConsoleCollapsed('junk'), true);
});

test('an explicit console choice still wins', () => {
  assert.equal(resolveConsoleCollapsed('0'), false);
  assert.equal(resolveConsoleCollapsed('1'), true);
});

test('a stored console filter is restored, anything else falls back to "all"', () => {
  for (const f of ['ALL', 'WATCH', 'CLAIM', 'CORE']) assert.equal(parseConsoleFilter(f), f);
  for (const bad of [null, undefined, '', 'watch', 'JUNK', '1']) assert.equal(parseConsoleFilter(bad), 'ALL');
});

const row = (name, kind) => ({ name, state: { kind } });

test('"all" moves rows without a campaign into the waiting group, after the live ones', () => {
  const rows = [row('a', 'none'), row('b', 'running'), row('c', 'link'), row('d', 'done'), row('e', 'none')];
  const s = splitQueueRows(rows, 'all');
  assert.deepEqual(s.live.map(r => r.name), ['b', 'c']);
  assert.deepEqual(s.waiting.map(r => r.name), ['a', 'e']);
  assert.deepEqual(s.finished.map(r => r.name), ['d']);
  assert.equal(s.expandWaiting, false);
});

test('waiting group opens by default when every row has no campaign', () => {
  const s = splitQueueRows([row('a', 'none'), row('b', 'none')], 'all');
  assert.equal(s.live.length, 0);
  assert.equal(s.waiting.length, 2);
  assert.equal(s.expandWaiting, true);
});

test('a finished row alongside waiting ones does not force the group open', () => {
  assert.equal(splitQueueRows([row('a', 'none'), row('d', 'done')], 'all').expandWaiting, false);
});

test('the explicit "none" filter lists them plainly, no group', () => {
  const s = splitQueueRows([row('a', 'none')], 'none'); // rows arrive already filtered by queueView
  assert.deepEqual(s.live.map(r => r.name), ['a']);
  assert.equal(s.waiting.length, 0);
  assert.equal(s.expandWaiting, false);
});

test('other filters keep their rows as live', () => {
  const s = splitQueueRows([row('b', 'running'), row('c', 'link')], 'available');
  assert.equal(s.live.length, 2);
  assert.equal(s.waiting.length, 0);
});

test('off-queue: late cards go after every other card, order otherwise kept', () => {
  const cards = [
    { n: 'late-soon', rank: 0, late: true },
    { n: 'ok-soon', rank: 0, late: false },
    { n: 'running', rank: 1, late: false },
    { n: 'late-run', rank: 1, late: true },
    { n: 'rest', rank: 3, late: false },
  ];
  const sorted = sortOffQueue(cards, c => c.rank, c => c.late).map(c => c.n);
  assert.deepEqual(sorted, ['ok-soon', 'running', 'rest', 'late-soon', 'late-run']);
});

test('only the first actionable card gets the primary chip', () => {
  const cards = [
    { late: true, forced: false, finished: false },
    { late: false, forced: true, finished: false },
    { late: false, forced: false, finished: true },
    { late: false, forced: false, finished: false },
    { late: false, forced: false, finished: false },
  ];
  assert.equal(primaryChipIndex(cards), 3);
});

test('no actionable card means no primary chip', () => {
  assert.equal(primaryChipIndex([{ late: true, forced: false, finished: false }]), -1);
  assert.equal(primaryChipIndex([]), -1);
});
