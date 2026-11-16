import React from 'react';
import { SteamIdleAchFinished } from '../../types';
import { finishedNoteText } from './achievementsText';

/** Games this run is done with, newest first. Not shown while empty. */
export const AchFinished: React.FC<{ finished: SteamIdleAchFinished[] }> = ({ finished }) => {
  if (finished.length === 0) return null;
  return (
    <section className="titanium-island" aria-labelledby="sidle-fin-title">
      <h2 id="sidle-fin-title" className="sidle-title">Готово в этом запуске<span className="sidle-count tabular"> {finished.length}</span></h2>
      <ul className="sidle-list-rows" tabIndex={0} aria-labelledby="sidle-fin-title">
        {finished.map((g) => {
          const note = finishedNoteText(g.note);
          return (
            <li key={g.appId} className="sidle-row">
              <span className="sidle-row-main">
                <span className="sidle-row-name" title={g.name}>{g.name}</span>
                {note && <span className="sidle-row-note">{note}</span>}
              </span>
              <span className="sidle-row-end sidle-row-stats">
                <span>выдано <b className="tabular">{g.unlocked}</b></span>
                <span>пропущено <b className="tabular">{g.skipped}</b></span>
                <span>не удалось <b className="tabular">{g.failed}</b></span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
