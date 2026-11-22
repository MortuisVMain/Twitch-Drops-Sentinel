// Pure pieces of the Steam IDLE tab, kept apart from React so node --test can run them.

/** Seconds split for display. An age rounds minutes down; a countdown (up) rounds them up, so "1 мин" never hides 116 s. */
export function durParts(s, up = false) {
  if (!Number.isFinite(s)) return null;
  const sec = Math.max(0, Math.round(s));
  if (sec < 60) return { sec };
  const m = up ? Math.ceil(sec / 60) : Math.floor(sec / 60);
  if (m < 60) return { min: m };
  return { h: Math.floor(m / 60), rest: m % 60 };
}

/** A farm time estimate for display: minutes up to 48 h ("30 мин", "5 ч 30 мин"), then days with hours ("2 дн 4 ч"). Empty when unusable or zero. */
export function etaText(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '';
  const minutes = Math.max(1, Math.round(hours * 60));
  if (minutes <= 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
  }
  const total = Math.round(hours);
  const days = Math.floor(total / 24);
  const rest = total % 24;
  return rest ? `${days} дн ${rest} ч` : `${days} дн`;
}

/** What the "run interrupted by a restart" banner shows, or null when it must not show: nothing recorded, or a run is on.
 * A library run is the one that needs the in-page confirmation before it continues. */
export function interruptedBanner(interrupted, runActive) {
  if (!interrupted || runActive) return null;
  return { done: interrupted.gamesDone, total: interrupted.gamesTotal, unlocked: interrupted.unlocked, needsConfirm: interrupted.kind === 'library' };
}

/** The note under a game the refund hold keeps out of the queue. Days are whole and at least 1. */
export function refundNote(daysLeft) {
  const days = Number.isFinite(daysLeft) ? Math.max(1, Math.ceil(daysLeft)) : 1;
  return `Куплена недавно: фарм отнимет право на возврат. Осталось дней: ${days}.`;
}

/** The in-page question before a held game is farmed anyway. */
export function releaseQuestion(name) {
  return `Фармить ${name}? После 2 часов в игре вернуть её будет нельзя.`;
}

/** Which readiness button a "no site session" refusal should point at: only a known sign-out shows the login button. */
export function signedOutHint(session) {
  return session === 'unknown' || session === 'checking' ? 'check' : 'login';
}

/** The portrait cover of a Steam app; the cover component adds header and capsule as fallbacks. */
export function steamCover(appId) {
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

/** Hours played from minutes, or null when the game was never launched (or the value is unusable). */
export function playedHours(minutes) {
  return Number.isFinite(minutes) && minutes > 0 ? minutes / 60 : null;
}

const FINISHED_EXTRA = [['skipped', 'Пропущено'], ['rejected', 'Отклонено'], ['already', 'Уже было'], ['failed', 'Не удалось']];

/** The counts under a finished game: the unlocked one always, the others only when not zero. */
export function finishedFacts(game) {
  const facts = [{ label: 'Выдано', count: game.unlocked ?? 0 }];
  for (const [key, label] of FINISHED_EXTRA) if (game[key] > 0) facts.push({ label, count: game[key] });
  return facts;
}

const HOURS_STEP_OK = (n) => Number.isFinite(n) && n >= 0 && n <= 10 && (n * 2) % 1 === 0;

/** The service's suggestion for the hours setting, or null for anything that is not the contract shape. */
export function parseSuggestion(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { kind, suggestedHours, samples } = raw;
  if (typeof suggestedHours !== 'number' || !HOURS_STEP_OK(suggestedHours) || typeof samples !== 'number' || !Number.isFinite(samples)) return null;
  if (kind === 'unrestricted' ? suggestedHours !== 0 : !(kind === 'restricted' && suggestedHours >= 0.5)) return null;
  return { kind, suggestedHours, samples };
}

/** A pause the service made because the user is playing a game of their own, or null. */
export function parseAutoPause(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { reason, appId, since } = raw;
  return reason === 'user_playing' && Number.isFinite(appId) && Number.isFinite(since) ? { reason, appId, since } : null;
}

/** The hint under the hours setting: what the first drops say about the account and what to set. Null without a suggestion. */
export function thresholdHint(suggestion) {
  if (!suggestion) return null;
  if (suggestion.kind === 'unrestricted') return 'Похоже, аккаунт без ограничений: первая карточка падает примерно через 30 минут. Поставить 0 — фаза набора часов не нужна.';
  const hours = String(suggestion.suggestedHours).replace('.', ',');
  return `Первая карточка падает примерно через ${hours} ч — поставить ${hours}?`;
}
