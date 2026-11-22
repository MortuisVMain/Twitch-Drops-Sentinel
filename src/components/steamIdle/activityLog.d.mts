export interface ActivityEntry { seq: number; ts: string; level: 'info' | 'warning' | 'error'; text: string }
export const LOG_CAP: number;
export function parseLogReply(json: unknown): { entries: ActivityEntry[]; lastSeq: number } | null;
export function mergeEntries(prev: ActivityEntry[], incoming: ActivityEntry[], cap?: number): ActivityEntry[];
export function clockTime(ts: string): string;
export function farmStateLine(
  farm: { state: string; phase?: string | null; current: { appId: number; name: string } | null; batch?: unknown[]; lastError: string | null },
  achievementsRun: { state: string } | undefined,
): string;
export function copyReport(args: { appVersion: string | undefined; now: Date; state: string; entries: ActivityEntry[] }): string;
