import { useCallback, useEffect, useRef, useState } from 'react';
import { SteamIdleState } from '../../types';
import { LoadState, initialLoad, loadFailed, loadOk, loadRetry } from '../../utils/dataLoad';

const BASE = 'http://127.0.0.1:28492/api/v1/steam-idle';
const POLL_MS = 3000;

export type SteamIdleCommand = 'ack' | 'login' | 'check' | 'start' | 'stop' | 'pause' | 'resume' | 'skip';
const PATHS: Record<SteamIdleCommand, string> = {
  ack: '/ack', login: '/login', check: '/check',
  start: '/farm/start', stop: '/farm/stop', pause: '/farm/pause', resume: '/farm/resume', skip: '/farm/skip',
};

const isState = (json: unknown): json is SteamIdleState => {
  if (typeof json !== 'object' || json === null) return false;
  const b = json as Record<string, unknown>;
  const farm = b.farm as Record<string, unknown> | null | undefined;
  return typeof b.available === 'boolean' && typeof b.riskAcknowledged === 'boolean'
    && typeof b.steam === 'object' && b.steam !== null && typeof b.community === 'object' && b.community !== null
    && typeof farm === 'object' && farm !== null && typeof farm.state === 'string'
    && Array.isArray(farm.queue) && Array.isArray(farm.done) && Array.isArray(farm.failed);
};

/** Polls the state every 3 s while the tab is shown (one request at a time, none while the window is hidden). */
export function useSteamIdle() {
  const [load, setLoad] = useState<LoadState<SteamIdleState>>(initialLoad);
  const [busy, setBusy] = useState<SteamIdleCommand | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const loop = useRef<{ timer: number | null; abort: AbortController | null; token: number }>({ timer: null, abort: null, token: 0 });
  const alive = useRef(false);

  const stop = useCallback(() => {
    const l = loop.current;
    l.token += 1;
    if (l.timer !== null) window.clearTimeout(l.timer);
    l.timer = null;
    l.abort?.abort();
    l.abort = null;
  }, []);

  const poll = useCallback(async () => {
    stop();
    if (!alive.current) return;
    const l = loop.current;
    const token = l.token;
    const abort = new AbortController();
    l.abort = abort;
    try {
      const res = await fetch(`${BASE}/state`, { signal: abort.signal });
      if (token !== l.token) return;
      if (!res.ok) {
        console.error('Steam IDLE state: the service answered with an error', res.status);
        setLoad((prev) => loadFailed(prev, 'http', res.status));
      } else {
        const json: unknown = await res.json();
        if (token !== l.token) return;
        if (isState(json)) setLoad(loadOk(json));
        else {
          console.error('Steam IDLE state: unexpected answer shape', json);
          setLoad((prev) => loadFailed(prev, 'shape'));
        }
      }
    } catch (e) {
      if (token !== l.token) return;
      console.error('Steam IDLE state: the request failed or the answer is not JSON', e);
      setLoad((prev) => loadFailed(prev, 'network'));
    }
    if (token === l.token && !document.hidden) l.timer = window.setTimeout(() => void poll(), POLL_MS);
  }, [stop]);

  useEffect(() => {
    alive.current = true;
    void poll();
    const onVisibility = () => { if (document.hidden) stop(); else void poll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { alive.current = false; document.removeEventListener('visibilitychange', onVisibility); stop(); };
  }, [poll, stop]);

  const retry = useCallback(() => { setLoad((prev) => loadRetry(prev)); void poll(); }, [poll]);

  const send = useCallback(async (command: SteamIdleCommand) => {
    setBusy(command);
    setRefusal(null);
    try {
      const res = await fetch(`${BASE}${PATHS[command]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: command === 'ack' ? JSON.stringify({ accepted: true }) : undefined,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const code = typeof body.error === 'string' ? body.error : 'failed';
        console.error('Steam IDLE command refused', command, res.status, code);
        setRefusal(code);
      }
    } catch (e) {
      console.error('Steam IDLE command failed', command, e);
      setRefusal('network');
    } finally {
      setBusy(null);
      void poll();
    }
  }, [poll]);

  return { load, busy, refusal, send, retry };
}
