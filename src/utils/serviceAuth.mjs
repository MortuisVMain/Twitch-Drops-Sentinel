// The per-launch secret of the local service. The desktop host puts it on the page as window.__SENTINEL_TOKEN (only on the app's own origin);
// this wraps fetch once so every request to the service carries it. Without a token (dev server, UI harness) nothing changes.
export const TOKEN_HEADER = 'X-Sentinel-Token';
const SERVICE_PREFIX = 'http://127.0.0.1:28492/';

const tokenOf = (win) => (typeof win.__SENTINEL_TOKEN === 'string' && win.__SENTINEL_TOKEN ? win.__SENTINEL_TOKEN : null);

const addressOf = (input) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input && typeof input.url === 'string' ? input.url : '');

/** Appends ?token= (or &token=) for the WebSocket and EventSource, which cannot send headers. */
export function withServiceToken(url, win = globalThis) {
  const token = tokenOf(win);
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

/** Wraps win.fetch once. A Request keeps its own headers; init.headers (any of the three forms) replace them as fetch itself does. */
export function installServiceAuth(win = window) {
  const token = tokenOf(win);
  if (!token || typeof win.fetch !== 'function' || win.fetch.__sentinelAuth) return;
  const original = win.fetch.bind(win);
  const wrapped = (input, init) => {
    if (!addressOf(input).startsWith(SERVICE_PREFIX)) return original(input, init);
    const headers = new Headers(init && init.headers !== undefined ? init.headers : input instanceof Request ? input.headers : undefined);
    headers.set(TOKEN_HEADER, token);
    if (input instanceof Request) return original(new Request(input, { ...init, headers }));
    return original(input, { ...init, headers });
  };
  wrapped.__sentinelAuth = true;
  win.fetch = wrapped;
}
