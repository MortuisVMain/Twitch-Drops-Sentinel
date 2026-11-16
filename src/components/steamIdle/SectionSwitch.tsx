import React from 'react';

export type SteamIdleSection = 'cards' | 'achievements';

/** Two-item segmented switch: state is shown by aria-pressed and by the filled segment. */
export const SectionSwitch: React.FC<{ value: SteamIdleSection; onChange: (v: SteamIdleSection) => void }> = ({ value, onChange }) => (
  <div className="sidle-seg" role="group" aria-label="Раздел">
    <button type="button" className="sidle-seg-btn" aria-pressed={value === 'cards'} onClick={() => onChange('cards')}>Карточки</button>
    <button type="button" className="sidle-seg-btn" aria-pressed={value === 'achievements'} onClick={() => onChange('achievements')}>Достижения</button>
  </div>
);
