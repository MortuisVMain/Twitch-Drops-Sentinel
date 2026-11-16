import { useCallback, useEffect, useRef, useState } from 'react';
import { SteamIdleState } from '../../types';
import { LoadState, initialLoad, loadFailed, loadOk, loadRetry } from '../../utils/dataLoad';
import { isLibraryStatus, parseAchievements } from './achievementsParse';
import { refusalApplies } from './steamIdleText';

export const BASE = 'http://127.0.0.1:28492/api/v1/steam-idle';
const POLL_MS = 3000;
const SLOW_POLL_MS = 15000;
const SLOW_AFTER_FAILS = 3;
const COMMAND_TIMEOUT_MS = 15000;

export type SteamIdleCommand = 'ack' | 'login' | 'check' | 'scan' | 'start' | 'stop' | 'pause' | 'resume' | 'skip' | 'release'
  | 'achAck' | 'achSettings' | 'libScan' | 'achStart' | 'achStop' | 'achPause' | 'achResume' | 'achSkip'
  | 'achResumeInterrupted' | 'achDiscardInterrupted';
const PATHS: Record<SteamIdleCommand, string> = {
  ack: '/ack', login: '/login', check: '/check', scan: '/scan',
  start: '/farm/start', stop: '/farm/stop', pause: '/farm/pause', resume: '/farm/resume', skip: '/farm/skip', release: '/farm/release',
  achAck: '/achievements/ack', achSettings: '/achievements/settings', libScan: '/library/scan', achStart: '/achievements/start',
  achStop: '/achievements/stop', achPause: '/achievements/pause', achResume: '/achievements/resume', achSkip: '/achievements/skip',
  achResumeInterrupted: '/achievements/resume-interrupted', achDiscardInterrupted: '/achievements/discard-interrupted',
};

export type SendCommand = (command: SteamIdleCommand, body?: unknown) => void;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown): boolean => v === null || isNum(v);
const hasGame = (g: unknown): g is Rec => isRec(g) && isNum(g.appId) && typeof g.name === 'string';
const REASONS = ['helper_missing', 'node_missing', 'unsupported'];
const PREVIEW_STATUSES = ['none', 'scanning', 'ready', 'failed'];
const isPreview = (p: unknown): boolean => isRec(p) && typeof p.status === 'string' && PREVIEW_STATUSES.includes(p.status)
  && isNumOrNull(p.ageSeconds) && (p.error === null || typeof p.error === 'string') && isNum(p.totalDropsRemaining)
  && Array.isArray(p.games) && p.games.every((g) => hasGame(g) && isNum(g.dropsRemaining) && isNum(g.playtimeHours));
let achShapeLogged = false;
const SESSIONS = ['unknown', 'checking', 'signed_in', 'signed_out', 'login_open', 'account_mismatch', 'engine_missing', 'error'];

/** Checks the whole contract (progress.txt, "Service API contract v1"). Only library, totalDropsRemaining and
 * lastReadAgeSeconds may be absent: they get neutral defaults so their lines are simply omitted. farm.state may be any string.
 * The whole preview and achievements keys may be absent (older service): their sections are then not shown. */
export const parseState = (json: unknown): SteamIdleState | null => {
  if (!isRec(json) || !isRec(json.steam) || !isRec(json.community) || !isRec(json.farm)) return null;
  const { steam, community, farm } = json;
  const optNum = (v: unknown) => v === undefined || isNum(v);
  const optNumOrNull = (v: unknown) => v === undefined || isNumOrNull(v);
  const ok = typeof json.available === 'boolean' && typeof json.riskAcknowledged === 'boolean'
    && (json.unavailableReason === null || (typeof json.unavailableReason === 'string' && REASONS.includes(json.unavailableReason)))
    && typeof steam.running === 'boolean' && typeof steam.signedIn === 'boolean'
    && typeof community.session === 'string' && SESSIONS.includes(community.session) && optNumOrNull(community.checkedAgeSeconds)
    && typeof farm.state === 'string'
    && (farm.current === null || (hasGame(farm.current) && isNum(farm.current.dropsRemaining) && isNum(farm.current.heldSeconds)))
    && Array.isArray(farm.queue) && farm.queue.every((g) => hasGame(g) && isNum(g.dropsRemaining))
    && Array.isArray(farm.done) && farm.done.every(hasGame)
    && Array.isArray(farm.failed) && farm.failed.every((g) => hasGame(g) && typeof g.reason === 'string')
    && (farm.refundHeld === undefined || (Array.isArray(farm.refundHeld) && farm.refundHeld.every((g) => hasGame(g) && typeof g.reason === 'string' && isNum(g.daysLeft))))
    && optNum(farm.totalDropsRemaining) && optNumOrNull(farm.lastReadAgeSeconds)
    && (farm.lastError === null || typeof farm.lastError === 'string')
    && (json.library === undefined || (isRec(json.library) && isNumOrNull(json.library.count)
      && (json.library.status === undefined || isLibraryStatus(json.library.status)) && optNumOrNull(json.library.ageSeconds)))
    && (json.preview === undefined || isPreview(json.preview));
  if (!ok) return null;
  // The achievements key is judged on its own: a bad one hides that section only, the rest of the tab still renders.
  const achievements = json.achievements === undefined ? undefined : parseAchievements(json.achievements);
  if (achievements === null) {
    if (!achShapeLogged) { achShapeLogged = true; console.error('Steam IDLE state: achievements key does not match the contract, section hidden', json.achievements); }
  } else achShapeLogged = false;
  const base = json as unknown as SteamIdleState;
  return {
    ...base,
    achievements: achievements ?? undefined,
    community: { ...base.community, checkedAgeSeconds: isNum(community.checkedAgeSeconds) ? community.checkedAgeSeconds : null },
    farm: {
      ...base.farm,
      refundHeld: Array.isArray(farm.refundHeld) ? base.farm.refundHeld : [],
      totalDropsRemaining: isNum(farm.totalDropsRemaining) ? farm.totalDropsRemaining : 0,
      lastReadAgeSeconds: isNum(farm.lastReadAgeSeconds) ? farm.lastReadAgeSeconds : null,
    },
    library: {
      count: isRec(json.library) && isNum(json.library.count) ? json.library.count : null,
      ...(isRec(json.library) && isLibraryStatus(json.library.status) ? { status: json.library.status } : {}),
      ...(isRec(json.library) && isNum(json.library.ageSeconds) ? { ageSeconds: json.library.ageSeconds } : {}),
    },
  };
};

/** Polls the state every 3 s while the tab is shown (one request at a time, none while the window is hidden).
 * After 3 failed polls in a row it slows to 15 s until one succeeds, and logs once per outage. */
export function useSteamIdle() {
  const [load, setLoad] = useState<LoadState<SteamIdleState>>(initialLoad);
  const [busy, setBusy] = useState<SteamIdleCommand | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const loop = useRef<{ timer: number | null; abort: AbortController | null; token: number }>({ timer: null, abort: null, token: 0 });
  const alive = useRef(false);
  const fails = useRef(0);
  const outageLogged = useRef(false);
  const inFlight = useRef(false);
  const sendAbort = useRef<AbortController | null>(null);

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
    const fail = (kind: 'http' | 'network' | 'shape', detail: unknown, status?: number) => {
      fails.current += 1;
      if (!outageLogged.current) {
        outageLogged.current = true;
        console.error(`Steam IDLE state: ${kind} failure (further failures in this outage are not logged)`, detail);
      }
      setLoad((prev) => loadFailed(prev, kind, status ?? null));
    };
    try {
      const res = await fetch(`${BASE}/state`, { signal: abort.signal });
      if (token !== l.token) return;
      if (!res.ok) fail('http', res.status, res.status);
      else {
        const json: unknown = await res.json();
        if (token !== l.token) return;
        const parsed = parseState(json);
        if (parsed) {
          fails.current = 0;
          outageLogged.current = false;
          setLoad(loadOk(parsed));
        } else fail('shape', json);
      }
    } catch (e) {
      if (token !== l.token) return;
      fail('network', e);
    }
    if (token === l.token && !document.hidden) {
      l.timer = window.setTimeout(() => void poll(), fails.current >= SLOW_AFTER_FAILS ? SLOW_POLL_MS : POLL_MS);
    }
  }, [stop]);

  useEffect(() => {
    alive.current = true;
    void poll();
    const onVisibility = () => { if (document.hidden) stop(); else void poll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
      sendAbort.current?.abort();
    };
  }, [poll, stop]);

  // An error that referred to a state that has since changed (for example the risk gate went away) no longer applies.
  // It is cleared only on that change: a refusal the shown state never agreed with (the poll may lag behind the
  // service) stays visible until the next command, otherwise the click would appear to do nothing.
  const data = load.data;
  const refusalMatched = useRef(false);
  useEffect(() => {
    if (refusal === null || !data) { refusalMatched.current = false; return; }
    if (refusalApplies(refusal, data)) refusalMatched.current = true;
    else if (refusalMatched.current) setRefusal(null);
  }, [refusal, data]);

  const retry = useCallback(() => { setLoad((prev) => loadRetry(prev)); void poll(); }, [poll]);

  const send = useCallback(async (command: SteamIdleCommand, body?: unknown) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(command);
    setRefusal(null);
    const abort = new AbortController();
    sendAbort.current = abort;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; abort.abort(); }, COMMAND_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${PATHS[command]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: command === 'ack' || command === 'achAck' ? JSON.stringify({ accepted: true }) : body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const code = typeof body.error === 'string' ? body.error : 'failed';
        console.error('Steam IDLE command refused', command, res.status, code);
        if (alive.current) setRefusal(code);
      }
    } catch (e) {
      if (timedOut) {
        console.error('Steam IDLE command timed out', command);
        if (alive.current) setRefusal('timeout');
      } else if (alive.current) {
        console.error('Steam IDLE command failed', command, e);
        setRefusal('network');
      }
    } finally {
      window.clearTimeout(timer);
      sendAbort.current = null;
      inFlight.current = false;
      if (alive.current) {
        setBusy(null);
        if (!document.hidden) void poll();
      }
    }
  }, [poll]);

  return { load, busy, refusal, send, retry };
}
