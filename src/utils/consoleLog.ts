import type { SentinelLogEntry } from '../types';

// Display-only compaction of the live console. The full journal stays untouched (Copy uses it).

export interface DisplayLog {
  log: SentinelLogEntry;
  count: number; // how many identical consecutive messages this row stands for
}

const PROGRESS_RE = /^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)\s*$/;

const levelOf = (l: SentinelLogEntry): string => String(l.level || l.category || '');

export const collapseLogs = (logs: SentinelLogEntry[]): DisplayLog[] => {
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
  const out: DisplayLog[] = [];
  for (const l of kept) {
    const prev = out[out.length - 1];
    if (prev && levelOf(prev.log) === levelOf(l) && String(prev.log.message) === String(l.message)) {
      prev.count += 1;
      prev.log = l; // show the time of the latest repetition
    } else {
      out.push({ log: l, count: 1 });
    }
  }
  return out;
};
