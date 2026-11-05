// What a store run did, said honestly: a store script writes its counts, the runner prints one line from them.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { NOT_FREE, TOTAL_UNKNOWN } from './checkout.js';

const COUNTS = ['claimed', 'existed', 'refused', 'failed', 'other'];

/** Counts the statuses of the games a script listed. A refusal (not free / total unknown) is not a failure and not a claim. */
export const tallyGames = games => {
  const tally = { claimed: 0, existed: 0, refused: 0, failed: 0, other: 0 };
  for (const { status } of games) {
    const text = String(status ?? '');
    if (text === 'claimed') tally.claimed++;
    else if (text === 'existed') tally.existed++;
    else if (text === NOT_FREE || text === TOTAL_UNKNOWN) tally.refused++;
    else if (text.startsWith('failed')) tally.failed++;
    else tally.other++;
  }
  return tally;
};

/** Called by a store script when it ends. No SENTINEL_RUN_REPORT (a run by hand) means no report is wanted. */
export const writeRunReport = (games, extra = {}) => {
  const file = process.env.SENTINEL_RUN_REPORT;
  if (!file) return;
  try {
    writeFileSync(file, JSON.stringify({ ...tallyGames(games), ...extra }));
  } catch (err) {
    console.warn(`[SENTINEL] Не удалось записать итог запуска: ${err.message}`);
  }
};

/** The report of a finished store run, read once and removed. null if there is none or it cannot be read: the summary is then neutral. */
export const readRunReport = file => {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[SENTINEL] Не удалось прочитать итог запуска: ${err.message}`);
    return null;
  }
  rmSync(file, { force: true });
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[SENTINEL] Итог запуска повреждён: ${err.message}`);
    return null;
  }
};

/** One line for the log from a report: { level: 'log' | 'warn', text }. Only a clean run with something done or nothing to do is a ✓. */
export const summarizeRun = (label, report) => {
  const valid = report && typeof report === 'object' && (report.skipped === 'login' || COUNTS.every(key => Number.isInteger(report[key])));
  if (!valid) return { level: 'log', text: `[SENTINEL] ${label}: завершён.` };
  if (report.skipped === 'login') return { level: 'warn', text: `[SENTINEL] ⚠ ${label}: пропущено, нужен вход.` };
  const { claimed, existed, refused, failed, other } = report;
  const extras = [existed && `уже в библиотеке ${existed}`, other && `прочее ${other}`].filter(Boolean);
  const tail = extras.length ? `, ${extras.join(', ')}` : '';
  if (refused || failed) {
    const bad = [refused && `отклонено ${refused}`, failed && `не удалось ${failed}`].filter(Boolean).join(', ');
    const hint = refused ? ' (бесплатность не подтверждена, заказ не оформлялся; проверьте вручную)' : ' (проверьте вручную)';
    return { level: 'warn', text: `[SENTINEL] ⚠ ${label}: ${bad}, получено ${claimed}${tail}${hint}.` };
  }
  if (claimed) return { level: 'log', text: `[SENTINEL] ✓ ${label}: получено ${claimed}${tail}.` };
  if (other) return { level: 'log', text: `[SENTINEL] ${label}: завершён, получено 0${tail}.` };
  return { level: 'log', text: `[SENTINEL] ✓ ${label}: новых раздач нет${existed ? ` (уже в библиотеке ${existed})` : ''}.` };
};
