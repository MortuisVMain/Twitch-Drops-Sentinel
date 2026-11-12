import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { failureText, hasStaleData } from '../utils/dataLoad';
import { FarmPanel, Lists, Readiness, RiskGate, Skeleton, UnavailablePanel } from './steamIdle/SteamIdleParts';
import { useSteamIdle } from './steamIdle/useSteamIdle';

/** The Steam IDLE tab: readiness, the risk gate until it is accepted, then the card farm and its queue. */
export const SteamIdleView: React.FC = () => {
  const { load, busy, refusal, send, retry } = useSteamIdle();
  const s = load.data;
  const stale = hasStaleData(load);

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
          <Readiness s={s} busy={busy} send={send} />
          {!s.available ? <UnavailablePanel s={s} />
            : !s.riskAcknowledged ? <RiskGate busy={busy} send={send} />
            : (
              <>
                <FarmPanel s={s} busy={busy} refusal={refusal} send={send} />
                <Lists s={s} />
              </>
            )}
        </>
      )}
    </div>
  );
};
