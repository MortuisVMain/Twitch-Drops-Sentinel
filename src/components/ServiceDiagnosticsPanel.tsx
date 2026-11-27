import { Loader2, Stethoscope, Wrench, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import type { SentinelSettings } from '../types';
import {
  controlsBusy, countProblems, groupChecks, hostAvailable, noticeFor, noticeOrphan, overallStatus, parseDiagnosticsMessage, parseFixResult, planFix,
  type DiagnosticCheck, type DiagnosticFix, type FixResult,
} from '../utils/serviceDiagnostics.mjs';
import { SECTIONS, lastCheckTime, nextSection, parseExportResult, parseHistory } from '../utils/healthCenter.mjs';
import { useConfirm } from './ConfirmDialog';
import { HealthWatchCard } from './HealthWatchCard';
import { AREA_TITLE, DeveloperSection, FixNotice, MaintenanceSection, StatusIcon, SummarySection, type HealthEvent } from './HealthCenterParts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The service's health_watch state: the time of the last background or manual check. */
  watch?: { lastRun: number | null; lastManual?: number | null };
  settings?: SentinelSettings;
  onUpdateSettings?: (patch: Partial<SentinelSettings>) => void;
  playClick?: () => void;
}

type Webview = {
  postMessage: (m: unknown) => void;
  addEventListener: (t: string, h: (e: MessageEvent) => void) => void;
  removeEventListener: (t: string, h: (e: MessageEvent) => void) => void;
};

const getWebview = (): Webview | undefined => (hostAvailable(window) ? ((window as any).chrome.webview as Webview) : undefined);

const OPENED_AND_COPIED = 'Страница входа открыта, код скопирован: вставьте его на странице.';
const OPENED_NOT_COPIED = 'Страница входа открыта, но код скопировать не удалось: введите его вручную.';
const OPENED_NO_CODE = 'Страница входа открыта.';
const HISTORY_URL = 'http://127.0.0.1:28492/api/v1/health/history';

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

// The health center: opened from the header button, Ctrl+Shift+H, the command palette, the dashboard banner and a click on the problem toast.
// The page cannot ask a service that is down, so the app shell (MainForm.cs) does the diagnosis and the file work.
export const ServiceDiagnosticsPanel: React.FC<Props> = ({ isOpen, onClose, watch, settings, onUpdateSettings, playClick }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { ask, confirmDialog, asking } = useConfirm();
  // While the question is open it owns Escape and Tab
  useModalFocus(isOpen && !asking, dialogRef, onClose);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [section, setSection] = useState<string>('summary');
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [report, setReport] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [notice, setNotice] = useState<FixResult | null>(null);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [localCheck, setLocalCheck] = useState<number | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{ kind: string; ok: boolean; message: string } | null>(null);
  const hasHost = hostAvailable(window);

  const run = useCallback(() => {
    const wv = getWebview();
    if (!wv) return;
    setRunning(true);
    setError(null);
    setNotice(null);
    wv.postMessage({ type: 'RUN_DIAGNOSTICS' });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(HISTORY_URL);
      if (res.ok) setEvents(parseHistory(await res.json()));
    } catch (err) {
      console.warn('ServiceDiagnosticsPanel: the history is unavailable (the service may be down)', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSection('summary');
    setExportResult(null);
    const wv = getWebview();
    if (!wv) return;
    const onMessage = (e: MessageEvent) => {
      let data: unknown = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      const exported = parseExportResult(data);
      if (exported) {
        setExportResult(exported);
        setExporting(null);
        return;
      }
      const fixResult = parseFixResult(data);
      if (fixResult) {
        setNotice(fixResult);
        setFixing(null);  // the host now runs the checks again: the panel stays busy until DIAGNOSTICS_RESULT
        return;
      }
      const result = parseDiagnosticsMessage(data);
      if (!result) return;
      setChecks(result.checks);
      setReport(result.report);
      setError(result.error);
      setRunning(false);
      setLocalCheck(Math.floor(Date.now() / 1000));
      void loadHistory();
    };
    wv.addEventListener('message', onMessage);
    run();
    return () => wv.removeEventListener('message', onMessage);
  }, [isOpen, run, loadHistory]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!isOpen) return null;
  const overall = overallStatus(checks);
  const counts = countProblems(checks);
  const post = (m: unknown) => getWebview()?.postMessage(m);
  const busy = controlsBusy(running, fixing);
  const lastCheck = Math.max(lastCheckTime(watch) ?? 0, localCheck ?? 0) || null;
  const windowReset = checks.find((c) => c.fix?.id === 'webview_reset')?.fix ?? null;

  const startFix = async (fix: DiagnosticFix) => {
    const plan = planFix(fix, busy);
    if (!plan) return;
    if (plan.confirm && !(await ask(plan.confirm, 'Выполнить'))) return;
    setNotice(null);
    plan.messages.forEach(post);
    if (fix.client) {  // the Twitch sign-in page: the host opens it, the page copies the code
      const said = (ok: boolean, message: string) => setNotice({ id: fix.id, ok, message, restart: false });
      if (plan.copy) void copyReport(plan.copy).then((ok) => said(ok, ok ? OPENED_AND_COPIED : OPENED_NOT_COPIED));
      else said(true, OPENED_NO_CODE);
      return;
    }
    setFixing(fix.id);
    setRunning(true);
    setError(null);
  };

  const startExport = (type: 'SAVE_HEALTH_REPORT' | 'COLLECT_HEALTH_LOGS' | 'REPORT_HEALTH_PROBLEM') => {
    setExportResult(null);
    setExporting(type === 'SAVE_HEALTH_REPORT' ? 'report' : type === 'COLLECT_HEALTH_LOGS' ? 'logs' : 'issue');
    post({ type });
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const next = nextSection(section, e.key);
    if (!next) return;
    e.preventDefault();
    setSection(next);
    tabRefs.current[next]?.focus();
  };

  const restart = () => post({ type: 'RESTART_SENTINEL' });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3" onClick={onClose}>
      {confirmDialog}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="diag-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="w-[min(720px,94vw)] h-[min(640px,90vh)] outline-none flex flex-col overflow-hidden rounded-2xl border border-(--border-subtle) bg-(--bg-chassis-base)">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-(--border-subtle)">
          <Stethoscope className="ui-icon" aria-hidden="true" focusable="false" />
          <h2 id="diag-title" className="flex-1" style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>Центр проверки</h2>
          <button className="tactile-btn" onClick={onClose} aria-label="Закрыть"><X className="ui-icon" aria-hidden="true" focusable="false" /></button>
        </div>

        <div role="tablist" aria-label="Разделы центра проверки" className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-(--border-subtle)" onKeyDown={onTabKey}>
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" id={`health-tab-${s.id}`} aria-selected={section === s.id} aria-controls={`health-panel-${s.id}`}
              tabIndex={section === s.id ? 0 : -1} ref={(el) => { tabRefs.current[s.id] = el; }}
              className={`tactile-btn ${section === s.id ? 'active-mint' : ''}`} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`health-panel-${section}`} aria-labelledby={`health-tab-${section}`} className="overflow-y-auto px-4 py-3 flex flex-col gap-2.5 flex-1" aria-live="polite">
          {!hasHost && (
            <p style={{ color: 'var(--text-secondary)' }}>Проверка работает только в приложении Hell Harvest: в браузере у страницы нет доступа к системе.</p>
          )}
          {hasHost && running && (
            <div className="flex items-center gap-2" role="status" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" /> {fixing ? 'Выполняем исправление…' : 'Проверяем службу, порт и файлы…'}
            </div>
          )}
          {error && <p role="alert" style={{ color: 'var(--led-rose)' }}>Проверка не удалась: {error}</p>}
          {notice && (section !== 'checks' || noticeOrphan(checks, notice)) && <FixNotice notice={notice} onRestart={restart} />}

          {section === 'summary' && (
            <SummarySection hasHost={hasHost} running={running} hasChecks={checks.length > 0} overall={overall} counts={counts} lastCheck={lastCheck}
              busy={busy} events={events} onRun={run} />
          )}

          {section === 'checks' && groupChecks(checks).map((group) => (
            <section key={group.area} className="flex flex-col gap-2" aria-labelledby={`diag-area-${group.area}`}>
              <h3 id={`diag-area-${group.area}`} style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{AREA_TITLE[group.area]}</h3>
              {group.checks.map((c) => (
                <div key={c.id} className="flex gap-2.5 rounded-lg border border-(--border-subtle) p-2.5">
                  <StatusIcon status={c.status} />
                  <div className="min-w-0 flex-1">
                    <strong style={{ color: 'var(--text-primary)' }}>{c.title}</strong>
                    {c.detail && <div className="whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>{c.detail}</div>}
                    {c.advice && c.status !== 'ok' && <div className="whitespace-pre-wrap break-words mt-1" style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-xs)' }}>{c.advice}</div>}
                    {c.action === 'close_other' && c.pid != null && (
                      <button className="tactile-btn mt-1.5" disabled={busy}
                        onClick={() => { setRunning(true); post({ type: 'CLOSE_OTHER_SERVICE', pid: c.pid }); }}>
                        <X className="ui-icon" aria-hidden="true" focusable="false" /> Закрыть старую копию
                      </button>
                    )}
                    {c.fix && planFix(c.fix, false) && (
                      <button className="tactile-btn mt-1.5" disabled={busy} onClick={() => startFix(c.fix!)}>
                        {fixing === c.fix.id
                          ? <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" />
                          : <Wrench className="ui-icon" aria-hidden="true" focusable="false" />} {c.fix.label}
                      </button>
                    )}
                    {notice && noticeFor(c, notice) && <FixNotice notice={notice} onRestart={restart} />}
                  </div>
                </div>
              ))}
            </section>
          ))}
          {section === 'checks' && hasHost && !running && checks.length === 0 && !error && (
            <p style={{ color: 'var(--text-secondary)' }}>Проверок ещё не было.</p>
          )}

          {section === 'developer' && hasHost && (
            <DeveloperSection report={report} exporting={exporting} copied={copied} result={exportResult}
              onCopy={async () => setCopied(await copyReport(report))} onExport={startExport} />
          )}

          {section === 'maintenance' && hasHost && (
            <MaintenanceSection busy={busy} canResetWindow={Boolean(windowReset && planFix(windowReset, false))} onRestart={restart}
              onOpenLogs={() => post({ type: 'OPEN_LOGS_FOLDER' })} onResetWindow={() => windowReset && startFix(windowReset)}
              watchCard={settings && onUpdateSettings
                ? <HealthWatchCard settings={settings} onChange={onUpdateSettings} playClick={playClick ?? (() => {})} />
                : null} />
          )}
        </div>
      </div>
    </div>
  );
};
