import fs from 'fs';
import path from 'path';
import { BROWSER_IDS, launchWithPolicy, resolveBrowserChoice } from './browser_choice.js';

// All stores share one browser profile, so leaving one account means clearing that store's cookies only.
// Fab signs in through Epic: with the Epic cookies left in place it would sign straight back in.
const STORE_LOGIN_COOKIES = {
  epic: /(^|\.)epicgames\.com$/,
  gog: /(^|\.)gog\.com$/,
  steam: /(^|\.)(steampowered|steamcommunity)\.com$/,
  fab: /(^|\.)(fab|epicgames)\.com$/,
  unity: /(^|\.)unity\.com$/,
  itch: /(^|\.)itch\.io$/,
  prime: /(^|\.)amazon\.[a-z.]+$/,
};

// Browser automation engines that can be used to run the storefront scripts.
// Each entry maps the value of the AUTOMATION option to the npm package to load
// and the browser type to launch. Adding another Playwright-compatible library
// only requires a new entry here - the storefront scripts stay the same.
const ENGINES = {
  patchright: {
    package: 'patchright',
    browser: 'chromium',
    install: 'npm install && npx patchright install chromium chrome',
  },
  playwright: {
    package: 'playwright',
    browser: 'chromium',
    install: 'npm install playwright && npx playwright install chromium chrome',
  },
};

/**
 * Minimizes the browser window via CDP, best-effort. Some stores cannot run
 * headless without risking captchas and always launch a visible browser; a
 * minimized window keeps working and is as little intrusive as possible.
 * Only Chromium-based engines support `newCDPSession`, so other engines are skipped.
 * @param {object} context the launched browser context
 */
const minimizeWindow = async context => {
  if (typeof context.newCDPSession != 'function') return;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const page = context.pages()[0] || await context.newPage();
      const session = await context.newCDPSession(page);
      const { windowId } = await session.send('Browser.getWindowForTarget');
      // Position off-screen in 'normal' state so Chromium doesn't throttle RAF / timers or report hidden=true
      await session.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: -32000, top: -32000, width: 1280, height: 900, windowState: 'normal' },
      });
      await session.detach(); // don't leave a CDP connection around
      return;
    } catch (error) {
      if (attempt == 5) console.warn(`could not move the browser window off-screen: ${error.message}`);
      else await new Promise(resolve => setTimeout(resolve, 200)); // window may not be ready yet, retry
    }
  }
};

/**
 * Launches a persistent browser context with the automation engine selected via
 * the AUTOMATION option (default: patchright). Options are passed through as-is,
 * so the storefront scripts don't need to know which library is used.
 * `cfg` is passed in by the caller (instead of importing src/config.js here) to
 * avoid a circular import while config.js and util.js are still initializing.
 * @param {object} cfg the loaded configuration (src/config.js)
 * @param {object} options options for `launchPersistentContext` (without the user data dir)
 * @param {{importEngine?: (name: string) => Promise<object>}} [deps] replaces the dynamic import of the engine package (tests)
 * @returns {Promise<object>} the launched browser context
 */
export const launchContext = async (cfg, options, deps = {}) => {
  const engine = ENGINES[cfg.automation];
  if (!engine) {
    throw new Error(`Unknown AUTOMATION "${cfg.automation}". Supported values: ${Object.keys(ENGINES).join(', ')}.`);
  }
  let module;
  try {
    module = await (deps.importEngine ?? (name => import(name)))(engine.package);
  } catch (error) {
    // Give a clear error instead of the obscure "Cannot find package" module error
    if (error?.code == 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Browser automation "${cfg.automation}" is not installed. Install it with: ${engine.install}`);
    }
    throw error;
  }
  const browser = module[engine.browser];
  if (!browser) {
    throw new Error(`Package "${engine.package}" does not export "${engine.browser}".`);
  }
  // The storefront scripts request a GL backend for rendering; on Windows that
  // EGL backend is unavailable and Chrome silently falls back to software rendering,
  // so drop those flags to let Chrome pick the native (D3D11) backend instead.
  if (process.platform == 'win32') {
    const linuxGlArgs = ['--use-gl', '--use-angle'];
    options.args = (options.args ?? []).filter(a => !linuxGlArgs.some(p => a.startsWith(p)));
  }
  // On Windows, Chrome resolves the system proxy configuration (WinINET, including WPAD
  // auto-detection) on its first request, which can block the first navigation for 30s+
  // before the store is even contacted. The storefront scripts use no proxy, so force
  // direct access. An explicitly configured proxy in `args` is left untouched.
  const proxyArgs = ['--proxy-server', '--proxy-pac-url', '--proxy-auto-detect'];
  const args = options.args ?? [];
  const hasProxyArg = args.some(a => proxyArgs.some(p => a.startsWith(p)));
  if (!hasProxyArg) options.args = [...args, '--no-proxy-server'];

  // If running in background/minimized mode, launch directly off-screen with unthrottled background timers
  if (options.headless === false && process.env.FGC_MINIMIZE == '1') {
    const offscreenArgs = [
      '--window-position=-32000,-32000',
      '--window-size=1280,900',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-default-browser-check',
    ];
    options.args = [...(options.args ?? []), ...offscreenArgs];
  } else if (options.headless === false) {
    // A visible window is for the user: the profile remembers where a background run left it, up to fully off-screen
    options.args = [...(options.args ?? []), '--window-position=100,80', '--window-size=1280,900'];
  }

  // Stale profile lock cleanup to prevent crashes from previous interrupted runs
  if (cfg.dir?.browser) {
    const lockFile = path.resolve(cfg.dir.browser, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // file might be held by active process
      }
    }
  }

  const choice = resolveBrowserChoice(process.env);
  if (choice.invalid !== null) {
    console.warn(`[WARN] Unknown browser "${choice.invalid}" in FGC_BROWSER (giveaways_browser): running as "auto". Valid values: ${BROWSER_IDS.join(', ')}.`);
  }
  const launch = opts => browser.launchPersistentContext(cfg.dir.browser, opts);
  const context = await launchWithPolicy({
    launch,
    options,
    browser: choice.browser,
    platform: process.platform,
    install: async () => {
      const { execSync } = await import('child_process');
      execSync('npx patchright install chromium', { stdio: 'inherit' });
    },
    log: console,
  });

  // minimize only when a store forces a visible browser although headless was requested;
  // ClaimGames.cmd sets FGC_MINIMIZE for that case, so an explicit SHOW=1 stays visible
  if (options.headless === false && process.env.FGC_MINIMIZE == '1') await minimizeWindow(context);

  const switching = process.env.FGC_SWITCH_ACCOUNT;
  if (switching) {
    const domain = STORE_LOGIN_COOKIES[switching];
    if (!domain) throw new Error(`Cannot switch the account of an unknown store: ${switching}`);
    await context.clearCookies({ domain });
    console.log('[SENTINEL] Выход из аккаунта выполнен: войдите в нужный аккаунт в окне браузера.');
  }
  return context;
};
