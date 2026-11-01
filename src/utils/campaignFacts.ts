import { uiLocale } from '../i18n';
import type { GameItem, TrophyItem } from '../types';
import { dropsWord, getCampaignState, type NameMatcher } from './campaignState';

// Small pure helpers behind the shelf: the one-line trophy summary and (below) the three facts
// shown on every campaign. Only types are imported so esbuild can bundle it for the test gates.

export const gamesWord = (n: number): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'игра';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'игры';
  return 'игр';
};

const trophyTime = (t: TrophyItem): number => {
  // "2026-11-01 10:21" is written in the service machine's local time
  const parsed = new Date(String(t.date).replace(' ', 'T')).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

const formatWhen = (at: number): string =>
  new Date(at).toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// "Трофеи · 26 игр · последний: <дроп>, <время>" for the collapsed trophy block
export const lastTrophyLine = (trophies: TrophyItem[], games: number): string => {
  const base = games > 0 ? `Трофеи · ${games} ${gamesWord(games)}` : 'Трофеи';
  const pool = trophies.filter((t) => !t.status || /claim/i.test(String(t.status)));
  if (pool.length === 0) return `${base} · пока нет наград`;
  let latest = pool[pool.length - 1];
  let latestAt = trophyTime(latest);
  for (const t of pool) {
    const at = trophyTime(t);
    if (!Number.isNaN(at) && (Number.isNaN(latestAt) || at > latestAt)) {
      latest = t;
      latestAt = at;
    }
  }
  const name = latest.drop_name || latest.campaign || latest.game;
  return `${base} · последний: ${name}${Number.isNaN(latestAt) ? '' : `, ${formatWhen(latestAt)}`}`;
};

// "обновлено 5 мин назад": null when nothing has been synchronised yet
export const agoLabel = (at: number | null, now: number): string | null => {
  if (at === null) return null;
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 60) return 'обновлено только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `обновлено ${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `обновлено ${hours} ч назад`;
  return `обновлено ${Math.floor(hours / 24)} д назад`;
};

// "12 д", "2 д 5 ч", "7 ч", "35 мин"; null when the campaign has no end date
export const timeLeftLabel = (endIso: string | undefined, now: number): string | null => {
  if (!endIso) return null;
  const end = new Date(endIso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  if (ms <= 0) return 'закончилась';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} мин`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return days < 3 && restHours > 0 ? `${days} д ${restHours} ч` : `${days} д`;
};

export interface CampaignFacts {
  timeLeft: string | null; // until the campaign ends
  urgent: boolean; // less than a day left
  drops: string | null; // "3 дропа" / "всё получено" / "есть дропы"
  link: 'linked' | 'needs' | null;
}

export interface FactsOptions {
  trophies: TrophyItem[];
  linked: boolean; // the caller's answer, so the fact always matches the badge on the card
  now: number;
  smartMatch?: NameMatcher;
}

export const campaignFacts = (g: GameItem, opts: FactsOptions): CampaignFacts => {
  const end = g.drops_end_at ? new Date(g.drops_end_at).getTime() : NaN;
  const state = getCampaignState(g, opts.trophies, opts.smartMatch);
  let drops: string | null = null;
  if (state.kind === 'done') {
    drops = 'всё получено';
  } else if (state.kind === 'running' || state.kind === 'link') {
    const total = g.total_drops ?? g.rewards_count;
    drops = total ? `${state.remaining} ${dropsWord(state.remaining)}` : 'есть дропы';
  } else if (g.has_drops) {
    drops = 'есть дропы';
  }
  return {
    timeLeft: timeLeftLabel(g.drops_end_at, opts.now),
    urgent: !Number.isNaN(end) && end > opts.now && end - opts.now < 24 * 3600 * 1000,
    drops,
    link: g.has_drops ? (opts.linked ? 'linked' : 'needs') : null,
  };
};

const formatStamp = (iso: string): string | null => {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  // "1 нояб., 13:00" -> "1 нояб. 13:00", local time
  return new Date(at)
    .toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace(', ', ' ');
};

export interface CampaignDates {
  text: string; // "с 1 нояб. 13:00 · до 2 нояб. 12:29"
  startedRecently: boolean; // began less than 24 hours ago: the start is highlighted as "new"
}

// null when the campaign has no usable dates
export const campaignDatesLine = (startIso: string | undefined, endIso: string | undefined, now: number): CampaignDates | null => {
  const start = startIso ? formatStamp(startIso) : null;
  const end = endIso ? formatStamp(endIso) : null;
  if (!start && !end) return null;
  const startMs = startIso ? new Date(startIso).getTime() : NaN;
  return {
    text: [start ? `с ${start}` : null, end ? `до ${end}` : null].filter(Boolean).join(' · '),
    startedRecently: !Number.isNaN(startMs) && startMs <= now && now - startMs < 24 * 3600 * 1000,
  };
};
