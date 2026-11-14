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

/** Which readiness button a "no site session" refusal should point at: only a known sign-out shows the login button. */
export function signedOutHint(session) {
  return session === 'unknown' || session === 'checking' ? 'check' : 'login';
}
