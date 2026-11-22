import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Ban, ChevronDown, ChevronUp, ExternalLink, Star, Tag, X, Zap } from 'lucide-react';
import { uiLocale } from '../i18n';
import type { RewardCampaign } from '../types';
import {
  REWARD_GONE_TEXT, rewardCategoryLine, rewardDailyRewardText, rewardDayText, rewardFarmAction, rewardGroupLines, rewardInitials, rewardLink, rewardUntilText, sanitizeCategory,
} from '../utils/rewardCampaigns.mjs';

/** What the buttons of a reward card do; the owner of the settings and the toasts implements them. */
export interface RewardCardActions {
  toggleQueue: (campaign: RewardCampaign) => void;
  farm: (campaign: RewardCampaign) => void;
  stop: () => void;
  hide: (campaign: RewardCampaign) => void;
  saveCategory: (campaign: RewardCampaign, name: string) => void;
  blocked: (reason: string) => void;
  reorder: (campaign: RewardCampaign, direction: 'up' | 'down') => void;
}

interface RewardCampaignCardProps {
  campaign: RewardCampaign;
  layout: 'tile' | 'row';
  queueIndex: number; // position in priority_games, -1 when not queued
  queueLength: number;
  forcedGame?: string | null;
  watching: boolean; // the engine is watching this campaign right now
  userCategory: string; // the category the user set, '' when none
  actions: RewardCardActions;
  playClick: () => void;
}

const BTN = { minHeight: '24px', fontSize: 'var(--fs-xs)' } as const;
/** Goals shown before "Ещё N": long lists (Pokémon, GTA VI) would stretch the card far past its neighbours. */
const GOALS_PREVIEW = 2;

/** The campaign picture, or its initials when there is none or it does not load. */
function RewardCover({ image, name }: { image: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <div className="reward-cover-initials" aria-hidden="true">{rewardInitials(name)}</div>;
  return <img className="reward-cover" src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Inline editor of the category a campaign is watched in: Enter saves, Escape cancels, an empty text resets. */
function CategoryEditor({ campaign, initial, onSave, onClose }: { campaign: RewardCampaign; initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(sanitizeCategory(text));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  return (
    <form className="reward-cat-editor" onSubmit={submit} onKeyDown={onKey}>
      <input
        ref={input}
        type="text"
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        placeholder="Название категории Twitch"
        aria-label={`Категория для кампании: ${campaign.name}`}
      />
      <button type="submit" className="tactile-btn active-mint" style={BTN}>Сохранить</button>
      <button type="button" className="tactile-btn" style={BTN} onClick={() => onSave('')} title="Убрать свою категорию: Sentinel найдёт её сам">Сброс</button>
    </form>
  );
}

/** A Twitch reward campaign drawn like a game: the same card shell on the shelf (tile or list row) and the same buttons. */
export function RewardCampaignCard({ campaign: c, layout, queueIndex, queueLength, forcedGame, watching, userCategory, actions, playClick }: RewardCampaignCardProps) {
  const [editing, setEditing] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const categoryButton = useRef<HTMLButtonElement>(null);
  const farm = rewardFarmAction(c, forcedGame);
  const queued = queueIndex >= 0;
  const until = rewardUntilText(c.endsAt, uiLocale());
  const meta = [until, c.brand, rewardDayText(c), queued && `#${queueIndex + 1} в очереди`].filter(Boolean) as string[];
  const dailyReward = rewardDailyRewardText(c);
  const goals = rewardGroupLines(c);
  const shownGoals = goalsOpen ? goals : goals.slice(0, GOALS_PREVIEW);
  const moreGoals = goals.length - GOALS_PREVIEW;
  const closeEditor = () => {
    setEditing(false);
    categoryButton.current?.focus();
  };
  const run = (fn: () => void) => () => {
    playClick();
    fn();
  };

  const chip = <span className="new-campaign-chip reward-chip" title="Кампания наград Twitch: квест или предложение бренда">НАГРАДА</span>;
  const info = (
    <div style={{ minWidth: 0 }}>
      <div className="reward-title clip-2" title={c.name}>{layout === 'row' && chip}{c.name}</div>
      <div className="reward-meta">{meta.map((part) => <span key={part}>{part}</span>)}</div>
      {(watching || c.earned || dailyReward) && (
        <div className="reward-badges">
          {watching && <span className="reward-badge now">Смотрим сейчас</span>}
          {c.earned && <span className="reward-badge earned">Получено</span>}
          {dailyReward && <span className="reward-badge earned">{dailyReward}</span>}
        </div>
      )}
      <div className="reward-meta">{rewardCategoryLine(c)}</div>
      <ul className="reward-goals" id={`reward-goals-${c.id}`}>
        {shownGoals.map((line, i) => (
          <li key={i} className={`reward-goal ${line.muted ? 'muted' : ''}`}>
            {line.text}
            {line.rewards.length > 0 && <div className="reward-goal-rewards">{line.rewards.join(', ')}</div>}
          </li>
        ))}
      </ul>
      {moreGoals > 0 && (
        <button
          className="node-chip reward-goals-toggle"
          aria-expanded={goalsOpen}
          aria-controls={`reward-goals-${c.id}`}
          onClick={run(() => setGoalsOpen((open) => !open))}
        >
          {goalsOpen ? <ChevronUp className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" />}
          {goalsOpen ? 'Свернуть' : <>Ещё условий: {moreGoals}</>}
        </button>
      )}
    </div>
  );

  const buttons = (
    <div className="reward-actions">
      <button
        className={`tactile-btn ${queued ? 'active-mint' : ''}`}
        style={BTN}
        aria-pressed={queued}
        aria-label={`${queued ? 'Убрать из очереди' : 'В очередь'}: ${c.name}`}
        title={queued ? 'Убрать кампанию из очереди' : 'Добавить кампанию в очередь: она фармится по порядку очереди'}
        onClick={run(() => actions.toggleQueue(c))}
      >
        <Star className="ui-icon" aria-hidden="true" focusable="false" /> {queued ? 'Убрать из очереди' : 'В очередь'}
      </button>
      <button
        className={`tactile-btn ${farm.mode === 'stop' ? 'active-amber' : ''}`}
        style={BTN}
        aria-disabled={farm.mode === 'blocked'}
        aria-label={`${farm.mode === 'stop' ? 'Остановить' : 'Фармить сейчас'}: ${c.name}`}
        title={farm.mode === 'blocked' ? farm.reason : farm.mode === 'stop' ? 'Остановить принудительный фарм кампании' : 'Смотреть эту кампанию прямо сейчас, вне очереди'}
        onClick={run(() => (farm.mode === 'stop' ? actions.stop() : farm.mode === 'blocked' ? actions.blocked(farm.reason) : actions.farm(c)))}
      >
        {farm.mode === 'stop' ? <X className="ui-icon" aria-hidden="true" focusable="false" /> : <Zap className="ui-icon" aria-hidden="true" focusable="false" />} {farm.mode === 'stop' ? 'Остановить' : 'Фармить сейчас'}
      </button>
      <button
        className="tactile-btn"
        style={BTN}
        aria-label={`Скрыть: ${c.name}`}
        title="Скрыть кампанию: она пропадёт с полки и не будет фармиться. Вернуть можно внизу полки"
        onClick={run(() => actions.hide(c))}
      >
        <Ban className="ui-icon" aria-hidden="true" focusable="false" /> Скрыть
      </button>
      <button
        ref={categoryButton}
        className={`tactile-btn ${editing ? 'active-mint' : ''}`}
        style={BTN}
        aria-expanded={editing}
        aria-label={`Категория: ${c.name}`}
        title="Выбрать категорию Twitch, в которой смотреть эту кампанию"
        onClick={run(() => setEditing((open) => !open))}
      >
        <Tag className="ui-icon" aria-hidden="true" focusable="false" /> Категория…
      </button>
      <a className="reward-link" href={rewardLink(c)} target="_blank" rel="noopener noreferrer" aria-label={`Открыть на Twitch: ${c.name}`}>
        Открыть на Twitch <ExternalLink className="ui-icon" aria-hidden="true" focusable="false" />
      </a>
    </div>
  );

  const editor = editing && (
    <CategoryEditor
      campaign={c}
      initial={userCategory}
      onSave={(name) => { actions.saveCategory(c, name); closeEditor(); }}
      onClose={closeEditor}
    />
  );

  if (layout === 'row') {
    return (
      <div className="campaign-row reward-card-row" data-reward-id={c.id}>
        <div className="row-cover"><RewardCover image={c.image} name={c.name} /></div>
        {info}
        {buttons}
        {editor}
      </div>
    );
  }
  return (
    <div className="cartridge-card reward-card" data-reward-id={c.id}>
      {chip}
      <div className="reward-card-cover">
        <RewardCover image={c.image} name={c.name} />
      </div>
      {info}
      {queued && (
        <div className="reward-reorder">
          <button className="node-chip" style={{ minHeight: '24px', padding: '0 5px' }} disabled={queueIndex === 0} aria-label={`Выше в очереди: ${c.name}`} title="Повысить приоритет (переместить выше в очереди)" onClick={run(() => actions.reorder(c, 'up'))}>
            <ChevronUp className="ui-icon" aria-hidden="true" focusable="false" />
          </button>
          <button className="node-chip" style={{ minHeight: '24px', padding: '0 5px' }} disabled={queueIndex === queueLength - 1} aria-label={`Ниже в очереди: ${c.name}`} title="Понизить приоритет (переместить ниже в очереди)" onClick={run(() => actions.reorder(c, 'down'))}>
            <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" />
          </button>
        </div>
      )}
      {buttons}
      {editor}
    </div>
  );
}

/** A queued reward campaign that no longer exists: says so and offers to drop the entry. */
export function RewardGoneCard({ layout, onRemove, playClick }: { layout: 'tile' | 'row'; onRemove: () => void; playClick: () => void }) {
  const body = (
    <>
      <div style={{ minWidth: 0 }}>
        <div className="reward-title">{layout === 'row' && <span className="new-campaign-chip reward-chip">НАГРАДА</span>}{REWARD_GONE_TEXT}</div>
        <div className="reward-meta">Её больше нет на Twitch, запись остаётся в очереди.</div>
      </div>
      <div className="reward-actions">
        <button className="tactile-btn" style={BTN} aria-label="Убрать из очереди: кампания наград закончилась" onClick={() => { playClick(); onRemove(); }}>
          <X className="ui-icon" aria-hidden="true" focusable="false" /> Убрать из очереди
        </button>
      </div>
    </>
  );
  if (layout === 'row') {
    return (
      <div className="campaign-row reward-card-row">
        <div className="row-cover"><RewardCover image={null} name="?" /></div>
        {body}
      </div>
    );
  }
  return (
    <div className="cartridge-card reward-card">
      <span className="new-campaign-chip reward-chip">НАГРАДА</span>
      <div className="reward-card-cover"><RewardCover image={null} name="?" /></div>
      {body}
    </div>
  );
}
