import React from 'react';
import { Check } from 'lucide-react';
import { CartridgeCover } from '../CartridgeCover';
import { steamCover } from './steamIdleLogic.mjs';

/** A list longer than this switches to the compact card size so the tab does not grow endlessly. */
const COMPACT_OVER = 6;
export const isCompactList = (count: number): boolean => count > COMPACT_OVER;

/**
 * One game as a card, like the Game Shelf: the cover on top, the title and up to two fact lines under it.
 * `onSelect` turns the cover, title and facts into one toggle button (`selected` is its pressed state); `children`
 * are the actions under the facts and stay outside that button.
 */
export const SteamGameCard: React.FC<{
  appId: number; name: string; facts?: React.ReactNode[]; badge?: string; compact?: boolean;
  selected?: boolean; onSelect?: () => void; children?: React.ReactNode;
}> = ({ appId, name, facts = [], badge, compact = false, selected = false, onSelect, children }) => {
  const body = (
    <>
      <span className="sidle-card-cover">
        <CartridgeCover name={name} boxArt={steamCover(appId)} compact={compact} decorative />
        {badge && <span className="sidle-card-badge">{badge}</span>}
        {selected && <span className="sidle-card-badge sidle-card-check"><Check className="ui-icon" aria-hidden="true" focusable="false" /></span>}
      </span>
      <span className="sidle-card-title" title={name}>{name}</span>
      {facts.slice(0, 2).map((fact, n) => <span key={n} className="sidle-card-fact">{fact}</span>)}
    </>
  );
  return (
    <li className={`sidle-card${compact ? ' compact' : ''}${selected ? ' selected' : ''}`}>
      {onSelect
        ? <button type="button" className="sidle-card-body" aria-pressed={selected} onClick={onSelect}>{body}</button>
        : <div className="sidle-card-body">{body}</div>}
      {children && <div className="sidle-card-actions">{children}</div>}
    </li>
  );
};

/** The grid every Steam IDLE card list shares; a long list scrolls inside and is reachable by keyboard. */
export const SteamCardGrid: React.FC<{ labelledBy?: string; label?: string; compact?: boolean; scroll?: boolean; children: React.ReactNode }> = ({ labelledBy, label, compact = false, scroll = false, children }) => (
  <ul className={`sidle-card-grid${compact ? ' compact' : ''}${scroll ? ' scroll' : ''}`} tabIndex={scroll ? 0 : undefined}
    aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}>
    {children}
  </ul>
);
