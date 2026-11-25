import { Stethoscope } from 'lucide-react';
import React from 'react';
import type { SentinelSettings } from '../types';
import { healthWatchEnabled, healthWatchHours, healthWatchOptions } from '../utils/healthWatch.mjs';

interface Props {
  settings: SentinelSettings;
  onChange: (patch: Partial<SentinelSettings>) => void;
  playClick: () => void;
}

// Background "Проверка работы": the switch and how often it looks; the service does the looking (core/health_watch.py)
export const HealthWatchCard: React.FC<Props> = ({ settings, onChange, playClick }) => {
  const enabled = healthWatchEnabled(settings);
  const hours = healthWatchHours(settings);
  return (
    <div className="obsidian-well" role="group" aria-labelledby="healthWatchTitle" style={{ padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className="module-switch-card module-switch-btn"
        onClick={() => { playClick(); onChange({ health_watch_enabled: !enabled }); }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="module-switch-title" id="healthWatchTitle"><Stethoscope className="ui-icon" aria-hidden="true" focusable="false" /> Следить за работой в фоне</span>
          <span className="module-switch-hint">Проверять входы, Steam, раздачи и ошибки и сообщать о новых проблемах</span>
        </span>
        <span className={`cnc-switch ${enabled ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
      </button>
      <div role="radiogroup" aria-label="Как часто" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', opacity: enabled ? 1 : 0.5 }}>
        <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>КАК ЧАСТО:</span>
        {healthWatchOptions().map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={hours === option.value}
            disabled={!enabled}
            className={`tactile-btn ${hours === option.value ? 'active-amber' : ''}`}
            onClick={() => { playClick(); onChange({ health_watch_hours: option.value }); }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
