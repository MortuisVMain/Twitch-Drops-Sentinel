// Local countdown of the active drop: derived from the last server snapshot plus whole seconds ticked since.
export const isCountdownRunning = (drop, paused) =>
  Boolean(drop && !drop.is_claimed && !paused && drop.remaining_seconds > 0);

export function tickDrop(drop, ticks) {
  if (!drop || ticks <= 0 || drop.is_claimed || drop.remaining_seconds <= 0) return drop;
  const remaining = Math.max(0, drop.remaining_seconds - ticks);
  const total = drop.required_minutes * 60;
  const elapsed = total - remaining;
  return {
    ...drop,
    remaining_seconds: remaining,
    current_minutes: Math.floor(elapsed / 60),
    progress_percent: total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 100,
    can_claim: remaining === 0,
  };
}

// A fresh server snapshot within 6 s of what is shown keeps the shown value, so the digits never jump back.
export function reconcileDrop(shown, incoming) {
  if (!shown || !incoming) return incoming;
  if (shown.id !== incoming.id || shown.current_minutes !== incoming.current_minutes) return incoming;
  const diff = Math.abs((shown.remaining_seconds || 0) - (incoming.remaining_seconds || 0));
  return diff <= 6 ? { ...incoming, remaining_seconds: shown.remaining_seconds } : incoming;
}
