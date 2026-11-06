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

/** The row already shows the level: only a leading prefix naming that same level goes, other brackets stay. */
export const withoutLevelPrefix = (message: unknown, level: string): string => {
  const text = String(message);
  const escaped = level.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = text.replace(new RegExp(`^\\s*(\\[${escaped}\\]\\s*)+`, 'i'), '');
  return stripped || text;
};

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

export type ConsoleFilter = 'ALL' | 'WATCH' | 'CLAIM' | 'CORE';

/** Tray-icon chatter ("[TRAY] Icon: idle"): technical noise, kept only in the "Core" filter. */
export const isTrayLine = (l: SentinelLogEntry): boolean => /^\s*\[TRAY\]/i.test(String(l.message));

/** Lines the chosen console filter shows. The service logs [TRAY] lines at INFO level, so "Core" takes them by text. */
export const filterLogs = (logs: SentinelLogEntry[], filter: ConsoleFilter): SentinelLogEntry[] =>
  logs.filter((l) => {
    const cat = (l.level || l.category || '').toUpperCase();
    if (filter === 'CORE') return cat.includes('CORE') || cat.includes('SYS') || cat.includes('GUARD') || isTrayLine(l);
    if (isTrayLine(l)) return false;
    if (filter === 'WATCH') return cat.includes('WATCH') || cat.includes('STREAM');
    if (filter === 'CLAIM') return cat.includes('CLAIM') || cat.includes('DROP');
    return true;
  });

export const CONSOLE_COLLAPSED_KEY = 'sentinel_console_collapsed';

/** An explicit user choice ('1' collapsed, '0' expanded) always wins; with none (or junk) the console is collapsed while idle. */
export const resolveConsoleCollapsed = (stored: string | null, isIdle: boolean): boolean =>
  stored === '1' ? true : stored === '0' ? false : isIdle;

/** What the console holds, mirrored from core/gui_headless.py (LOG_HARD_CAP, LOG_RETENTION_SECONDS): at least 5 hours, a count cap as a safety net. */
export const CONSOLE_LOG_LIMIT = 5000;
export const CONSOLE_LOG_RETENTION_MS = 6 * 3600 * 1000;

/**
 * New lines from GET /api/logs go onto the end of what the console has. A line the service numbered at or below our last one is
 * ignored, a folded counter line (`replaces`) swaps the line it supersedes, `reset` (another service run) starts over.
 */
export const mergeConsoleLogs = (
  prev: SentinelLogEntry[],
  incoming: SentinelLogEntry[],
  reset: boolean,
  now: number = Date.now(),
): SentinelLogEntry[] => {
  const out = reset ? [] : prev.slice();
  for (const entry of incoming) {
    const lastSeq = out.length ? out[out.length - 1].seq ?? 0 : 0;
    if (entry.seq !== undefined && entry.seq <= lastSeq) continue;
    if (entry.replaces != null) {
      for (let i = out.length - 1; i >= 0 && i >= out.length - 50; i--) {
        if (out[i].seq === entry.replaces) {
          out.splice(i, 1);
          break;
        }
      }
    }
    out.push(entry);
  }
  const cutoff = (now - CONSOLE_LOG_RETENTION_MS) / 1000;
  let drop = Math.max(0, out.length - CONSOLE_LOG_LIMIT);
  while (drop < out.length && (out[drop].ts ?? Infinity) < cutoff) drop += 1;
  return drop ? out.slice(drop) : out;
};

/** Only the WebView2 host can open the log file; in a browser or the test fixture there is nothing to ask. */
export const hostCanOpenLogFile = (): boolean =>
  typeof (window as unknown as { chrome?: { webview?: { postMessage?: unknown } } }).chrome?.webview?.postMessage === 'function';

/** The host knows where the file is (next to the service); the page sends the request name and nothing else. */
export const openLogFile = (): void => {
  (window as unknown as { chrome: { webview: { postMessage: (m: unknown) => void } } }).chrome.webview.postMessage({ type: 'OPEN_LOG_FILE' });
};
