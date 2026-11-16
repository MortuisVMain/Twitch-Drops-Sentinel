import React, { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SteamIdleHeldGame } from '../../types';
import { refundNote, releaseQuestion } from './steamIdleLogic.mjs';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

/** A game the farm keeps out of the queue because it may still be refunded. Farming it anyway asks first, in the page. */
export const RefundHeldRow: React.FC<{ game: SteamIdleHeldGame; busy: SteamIdleCommand | null; send: SendCommand }> = ({ game, busy, send }) => {
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const off = busy !== null;
  useEffect(() => { if (confirming) cancelBtn.current?.focus(); }, [confirming]);
  const close = () => { opener.current?.focus(); setConfirming(false); };
  return (
    <li className="sidle-row sidle-row-held">
      <span className="sidle-row-main">
        <span className="sidle-row-name" title={game.name}>{game.name}</span>
        <span className="sidle-row-note">{refundNote(game.daysLeft)}</span>
      </span>
      <button ref={opener} type="button" className="tactile-btn" aria-disabled={off} aria-expanded={confirming}
        onClick={() => { if (!off) setConfirming(true); }}>Фармить всё равно</button>
      {confirming && (
        <div className="sidle-confirm" role="group" aria-label="Подтверждение" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <p className="sidle-refusal"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {releaseQuestion(game.name)}</p>
          <div className="sidle-actions">
            <button type="button" className="tactile-btn sidle-danger" aria-disabled={off}
              onClick={() => { if (!off) { close(); send('release', { appId: game.appId }); } }}>Фармить</button>
            <button ref={cancelBtn} type="button" className="tactile-btn" onClick={close}>Отмена</button>
          </div>
        </div>
      )}
    </li>
  );
};
