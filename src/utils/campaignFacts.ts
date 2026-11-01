import type { TrophyItem } from '../types';

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
  new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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
