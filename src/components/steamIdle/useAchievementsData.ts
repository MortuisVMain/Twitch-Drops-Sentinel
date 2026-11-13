import { useCallback, useEffect, useRef, useState } from 'react';
import { SteamIdleAchievement, SteamIdleLibraryGame } from '../../types';
import { parseAchievementList, parseLibrary } from './achievementsParse';
import { BASE } from './useSteamIdle';

const GET_TIMEOUT_MS = 20000;

export interface GetState<T> { status: 'idle' | 'loading' | 'ready' | 'error'; data: T | null; error: string | null }
const IDLE: GetState<never> = { status: 'idle', data: null, error: null };
const LOADING: GetState<never> = { status: 'loading', data: null, error: null };

/** One on-demand GET per hook. Changing `path` (or `gen`, or calling reload) aborts the request in flight and starts the
 * next, so requests never pile up and an answer for an old path is never shown. A null path means nothing to load.
 * Errors are codes: the service's 409 `error`, or timeout / network / shape / failed. `parse` must be a stable function. */
export function useGet<T>(path: string | null, parse: (json: unknown) => T | null, gen = 0): GetState<T> & { reload: () => void } {
  const [held, setHeld] = useState<{ path: string | null; state: GetState<T> }>({ path: null, state: IDLE });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (path === null) { setHeld({ path: null, state: IDLE }); return undefined; }
    const put = (state: GetState<T>) => setHeld({ path, state });
    const abort = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; abort.abort(); }, GET_TIMEOUT_MS);
    const superseded = () => abort.signal.aborted && !timedOut;
    const fail = (code: string, detail: unknown) => {
      console.error('Steam IDLE read failed', path, code, detail);
      put({ status: 'error', data: null, error: code });
    };
    put(LOADING);
    void (async () => {
      try {
        const res = await fetch(`${BASE}${path}`, { signal: abort.signal });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: unknown };
          if (!superseded()) fail(typeof body.error === 'string' ? body.error : 'failed', res.status);
          return;
        }
        const data = parse(await res.json());
        if (superseded()) return;
        if (data === null) fail('shape', 'unexpected response');
        else put({ status: 'ready', data, error: null });
      } catch (e) {
        if (!superseded()) fail(timedOut ? 'timeout' : 'network', e);
      } finally {
        window.clearTimeout(timer);
      }
    })();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [path, parse, gen, tick]);

  // A render between a path change and its effect must not show the old path's answer.
  const state = held.path === path ? held.state : path === null ? IDLE : LOADING;
  return { ...state, reload };
}

/** A counter that goes up each time `value` changes from something else to `target` (not on mount). */
export function useArrivals<V>(value: V, target: (v: V) => boolean): number {
  const [count, setCount] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (!target(prev.current) && target(value)) setCount((c) => c + 1);
    prev.current = value;
  }, [value, target]);
  return count;
}

/** A read refused with 409 busy is retried once no run is on (1.5 s later, at most 3 tries until an answer is read), so the
 * list recovers by itself after the run ends even when the refusal arrived after it did. */
export function useBusyRetry(get: { status: GetState<unknown>['status']; error: string | null; reload: () => void }, runActive: boolean): void {
  const tries = useRef(0);
  const { status, error, reload } = get;
  const busy = status === 'error' && error === 'busy';
  useEffect(() => {
    if (status === 'ready') tries.current = 0;
    if (!busy || runActive || tries.current >= 3) return undefined;
    const timer = window.setTimeout(() => { tries.current += 1; reload(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [busy, runActive, status, reload]);
}

export const useLibraryGames =(ready: boolean, gen: number) => useGet<SteamIdleLibraryGame[]>(ready ? '/library' : null, parseLibrary, gen);

export const useAchievementList = (appId: number | null, gen: number) =>
  useGet<SteamIdleAchievement[]>(appId === null ? null : `/achievements?appId=${appId}`, parseAchievementList, gen);
