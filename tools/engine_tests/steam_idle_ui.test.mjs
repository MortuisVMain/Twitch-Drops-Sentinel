// Pure functions of the Steam IDLE tab. Run: node --test tools/engine_tests/steam_idle_ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { parseExcludeList } = await import(pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'excludeParse.mjs')).href);

const ok = (text, ids) => assert.deepEqual(parseExcludeList(text), { ids, bad: null }, JSON.stringify(text));
const bad = (text, token) => assert.deepEqual(parseExcludeList(text), { ids: [], bad: token }, JSON.stringify(text));

test('whitespace separates AppIDs, it never glues them', () => {
  ok('730 440', [730, 440]);
  ok('730\t440\n570', [730, 440, 570]);
});
test('commas, semicolons and stray separators', () => {
  ok('730,440', [730, 440]);
  ok(' 730 , 440 ,', [730, 440]);
  ok('730;440', [730, 440]);
  ok('730,,440', [730, 440]);
});
test('empty input is an empty list', () => {
  ok('', []);
  ok('  ,  ', []);
});
test('duplicates collapse', () => {
  ok('730,440,730 440', [730, 440]);
});
test('a bad token is reported and nothing is applied', () => {
  bad('7x0', '7x0');
  bad('730, 7x0, 440', '7x0');
  bad('0', '0');
  bad('007', '007');
  bad('-5', '-5');
  bad('4294967296', '4294967296');
  bad('99999999999', '99999999999');
});
test('the largest AppID is accepted', () => {
  ok('4294967295', [4294967295]);
});

const { durParts, signedOutHint } = await import(pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'steamIdleLogic.mjs')).href);

test('an age rounds its minutes down, a countdown rounds them up', () => {
  assert.deepEqual(durParts(116), { min: 1 });
  assert.deepEqual(durParts(116, true), { min: 2 });
  assert.deepEqual(durParts(120, true), { min: 2 });
  assert.deepEqual(durParts(59.4, true), { sec: 59 });
  assert.deepEqual(durParts(3590, true), { h: 1, rest: 0 });
  assert.deepEqual(durParts(3725), { h: 1, rest: 2 });
  assert.deepEqual(durParts(-5), { sec: 0 });
  assert.equal(durParts(NaN), null);
});

test('a refusal for the site session names the button that is on screen', () => {
  assert.equal(signedOutHint('unknown'), 'check');
  assert.equal(signedOutHint('checking'), 'check');
  assert.equal(signedOutHint('signed_out'), 'login');
  assert.equal(signedOutHint('account_mismatch'), 'login');
});

// The text tables are TypeScript that imports the translation layer: bundle them once and call the real functions.
const { build } = await import('esbuild');
const { mkdtempSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
globalThis.localStorage = { getItem: () => 'ru', setItem() {} };
const bundleDir = mkdtempSync(path.join(tmpdir(), 'sidle_text_'));
const bundleOf = async (entry) => {
  const outfile = path.join(bundleDir, `${path.basename(entry, '.ts')}.mjs`);
  await build({ entryPoints: [path.join(ROOT, 'src', 'components', 'steamIdle', entry)], bundle: true, format: 'esm', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
};
const { finishedNoteText } = await bundleOf('achievementsText.ts');
const { refusalText } = await bundleOf('steamIdleText.ts');

test('the anti-cheat notes and refusal have their own sentences', () => {
  assert.equal(finishedNoteText('protected_app'), 'Игра с античитом: достижения в ней не выдаются.');
  assert.equal(finishedNoteText('protection_unknown'), 'Не удалось проверить игру на античит, она пропущена.');
  assert.equal(refusalText('protected_app'), 'Игра с античитом: достижения в ней не выдаются.');
});
