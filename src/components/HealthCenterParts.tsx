import { AlertTriangle, Check, ClipboardCopy, FileText, FolderOpen, Loader2, RefreshCw, RotateCcw, Archive, Bug, X, Eraser } from 'lucide-react';
import React from 'react';
import type { CheckArea, FixResult } from '../utils/serviceDiagnostics.mjs';
import { restartOffered, statusView } from '../utils/serviceDiagnostics.mjs';
import { formatLocalTime as formatTime } from '../utils/healthCenter.mjs';
import { uiLocale } from '../i18n';

const formatLocalTime = (seconds: number) => formatTime(seconds, uiLocale());

export const AREA_TITLE: Record<CheckArea, string> = {
  service: 'Служба', twitch: 'Twitch', steam: 'Steam', giveaways: 'Раздачи', network: 'Сеть', updates: 'Обновления', settings: 'Настройки', system: 'Система',
};

export const TONE_COLOR = { ok: 'var(--led-mint)', warn: 'var(--led-amber)', fail: 'var(--led-rose)' } as const;

const HEADING_STYLE: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };

export interface HealthEvent { time: number; checkId: string; area: string; title: string; status: string; event: 'found' | 'fixed' }

// What a fix said, under the row that offered it (or on its own when the fix made the row go away); a restart is offered when the fix needs one
export const FixNotice: React.FC<{ notice: FixResult; onRestart: () => void }> = ({ notice, onRestart }) => (
  <div role={notice.ok ? 'status' : 'alert'} className="mt-1.5 whitespace-pre-wrap break-words" style={{ color: notice.ok ? 'var(--led-mint)' : 'var(--led-rose)', fontSize: 'var(--fs-xs)' }}>
    {notice.message}
    {restartOffered(notice) && (
      <div>
        <button className="tactile-btn mt-1.5" onClick={onRestart}>
          <RotateCcw className="ui-icon" aria-hidden="true" focusable="false" /> Перезапустить приложение
        </button>
      </div>
    )}
  </div>
);

export const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  const { icon, tone } = statusView(status);
  const Icon = icon === 'check' ? Check : icon === 'alert' ? AlertTriangle : X;
  return <Icon className="ui-icon shrink-0" style={{ color: TONE_COLOR[tone] }} aria-hidden="true" focusable="false" />;
};

interface SummaryProps {
  hasHost: boolean;
  running: boolean;
  hasChecks: boolean;
  overall: 'ok' | 'warn' | 'fail';
  counts: { fail: number; warn: number };
  lastCheck: number | null;
  busy: boolean;
  events: HealthEvent[];
  onRun: () => void;
}

// "Сводка": the overall state, when the last check ran, the button to run one now and the recent problems found or fixed
export const SummarySection: React.FC<SummaryProps> = ({ hasHost, running, hasChecks, overall, counts, lastCheck, busy, events, onRun }) => (
  <div className="flex flex-col gap-3">
    {hasHost && !running && hasChecks && (
      <p style={{ color: TONE_COLOR[overall] }}>
        {overall === 'ok' ? 'Всё в порядке.' : overall === 'warn' ? 'Есть предупреждения.' : 'Найдены проблемы.'}
        {counts.fail > 0 && <> Проблем: {counts.fail}.</>}
        {counts.warn > 0 && <> Предупреждений: {counts.warn}.</>}
      </p>
    )}
    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>
      {lastCheck !== null ? <>Последняя проверка: {formatLocalTime(lastCheck)}</> : 'Проверок ещё не было.'}
    </p>
    <div>
      <button className="tactile-btn active-mint" disabled={busy || !hasHost} onClick={onRun}>
        {running ? <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" /> : <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" />} Проверить сейчас
      </button>
    </div>
    <section className="flex flex-col gap-1.5" aria-labelledby="health-history-title">
      <h3 id="health-history-title" style={HEADING_STYLE}>Недавние события</h3>
      {events.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>Событий пока нет.</p>}
      {events.length > 0 && (
        <ul className="flex flex-col gap-1">
          {events.map((e, i) => (
            <li key={`${e.checkId}-${e.time}-${i}`} className="flex gap-2 items-baseline" style={{ fontSize: 'var(--fs-xs)' }}>
              <span className="tabular shrink-0" style={{ color: 'var(--text-muted)' }}>{formatLocalTime(e.time)}</span>
              <span className="shrink-0" style={{ color: e.event === 'fixed' ? 'var(--led-mint)' : TONE_COLOR[e.status === 'warn' ? 'warn' : 'fail'] }}>{e.event === 'fixed' ? 'Исправлено' : 'Найдено'}</span>
              <span className="min-w-0 break-words" style={{ color: 'var(--text-primary)' }}>{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  </div>
);

interface DeveloperProps {
  report: string;
  exporting: string | null;
  copied: boolean;
  result: { kind: string; ok: boolean; message: string } | null;
  onCopy: () => void;
  onExport: (type: 'SAVE_HEALTH_REPORT' | 'COLLECT_HEALTH_LOGS' | 'REPORT_HEALTH_PROBLEM') => void;
}

// "Для разработчика": the report as text, as a file, the logs as a ZIP, and a report of the problem to the project
export const DeveloperSection: React.FC<DeveloperProps> = ({ report, exporting, copied, result, onCopy, onExport }) => (
  <div className="flex flex-col gap-2.5">
    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>Отчёты и логи очищены: путь профиля, Steam ID, токены и имена скрыты.</p>
    <div className="flex flex-wrap gap-2">
      <button className="tactile-btn" disabled={!report} onClick={onCopy}>
        <ClipboardCopy className="ui-icon" aria-hidden="true" focusable="false" /> {copied ? 'Скопировано' : 'Скопировать отчёт'}
      </button>
      <button className="tactile-btn" disabled={!report || exporting !== null} onClick={() => onExport('SAVE_HEALTH_REPORT')}>
        {exporting === 'report' ? <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" /> : <FileText className="ui-icon" aria-hidden="true" focusable="false" />} Сохранить отчёт в файл
      </button>
      <button className="tactile-btn" disabled={exporting !== null} onClick={() => onExport('COLLECT_HEALTH_LOGS')}>
        {exporting === 'logs' ? <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" /> : <Archive className="ui-icon" aria-hidden="true" focusable="false" />} Собрать логи
      </button>
      <button className="tactile-btn" disabled={!report || exporting !== null} onClick={() => onExport('REPORT_HEALTH_PROBLEM')}>
        {exporting === 'issue' ? <Loader2 className="ui-icon animate-spin" aria-hidden="true" focusable="false" /> : <Bug className="ui-icon" aria-hidden="true" focusable="false" />} Сообщить о проблеме
      </button>
    </div>
    {result && (
      <div role={result.ok ? 'status' : 'alert'} className="whitespace-pre-wrap break-words" style={{ color: result.ok ? 'var(--led-mint)' : 'var(--led-rose)', fontSize: 'var(--fs-xs)' }}>{result.message}</div>
    )}
  </div>
);

interface MaintenanceProps {
  busy: boolean;
  canResetWindow: boolean;
  onRestart: () => void;
  onOpenLogs: () => void;
  onResetWindow: () => void;
  watchCard: React.ReactNode;
}

// "Обслуживание": restart the app, the logs folder, reset the window data, the background watch (the same switch as in Settings)
export const MaintenanceSection: React.FC<MaintenanceProps> = ({ busy, canResetWindow, onRestart, onOpenLogs, onResetWindow, watchCard }) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      <button className="tactile-btn active-mint" onClick={onRestart}>
        <RotateCcw className="ui-icon" aria-hidden="true" focusable="false" /> Перезапустить приложение
      </button>
      <button className="tactile-btn" onClick={onOpenLogs}>
        <FolderOpen className="ui-icon" aria-hidden="true" focusable="false" /> Открыть папку логов
      </button>
      <button className="tactile-btn" disabled={busy || !canResetWindow} onClick={onResetWindow}>
        <Eraser className="ui-icon" aria-hidden="true" focusable="false" /> Сбросить данные окна
      </button>
    </div>
    {watchCard}
  </div>
);
