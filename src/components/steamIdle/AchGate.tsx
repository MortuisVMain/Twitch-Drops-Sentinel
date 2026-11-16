import React, { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SteamIdleCommand, SendCommand } from './useSteamIdle';

/** The separate acknowledgement for achievements, shown after the general risk gate and before anything else of this section. */
export const AchGate: React.FC<{ busy: SteamIdleCommand | null; send: SendCommand }> = ({ busy, send }) => {
  const [understood, setUnderstood] = useState(false);
  return (
    <section className="titanium-island sidle-risk" aria-labelledby="sidle-achgate-title">
      <h2 id="sidle-achgate-title" className="sidle-title warn">
        <TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Перед выдачей достижений
      </h2>
      <ul className="sidle-list">
        <li>Выдача достижений программой это подделка игровой статистики, она нарушает правила Steam.</li>
        <li>В играх с античитом или сетевыми рейтингами за это могут наказать на стороне игры.</li>
        <li>Выданное достижение приложение снять не может.</li>
        <li>Начните с одной одиночной игры.</li>
      </ul>
      <label className="sidle-check">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>Я понимаю, что это необратимо и рискованно</span>
      </label>
      <div className="sidle-actions">
        <button type="button" className="chunky-cta" disabled={!understood} aria-disabled={busy !== null} onClick={() => { if (busy === null) send('achAck'); }}>
          Включить выдачу достижений
        </button>
      </div>
    </section>
  );
};
