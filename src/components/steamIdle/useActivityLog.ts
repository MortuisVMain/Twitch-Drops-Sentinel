import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityEntry, mergeEntries, parseLogReply } from './activityLog.mjs';
import { BASE } from './useSteamIdle';

const POLL_MS = 3000;

/** The module's activity log. Polls GET /log?after=<last seq> once on `active` and then every 3 s (none while the window
 * is hidden or `active` is false), appending what is new. Clear empties the service log and the view. */
export function useActivityLog(active: boolean) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const lastSeq = useRef<number | null>(null);
  const generation = useRef(0); // a poll that began before a clear must not bring cleared lines back

  useEffect(() => {
    if (!active) return;
    let timer: number | null = null;
    let cancelled = false;
    let outageLogged = false;
    let inFlight = false; // a visibility change during a poll must not start a second polling chain
    const abort = new AbortController();
    const schedule = (ms: number) => { if (!cancelled && !document.hidden) timer = window.setTimeout(() => void tick(), ms); };
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      timer = null;
      const gen = generation.current;
      let delay = POLL_MS;
      try {
        const res = await fetch(lastSeq.current === null ? `${BASE}/log` : `${BASE}/log?after=${lastSeq.current}`, { signal: abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reply = parseLogReply(await res.json());
        if (!reply) throw new Error('the answer does not match the log contract');
        if (cancelled) return;
        if (lastSeq.current !== null && reply.lastSeq < lastSeq.current) { // the service restarted and counts from 1 again
          lastSeq.current = null;
          setEntries([]);
          delay = 0;
        } else if (gen === generation.current) {
          lastSeq.current = reply.lastSeq;
          if (reply.entries.length) setEntries((prev) => mergeEntries(prev, reply.entries));
        }
        outageLogged = false;
        setFailed(false);
      } catch (e) {
        if (cancelled) return;
        if (!outageLogged) { outageLogged = true; console.error('Steam IDLE log: could not be read (further failures in this outage are not logged)', e); }
        setFailed(true);
      }
      inFlight = false;
      schedule(delay);
    };
    const onVisibility = () => {
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void tick();
    return () => {
      cancelled = true;
      abort.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);

  const clear = useCallback(async () => {
    generation.current += 1;
    try {
      const res = await fetch(`${BASE}/log/clear`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      generation.current += 1;
      setEntries([]);
    } catch (e) {
      console.error('Steam IDLE log: could not be cleared', e);
      setFailed(true);
    }
  }, []);

  return { entries, failed, clear };
}
