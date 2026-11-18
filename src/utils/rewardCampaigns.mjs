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
