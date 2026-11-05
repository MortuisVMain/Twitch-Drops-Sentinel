// https://stackoverflow.com/questions/46745014/alternative-for-dirname-in-node-js-when-using-es6-modules
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { appendFileSync, rmSync } from 'node:fs';
import { resolveBrowserChoice, sessionsFileName } from './browser_choice.js';
// not the same since these will give the absolute paths for this file instead of for the file using them
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// explicit object instead of Object.fromEntries since the built-in type would loose the keys, better type: https://dev.to/svehla/typescript-object-fromentries-389c
export const dataDir = s => path.resolve(__dirname, '..', 'data', s);

// modified path.resolve to return null if first argument is '0', used to disable screenshots
export const resolve = (...a) => a.length && a[0] == '0' ? null : path.resolve(...a);

// Logging used by ClaimGames.cmd (inactive when FGC_LOG_FILE is not set):
// append all console output to the given file, in addition to the console
const fgcLogFile = process.env.FGC_LOG_FILE;
if (fgcLogFile) {
  for (const level of ['log', 'info', 'debug', 'error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      appendFileSync(fgcLogFile, `${format(...args)}\n`);
      original(...args);
    };
  }
}

// json database
import { JSONFilePreset } from 'lowdb/node';
export const jsonDb = (file, defaultData) => JSONFilePreset(dataDir(file), defaultData);

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// date and time as UTC (no timezone offset) in nicely readable and sortable format, e.g., 2022-10-06 12:05:27.313
export const datetimeUTC = (d = new Date()) => d.toISOString().replace('T', ' ').replace('Z', '');
// same as datetimeUTC() but for local timezone, e.g., UTC + 2h for the above in DE
export const datetime = (d = new Date()) => datetimeUTC(new Date(d.getTime() - d.getTimezoneOffset() * 60000));
export const filenamify = s => s.replaceAll(':', '.').replace(/[^a-z0-9 _\-.]/gi, '_'); // alternative: https://www.npmjs.com/package/filenamify - On Unix-like systems, / is reserved. On Windows, <>:"/\|?* along with trailing periods are reserved.

export const handleSIGINT = (context = null) => process.on('SIGINT', async () => { // e.g. when killed by Ctrl-C
  console.error('\nInterrupted by SIGINT. Exit!'); // Exception shows where the script was:\n'); // killed before catch in docker...
  process.exitCode = 130; // 128+SIGINT to indicate to parent that process was killed
  if (context) await context.close(); // in order to save recordings also on SIGINT, we need to disable Playwright's handleSIGINT and close the context ourselves
});

// used prompts before, but couldn't cancel prompt
// alternative inquirer is big (node_modules 29MB, enquirer 9.7MB, prompts 9.8MB, none 9.4MB) and slower
// open issue: prevents handleSIGINT() to work if prompt is cancelled with Ctrl-C instead of Escape: https://github.com/enquirer/enquirer/issues/372
import Enquirer from 'enquirer'; const enquirer = new Enquirer();
const timeoutPlugin = timeout => enquirer => { // cancel prompt after timeout ms
  enquirer.on('prompt', prompt => {
    const t = setTimeout(() => {
      prompt.hint = () => 'timeout';
      prompt.cancel();
    }, timeout);
    prompt.on('submit', _ => clearTimeout(t));
    prompt.on('cancel', _ => clearTimeout(t));
  });
};
enquirer.use(timeoutPlugin(cfg.login_timeout)); // TODO may not want to have this timeout for all prompts; better extend Prompt and add a timeout prompt option
// single prompt that just returns the non-empty value instead of an object
// @ts-ignore
// Inside the app there is no terminal to answer in (stdin is at EOF): no answer right away, the login happens in the browser window.
// Waiting for Enquirer instead blocks the login and, on Node 24, its timeout crashes the process with ERR_USE_AFTER_CLOSE.
export const prompt = o => process.stdin.isTTY
  ? enquirer.prompt({ name: 'name', type: 'input', message: 'Enter value', ...o }).then(r => r.name).catch(_ => {})
  : Promise.resolve();
export const confirm = o => prompt({ type: 'confirm', message: 'Continue?', ...o });

export const loginHint = () => {
  if (process.stdin.isTTY) return 'Press ESC to skip the prompts if you want to login in the browser (not possible in headless mode).';
  return cfg.headless
    ? '[SENTINEL] Вход в магазин не выполнен: нажмите «Войти в аккаунт» на вкладке «Раздачи».'
    : `[SENTINEL] Войдите в аккаунт в открывшемся окне браузера. Если окна не видно, найдите его на панели задач. На вход есть ${cfg.login_timeout / 60000} мин.`;
};

// Sign-ins live in the profile of the chosen browser: each browser has its own record (sessions.json stays that of chrome and auto)
const sessionsFile = () => sessionsFileName(resolveBrowserChoice(process.env).browser);

// A login state that cannot be saved must not cost the user the run: the card is only wrong until the next run.
const writeSession = async (store, entry) => {
  try {
    const file = sessionsFile();
    const sessions = await jsonDb(file, {}).catch(error => {
      if (!(error instanceof SyntaxError)) throw error;
      // Only holds what the next run finds out again, so a damaged file is safe to replace
      console.error(`[SENTINEL] Replacing damaged ${file}: ${error.message}`);
      rmSync(dataDir(file), { force: true });
      return jsonDb(file, {});
    });
    sessions.data[store] = entry;
    await sessions.write();
  } catch (error) {
    console.error(`[SENTINEL] Could not save the login state of ${store} to ${sessionsFile()}: ${error.message}`);
  }
};
// The store card shows this login; the per-store databases only learn about an account once something was claimed.
// confirmedAt lets the UI tell this login attempt from an earlier one.
export const markSignedIn = (store, account) => writeSession(store, { account, confirmedAt: Date.now() });
// Keeps the entry: it also stops the card from falling back to the account of already claimed games.
export const markSignedOut = store => writeSession(store, { account: null });

// notifications via apprise CLI
import { execFile } from 'child_process';
import { cfg } from './config.js';

export const notify = html => new Promise((resolve, reject) => {
  if (!cfg.notify) {
    if (cfg.debug) console.debug('notify: NOTIFY is not set!');
    return resolve();
  }
  // const cmd = `apprise '${cfg.notify}' ${title} -i html -b '${html}'`; // this had problems if e.g. ' was used in arg; could have `npm i shell-escape`, but instead using safer execFile which takes args as array instead of exec which spawned a shell to execute the command
  const args = [cfg.notify, '-i', 'html', '-b', `'${html}'`];
  if (cfg.notify_title) args.push(...['-t', cfg.notify_title]);
  if (cfg.debug) console.debug(`apprise ${args.map(a => `'${a}'`).join(' ')}`); // this also doesn't escape, but it's just for info
  execFile('apprise', args, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      if (error.message.includes('command not found')) {
        console.info('Run `pip install apprise`. See https://github.com/vogler/free-games-claimer#notifications');
      }
      return reject(error);
    }
    if (stderr) console.error(`stderr: ${stderr}`);
    if (stdout) console.log(`stdout: ${stdout}`);
    resolve();
  });
});

export const escapeHtml = unsafe => unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#039;');

export const recordClaimStat = async (store, { title, url, priceUsd = 0, coverUrl = null }) => {
  const statsDb = await jsonDb('stats.json', { totalSavedUsd: 0, totalClaimed: 0, history: [] });
  statsDb.data.totalClaimed = (statsDb.data.totalClaimed || 0) + 1;
  statsDb.data.totalSavedUsd = Number(((statsDb.data.totalSavedUsd || 0) + (Number(priceUsd) || 0)).toFixed(2));
  statsDb.data.history.push({
    store,
    title,
    url,
    priceUsd: Number(priceUsd) || 0,
    coverUrl,
    date: datetime(),
  });
  await statsDb.write();
  return statsDb.data;
};

export const getStatsSummary = async () => {
  const statsDb = await jsonDb('stats.json', { totalSavedUsd: 0, totalClaimed: 0, history: [] });
  return `💰 Всего сэкономлено: $${statsDb.data.totalSavedUsd || 0} (${statsDb.data.totalClaimed || 0} раздач)`;
};

export const html_game_list = (games, statsSummary = null) => {
  const list = games.map(g => `- <a href="${g.url}">${escapeHtml(g.title)}</a> (${g.status}${g.price ? ` - $${g.price}` : ''})`).join('<br>');
  return statsSummary ? `${list}<br><br><b>${escapeHtml(statsSummary)}</b>` : list;
};
