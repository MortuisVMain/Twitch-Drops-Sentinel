// What the dashboard shows for a Twitch reward campaign (a quest or brand offer): link, goal, deadline, initials. Pure: no imports.

export const REWARDS_PAGE_URL = 'https://www.twitch.tv/drops/campaigns';
export const REWARDS_OPEN_KEY = 'sentinel_reward_campaigns_open';
const LIMIT = 50;

const goal = (value) => (Number.isInteger(value) && value > 0 ? value : null);

/** The campaign's own https address, otherwise the Twitch page that lists all campaigns. */
export const rewardLink = (campaign) => {
  const url = campaign?.url;
  return typeof url === 'string' && url.startsWith('https://') ? url : REWARDS_PAGE_URL;
};

/** "Смотреть 30 мин", "Подписок: 1", both joined, or '' when the service knows no goal. */
export const rewardGoalText = (campaign) => {
  const minutes = goal(campaign?.minutesGoal);
  const subs = goal(campaign?.subsGoal);
  return [minutes && `Смотреть ${minutes} мин`, subs && `Подписок: ${subs}`].filter(Boolean).join(' · ');
};

/** "до 30 дек." for a readable end date, '' otherwise. */
export const rewardUntilText = (endsAt, locale) => {
  if (typeof endsAt !== 'string' || !endsAt) return '';
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return '';
  return `до ${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
};

/** Up to two capital letters for the picture-less fallback; '?' when the name has no letters. */
export const rewardInitials = (name) => {
  const words = typeof name === 'string' ? name.match(/[\p{L}\p{N}]+/gu) || [] : [];
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
};

/** The campaigns the page can draw: objects with a text id and name, at most fifty. */
export const usableRewardCampaigns = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
    .slice(0, LIMIT);

// ---- Reward campaigns as cards: queue entries, button states, texts. Pure.

export const REWARD_QUEUE_PREFIX = 'reward:';
export const REWARD_GONE_TEXT = 'Кампания наград закончилась';
const CATEGORY_MAX = 100;

const num = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

/** The entry of priority_games that queues a reward campaign. */
export const rewardQueueKey = (id) => `${REWARD_QUEUE_PREFIX}${id}`;

export const isRewardQueueEntry = (entry) => typeof entry === 'string' && entry.startsWith(REWARD_QUEUE_PREFIX);

/** The queue without reward entries: what the game-only views (idle reason, counters) may use. */
export const gameQueueEntries = (list) => (Array.isArray(list) ? list.filter((entry) => !isRewardQueueEntry(entry)) : []);

/**
 * Every queue entry as something drawable, keeping its position in priority_games (the order arrows need it).
 * A reward entry takes the campaign's name, or says it ended; hidden campaigns are dropped.
 */
export const queueItems = (priorityList, campaigns, hiddenIds) => {
  const byId = new Map(usableRewardCampaigns(campaigns).map((c) => [c.id, c]));
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set();
  const items = [];
  (Array.isArray(priorityList) ? priorityList : []).forEach((entry, index) => {
    if (typeof entry !== 'string') return;
    if (!isRewardQueueEntry(entry)) {
      items.push({ entry, index, kind: 'game', name: entry, campaign: null, gone: false });
      return;
    }
    const id = entry.slice(REWARD_QUEUE_PREFIX.length);
    if (hidden.has(id)) return;
    const campaign = byId.get(id) || null;
    items.push({ entry, index, kind: 'reward', name: campaign ? campaign.name : REWARD_GONE_TEXT, campaign, gone: !campaign });
  });
  return items;
};

/** Adds the entry at the end of the queue or removes it; the other entries are untouched. */
export const toggleQueueEntry = (list, entry) => {
  const current = Array.isArray(list) ? list : [];
  return current.includes(entry)
    ? { list: current.filter((e) => e !== entry), queued: false }
    : { list: [...current, entry], queued: true };
};

const hasGroups = (campaign) => Array.isArray(campaign?.groups) && campaign.groups.length > 0;

const hasWatchGoal = (campaign) =>
  hasGroups(campaign) ? campaign.groups.some((g) => g?.goalKind === 'watch' && num(g.minutes) > 0) : num(campaign?.minutesGoal) > 0;

/** What the "Farm now" button does: stop (it is the forced target), start, or stay blocked with the reason for the tooltip. */
export const rewardFarmAction = (campaign, forcedGame) => {
  if (campaign && forcedGame === rewardQueueKey(campaign.id)) return { mode: 'stop', reason: '' };
  if (campaign?.earned) return { mode: 'blocked', reason: 'Награда уже получена' };
  if (campaign?.doneToday) return { mode: 'blocked', reason: 'Цель на сегодня выполнена' };
  if (campaign?.farmable === true) return { mode: 'start', reason: '' };
  if (!hasWatchGoal(campaign)) return { mode: 'blocked', reason: 'Только подписка — Sentinel платное не делает' };
  if (!campaign?.category) return { mode: 'blocked', reason: 'Нет категории для просмотра' };
  return { mode: 'blocked', reason: 'Эту кампанию сейчас нельзя фармить' };
};

const rewardNames = (rewards) =>
  (Array.isArray(rewards) ? rewards : []).map((r) => (typeof r?.name === 'string' ? r.name.trim() : '')).filter(Boolean);

/** "сегодня 23/60" (watched minutes never above the goal), '' when the campaign has no daily watch goal. */
export const rewardTodayText = (campaign) => {
  const goalMinutes = num(campaign?.dailyGoal);
  return goalMinutes ? `сегодня ${Math.min(num(campaign?.watchedToday), goalMinutes)}/${goalMinutes}` : '';
};

/** Goal groups as the service sent them, or built from the two plain goals of an older service (all rewards under the first). */
const goalGroups = (campaign) => {
  if (hasGroups(campaign)) return campaign.groups;
  const groups = [
    num(campaign?.minutesGoal) && { goalKind: 'watch', minutes: num(campaign.minutesGoal), subs: 0, rewards: [] },
    num(campaign?.subsGoal) && { goalKind: 'subs', minutes: 0, subs: num(campaign.subsGoal), rewards: [] },
  ].filter(Boolean);
  if (groups.length > 0) groups[0].rewards = campaign.rewards;
  return groups;
};

/** One line per goal group with the reward names under it; subscriptions and other goals are muted and manual only. */
export const rewardGroupLines = (campaign) =>
  goalGroups(campaign).map((g) => {
    const rewards = rewardNames(g?.rewards);
    const minutes = num(g?.minutes);
    if (g?.goalKind === 'watch' && minutes) {
      const done = campaign?.doneToday ? ' · выполнено на сегодня' : '';
      return { kind: 'watch', text: `Смотреть ${minutes} мин в день · сегодня ${Math.min(num(campaign?.watchedToday), minutes)}/${minutes}${done}`, muted: false, rewards };
    }
    if (g?.goalKind === 'subs') {
      const subs = num(g.subs);
      return { kind: 'subs', text: subs ? `Подписок: ${subs} — только вручную` : 'Подписка — только вручную', muted: true, rewards };
    }
    return { kind: 'other', text: 'Другое условие — только вручную', muted: true, rewards };
  });

const CATEGORY_SOURCE = { guess: 'угадана', user: 'вручную', game: 'из Twitch' };

/** "Категория: Grand Theft Auto VI · угадана", or "Категория не найдена". */
export const rewardCategoryLine = (campaign) => {
  const category = campaign?.category;
  if (!category || typeof category.name !== 'string' || !category.name) return 'Категория не найдена';
  const source = CATEGORY_SOURCE[category.source];
  return source ? `Категория: ${category.name} · ${source}` : `Категория: ${category.name}`;
};

/** "Кампания наград: <name> · <category>" for the dashboard's current target. */
export const rewardTargetLine = (campaign) => {
  const name = typeof campaign?.name === 'string' ? campaign.name : '';
  const category = typeof campaign?.category?.name === 'string' ? campaign.category.name : '';
  if (!name) return 'Кампания наград';
  return `Кампания наград: ${name}${category ? ` · ${category}` : ''}`;
};

/** Today's watch progress in whole percent, 100 for an earned reward. */
export const rewardProgressPercent = (campaign) => {
  if (campaign?.earned) return 100;
  const goalMinutes = num(campaign?.dailyGoal);
  return goalMinutes ? Math.min(100, Math.round((num(campaign?.watchedToday) / goalMinutes) * 100)) : 0;
};

/** A category typed by the user: trimmed, at most 100 characters, '' when nothing is left. */
export const sanitizeCategory = (text) => (typeof text === 'string' ? text.trim().slice(0, CATEGORY_MAX).trim() : '');

/** The whole reward_campaign_categories map to post: the name replaces the entry, an empty name removes it. */
export const withCategory = (map, id, name) => {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  const clean = sanitizeCategory(name);
  if (clean) next[id] = clean;
  else delete next[id];
  return next;
};

/** The whole hidden_reward_campaigns list to post. */
export const withHiddenId = (list, id, hidden) => {
  const current = Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
  if (hidden) return current.includes(id) ? current : [...current, id];
  return current.filter((v) => v !== id);
};

/** Hidden ids: the setting when the service sent it (it is what the page just changed), else the campaigns' own flag. */
export const hiddenRewardIds = (settingList, campaigns) =>
  Array.isArray(settingList)
    ? new Set(settingList.filter((v) => typeof v === 'string'))
    : new Set(usableRewardCampaigns(campaigns).filter((c) => c.hidden === true).map((c) => c.id));

export const visibleRewardCampaigns = (campaigns, hiddenIds) => usableRewardCampaigns(campaigns).filter((c) => !hiddenIds.has(c.id));

/** The shelf search: name, brand, category or a reward name contains the text. */
export const rewardMatchesQuery = (campaign, query) => {
  const q = lower(query).trim();
  if (!q) return true;
  const rewards = [...rewardNames(campaign?.rewards), ...(Array.isArray(campaign?.groups) ? campaign.groups.flatMap((g) => rewardNames(g?.rewards)) : [])];
  return [campaign?.name, campaign?.brand, campaign?.category?.name, ...rewards].some((text) => lower(text).includes(q));
};

/** "день 3 из 6": the day of a multi-day campaign (the day in progress, or today's once its goal is done). "день 3" when the
 *  service cannot tell how many days there are, '' without a daily goal or before anything was watched. */
export const rewardDayText = (campaign) => {
  if (!num(campaign?.dailyGoal)) return '';
  const done = num(campaign?.daysDone);
  if (done === 0 && num(campaign?.watchedToday) === 0 && campaign?.doneToday !== true) return '';
  const day = campaign?.doneToday === true ? Math.max(done, 1) : done + 1;
  const total = num(campaign?.daysTotal);
  return total ? `день ${day} из ${total}` : `день ${day}`;
};

/** "Значок за сегодня получен" once the service has seen today's daily reward, otherwise ''. */
export const rewardDailyRewardText = (campaign) => (campaign?.dailyRewardToday === true ? 'Значок за сегодня получен' : '');

/** The two reward switches of Settings: the daily slot is on unless the setting is false, the auto-queue only when true;
 *  both are disabled while the reward campaigns themselves are off. */
export const rewardSwitches = (settings) => ({
  disabled: settings?.reward_campaigns_enabled !== true,
  slot: settings?.reward_daily_slot !== false,
  autoQueue: settings?.reward_auto_queue === true,
});

/** The state of a reward's row in the dashboard queue (kinds as the game rows use them) and its short caption. */
export const rewardQueueStatus = (campaign) => {
  if (!campaign) return { kind: 'none', label: REWARD_GONE_TEXT };
  if (campaign.earned) return { kind: 'done', label: 'награда получена' };
  if (campaign.doneToday) return { kind: 'done', label: 'цель на сегодня выполнена' };
  if (campaign.farmable === true) return { kind: 'running', label: rewardTodayText(campaign) || 'идёт' };
  return { kind: 'none', label: rewardFarmAction(campaign, null).reason };
};
