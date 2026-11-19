// Digit hotkeys follow the visible tabs, in header order. Run: node --test tools/engine_tests/tab_hotkeys.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { visibleTabs } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'tabVisibility.mjs')).href);
const { tabDigit, tabForDigit, digitRange, titleWithDigit, digitHotkeyAllowed } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'utils', 'tabHotkeys.mjs')).href
);

const digitsOf = (settings) => Object.fromEntries(visibleTabs(settings).map((tab) => [tab, tabDigit(visibleTabs(settings), tab)]));

test('every tab on: digits 1..6 in header order, Steam IDLE gets 4', () => {
  assert.deepEqual(digitsOf({}), { dashboard: '1', shelf: '2', giveaways: '3', steamidle: '4', dimmer: '5', settings: '6' });
});

test('a tab turned off leaves no hole: the digits close up', () => {
  assert.deepEqual(digitsOf({ disabled_tabs: ['shelf'] }),
    { dashboard: '1', giveaways: '2', steamidle: '3', dimmer: '4', settings: '5' });
  assert.deepEqual(digitsOf({ giveaways_enabled: false }),
    { dashboard: '1', shelf: '2', steamidle: '3', dimmer: '4', settings: '5' });
  assert.deepEqual(digitsOf({ disabled_tabs: ['steamidle', 'dimmer'] }),
    { dashboard: '1', shelf: '2', giveaways: '3', settings: '4' });
});

test('only the always-on tabs: Settings is 2', () => {
  const settings = { disabled_tabs: ['shelf', 'steamidle', 'dimmer'], giveaways_enabled: false };
  assert.deepEqual(digitsOf(settings), { dashboard: '1', settings: '2' });
});

test('a digit opens the tab that carries it, and nothing past the last visible tab', () => {
  const tabs = visibleTabs({ disabled_tabs: ['shelf'] });
  assert.equal(tabForDigit(tabs, '1'), 'dashboard');
  assert.equal(tabForDigit(tabs, '2'), 'giveaways');
  assert.equal(tabForDigit(tabs, '3'), 'steamidle');
  assert.equal(tabForDigit(tabs, '4'), 'dimmer');
  assert.equal(tabForDigit(tabs, '5'), 'settings');
  assert.equal(tabForDigit(tabs, '6'), null, 'five tabs: 6 does nothing');
});

test('keys that are not a single digit 1-9 open nothing', () => {
  const tabs = visibleTabs({});
  for (const key of ['0', '10', 'a', '', ' ', 'Enter', undefined, null, 5]) assert.equal(tabForDigit(tabs, key), null, String(key));
});

test('a tab that is not shown has no digit', () => {
  assert.equal(tabDigit(visibleTabs({ disabled_tabs: ['dimmer'] }), 'dimmer'), null);
  assert.equal(tabDigit(visibleTabs({}), 'nonsense'), null);
});

test('only nine tabs can carry a digit', () => {
  const many = Array.from({ length: 11 }, (_, i) => `t${i}`);
  assert.equal(tabDigit(many, 't8'), '9');
  assert.equal(tabDigit(many, 't9'), null);
  assert.equal(tabForDigit(many, '9'), 't8');
});

test('the help range names the digits in use', () => {
  assert.equal(digitRange(visibleTabs({})), '1–6');
  assert.equal(digitRange(visibleTabs({ disabled_tabs: ['shelf', 'dimmer'] })), '1–4');
  assert.equal(digitRange(visibleTabs({ disabled_tabs: ['shelf', 'steamidle', 'dimmer'], giveaways_enabled: false })), '1–2');
  assert.equal(digitRange(['dashboard']), '1');
  assert.equal(digitRange([]), '');
});

test('a tooltip shows its digit in brackets, none when the tab has no digit', () => {
  assert.equal(titleWithDigit('Steam IDLE', '4'), 'Steam IDLE (4)');
  assert.equal(titleWithDigit('Steam IDLE', null), 'Steam IDLE');
});

test('a digit is a tab hotkey only without Ctrl/Alt/Meta and outside text-entry controls', () => {
  const body = { tagName: 'BODY', isContentEditable: false };
  assert.equal(digitHotkeyAllowed({ target: body }), true);
  assert.equal(digitHotkeyAllowed({ target: { tagName: 'BUTTON' } }), true);
  assert.equal(digitHotkeyAllowed({ target: null }), true, 'no target (window level)');
  for (const mod of ['ctrlKey', 'altKey', 'metaKey']) assert.equal(digitHotkeyAllowed({ [mod]: true, target: body }), false, mod);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(digitHotkeyAllowed({ target: { tagName } }), false, tagName);
  assert.equal(digitHotkeyAllowed({ target: { tagName: 'DIV', isContentEditable: true } }), false, 'contenteditable');
});
