import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ClipboardCopy, Trash2 } from 'lucide-react';
import { SteamIdleState } from '../../types';
import { copyText } from '../../utils/loginCode';
import { clockTime, copyReport, farmStateLine } from './activityLog.mjs';
import { useActivityLog } from './useActivityLog';

const OPEN_KEY = 'sentinel_steamidle_log_open';
const FEEDBACK_MS = 2000;
const LEVEL_TAG = { info: 'INFO', warning: 'WARN', error: 'ERROR' } as const;

const readOpen = (): boolean => {
  try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
};

/** The collapsible activity console at the bottom of the tab: what the module is doing, with Copy for bug reports and Clear. */
export const ActivityConsole: React.FC<{ s: SteamIdleState; appVersion?: string }> = ({ s, appVersion }) => {
  const [open, setOpen] = useState(readOpen);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const { entries, failed, clear } = useActivityLog(open);
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const feedback = useRef<number | null>(null);

  useEffect(() => () => { if (feedback.current !== null) window.clearTimeout(feedback.current); }, []);
  useEffect(() => {
    if (box.current && atBottom.current) box.current.scrollTop = box.current.scrollHeight;
  }, [entries, open]);

  const toggle = () => {
    const next = !open;
    atBottom.current = true;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch (e) { console.warn('Steam IDLE log: panel state not saved', e); }
  };
  const onScroll = () => {
    const el = box.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 40;
  };
  const onCopy = async () => {
    const text = copyReport({ appVersion, now: new Date(), state: farmStateLine(s.farm, s.achievements?.run), entries });
    setCopied((await copyText(text)) ? 'ok' : 'fail');
    if (feedback.current !== null) window.clearTimeout(feedback.current);
    feedback.current = window.setTimeout(() => setCopied('idle'), FEEDBACK_MS);
  };

  return (
    <section className="titanium-island sidle-log" aria-labelledby="sidle-log-title">
      <div className="sidle-log-head">
        <h2 id="sidle-log-title" className="sidle-title">
          <button type="button" className="sidle-log-toggle" aria-expanded={open} aria-controls="sidle-log-body" onClick={toggle}>
            {open ? <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronRight className="ui-icon" aria-hidden="true" focusable="false" />}
            Журнал
          </button>
          {open && entries.length > 0 && <span className="sidle-count">{entries.length}</span>}
        </h2>
        {open && (
          <div className="sidle-actions">
            <button type="button" className={`tactile-btn${copied === 'ok' ? ' active-mint' : ''}`} onClick={() => void onCopy()}>
              {copied === 'ok' ? <Check className="ui-icon" aria-hidden="true" focusable="false" /> : <ClipboardCopy className="ui-icon" aria-hidden="true" focusable="false" />}
              {copied === 'ok' ? 'Скопировано' : copied === 'fail' ? 'Не удалось скопировать' : 'Копировать'}
            </button>
            <button type="button" className="tactile-btn" aria-disabled={entries.length === 0} onClick={() => { if (entries.length > 0) void clear(); }}>
              <Trash2 className="ui-icon" aria-hidden="true" focusable="false" />
              Очистить
            </button>
          </div>
        )}
      </div>
      {open && (
        <div id="sidle-log-body" ref={box} className="obsidian-well sidle-log-box" role="log" aria-label="Журнал" tabIndex={0} onScroll={onScroll}>
          {failed && <p className="sidle-refusal">Не удалось получить журнал</p>}
          {entries.length === 0
            ? <p className="sidle-log-empty">Пока пусто — действия появятся здесь</p>
            : entries.map((e) => (
              <div key={e.seq} className={`sidle-log-line ${e.level}`}>
                <span className="sidle-log-time">{clockTime(e.ts)}</span>
                <span className="sidle-log-level">{LEVEL_TAG[e.level]}</span>
                <span className="sidle-log-text">{e.text}</span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
};
