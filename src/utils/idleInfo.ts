import type { GameItem, TrophyItem } from '../types';
import { getCampaignState, isInQueue, namesMatch, type NameMatcher } from './campaignState';

// Pure model of the idle hero: why nothing is being farmed. Imports only types and the shared
// campaign rules so it can be transpiled and tested on its own.

export interface IdleInfoInput {
  priorityList: string[];
  allGames: GameItem[];
  trophies?: TrophyItem[];
  strictMode: boolean;
  now: number;
  smartMatch?: NameMatcher;
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
  outsideCount: number;
}

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

// Games that are neither in the queue nor already fully received: the "off-queue" set
export const isOffQueueCandidate = (
  g: GameItem,
  priorityList: string[],
  trophies: TrophyItem[],
  smartMatch?: NameMatcher
): boolean => !isInQueue(g.name, priorityList, smartMatch) && getCampaignState(g, trophies, smartMatch).kind !== 'done';

export const computeIdleInfo = ({ priorityList, allGames, trophies = [], strictMode, now, smartMatch }: IdleInfoInput): IdleInfo => {
  const queueGames = priorityList.map((name) => ({
    name,
    match: allGames.find((g) => namesMatch(g.name, name, smartMatch)),
  }));
  const states = queueGames.map((q) => ({ ...q, state: getCampaignState(q.match, trophies, smartMatch) }));
  const workable = states.filter((q) => q.state.kind === 'running');

  let reason: string;
  if (priorityList.length === 0) {
    reason = 'Очередь пуста: добавьте игры, чтобы Sentinel мог их фармить';
  } else if (workable.length > 0) {
    reason = `Кампании есть (${workable.slice(0, 3).map((q) => shortGameName(q.name)).join(', ')}), ждём стримеров с дропами`;
  } else {
    reason = `Ни для одной из ${priorityList.length} ${pluralRu(priorityList.length, 'игры', 'игр', 'игр')} очереди нет доступных кампаний`;
  }

  const upcoming = allGames
    .filter((g) => g.drops_start_at && new Date(g.drops_start_at).getTime() > now)
    .sort((a, b) => new Date(a.drops_start_at as string).getTime() - new Date(b.drops_start_at as string).getTime())[0];
  const outsideCount = allGames.filter(
    (g) => isOffQueueCandidate(g, priorityList, trophies, smartMatch) && getCampaignState(g, trophies, smartMatch).kind === 'running'
  ).length;
  let extra: string | null = null;
  if (upcoming) {
    extra = `Ближайшее: ${upcoming.name} — через ${formatTimeLeft(new Date(upcoming.drops_start_at as string).getTime() - now)}`;
  } else if (outsideCount > 0) {
    extra = `Доступно вне очереди: ${outsideCount} ${pluralRu(outsideCount, 'кампания', 'кампании', 'кампаний')}`;
  }

  const unlinked: UnlinkedCampaign[] = states
    .filter((q) => q.state.kind === 'link')
    .map((q) => ({ name: q.name, count: q.state.remaining, url: q.state.linkUrl }));

  return { reason, extra, workableNames: workable.map((q) => q.name), unlinked, outsideCount };
};
