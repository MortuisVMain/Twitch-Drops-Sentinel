// The page sends the per-launch secret to the local service. Run: node --test tools/engine_tests/service_auth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { installServiceAuth, withServiceToken, TOKEN_HEADER } = await import(pathToFileURL(path.join(ROOT, 'src', 'utils', 'serviceAuth.mjs')).href);

const SERVICE = 'http://127.0.0.1:28492';
const TOKEN = 'dGVzdC10b2tlbi1fLQ';

/** A window with a recording fetch; the token is optional. */
function fakeWindow(token) {
  const calls = [];
  const win = { fetch: async (input, init) => { calls.push({ input, init }); return { ok: true }; } };
  if (token !== undefined) win.__SENTINEL_TOKEN = token;
  return { win, calls };
}
const headerOf = (call) => (call.input instanceof Request && !call.init ? call.input.headers : new Request(call.input, call.init).headers);

test('the header name is the one the service checks', () => {
  assert.equal(TOKEN_HEADER, 'X-Sentinel-Token');
});

test('a service request gets the header (string, URL and Request forms)', async () => {
  const { win, calls } = fakeWindow(TOKEN);
  installServiceAuth(win);
  await win.fetch(`${SERVICE}/api/state`);
  await win.fetch(new URL(`${SERVICE}/api/state`));
  await win.fetch(new Request(`${SERVICE}/api/state`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }));
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(headerOf(call).get('x-sentinel-token'), TOKEN);
  assert.equal(headerOf(calls[2]).get('content-type'), 'application/json', 'a Request keeps its own headers');
  assert.equal(calls[2].input.method, 'POST', 'and its method');
});

test('caller headers survive as a plain object, a Headers object and an array', async () => {
  const { win, calls } = fakeWindow(TOKEN);
  installServiceAuth(win);
  await win.fetch(`${SERVICE}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await win.fetch(`${SERVICE}/api/settings`, { method: 'POST', headers: new Headers({ 'Content-Type': 'text/plain' }), body: '{}' });
  await win.fetch(`${SERVICE}/api/settings`, { method: 'POST', headers: [['Content-Type', 'application/x-test']], body: '{}' });
  const types = calls.map((call) => headerOf(call).get('content-type'));
  assert.deepEqual(types, ['application/json', 'text/plain', 'application/x-test']);
  for (const call of calls) {
    assert.equal(headerOf(call).get('x-sentinel-token'), TOKEN);
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.body, '{}');
  }
});

test('the caller headers object is never mutated', async () => {
  const { win } = fakeWindow(TOKEN);
  installServiceAuth(win);
  const mine = { Accept: 'application/json' };
  await win.fetch(`${SERVICE}/api/state`, { headers: mine });
  assert.deepEqual(mine, { Accept: 'application/json' });
});

test('other addresses never get the secret', async () => {
  const { win, calls } = fakeWindow(TOKEN);
  installServiceAuth(win);
  await win.fetch('https://example.com/api/state');
  await win.fetch('http://127.0.0.1:28493/api/state');
  await win.fetch('http://127.0.0.1:28492.evil.example/api/state');
  await win.fetch('http://localhost:28492/api/state');
  await win.fetch('/api/state');
  assert.equal(calls.length, 5);
  for (const call of calls) assert.equal(call.init, undefined, `untouched: ${call.input}`);
});

test('without a token nothing is added and fetch is left alone', async () => {
  const { win, calls } = fakeWindow();
  const original = win.fetch;
  installServiceAuth(win);
  assert.equal(win.fetch, original, 'no wrapper when there is no token');
  await win.fetch(`${SERVICE}/api/state`);
  assert.equal(calls[0].init, undefined);
  const empty = fakeWindow('');
  installServiceAuth(empty.win);
  await empty.win.fetch(`${SERVICE}/api/state`);
  assert.equal(empty.calls[0].init, undefined, 'an empty token counts as none');
});

test('installing twice wraps once', async () => {
  const { win, calls } = fakeWindow(TOKEN);
  installServiceAuth(win);
  const wrapped = win.fetch;
  installServiceAuth(win);
  assert.equal(win.fetch, wrapped);
  await win.fetch(`${SERVICE}/api/state`);
  assert.equal(calls.length, 1);
});

test('withServiceToken appends the token to a URL with and without a query', () => {
  const win = { __SENTINEL_TOKEN: TOKEN };
  assert.equal(withServiceToken('ws://127.0.0.1:28492/ws', win), `ws://127.0.0.1:28492/ws?token=${TOKEN}`);
  assert.equal(withServiceToken(`${SERVICE}/api/v1/giveaways/stream?after=5`, win), `${SERVICE}/api/v1/giveaways/stream?after=5&token=${TOKEN}`);
  assert.equal(withServiceToken('ws://127.0.0.1:28492/ws', { __SENTINEL_TOKEN: 'a+b/c=' }), 'ws://127.0.0.1:28492/ws?token=a%2Bb%2Fc%3D', 'the value is escaped');
});

test('withServiceToken leaves the URL alone when there is no token', () => {
  assert.equal(withServiceToken('ws://127.0.0.1:28492/ws', {}), 'ws://127.0.0.1:28492/ws');
  assert.equal(withServiceToken('ws://127.0.0.1:28492/ws', { __SENTINEL_TOKEN: '' }), 'ws://127.0.0.1:28492/ws');
});
