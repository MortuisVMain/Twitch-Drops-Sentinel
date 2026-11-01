import type { GameItem } from '../types';

// Pure helpers for the "Active campaigns" shelf tab: what counts as running, how it is ordered and
// which campaigns the user has not seen yet. Only types are imported.

export type CampaignSortMode = 'new' | 'ending' | 'alpha';

export const SORT_LABELS: Record<CampaignSortMode, string> = {
  new: 'Сначала новые',
  ending: 'Скоро закончатся',
  alpha: 'По алфавиту',
};

const time = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

// A campaign that is running right now: has drops, not flagged inactive, inside its dates
export const isCampaignRunning = (g: GameItem, now: number = Date.now()): boolean => {
  if (!g.has_drops || g.is_active_now === false) return false;
  const start = time(g.drops_start_at);
  const end = time(g.drops_end_at);
  if (start !== null && start > now) return false;
  if (end !== null && end <= now) return false;
  return true;
};

export const campaignKey = (g: GameItem): string => `${g.id}|${g.drops_start_at ?? ''}`;

// `seen` is null on the very first visit (nothing is "new" then) or when storage is unavailable
export const isNewCampaign = (g: GameItem, seen: ReadonlySet<string> | null): boolean =>
  seen !== null && !seen.has(campaignKey(g));

const byName = (a: GameItem, b: GameItem): number => a.name.localeCompare(b.name, 'ru');

export const sortCampaigns = (
  games: GameItem[],
  mode: CampaignSortMode,
  seen: ReadonlySet<string> | null
): GameItem[] => {
  const list = [...games];
  if (mode === 'alpha') return list.sort(byName);
  if (mode === 'ending') {
    return list.sort((a, b) => {
      const ea = time(a.drops_end_at);
      const eb = time(b.drops_end_at);
      if (ea === null && eb === null) return byName(a, b);
      if (ea === null) return 1;
      if (eb === null) return -1;
      return ea - eb || byName(a, b);
    });
  }
  // 'new': unseen first, then the freshest start date, undated last, then by name
  return list.sort((a, b) => {
    const na = isNewCampaign(a, seen) ? 0 : 1;
    const nb = isNewCampaign(b, seen) ? 0 : 1;
    if (na !== nb) return na - nb;
    const sa = time(a.drops_start_at);
    const sb = time(b.drops_start_at);
    if (sa === null && sb === null) return byName(a, b);
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa || byName(a, b);
  });
};

// Remember the running campaigns of this visit: the next visit marks anything not in here as new
export const mergeSeen = (previous: ReadonlySet<string> | null, running: GameItem[]): string[] => {
  const merged = new Set<string>(previous ? Array.from(previous) : []);
  running.forEach((g) => merged.add(campaignKey(g)));
  return Array.from(merged).slice(-500);
};
