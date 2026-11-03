import { useCallback, useEffect, useRef, useState } from 'react';
import { ReadinessResponse } from '../types';

const API = 'http://127.0.0.1:28492/api/v1/giveaways';
const REQUEST_TIMEOUT_MS = 25000;
const INSTALL_POLL_MS = 5000;
const STALE_AFTER_MS = 30000;

export type ReadinessFailure = 'unreachable' | 'bad_answer' | 'http';

/**
 * Readiness of the Giveaways tab. Every check makes the service open the store sites, so nothing here polls on a timer:
 * one check when the tab opens, one per click, and a 5 s refresh only while the window is open and the engine is installing.
 */
export function useGiveawaysReadiness(windowOpen: boolean) {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<ReadinessFailure | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastCheckAt = useRef(0);
  const requestId = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** silent: refresh without the skeleton (the install progress poll) */
  const check = useCallback(async (silent = false) => {
    const mine = ++requestId.current;
    if (!silent) setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${API}/readiness`, { signal: controller.signal });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { failure: 'http' as ReadinessFailure });
      const json = await res.json();
      if (!json || !Array.isArray(json.items) || typeof json.remaining !== 'number') {
        throw Object.assign(new Error('unexpected readiness payload'), { failure: 'bad_answer' as ReadinessFailure });
      }
      if (!alive.current || mine !== requestId.current) return;
      lastCheckAt.current = Date.now();
      setData(json as ReadinessResponse);
      setFailure(null);
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

  // Once when the tab opens (the dot on the button needs a result)
  useEffect(() => { check(); }, [check]);

  // Opening the window: look again unless the last answer is fresh
  useEffect(() => {
    if (windowOpen && (failure || Date.now() - lastCheckAt.current > STALE_AFTER_MS)) check();
  }, [windowOpen]);

  const installing = Boolean(data?.engineInstall.running);
  useEffect(() => {
    if (!windowOpen || !installing) return;
    const timer = setInterval(() => check(true), INSTALL_POLL_MS);
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
    await check(true);
  }, [check]);

  return { data, loading, failure, actionError, setActionError, check, installEngine };
}
