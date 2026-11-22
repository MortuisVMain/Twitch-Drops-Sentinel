import React, { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { failureText, hasStaleData } from '../utils/dataLoad';
import { ActivityConsole } from './steamIdle/ActivityConsole';
import { AchievementsSection } from './steamIdle/AchievementsSection';
import { SectionSwitch, SteamIdleSection } from './steamIdle/SectionSwitch';
import { FarmHours } from './steamIdle/FarmHours';
import { ACTIVE_STATES, FarmPanel, Lists, PreviewPanel, Readiness, RiskGate, Skeleton, UnavailablePanel } from './steamIdle/SteamIdleParts';
import { refusalText } from './steamIdle/steamIdleText';
import { useSteamIdle } from './steamIdle/useSteamIdle';

/** The Steam IDLE tab: readiness, a Cards / Achievements switch (the latter only when the service has achievements),
 * then the section chosen. Cards: the risk gate until it is accepted, then the farm and its queue. */
// onOpenGiveawaysReadiness is missing exactly when the Giveaways tab is turned off
export const SteamIdleView: React.FC<{ onOpenGiveawaysReadiness?: () => void; appVersion?: string }> = ({ onOpenGiveawaysReadiness, appVersion }) => {
  const { load, busy, refusal, send, retry } = useSteamIdle();
  const s = load.data;
  const stale = hasStaleData(load);
  const showGate = !!s && s.available && !s.riskAcknowledged;
  const [section, setSection] = useState<SteamIdleSection>('cards');
  const ach = s?.achievements;
  const gateSeen = useRef(false);
  useEffect(() => { if (showGate) gateSeen.current = true; }, [showGate]);

  return (
    <div id="view-steamidle" className="view-tab active sidle-root">
      {load.phase === 'loading' && <Skeleton />}
      {load.phase === 'error' && load.failure && (
        <section className="titanium-island sidle-error" role="alert">
          <p className="sidle-refusal"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {failureText(load.failure)}</p>
          <div className="sidle-actions"><button type="button" className="tactile-btn" onClick={retry}>Повторить</button></div>
        </section>
      )}
      {s && (
        <>
          {stale && load.failure && (
            <section className="titanium-island sidle-error" role="status">
              <p className="sidle-refusal"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {failureText(load.failure)} Показаны последние полученные данные.</p>
              <div className="sidle-actions"><button type="button" className="tactile-btn" onClick={retry}>Повторить</button></div>
            </section>
          )}
          <Readiness s={s} busy={busy} send={send} openGiveawaysReadiness={onOpenGiveawaysReadiness} />
          {ach && <SectionSwitch value={section} onChange={(v) => { gateSeen.current = false; setSection(v); }} />}
          {refusal && (
            <section className="titanium-island sidle-error" role="alert">
              <p className="sidle-refusal"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {refusalText(refusal, s.community.session, !!onOpenGiveawaysReadiness)}</p>
            </section>
          )}
          {ach && section === 'achievements' ? <AchievementsSection s={s} ach={ach} busy={busy} send={send} />
            : !s.available ? <UnavailablePanel s={s} />
            : !s.riskAcknowledged ? <RiskGate busy={busy} send={send} />
            : (
              <>
                <FarmPanel s={s} busy={busy} takeFocus={gateSeen.current} send={send} />
                {s.farm.hoursUntilDrops !== undefined && <FarmHours saved={s.farm.hoursUntilDrops} locked={ACTIVE_STATES.has(s.farm.state) || s.farm.state === 'paused'} busy={busy} send={send} farm={s.farm} />}
                <PreviewPanel s={s} busy={busy} send={send} />
                <Lists s={s} busy={busy} send={send} />
              </>
            )}
          <ActivityConsole s={s} appVersion={appVersion} />
        </>
      )}
    </div>
  );
};
