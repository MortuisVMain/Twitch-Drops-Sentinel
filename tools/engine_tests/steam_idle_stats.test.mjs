// Steam IDLE statistics view logic. Run: node --test tools/engine_tests/steam_idle_stats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { parseStats, farmHours, weekBars, sortGames, nextSort, gamesCsv, periodTotals } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'components', 'steamIdle', 'idleStats.mjs')).href);

const week = (weekStart, farmSeconds, cards = 0, achievements = 0) => ({ weekStart, farmSeconds, cards, achievements });
const game = (appId, name, farmSeconds, cardsDropped, achievements, lastAt) => ({ appId, name, farmSeconds, cardsDropped, achievements, firstAt: 1, lastAt });
const totals = (farmSeconds, games, cards, achievements) => ({ farmSeconds, games, cards, achievements });
const valid = (over = {}) => ({
  period: '30', totals: totals(7200, 2, 5, 3),
  weeks: Array.from({ length: 12 }, (_, i) => week(`2026-09-${String(7 + i).padStart(2, '0')}`, 0)),
  games: [game(10, 'Ten', 3600, 2, 0, 100), game(20, 'Twenty', 3600, 3, 3, 200)], ...over,
});

test('a well-formed answer parses and anything else is rejected', () => {
  assert.deepEqual(parseStats(valid()), valid());
  for (const bad of [null, [], {}, valid({ period: 'x' }), valid({ totals: { farmSeconds: 1 } }), valid({ weeks: [{}] }),
    valid({ games: [{ appId: 'a' }] }), valid({ totals: totals(-1, 0, 0, 0) }), valid({ games: 'no' })]) {
    assert.equal(parseStats(bad), null, JSON.stringify(bad));
  }
});

test('farm hours have one decimal, whole hours stay whole', () => {
  assert.equal(farmHours(0), 0);
  assert.equal(farmHours(5400), 1.5);
  assert.equal(farmHours(3600), 1);
  assert.equal(farmHours(1000), 0.3);
});

test('the tiles show the totals of the answer for the chosen period', () => {
  assert.deepEqual(periodTotals(valid()), { hours: 2, games: 2, cards: 5, achievements: 3 });
  assert.deepEqual(periodTotals(null), { hours: 0, games: 0, cards: 0, achievements: 0 });
});

test('week bars scale to the busiest week and an empty history has flat bars', () => {
  const bars = weekBars([week('2026-11-09', 3600, 1), week('2026-11-16', 7200, 3), week('2026-11-23', 0)]);
  assert.deepEqual(bars.map((b) => b.height), [50, 100, 0]);
  assert.deepEqual(bars.map((b) => b.hours), [1, 2, 0]);
  assert.deepEqual(bars[1], { weekStart: '2026-11-16', hours: 2, cards: 3, achievements: 0, height: 100 });
  assert.deepEqual(weekBars([week('2026-11-23', 0)]).map((b) => b.height), [0]);
  assert.deepEqual(weekBars([]), []);
});

test('games sort by time, cards, achievements or last time, in either direction, ties by name', () => {
  const games = [game(1, 'b', 10, 5, 0, 300), game(2, 'a', 10, 1, 4, 100), game(3, 'c', 99, 5, 2, 200)];
  const ids = (key, dir) => sortGames(games, key, dir).map((g) => g.appId);
  assert.deepEqual(ids('time', 'desc'), [3, 2, 1]);
  assert.deepEqual(ids('time', 'asc'), [2, 1, 3]);
  assert.deepEqual(ids('cards', 'desc'), [1, 3, 2]);
  assert.deepEqual(ids('achievements', 'desc'), [2, 3, 1]);
  assert.deepEqual(ids('last', 'desc'), [1, 3, 2]);
  assert.deepEqual(ids('last', 'asc'), [2, 3, 1]);
  assert.deepEqual(games.map((g) => g.appId), [1, 2, 3], 'the input is not reordered');
});

test('clicking the same header flips the direction, a new header starts descending', () => {
  assert.deepEqual(nextSort({ key: 'time', dir: 'desc' }, 'time'), { key: 'time', dir: 'asc' });
  assert.deepEqual(nextSort({ key: 'time', dir: 'asc' }, 'time'), { key: 'time', dir: 'desc' });
  assert.deepEqual(nextSort({ key: 'time', dir: 'asc' }, 'cards'), { key: 'cards', dir: 'desc' });
});

test('the CSV is semicolon separated with a BOM, quotes cells and never starts a formula', () => {
  const csv = gamesCsv([game(7, 'Tom; "Jerry"', 5400, 2, 1, Date.UTC(2026, 10, 25, 10, 5) / 1000), game(8, '=SUM(A1)', 0, 0, 0, 0)], 'UTC');
  const lines = csv.split('\r\n');
  assert.ok(csv.startsWith('﻿'));
  assert.equal(lines[0], '﻿Игра;App ID;Часы;Карточки;Достижения;Первый раз;Последний раз');
  assert.equal(lines[1], '"Tom; ""Jerry""";7;1.5;2;1;1970-01-01 00:00;2026-11-25 10:05');
  assert.ok(lines[2].startsWith("'=SUM(A1);8;0;0;0;"));
  assert.equal(lines[3], '');
});
