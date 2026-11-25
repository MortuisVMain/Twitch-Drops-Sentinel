import { useCallback, useEffect, useState } from 'react';
import { type IdleStats, type StatsPeriod, parseStats } from './idleStats.mjs';
import { BASE } from './useSteamIdle';

const REFRESH_MS = 30000;

export interface IdleStatsLoad { stats: IdleStats | null; failed: boolean; loading: boolean }

/** The statistics of one period: read on mount and on a period change, then every 30 s while the window is shown. */
export function useIdleStats(period: StatsPeriod) {
  const [load, setLoad] = useState<IdleStatsLoad>({ stats: null, failed: false, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const abort = new AbortController();
    const read = async () => {
      try {
        const res = await fetch(`${BASE}/stats?period=${period}`, { signal: abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseStats(await res.json());
        if (!parsed) throw new Error('the answer does not match the contract');
        if (alive) setLoad({ stats: parsed, failed: false, loading: false });
      } catch (e) {
        if (!alive) return;
        console.error('Steam IDLE statistics: read failed', e);
        setLoad((prev) => ({ stats: prev.stats, failed: true, loading: false }));
      }
    };
    setLoad((prev) => ({ ...prev, loading: true }));
    void read();
    const timer = window.setInterval(() => { if (!document.hidden) void read(); }, REFRESH_MS);
    return () => { alive = false; abort.abort(); window.clearInterval(timer); };
  }, [period, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...load, reload };
}

/** Forgets the current account's statistics; true when the service accepted it. */
export async function resetIdleStats(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/stats/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) console.error('Steam IDLE statistics: reset refused', res.status);
    return res.ok;
  } catch (e) {
    console.error('Steam IDLE statistics: reset failed', e);
    return false;
  }
}
