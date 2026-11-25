// Pure helpers of the health center: the header button, the sections and their keys, the hotkey, the last-check time, the history list.
// Run: node --test tools/engine_tests/health_center.test.mjs

const MAX_BADGE = 99;
const MAX_HISTORY = 20;

/** The four sections of the center, in the order they are shown. */
export const SECTIONS = [
  { id: 'summary', label: 'Сводка' },
  { id: 'checks', label: 'Проверки' },
  { id: 'developer', label: 'Для разработчика' },
  { id: 'maintenance', label: 'Обслуживание' },
];

const count = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/**
 * The header button from the service's health_watch state: neutral while the state is unknown, the watch is off or nothing is wrong,
 * amber with warnings only, rose with the number of failures as a badge. label (aria-label) and title describe the state.
 */
export function healthButtonView(watch) {
  const known = watch && typeof watch === 'object' && watch.enabled === true;
  const problems = known ? count(watch.problems) : 0;
  const fails = Math.min(known ? count(watch.fails) : 0, problems);
  const hint = ' (Ctrl+Shift+H)';
  if (fails > 0) {
    const badge = Math.min(fails, MAX_BADGE);
    return { tone: 'rose', badge, label: `Центр проверки: проблем ${badge}`, title: `Центр проверки: найдено проблем ${badge}${hint}` };
  }
  if (problems > 0) {
    return { tone: 'amber', badge: null, label: 'Центр проверки: есть предупреждения', title: `Центр проверки: есть предупреждения${hint}` };
  }
  return { tone: 'neutral', badge: null, label: 'Центр проверки', title: `Центр проверки${hint}` };
}

/** The section the arrow keys, Home or End lead to; null for any other key. An unknown current section counts as the first. */
export function nextSection(current, key) {
  const ids = SECTIONS.map((s) => s.id);
  const at = Math.max(0, ids.indexOf(current));
  if (key === 'ArrowRight' || key === 'ArrowDown') return ids[(at + 1) % ids.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return ids[(at + ids.length - 1) % ids.length];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

/** Ctrl+Shift+H (Cmd on a Mac). The physical key is checked, so a Russian layout works too. */
export function isHealthHotkey(e) {
  return Boolean(e && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyH');
}

const epoch = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Epoch seconds of the newest check, background or manual, or null when none ran. */
export function lastCheckTime(watch) {
  if (!watch || typeof watch !== 'object') return null;
  const times = [epoch(watch.lastRun), epoch(watch.lastManual)].filter((t) => t !== null);
  return times.length ? Math.max(...times) : null;
}

/** Epoch seconds as a local date and time ('' for none). zone is for tests; the app leaves it out. */
export function formatLocalTime(seconds, locale, zone) {
  const at = epoch(seconds);
  if (at === null) return '';
  return new Date(at * 1000).toLocaleString(locale || undefined, { dateStyle: 'short', timeStyle: 'short', ...(zone ? { timeZone: zone } : {}) });
}

const STATUS_OK = ['ok', 'warn', 'fail'];

/** The service's history answer made safe to render: well-formed events only, at most 20, as given (newest first). */
export function parseHistory(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return [];
  const events = [];
  for (const e of data.events) {
    if (!e || typeof e !== 'object') continue;
    if (typeof e.time !== 'number' || !Number.isFinite(e.time) || (e.event !== 'found' && e.event !== 'fixed') || !STATUS_OK.includes(e.status)) continue;
    if (typeof e.checkId !== 'string' || typeof e.area !== 'string' || typeof e.title !== 'string') continue;
    events.push({ time: e.time, checkId: e.checkId, area: e.area, title: e.title, status: e.status, event: e.event });
    if (events.length === MAX_HISTORY) break;
  }
  return events;
}

const EXPORT_KINDS = ['report', 'logs', 'issue'];

/** The host's answer to a save report, collect logs or report a problem request, or null when it is some other message. */
export function parseExportResult(data) {
  if (!data || typeof data !== 'object' || data.type !== 'HEALTH_EXPORT_RESULT' || !EXPORT_KINDS.includes(data.kind)) return null;
  return { kind: data.kind, ok: data.ok === true, message: typeof data.message === 'string' ? data.message : '' };
}

/** The host asks the page to show the center (a click on the toast). */
export function isOpenCenterMessage(data) {
  return Boolean(data && typeof data === 'object' && data.type === 'OPEN_HEALTH_CENTER');
}
