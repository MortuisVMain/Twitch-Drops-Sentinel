import { Ban, Clock, Ellipsis } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface TargetMoreMenuProps {
  streamer: string;
  onBan: (channelName: string, isSnooze2h: boolean) => void;
}

/** "…" menu of the current target: the two actions that take a streamer out of the farm, kept away from the everyday buttons. */
export const TargetMoreMenu: React.FC<TargetMoreMenuProps> = ({ streamer, onBan }) => {
  const { playClick } = useTactileAudio();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // The actions name no streamer: if the farm moves to another one under an open menu, close it rather than ban the wrong channel
  useEffect(() => { setOpen(false); }, [streamer]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };

  const choose = (snooze: boolean) => {
    playClick();
    setOpen(false);
    onBan(streamer, snooze);
  };

  return (
    <div
      className="target-more-wrap"
      ref={wrapRef}
      onKeyDown={onMenuKeyDown}
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        ref={triggerRef}
        className={`tactile-btn ${open ? 'active-mint' : ''}`}
        style={{ minHeight: '28px' }}
        onClick={() => {
          playClick();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="targetMoreMenu"
        aria-label="Ещё действия со стримером"
        title="Ещё действия со стримером"
      >
        <Ellipsis className="ui-icon" aria-hidden="true" focusable="false" />
      </button>
      {open && (
        <div id="targetMoreMenu" ref={menuRef} className="more-menu open target-more-menu" role="menu">
          <button className="more-item" role="menuitem" onClick={() => choose(true)} title="Поставить стримера на паузу на 2 часа">
            <span><Clock className="ui-icon" aria-hidden="true" focusable="false" /> Скрыть на 2 ч</span>
          </button>
          <button className="more-item" role="menuitem" onClick={() => choose(false)} title="Исключить стримера из фарма навсегда">
            <span><Ban className="ui-icon" aria-hidden="true" focusable="false" /> Исключить</span>
          </button>
        </div>
      )}
    </div>
  );
};
