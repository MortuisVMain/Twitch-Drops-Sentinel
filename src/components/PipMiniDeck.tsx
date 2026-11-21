import { Ban, Gamepad2, Pin, Radio, RefreshCw, SkipForward } from 'lucide-react';
import React from 'react';
import { ActiveDrop } from '../types';
import { isBlankCover, isSteamArt, retryCover } from '../utils/gameBoxArts';

// The mini window (PiP) deck, split out of App.tsx without behavior change.
export interface PipMiniDeckProps {
  activeDrop: ActiveDrop | null | undefined;
  activeGameBoxArt: string | null | undefined;
  progressPct: number;
  watchingChannel: string | null | undefined;
  isTopMost: boolean;
  onHeaderMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onToggleTopMost: () => void;
  onSwitchStreamer: (...args: any[]) => any;
  onBanStreamer: (...args: any[]) => any;
}

const hidePipCover = (img: HTMLImageElement) => {
  img.style.display = 'none';
  const fallback = img.parentElement?.querySelector('.pip-cover-fallback') as HTMLElement | null;
  if (fallback) fallback.style.display = 'flex';
};

export const PipMiniDeck: React.FC<PipMiniDeckProps> = ({
  activeDrop, activeGameBoxArt, progressPct, watchingChannel, isTopMost, onHeaderMouseDown, onToggleTopMost, onSwitchStreamer, onBanStreamer,
}) => {
  const circumference = 201;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;
  return (

    <div 

      className="pip-dedicated-hud" 

      onMouseDown={onHeaderMouseDown}

      title="Зажмите левую кнопку мыши для свободного перемещения мини-кокпита PIP"

    >

      <div className="pip-top-row">

        <div className="pip-cover-slot" title={activeDrop?.game ? `Фармится: ${activeDrop.game}` : 'Ожидание дропа'}>
          {activeGameBoxArt ? (
            <img 
              src={activeGameBoxArt} 
              alt={activeDrop?.game || 'Game Cover'} 
              className="pip-cover-img"
              crossOrigin={isSteamArt(activeGameBoxArt) ? 'anonymous' : undefined}
              onLoad={(e) => { if (isBlankCover(e.currentTarget) && !retryCover(e.currentTarget, activeDrop?.game || '')) hidePipCover(e.currentTarget); }}
              onError={(e) => { if (!retryCover(e.currentTarget, activeDrop?.game || '')) hidePipCover(e.currentTarget); }}
            />
          ) : null}
          <div className="pip-cover-fallback" style={{ display: activeGameBoxArt ? 'none' : 'flex' }}>
            <span style={{ fontSize: 'var(--fs-xl)' }}><Gamepad2 className="ui-icon" aria-hidden="true" focusable="false" /></span>
          </div>
          <div className="pip-cover-tag">
            <span className="pulse-dot"></span>
            <span>LIVE</span>
          </div>
        </div>

        <div className="pip-ring-wrap">

          <svg width="100%" height="100%" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>

            <circle cx="36" cy="36" r="32" fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth="4"></circle>

            <circle 

              cx="36" 

              cy="36" 

              r="32" 

              fill="none" 

              stroke="var(--led-mint)" 

              strokeWidth="4"

              strokeLinecap="round" 

              strokeDasharray={circumference} 

              strokeDashoffset={strokeDashoffset} 

            />

          </svg>

          <div style={{ textAlign: 'center', zIndex: 2 }}>

            <div className="tabular" style={{ fontSize: 'var(--fs-md)', fontWeight: 800, lineHeight: 1 }}>

              {Math.round(progressPct)}%

            </div>

            <div className="tabular" style={{ fontSize: 'calc(var(--fs-xs) * 0.93)', lineHeight: 1, letterSpacing: '-0.06em', color: 'var(--led-mint)' }}>

              {activeDrop ? `~${Math.round(activeDrop.remaining_seconds / 60)}М` : 'ГОТОВ'}

            </div>

          </div>

        </div>



        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
          <div className="pip-info-row">
            <span className="version-chip pip-chip" title={activeDrop?.game || 'STANDBY'}>
              {activeDrop?.game || 'STANDBY'}
            </span>
            <span className="tabular pip-channel" title={watchingChannel ? `@${watchingChannel}` : 'ожидание стримера'}>
              <Radio className="ui-icon" aria-hidden="true" focusable="false" /> {watchingChannel ? `@${watchingChannel}` : 'ожидание стримера'}
            </span>
          </div>
          <div className="pip-reward" title={activeDrop?.name || 'Twitch Drops Sentinel: фарм активен'}>
            {activeDrop?.name || 'Twitch Drops Sentinel: фарм активен'}
          </div>
        </div>
      </div>

      <div className="pip-action-bar">

        <button 

          className={`tactile-btn pip-action-btn ${isTopMost ? 'active-mint' : ''}`} 

          onClick={onToggleTopMost}

          title={isTopMost ? "Открепить окно от верхнего слоя" : "Закрепить поверх всех окон"}

        >

          <span><Pin className="ui-icon" aria-hidden="true" focusable="false" /></span>

          <span className="pip-label-full">{isTopMost ? 'ЗАКРЕПЛЕНО' : 'ПОВЕРХ ОКОН'}</span>

          <span className="pip-label-short">{isTopMost ? 'ЗАКРЕП' : 'ПОВЕРХ'}</span>

        </button>

        <button 

          className="tactile-btn pip-action-btn" 

          onClick={() => onSwitchStreamer(false)}

          title="Сменить текущий стрим"

        >

          <span><RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /></span>

          <span className="pip-label-full">Сменить стрим</span>

          <span className="pip-label-short">Стрим</span>

        </button>

        <button 

          className="tactile-btn pip-action-btn" 

          onClick={() => onSwitchStreamer(true)}

          title="Перейти к следующей игре в очереди"

        >

          <span><SkipForward className="ui-icon" aria-hidden="true" focusable="false" /></span>

          <span className="pip-label-full">След. игра</span>

          <span className="pip-label-short">След.</span>

        </button>

        <button 

          className="tactile-btn pip-action-btn danger-hover" 

          onClick={() => {

            if (watchingChannel) {

              onBanStreamer(watchingChannel, false);

            }

          }}

          title="Исключить текущий канал из фарма навсегда"

        >

          <span><Ban className="ui-icon" aria-hidden="true" focusable="false" /></span>

          <span className="pip-label-full">Исключить</span>

          <span className="pip-label-short">Искл.</span>

        </button>

      </div>

    </div>
  );
};
