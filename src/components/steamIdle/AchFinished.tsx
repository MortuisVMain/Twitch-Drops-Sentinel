import React from 'react';
import { SteamIdleAchFinished } from '../../types';
import { finishedNoteText } from './achievementsText';
import { SteamCardGrid, SteamGameCard } from './SteamGameCard';
import { finishedFacts } from './steamIdleLogic.mjs';

/** Games this run is done with, newest first, as compact cards. Not shown while empty. */
export const AchFinished: React.FC<{ finished: SteamIdleAchFinished[] }> = ({ finished }) => {
  if (finished.length === 0) return null;
  return (
    <section className="titanium-island" aria-labelledby="sidle-fin-title">
      <h2 id="sidle-fin-title" className="sidle-title">Готово в этом запуске<span className="sidle-count tabular"> {finished.length}</span></h2>
      <SteamCardGrid labelledBy="sidle-fin-title" compact scroll>
        {finished.map((g) => {
          const note = finishedNoteText(g.note);
          const counts = finishedFacts(g).map(({ label, count }) => <span key={label}>{label} <b className="tabular">{count}</b></span>);
          return (
            <SteamGameCard key={g.appId} appId={g.appId} name={g.name} compact
              facts={[<span className="sidle-card-counts">{counts}</span>, ...(note ? [note] : [])]} />
          );
        })}
      </SteamCardGrid>
    </section>
  );
};
