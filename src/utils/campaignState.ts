import type { GameItem, TrophyItem } from '../types';

// One definition of "is there something to farm for this game", shared by the idle hero, the queue
// rows and the off-queue block so they never disagree. Pure: only types are imported.

export type CampaignKind = 'none' | 'link' | 'running' | 'done';

export interface CampaignState {
  kind: CampaignKind;
  remaining: number; // drops still to claim (0 when unknown or done)
  linkUrl: string | null;
  reason?: string; // why a campaign that exists cannot be farmed (reported by the engine)
}

const lower = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase().trim() : '');

export type NameMatcher = (a: string, b: string) => boolean;

export const namesMatch = (a: string, b: string, smartMatch?: NameMatcher): boolean =>
  lower(a) === lower(b) || (smartMatch ? smartMatch(a, b) : false);

export const isInQueue = (name: string, priorityList: string[], smartMatch?: NameMatcher): boolean =>
  priorityList.some((queued) => namesMatch(name, queued, smartMatch));

const trophyTime = (t: TrophyItem): number => {
  // "2026-11-01 10:21" is written in the service machine's local time
  const parsed = new Date(String(t.date).replace(' ', 'T')).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

// Drops the account has already received during this campaign, taken from the trophy journal
export const claimedByTrophies = (g: GameItem, trophies: TrophyItem[], smartMatch?: NameMatcher): number => {
  const start = g.drops_start_at ? new Date(g.drops_start_at).getTime() : -Infinity;
  const end = g.drops_end_at ? new Date(g.drops_end_at).getTime() : Infinity;
  return trophies.filter((t) => {
    if (!namesMatch(t.game, g.name, smartMatch) || !/claim/i.test(String(t.status))) return false;
    const at = trophyTime(t);
    return Number.isNaN(at) || (at >= start && at <= end);
  }).length;
};

export const getCampaignState = (
  g: GameItem | undefined,
  trophies: TrophyItem[] = [],
  smartMatch?: NameMatcher
): CampaignState => {
  if (!g || !g.has_drops || !g.is_active_now) return { kind: 'none', remaining: 0, linkUrl: null };

  const total = g.total_drops ?? g.rewards_count;
  const trophyCount = claimedByTrophies(g, trophies, smartMatch);
  const claimed = Math.max(g.claimed_drops ?? 0, trophyCount);
  const finished = Boolean(
    g.is_finished ||
      (g.progress_percent !== undefined && g.progress_percent >= 100) ||
      (total && claimed >= total)
  );
  const remaining = finished ? 0 : total ? Math.max(0, total - claimed) : 1;
  if (finished) return { kind: 'done', remaining: 0, linkUrl: null };
  // the engine knows better than the catalog: a listed campaign it cannot farm is not "running"
  if (g.farmable === false) return { kind: 'none', remaining: 0, linkUrl: null, reason: g.not_farmable_reason };
  if (g.is_account_connected === false) return { kind: 'link', remaining, linkUrl: g.account_link_url || null };
  return { kind: 'running', remaining, linkUrl: null };
};

export const dropsWord = (n: number): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'дроп';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дропа';
  return 'дропов';
};

// Short status line for a queue row
export const campaignLabel = (s: CampaignState): string => {
  switch (s.kind) {
    case 'running':
      return `идёт · ${s.remaining} ${dropsWord(s.remaining)}`;
    case 'link':
      return 'привяжите аккаунт';
    case 'done':
      return 'всё получено';
    default:
      return s.reason || 'нет кампании'; // a listed but unfarmable campaign says why
  }
};

// Queue status filter: the order never changes, rows that do not match are just hidden.
// "all" shows everything, including the finished rows (the dashboard folds those into their own group).
export type QueueFilter = 'all' | 'available' | 'action' | 'none';

const QUEUE_FILTER_KIND: Record<Exclude<QueueFilter, 'all'>, CampaignKind> = {
  available: 'running',
  action: 'link',
  none: 'none',
};

export const queueView = <T extends { state: CampaignState }>(
  items: T[],
  filter: QueueFilter
): { visible: T[]; total: number } => ({
  visible: filter === 'all' ? items : items.filter((item) => item.state.kind === QUEUE_FILTER_KIND[filter]),
  total: items.length,
});

// Header counters from the same rows. The game that is farming right now is not in the rows: it adds 1 to the
// total and to "available", so the four parts always sum to the total.
export const queueCounts = <T extends { state: CampaignState }>(
  items: T[],
  hasActiveGame: boolean
): { total: number; available: number; needLink: number; finished: number; noCampaign: number } => {
  const count = (kind: CampaignKind): number => items.filter((item) => item.state.kind === kind).length;
  const active = hasActiveGame ? 1 : 0;
  return {
    total: items.length + active,
    available: count('running') + active,
    needLink: count('link'),
    finished: count('done'),
    noCampaign: count('none'),
  };
};

// Stored filter -> value. The old "only with campaigns" switch hid rows of kind none only, which no new filter
// reproduces except "all" (running rows stay visible), so a missing value and the legacy key both start as "all".
export const parseQueueFilter = (stored: string | null): QueueFilter => {
  return stored === 'available' || stored === 'action' || stored === 'none' ? stored : 'all';
};
