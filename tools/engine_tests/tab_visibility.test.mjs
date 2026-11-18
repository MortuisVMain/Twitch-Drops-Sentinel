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

const { dimmerModuleMessage } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'tabVisibility.mjs')).href);

test('the host hears nothing before the service has answered', () => {
  assert.equal(dimmerModuleMessage({ disabled_tabs: ['dimmer'] }, false, undefined), null);
  assert.equal(dimmerModuleMessage({}, false, undefined), null);
});

test('the first answer is always sent, on or off', () => {
  assert.deepEqual(dimmerModuleMessage({ disabled_tabs: [] }, true, undefined), { type: 'DIMMER_MODULE', enabled: true });
  assert.deepEqual(dimmerModuleMessage({ disabled_tabs: ['dimmer'] }, true, undefined), { type: 'DIMMER_MODULE', enabled: false });
});

test('only a change is sent after that', () => {
  assert.equal(dimmerModuleMessage({ disabled_tabs: ['shelf'] }, true, true), null, 'another tab does not matter');
  assert.deepEqual(dimmerModuleMessage({ disabled_tabs: ['dimmer'] }, true, true), { type: 'DIMMER_MODULE', enabled: false });
  assert.equal(dimmerModuleMessage({ disabled_tabs: ['dimmer', 'shelf'] }, true, false), null);
  assert.deepEqual(dimmerModuleMessage({ disabled_tabs: [] }, true, false), { type: 'DIMMER_MODULE', enabled: true });
});

const { tabSwitches, tabTogglePatch, needsOffConfirmation } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'tabVisibility.mjs')).href);

test('the switches list shelf, giveaways, steam idle, dimmer with their state', () => {
  assert.deepEqual(tabSwitches({}), [
    { id: 'shelf', on: true }, { id: 'giveaways', on: true }, { id: 'steamidle', on: true }, { id: 'dimmer', on: true },
  ]);
  assert.deepEqual(
    tabSwitches({ disabled_tabs: ['steamidle'], giveaways_enabled: false }).map((s) => s.on),
    [true, false, false, true],
  );
});

test('the giveaways switch is the giveaways_enabled setting itself', () => {
  assert.deepEqual(tabTogglePatch({ giveaways_enabled: true }, 'giveaways'), { giveaways_enabled: false });
  assert.deepEqual(tabTogglePatch({ giveaways_enabled: false }, 'giveaways'), { giveaways_enabled: true });
  assert.deepEqual(tabTogglePatch({}, 'giveaways'), { giveaways_enabled: false });
  assert.equal('disabled_tabs' in tabTogglePatch({ disabled_tabs: ['dimmer'] }, 'giveaways'), false);
});

test('turning an optional tab off adds it to disabled_tabs in the stored order, on removes it', () => {
  assert.deepEqual(tabTogglePatch({}, 'dimmer'), { disabled_tabs: ['dimmer'] });
  assert.deepEqual(tabTogglePatch({ disabled_tabs: ['dimmer'] }, 'shelf'), { disabled_tabs: ['shelf', 'dimmer'] });
  assert.deepEqual(tabTogglePatch({ disabled_tabs: ['shelf', 'dimmer'] }, 'dimmer'), { disabled_tabs: ['shelf'] });
  assert.deepEqual(tabTogglePatch({ disabled_tabs: ['dimmer', 'junk', 7] }, 'steamidle'), { disabled_tabs: ['steamidle', 'dimmer'] });
});

test('an unknown tab id changes nothing', () => {
  assert.deepEqual(tabTogglePatch({ disabled_tabs: ['shelf'] }, 'settings'), {});
});

test('only turning Steam IDLE off asks, unless it is known to be idle', () => {
  assert.equal(needsOffConfirmation('steamidle', true, true), true);
  assert.equal(needsOffConfirmation('steamidle', true, false), false);
  assert.equal(needsOffConfirmation('steamidle', true, null), true, 'a failed check still asks');
  assert.equal(needsOffConfirmation('steamidle', true, undefined), true);
  assert.equal(needsOffConfirmation('steamidle', false, true), false, 'turning on never asks');
  for (const id of ['shelf', 'giveaways', 'dimmer']) assert.equal(needsOffConfirmation(id, true, true), false);
});

const { tabSetPatch, snapshotKeys, rollbackSettings } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'tabVisibility.mjs')).href);

test('tabSetPatch sets the wanted state against the settings it is given, not a flip', () => {
  assert.deepEqual(tabSetPatch({ disabled_tabs: ['shelf'] }, 'steamidle', false), { disabled_tabs: ['shelf', 'steamidle'] });
  assert.deepEqual(tabSetPatch({ disabled_tabs: ['shelf', 'steamidle'] }, 'steamidle', false), { disabled_tabs: ['shelf', 'steamidle'] }, 'already off stays off');
  assert.deepEqual(tabSetPatch({ disabled_tabs: ['shelf', 'steamidle'] }, 'steamidle', true), { disabled_tabs: ['shelf'] });
  assert.deepEqual(tabSetPatch({}, 'giveaways', false), { giveaways_enabled: false });
  assert.deepEqual(tabSetPatch({ giveaways_enabled: false }, 'giveaways', false), { giveaways_enabled: false });
  assert.deepEqual(tabSetPatch({}, 'settings', false), {});
});

test('a patch built from the latest settings keeps a tab toggled during a slow check', () => {
  const atClick = { disabled_tabs: [] };
  const latest = { disabled_tabs: ['dimmer'] }; // the user turned the dimmer off while the Steam IDLE check ran
  assert.deepEqual(tabSetPatch(latest, 'steamidle', false), { disabled_tabs: ['steamidle', 'dimmer'] });
  assert.deepEqual(tabSetPatch(atClick, 'steamidle', false), { disabled_tabs: ['steamidle'] }, 'the stale snapshot would lose the dimmer');
});

test('snapshotKeys remembers the current value of exactly the changed keys', () => {
  const s = { disabled_tabs: ['shelf'], giveaways_enabled: true, language: 'ru' };
  assert.deepEqual(snapshotKeys(s, { disabled_tabs: ['shelf', 'dimmer'] }), { disabled_tabs: ['shelf'] });
  assert.deepEqual(snapshotKeys(s, { a_new_key: 1 }), { a_new_key: undefined });
});

test('rollbackSettings restores only the changed keys that still hold the failed value', () => {
  const prev = { disabled_tabs: [], giveaways_enabled: true };
  const changes = { disabled_tabs: ['dimmer'] };
  const failed = { disabled_tabs: ['dimmer'], giveaways_enabled: false, language: 'en' };
  assert.deepEqual(rollbackSettings(failed, prev, changes), { disabled_tabs: [], giveaways_enabled: false, language: 'en' });
});

test('rollbackSettings leaves a key alone when something newer (the service) already changed it', () => {
  const prev = { disabled_tabs: [] };
  const changes = { disabled_tabs: ['dimmer'] };
  const newer = { disabled_tabs: ['shelf'] };
  assert.deepEqual(rollbackSettings(newer, prev, changes), { disabled_tabs: ['shelf'] });
});

test('rollbackSettings removes a key that did not exist before', () => {
  const out = rollbackSettings({ extra: 1, keep: 2 }, { extra: undefined }, { extra: 1 });
  assert.equal('extra' in out, false);
  assert.equal(out.keep, 2);
});
