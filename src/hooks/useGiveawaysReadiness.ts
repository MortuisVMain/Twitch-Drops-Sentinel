import { useCallback, useEffect, useRef, useState } from 'react';
import { ReadinessResponse } from '../types';

const API = 'http://127.0.0.1:28492/api/v1/giveaways';
const REQUEST_TIMEOUT_MS = 25000;
const INSTALL_POLL_MS = 5000;
const STALE_AFTER_MS = 30000;

export type ReadinessFailure = 'unreachable' | 'bad_answer' | 'http';

/**
 * Readiness of the Giveaways tab. A full check makes the service open the store sites, so it runs only for the open window:
 * on opening (unless the last full answer is fresh), per click, and once when the engine install ends. The check when the tab
 * opens and the 5 s refresh during the install are quick (?quick=1: no sites), and nothing polls on a timer otherwise.
 */
export function useGiveawaysReadiness(windowOpen: boolean) {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<ReadinessFailure | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastFullAt = useRef(0);
  const wasInstalling = useRef(false);
  const dataRef = useRef<ReadinessResponse | null>(null);
  const requestId = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** quick: no store sites asked. silent: refresh without the skeleton (the install progress poll) */
  const check = useCallback(async (quick = false, silent = false) => {
    const mine = ++requestId.current;
    if (!silent) setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${API}/readiness${quick ? '?quick=1' : ''}`, { signal: controller.signal });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { failure: 'http' as ReadinessFailure });
      const json = await res.json();
      if (!json || !Array.isArray(json.items) || typeof json.remaining !== 'number') {
        throw Object.assign(new Error('unexpected readiness payload'), { failure: 'bad_answer' as ReadinessFailure });
      }
      if (!alive.current || mine !== requestId.current) return;
      let next = json as ReadinessResponse;
      const previous = dataRef.current;
      if (quick && previous?.full) {
        // A quick answer has no site items: keep the last full ones so the window does not lose them
        const sites = previous.items.filter((item) => item.id === 'site');
        const rest = next.items.filter((item) => item.id !== 'site');
        const at = rest.findIndex((item) => item.id === 'scheduler');
        next = { ...next, full: true, items: at < 0 ? [...rest, ...sites] : [...rest.slice(0, at), ...sites, ...rest.slice(at)] };
      }
      if (!quick) lastFullAt.current = Date.now();
      const finished = wasInstalling.current && !next.engineInstall.running;
      wasInstalling.current = next.engineInstall.running;
      dataRef.current = next;
      setData(next);
      setFailure(null);
      // The install ended: one full check shows where things stand now
      if (finished) check(false, false);
    } catch (err: any) {
      console.error('useGiveawaysReadiness: проверка готовности не выполнена', err);
      if (!alive.current || mine !== requestId.current) return;
      // A failed progress poll keeps the last answer on screen; the next poll or a click tries again
      if (!silent) setFailure(err?.failure ?? 'unreachable');
    } finally {
      clearTimeout(timer);
      if (alive.current && mine === requestId.current) setLoading(false);
    }
  }, []);

  // Once when the tab opens: quick, the dot on the button needs a result and no site is asked
  useEffect(() => { check(true); }, [check]);

  // Opening the window: a full check unless the last full answer is fresh
  useEffect(() => {
    if (windowOpen && (failure || Date.now() - lastFullAt.current > STALE_AFTER_MS)) check(false);
  }, [windowOpen]);

  const installing = Boolean(data?.engineInstall.running);
  useEffect(() => {
    if (!windowOpen || !installing) return;
    const timer = setInterval(() => check(true, true), INSTALL_POLL_MS);
    return () => clearInterval(timer);
  }, [windowOpen, installing, check]);

  const installEngine = useCallback(async () => {
    setActionError(null);
    try {
      const res = await fetch(`${API}/install-engine`, { method: 'POST' });
      if (res.status === 409) setActionError('Сейчас идёт сбор или вход в магазин. Дождитесь конца и повторите');
      else if (res.status === 412) setActionError('Сначала нужен Node.js');
      else if (!res.ok) setActionError('Не удалось запустить установку движка');
    } catch (err) {
      console.error('useGiveawaysReadiness: установка движка не запущена', err);
      setActionError('Сервис не отвечает, установка не началась');
    }
    await check(true, true);
  }, [check]);

  // A quick answer is no answer for the window: it shows the skeleton until the full check arrives
  const waitingForFull = windowOpen && !failure && data !== null && !data.full;
  return { data, loading: loading || waitingForFull, failure, actionError, setActionError, check, installEngine };
}
