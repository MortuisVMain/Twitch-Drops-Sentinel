// View logic of the Steam IDLE statistics (the service does the counting, GET /api/v1/steam-idle/stats).
// Pure functions, tested in tools/engine_tests/steam_idle_stats.test.mjs.

const PERIODS = ['7', '30', 'all'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isRec = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// The answer of the service, or null when it does not match the contract.
export function parseStats(json) {
  if (!isRec(json) || !PERIODS.includes(json.period) || !isRec(json.totals)) return null;
  const t = json.totals;
  if (!['farmSeconds', 'games', 'cards', 'achievements'].every((k) => isNum(t[k]))) return null;
  if (!Array.isArray(json.weeks) || !json.weeks.every((w) => isRec(w) && typeof w.weekStart === 'string'
    && isNum(w.farmSeconds) && isNum(w.cards) && isNum(w.achievements))) return null;
  if (!Array.isArray(json.games) || !json.games.every((g) => isRec(g) && isNum(g.appId) && typeof g.name === 'string'
    && ['farmSeconds', 'cardsDropped', 'achievements', 'firstAt', 'lastAt'].every((k) => isNum(g[k])))) return null;
  return json;
}

// seconds -> hours with one decimal at most
export const farmHours = (seconds) => Math.round(seconds / 360) / 10;

export function periodTotals(stats) {
  const t = stats?.totals;
  return { hours: t ? farmHours(t.farmSeconds) : 0, games: t?.games ?? 0, cards: t?.cards ?? 0, achievements: t?.achievements ?? 0 };
}

// bars scaled to the busiest week by farm time (an all-empty history stays flat)
export function weekBars(weeks) {
  const peak = Math.max(0, ...weeks.map((w) => w.farmSeconds));
  return weeks.map((w) => ({ weekStart: w.weekStart, hours: farmHours(w.farmSeconds), cards: w.cards, achievements: w.achievements,
    height: peak === 0 ? 0 : Math.round((w.farmSeconds / peak) * 100) }));
}

const SORT_FIELDS = { time: 'farmSeconds', cards: 'cardsDropped', achievements: 'achievements', last: 'lastAt' };

export function sortGames(games, key, dir) {
  const field = SORT_FIELDS[key];
  const sign = dir === 'asc' ? 1 : -1;
  return [...games].sort((a, b) => sign * (a[field] - b[field]) || a.name.localeCompare(b.name));
}

export const nextSort = (current, key) => (current.key === key ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });

const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // a spreadsheet never runs a cell as a formula
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const stamp = (seconds, timeZone) => (seconds > 0 ? new Date(seconds * 1000).toLocaleString('sv-SE', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');

// semicolon-separated (Excel in RU/EU locales), UTF-8 with BOM so Cyrillic opens right; times in local time
export function gamesCsv(games, timeZone) {
  const rows = [['Игра', 'App ID', 'Часы', 'Карточки', 'Достижения', 'Первый раз', 'Последний раз']];
  for (const g of games) rows.push([g.name, g.appId, farmHours(g.farmSeconds), g.cardsDropped, g.achievements, stamp(g.firstAt, timeZone), stamp(g.lastAt, timeZone)]);
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
