import React, { useState } from 'react';
import { SteamIdleAchSettings } from '../../types';
import { MINUTES_MAX } from './achievementsText';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

const minutes = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) && Number(text) <= MINUTES_MAX ? Number(text) : null);

const Field: React.FC<{ id: string; label: string; value: string; error: string | null; onChange: (v: string) => void }> = ({ id, label, value, error, onChange }) => (
  <div className="sidle-field">
    <label htmlFor={id} className="sidle-label">{label}</label>
    <input id={id} type="text" inputMode="numeric" className="sidle-input sidle-input-num" value={value} autoComplete="off"
      aria-invalid={error !== null} aria-describedby={error !== null ? `${id}-err` : 'sidle-pace-help'} onChange={(e) => onChange(e.target.value)} />
    {error !== null && <span id={`${id}-err`} className="sidle-err">{error}</span>}
  </div>
);

/** The pause between unlocks. The draft starts from the stored values; Save is live only while it differs and is valid. */
const PaceForm: React.FC<{ saved: SteamIdleAchSettings; busy: SteamIdleCommand | null; send: SendCommand }> = ({ saved, busy, send }) => {
  const [min, setMin] = useState(String(saved.minMinutes));
  const [max, setMax] = useState(String(saved.maxMinutes));
  const [skipHidden, setSkipHidden] = useState(saved.skipHidden);
  const lo = minutes(min);
  const hi = minutes(max);
  const range = 'Введите целое число от 0 до 1440';
  const minError = lo === null ? range : null;
  const maxError = hi === null ? range : lo !== null && lo > hi ? 'Значение «до» не может быть меньше «от»' : null;
  const valid = lo !== null && hi !== null && lo <= hi;
  const changed = valid && (lo !== saved.minMinutes || hi !== saved.maxMinutes || skipHidden !== saved.skipHidden);
  const off = !changed || busy !== null;
  return (
    <>
      <div className="sidle-fields">
        <Field id="sidle-pace-min" label="пауза от" value={min} error={minError} onChange={setMin} />
        <Field id="sidle-pace-max" label="до" value={max} error={maxError} onChange={setMax} />
      </div>
      <p id="sidle-pace-help" className="sidle-meta"><span>В минутах.</span><span>0 и 0: без пауз</span></p>
      <label className="sidle-check">
        <input type="checkbox" checked={skipHidden} onChange={(e) => setSkipHidden(e.target.checked)} />
        <span>Пропускать скрытые достижения</span>
      </label>
      <div className="sidle-actions">
        <button type="button" className="tactile-btn" aria-disabled={off}
          onClick={() => { if (!off && lo !== null && hi !== null) send('achSettings', { minMinutes: lo, maxMinutes: hi, skipHidden }); }}>
          Сохранить
        </button>
      </div>
    </>
  );
};

export const AchPace: React.FC<{ saved: SteamIdleAchSettings; busy: SteamIdleCommand | null; send: SendCommand }> = ({ saved, busy, send }) => (
  <section className="titanium-island" aria-labelledby="sidle-pace-title">
    <h2 id="sidle-pace-title" className="sidle-title">Темп</h2>
    <PaceForm saved={saved} busy={busy} send={send} />
  </section>
);
