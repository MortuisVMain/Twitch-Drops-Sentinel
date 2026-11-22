// Pure functions of the Steam IDLE tab. Run: node --test tools/engine_tests/steam_idle_ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { refundNote, releaseQuestion, etaText, thresholdHint, parseSuggestion, parseAutoPause } = await import(pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'steamIdleLogic.mjs')).href);
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

const { durParts, signedOutHint, interruptedBanner, steamCover, playedHours, finishedFacts } = await import(pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'steamIdleLogic.mjs')).href);

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

test('the interrupted-run banner shows only for a recorded run while nothing is running', () => {
  const rec = { kind: 'library', startedAt: 1, gamesDone: 4, gamesTotal: 9, unlocked: 31 };
  assert.deepEqual(interruptedBanner(rec, false), { done: 4, total: 9, unlocked: 31, needsConfirm: true });
  assert.deepEqual(interruptedBanner({ ...rec, kind: 'game' }, false), { done: 4, total: 9, unlocked: 31, needsConfirm: false });
  assert.deepEqual(interruptedBanner({ ...rec, kind: 'selected' }, false).needsConfirm, false);
  assert.equal(interruptedBanner(rec, true), null);
  assert.equal(interruptedBanner(null, false), null);
  assert.equal(interruptedBanner(undefined, false), null);
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
const { refusalText, farmStatsSegments } = await bundleOf('steamIdleText.ts');

test('the anti-cheat notes and refusal have their own sentences', () => {
  assert.equal(finishedNoteText('protected_app'), 'Игра с античитом: достижения в ней не выдаются.');
  assert.equal(finishedNoteText('protection_unknown'), 'Не удалось проверить игру на античит, она пропущена.');
  assert.equal(refusalText('protected_app'), 'Игра с античитом: достижения в ней не выдаются.');
});

test('a resume on another account is refused with its own sentence', () => {
  assert.equal(refusalText('account_changed'), 'Сейчас в Steam другой аккаунт. Продолжить эту выдачу нельзя.');
});

test('the refund hold note counts the days left, at least one, whole days', () => {
  assert.equal(refundNote(5), 'Куплена недавно: фарм отнимет право на возврат. Осталось дней: 5.');
  assert.equal(refundNote(0), 'Куплена недавно: фарм отнимет право на возврат. Осталось дней: 1.');
  assert.equal(refundNote(1.2), 'Куплена недавно: фарм отнимет право на возврат. Осталось дней: 2.');
  assert.equal(refundNote(Number.NaN), 'Куплена недавно: фарм отнимет право на возврат. Осталось дней: 1.');
});

test('the release question names the game and the two-hour limit', () => {
  assert.equal(releaseQuestion('Portal'), 'Фармить Portal? После 2 часов в игре вернуть её будет нельзя.');
});

const ENGINE_HINT = 'Steam IDLE читает сайт Steam через браузерный движок раздач. Установите его: вкладка «Раздачи» → «Проверить готовность» → «Браузерный движок».';

test('a missing browser engine has its own readiness text, refusal text and hint', async () => {
  const text = await bundleOf('steamIdleText.ts');
  assert.deepEqual(text.communityText('engine_missing'), { text: 'Нужен браузерный движок', tone: 'warn' });
  assert.equal(text.refusalText('engine_missing'), ENGINE_HINT);
  assert.equal(text.ENGINE_MISSING_HINT, ENGINE_HINT);
});

const ENGINE_HINT_NO_GIVEAWAYS = 'Включите вкладку «Раздачи» в Настройках, чтобы установить браузерный движок.';

test('with the Giveaways tab turned off the engine hint points to Settings, not to the hidden tab', async () => {
  const text = await bundleOf('steamIdleText.ts');
  assert.equal(text.ENGINE_MISSING_HINT_GIVEAWAYS_OFF, ENGINE_HINT_NO_GIVEAWAYS);
  assert.equal(text.engineMissingHint(false), ENGINE_HINT_NO_GIVEAWAYS);
  assert.equal(text.engineMissingHint(true), ENGINE_HINT);
  assert.equal(text.refusalText('engine_missing', 'engine_missing', false), ENGINE_HINT_NO_GIVEAWAYS);
  assert.equal(text.refusalText('engine_missing', 'engine_missing', true), ENGINE_HINT);
  assert.equal(text.refusalText('busy', 'unknown', false), text.refusalText('busy', 'unknown', true));
});

test('the engine refusal goes stale once the session is no longer engine_missing', async () => {
  const { refusalApplies } = await bundleOf('steamIdleText.ts');
  assert.equal(refusalApplies('engine_missing', { community: { session: 'engine_missing' } }), true);
  assert.equal(refusalApplies('engine_missing', { community: { session: 'unknown' } }), false);
});

test('a game card cover is the Steam portrait for the app id', () => {
  assert.equal(steamCover(620), 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg');
});

test('playtime in minutes becomes hours, and a game never launched has none', () => {
  assert.equal(playedHours(90), 1.5);
  assert.equal(playedHours(0), null);
  assert.equal(playedHours(-5), null);
  assert.equal(playedHours(Number.NaN), null);
  assert.equal(playedHours(undefined), null);
});

test('the finished-game facts always show the unlocked count and the other counts only when not zero', () => {
  const g = { unlocked: 4, skipped: 0, failed: 0, already: 0, rejected: 0 };
  assert.deepEqual(finishedFacts(g), [{ label: 'Выдано', count: 4 }]);
  assert.deepEqual(finishedFacts({ unlocked: 0, skipped: 2, failed: 1, already: 3, rejected: 5 }), [
    { label: 'Выдано', count: 0 }, { label: 'Пропущено', count: 2 }, { label: 'Отклонено', count: 5 },
    { label: 'Уже было', count: 3 }, { label: 'Не удалось', count: 1 },
  ]);
  assert.deepEqual(finishedFacts({ unlocked: 1 }), [{ label: 'Выдано', count: 1 }]);
});

const { parseDenyTarget } = await import(pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'denyParse.mjs')).href);

test('the deny field takes an AppID or a store page address and nothing else', () => {
  for (const text of ['730', ' 730 ', 'https://store.steampowered.com/app/730', 'https://store.steampowered.com/app/730/',
    'https://store.steampowered.com/app/730/Counter-Strike_2/?l=russian#x', 'http://store.steampowered.com/app/730/X', 'store.steampowered.com/app/730/X']) {
    assert.deepEqual(parseDenyTarget(text), { appId: 730 }, text);
  }
  assert.deepEqual(parseDenyTarget('4294967295'), { appId: 4294967295 });
});
test('an empty deny field is not an error, a bad one is', () => {
  assert.deepEqual(parseDenyTarget('   '), { appId: null, bad: false });
  for (const text of ['0', '007', '-5', '7x0', '730 440', '4294967296', 'https://store.steampowered.com/', 'https://store.steampowered.com/app/',
    'https://store.steampowered.com/app/x', 'https://store.steampowered.com/app/730x', 'https://evil.example/app/730',
    'https://store.steampowered.com.evil.example/app/730', 'https://steamcommunity.com/app/730', 'ftp://store.steampowered.com/app/730',
    'https://store.steampowered.com/agecheck/app/730']) {
    assert.deepEqual(parseDenyTarget(text), { appId: null, bad: true }, text);
  }
});

const { parseLogReply, mergeEntries, clockTime, copyReport, farmStateLine, LOG_CAP } = await import(pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'activityLog.mjs')).href);

const entry = (seq, level = 'info', text = `line ${seq}`) => ({ seq, ts: '2026-11-22T10:15:30Z', level, text });

test('a log reply must carry entries of the contract shape and a lastSeq', () => {
  assert.deepEqual(parseLogReply({ entries: [entry(1)], lastSeq: 1 }), { entries: [entry(1)], lastSeq: 1 });
  assert.deepEqual(parseLogReply({ entries: [], lastSeq: 0 }), { entries: [], lastSeq: 0 });
  for (const bad of [null, [], {}, { entries: [] }, { entries: {}, lastSeq: 1 }, { entries: [], lastSeq: '1' },
    { entries: [{ ...entry(1), level: 'debug' }], lastSeq: 1 }, { entries: [{ ...entry(1), text: 5 }], lastSeq: 1 },
    { entries: [{ ...entry(1), seq: 'x' }], lastSeq: 1 }, { entries: [{ ...entry(1), ts: 1 }], lastSeq: 1 }]) {
    assert.equal(parseLogReply(bad), null, JSON.stringify(bad));
  }
});

test('merging appends only newer entries and keeps the newest 500', () => {
  assert.deepEqual(mergeEntries([entry(1), entry(2)], [entry(2), entry(3)]).map((e) => e.seq), [1, 2, 3]);
  assert.deepEqual(mergeEntries([], [entry(5)]).map((e) => e.seq), [5]);
  const many = mergeEntries([], Array.from({ length: LOG_CAP + 20 }, (_, i) => entry(i + 1)));
  assert.equal(many.length, 500);
  assert.deepEqual([many[0].seq, many[499].seq], [21, 520]);
});

test('the time column is HH:MM:SS in local time and survives a bad stamp', () => {
  const ts = '2026-11-22T10:15:30Z';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  assert.equal(clockTime(ts), `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
  assert.equal(clockTime('nope'), '--:--:--');
});

test('the farm line names the state, phase, held game and last error', () => {
  const farm = { state: 'farming', phase: 'cards', current: { appId: 620, name: 'Portal 2', dropsRemaining: 3, heldSeconds: 5 }, batch: [], lastError: null };
  assert.equal(farmStateLine(farm, { state: 'idle' }), 'Farm: farming, phase cards, holding Portal 2 (620); achievements: idle');
  assert.equal(farmStateLine({ state: 'batching', phase: 'hours', current: null, batch: [{}, {}, {}], lastError: 'no_hours' }, undefined),
    'Farm: batching, phase hours, 3 games in the batch, last error no_hours');
  assert.equal(farmStateLine({ state: 'idle', phase: null, current: null, batch: [], lastError: null }, undefined), 'Farm: idle');
});

test('the copy text is a header, the state line and one HH:MM:SS LEVEL line per entry', () => {
  const now = new Date(2026, 10, 22, 13, 5, 9);
  const text = copyReport({ appVersion: '3.9.2', now, state: 'Farm: idle', entries: [entry(1, 'info', 'a'), entry(2, 'warning', 'b'), entry(3, 'error', 'c')] });
  const lines = text.split('\n');
  assert.match(lines[0], /^Twitch Drops Sentinel v3\.9\.2 — Steam IDLE log — 2026-11-22 13:05:09$/);
  assert.equal(lines[1], 'Farm: idle');
  assert.match(lines[2], /^\d\d:\d\d:\d\d INFO a$/);
  assert.match(lines[3], /^\d\d:\d\d:\d\d WARNING b$/);
  assert.match(lines[4], /^\d\d:\d\d:\d\d ERROR c$/);
  assert.equal(copyReport({ appVersion: undefined, now, state: 'Farm: idle', entries: [] }).split('\n')[0], 'Twitch Drops Sentinel — Steam IDLE log — 2026-11-22 13:05:09');
});

test('etaText: minutes, hours with minutes, and days with hours beyond 48 h', () => {
  assert.equal(etaText(0.5), '30 мин');
  assert.equal(etaText(2), '2 ч');
  assert.equal(etaText(5.5), '5 ч 30 мин');
  assert.equal(etaText(0.01), '1 мин');
  assert.equal(etaText(48), '48 ч');
  assert.equal(etaText(52.4), '2 дн 4 ч');
  assert.equal(etaText(72), '3 дн');
  assert.equal(etaText(71.7), '3 дн', 'the hours round up into a whole day');
  for (const bad of [Number.NaN, -1, Infinity, undefined, null]) assert.equal(etaText(bad), '', String(bad));
});

test('the farm stats line: cards left, time, today and this run, with Russian plurals', () => {
  assert.deepEqual(farmStatsSegments({ estimate: { dropsRemaining: 23, hours: 5.5 }, droppedToday: 12, droppedThisRun: 3 }),
    ['Осталось ~23 карточки', '≈ 5 ч 30 мин', 'сегодня выпало 12 (за запуск 3)']);
  for (const [n, word] of [[1, 'карточка'], [2, 'карточки'], [5, 'карточек'], [11, 'карточек'], [21, 'карточка'], [24, 'карточки']]) {
    assert.equal(farmStatsSegments({ estimate: { dropsRemaining: n, hours: 1 } })[0], `Осталось ~${n} ${word}`, String(n));
  }
  assert.deepEqual(farmStatsSegments({ estimate: { dropsRemaining: 100, hours: 60 }, droppedToday: 0, droppedThisRun: 0 }),
    ['Осталось ~100 карточек', '≈ 2 дн 12 ч', 'сегодня выпало 0 (за запуск 0)']);
});

test('the farm stats line drops what is unknown: older payloads, nothing left, no time', () => {
  assert.deepEqual(farmStatsSegments({}), []);
  assert.deepEqual(farmStatsSegments({ estimate: { dropsRemaining: 0, hours: 0 }, droppedToday: 4 }), ['сегодня выпало 4']);
  assert.deepEqual(farmStatsSegments({ estimate: { dropsRemaining: 3, hours: 0 } }), ['Осталось ~3 карточки']);
  assert.deepEqual(farmStatsSegments({ droppedToday: 2, droppedThisRun: 1 }), ['сегодня выпало 2 (за запуск 1)']);
  assert.deepEqual(farmStatsSegments({ droppedThisRun: 1 }), ['за запуск выпало 1']);
});

test('the threshold hint says "no restriction, set 0" or names the hours to set, with a decimal comma', () => {
  assert.equal(thresholdHint({ kind: 'unrestricted', suggestedHours: 0, samples: 3 }),
    'Похоже, аккаунт без ограничений: первая карточка падает примерно через 30 минут. Поставить 0 — фаза набора часов не нужна.');
  assert.equal(thresholdHint({ kind: 'restricted', suggestedHours: 1.5, samples: 4 }), 'Первая карточка падает примерно через 1,5 ч — поставить 1,5?');
  assert.equal(thresholdHint({ kind: 'restricted', suggestedHours: 3, samples: 3 }), 'Первая карточка падает примерно через 3 ч — поставить 3?');
  assert.equal(thresholdHint(null), null);
  assert.equal(thresholdHint(undefined), null);
});

test('a suggestion from the service is used only when it has the contract shape', () => {
  assert.deepEqual(parseSuggestion({ kind: 'restricted', suggestedHours: 2.5, samples: 5 }), { kind: 'restricted', suggestedHours: 2.5, samples: 5 });
  assert.deepEqual(parseSuggestion({ kind: 'unrestricted', suggestedHours: 0, samples: 3 }), { kind: 'unrestricted', suggestedHours: 0, samples: 3 });
  for (const bad of [null, undefined, 5, 'x', [], {}, { kind: 'weird', suggestedHours: 1, samples: 3 }, { kind: 'restricted', suggestedHours: 11, samples: 3 },
    { kind: 'restricted', suggestedHours: -1, samples: 3 }, { kind: 'restricted', suggestedHours: 1.25, samples: 3 }, { kind: 'restricted', suggestedHours: '2', samples: 3 },
    { kind: 'restricted', suggestedHours: 1, samples: 'x' }, { kind: 'unrestricted', suggestedHours: 1, samples: 3 }, { kind: 'restricted', suggestedHours: 0, samples: 3 }]) {
    assert.equal(parseSuggestion(bad), null, JSON.stringify(bad));
  }
});

test('an auto-pause from the service is used only for the user_playing reason with numbers', () => {
  assert.deepEqual(parseAutoPause({ reason: 'user_playing', appId: 730, since: 12.5 }), { reason: 'user_playing', appId: 730, since: 12.5 });
  for (const bad of [null, undefined, 3, {}, { reason: 'other', appId: 1, since: 1 }, { reason: 'user_playing', appId: 'x', since: 1 },
    { reason: 'user_playing', appId: 1, since: Number.NaN }, { reason: 'user_playing', appId: 1 }]) {
    assert.equal(parseAutoPause(bad), null, JSON.stringify(bad));
  }
});
