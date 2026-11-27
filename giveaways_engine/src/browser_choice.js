import fs from 'node:fs';
import path from 'node:path';

// Which browser signs in and claims is the user's choice (FGC_BROWSER), made in the app's readiness window.
// "auto" never downloads a browser: a profile that already exists keeps its order (Chrome, Edge, an installed Chromium), a fresh one
// starts with Edge (on every Windows), and the browser that worked is written into the profile. An explicit choice is never replaced.

export const BROWSER_IDS = ['auto', 'chrome', 'msedge', 'chromium'];

const LABELS = { auto: 'автовыбор', chrome: 'Google Chrome', msedge: 'Microsoft Edge', chromium: 'встроенный Chromium' };

export const browserLabel = browser => LABELS[browser] ?? browser;

/** An unknown value runs as auto; `invalid` carries it so the caller can say so. */
export const resolveBrowserChoice = env => {
  const raw = env.FGC_BROWSER;
  const value = typeof raw == 'string' ? raw.trim().toLowerCase() : '';
  if (!value) return { browser: 'auto', invalid: null };
  if (BROWSER_IDS.includes(value)) return { browser: value, invalid: null };
  return { browser: 'auto', invalid: raw };
};

// chrome and auto share the profile that existed before the choice did, so nobody loses a sign-in
export const profileDirName = browser => ({ msedge: 'browser-msedge', chromium: 'browser-chromium' })[browser] ?? 'browser';

/** BROWSER_DIR (several accounts, tests) wins over the profile of the chosen browser. */
export const profileDir = (env, dataDir) => env.BROWSER_DIR || dataDir(profileDirName(resolveBrowserChoice(env).browser));

// Sign-ins live in the profile, so the record of them is kept per profile as well
export const sessionsFileName = browser => ({ msedge: 'sessions-msedge.json', chromium: 'sessions-chromium.json' })[browser] ?? 'sessions.json';

export class BrowserUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

const isChannelError = error => {
  const message = String(error?.message ?? '');
  return message.includes('Chromium distribution') ||
    message.includes('not found') ||
    message.includes("Executable doesn't exist") ||
    message.includes('Cannot find') ||
    message.toLowerCase().includes('channel');
};

const withoutChannel = options => {
  const copy = { ...options };
  delete copy.channel;
  return copy;
};

// The bundled Chromium: downloaded through the engine's own command when its binary is absent (explicit "chromium" only)
const launchBundled = async (launch, options, install, log) => {
  try {
    return await launch(withoutChannel(options));
  } catch (error) {
    if (!String(error?.message ?? '').includes("Executable doesn't exist")) throw error;
    log.log('[INFO] Bundled Chromium binary not found. Automatically running "npx patchright install chromium"...');
    await install();
    return launch(withoutChannel(options));
  }
};

export const AUTO_MARKER = 'sentinel-auto-browser.txt';

/**
 * What "auto" knows about a profile folder: the browser that last worked in it (written by launchWithPolicy), and whether the folder
 * already holds a browser profile ("Local State" is created by every Chromium-family browser on its first start).
 */
export const readAutoState = profile => {
  let recorded = null;
  try {
    const value = fs.readFileSync(path.join(profile, AUTO_MARKER), 'utf8').trim();
    if (['chrome', 'msedge', 'chromium'].includes(value)) recorded = value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { recorded, legacy: fs.existsSync(path.join(profile, 'Local State')) };
};

export const writeAutoMarker = (profile, name) => {
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, AUTO_MARKER), `${name}\n`, 'utf8');
};

/** The browsers "auto" tries, in order. The recorded one first: a profile never changes browser by itself. */
export const autoOrder = ({ recorded, legacy }, platform) => {
  const base = legacy ? ['chrome', 'msedge', 'chromium'] : ['msedge', 'chrome', 'chromium'];
  const order = recorded ? [recorded, ...base.filter(name => name !== recorded)] : base;
  return platform == 'win32' ? order : order.filter(name => name !== 'msedge');
};

// auto: the order above, and no download: the bundled Chromium is used only when it is already there
const launchAuto = async (launch, options, auto, platform, log) => {
  const order = autoOrder(auto, platform);
  let last;
  for (const name of order) {
    try {
      const context = name == 'chromium' ? await launch(withoutChannel(options)) : await launch({ ...options, channel: name });
      auto.record?.(name);
      return context;
    } catch (error) {
      if (!isChannelError(error)) throw error;
      last = error;
      log.warn(`[WARN] Browser "${browserLabel(name)}" is not available on this system.`);
    }
  }
  const firstLine = String(last?.message ?? '').split('\n')[0];
  const message = `[SENTINEL] ✕ Не удалось найти браузер для раздач (${firstLine}). Установите Microsoft Edge или Google Chrome ` +
    'либо выберите «Встроенный Chromium» (он скачается один раз) в окне «Проверить готовность» на вкладке «Раздачи».';
  log.error(message);
  throw new BrowserUnavailableError(message);
};

/**
 * Starts the browser according to the choice. `launch(options)` opens the persistent context.
 * chrome and msedge fail with BrowserUnavailableError instead of falling back; chromium uses the bundled build only.
 */
export const launchWithPolicy = async ({ launch, options, browser, platform, install, log, auto = { recorded: null, legacy: false } }) => {
  if (browser == 'chromium') return launchBundled(launch, options, install, log);
  if (browser == 'auto') return launchAuto(launch, options, auto, platform, log);
  try {
    return await launch({ ...options, channel: browser });
  } catch (error) {
    if (!isChannelError(error)) throw error;
    const firstLine = String(error.message).split('\n')[0];
    const message = `[SENTINEL] ✕ Не удалось запустить браузер «${browserLabel(browser)}», выбранный для раздач (${firstLine}). ` +
      'Другой браузер не подставляется. Смените браузер в окне «Проверить готовность» на вкладке «Раздачи».';
    log.error(message);
    throw new BrowserUnavailableError(message);
  }
};
