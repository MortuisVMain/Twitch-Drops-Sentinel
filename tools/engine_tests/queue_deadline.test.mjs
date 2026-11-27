// Queue games that close before the queue reaches them. Run: node --test tools/engine_tests/queue_deadline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { queueDeadlineRisks } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'queueDeadline.mjs')).href);

const NOW = Date.parse('2026-11-21T12:00:00Z');
const row = (key, hoursLeft, watchMinutes) => ({ key, endAtIso: new Date(NOW + hoursLeft * 3600000).toISOString(), watchMinutes });

test('enough time for everyone: nothing flagged', () => {
  assert.equal(queueDeadlineRisks([row('A', 10, 60), row('B', 10, 120)], NOW).size, 0);
});

test('a lower game is late because of the games above it, and would make it alone', () => {
  const risks = queueDeadlineRisks([row('A', 48, 300), row('B', 6, 120)], NOW);
  assert.deepEqual([...risks.keys()], ['B']);
  assert.equal(risks.get('B').aheadMinutes, 300);
  assert.equal(risks.get('B').alone, false);
});

test('too late even if started now', () => {
  assert.equal(queueDeadlineRisks([row('A', 1, 120)], NOW).get('A').alone, true);
});

test('unknown, finished or closed rows add nothing and are never flagged', () => {
  const rows = [row('A', 1, null), row('Z', 1, 0), { key: 'N', endAtIso: null, watchMinutes: 30 }, row('C', -1, 300), row('B', 2, 60)];
  // N has no end date but still takes 30 min of the queue; closed C holds nobody up: 30 + 60 min fit into 2 h
  assert.equal(queueDeadlineRisks(rows, NOW).size, 0);
});
