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
