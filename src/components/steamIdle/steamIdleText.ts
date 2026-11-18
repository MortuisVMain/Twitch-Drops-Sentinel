// Words for the Steam IDLE tab: the service sends codes, the screen shows sentences.
import { uiLocale } from '../../i18n';
import { SteamIdleCommunitySession, SteamIdleFarmState, SteamIdleState } from '../../types';
import { signedOutHint } from './steamIdleLogic.mjs';

export type Tone = 'ok' | 'warn' | 'plain';

export const steamClientText = (steam: SteamIdleState['steam']): { text: string; tone: Tone } => {
  if (!steam.running) return { text: 'Не запущен', tone: 'warn' };
  if (!steam.signedIn) return { text: 'Запущен, вход не выполнен', tone: 'warn' };
  return { text: 'Запущен, вход выполнен', tone: 'ok' };
};

export const communityText = (session: SteamIdleCommunitySession): { text: string; tone: Tone } => {
  switch (session) {
    case 'signed_in': return { text: 'Вход выполнен', tone: 'ok' };
    case 'signed_out': return { text: 'Вход не выполнен', tone: 'warn' };
    case 'checking': return { text: 'Проверяем…', tone: 'plain' };
    case 'login_open': return { text: 'Окно входа открыто, войдите в нём сами', tone: 'warn' };
    case 'account_mismatch': return { text: 'Вход в другой аккаунт, не в тот, что в клиенте Steam', tone: 'warn' };
    case 'engine_missing': return { text: 'Нужен браузерный движок', tone: 'warn' };
    case 'error': return { text: 'Не удалось проверить вход', tone: 'warn' };
    default: return { text: 'Ещё не проверено', tone: 'plain' };
  }
};

export const helperText = (s: SteamIdleState): { text: string; tone: Tone } => {
  if (s.available) return { text: 'Готов', tone: 'ok' };
  return { text: unavailableLine(s.unavailableReason), tone: 'warn' };
};

export const unavailableLine = (reason: SteamIdleState['unavailableReason']): string => {
  if (reason === 'helper_missing') return 'Не найден файл помощника';
  if (reason === 'node_missing') return 'Не найден Node.js';
  if (reason === 'unsupported') return 'Не поддерживается на этом ПК';
  return 'Недоступен';
};

export const unavailableHelp = (reason: SteamIdleState['unavailableReason']): string => {
  if (reason === 'helper_missing') return 'Для Steam IDLE нужен файл помощника, который входит в полную сборку приложения. В этой копии его нет: переустановите приложение или обновите его.';
  if (reason === 'node_missing') return 'Для чтения страницы Steam нужен Node.js, а на этом ПК он не найден. Установите Node.js и перезапустите приложение.';
  if (reason === 'unsupported') return 'Steam IDLE работает только в Windows с установленным клиентом Steam.';
  return 'Служба сообщила, что Steam IDLE сейчас недоступен.';
};

export const farmStateText = (state: SteamIdleFarmState, lastError: string | null): string => {
  switch (state) {
    case 'scanning': return 'Читаем список карточек';
    case 'farming': return 'Фарм идёт';
    case 'waiting': return 'Ждём ответа Steam, попробуем ещё раз';
    case 'paused': return 'Фарм на паузе';
    case 'suspended': return 'Приостановлено: запущена игра';
    case 'needs_login': return 'Нужен вход в Steam';
    case 'done': return 'Готово: карточек не осталось';
    case 'stopped': return lastError ? 'Остановлено: ' + stopReason(lastError) : 'Остановлено';
    case 'idle': return 'Фарм не запущен';
    default: return 'Состояние неизвестно, обновите приложение';
  }
};

export const KNOWN_FARM_STATES: ReadonlySet<string> = new Set(['idle', 'scanning', 'farming', 'waiting', 'paused', 'suspended', 'needs_login', 'done', 'stopped']);

export const stopReason = (code: string): string => {
  if (code === 'read_failed') return 'не удалось прочитать список карточек';
  if (code === 'signed_out') return 'нет входа на сайт Steam';
  if (code === 'identity_mismatch') return 'вход на сайте и в клиенте Steam относится к разным аккаунтам';
  if (code.startsWith('release_failed')) return 'не удалось освободить игру';
  return 'сбой, подробности в журнале';
};

export const failedReasonText = (reason: string): string => {
  if (reason === 'no_progress') return 'карточки не выпадали';
  if (reason === 'presence_lost') return 'Steam перестал считать игру запущенной';
  return 'не удалось запустить';
};

export const previewErrorText = (code: string): string =>
  code === 'timeout' ? 'Steam не ответил вовремя. Список не обновлён.' : 'Не удалось обновить список. Повторите позже.';

/** Playtime with one decimal at most ("12.5", "3"). */
export const hoursNumber = (hours: number): string => (Math.round(hours * 10) / 10).toLocaleString(uiLocale());

export const ENGINE_MISSING_HINT = 'Steam IDLE читает сайт Steam через браузерный движок раздач. Установите его: вкладка «Раздачи» → «Проверить готовность» → «Браузерный движок».';
export const ENGINE_MISSING_HINT_GIVEAWAYS_OFF = 'Включите вкладку «Раздачи» в Настройках, чтобы установить браузерный движок.';

/** The engine lives behind the Giveaways tab; when that tab is turned off there is nothing to open, so the hint points to Settings. */
export const engineMissingHint = (giveawaysOn: boolean): string => (giveawaysOn ? ENGINE_MISSING_HINT : ENGINE_MISSING_HINT_GIVEAWAYS_OFF);

export const refusalText = (code: string | null, session = 'signed_out', giveawaysOn = true): string => {
  if (code === 'community_signed_out' && signedOutHint(session) === 'check') return 'Вход на сайт Steam ещё не проверен. Нажмите «Проверить».';
  switch (code) {
    case 'risk_not_acknowledged': return 'Сначала подтвердите, что понимаете риск для аккаунта.';
    case 'unavailable': return 'Steam IDLE недоступен: не хватает компонентов.';
    case 'engine_missing': return engineMissingHint(giveawaysOn);
    case 'module_disabled': return 'Steam IDLE выключен в Настройках.';
    case 'steam_not_running': return 'Клиент Steam не запущен. Запустите его и повторите.';
    case 'steam_signed_out': return 'В клиенте Steam не выполнен вход. Войдите и повторите.';
    case 'community_signed_out': return 'Нет входа на сайт Steam. Нажмите «Войти в Steam».';
    case 'account_mismatch': return 'Вход на сайте выполнен в другой аккаунт. Войдите в тот же, что и в клиенте Steam.';
    case 'busy': return 'Служба занята предыдущей командой. Повторите через пару секунд.';
    case 'achievements_not_acknowledged': return 'Сначала включите выдачу достижений в их разделе.';
    case 'not_ready': return 'Список игр ещё не загружен. Загрузите его и повторите.';
    case 'protected_app': return 'Игра с античитом: достижения в ней не выдаются.';
    case 'account_changed': return 'Сейчас в Steam другой аккаунт. Продолжить эту выдачу нельзя.';
    case 'not_held': return 'Эту игру уже не удерживают. Список обновится.';
    case 'no_interrupted_run': return 'Прерванной выдачи больше нет.';
    case 'invalid_request': return 'Служба не приняла запрос. Проверьте введённые значения.';
    case 'network': return 'Нет связи со службой. Повторите позже.';
    case 'timeout': return 'Служба не ответила. Повторите позже.';
    default: return 'Команда не выполнена. Повторите позже.';
  }
};

/** False when the state a refusal referred to has changed, so the message would now be stale. */
export const refusalApplies = (code: string, s: SteamIdleState): boolean => {
  switch (code) {
    case 'risk_not_acknowledged': return !s.riskAcknowledged;
    case 'unavailable': return !s.available;
    case 'module_disabled': return s.unavailableReason === 'module_disabled';
    case 'engine_missing': return s.community.session === 'engine_missing';
    case 'steam_not_running': return !s.steam.running;
    case 'steam_signed_out': return !s.steam.signedIn;
    case 'community_signed_out': return s.community.session !== 'signed_in';
    case 'account_mismatch': return s.community.session === 'account_mismatch';
    case 'achievements_not_acknowledged': return s.achievements?.acknowledged === false;
    default: return true;
  }
};
