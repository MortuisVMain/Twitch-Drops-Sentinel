import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../hooks/useModalFocus';

interface Props {
  message: string;
  confirmLabel: string;
  onResult: (ok: boolean) => void;
}

/** In-app replacement for window.confirm: Escape and the backdrop cancel, focus starts on the safe button. */
const ConfirmDialog: React.FC<Props> = ({ message, confirmLabel, onResult }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(true, dialogRef, () => onResult(false), '[data-confirm-cancel]');
  // Out of the tab's stacking context: the window has to cover the header too
  return createPortal(
    <div
      onClick={(e) => { e.stopPropagation(); onResult(false); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'rgba(8, 10, 14, 0.62)', backdropFilter: 'blur(6px)' }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Подтверждение"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(460px, 94vw)', display: 'flex', flexDirection: 'column', gap: 16, padding: 20, background: 'var(--bg-chassis-base)', color: 'var(--text-primary)', border: '1px solid var(--border-main)', borderRadius: 16, boxShadow: 'var(--shadow-chassis)', outline: 'none' }}
      >
        <p id="confirm-dialog-message" style={{ margin: 0, fontSize: 'var(--fs-sm, 14px)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="tactile-btn" data-confirm-cancel onClick={() => onResult(false)}>Отмена</button>
          <button type="button" className="tactile-btn" style={{ borderColor: 'var(--led-rose)', color: 'var(--led-rose)' }} onClick={() => onResult(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface Pending { message: string; confirmLabel: string; resolve: (ok: boolean) => void }

/** `const { ask, confirmDialog } = useConfirm()`: render `confirmDialog` once (`asking` is true while it is open), `await ask(text, buttonLabel)` where window.confirm was. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const settle = useCallback((ok: boolean) => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    p?.resolve(ok);
  }, []);

  const ask = useCallback((message: string, confirmLabel = 'Подтвердить') => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const next = { message, confirmLabel, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  const confirmDialog = pending ? <ConfirmDialog message={pending.message} confirmLabel={pending.confirmLabel} onResult={settle} /> : null;
  return { ask, confirmDialog, asking: pending !== null };
}
