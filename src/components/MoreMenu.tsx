import { Ellipsis } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface MoreMenuProps {
  /** Accessible name and tooltip of the "…" button. */
  label: string;
  /** The menu closes when this changes, so an open menu never acts on a different target than the one it was opened for. */
  resetKey?: string;
  /** The menu items (`.more-item`, `role="menuitem"`); call `close` after an item has acted. */
  children: (close: () => void) => React.ReactNode;
}

/** "…" popup menu: closes on Escape, on focus leaving, on an outside press; arrow keys move between items. */
export const MoreMenu: React.FC<MoreMenuProps> = ({ label, resetKey, children }) => {
  const { playClick } = useTactileAudio();
  const menuId = useId();
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

  useEffect(() => { setOpen(false); }, [resetKey]);

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

  return (
    <div
      className="more-menu-wrap"
      ref={wrapRef}
      onKeyDown={onMenuKeyDown}
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        ref={triggerRef}
        className={`tactile-btn ${open ? 'active-mint' : ''}`}
        onClick={() => {
          playClick();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        title={label}
      >
        <Ellipsis className="ui-icon" aria-hidden="true" focusable="false" />
      </button>
      {open && (
        <div id={menuId} ref={menuRef} className="more-menu open more-menu-narrow" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
