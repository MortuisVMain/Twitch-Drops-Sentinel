export type HistorySource = 'twitch' | 'giveaway';
export interface HistoryItem { id: string; source: HistorySource; at: number; title: string; detail: string }
export interface HistoryCounts { twitch: number; giveaway: number }
export function parseWhen(value: unknown): number;
export function buildHistory(trophies: readonly { id: string; date: string; game: string; drop_name: string; campaign: string }[] | undefined,
  giveaways: readonly { id: string; status: string; title: string; store: string; claimedAt: string; timestampMs: number }[] | undefined): HistoryItem[];
export function historyTotals(items: readonly HistoryItem[], now: number): { week: HistoryCounts; month: HistoryCounts; all: HistoryCounts };
export function weeklyBuckets(items: readonly HistoryItem[], now: number, count?: number): Array<{ start: number } & HistoryCounts>;
export function historyCsv(items: readonly HistoryItem[]): string;
