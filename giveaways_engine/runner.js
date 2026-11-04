#!/usr/bin/env node
/**
 * Twitch Drops Sentinel — giveaways engine runner
 * Author: Mortuis_V / Mortuis_V_Studio
 *
 * Sequentially executes store giveaway claims with real-time streaming,
 * graceful error recovery, and zero external shell batch dependencies.
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { format } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_SCRIPTS = {
  epic: { script: 'epic-games.mjs', fallback: 'epic-games.js', label: 'Epic Games' },
  gog: { script: 'gog.mjs', fallback: 'gog.js', label: 'GOG' },
  steam: { script: 'steam.mjs', fallback: 'steam.js', label: 'Steam' },
  fab: { script: 'fab.mjs', fallback: 'fab.js', label: 'Fab / Unreal Engine' },
  unreal: { script: 'fab.mjs', fallback: 'fab.js', label: 'Fab / Unreal Engine' },
  ue: { script: 'fab.mjs', fallback: 'fab.js', label: 'Fab / Unreal Engine' },
  unity: { script: 'unity.mjs', fallback: 'unity.js', label: 'Unity Asset Store' },
  itch: { script: 'itch.mjs', fallback: 'itch.js', label: 'Itch.io' },
  prime: { script: 'prime-gaming.mjs', fallback: 'prime-gaming.js', label: 'Prime Gaming' },
};

const MIN_NODE_MAJOR = 20;
// The same defaults as "giveaways_selected_stores" in the service settings
const DEFAULT_SELECTED_STORES = ['epic', 'gog', 'steam', 'fab', 'unity'];
const ENGINE_SETUP_TIMEOUT_MS = 900000;

// Where children and setup commands write: the console, or the run log of a scheduled run
let childOutput = 'inherit';

function parseArgs() {
  const args = process.argv.slice(2);
  let headless = true;
  let stores = [];
  let inClaim = false;
  let scheduled = false;
  let configPath = null;
  let logPath = null;

  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    const arg = raw.toLowerCase();

    if (arg === '--scheduled') {
      scheduled = true;
      inClaim = false;
    } else if (arg === '--config') {
      configPath = args[++i];
      inClaim = false;
    } else if (arg === '--log') {
      logPath = args[++i];
      inClaim = false;
    } else if (arg === '--headless' || arg === '-h' || arg === '--h') {
      headless = true;
      inClaim = false;
    } else if (arg === '--show' || arg === '-s' || arg === '--s') {
      headless = false;
      inClaim = false;
    } else if (arg === '--claim' || arg === '-c' || arg === '--c') {
      inClaim = true;
    } else if (inClaim && !arg.startsWith('-')) {
      if (STORE_SCRIPTS[arg]) {
        stores.push(arg);
      } else {
        console.warn(`[SENTINEL] Неизвестная платформа раздач: ${raw}`);
      }
    }
  }

  if (stores.length === 0) {
    stores = ['epic', 'gog', 'steam', 'fab', 'unity', 'itch'];
  }

  // Deduplicate preserving order
  stores = [...new Set(stores)];
  return { headless, stores, scheduled, configPath, logPath };
}

const RUN_LOG_FORMAT_LINE = '[SENTINEL] ◆ Журнал запуска v2';
// The last line of every normal exit, a skipped collection included; a failure ends with a ✕ line instead
const RUN_DONE_LINE = '[SENTINEL] ■ Запуск завершён.';

// One file per task, started over at every run: its size stays that of a single run, whatever the task's lifetime
function openRunLog(logPath) {
  try {
    fs.writeFileSync(logPath, '');
    const fd = fs.openSync(logPath, 'a');
    for (const level of ['log', 'info', 'warn', 'error']) {
      console[level] = (...args) => fs.writeSync(fd, `${format(...args)}\n`);
    }
    childOutput = ['ignore', fd, fd];
    // The app judges the log by these two marks: a log that opens with the first and does not end with RUN_DONE_LINE was cut off
    console.log(RUN_LOG_FORMAT_LINE);
  } catch (err) {
    // No log is no reason to skip the claim; the hidden console is all that is left for this message
    console.error(`[SENTINEL] Не удалось открыть лог ${logPath}: ${err.message}`);
  }
}

// Throws on a damaged config: guessing could claim in a store the user turned off
function readScheduledStores(configPath) {
  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.log(`[SENTINEL] ${configPath} ещё не создан: собираем магазины по умолчанию.`);
    return DEFAULT_SELECTED_STORES;
  }
  const config = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (config.giveaways_enabled === false) {
    console.log('[SENTINEL] Раздачи отключены в настройках: сбор пропущен.');
    return [];
  }
  const selected = config.giveaways_selected_stores;
  if (selected === undefined) return DEFAULT_SELECTED_STORES;
  if (!Array.isArray(selected)) throw new Error('giveaways_selected_stores должен быть списком');
  if (selected.length === 0) console.log('[SENTINEL] Ни один магазин не выбран: сбор пропущен.');
  const known = selected.filter((store) => {
    if (!STORE_SCRIPTS[store]) console.warn(`[SENTINEL] Неизвестная платформа раздач: ${store}`);
    return STORE_SCRIPTS[store];
  });
  return [...new Set(known)];
}

function resolveScript(entry) {
  const distPath = path.join(__dirname, 'dist', entry.script);
  if (fs.existsSync(distPath)) return distPath;
  const rootPath = path.join(__dirname, entry.fallback);
  if (fs.existsSync(rootPath)) return rootPath;
  return distPath;
}

function runStore(storeKey, headless) {
  return new Promise((resolve) => {
    const entry = STORE_SCRIPTS[storeKey];
    if (!entry) {
      console.warn(`[SENTINEL] Пропуск неизвестной платформы: ${storeKey}`);
      return resolve(0);
    }

    const scriptPath = resolveScript(entry);
    console.log(`\n------------------------------------------------------------`);
    console.log(`[SENTINEL] ▶ Запуск сбора: ${entry.label}...`);
    console.log(`------------------------------------------------------------`);

    const childEnv = {
      ...process.env,
      SHOW: headless ? '0' : '1',
      FGC_MINIMIZE: headless ? '1' : '0',
    };

    const proc = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      env: childEnv,
      stdio: childOutput,
      windowsHide: true,
    });

    proc.on('error', (err) => {
      console.error(`[SENTINEL] ✕ Ошибка запуска процесса ${entry.label}: ${err.message}`);
      resolve(1);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[SENTINEL] ✓ ${entry.label}: сбор успешно завершен.`);
      } else {
        console.warn(`[SENTINEL] ⚠ ${entry.label}: завершился с предупреждением (код ${code}).`);
      }
      resolve(code || 0);
    });
  });
}

// A scheduled run has nobody to press "Claim", so the first one on a fresh install sets up the browser engine itself
function ensureBrowserEngine() {
  // The folder alone proves little: the mark stays until npm has succeeded (same file in giveaways_controller.py)
  const incompleteMark = path.join(__dirname, 'data', '.engine-install-incomplete');
  if (fs.existsSync(path.join(__dirname, 'node_modules', 'patchright')) && !fs.existsSync(incompleteMark)) return true;
  fs.mkdirSync(path.dirname(incompleteMark), { recursive: true });
  fs.writeFileSync(incompleteMark, '');
  console.log('[SENTINEL] Установка браузерного движка раздач...');
  const run = command => spawnSync(command, { cwd: __dirname, shell: true, stdio: childOutput, windowsHide: true }).status;
  const npm = run('npm install');
  if (npm !== 0) {
    console.error(`[SENTINEL] ✕ Команда "npm install" завершилась с кодом ${npm}.`);
    return false;
  }
  fs.rmSync(incompleteMark, { force: true });
  // Chrome or Edge can do the work without it: src/browser.js falls back on them and downloads Chromium as a last resort
  const chromium = run('npx patchright install chromium');
  if (chromium !== 0) console.warn(`[SENTINEL] ⚠ Chromium не скачался (код ${chromium}), будут использованы Chrome или Edge.`);
  return true;
}

async function main() {
  const { headless, stores: claimedStores, scheduled, configPath, logPath } = parseArgs();
  if (logPath) openRunLog(logPath);
  if (scheduled) console.log(`[SENTINEL] Запуск по расписанию: ${new Date().toISOString()}`);

  const nodeVersion = process.versions.node;
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    console.error(`[SENTINEL] ✕ Для раздач нужен Node.js ${MIN_NODE_MAJOR} или новее (nodejs.org), установлен ${nodeVersion}.`);
    process.exit(1);
  }

  let stores = claimedStores;
  if (scheduled) {
    try {
      stores = readScheduledStores(configPath);
    } catch (err) {
      console.error(`[SENTINEL] ✕ Не удалось прочитать выбор магазинов из ${configPath} (config.json): ${err.message}. Сбор отменён.`);
      process.exit(1);
    }
    if (stores.length === 0) {
      console.log(RUN_DONE_LINE);
      process.exit(0);
    }
  }

  if (!ensureBrowserEngine()) process.exit(1);

  console.log('============================================================');
  console.log('  TWITCH DROPS SENTINEL — МОДУЛЬ РАЗДАЧ ИГР (GIVEAWAYS)');
  console.log('  Mortuis_V_Studio');
  console.log('============================================================');
  console.log(`[SENTINEL] Режим браузера: ${headless ? 'Фоновый стелс' : 'Активный экран'}`);
  console.log(`[SENTINEL] Выбранные платформы: ${stores.map(s => STORE_SCRIPTS[s]?.label || s).join(', ')}`);

  const failed = [];
  for (const store of stores) {
    if (await runStore(store, headless)) failed.push(STORE_SCRIPTS[store]?.label || store);
  }

  console.log('\n============================================================');
  console.log('[SENTINEL] Все выбранные платформы обработаны. Сбор раздач завершен.');
  console.log('============================================================\n');
  // The last line of a scheduled run's log is how the interface learns about a failure: conhost hides the exit code
  if (failed.length) console.error(`[SENTINEL] ✕ Сбор завершился с ошибкой: ${failed.join(', ')}`);
  else console.log(RUN_DONE_LINE);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[SENTINEL] ✕ Критическая ошибка в модуле раздач:`, err);
  process.exit(1);
});
