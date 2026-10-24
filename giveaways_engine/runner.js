#!/usr/bin/env node
/**
 * Twitch Drops Sentinel v3.3.1 — Integrated Giveaways Engine Runner
 * Author: Mortuis_V / Mortuis_V_Studio
 *
 * Sequentially executes store giveaway claims with real-time streaming,
 * graceful error recovery, and zero external shell batch dependencies.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

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

function parseArgs() {
  const args = process.argv.slice(2);
  let headless = true;
  let stores = [];
  let inClaim = false;

  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    const arg = raw.toLowerCase();

    if (arg === '--headless' || arg === '-h' || arg === '--h') {
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
  return { headless, stores };
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
      stdio: 'inherit',
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

async function main() {
  const { headless, stores } = parseArgs();

  console.log('============================================================');
  console.log('  TWITCH DROPS SENTINEL — МОДУЛЬ РАЗДАЧ ИГР (GIVEAWAYS)');
  console.log('  Mortuis_V_Studio');
  console.log('============================================================');
  console.log(`[SENTINEL] Режим браузера: ${headless ? 'Фоновый стелс' : 'Активный экран'}`);
  console.log(`[SENTINEL] Выбранные платформы: ${stores.map(s => STORE_SCRIPTS[s]?.label || s).join(', ')}`);

  for (const store of stores) {
    await runStore(store, headless);
  }

  console.log('\n============================================================');
  console.log('[SENTINEL] Все выбранные платформы обработаны. Сбор раздач завершен.');
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[SENTINEL] Критическая ошибка в модуле раздач:`, err);
  process.exit(1);
});
