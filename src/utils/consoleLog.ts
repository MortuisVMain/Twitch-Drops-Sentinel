import type { SentinelLogEntry } from '../types';

// Display-only compaction of the live console. The full journal stays untouched (Copy uses it).

export interface DisplayLog {
  log: SentinelLogEntry;
  count: number; // identical consecutive lines, or sync cycles for a folded sync block
  block?: SentinelLogEntry[]; // original lines of a folded synchronization block
}

export interface CollapseOptions {
  expandSync?: boolean; // show synchronization lines as they are (used by the "Core" filter)
}

const PROGRESS_RE = /^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)\s*$/;

// Stable prefixes of the periodic synchronization lines (Russian and English), numbers ignored
const SYNC_PATTERNS: RegExp[] = [
  /^Каталог собран/i,
  /^Синхронизация активных/i,
  /^Синхронизация завершена/i,
  /^Кампании обновлены/i,
  /^Раздачи Twitch синхронизированы/i,
  /^Получено живых кампаний/i,
  /^Built catalog/i,
  /^Syncing active/i,
  /^Sync complete/i,
  /^Campaigns refreshed/i,
];

// Only plain informational lines can belong to a sync block: claims, warnings, errors, streamer
// changes and anything else are never folded.
const FOLDABLE_LEVELS = new Set(['INFO', 'STATUS', '']);

const levelOf = (l: SentinelLogEntry): string => String(l.level || l.category || '');

const bareMessage = (l: SentinelLogEntry): string => String(l.message).replace(/^\s*(\[[A-Z]+\]\s*)+/, '').trim();

export const isSyncLine = (l: SentinelLogEntry): boolean =>
  FOLDABLE_LEVELS.has(levelOf(l).toUpperCase()) && SYNC_PATTERNS.some((re) => re.test(bareMessage(l)));

const lastNumber = (lines: SentinelLogEntry[], res: RegExp[]): number | null => {
  let found: number | null = null;
  for (const l of lines) {
    for (const re of res) {
      const m = re.exec(String(l.message));
      if (m) found = Number(m[1]);
    }
  }
  return found;
};

export const syncSummary = (lines: SentinelLogEntry[]): string => {
  const games = lastNumber(lines, [/Каталог собран:\s*(\d+)\s*игр/i, /размер каталога\s*(\d+)/i, /Built catalog with\s*(\d+)/i]);
  const campaigns = lastNumber(lines, [/активными дропами\s*(\d+)/i, /активных дропов\s*(\d+)/i, /(\d+)\s+активных кампаний/i, /\((\d+) with active drops\)/i]);
  const installed = lastNumber(lines, [/установлено игр\s*(\d+)/i, /(\d+)\s+installed games/i]);
  const parts: string[] = [];
  if (games !== null) parts.push(`${games} игр`);
  if (campaigns !== null) parts.push(`${campaigns} кампаний`);
  if (installed !== null) parts.push(`установлено ${installed}`);
  return parts.length ? `Синхронизация: ${parts.join(', ')}` : 'Синхронизация';
};

export const collapseLogs = (logs: SentinelLogEntry[], options: CollapseOptions = {}): DisplayLog[] => {
  // 1. progress lines "... (106/120)": only the latest one per prefix is kept
  const lastOfPrefix = new Map<string, number>();
  logs.forEach((l, i) => {
    const m = PROGRESS_RE.exec(String(l.message));
    if (m) lastOfPrefix.set(`${levelOf(l)}|${m[1]}`, i);
  });
  const kept = logs.filter((l, i) => {
    const m = PROGRESS_RE.exec(String(l.message));
    return !m || lastOfPrefix.get(`${levelOf(l)}|${m[1]}`) === i;
  });

  // 2. identical consecutive messages (time ignored) become one row with a counter
  const rows: DisplayLog[] = [];
  for (const l of kept) {
    const prev = rows[rows.length - 1];
    if (prev && levelOf(prev.log) === levelOf(l) && String(prev.log.message) === String(l.message)) {
      prev.count += 1;
      prev.log = l; // show the time of the latest repetition
    } else {
      rows.push({ log: l, count: 1 });
    }
  }
  if (options.expandSync) return rows;

  // 3. a run of consecutive synchronization lines becomes one summary row, "×N" = number of cycles
  const out: DisplayLog[] = [];
  let r = 0;
  while (r < rows.length) {
    if (!isSyncLine(rows[r].log)) {
      out.push(rows[r]);
      r += 1;
      continue;
    }
    let end = r;
    while (end < rows.length && isSyncLine(rows[end].log)) end += 1;
    const run = rows.slice(r, end);
    if (run.length < 2) {
      out.push(rows[r]);
    } else {
      const perType = new Map<string, number>();
      run.forEach((row) => {
        const key = bareMessage(row.log).split(/[:\d]/)[0].trim();
        perType.set(key, (perType.get(key) || 0) + row.count);
      });
      const cycles = Math.max(...Array.from(perType.values()));
      const lines = run.flatMap((row) => Array.from({ length: row.count }, () => row.log));
      const last = run[run.length - 1].log;
      out.push({ log: { ...last, level: 'INFO', message: syncSummary(lines) }, count: cycles, block: lines });
    }
    r = end;
  }
  return out;
};
