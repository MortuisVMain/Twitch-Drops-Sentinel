// Words for the achievements section: the service sends codes, the screen shows sentences.
import { uiLocale } from '../../i18n';
import { SteamIdleAchRun, SteamIdleAchRunState, SteamIdleAchTotals } from '../../types';

/** Runs that hold the single activity slot: the card farm and the pickers are locked while one of these is on. */
const RUNNING: ReadonlySet<SteamIdleAchRunState> = new Set(['scanning', 'unlocking', 'waiting', 'paused', 'suspended']);
export const achRunActive = (state: SteamIdleAchRunState): boolean => RUNNING.has(state);
/** Active and not paused: Pause and Skip make sense. */
export const achRunMoving = (state: SteamIdleAchRunState): boolean => RUNNING.has(state) && state !== 'paused';
/** Arriving in one of these from an active state means the run is over and the game's achievement list is out of date. */
export const achRunEnded = (state: SteamIdleAchRunState): boolean => state === 'idle' || state === 'done' || state === 'stopped';

export const achStateText = (run: SteamIdleAchRun): string => {
  switch (run.state) {
    case 'scanning': return 'Читаем достижения игры';
    case 'unlocking': return 'Выдаём достижения';
    case 'waiting': return 'Пауза между выдачами';
    case 'paused': return 'На паузе';
    case 'suspended': return 'Приостановлено: запущена игра';
    case 'done': return 'Готово';
    case 'stopped': return 'Остановлено';
    default: return 'Выдача не запущена';
  }
};

/** Short reason after "Остановлено:". */
export const achStopReason = (code: string): string => {
  switch (code) {
    case 'account_changed': return 'сменился аккаунт Steam';
    case 'unlock_uncertain': return 'Steam не подтвердил сохранение';
    case 'internal_error': return 'внутренняя ошибка, подробности в журнале';
    case 'write_not_allowed': return 'запись достижений не разрешена';
    case 'timeout': return 'Steam не ответил вовремя';
    default: return 'сбой, подробности в журнале';
  }
};

/** What the user has to do after a stop, for the codes where doing nothing is the wrong answer. */
export const achErrorHelp = (code: string | null): string | null => {
  if (code === 'unlock_uncertain') return 'Steam не подтвердил сохранение. Проверьте достижения игры в Steam, прежде чем продолжать.';
  if (code === 'write_not_allowed') return 'Выдача достижений не разрешена. Включите её заново в этом разделе.';
  return null;
};

export const finishedNoteText = (note: string | null): string | null => {
  switch (note) {
    case 'no_achievements': return 'нет достижений';
    case 'nothing_missing': return 'всё уже получено';
    case 'read_failed': return 'не удалось прочитать';
    case 'skipped_by_user': return 'пропущено вами';
    case 'only_hidden': return 'остались только скрытые';
    case 'stopped': return 'остановлено до конца игры';
    case 'uncertain': return 'результат не подтверждён, проверьте в Steam';
    default: return note ? 'не обработано' : null;
  }
};

export const TOTAL_PARTS: ReadonlyArray<[keyof SteamIdleAchTotals, string]> = [
  ['unlocked', 'выдано'], ['already', 'уже было'], ['skipped', 'пропущено'], ['rejected', 'отклонено'], ['failed', 'не удалось'],
];

/** Epoch seconds (milliseconds are tolerated) as a short local date; null when the time is missing or zero. */
export const unlockDate = (time: number | null | undefined): string | null => {
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return null;
  const ms = time > 1e12 ? time : time * 1000;
  return new Date(ms).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
};

/** A read refused with busy while a run is on is not a failure: it clears when the run ends. */
export const ACH_BUSY_NOTE = 'Идёт выдача, список обновится после неё';

export const achLoadErrorText = (code: string): string => {
  switch (code) {
    case 'not_ready': return 'Список игр ещё не загружен. Загрузите его и повторите.';
    case 'timeout': return 'Steam не ответил вовремя. Повторите.';
    case 'shape': return 'Служба ответила в неожиданном формате.';
    case 'network': return 'Нет связи со службой. Повторите.';
    case 'achievements_not_acknowledged': return 'Сначала включите выдачу достижений.';
    case 'busy': return 'Служба занята. Повторите через пару секунд.';
    case 'steam_not_running': return 'Клиент Steam не запущен. Запустите его и повторите.';
    case 'steam_signed_out': return 'В клиенте Steam не выполнен вход. Войдите и повторите.';
    case 'community_signed_out': return 'Вход на сайт Steam не подтверждён. Проверьте его или войдите в блоке готовности.';
    case 'account_mismatch': return 'Вход на сайте выполнен в другой аккаунт. Войдите в тот же, что и в клиенте Steam.';
    default: return 'Не удалось прочитать данные. Повторите позже.';
  }
};

export const MINUTES_MAX = 1440;
export const START_NAMES_MAX = 200;
export const SEARCH_LIMIT = 50;
