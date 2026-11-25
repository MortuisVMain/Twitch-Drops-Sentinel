// Pure functions behind the background health watch (dot on the menu button, count in the menu, the interval choice). Run: node --test tools/engine_tests/health_watch_ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { healthWatchDot, healthWatchOptions, healthWatchHours, healthWatchEnabled, HEALTH_WATCH_OPTIONS } =
  await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'healthWatch.mjs')).href);

const watch = (over) => ({ enabled: true, hours: 1, problems: 0, lastRun: null, ...over });

test('the dot shows only while the watch is on and something is wrong', () => {
  assert.deepEqual(healthWatchDot(watch({ problems: 2 })), { show: true, count: 2 });
  assert.deepEqual(healthWatchDot(watch({ problems: 0 })), { show: false, count: 0 });
  assert.deepEqual(healthWatchDot(watch({ enabled: false, problems: 5 })), { show: false, count: 0 }, 'off means no dot and no count');
});

test('a missing or broken state shows nothing', () => {
  for (const bad of [undefined, null, 'x', 5, {}, watch({ problems: -1 }), watch({ problems: 'many' }), watch({ problems: NaN }), watch({ enabled: 'yes', problems: 3 })]) {
    assert.deepEqual(healthWatchDot(bad), { show: false, count: 0 }, JSON.stringify(bad));
  }
});

test('a fractional or huge count is made a whole, sane number', () => {
  assert.deepEqual(healthWatchDot(watch({ problems: 2.7 })), { show: true, count: 2 });
  assert.deepEqual(healthWatchDot(watch({ problems: 1e9 })), { show: true, count: 99 });
});

test('exactly four intervals, in this order, with their Russian labels', () => {
  assert.deepEqual(HEALTH_WATCH_OPTIONS.map((o) => [o.value, o.label]), [[1, 'раз в 1 час'], [4, 'раз в 4 часа'], [12, 'раз в 12 часов'], [24, 'раз в сутки']]);
  assert.equal(healthWatchOptions().length, 4);
});

test('the interval and the switch fall back to the defaults', () => {
  assert.equal(healthWatchHours({ health_watch_hours: 12 }), 12);
  for (const bad of [undefined, 0, 2, 48, '4', 4.5, null, true]) assert.equal(healthWatchHours({ health_watch_hours: bad }), 1, String(bad));
  assert.equal(healthWatchHours(undefined), 1);
  assert.equal(healthWatchEnabled({}), true);
  assert.equal(healthWatchEnabled({ health_watch_enabled: false }), false);
  assert.equal(healthWatchEnabled({ health_watch_enabled: 'no' }), true);
});
