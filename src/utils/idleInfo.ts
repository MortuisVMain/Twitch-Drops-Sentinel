import type { GameItem } from '../types';

// Pure model of the idle hero: why nothing is being farmed. No imports besides types so it can be
// transpiled and tested on its own.

export interface IdleInfoInput {
  priorityList: string[];
  allGames: GameItem[];
  strictMode: boolean;
  now: number;
  smartMatch?: (a: string, b: string) => boolean;
}

export interface UnlinkedCampaign {
  name: string;
  count: number;
  url: string | null;
}

export interface IdleInfo {
  reason: string;
  extra: string | null;
  workableNames: string[];
  unlinked: UnlinkedCampaign[];
}

const lower = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase().trim() : '');

export const shortGameName = (name: string): string => {
  const base = name.split(/:| - /)[0].trim();
  return base.length > 18 ? `${base.slice(0, 17)}…` : base;
};

export const pluralRu = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const formatTimeLeft = (ms: number): string => {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
};

export const hasProgressData = (g: GameItem): boolean =>
  g.progress_percent !== undefined || g.total_drops !== undefined || g.is_finished !== undefined;

export const isFinishedGame = (g?: GameItem): boolean =>
  Boolean(
    g &&
      (g.is_finished ||
        (g.total_drops && g.claimed_drops !== undefined && g.claimed_drops >= g.total_drops) ||
        (g.progress_percent !== undefined && g.progress_percent >= 100))
  );

// A campaign is worth waiting for only when the account is linked (or unknown-but-not-false), the
// backend reports progress, and that progress is below 100%. Without progress data (a campaign that
// may already be claimed) nothing is promised.
export const isWorkableCampaign = (g?: GameItem): boolean =>
  Boolean(g && g.has_drops && g.is_active_now && g.is_account_connected !== false && hasProgressData(g) && !isFinishedGame(g));

export const computeIdleInfo = ({ priorityList, allGames, strictMode, now, smartMatch }: IdleInfoInput): IdleInfo => {
  const queueGames = priorityList.map((name) => ({
    name,
    match: allGames.find((g) => lower(g.name) === lower(name) || (smartMatch ? smartMatch(g.name, name) : false)),
  }));
  const workable = queueGames.filter(({ match }) => isWorkableCampaign(match));
  const shown = queueGames.slice(0, 4).map(({ name }) => shortGameName(name));
  const more = queueGames.length - shown.length;
  const listText = `${shown.join(', ')}${more > 0 ? ` и ещё ${more}` : ''}`;

  let reason: string;
  if (priorityList.length === 0) {
    reason = 'Очередь пуста: добавьте игры, чтобы Sentinel мог их фармить';
  } else if (workable.length > 0) {
    reason = `Кампании есть (${workable.slice(0, 3).map(({ name }) => shortGameName(name)).join(', ')}), ждём стримеров с дропами`;
  } else if (strictMode) {
    reason = `Для игр из ТОПа (${listText}) нет доступных кампаний`;
  } else {
    reason = 'Нет доступных кампаний для игр в очереди';
  }

  const upcoming = allGames
    .filter((g) => g.drops_start_at && new Date(g.drops_start_at).getTime() > now)
    .sort((a, b) => new Date(a.drops_start_at as string).getTime() - new Date(b.drops_start_at as string).getTime())[0];
  const inQueue = (g: GameItem) => priorityList.some((p) => lower(p) === lower(g.name));
  const outsideCount = allGames.filter(
    (g) => isWorkableCampaign(g) && !inQueue(g)
  ).length;
  let extra: string | null = null;
  if (upcoming) {
    extra = `Ближайшее: ${upcoming.name} — через ${formatTimeLeft(new Date(upcoming.drops_start_at as string).getTime() - now)}`;
  } else if (outsideCount > 0) {
    extra = `Доступно вне очереди: ${outsideCount} ${pluralRu(outsideCount, 'кампания', 'кампании', 'кампаний')}`;
  }
  // Queue games with a live campaign that cannot be farmed until the game account is linked
  const unlinked: UnlinkedCampaign[] = queueGames
    .filter(({ match }) => match && match.has_drops && match.is_active_now && match.is_account_connected === false && !isFinishedGame(match))
    .map(({ name, match }) => {
      const m = match as GameItem;
      const left = m.total_drops !== undefined ? Math.max(0, m.total_drops - (m.claimed_drops || 0)) : m.rewards_count || 1;
      return { name, count: left, url: m.account_link_url || null };
    });
  return { reason, extra, workableNames: workable.map(({ name }) => name), unlinked };
};
