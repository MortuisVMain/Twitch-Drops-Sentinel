import React, { useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import { createPortal } from 'react-dom';
import { X, CircleCheck, CircleX, TriangleAlert, Info, RefreshCw, ClipboardCopy } from 'lucide-react';
import { ReadinessAction, ReadinessItem, ReadinessResponse, StoreId } from '../types';
import { uiLocale, translate } from '../i18n';
import { copyText } from '../utils/loginCode';
import { ReadinessFailure } from '../hooks/useGiveawaysReadiness';
import {
  READINESS_GROUPS, actionLabel, allSitesOk, browserChoiceOf, browserNeedsFreshSignIn, browserOptions, buildReport, countTodo, groupItems, itemStatus,
  itemText, safeUrl, statusLabel, summaryText, TextContext,
} from '../utils/giveawaysReadiness';

interface GiveawaysReadinessProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReadinessResponse | null;
  loading: boolean;
  failure: ReadinessFailure | null;
  actionError: string | null;
  storeNames: Record<string, string>;
  appVersion: string;
  onRecheck: () => void | Promise<void>;
  onInstallEngine: () => void | Promise<void>;
  onSignIn: (store: StoreId) => void;
  onEnableGiveaways: () => void | Promise<void>;
  onEnableScheduler: () => void | Promise<void>;
  onSetBrowser: (browser: string) => void | Promise<unknown>;
  browserBusy: boolean;
}

const FAILURE_TEXT: Record<ReadinessFailure, string> = {
  unreachable: 'Не удалось связаться с сервисом Sentinel. Проверка не выполнена',
  http: 'Сервис Sentinel ответил ошибкой. Проверка не выполнена',
  bad_answer: 'Сервис Sentinel ответил непонятно. Проверка не выполнена',
};

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--led-mint)', todo: 'var(--led-rose)', warning: 'var(--led-amber)', info: 'var(--led-cyan)',
};


// The shape differs per status, so the state never rests on colour alone
const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  const props = { size: 18, 'aria-hidden': true, style: { color: STATUS_COLOR[status] ?? 'var(--text-muted)', flexShrink: 0 } };
  if (status === 'ok') return <CircleCheck {...props} aria-hidden="true" focusable="false" />;
  if (status === 'todo') return <CircleX {...props} aria-hidden="true" focusable="false" />;
  if (status === 'warning') return <TriangleAlert {...props} aria-hidden="true" focusable="false" />;
  return <Info {...props} aria-hidden="true" focusable="false" />;
};

const rowStyle: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '8px 12px', minWidth: 0,
  background: 'var(--bg-row)', border: '1px solid var(--border-subtle)', borderRadius: 10,
};

const SkeletonBlock: React.FC = () => (
  <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {[3, 2, 2].map((rows, g) => (
      <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="animate-pulse motion-reduce:animate-none" style={{ height: 14, width: 120, borderRadius: 6, background: 'var(--bg-well)' }} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="animate-pulse motion-reduce:animate-none" style={{ height: 40, borderRadius: 10, background: 'var(--bg-well)' }} />
        ))}
      </div>
    ))}
  </div>
);

export const GiveawaysReadiness: React.FC<GiveawaysReadinessProps> = (props) => {
  const { isOpen, onClose, data, loading, failure, actionError, storeNames, appVersion } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

  useModalFocus(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  if (!isOpen) return null;

  const formatDate = (when: string | number): string => {
    const d = new Date(when);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const ctx: TextContext = { storeName: (id) => storeNames[id] ?? id, formatDate, engineInstall: data?.engineInstall };

  const showData = Boolean(data) && !failure && !loading;
  const remaining = data ? countTodo(data.items) : 0;
  const groups = data ? groupItems(data.items) : null;

  const runAction = async (action: ReadinessAction) => {
    if (busy) return;
    setBusy(true);
    try {
      if (action.kind === 'open_url') {
        const url = safeUrl(action.url);
        if (url) window.open(url, '_blank');
      } else if (action.kind === 'install_engine') await props.onInstallEngine();
      else if (action.kind === 'sign_in') { onClose(); props.onSignIn(action.store); }
      else if (action.kind === 'enable_giveaways') { await props.onEnableGiveaways(); await props.onRecheck(); }
      else if (action.kind === 'enable_scheduler') { await props.onEnableScheduler(); await props.onRecheck(); }
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!data) return;
    const ok = await copyText(buildReport(data, ctx, appVersion, translate));
    setCopyState(ok ? 'done' : 'failed');
  };

  const renderBrowserPicker = (item: ReadinessItem) => {
    const choice = browserChoiceOf(item);
    const needsSignIn = data ? browserNeedsFreshSignIn(choice, data.items) : false;
    return (
      <div style={{ flex: '1 1 100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}>
          <label htmlFor="readiness-browser" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>Браузер для входа и сбора</label>
          <select
            id="readiness-browser"
            className="tactile-btn"
            value={choice}
            disabled={props.browserBusy || busy}
            aria-describedby={needsSignIn ? 'readiness-browser-note' : undefined}
            onChange={(e) => { void props.onSetBrowser(e.target.value); }}
            style={{ minHeight: 36, maxWidth: '100%', justifyContent: 'flex-start', cursor: props.browserBusy ? 'wait' : 'pointer' }}
          >
            {browserOptions(item).map((option) => (
              <option key={option.id} value={option.id} style={{ background: 'var(--bg-chassis-base)', color: 'var(--text-primary)' }}>{option.text}</option>
            ))}
          </select>
        </div>
        {needsSignIn && (
          <p id="readiness-browser-note" style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', lineHeight: 1.45 }}>
            В этом браузере нужно войти в магазины заново: вход хранится отдельно для каждого браузера.
          </p>
        )}
      </div>
    );
  };

  const renderRow = (item: ReadinessItem, key: string) => {
    const text = itemText(item, ctx);
    const status = itemStatus(item, data?.engineInstall);
    const installing = item.action?.kind === 'install_engine' && Boolean(data?.engineInstall.running);
    return (
      <li key={key} style={rowStyle}>
        <StatusIcon status={status} />
        <div style={{ flex: '1 1 240px', minWidth: 0, overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{text.title}</div>
          {text.lines.map((line, i) => (
            <div key={i} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{line}</div>
          ))}
        </div>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '1px 8px', borderRadius: 999, border: `1px solid ${STATUS_COLOR[status] ?? 'var(--border-main)'}`, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {statusLabel(status)}
        </span>
        {item.action && item.status !== 'ok' && (
          <button
            className={`tactile-btn ${item.status === 'todo' ? 'active-mint' : ''}`}
            disabled={installing || busy}
            onClick={() => runAction(item.action as ReadinessAction)}
          >
            {installing ? 'Устанавливается…' : actionLabel(item.action)}
          </button>
        )}
        {item.id === 'browser' && renderBrowserPicker(item)}
      </li>
    );
  };

  const renderGroup = (id: (typeof READINESS_GROUPS)[number]['id'], title: string) => {
    const items = groups?.[id] ?? [];
    if (!items.length) return null;
    const collapsed = id === 'sites' && allSitesOk(items);
    return (
      <section key={id} aria-labelledby={`readiness-g-${id}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id={`readiness-g-${id}`} style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>{title}</h3>
        {id === 'logins' && (
          <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Это последнее известное состояние входа: сессия могла истечь. Проверяется только во время сбора.
          </p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {collapsed
            ? <li style={rowStyle}><StatusIcon status="ok" /><span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700 }}>Все сайты открываются</span></li>
            : items.map((item, i) => renderRow(item, `${item.id}-${item.store ?? i}`))}
        </ul>
      </section>
    );
  };

  const summaryIcon = failure ? 'todo' : remaining > 0 ? 'todo' : 'ok';
  const summary = failure ? 'Проверка не выполнена' : loading || !data ? 'Проверяем…' : summaryText(remaining);

  // Out of the tab's stacking context: the window has to cover the header too
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'rgba(8, 10, 14, 0.62)', backdropFilter: 'blur(6px)' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="readiness-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(760px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-chassis-base)', color: 'var(--text-primary)', border: '1px solid var(--border-main)', borderRadius: 16, boxShadow: 'var(--shadow-chassis)', outline: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-main)', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="readiness-title" style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 800 }}>Готовность раздач</h2>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Что уже есть и что осталось сделать</div>
          </div>
          <button className="tactile-btn" onClick={onClose} aria-label="Закрыть" style={{ width: 31, padding: 0, flexShrink: 0 }}><X size={16} aria-hidden="true" /></button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px', minWidth: 0 }}>
            {!loading && data && <StatusIcon status={summaryIcon} />}
            <strong style={{ fontSize: 'var(--fs-md)' }}>{summary}</strong>
            {showData && data && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{formatDate(data.checkedAt)}</span>}
          </div>
          <button className="tactile-btn" onClick={() => props.onRecheck()} disabled={loading}><RefreshCw size={14} aria-hidden="true" /> Проверить ещё раз</button>
          <button className="tactile-btn" onClick={handleCopy} disabled={!showData}>
            <ClipboardCopy size={14} aria-hidden="true" />
            {copyState === 'done' ? 'Скопировано' : copyState === 'failed' ? 'Не удалось скопировать' : 'Скопировать отчёт'}
          </button>
        </div>

        <div className="scrollbar-thin" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {actionError && (
            <div role="alert" style={{ ...rowStyle, color: 'var(--text-primary)', borderColor: 'var(--led-amber)' }}>
              <TriangleAlert size={18} aria-hidden="true" style={{ color: 'var(--led-amber)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--fs-xs)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{actionError}</span>
            </div>
          )}
          {loading && <SkeletonBlock />}
          {!loading && failure && (
            <div role="alert" style={{ ...rowStyle, borderColor: 'var(--led-rose)' }}>
              <CircleX size={18} aria-hidden="true" style={{ color: 'var(--led-rose)', flexShrink: 0 }} />
              <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: 'var(--fs-sm)' }}>{FAILURE_TEXT[failure]}</span>
              <button className="tactile-btn active-mint" onClick={() => props.onRecheck()}>Повторить</button>
            </div>
          )}
          {showData && READINESS_GROUPS.map((g) => renderGroup(g.id, g.title))}
        </div>
      </div>
    </div>,
    document.body
  );
};
