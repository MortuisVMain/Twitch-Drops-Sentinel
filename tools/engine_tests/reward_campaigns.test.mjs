// What the dashboard shows for a reward campaign. Run: node --test tools/engine_tests/reward_campaigns.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { REWARDS_PAGE_URL, REWARDS_OPEN_KEY, rewardLink, rewardGoalText, rewardUntilText, rewardInitials, usableRewardCampaigns } =
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
