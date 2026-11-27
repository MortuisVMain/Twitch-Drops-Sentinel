export type StatsPeriod = '7' | '30' | 'all';
export interface StatsTotals { farmSeconds: number; games: number; cards: number; achievements: number }
export interface StatsWeek { weekStart: string; farmSeconds: number; cards: number; achievements: number }
export interface StatsGame { appId: number; name: string; farmSeconds: number; cardsDropped: number; achievements: number; firstAt: number; lastAt: number }
export interface IdleStats { period: StatsPeriod; totals: StatsTotals; weeks: StatsWeek[]; games: StatsGame[] }
export type SortKey = 'time' | 'cards' | 'achievements' | 'last';
export interface SortState { key: SortKey; dir: 'asc' | 'desc' }
export function parseStats(json: unknown): IdleStats | null;
export function farmHours(seconds: number): number;
export function periodTotals(stats: IdleStats | null | undefined): { hours: number; games: number; cards: number; achievements: number };
export function weekBars(weeks: readonly StatsWeek[]): Array<{ weekStart: string; hours: number; cards: number; achievements: number; height: number }>;
export function sortGames(games: readonly StatsGame[], key: SortKey, dir: 'asc' | 'desc'): StatsGame[];
export function nextSort(current: SortState, key: SortKey): SortState;
export function gamesCsv(games: readonly StatsGame[], timeZone?: string): string;
