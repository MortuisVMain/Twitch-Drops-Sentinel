// The browser for sign-in and claims is the user's choice: Chrome, Edge or the bundled Chromium, or "auto" (the old behaviour).
// An explicit choice is never replaced by another browser; every browser has its own profile and its own record of sign-ins.
// Every browser here is a stub: no real browser is started, no store is opened.
// Run: node --test tools/engine_tests/browser_choice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE = path.join(ROOT, 'giveaways_engine');
const load = file => import(pathToFileURL(path.join(ENGINE, 'src', file)).href);
const choice = await load('browser_choice.js');
const { launchContext } = await load('browser.js');
await load('util.js'); // util.js first: config.js and util.js import each other and only this order initializes
const { cfg } = await load('config.js');

const missing = name => new Error(`browserType.launchPersistentContext: Chromium distribution '${name}' is not installed.\nRun "npx patchright install ${name}"`);
const noBinary = () => new Error("browserType.launchPersistentContext: Executable doesn't exist at C:\\x\\chrome.exe");
const recorder = failures => {
  const calls = [];
  const launch = async opts => {
    calls.push(opts.channel ?? 'bundled');
    const fail = failures[opts.channel ?? 'bundled'];
    if (fail) throw (typeof fail === 'function' ? fail() : fail);
    return { launchedWith: opts.channel ?? 'bundled' };
  };
  return { calls, launch };
};
const run = (browser, failures, { platform = 'win32', options = { channel: 'chrome' } } = {}) => {
  const rec = recorder(failures);
  const lines = [];
  let installs = 0;
  const install = async () => { installs++; delete failures.bundled; };
  const log = { log: s => lines.push(s), warn: s => lines.push(s), error: s => lines.push(s) };
  const promise = choice.launchWithPolicy({ launch: rec.launch, options: { ...options }, browser, platform, install, log });
  return { rec, lines, promise, installs: () => installs };
};

test('resolveBrowserChoice: auto when the value is missing or empty, the four known values as is, anything else is auto and reported', () => {
  assert.deepEqual(choice.resolveBrowserChoice({}), { browser: 'auto', invalid: null });
  assert.deepEqual(choice.resolveBrowserChoice({ FGC_BROWSER: '' }), { browser: 'auto', invalid: null });
  assert.deepEqual(choice.resolveBrowserChoice({ FGC_BROWSER: '  ' }), { browser: 'auto', invalid: null });
  for (const id of ['auto', 'chrome', 'msedge', 'chromium']) {
    assert.deepEqual(choice.resolveBrowserChoice({ FGC_BROWSER: id }), { browser: id, invalid: null });
  }
  assert.equal(choice.resolveBrowserChoice({ FGC_BROWSER: ' MSEDGE ' }).browser, 'msedge');
  for (const bad of ['firefox', 'brave', 'edge', 'yandex', '1', 'chrome;calc']) {
    assert.deepEqual(choice.resolveBrowserChoice({ FGC_BROWSER: bad }), { browser: 'auto', invalid: bad });
  }
});

test('profiles: chrome and auto keep data/browser, the others get their own folder, BROWSER_DIR wins over all', () => {
  const dataDir = name => path.join('D', 'data', name);
  const dirOf = env => choice.profileDir(env, dataDir);
  assert.equal(dirOf({}), path.join('D', 'data', 'browser'));
  assert.equal(dirOf({ FGC_BROWSER: 'auto' }), path.join('D', 'data', 'browser'));
  assert.equal(dirOf({ FGC_BROWSER: 'chrome' }), path.join('D', 'data', 'browser'));
  assert.equal(dirOf({ FGC_BROWSER: 'msedge' }), path.join('D', 'data', 'browser-msedge'));
  assert.equal(dirOf({ FGC_BROWSER: 'chromium' }), path.join('D', 'data', 'browser-chromium'));
  assert.equal(dirOf({ FGC_BROWSER: 'bogus' }), path.join('D', 'data', 'browser'), 'an invalid value is auto');
  assert.equal(dirOf({ FGC_BROWSER: 'msedge', BROWSER_DIR: 'X:\\mine' }), 'X:\\mine');
  assert.equal(dirOf({ BROWSER_DIR: 'X:\\mine' }), 'X:\\mine');
});

test('sign-in records: the existing file belongs to chrome and auto, the other browsers get a file of their own', () => {
  assert.equal(choice.sessionsFileName('auto'), 'sessions.json');
  assert.equal(choice.sessionsFileName('chrome'), 'sessions.json');
  assert.equal(choice.sessionsFileName('msedge'), 'sessions-msedge.json');
  assert.equal(choice.sessionsFileName('chromium'), 'sessions-chromium.json');
});

test('explicit chrome that is not installed: one attempt, no Edge, no bundled build, a clear line that names it', async () => {
  const r = run('chrome', { chrome: missing('chrome') });
  await assert.rejects(r.promise, error => error instanceof choice.BrowserUnavailableError && /Google Chrome/.test(error.message));
  assert.deepEqual(r.rec.calls, ['chrome'], 'nothing else may be launched');
  const text = r.lines.join('\n');
  assert.match(text, /Google Chrome/);
  assert.match(text, /Проверить готовность/);
  assert.doesNotMatch(text, /Falling back|fallback/i);
});

test('explicit msedge that is not installed: one attempt with msedge, never chrome or bundled', async () => {
  const r = run('msedge', { msedge: missing('msedge') });
  await assert.rejects(r.promise, choice.BrowserUnavailableError);
  assert.deepEqual(r.rec.calls, ['msedge']);
  assert.match(r.lines.join('\n'), /Microsoft Edge/);
});

test('an explicit choice overrides the channel the store script asks for', async () => {
  for (const browser of ['chrome', 'msedge']) {
    const r = run(browser, {}, { options: { channel: 'chrome' } });
    await r.promise;
    assert.deepEqual(r.rec.calls, [browser]);
  }
});

test('explicit chrome that fails for another reason keeps that error: it is not reported as missing', async () => {
  const locked = new Error('browserType.launchPersistentContext: profile is locked by another process');
  const r = run('chrome', { chrome: locked });
  await assert.rejects(r.promise, error => error === locked);
  assert.deepEqual(r.rec.calls, ['chrome']);
});

test('auto keeps the old fallback: chrome, then Edge, then the bundled Chromium (and downloads it when it is absent)', async () => {
  let r = run('auto', { chrome: missing('chrome') });
  assert.equal((await r.promise).launchedWith, 'msedge');
  assert.deepEqual(r.rec.calls, ['chrome', 'msedge']);

  r = run('auto', { chrome: missing('chrome'), msedge: missing('msedge') });
  assert.equal((await r.promise).launchedWith, 'bundled');
  assert.deepEqual(r.rec.calls, ['chrome', 'msedge', 'bundled']);
  assert.equal(r.installs(), 0);

  r = run('auto', { chrome: missing('chrome'), msedge: missing('msedge'), bundled: noBinary() });
  assert.equal((await r.promise).launchedWith, 'bundled');
  assert.deepEqual(r.rec.calls, ['chrome', 'msedge', 'bundled', 'bundled']);
  assert.equal(r.installs(), 1);

  r = run('auto', { chrome: missing('chrome') }, { platform: 'linux' });
  assert.equal((await r.promise).launchedWith, 'bundled');
  assert.deepEqual(r.rec.calls, ['chrome', 'bundled'], 'Edge is tried on Windows only');

  r = run('auto', {});
  assert.equal((await r.promise).launchedWith, 'chrome');
  assert.deepEqual(r.rec.calls, ['chrome']);
});

test('chromium: launched without a channel, downloaded through the existing path when absent, never Chrome or Edge', async () => {
  let r = run('chromium', {});
  assert.equal((await r.promise).launchedWith, 'bundled');
  assert.deepEqual(r.rec.calls, ['bundled']);

  r = run('chromium', { bundled: noBinary() });
  assert.equal((await r.promise).launchedWith, 'bundled');
  assert.deepEqual(r.rec.calls, ['bundled', 'bundled']);
  assert.equal(r.installs(), 1);

  const broken = new Error('browserType.launchPersistentContext: Target closed');
  r = run('chromium', { bundled: broken });
  await assert.rejects(r.promise, error => error === broken);
  assert.deepEqual(r.rec.calls, ['bundled']);
});

// ---- launchContext with a stub engine: the profile and the cookie clear follow the choice ----
const withEnv = async (env, body) => {
  const keys = ['FGC_BROWSER', 'BROWSER_DIR', 'FGC_SWITCH_ACCOUNT', 'FGC_MINIMIZE'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return await body();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
};
const stubEngine = () => {
  const seen = { dirs: [], channels: [], cleared: [] };
  const context = { clearCookies: async arg => seen.cleared.push(arg) };
  const importEngine = async () => ({
    chromium: {
      launchPersistentContext: async (dir, opts) => {
        seen.dirs.push(dir);
        seen.channels.push(opts.channel ?? 'bundled');
        return context;
      },
    },
  });
  return { seen, importEngine };
};
const profileOf = dir => path.basename(dir);
const storeOptions = () => ({ channel: 'chrome', headless: true, args: [] });

test('launchContext opens the profile of the selected browser and clears cookies in that same profile', async () => {
  for (const [value, profile, channel] of [[undefined, 'browser', 'chrome'], ['auto', 'browser', 'chrome'], ['chrome', 'browser', 'chrome'],
    ['msedge', 'browser-msedge', 'msedge'], ['chromium', 'browser-chromium', 'bundled']]) {
    await withEnv({ ...(value ? { FGC_BROWSER: value } : {}), FGC_SWITCH_ACCOUNT: 'steam' }, async () => {
      const { seen, importEngine } = stubEngine();
      await launchContext(cfg, storeOptions(), { importEngine });
      assert.deepEqual(seen.dirs.map(profileOf), [profile], `choice ${value}`);
      assert.deepEqual(seen.channels, [channel], `choice ${value}`);
      assert.equal(seen.cleared.length, 1, 'the switch clears the cookies of the context that was opened');
      assert.ok(seen.cleared[0].domain.test('store.steampowered.com'));
    });
  }
});

test('launchContext: BROWSER_DIR still wins for the profile, an invalid value runs as auto and says so', async () => {
  await withEnv({ FGC_BROWSER: 'msedge', BROWSER_DIR: path.join('X', 'mine') }, async () => {
    const { seen, importEngine } = stubEngine();
    await launchContext(cfg, storeOptions(), { importEngine });
    assert.deepEqual(seen.dirs, [path.join('X', 'mine')]);
    assert.deepEqual(seen.channels, ['msedge'], 'BROWSER_DIR moves the profile only; the browser is still the chosen one');
  });
  await withEnv({ FGC_BROWSER: 'firefox' }, async () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = line => warnings.push(String(line));
    try {
      const { seen, importEngine } = stubEngine();
      await launchContext(cfg, storeOptions(), { importEngine });
      assert.deepEqual(seen.dirs.map(profileOf), ['browser']);
      assert.deepEqual(seen.channels, ['chrome']);
    } finally {
      console.warn = warn;
    }
    assert.ok(warnings.some(w => w.includes('firefox')), `the invalid value must be named: ${warnings}`);
  });
});

test('cfg.dir.browser, which every store script and the lock cleanup use, follows the choice too', () => {
  const probe = env => spawnSync(process.execPath, ['--input-type=module', '-e',
    "import './src/util.js'; import { cfg } from './src/config.js'; console.log(cfg.dir.browser);"], {
    cwd: ENGINE, encoding: 'utf8', env: { ...process.env, FGC_BROWSER: '', BROWSER_DIR: '', ...env },
  }).stdout.trim();
  assert.equal(profileOf(probe({})), 'browser');
  assert.equal(profileOf(probe({ FGC_BROWSER: 'msedge' })), 'browser-msedge');
  assert.equal(profileOf(probe({ FGC_BROWSER: 'chromium' })), 'browser-chromium');
  assert.equal(probe({ FGC_BROWSER: 'msedge', BROWSER_DIR: 'X:\\mine' }), 'X:\\mine');
});
