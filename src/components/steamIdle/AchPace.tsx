import React, { useState } from 'react';
import { SteamIdleAchSettings } from '../../types';
import { MINUTES_MAX } from './achievementsText';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

const minutes = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) && Number(text) <= MINUTES_MAX ? Number(text) : null);

const Field: React.FC<{ id: string; label: string; value: string; error: string | null; disabled: boolean; onChange: (v: string) => void }> = ({ id, label, value, error, disabled, onChange }) => (
  <div className="sidle-field">
    <label htmlFor={id} className="sidle-label">{label}</label>
    <input id={id} type="text" inputMode="numeric" className="sidle-input sidle-input-num" value={value} autoComplete="off" disabled={disabled}
      aria-invalid={error !== null} aria-describedby={error !== null ? `${id}-err` : 'sidle-pace-help'} onChange={(e) => onChange(e.target.value)} />
    {error !== null && <span id={`${id}-err`} className="sidle-err">{error}</span>}
  </div>
);

/** The pause between unlocks. The draft starts from the stored values; Save is live only while it differs and is valid. */
const PaceForm: React.FC<{ saved: SteamIdleAchSettings; runActive: boolean; busy: SteamIdleCommand | null; send: SendCommand }> = ({ saved, runActive, busy, send }) => {
  const [min, setMin] = useState(String(saved.minMinutes));
  const [max, setMax] = useState(String(saved.maxMinutes));
  const [skipHidden, setSkipHidden] = useState(saved.skipHidden);
  // The saved values the draft was last aligned with. When they change under an untouched draft, the draft follows.
  const [base, setBase] = useState(saved);
  if (saved.minMinutes !== base.minMinutes || saved.maxMinutes !== base.maxMinutes || saved.skipHidden !== base.skipHidden) {
    const dirty = min !== String(base.minMinutes) || max !== String(base.maxMinutes) || skipHidden !== base.skipHidden;
    setBase(saved);
    if (!dirty) { setMin(String(saved.minMinutes)); setMax(String(saved.maxMinutes)); setSkipHidden(saved.skipHidden); }
  }
  const lo = minutes(min);
  const hi = minutes(max);
  const range = 'Введите целое число от 0 до 1440';
  const minError = lo === null ? range : null;
  const maxError = hi === null ? range : lo !== null && lo > hi ? 'Значение «до» не может быть меньше «от»' : null;
  const valid = lo !== null && hi !== null && lo <= hi;
  const changed = valid && (lo !== saved.minMinutes || hi !== saved.maxMinutes || skipHidden !== saved.skipHidden);
  const off = !changed || busy !== null || runActive;
  return (
    <>
      <div className="sidle-fields">
        <Field id="sidle-pace-min" label="пауза от" value={min} error={minError} disabled={runActive} onChange={setMin} />
        <Field id="sidle-pace-max" label="до" value={max} error={maxError} disabled={runActive} onChange={setMax} />
      </div>
      <p id="sidle-pace-help" className="sidle-meta"><span>В минутах.</span><span>Если оба значения 0, пауз нет.</span>{runActive && <span>Темп меняется между запусками.</span>}</p>
      <label className="sidle-check">
        <input type="checkbox" checked={skipHidden} disabled={runActive} onChange={(e) => setSkipHidden(e.target.checked)} />
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

export const AchPace: React.FC<{ saved: SteamIdleAchSettings; runActive: boolean; busy: SteamIdleCommand | null; send: SendCommand }> = ({ saved, runActive, busy, send }) => (
  <section className="titanium-island" aria-labelledby="sidle-pace-title">
    <h2 id="sidle-pace-title" className="sidle-title">Темп</h2>
    <PaceForm saved={saved} runActive={runActive} busy={busy} send={send} />
  </section>
);
