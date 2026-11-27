// The "service unavailable" check: reading the host's DIAGNOSTICS_RESULT message and picking an icon per status. Pure: no imports.
// Run: node --test tools/engine_tests/service_diagnostics_ui.test.mjs

const STATUSES = ['ok', 'warn', 'fail'];
/** The sections of the panel, in the order they are shown. */
export const AREA_ORDER = ['service', 'twitch', 'steam', 'giveaways', 'network', 'updates', 'settings', 'system'];

/** Status to an icon key and a class suffix; anything unknown is shown as a failure, never as success. */
export function statusView(status) {
  if (status === 'ok') return { icon: 'check', tone: 'ok' };
  if (status === 'warn') return { icon: 'alert', tone: 'warn' };
  return { icon: 'cross', tone: 'fail' };
}

const text = (v) => (typeof v === 'string' ? v : '');
const FIX_ID = /^[a-z0-9_]{1,40}$/;
/** The only fix the page carries out itself: it opens the sign-in page through the host and copies the code. */
const PAGE_FIX = 'twitch_open_code';

/** The row's fix, or null when its id is not a plain name or it has no label. */
function cleanFix(f) {
  if (!f || typeof f !== 'object' || !FIX_ID.test(text(f.id)) || !text(f.label)) return null;
  return { id: f.id, label: text(f.label), confirm: text(f.confirm) || null, client: f.client === true, uri: text(f.uri) || null, code: text(f.code) || null };
}

function cleanCheck(x) {
  const status = STATUSES.includes(x.status) ? x.status : (x.ok === true ? 'ok' : 'fail');
  return {
    id: x.id,
    status,
    area: AREA_ORDER.includes(x.area) ? x.area : 'service',
    title: text(x.title),
    detail: text(x.detail),
    advice: text(x.advice),
    action: x.action === 'close_other' ? 'close_other' : null,
    pid: Number.isInteger(x.pid) && x.pid > 0 ? x.pid : null,
    fix: cleanFix(x.fix),
  };
}

/** The host message made safe to render, or null when it is some other message. */
export function parseDiagnosticsMessage(data) {
  if (!data || typeof data !== 'object' || data.type !== 'DIAGNOSTICS_RESULT') return null;
  const checks = Array.isArray(data.checks)
    ? data.checks.filter((x) => x && typeof x === 'object' && typeof x.id === 'string').map(cleanCheck)
    : [];
  return { checks, report: text(data.report), error: typeof data.error === 'string' && data.error ? data.error : null };
}

/** The worst status of the list: fail, then warn, else ok. */
export function overallStatus(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

/** Rows grouped by area in the fixed order; an area without rows is left out. */
export function groupChecks(checks) {
  return AREA_ORDER
    .map((area) => ({ area, checks: checks.filter((c) => (AREA_ORDER.includes(c.area) ? c.area : 'service') === area) }))
    .filter((g) => g.checks.length > 0);
}

/** How many rows are failures and how many warnings. */
export function countProblems(checks) {
  return { fail: checks.filter((c) => c.status === 'fail').length, warn: checks.filter((c) => c.status === 'warn').length };
}

/** The page runs inside the WebView2 host only there the check can run. */
export function hostAvailable(win) {
  return Boolean(win && win.chrome && win.chrome.webview && typeof win.chrome.webview.postMessage === 'function');
}

/**
 * What pressing a fix button does, or null for nothing (a check or fix is already running, no fix, an id that is not a plain name).
 * confirm is the question to ask first (null for a harmless fix); messages go to the host; copy is the text to put on the clipboard.
 * The page sends only the fix id: the service decides what that id means, the host checks the address before opening it.
 */
export function planFix(fix, busy) {
  if (!fix || busy || typeof fix.id !== 'string' || !FIX_ID.test(fix.id)) return null;
  if (fix.id === PAGE_FIX) {
    if (fix.client !== true || !fix.uri) return null;
    return { confirm: null, messages: [{ type: 'OPEN_TWITCH_ACTIVATE', uri: fix.uri }], copy: fix.code || null };
  }
  if (fix.client === true) return null;
  return { confirm: fix.confirm || null, messages: [{ type: 'HEALTH_FIX', id: fix.id }], copy: null };
}

/** The host's FIX_RESULT message made safe to render, or null when it is some other message. */
export function parseFixResult(data) {
  if (!data || typeof data !== 'object' || data.type !== 'FIX_RESULT' || typeof data.id !== 'string') return null;
  const ok = data.ok === true;
  return { id: data.id, ok, message: text(data.message), restart: ok && data.restart === true };
}

/** The notice belongs to a row when that row offers the fix it is about. */
export function noticeFor(check, notice) {
  return Boolean(notice && check && check.fix && check.fix.id === notice.id);
}

/** True when no row offers the fix any more (it worked), so the notice is shown on its own. */
export function noticeOrphan(checks, notice) {
  return Boolean(notice) && !checks.some((c) => noticeFor(c, notice));
}

/** The app restart is offered after a fix that worked and takes effect only after one. */
export function restartOffered(notice) {
  return Boolean(notice && notice.ok && notice.restart);
}

/** Every button of the panel waits while a check runs or any fix is in progress. */
export function controlsBusy(running, fixing) {
  return Boolean(running || fixing);
}
