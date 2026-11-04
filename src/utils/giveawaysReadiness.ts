// Texts, grouping and the plain-text report for the giveaways readiness window. Only type imports, so the test gate can bundle the file on its own.
import type { ReadinessAction, ReadinessItem, ReadinessResponse, ReadinessStatus } from '../types';

export type ReadinessGroupId = 'main' | 'logins' | 'sites' | 'scheduler';

export const READINESS_GROUPS: Array<{ id: ReadinessGroupId; title: string }> = [
  { id: 'main', title: 'Основное' },
  { id: 'logins', title: 'Вход в магазины' },
  { id: 'sites', title: 'Сайты магазинов' },
  { id: 'scheduler', title: 'Автосбор' },
];

const GROUP_OF: Record<string, ReadinessGroupId> = { login: 'logins', site: 'sites', scheduler: 'scheduler' };

// What the service may say per item; the test gate walks this list and wants a text for every entry
export const KNOWN_REASONS: Record<string, Array<string | null>> = {
  node: ['missing', 'old', 'unreadable', null],
  selection: ['disabled', 'none_selected', 'config_broken', null],
  scheduler: ['not_created', 'query_failed', 'repair_failed', 'last_run_failed', null],
  browser: ['chrome', 'edge', 'chromium', null],
};

export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  ok: 'Готово',
  todo: 'Нужно сделать',
  warning: 'Внимание',
  info: 'Необязательно',
};

const DAY_RU: Record<string, string> = {
  Monday: 'Пн', Tuesday: 'Вт', Wednesday: 'Ср', Thursday: 'Чт', Friday: 'Пт', Saturday: 'Сб', Sunday: 'Вс',
};

export const groupItems = (items: ReadinessItem[]): Record<ReadinessGroupId, ReadinessItem[]> => {
  const out: Record<ReadinessGroupId, ReadinessItem[]> = { main: [], logins: [], sites: [], scheduler: [] };
  for (const item of items) out[GROUP_OF[item.id] ?? 'main'].push(item);
  return out;
};

export const countTodo = (items: ReadinessItem[]): number => items.filter((item) => item.status === 'todo').length;

export const allSitesOk = (sites: ReadinessItem[]): boolean => sites.length > 0 && sites.every((item) => item.status === 'ok');

export const summaryText = (remaining: number): string => (remaining > 0 ? `Осталось шагов: ${remaining}` : 'Всё готово');

export const statusLabel = (status: string): string => STATUS_LABEL[status as ReadinessStatus] ?? 'Неизвестно';

// The service names the page itself; anything but a plain web address is not opened
export const safeUrl = (url: unknown): string | null => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null);

export interface TextContext {
  storeName: (id: string) => string;
  formatDate: (when: string | number) => string;
  engineInstall?: { running: boolean; error: string | null };
  /** The report leaves account names out: "вход есть" instead */
  hideAccount?: boolean;
}

export interface ItemText {
  title: string;
  lines: string[];
}

const nonEmpty = (lines: Array<string | null | undefined | false>): string[] => lines.filter((l): l is string => typeof l === 'string' && l.length > 0);

const storeTitle = (item: ReadinessItem, ctx: TextContext): string => (item.store ? ctx.storeName(item.store) : 'Магазин');

// confirmedAt comes as epoch ms, the scheduler's times as strings
const dateLine = (prefix: string, when: unknown, ctx: TextContext): string | null => {
  if ((typeof when !== 'string' && typeof when !== 'number') || !when) return null;
  const text = ctx.formatDate(when);
  return text ? `${prefix}: ${text}` : null;
};

const nodeText = (item: ReadinessItem): ItemText => {
  const { reason, version, required } = item.params;
  const need = required ?? 20;
  if (item.status === 'ok') return { title: 'Node.js', lines: [version ? `Версия ${version}` : 'Установлен'] };
  if (reason === 'missing') return { title: 'Node.js', lines: [`Нужен Node.js ${need} или новее`] };
  if (reason === 'old') return { title: 'Node.js', lines: [version ? `Установлен ${version}, нужен Node.js ${need} или новее` : `Нужен Node.js ${need} или новее`] };
  if (reason === 'unreadable') return { title: 'Node.js', lines: ['Не удалось узнать версию Node.js'] };
  return { title: 'Node.js', lines: [reason ? `Состояние не распознано: ${reason}` : 'Состояние не распознано'] };
};

const engineText = (item: ReadinessItem, ctx: TextContext): ItemText => {
  const title = 'Браузерный движок';
  const install = ctx.engineInstall;
  // The engine can be in place while Chromium did not download: the service says so in the same field
  if (item.status === 'ok') return { title, lines: nonEmpty(['Установлен', install?.error ? `Установка завершилась с ошибкой: ${install.error}` : null]) };
  if (install?.running) return { title, lines: ['Устанавливается…'] };
  const base = item.action ? 'Не установлен. Скачивается один раз' : 'Не установлен. Сначала нужен Node.js';
  return { title, lines: nonEmpty([base, install?.error ? `Не удалось установить: ${install.error}` : null]) };
};

/** The status the window shows: a working engine with an install error is a warning, not a clean ok */
export const itemStatus = (item: ReadinessItem, engineInstall?: { running: boolean; error: string | null }): ReadinessStatus =>
  item.id === 'engine' && item.status === 'ok' && engineInstall && !engineInstall.running && engineInstall.error ? 'warning' : item.status;

const browserText = (item: ReadinessItem): ItemText => {
  const title = 'Браузер для магазинов';
  const found = item.params.found;
  if (found === 'chrome') return { title, lines: ['Найден Google Chrome'] };
  if (found === 'edge') return { title, lines: ['Найден Microsoft Edge'] };
  if (found === 'chromium') return { title, lines: ['Найден Chromium'] };
  return { title, lines: ['Chrome и Edge не найдены. Движок скачает свой браузер при первом запуске'] };
};

const selectionText = (item: ReadinessItem): ItemText => {
  const title = 'Выбор магазинов';
  const { reason, stores } = item.params;
  if (reason === 'disabled') return { title, lines: ['Раздачи выключены в настройках'] };
  if (reason === 'none_selected') return { title, lines: ['Не выбран ни один магазин. Включите магазин на его карточке'] };
  if (reason === 'config_broken') return { title, lines: ['Файл настроек повреждён'] };
  if (reason) return { title, lines: [`Состояние не распознано: ${reason}`] };
  return { title, lines: [Array.isArray(stores) ? `Включено магазинов: ${stores.length}` : 'Магазины выбраны'] };
};

const loginText = (item: ReadinessItem, ctx: TextContext): ItemText => {
  const title = storeTitle(item, ctx);
  if (item.status !== 'ok') return { title, lines: ['Нужно войти в аккаунт'] };
  const account = typeof item.params.account === 'string' ? item.params.account : '';
  const who = ctx.hideAccount ? 'Вход есть' : account || 'Вход есть';
  return { title, lines: nonEmpty([who, dateLine('Вход подтверждён', item.params.confirmedAt, ctx)]) };
};

const siteText = (item: ReadinessItem, ctx: TextContext): ItemText => ({
  title: storeTitle(item, ctx),
  lines: [item.status === 'ok' ? 'Сайт открывается' : 'Сайт не открылся. Проверьте сеть или VPN'],
});

const schedulerText = (item: ReadinessItem, ctx: TextContext): ItemText => {
  const title = 'Автосбор по расписанию';
  const { reason, error, activeDays, logFile, nextRunTime } = item.params;
  if (reason === 'not_created') return { title, lines: ['Автосбор не включён. Это необязательно'] };
  if (reason === 'query_failed') return { title, lines: ['Не удалось узнать состояние задания в Планировщике Windows'] };
  if (reason === 'repair_failed') return { title, lines: nonEmpty(['Не удалось починить задание автосбора', error ? `Ошибка: ${error}` : null]) };
  if (reason === 'last_run_failed') return { title, lines: nonEmpty(['Последний запуск завершился с ошибкой', logFile ? `Лог: ${logFile}` : null]) };
  if (reason) return { title, lines: [`Состояние не распознано: ${reason}`] };
  const days = Array.isArray(activeDays) && activeDays.length ? activeDays.map((d: string) => DAY_RU[d] ?? d).join(', ') : '';
  return { title, lines: nonEmpty([days ? `Дни: ${days}` : 'Автосбор включён', dateLine('Следующий запуск', nextRunTime, ctx)]) };
};

export const itemText = (item: ReadinessItem, ctx: TextContext): ItemText => {
  switch (item.id) {
    case 'module': return { title: 'Модуль раздач', lines: [item.status === 'ok' ? 'Найден' : 'Модуль не найден. Переустановите приложение из полного архива'] };
    case 'node': return nodeText(item);
    case 'engine': return engineText(item, ctx);
    case 'browser': return browserText(item);
    case 'selection': return selectionText(item);
    case 'login': return loginText(item, ctx);
    case 'site': return siteText(item, ctx);
    case 'scheduler': return schedulerText(item, ctx);
    default: return { title: String((item as ReadinessItem).id), lines: ['Состояние не распознано'] };
  }
};

export const actionLabel = (action: ReadinessAction): string => {
  switch (action.kind) {
    case 'open_url': return 'Открыть страницу';
    case 'install_engine': return 'Установить движок';
    case 'sign_in': return 'Войти в аккаунт';
    case 'enable_giveaways': return 'Включить раздачи';
    case 'enable_scheduler': return 'Включить автосбор';
    default: return 'Выполнить';
  }
};

// A Windows path often holds the user name: the report keeps the file name only (a path with spaces is cut at its end or at a quote)
const PATH = /(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])[^"'<>|*?\n]*/g;
export const scrubPaths = (text: string): string => text.replace(PATH, (path) => path.split(/[\\/]/).filter(Boolean).pop() ?? '');

/** Plain text for support. `tr` translates one piece at a time (the UI language), so patterns still match. */
export const buildReport = (
  resp: ReadinessResponse,
  ctx: TextContext,
  appVersion: string,
  tr: (text: string) => string = (t) => t
): string => {
  const reportCtx: TextContext = { ...ctx, hideAccount: true, engineInstall: resp.engineInstall };
  const groups = groupItems(resp.items);
  const out = [
    tr('Twitch Drops Sentinel: готовность раздач'),
    `${tr('Версия приложения')}: ${appVersion || '?'}`,
    ...(resp.checkedAt ? [`${tr('Проверено')}: ${ctx.formatDate(resp.checkedAt) || resp.checkedAt}`] : []),
    `${tr('Итог')}: ${tr(summaryText(countTodo(resp.items)))}`,
  ];
  for (const group of READINESS_GROUPS) {
    if (!groups[group.id].length) continue;
    out.push('', tr(group.title));
    for (const item of groups[group.id]) {
      const text = itemText(item, reportCtx);
      out.push(`[${tr(statusLabel(itemStatus(item, resp.engineInstall)))}] ${tr(text.title)}: ${text.lines.map((line) => scrubPaths(tr(line))).join('; ')}`);
    }
  }
  return out.join('\n');
};
