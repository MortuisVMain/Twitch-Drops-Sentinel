// Steam Community web session in its own browser profile (not the giveaways one), used to read the badges pages.
// Usage: node steam-community.js login | status | dump <outDir> | drops | library
// Prints exactly one JSON line to stdout (diagnostics go to stderr); exit code 0 ok, 3 signed out, 4 failure.
// Cookie values, tokens, the SteamID and the account name are never printed, logged or written.
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hasNextPage, parseBadgesPage, parseLibrary } from './src/steam_community_parse.js';

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://steamcommunity.com';
const LOGIN_URL = `${BASE}/login/home/?goto=my%2Fbadges`;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_PAGES = 40;
const PAGE_GAP_MS = 1500;
const NAV_TIMEOUT_MS = 45000;
const EXIT = { signed_in: 0, complete: 0, signed_out: 3, closed: 3 };

export const exitCode = status => EXIT[status] ?? 4;

export const parseArgs = argv => {
  const [command, ...rest] = argv;
  if (['login', 'status', 'drops', 'library'].includes(command) && rest.length == 0) return { command };
  if (command == 'dump' && rest.length == 1 && rest[0]) return { command, outDir: rest[0] };
  return { error: 'usage' };
};

export const isInside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel == '' || (rel != '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

const parseCommunityUrl = url => {
  try {
    const u = new URL(url);
    return u.protocol == 'https:' && (u.hostname == 'steamcommunity.com' || u.hostname == 'www.steamcommunity.com') ? u : null;
  } catch {
    return null;
  }
};

export const isBadgesUrl = url => /^\/(id|profiles)\/[^/]+\/badges\/?$/.test(parseCommunityUrl(url)?.pathname ?? '');
export const isLoginUrl = url => /^\/login(\/|$)/.test(parseCommunityUrl(url)?.pathname ?? '');
export const hasBadgeRows = html => html.includes('class="badge_row');
export { hasNextPage };

class DumpError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

const hasSessionCookie = async context => (await context.cookies(BASE)).some(c => c.name == 'steamLoginSecure');

// the session cookie must exist and /my/badges must resolve to a profile badges page
const isSignedIn = async context => {
  if (!await hasSessionCookie(context)) return false;
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/my/badges`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    return isBadgesUrl(page.url());
  } finally {
    await page.close();
  }
};

const login = async (context, delay) => {
  let closed = false;
  context.on('close', () => { closed = true; });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(error => {
    if (!closed) throw error;
  });
  for (const deadline = Date.now() + LOGIN_TIMEOUT_MS; !closed && Date.now() < deadline;) {
    await delay(3000);
    if (closed) break;
    try {
      if (await isSignedIn(context)) return { status: 'signed_in' };
    } catch (error) {
      if (!closed) console.error('steam-community: sign-in check failed, retrying: %s', error.message);
    }
  }
  return { status: closed ? 'closed' : 'signed_out' };
};

const fetchHtml = async (page, url) => {
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  } catch (error) {
    throw new DumpError('load_failed', error.message);
  }
  if (isLoginUrl(page.url())) return null;
  if (!response || response.status() != 200) throw new DumpError(`http_${response?.status() ?? 'none'}`);
  return response.text();
};

const dump = async (context, outDir, delay) => {
  await mkdir(outDir, { recursive: true });
  const written = [];
  const save = async (name, html) => {
    const file = path.join(outDir, name);
    await writeFile(file, html, 'utf8');
    written.push(file);
  };
  const page = await context.newPage();
  let where = 1;
  try {
    for (; where <= MAX_PAGES; where++) {
      const html = await fetchHtml(page, `${BASE}/my/badges/?p=${where}`);
      if (html === null) throw new DumpError('signed_out');
      if (!hasBadgeRows(html)) break;
      await save(`badges-${where}.html`, html);
      if (!hasNextPage(html, where)) break;
      await delay(PAGE_GAP_MS);
    }
    const pages = written.length;
    where = 'games';
    await delay(PAGE_GAP_MS);
    const games = await fetchHtml(page, `${BASE}/my/games/?tab=all`);
    if (games === null) throw new DumpError('signed_out');
    await save('games-all.html', games);
    return { status: 'complete', pages, gamesPage: true };
  } catch (error) {
    await Promise.all(written.map(file => rm(file, { force: true })));
    if (error.code == 'signed_out') return { status: 'signed_out' };
    console.error('steam-community: dump failed at page %s: %s', where, error.message);
    return { status: 'failed', error: error.code ?? 'dump_error', page: where };
  }
};

// fetch(url) resolves to the page html, null when it landed on a login page, or throws an error with a `code`
const failure = (error, where) => {
  console.error('steam-community: failed at page %s: %s', where, error.message);
  return { status: 'failed', error: error.code ?? 'run_error', page: where };
};

export const collectDrops = async (fetch, delay) => {
  const games = new Map();
  let where = 1;
  try {
    for (;; where++) {
      const html = await fetch(`${BASE}/my/badges/?p=${where}&l=english`);
      if (html === null) return { status: 'signed_out' };
      if (!hasBadgeRows(html)) throw new DumpError('no_badge_rows');
      const { rows, hasNext } = parseBadgesPage(html, where);
      for (const row of rows) if (!games.has(row.appId)) games.set(row.appId, row);
      if (!hasNext) return { status: 'complete', pages: where, games: [...games.values()] };
      if (where >= MAX_PAGES) throw new DumpError('page_cap');
      await delay(PAGE_GAP_MS);
    }
  } catch (error) {
    return failure(error, where);
  }
};

export const collectLibrary = async fetch => {
  try {
    const html = await fetch(`${BASE}/my/games/?tab=all&l=english`);
    if (html === null) return { status: 'signed_out' };
    const games = parseLibrary(html);
    return { status: 'complete', count: games.length, games };
  } catch (error) {
    return failure(error, 'games');
  }
};

const runCommand = async ({ command, outDir }) => {
  // the shared launcher would otherwise hide the window or clear cookies when these are set for the giveaways run
  delete process.env.FGC_MINIMIZE;
  delete process.env.FGC_SWITCH_ACCOUNT;
  const { launchContext } = await import('./src/browser.js');
  const { dataDir, delay } = await import('./src/util.js');
  const cfg = {
    automation: process.env.AUTOMATION || 'patchright',
    dir: { browser: process.env.STEAM_IDLE_BROWSER_DIR || dataDir('browser-steam-idle') },
  };
  const visible = command == 'login';
  const context = await launchContext(cfg, { channel: 'chrome', headless: !visible, viewport: visible ? null : { width: 1280, height: 900 }, args: [] });
  try {
    if (command == 'login') return await login(context, delay);
    if (command == 'dump') return await dump(context, outDir, delay);
    if (command == 'drops' || command == 'library') {
      const page = await context.newPage();
      const fetch = url => fetchHtml(page, url);
      return command == 'drops' ? await collectDrops(fetch, delay) : await collectLibrary(fetch);
    }
    return { status: await isSignedIn(context) ? 'signed_in' : 'signed_out' };
  } finally {
    await context.close().catch(error => console.error('steam-community: closing the browser failed: %s', error.message));
  }
};

const main = async () => {
  console.log = console.error; // the shared launcher logs through console.log; stdout carries the result line only
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.error) result = { status: 'failed', error: 'usage' };
  else if (args.command == 'dump' && isInside(args.outDir, ENGINE_DIR)) result = { status: 'failed', error: 'out_dir_in_engine' };
  else {
    try {
      result = await runCommand(args);
    } catch (error) {
      console.error('steam-community: %s failed: %s', args.command, error.message);
      result = { status: 'failed', error: 'launch_or_run_failed' };
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(exitCode(result.status)));
};

if (process.argv[1] && import.meta.url == pathToFileURL(path.resolve(process.argv[1])).href) await main();
