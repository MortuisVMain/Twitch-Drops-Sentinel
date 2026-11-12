// Pure parsers for the Steam Community badges and games pages, requested with l=english (no browser, no network).

export class ParseError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

// decodes once: "&amp;amp;" becomes "&amp;"
export const decodeEntities = text => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, name) => {
  if (name) return NAMED[name.toLowerCase()] ?? whole;
  const code = dec ? Number(dec) : parseInt(hex, 16);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
});

const squash = text => decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const toNumber = text => Number(text.replace(/,/g, ''));

// "No card drops remaining" | "1 card drop remaining" | "<N> card drops remaining"; anything else is null
export const parseDropsText = text => {
  const t = typeof text == 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (/^no card drops remaining$/i.test(t)) return 0;
  if (/^1 card drop remaining$/i.test(t)) return 1;
  const m = /^([1-9][0-9,]*) card drops remaining$/i.exec(t);
  return m ? toNumber(m[1]) : null;
};

// "1,017 hrs on record" | "0.3 hrs on record"; anything else is null
export const parseHours = text => {
  const m = /(\d[\d,]*(?:\.\d+)?|\.\d+)\s*hrs?\s+on\s+record/i.exec(typeof text == 'string' ? text : '');
  return m ? toNumber(m[1]) : null;
};

const ROW_START = /class="badge_row[ "]/g;
const divText = (row, cls) => {
  const m = new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`).exec(row);
  return m ? m[1] : null;
};

const parseGameRow = row => {
  const appId = Number(/\/gamecards\/(\d+)/.exec(row)?.[1]);
  const name = /<div class="badge_title">([\s\S]*?)<span class="badge_view_details"/.exec(row)?.[1];
  const drops = /<div class="badge_title_stats_drops">[\s\S]*?<span class="progress_info_bold">([\s\S]*?)<\/span>/.exec(row)?.[1];
  const playtime = divText(row, 'badge_title_stats_playtime');
  const dropsRemaining = parseDropsText(drops === undefined ? null : squash(drops));
  const playtimeHours = playtime === null ? 0 : parseHours(squash(playtime));
  const cleanName = name === undefined ? '' : squash(name);
  if (!Number.isSafeInteger(appId) || appId <= 0 || !cleanName || dropsRemaining === null || playtimeHours === null) throw new ParseError('unparsed_row');
  return { appId, name: cleanName, dropsRemaining, playtimeHours };
};

export const hasNextPage = (html, n) => new RegExp(`[?&]p=${n + 1}(?![0-9])`).test(html);

// Game rows carry a /gamecards/ link; other badges (community, event) do not and are skipped, as are foil rows (?border=1).
export const parseBadgesPage = (html, page = 1) => {
  const starts = [...html.matchAll(ROW_START)].map(m => m.index);
  const rows = [];
  starts.forEach((start, i) => {
    const row = html.slice(start, starts[i + 1] ?? html.length);
    if (!row.includes('/gamecards/') || /\/gamecards\/\d+\/?\?[^"]*border=1/.test(row)) return;
    rows.push(parseGameRow(row));
  });
  return { rows, hasNext: hasNextPage(html, page) };
};

const isCount = value => Number.isSafeInteger(value) && value >= 0;

// The owned games are embedded as JSON: script#valve-ssr-data -> renderContext.queryData (a JSON string) -> queries[OwnedGames].state.data
export const parseLibrary = html => {
  let data;
  try {
    const script = /<script[^>]*id="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
    const queryData = JSON.parse(JSON.parse(script).renderContext.queryData);
    data = queryData.queries.find(q => q.queryKey?.[0] == 'OwnedGames')?.state?.data;
  } catch {
    throw new ParseError('library_unparsed');
  }
  if (!Array.isArray(data)) throw new ParseError('library_unparsed');
  const games = new Map();
  for (const g of data) {
    if (!g || !Number.isSafeInteger(g.appid) || g.appid <= 0 || typeof g.name != 'string' || !g.name || !isCount(g.playtime_forever)) throw new ParseError('library_unparsed');
    if (!games.has(g.appid)) games.set(g.appid, { appId: g.appid, name: g.name, playtimeMinutes: g.playtime_forever });
  }
  return [...games.values()].sort((a, b) => a.appId - b.appId);
};
