// Pure helpers of the background health watch: what the menu button shows and which intervals the settings offer.
// Mirrors core/health_watch.py (intervals 1/4/12/24 hours, default 1, switch default on).

export const HEALTH_WATCH_OPTIONS = [
  { value: 1, label: 'раз в 1 час' },
  { value: 4, label: 'раз в 4 часа' },
  { value: 12, label: 'раз в 12 часов' },
  { value: 24, label: 'раз в сутки' },
];

const DEFAULT_HOURS = 1;
const MAX_SHOWN = 99;

export function healthWatchOptions() {
  return HEALTH_WATCH_OPTIONS;
}

export function healthWatchHours(settings) {
  const value = settings && settings.health_watch_hours;
  return HEALTH_WATCH_OPTIONS.some((o) => o.value === value) ? value : DEFAULT_HOURS;
}

export function healthWatchEnabled(settings) {
  const value = settings && settings.health_watch_enabled;
  return typeof value === 'boolean' ? value : true;
}

/** The dot on the "⋯" button and the count on its "Проверка работы" item: only while the watch is on and problems were found. */
export function healthWatchDot(watch) {
  const none = { show: false, count: 0 };
  if (!watch || typeof watch !== 'object' || watch.enabled !== true) return none;
  const n = watch.problems;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return none;
  return { show: true, count: Math.min(Math.floor(n), MAX_SHOWN) };
}
