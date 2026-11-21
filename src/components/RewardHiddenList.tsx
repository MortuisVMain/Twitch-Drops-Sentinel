import { useState } from 'react';
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import type { RewardCampaign } from '../types';

interface RewardHiddenListProps {
  campaigns: RewardCampaign[]; // only the hidden ones
  onRestore: (campaign: RewardCampaign) => void;
  playClick: () => void;
}

/** The only place hidden reward campaigns are shown: a small toggle line at the bottom of the shelf, one "Вернуть" per campaign. */
export function RewardHiddenList({ campaigns, onRestore, playClick }: RewardHiddenListProps) {
  const [open, setOpen] = useState(false);
  if (campaigns.length === 0) return null;
  return (
    <div className="titanium-island" style={{ padding: '6px 14px' }}>
      <button
        className="queue-finished-toggle"
        style={{ marginTop: 0 }}
        aria-expanded={open}
        aria-controls="rewardHiddenList"
        onClick={() => { playClick(); setOpen((v) => !v); }}
        title="Скрытые кампании наград: они не показываются на полке и не фармятся"
      >
        <span>{open ? <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronRight className="ui-icon" aria-hidden="true" focusable="false" />} Скрытые награды · {campaigns.length}</span>
      </button>
      {open && (
        <ul className="reward-list" id="rewardHiddenList">
          {campaigns.map((c) => (
            <li key={c.id} className="reward-row">
              <div className="reward-body">
                <div className="reward-name clip-2" title={c.name}>{c.name}</div>
              </div>
              <button
                className="tactile-btn"
                style={{ minHeight: '24px', fontSize: 'var(--fs-xs)' }}
                aria-label={`Вернуть: ${c.name}`}
                onClick={() => { playClick(); onRestore(c); }}
              >
                <Undo2 className="ui-icon" aria-hidden="true" focusable="false" /> Вернуть
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
