// Pure helpers behind the perf fixes: HTTP poll fallback, local drop countdown, backdrop frame loop.
// Run: node --test tools/engine_tests/perf_helpers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (name) => import(pathToFileURL(path.join(ROOT, 'src', 'utils', name)).href);
const { shouldPollHttp } = await load('liveSync.mjs');
const { tickDrop, reconcileDrop, isCountdownRunning } = await load('dropClock.mjs');
const { needsFrameLoop, canDrawFrame } = await load('backdropLoop.mjs');

const drop = (over = {}) => ({
  id: 'd1', required_minutes: 10, current_minutes: 0, progress_percent: 0, remaining_seconds: 600,
  is_claimed: false, can_claim: false, ...over,
});

test('HTTP polling runs only while the socket is not open', () => {
  assert.equal(shouldPollHttp(false, 0), true);
  assert.equal(shouldPollHttp(true, 0), false);
  assert.equal(shouldPollHttp(true, 5000), false);
});

test('an open but silent socket (> 12 s without a message) falls back to polling', () => {
  assert.equal(shouldPollHttp(true, 12000), false);
  assert.equal(shouldPollHttp(true, 12001), true);
  assert.equal(shouldPollHttp(false, 20000), true);
});

test('tickDrop matches the old per-second ticker', () => {
  const d = tickDrop(drop(), 60);
  assert.equal(d.remaining_seconds, 540);
  assert.equal(d.current_minutes, 1);
  assert.equal(d.progress_percent, 10);
  assert.equal(d.can_claim, false);
});

test('tickDrop clamps at zero and sets can_claim', () => {
  const d = tickDrop(drop({ remaining_seconds: 5 }), 30);
  assert.equal(d.remaining_seconds, 0);
  assert.equal(d.can_claim, true);
  assert.equal(d.progress_percent, 100);
});

test('tickDrop returns the same object when nothing ticks', () => {
  const d = drop();
  assert.equal(tickDrop(d, 0), d);
  assert.equal(tickDrop(null, 5), null);
  const claimed = drop({ is_claimed: true });
  assert.equal(tickDrop(claimed, 5), claimed);
  const done = drop({ remaining_seconds: 0 });
  assert.equal(tickDrop(done, 5), done);
});

test('isCountdownRunning: only an unclaimed, unpaused drop with time left', () => {
  assert.equal(isCountdownRunning(drop(), false), true);
  assert.equal(isCountdownRunning(drop(), true), false);
  assert.equal(isCountdownRunning(drop({ is_claimed: true }), false), false);
  assert.equal(isCountdownRunning(drop({ remaining_seconds: 0 }), false), false);
  assert.equal(isCountdownRunning(null, false), false);
});

test('reconcileDrop keeps the shown remaining when the server is within 6 s on the same minute', () => {
  const shown = drop({ remaining_seconds: 597 });
  const incoming = drop({ remaining_seconds: 600 });
  assert.equal(reconcileDrop(shown, incoming).remaining_seconds, 597);
});

test('reconcileDrop trusts the server on a new drop, a new minute or a big gap', () => {
  const shown = drop({ remaining_seconds: 597 });
  assert.equal(reconcileDrop(shown, drop({ id: 'd2', remaining_seconds: 600 })).remaining_seconds, 600);
  assert.equal(reconcileDrop(shown, drop({ current_minutes: 1, remaining_seconds: 590 })).remaining_seconds, 590);
  assert.equal(reconcileDrop(shown, drop({ remaining_seconds: 700 })).remaining_seconds, 700);
  assert.equal(reconcileDrop(null, drop()).remaining_seconds, 600);
  assert.equal(reconcileDrop(shown, null), null);
});

test('backdrop loop runs only for the 3D backdrop with a relief mode', () => {
  assert.equal(needsFrameLoop('3d', 'hex-magma'), true);
  assert.equal(needsFrameLoop('3d', 'none'), false);
  assert.equal(needsFrameLoop('smooth', 'hex-magma'), false);
  assert.equal(needsFrameLoop('2d-dots', 'hex-magma'), false);
});

test('a frame is drawn only when visible, tab shown and opacity is non-zero', () => {
  assert.equal(canDrawFrame(true, false, 0.85), true);
  assert.equal(canDrawFrame(false, false, 0.85), false);
  assert.equal(canDrawFrame(true, true, 0.85), false);
  assert.equal(canDrawFrame(true, false, 0), false);
  assert.equal(canDrawFrame(true, false, 0.01), false);
});
