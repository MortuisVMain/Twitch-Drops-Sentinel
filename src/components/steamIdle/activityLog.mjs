// Pure pieces of the Steam IDLE log panel, kept apart from React so node --test can run them.

export const LOG_CAP = 500;
const LEVELS = ['info', 'warning', 'error'];
const pad = (n) => String(n).padStart(2, '0');

const isEntry = (e) => typeof e === 'object' && e !== null && Number.isInteger(e.seq) && typeof e.ts === 'string'
  && LEVELS.includes(e.level) && typeof e.text === 'string';

/** The service answer of GET /log, or null when it does not match the contract. */
export function parseLogReply(json) {
  if (typeof json !== 'object' || json === null || !Array.isArray(json.entries) || !Number.isInteger(json.lastSeq)) return null;
  return json.entries.every(isEntry) ? { entries: json.entries, lastSeq: json.lastSeq } : null;
}

/** `prev` plus the entries of `incoming` newer than its last one, the newest LOG_CAP kept. */
export function mergeEntries(prev, incoming, cap = LOG_CAP) {
  const last = prev.length ? prev[prev.length - 1].seq : -1;
  const merged = [...prev, ...incoming.filter((e) => e.seq > last)];
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/** HH:MM:SS in local time. */
export function clockTime(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '--:--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** One line on what the farm and the achievements run are doing, for a bug report. */
export function farmStateLine(farm, achievementsRun) {
  const parts = [farm.state];
  if (farm.phase) parts.push(`phase ${farm.phase}`);
  if (farm.current) parts.push(`holding ${farm.current.name} (${farm.current.appId})`);
  if (farm.batch && farm.batch.length) parts.push(`${farm.batch.length} games in the batch`);
  if (farm.lastError) parts.push(`last error ${farm.lastError}`);
  return `Farm: ${parts.join(', ')}${achievementsRun ? `; achievements: ${achievementsRun.state}` : ''}`;
}

/** The text Copy puts on the clipboard: a header, the state line and every entry as `HH:MM:SS LEVEL text`. */
export function copyReport({ appVersion, now, state, entries }) {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const header = `Hell Harvest${appVersion ? ` v${appVersion}` : ''} — Steam IDLE log — ${stamp}`;
  return [header, state, ...entries.map((e) => `${clockTime(e.ts)} ${e.level.toUpperCase()} ${e.text}`)].join('\n');
}
