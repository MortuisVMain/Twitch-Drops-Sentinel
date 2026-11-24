import { AlertTriangle, Check, ClipboardCopy, FolderOpen, Loader2, RefreshCw, RotateCcw, Stethoscope, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import { hostAvailable, overallStatus, parseDiagnosticsMessage, statusView, type DiagnosticCheck } from '../utils/serviceDiagnostics.mjs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Webview = {
  postMessage: (m: unknown) => void;
  addEventListener: (t: string, h: (e: MessageEvent) => void) => void;
  removeEventListener: (t: string, h: (e: MessageEvent) => void) => void;
};

const getWebview = (): Webview | undefined => (hostAvailable(window) ? ((window as any).chrome.webview as Webview) : undefined);

const TONE_COLOR = { ok: 'var(--led-mint)', warn: 'var(--led-amber)', fail: 'var(--led-rose)' } as const;

// The report goes to the clipboard: the browser API, then a hidden textarea, then the host (the service is down, so it cannot copy)
async function copyReport(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('ServiceDiagnosticsPanel: navigator.clipboard refused', err);
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (ok) return true;
  } catch (err) {
    console.warn('ServiceDiagnosticsPanel: textarea copy failed', err);
  }
  const wv = getWebview();
  if (wv) {
    wv.postMessage({ type: 'COPY_TO_CLIPBOARD', text });
    return true;
  }
  return false;
}

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  const { icon, tone } = statusView(status);
  const Icon = icon === 'check' ? Check : icon === 'alert' ? AlertTriangle : X;
  return <Icon className="ui-icon shrink-0" style={{ color: TONE_COLOR[tone] }} aria-hidden="true" focusable="false" />;
};

// "Проверить" on the dashboard banner: the page cannot ask a service that is down, so the app shell (MainForm.cs) does the diagnosis
export const ServiceDiagnosticsPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(isOpen, dialogRef, onClose);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [report, setReport] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hasHost = hostAvailable(window);

  const run = useCallback(() => {
    const wv = getWebview();
    if (!wv) return;
    setRunning(true);
    setError(null);
    wv.postMessage({ type: 'RUN_DIAGNOSTICS' });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const wv = getWebview();
    if (!wv) return;
    const onMessage = (e: MessageEvent) => {
      let data: unknown = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      const result = parseDiagnosticsMessage(data);
      if (!result) return;
      setChecks(result.checks);
      setReport(result.report);
      setError(result.error);
      setRunning(false);
    };
    wv.addEventListener('message', onMessage);
    run();
    return () => wv.removeEventListener('message', onMessage);
  }, [isOpen, run]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!isOpen) return null;
  const overall = overallStatus(checks);
  const post = (m: unknown) => getWebview()?.postMessage(m);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="diag-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="w-[min(720px,94vw)] max-h-[90vh] outline-none flex flex-col overflow-hidden rounded-2xl border border-(--border-subtle) bg-(--bg-chassis-base)">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-(--border-subtle)">
          <Stethoscope className="ui-icon" aria-hidden="true" focusable="false" />
          <h2 id="diag-title" className="flex-1" style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>Проверка локального сервиса</h2>
          <button className="tactile-btn" onClick={onClose} aria-label="Закрыть"><X className="ui-icon" aria-hidden="true" focusable="false" /></button>
        </div>

        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2.5" aria-live="polite">
          {!hasHost && (
            <p style={{ color: 'var(--text-secondary)' }}>Проверка работает только в приложении Hell Harvest: в браузере у страницы нет доступа к системе.</p>
          )}
          {hasHost && running && (
            <div className="flex items-center gap-2" role="status" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" /> Проверяем службу, порт и файлы…
            </div>
          )}
          {error && <p role="alert" style={{ color: 'var(--led-rose)' }}>Проверка не удалась: {error}</p>}
          {hasHost && !running && checks.length > 0 && (
            <p style={{ color: TONE_COLOR[overall] }}>
              {overall === 'ok' ? 'Всё в порядке.' : overall === 'warn' ? 'Есть предупреждения.' : 'Найдены проблемы.'}
            </p>
          )}
          {checks.map((c) => (
            <div key={c.id} className="flex gap-2.5 rounded-lg border border-(--border-subtle) p-2.5">
              <StatusIcon status={c.status} />
              <div className="min-w-0 flex-1">
                <strong style={{ color: 'var(--text-primary)' }}>{c.title}</strong>
                {c.detail && <div className="whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>{c.detail}</div>}
                {c.advice && c.status !== 'ok' && <div className="whitespace-pre-wrap break-words mt-1" style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-xs)' }}>{c.advice}</div>}
                {c.action === 'close_other' && c.pid != null && (
                  <button className="tactile-btn mt-1.5" disabled={running}
                    onClick={() => { setRunning(true); post({ type: 'CLOSE_OTHER_SERVICE', pid: c.pid }); }}>
                    <X className="ui-icon" aria-hidden="true" focusable="false" /> Закрыть старую копию
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {hasHost && (
          <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-(--border-subtle)">
            <button className="tactile-btn active-mint" onClick={() => post({ type: 'RESTART_SENTINEL' })}>
              <RotateCcw className="ui-icon" aria-hidden="true" focusable="false" /> Перезапустить сервис
            </button>
            <button className="tactile-btn" onClick={() => post({ type: 'OPEN_LOGS_FOLDER' })}>
              <FolderOpen className="ui-icon" aria-hidden="true" focusable="false" /> Открыть папку логов
            </button>
            <button className="tactile-btn" disabled={!report} onClick={async () => setCopied(await copyReport(report))}>
              <ClipboardCopy className="ui-icon" aria-hidden="true" focusable="false" /> {copied ? 'Скопировано' : 'Скопировать отчёт'}
            </button>
            <button className="tactile-btn" disabled={running} onClick={run}>
              <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> Проверить снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
