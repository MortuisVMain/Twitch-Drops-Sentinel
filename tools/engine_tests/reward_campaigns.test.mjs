// What the dashboard shows for a reward campaign. Run: node --test tools/engine_tests/reward_campaigns.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {
  REWARDS_PAGE_URL, REWARDS_OPEN_KEY, rewardLink, rewardGoalText, rewardUntilText, rewardInitials, usableRewardCampaigns,
  rewardQueueKey, isRewardQueueEntry, gameQueueEntries, queueItems, toggleQueueEntry, rewardFarmAction, rewardGroupLines,
  rewardCategoryLine, rewardTodayText, rewardTargetLine, rewardProgressPercent, sanitizeCategory, withHiddenId, withCategory,
  hiddenRewardIds, visibleRewardCampaigns, rewardMatchesQuery, rewardQueueStatus, rewardDayText, rewardDailyRewardText, rewardSwitches,
} =
  await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'rewardCampaigns.mjs')).href);

test('the link is the campaign url when it is https, otherwise the Twitch campaigns page', () => {
  assert.equal(REWARDS_PAGE_URL, 'https://www.twitch.tv/drops/campaigns');
  assert.equal(rewardLink({ url: 'https://example.test/promo' }), 'https://example.test/promo');
  for (const url of [null, undefined, '', 'http://example.test', 'javascript:alert(1)', 5]) {
    assert.equal(rewardLink({ url }), REWARDS_PAGE_URL, String(url));
  }
  assert.equal(rewardLink(null), REWARDS_PAGE_URL);
});

test('the goal reads as watch time, subs, both, or nothing', () => {
  assert.equal(rewardGoalText({ minutesGoal: 30, subsGoal: null }), 'Смотреть 30 мин');
  assert.equal(rewardGoalText({ minutesGoal: null, subsGoal: 1 }), 'Подписок: 1');
  assert.equal(rewardGoalText({ minutesGoal: 30, subsGoal: 2 }), 'Смотреть 30 мин · Подписок: 2');
  assert.equal(rewardGoalText({}), '');
  assert.equal(rewardGoalText({ minutesGoal: 0, subsGoal: -1 }), '');
  assert.equal(rewardGoalText({ minutesGoal: '30' }), '');
});

test('the deadline reads "до <day month>" in the page language and is empty when unknown or unreadable', () => {
  assert.match(rewardUntilText('2026-12-30T12:00:00Z', 'ru-RU'), /^до 30 дек/);
  assert.match(rewardUntilText('2026-12-30T12:00:00Z', 'en-GB'), /^до 30 Dec/);
  for (const bad of [null, undefined, '', 'soon', 12, {}]) assert.equal(rewardUntilText(bad, 'ru-RU'), '', String(bad));
});

test('initials: up to two letters, a placeholder for nothing', () => {
  assert.equal(rewardInitials('Synthetic Launch Celebration'), 'SL');
  assert.equal(rewardInitials('единственный'), 'Е');
  assert.equal(rewardInitials('  --  '), '?');
  assert.equal(rewardInitials(''), '?');
  assert.equal(rewardInitials(undefined), '?');
});

test('only well-formed campaigns reach the page, at most fifty', () => {
  const ok = { id: 'a', name: 'A' };
  assert.deepEqual(usableRewardCampaigns([ok, null, 7, { id: 'b' }, { name: 'c' }, { id: 5, name: 'x' }, 'z']), [ok]);
  for (const bad of [null, undefined, {}, 'x', 5]) assert.deepEqual(usableRewardCampaigns(bad), []);
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));
  assert.equal(usableRewardCampaigns(many).length, 50);
});

test('the open/closed choice of the group is remembered under its own key', () => {
  assert.equal(REWARDS_OPEN_KEY, 'sentinel_reward_campaigns_open');
});

const watch = (over = {}) => ({
  id: 'rc1', name: 'Launch', category: { name: 'Synthetic Game', slug: 's', source: 'game' }, farmable: true, watchedToday: 12, dailyGoal: 30,
  doneToday: false, earned: false, hidden: false, endsAt: null,
  groups: [{ goalKind: 'watch', minutes: 30, subs: 0, rewards: [{ name: 'Skin' }] }], ...over,
});

test('queue entries: reward:<id> is a reward, anything else is a game', () => {
  assert.equal(rewardQueueKey('rc1'), 'reward:rc1');
  assert.equal(isRewardQueueEntry('reward:rc1'), true);
  for (const e of ['Rust', 'reward', 'Reward:rc1', '', null, undefined, 5]) assert.equal(isRewardQueueEntry(e), false, String(e));
  assert.deepEqual(gameQueueEntries(['Rust', 'reward:rc1', 'Dota 2']), ['Rust', 'Dota 2']);
  assert.deepEqual(gameQueueEntries(undefined), []);
});

test('queue items keep the queue position, name rewards by campaign and flag ended ones, hidden ones are dropped', () => {
  const items = queueItems(['Rust', 'reward:rc1', 'reward:gone', 'reward:rc6'], [watch(), watch({ id: 'rc6', name: 'Secret' })], new Set(['rc6']));
  assert.deepEqual(items.map((i) => [i.index, i.kind, i.name, i.gone]), [
    [0, 'game', 'Rust', false], [1, 'reward', 'Launch', false], [2, 'reward', 'Кампания наград закончилась', true],
  ]);
  assert.equal(items[1].campaign.id, 'rc1');
  assert.equal(items[2].campaign, null);
  assert.equal(items.some((i) => String(i.name).startsWith('reward:')), false);
  assert.deepEqual(queueItems(null, null, null), []);
});

test('toggling a queue entry adds it at the end or removes it, never touching the other entries', () => {
  assert.deepEqual(toggleQueueEntry(['Rust'], 'reward:rc1'), { list: ['Rust', 'reward:rc1'], queued: true });
  assert.deepEqual(toggleQueueEntry(['reward:rc1', 'Rust'], 'reward:rc1'), { list: ['Rust'], queued: false });
  assert.deepEqual(toggleQueueEntry(undefined, 'reward:rc1'), { list: ['reward:rc1'], queued: true });
});

test('Farm now: stop when forced, otherwise blocked with the reason or start', () => {
  assert.deepEqual(rewardFarmAction(watch(), null), { mode: 'start', reason: '' });
  assert.deepEqual(rewardFarmAction(watch(), 'reward:rc1'), { mode: 'stop', reason: '' });
  assert.deepEqual(rewardFarmAction(watch({ doneToday: true }), 'reward:rc1'), { mode: 'stop', reason: '' });
  assert.deepEqual(rewardFarmAction(watch({ earned: true }), null), { mode: 'blocked', reason: 'Награда уже получена' });
  assert.deepEqual(rewardFarmAction(watch({ doneToday: true, farmable: true }), null), { mode: 'blocked', reason: 'Цель на сегодня выполнена' });
  assert.deepEqual(rewardFarmAction(watch({ category: null, farmable: false }), null), { mode: 'blocked', reason: 'Нет категории для просмотра' });
  const subs = watch({ category: null, farmable: false, dailyGoal: null, groups: [{ goalKind: 'subs', minutes: 0, subs: 1, rewards: [] }] });
  assert.deepEqual(rewardFarmAction(subs, null), { mode: 'blocked', reason: 'Только подписка — Sentinel платное не делает' });
  assert.equal(rewardFarmAction(watch({ farmable: false }), null).mode, 'blocked');
});

test('goal lines: watch with today progress, subs muted and manual, rewards listed under each goal', () => {
  const c = watch({ groups: [
    { goalKind: 'watch', minutes: 60, subs: 0, rewards: [{ name: 'GTA DVD Chest' }] },
    { goalKind: 'subs', minutes: 0, subs: 1, rewards: [{ name: 'Emote Chest' }, { name: '' }, {}] },
  ], watchedToday: 23, dailyGoal: 60 });
  assert.deepEqual(rewardGroupLines(c), [
    { kind: 'watch', text: 'Смотреть 60 мин в день · сегодня 23/60', muted: false, rewards: ['GTA DVD Chest'] },
    { kind: 'subs', text: 'Подписок: 1 — только вручную', muted: true, rewards: ['Emote Chest'] },
  ]);
  assert.equal(rewardGroupLines(watch({ doneToday: true, watchedToday: 70, dailyGoal: 30 }))[0].text, 'Смотреть 30 мин в день · сегодня 30/30 · выполнено на сегодня');
  assert.equal(rewardGroupLines(watch({ groups: [{ goalKind: 'other', minutes: 0, subs: 0, rewards: [] }] }))[0].text, 'Другое условие — только вручную');
  assert.deepEqual(rewardGroupLines(watch({ groups: undefined, minutesGoal: 20, subsGoal: 2, rewards: [{ name: 'X' }] })), [
    { kind: 'watch', text: 'Смотреть 20 мин в день · сегодня 12/20', muted: false, rewards: ['X'] },
    { kind: 'subs', text: 'Подписок: 2 — только вручную', muted: true, rewards: [] },
  ]);
});

test('category line says where the category came from, or that none was found', () => {
  const cat = (source) => ({ category: { name: 'Grand Theft Auto VI', slug: 'g', source } });
  assert.equal(rewardCategoryLine(cat('guess')), 'Категория: Grand Theft Auto VI · угадана');
  assert.equal(rewardCategoryLine(cat('user')), 'Категория: Grand Theft Auto VI · вручную');
  assert.equal(rewardCategoryLine(cat('game')), 'Категория: Grand Theft Auto VI · из Twitch');
  assert.equal(rewardCategoryLine({ category: null }), 'Категория не найдена');
  assert.equal(rewardCategoryLine({}), 'Категория не найдена');
});

test('today text, target line and progress percent', () => {
  assert.equal(rewardTodayText(watch({ watchedToday: 23, dailyGoal: 60 })), 'сегодня 23/60');
  assert.equal(rewardTodayText(watch({ watchedToday: 99, dailyGoal: 60 })), 'сегодня 60/60');
  assert.equal(rewardTodayText(watch({ dailyGoal: null })), '');
  assert.equal(rewardTargetLine(watch({ category: { name: 'GTA', slug: 'g', source: 'guess' } })), 'Кампания наград: Launch · GTA');
  assert.equal(rewardTargetLine(watch({ category: null })), 'Кампания наград: Launch');
  assert.equal(rewardTargetLine({ id: 'x', name: '' }), 'Кампания наград');
  assert.equal(rewardProgressPercent(watch({ watchedToday: 15, dailyGoal: 30 })), 50);
  assert.equal(rewardProgressPercent(watch({ watchedToday: 90, dailyGoal: 30 })), 100);
  assert.equal(rewardProgressPercent(watch({ dailyGoal: null })), 0);
  assert.equal(rewardProgressPercent(watch({ earned: true, dailyGoal: null })), 100);
});

test('category input is trimmed and cut at 100 characters; the map loses the key when it is empty', () => {
  assert.equal(sanitizeCategory('  Just Chatting  '), 'Just Chatting');
  assert.equal(sanitizeCategory('x'.repeat(130)).length, 100);
  assert.equal(sanitizeCategory('   '), '');
  assert.equal(sanitizeCategory(null), '');
  assert.deepEqual(withCategory({ a: 'A' }, 'b', ' B '), { a: 'A', b: 'B' });
  assert.deepEqual(withCategory({ a: 'A', b: 'B' }, 'b', ''), { a: 'A' });
  assert.deepEqual(withCategory(undefined, 'b', 'B'), { b: 'B' });
});

test('hiding adds the id once, showing removes it; the hidden set follows the setting, else the campaign flags', () => {
  assert.deepEqual(withHiddenId(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(withHiddenId(['a', 'b'], 'b', true), ['a', 'b']);
  assert.deepEqual(withHiddenId(['a', 'b'], 'b', false), ['a']);
  assert.deepEqual(withHiddenId(undefined, 'b', true), ['b']);
  const list = [watch(), watch({ id: 'rc2', hidden: true })];
  assert.deepEqual([...hiddenRewardIds(['rc1'], list)], ['rc1']);
  assert.deepEqual([...hiddenRewardIds([], list)], []);
  assert.deepEqual([...hiddenRewardIds(undefined, list)], ['rc2']);
  assert.deepEqual(visibleRewardCampaigns(list, new Set(['rc1'])).map((c) => c.id), ['rc2']);
  assert.deepEqual(visibleRewardCampaigns([null, { id: 'z' }, ...list], new Set()).map((c) => c.id), ['rc1', 'rc2']);
});

test('the shelf search finds a campaign by its name, brand, category or reward', () => {
  const c = watch({ name: 'Launch Party', brand: 'Acme', category: { name: 'Grand Theft Auto VI', slug: 'g', source: 'guess' } });
  for (const q of ['launch', 'ACME', 'theft', 'skin']) assert.equal(rewardMatchesQuery(c, q), true, q);
  assert.equal(rewardMatchesQuery(c, 'zzz'), false);
  assert.equal(rewardMatchesQuery(c, ''), true);
});

test('a queue row for a reward: running with today progress, done when earned or finished today, none with the reason otherwise', () => {
  assert.deepEqual(rewardQueueStatus(watch({ watchedToday: 23, dailyGoal: 60 })), { kind: 'running', label: 'сегодня 23/60' });
  assert.deepEqual(rewardQueueStatus(watch({ earned: true })), { kind: 'done', label: 'награда получена' });
  assert.deepEqual(rewardQueueStatus(watch({ doneToday: true })), { kind: 'done', label: 'цель на сегодня выполнена' });
  assert.deepEqual(rewardQueueStatus(watch({ farmable: false, category: null })), { kind: 'none', label: 'Нет категории для просмотра' });
  assert.deepEqual(rewardQueueStatus(null), { kind: 'none', label: 'Кампания наград закончилась' });
});

test('a multi-day campaign shows its day number: the day in progress, or the last finished one once today is done', () => {
  const day = (over) => watch({ dailyGoal: 60, watchedToday: 5, daysDone: 2, daysTotal: 6, doneToday: false, ...over });
  assert.equal(rewardDayText(day({})), 'день 3 из 6');
  assert.equal(rewardDayText(day({ doneToday: true, watchedToday: 60 })), 'день 2 из 6', 'daysDone already counts a day whose goal is reached');
  assert.equal(rewardDayText(day({ daysTotal: null })), 'день 3');
  assert.equal(rewardDayText(day({ daysTotal: undefined })), 'день 3');
  assert.equal(rewardDayText(day({ daysDone: 0, watchedToday: 0 })), '', 'nothing watched yet: no day to show');
  assert.equal(rewardDayText(day({ daysDone: 0, watchedToday: 7 })), 'день 1 из 6');
  assert.equal(rewardDayText(day({ dailyGoal: null })), '');
  assert.equal(rewardDayText(null), '');
  assert.equal(rewardDayText(day({ daysDone: 'x', daysTotal: 'y' })), 'день 1', 'garbage numbers read as none');
});

test('the received daily badge is stated only when the service says so', () => {
  assert.equal(rewardDailyRewardText(watch({ dailyRewardToday: true })), 'Значок за сегодня получен');
  for (const v of [false, undefined, null, 'true', 1]) assert.equal(rewardDailyRewardText(watch({ dailyRewardToday: v })), '', String(v));
  assert.equal(rewardDailyRewardText(null), '');
});

test('the two reward switches: the slot is on unless the setting is false, the auto-queue is on only when true, both off while rewards are off', () => {
  assert.deepEqual(rewardSwitches({ reward_campaigns_enabled: true }), { disabled: false, slot: true, autoQueue: false });
  assert.deepEqual(rewardSwitches({ reward_campaigns_enabled: true, reward_daily_slot: false, reward_auto_queue: true }), { disabled: false, slot: false, autoQueue: true });
  assert.deepEqual(rewardSwitches({}), { disabled: true, slot: true, autoQueue: false });
  assert.deepEqual(rewardSwitches({ reward_campaigns_enabled: false, reward_auto_queue: true }), { disabled: true, slot: true, autoQueue: true });
  assert.deepEqual(rewardSwitches(null), { disabled: true, slot: true, autoQueue: false });
});
