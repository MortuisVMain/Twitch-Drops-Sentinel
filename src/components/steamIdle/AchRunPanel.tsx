import React, { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SteamIdleAchRun, SteamIdleState } from '../../types';
import { achErrorHelp, achRunActive, achRunMoving, achStateText, achStopReason, TOTAL_PARTS } from './achievementsText';
import { Dur } from './SteamIdleParts';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

const StateLine: React.FC<{ run: SteamIdleAchRun }> = ({ run }) => {
  if (run.state === 'waiting' && run.nextUnlockInSeconds !== null) return <>Пауза между выдачами: следующая через</>;
  if (run.state === 'stopped' && run.lastError) return <>Остановлено: {achStopReason(run.lastError)}</>;
  return <>{achStateText(run)}</>;
};

/** The achievements run: its state as text, the current game, totals and the controls of the moment. */
export const AchRunPanel: React.FC<{ s: SteamIdleState; run: SteamIdleAchRun; busy: SteamIdleCommand | null; takeFocus: boolean; send: SendCommand }> = ({ s, run, busy, takeFocus, send }) => {
  const cur = run.current;
  const off = busy !== null || !s.available;
  const go = (command: SteamIdleCommand) => () => { if (!off) send(command); };
  const parts = TOTAL_PARTS.filter(([key]) => run.totals[key] > 0);
  const help = achErrorHelp(run.lastError);
  const stateRef = useRef<HTMLParagraphElement>(null);
  // The gate (with the focused button) was just replaced by this panel: keep the keyboard user here.
  useEffect(() => { if (takeFocus) stateRef.current?.focus(); }, [takeFocus]);
  return (
    <section className="titanium-island sidle-farm" aria-labelledby="sidle-achrun-title">
      <h2 id="sidle-achrun-title" className="sidle-title">Выдача достижений</h2>
      <p ref={stateRef} tabIndex={-1} className="sidle-state"><span aria-live="polite"><StateLine run={run} /></span>{run.state === 'waiting' && run.nextUnlockInSeconds !== null && <> <Dur s={run.nextUnlockInSeconds} /></>}</p>
      {help && <p className="sidle-refusal" role="status"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {help}</p>}
      {cur && (
        <div className="sidle-current">
          <span className="sidle-game" title={cur.name}>{cur.name}</span>
          <span className="sidle-meta"><span>достижений <b className="tabular">{cur.done}</b> из <b className="tabular">{cur.total}</b></span></span>
        </div>
      )}
      {run.queue.length > 0 && <p className="sidle-meta"><span>игр в очереди: <b className="tabular">{run.queue.length}</b></span></p>}
      {parts.length > 0 && (
        <p className="sidle-meta">{parts.map(([key, label]) => <span key={key}>{label} <b className="tabular">{run.totals[key]}</b></span>)}</p>
      )}
      <div className="sidle-actions">
        {run.state === 'paused' && <button type="button" className="chunky-cta" aria-disabled={off} onClick={go('achResume')}>Продолжить</button>}
        {achRunMoving(run.state) && <button type="button" className="tactile-btn" aria-disabled={off} onClick={go('achPause')}>Пауза</button>}
        {cur && (run.state === 'unlocking' || run.state === 'waiting') && <button type="button" className="tactile-btn" aria-disabled={off} onClick={go('achSkip')}>Пропустить игру</button>}
        {achRunActive(run.state) && <button type="button" className="tactile-btn" aria-disabled={off} onClick={go('achStop')}>Остановить</button>}
      </div>
    </section>
  );
};
