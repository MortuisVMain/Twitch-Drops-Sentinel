import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { RewardCampaign } from '../types';
import { rewardCategoryLine, rewardProgressPercent, rewardQueueStatus } from '../utils/rewardCampaigns.mjs';
import { RewardThumb } from './RewardCampaignsGroup';

interface RewardQueueRowProps {
  entry: string; // the priority_games entry, reward:<id>
  name: string;
  campaign: RewardCampaign | null; // null: the campaign no longer exists
  priorityIndex: number;
  queueLength: number;
  onForce?: (entry: string) => void;
  onReorder?: (entry: string, direction: 'up' | 'down') => void;
  onRemove: (entry: string) => void;
  playClick: () => void;
}

/** A reward campaign in the dashboard queue: the same row as a game, with the НАГРАДА chip and today's watch progress. */
export function RewardQueueRow({ entry, name, campaign, priorityIndex, queueLength, onForce, onReorder, onRemove, playClick }: RewardQueueRowProps) {
  const status = rewardQueueStatus(campaign);
  const pct = rewardProgressPercent(campaign);
  const detail = campaign ? rewardCategoryLine(campaign) : '';
  return (
    <div
      className="queue-row"
      onClick={() => {
        if (!campaign) return;
        playClick();
        onForce?.(entry);
      }}
      title={campaign ? `Кликните для переключения фарма на ${name} · ${detail}` : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
        <RewardThumb image={campaign?.image ?? null} name={campaign ? name : '?'} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
            <span className="new-campaign-chip reward-chip reward-chip-inline">НАГРАДА</span>
            <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={name}>{name}</span>
            <span
              className="tabular"
              role="img"
              title={`Место в очереди: ${priorityIndex + 1}`}
              aria-label={`Место в очереди: ${priorityIndex + 1}`}
              style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--fs-xs)', fontWeight: 700, lineHeight: 1.2, padding: '0 5px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-well)', color: 'var(--text-secondary)' }}
            >
              #{priorityIndex + 1}
            </span>
          </div>
          <div title={detail || undefined} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {campaign ? status.label : 'Её больше нет на Twitch, запись остаётся в очереди.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
        {campaign ? (
          <span className="tabular" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: status.kind !== 'none' && pct > 0 ? 'var(--led-mint)' : 'var(--text-muted)' }}>
            {status.kind === 'none' ? '—' : `${pct}%`}
          </span>
        ) : (
          <button className="tactile-btn" style={{ minHeight: '24px', fontSize: 'var(--fs-xs)' }} aria-label="Убрать из очереди: кампания наград закончилась" onClick={() => { playClick(); onRemove(entry); }}>
            <X className="ui-icon" aria-hidden="true" focusable="false" /> Убрать
          </button>
        )}
        {onReorder && (
          <div className="reorder-rocker">
            <button
              onClick={() => { playClick(); onReorder(entry, 'up'); }}
              disabled={priorityIndex === 0}
              style={{ opacity: priorityIndex === 0 ? 0.2 : 1 }}
              title="Поднять в очереди"
              aria-label={`Поднять в очереди: ${name}`}
            >
              <ChevronUp className="ui-icon" aria-hidden="true" focusable="false" />
            </button>
            <button
              onClick={() => { playClick(); onReorder(entry, 'down'); }}
              disabled={priorityIndex === queueLength - 1}
              style={{ opacity: priorityIndex === queueLength - 1 ? 0.2 : 1 }}
              title="Опустить в очереди"
              aria-label={`Опустить в очереди: ${name}`}
            >
              <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
