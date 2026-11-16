import React, { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SteamIdleAchInterrupted } from '../../types';
import { interruptedBanner } from './steamIdleLogic.mjs';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

/** A run the last session did not finish. Nothing resumes by itself: the user continues or forgets it. A library run asks first. */
export const AchInterrupted: React.FC<{ interrupted: SteamIdleAchInterrupted | null | undefined; runActive: boolean; busy: SteamIdleCommand | null; send: SendCommand }> = ({ interrupted, runActive, busy, send }) => {
  const view = interruptedBanner(interrupted, runActive);
  const [confirming, setConfirming] = useState(false);
  const resumeBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const off = busy !== null;
  useEffect(() => { if (confirming) cancelBtn.current?.focus(); }, [confirming]);
  useEffect(() => { if (confirming && view === null) setConfirming(false); });
  const close = () => { resumeBtn.current?.focus(); setConfirming(false); };
  if (view === null) return null;
  const resume = () => { if (!off) send('achResumeInterrupted', view.needsConfirm ? { confirm: 'ALL' } : undefined); };
  return (
    <section className="titanium-island" aria-labelledby="sidle-int-title">
      <h2 id="sidle-int-title" className="sidle-title">Прерванная выдача</h2>
      <p className="sidle-refusal" role="status">
        <TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Выдача прервана перезапуском. Готово игр: <b className="tabular">{view.done}</b> из <b className="tabular">{view.total}</b>, выдано достижений: <b className="tabular">{view.unlocked}</b>.
      </p>
      <div className="sidle-actions">
        <button ref={resumeBtn} type="button" className="chunky-cta" aria-disabled={off} aria-expanded={view.needsConfirm ? confirming : undefined}
          onClick={() => { if (off) return; if (view.needsConfirm) setConfirming(true); else resume(); }}>Продолжить</button>
        <button type="button" className="tactile-btn" aria-disabled={off} onClick={() => { if (!off) send('achDiscardInterrupted'); }}>Забыть</button>
      </div>
      {confirming && (
        <div className="sidle-confirm" role="group" aria-label="Подтверждение" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <p className="sidle-text">Выдача продолжится по всей библиотеке, кроме уже готовых игр. Снять выданное нельзя.</p>
          <div className="sidle-actions">
            <button type="button" className="tactile-btn sidle-danger" aria-disabled={off} onClick={() => { if (!off) { close(); resume(); } }}>Продолжить выдачу</button>
            <button ref={cancelBtn} type="button" className="tactile-btn" onClick={close}>Отмена</button>
          </div>
        </div>
      )}
    </section>
  );
};
