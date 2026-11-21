// One history of what the app brought in: Twitch drops (Trophies.md) and claimed free games (giveaways inventory).
// Pure functions, tested in tools/engine_tests/history.test.mjs.

const DAY = 24 * 3600 * 1000;

// "2026-11-21 13:05" (local time, Trophies.md) or an ISO string -> ms; NaN when unreadable
export function parseWhen(value) {
  const text = String(value ?? '').trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
  if (local) {
    const [, y, mo, d, h = '0', mi = '0'] = local;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
  }
  return Date.parse(text);
}

// items: { id, source: 'twitch' | 'giveaway', at (ms), title, detail }, newest first; unreadable dates are dropped
export function buildHistory(trophies, giveaways) {
  const items = [];
  for (const t of Array.isArray(trophies) ? trophies : []) {
    const at = parseWhen(t?.date);
    if (!Number.isFinite(at)) continue;
    items.push({ id: `tw:${t.id}`, source: 'twitch', at, title: String(t.game ?? ''), detail: [t.drop_name, t.campaign].filter(Boolean).join(' · ') });
  }
  for (const g of Array.isArray(giveaways) ? giveaways : []) {
    if (g?.status !== 'claimed') continue; // "existed" was already owned: nothing new came in
    const at = Number.isFinite(g.timestampMs) && g.timestampMs > 0 ? g.timestampMs : parseWhen(g.claimedAt);
    if (!Number.isFinite(at) || at <= 0) continue;
    items.push({ id: `ga:${g.id}`, source: 'giveaway', at, title: String(g.title ?? ''), detail: String(g.store ?? '') });
  }
  return items.sort((a, b) => b.at - a.at);
}

// counts per source for the last 7 and 30 days and all time
export function historyTotals(items, now) {
  const blank = () => ({ twitch: 0, giveaway: 0 });
  const totals = { week: blank(), month: blank(), all: blank() };
  for (const item of items) {
    totals.all[item.source]++;
    if (item.at > now - 30 * DAY) totals.month[item.source]++;
    if (item.at > now - 7 * DAY) totals.week[item.source]++;
  }
  return totals;
}

// the last `count` weeks (Monday-based, local time), oldest first: { start (ms), twitch, giveaway }
export function weeklyBuckets(items, now, count = 8) {
  const today = new Date(now);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const buckets = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i).getTime();
    buckets.push({ start, twitch: 0, giveaway: 0 });
  }
  const first = buckets[0].start;
  for (const item of items) {
    if (item.at < first || item.at > now) continue;
    let idx = buckets.length - 1;
    while (idx > 0 && item.at < buckets[idx].start) idx--;
    buckets[idx][item.source]++;
  }
  return buckets;
}

const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // a spreadsheet never runs a cell as a formula
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// semicolon-separated (Excel in RU/EU locales), UTF-8 with BOM so Cyrillic opens right
export function historyCsv(items) {
  const rows = [['Дата', 'Источник', 'Название', 'Подробности']];
  for (const item of items) {
    const d = new Date(item.at);
    const pad = (n) => String(n).padStart(2, '0');
    const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    rows.push([when, item.source === 'twitch' ? 'Twitch' : 'Раздача', item.title, item.detail]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
