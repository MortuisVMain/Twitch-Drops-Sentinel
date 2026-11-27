import { Clock } from 'lucide-react';
import React from 'react';
import type { FarmSchedule } from '../types';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; // Monday = 0, like Python's weekday()
const DEFAULT: FarmSchedule = { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], start: '01:00', end: '09:00' };

interface Props {
  schedule?: FarmSchedule;
  onChange: (next: FarmSchedule) => void;
  playClick: () => void;
}

// Quiet hours: farming runs only inside the window on the chosen days; a window ending before it starts runs past midnight
export const FarmScheduleCard: React.FC<Props> = ({ schedule, onChange, playClick }) => {
  const s = { ...DEFAULT, ...(schedule || {}) };
  const update = (patch: Partial<FarmSchedule>) => onChange({ ...s, ...patch });
  const overnight = s.end <= s.start && s.end !== s.start;
  return (
    <div className="titanium-island" role="group" aria-labelledby="farmScheduleTitle" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
      <div className="engraved-header" style={{ marginBottom: '2px' }}>
        <span className="tag">
          <span className="led-dot"></span> <span id="farmScheduleTitle">РАСПИСАНИЕ ФАРМА</span>
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={s.enabled}
        className="module-switch-card module-switch-btn"
        onClick={() => { playClick(); update({ enabled: !s.enabled }); }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="module-switch-title"><Clock className="ui-icon" aria-hidden="true" focusable="false" /> Фармить только по расписанию</span>
          <span className="module-switch-hint">Вне окна фарм стоит на паузе, время по часам ПК</span>
        </span>
        <span className={`cnc-switch ${s.enabled ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
      </button>
      <div className="schedule-days" role="group" aria-label="Дни недели">
        {DAYS.map((label, day) => {
          const on = s.days.includes(day);
          return (
            <button
              key={label}
              type="button"
              className={`schedule-day ${on ? 'on' : ''}`}
              aria-pressed={on}
              disabled={!s.enabled}
              onClick={() => { playClick(); update({ days: on ? s.days.filter((d) => d !== day) : [...s.days, day].sort((a, b) => a - b) }); }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="schedule-times">
        <label>
          <span>С</span>
          <input type="time" value={s.start} disabled={!s.enabled} onChange={(e) => e.target.value && update({ start: e.target.value })} />
        </label>
        <label>
          <span>до</span>
          <input type="time" value={s.end} disabled={!s.enabled} onChange={(e) => e.target.value && update({ end: e.target.value })} />
        </label>
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        {!s.enabled
          ? 'Выключено: фарм идёт в любое время.'
          : s.days.length === 0
            ? 'Не выбран ни один день: фарм не начнётся.'
            : s.start === s.end
              ? 'Весь день в выбранные дни.'
              : overnight
                ? 'Окно переходит через полночь и относится к дню, в который начинается.'
                : 'Окно в пределах одного дня.'}
      </div>
    </div>
  );
};
