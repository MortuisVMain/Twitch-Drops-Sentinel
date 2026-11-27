import React, { useState } from 'react';
import { SteamIdleState } from '../../types';
import { thresholdHint } from './steamIdleLogic.mjs';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

export const HOURS_MAX = 10;
const hours = (text: string): number | null => {
  if (!/^\d{1,2}([.,]\d)?$/.test(text.trim())) return null;
  const n = Number(text.trim().replace(',', '.'));
  return n <= HOURS_MAX && (n * 2) % 1 === 0 ? n : null;
};
const show = (n: number): string => String(n).replace('.', ',');

/** Playtime a game needs before cards drop. The draft starts from the stored value; Save is live only while it differs and is valid. */
type Farm = SteamIdleState['farm'];

/** A switch of the farm settings; it posts the new value alone and is live while the service answers nothing else. */
const Toggle: React.FC<{ on: boolean; busy: boolean; title: string; hint: string; testId: string; onToggle: () => void }> = ({ on, busy, title, hint, testId, onToggle }) => (
  <button type="button" role="switch" aria-checked={on} aria-disabled={busy} className="sidle-switch-row" data-testid={testId} onClick={() => { if (!busy) onToggle(); }}>
    <span className="sidle-switch-text">
      <span className="sidle-switch-title">{title}</span>
      <span className="sidle-switch-hint">{hint}</span>
    </span>
    <span className={`cnc-switch ${on ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
  </button>
);

/** Playtime a game needs before cards drop, the hint the first drops give for it, and the two farm switches. The draft starts from the stored value; Save is live only while it differs and is valid. */
export const FarmHours: React.FC<{ saved: number; locked: boolean; busy: SteamIdleCommand | null; send: SendCommand; farm?: Farm }> = ({ saved, locked, busy, send, farm }) => {
  const [text, setText] = useState(show(saved));
  // The stored value the draft was last aligned with. When it changes under an untouched draft, the draft follows.
  const [base, setBase] = useState(saved);
  if (saved !== base) {
    const dirty = text !== show(base);
    setBase(saved);
    if (!dirty) setText(show(saved));
  }
  const value = hours(text);
  const error = value === null ? 'Введите число от 0 до 10 с шагом 0,5' : null;
  const off = value === null || value === saved || busy !== null || locked;
  const hint = locked ? null : thresholdHint(farm?.thresholdSuggestion);
  const apply = farm?.thresholdSuggestion?.suggestedHours;
  return (
    <section className="titanium-island" aria-labelledby="sidle-hours-title">
      <h2 id="sidle-hours-title" className="sidle-title">Часов до первой карточки</h2>
      <div className="sidle-field">
        <label htmlFor="sidle-hours" className="sidle-label">Часов в каждой игре</label>
        <input id="sidle-hours" type="text" inputMode="decimal" className="sidle-input sidle-input-num" value={text} autoComplete="off" disabled={locked}
          aria-invalid={error !== null} aria-describedby={error !== null ? 'sidle-hours-err' : 'sidle-hours-help'} onChange={(e) => setText(e.target.value)} />
        {error !== null && <span id="sidle-hours-err" className="sidle-err">{error}</span>}
      </div>
      <p id="sidle-hours-help" className="sidle-meta"><span>Ограниченные аккаунты (новые или после возвратов) не получают карточек, пока в игре нет этого числа часов. 0 выключает фазу набора часов.</span>{locked && <span>Значение меняется между запусками.</span>}</p>
      {hint !== null && apply !== undefined && (
        <div className="sidle-field" data-testid="sidle-threshold-hint">
          <p className="sidle-text" role="status">{hint}</p>
          <div className="sidle-actions">
            <button type="button" className="tactile-btn" aria-disabled={busy !== null} onClick={() => { if (busy === null) send('farmSettings', { hoursUntilDrops: apply }); }}>
              Применить
            </button>
          </div>
        </div>
      )}
      <div className="sidle-actions">
        <button type="button" className="tactile-btn" aria-disabled={off} onClick={() => { if (!off && value !== null) send('farmSettings', { hoursUntilDrops: value }); }}>
          Сохранить
        </button>
      </div>
      {farm?.pauseWhilePlaying !== undefined && (
        <Toggle on={farm.pauseWhilePlaying} busy={busy !== null} testId="sidle-toggle-pause" title="Ставить фарм на паузу, пока вы играете"
          hint="Когда вы запускаете свою игру, фарм отпускает игры и продолжает сам через пару минут после того, как вы её закроете."
          onToggle={() => send('farmSettings', { pauseWhilePlaying: !farm.pauseWhilePlaying })} />
      )}
      {farm?.notify !== undefined && (
        <Toggle on={farm.notify} busy={busy !== null} testId="sidle-toggle-notify" title="Уведомлять о событиях фарма"
          hint="Все карточки собраны, фарм остановился из-за ошибки, фаза набора часов отключена и дневная сводка. Приходит и в Telegram или Discord, если они подключены."
          onToggle={() => send('farmSettings', { notify: !farm.notify })} />
      )}
    </section>
  );
};
