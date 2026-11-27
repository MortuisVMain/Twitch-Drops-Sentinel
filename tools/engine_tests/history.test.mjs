// History of drops and claimed free games. Run: node --test tools/engine_tests/history.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { parseWhen, buildHistory, historyTotals, weeklyBuckets, historyCsv } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'history.mjs')).href);

const NOW = new Date(2026, 10, 21, 12, 0).getTime(); // Saturday 21 Nov 2026, local time
const daysAgo = (n) => NOW - n * 86400000;
const stamp = (ms) => { const d = new Date(ms); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

const trophies = [
  { id: 'tr-1', date: stamp(daysAgo(1)), game: 'Rust', drop_name: 'Skin', campaign: 'Week 1', status: 'Claimed' },
  { id: 'tr-2', date: stamp(daysAgo(20)), game: 'Hunt', drop_name: 'Charm', campaign: '', status: 'Claimed' },
  { id: 'tr-3', date: 'yesterday', game: 'Broken', drop_name: '', campaign: '', status: 'Claimed' },
];
const giveaways = [
  { id: 'epic:a:x', status: 'claimed', title: 'Free Game', store: 'epic', claimedAt: '', timestampMs: daysAgo(3) },
  { id: 'gog:a:y', status: 'existed', title: 'Owned', store: 'gog', claimedAt: '', timestampMs: daysAgo(2) },
  { id: 'fab:a:z', status: 'claimed', title: 'Old', store: 'fab', claimedAt: new Date(daysAgo(100)).toISOString(), timestampMs: 0 },
];

test('Trophies.md dates are local time; ISO strings parse too', () => {
  assert.equal(parseWhen('2026-11-21 13:05'), new Date(2026, 10, 21, 13, 5).getTime());
  assert.equal(parseWhen('2026-11-21'), new Date(2026, 10, 21).getTime());
  assert.ok(Number.isNaN(parseWhen('yesterday')));
});

test('one feed, newest first; unreadable dates and already-owned games are left out', () => {
  const items = buildHistory(trophies, giveaways);
  assert.deepEqual(items.map((i) => i.id), ['tw:tr-1', 'ga:epic:a:x', 'tw:tr-2', 'ga:fab:a:z']);
  assert.equal(items[0].detail, 'Skin · Week 1');
});

test('totals for 7 days, 30 days and all time', () => {
  const t = historyTotals(buildHistory(trophies, giveaways), NOW);
  assert.deepEqual(t.week, { twitch: 1, giveaway: 1 });
  assert.deepEqual(t.month, { twitch: 2, giveaway: 1 });
  assert.deepEqual(t.all, { twitch: 2, giveaway: 2 });
});

test('weekly buckets start on Monday and the current week is last', () => {
  const b = weeklyBuckets(buildHistory(trophies, giveaways), NOW, 4);
  assert.equal(b.length, 4);
  assert.equal(new Date(b[3].start).getDay(), 1);
  assert.equal(b[3].start, new Date(2026, 10, 16).getTime());
  assert.deepEqual({ tw: b[3].twitch, ga: b[3].giveaway }, { tw: 1, ga: 1 }, 'Rust yesterday and Epic 3 days ago are this week');
  assert.equal(b[0].twitch + b[1].twitch + b[2].twitch, 1, 'Hunt 20 days ago');
});

test('CSV: BOM, semicolons, quoted cells and no formulas', () => {
  const csv = historyCsv([{ id: '1', source: 'giveaway', at: NOW, title: '=HYPERLINK("x")', detail: 'a;b' }]);
  assert.ok(csv.startsWith('﻿Дата;Источник;Название;Подробности\r\n'));
  assert.ok(csv.includes(`2026-11-21 12:00;Раздача;"'=HYPERLINK(""x"")";"a;b"`), csv);
});
