import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { uiLocale } from '../i18n';
import type { RewardCampaign } from '../types';
import { REWARDS_OPEN_KEY, rewardGoalText, rewardInitials, rewardLink, rewardTodayText, rewardUntilText, usableRewardCampaigns } from '../utils/rewardCampaigns.mjs';

interface RewardCampaignsGroupProps {
  campaigns?: RewardCampaign[];
  watchingId?: string | null; // the campaign the engine is watching right now
  playClick: () => void;
}

/** The picture of a campaign, or its initials when there is none or it does not load. */
export function RewardThumb({ image, name }: { image: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <span className="reward-thumb reward-initials" aria-hidden="true">{rewardInitials(name)}</span>;
  return <img className="reward-thumb" src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Twitch reward campaigns (quests, brand offers): a collapsed group of compact rows with today's watch progress. They are managed on the shelf. */
export function RewardCampaignsGroup({ campaigns, watchingId = null, playClick }: RewardCampaignsGroupProps) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REWARDS_OPEN_KEY) === '1';
    } catch (err) {
      console.warn('RewardCampaignsGroup: localStorage недоступен', err);
      return false;
    }
  });
  const list = usableRewardCampaigns(campaigns);
  if (list.length === 0) return <div className="reward-empty" role="status">Сейчас нет кампаний наград.</div>;

  const toggle = () => {
    playClick();
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(REWARDS_OPEN_KEY, next ? '1' : '0');
    } catch (err) {
      console.warn('RewardCampaignsGroup: не удалось сохранить состояние группы', err);
    }
  };

  return (
    <>
      <button
        className="queue-finished-toggle"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="rewardCampaignsList"
        title="Квесты и предложения брендов со страницы Twitch Drops. Очередь, фарм, скрытие и категория настраиваются на полке."
      >
        <span>{open ? <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronRight className="ui-icon" aria-hidden="true" focusable="false" />} Кампании наград · {list.length}</span>
      </button>
      {open && (
        <ul className="reward-list" id="rewardCampaignsList">
          {list.map((c) => {
            const until = rewardUntilText(c.endsAt, uiLocale());
            const goal = rewardGoalText(c);
            const today = rewardTodayText(c);
            return (
              <li key={c.id} className="reward-row">
                <RewardThumb image={c.image ?? null} name={c.name} />
                <div className="reward-body">
                  <div className="reward-name clip-2" title={c.name}>{c.name}</div>
                  <div className="reward-meta">
                    {c.brand && <span>{c.brand}</span>}
                    {until && <span>{until}</span>}
                    {goal && <span>{goal}</span>}
                    {today && <span>{today}</span>}
                    {watchingId === c.id && <span className="reward-badge now">Смотрим сейчас</span>}
                  </div>
                </div>
                <a className="reward-link" href={rewardLink(c)} target="_blank" rel="noopener noreferrer" aria-label={`Открыть на Twitch: ${c.name}`}>
                  Открыть на Twitch <ExternalLink className="ui-icon" aria-hidden="true" focusable="false" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
