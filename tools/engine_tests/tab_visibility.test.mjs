// Which header tabs are shown for the saved settings. Run: node --test tools/engine_tests/tab_visibility.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { visibleTabs, TAB_ORDER } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'tabVisibility.mjs')).href);

const ALL = ['dashboard', 'shelf', 'giveaways', 'steamidle', 'dimmer', 'settings'];

test('the header order is dashboard, shelf, giveaways, steam idle, dimmer, settings', () => {
  assert.deepEqual([...TAB_ORDER], ALL);
});

test('nothing turned off shows every tab', () => {
  assert.deepEqual(visibleTabs({}), ALL);
  assert.deepEqual(visibleTabs({ disabled_tabs: [], giveaways_enabled: true }), ALL);
  assert.deepEqual(visibleTabs(undefined), ALL, 'before the first answer of the service');
  assert.deepEqual(visibleTabs(null), ALL);
});

for (const id of ['shelf', 'steamidle', 'dimmer']) {
  test(`${id} off hides only that tab`, () => {
    assert.deepEqual(visibleTabs({ disabled_tabs: [id] }), ALL.filter((t) => t !== id));
  });
}

test('giveaways is off exactly when giveaways_enabled is false', () => {
  assert.deepEqual(visibleTabs({ giveaways_enabled: false }), ALL.filter((t) => t !== 'giveaways'));
  assert.ok(visibleTabs({ giveaways_enabled: undefined }).includes('giveaways'));
  assert.ok(visibleTabs({ giveaways_enabled: true }).includes('giveaways'));
});

test('everything off leaves dashboard and settings', () => {
  assert.deepEqual(visibleTabs({ disabled_tabs: ['shelf', 'steamidle', 'dimmer'], giveaways_enabled: false }), ['dashboard', 'settings']);
});

test('unknown ids, dashboard, settings and bad values are ignored', () => {
  assert.deepEqual(visibleTabs({ disabled_tabs: ['dashboard', 'settings', 'nope', 7, null] }), ALL);
  assert.deepEqual(visibleTabs({ disabled_tabs: 'shelf' }), ALL);
  assert.deepEqual(visibleTabs({ disabled_tabs: ['giveaways'] }), ALL, 'giveaways is not driven by disabled_tabs');
});

test('the order does not depend on the order of disabled_tabs', () => {
  assert.deepEqual(visibleTabs({ disabled_tabs: ['dimmer', 'shelf'] }), ['dashboard', 'giveaways', 'steamidle', 'settings']);
});
