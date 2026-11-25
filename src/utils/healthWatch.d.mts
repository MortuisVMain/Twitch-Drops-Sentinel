export interface HealthWatchOption { value: 1 | 4 | 12 | 24; label: string }
export interface HealthWatchState { enabled: boolean; hours: number; problems: number; lastRun: number | null }
export const HEALTH_WATCH_OPTIONS: readonly HealthWatchOption[];
export function healthWatchOptions(): readonly HealthWatchOption[];
export function healthWatchHours(settings: { health_watch_hours?: unknown } | undefined): number;
export function healthWatchEnabled(settings: { health_watch_enabled?: unknown } | undefined): boolean;
export function healthWatchDot(watch: unknown): { show: boolean; count: number };
