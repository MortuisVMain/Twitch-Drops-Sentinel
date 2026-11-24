// The "service unavailable" check: reading the host's DIAGNOSTICS_RESULT message and picking an icon per status. Pure: no imports.
// Run: node --test tools/engine_tests/service_diagnostics_ui.test.mjs

const STATUSES = ['ok', 'warn', 'fail'];

/** Status to an icon key and a class suffix; anything unknown is shown as a failure, never as success. */
export function statusView(status) {
  if (status === 'ok') return { icon: 'check', tone: 'ok' };
  if (status === 'warn') return { icon: 'alert', tone: 'warn' };
  return { icon: 'cross', tone: 'fail' };
}

const text = (v) => (typeof v === 'string' ? v : '');

function cleanCheck(x) {
  const status = STATUSES.includes(x.status) ? x.status : (x.ok === true ? 'ok' : 'fail');
  return {
    id: x.id,
    status,
    title: text(x.title),
    detail: text(x.detail),
    advice: text(x.advice),
    action: x.action === 'close_other' ? 'close_other' : null,
    pid: Number.isInteger(x.pid) && x.pid > 0 ? x.pid : null,
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

/** The page runs inside the WebView2 host only there the check can run. */
export function hostAvailable(win) {
  return Boolean(win && win.chrome && win.chrome.webview && typeof win.chrome.webview.postMessage === 'function');
}
