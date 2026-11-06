import { useEffect, useMemo, useRef, useState } from 'react';
import type { SentinelLogEntry } from '../types';
import { mergeConsoleLogs } from '../utils/consoleLog';

const RETRY_MS = 5000;

interface LogsAnswer {
  session: string;
  last_seq: number;
  reset: boolean;
  entries: SentinelLogEntry[];
}

const isAnswer = (body: unknown): body is LogsAnswer => {
  const b = body as Partial<LogsAnswer> | null;
  return !!b && typeof b.session === 'string' && typeof b.last_seq === 'number' && typeof b.reset === 'boolean' && Array.isArray(b.entries);
};

/**
 * The console's journal. /api/state (polled every 3 s) carries a short tail and a cursor (seq, session); the hours behind it come from
 * GET /api/logs?after=<seq>&session=<id>, asked only when the cursor moved. Without a cursor (an older service) the tail is all there is.
 */
export function useConsoleLogs(logSeq: number | undefined, logSession: string | undefined, tail: SentinelLogEntry[] | undefined) {
  const [history, setHistory] = useState<SentinelLogEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = useRef<{ session: string | null; seq: number }>({ session: null, seq: 0 });
  const target = useRef<{ session: string | undefined; seq: number | undefined }>({ session: undefined, seq: undefined });
  const syncing = useRef(false);
  const mounted = useRef(true);
  target.current = { session: logSession, seq: logSeq };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!logSession || logSeq === undefined || syncing.current) return;
    if (cursor.current.session === logSession && cursor.current.seq >= logSeq) return;
    syncing.current = true;
    const asked = { session: logSession, seq: logSeq };
    (async () => {
      try {
        const { session, seq } = cursor.current;
        const query = session ? `after=${seq}&session=${encodeURIComponent(session)}` : 'after=0';
        const res = await fetch(`http://127.0.0.1:28492/api/logs?${query}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isAnswer(body)) throw new Error('unexpected /api/logs answer');
        if (!mounted.current) return;
        setHistory((prev) => mergeConsoleLogs(prev, body.entries, body.reset));
        cursor.current = { session: body.session, seq: body.last_seq };
        setFailed(false);
        // the cursor moved again while this request was out: ask once more
        if (target.current.session !== asked.session || target.current.seq !== asked.seq) setRetry((n) => n + 1);
      } catch (err) {
        console.warn('useConsoleLogs: не удалось получить историю журнала', err);
        if (mounted.current) {
          setFailed(true);
          setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
        }
      } finally {
        syncing.current = false;
      }
    })();
  }, [logSeq, logSession, retry]);

  const logs = useMemo(() => (logSession && history.length ? history : tail ?? []), [logSession, history, tail]);
  return { logs, historyFailed: failed };
}
