import { useEffect, useState } from 'react';
import { ActiveDrop } from '../types';
import { isCountdownRunning, reconcileDrop, tickDrop } from '../utils/dropClock.mjs';

/** The active drop with its countdown ticking locally once a second; the root state only changes when data arrives. */
export function useTickedDrop(drop: ActiveDrop | null | undefined, paused: boolean): ActiveDrop | null | undefined {
  const [clock, setClock] = useState({ src: drop, base: drop, ticks: 0 });
  if (clock.src !== drop) {
    setClock((prev) => ({ src: drop, base: reconcileDrop(tickDrop(prev.base, prev.ticks), drop), ticks: 0 }));
  }
  const running = isCountdownRunning(tickDrop(clock.base, clock.ticks), paused);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setClock((prev) => ({ ...prev, ticks: prev.ticks + 1 })), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return tickDrop(clock.base, clock.ticks);
}
