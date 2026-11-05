// Which browser signs in and claims is the user's choice (FGC_BROWSER), made in the app's readiness window.
// "auto" is the original behaviour: Chrome, then Edge, then the bundled Chromium. An explicit choice is never replaced by another browser.

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

// The bundled Chromium: downloaded through the engine's own command when its binary is absent
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

// auto: the order the engine always had
const launchWithFallback = async (launch, options, platform, install, log) => {
  try {
    return await launch(options);
  } catch (error) {
    if (!options.channel || !isChannelError(error)) throw error;
    log.warn(`[WARN] Browser channel "${options.channel}" is not available on this system.`);
    // On Windows, Microsoft Edge is always pre-installed
    if (platform == 'win32' && options.channel !== 'msedge') {
      try {
        log.log('[INFO] Attempting fallback to Microsoft Edge (msedge)...');
        return await launch({ ...options, channel: 'msedge' });
      } catch {
        // Edge not available or failed, fall through to bundled Chromium
      }
    }
    log.log('[INFO] Falling back to bundled Patchright Chromium...');
    return launchBundled(launch, options, install, log);
  }
};

/**
 * Starts the browser according to the choice. `launch(options)` opens the persistent context.
 * chrome and msedge fail with BrowserUnavailableError instead of falling back; chromium uses the bundled build only.
 */
export const launchWithPolicy = async ({ launch, options, browser, platform, install, log }) => {
  if (browser == 'chromium') return launchBundled(launch, options, install, log);
  if (browser == 'auto') return launchWithFallback(launch, options, platform, install, log);
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
