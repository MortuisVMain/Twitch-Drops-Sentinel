import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { SteamIdleAchievement } from '../../types';
import { START_NAMES_MAX, unlockDate } from './achievementsText';

const Row: React.FC<{ a: SteamIdleAchievement; checked: boolean; onToggle: () => void }> = ({ a, checked, onToggle }) => {
  const description = a.description !== '' ? a.description : a.hidden ? 'Скрытое достижение' : '';
  const body = (
    <span className="sidle-row-main">
      <span className="sidle-ach-name">{a.name}{a.hidden && <span className="sidle-tag">скрытое</span>}</span>
      {description && <span className="sidle-row-note">{description}</span>}
    </span>
  );
  if (a.achieved) {
    const date = unlockDate(a.unlockTime);
    return (
      <li className="sidle-ach-row">
        <span className="sidle-ach-lead"><Check className="ui-icon" aria-hidden="true" focusable="false" style={{ color: 'var(--led-mint)' }} /></span>
        {body}
        <span className="sidle-row-end">получено{date && <> {date}</>}</span>
      </li>
    );
  }
  return (
    <li className="sidle-ach-row">
      <label className="sidle-ach-label">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        {body}
      </label>
    </li>
  );
};

export interface AchListProps {
  items: SteamIdleAchievement[];
  skipHidden: boolean;
  runActive: boolean;
  disabled: boolean;
  onStart: (body: { names: string[] } | { all: true }) => void;
}

/** The achievements of one game with their selection and the two start buttons. Mounted per game, so a new game starts unselected. */
export const AchList: React.FC<AchListProps> = ({ items, skipHidden, runActive, disabled, onStart }) => {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const locked = items.filter((a) => !a.achieved);
  const count = picked.size;
  const tooMany = count > START_NAMES_MAX;
  const toggle = (name: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (!next.delete(name)) next.add(name);
    return next;
  });
  const selectAll = () => setPicked(new Set(locked.filter((a) => !(skipHidden && a.hidden)).map((a) => a.apiName)));
  // Both starts are irreversible writes: ask first, in the page. "All" is every locked achievement the service will not skip.
  const hiddenLocked = locked.filter((a) => a.hidden).length;
  const hiddenSkipped = skipHidden ? hiddenLocked : 0;
  const allCount = locked.length - hiddenSkipped;
  const [confirming, setConfirming] = useState<'all' | 'picked' | null>(null);
  const allBtn = useRef<HTMLButtonElement>(null);
  const pickedBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const off = disabled || runActive;
  const pickedOff = off || count === 0 || tooMany;
  useEffect(() => { if (confirming) cancelBtn.current?.focus(); }, [confirming]);
  const closeConfirm = () => { (confirming === 'all' ? allBtn : pickedBtn).current?.focus(); setConfirming(null); };
  // The start became unavailable under an open question: close it and keep focus on the page, not on a removed button.
  useEffect(() => { if (confirming && (confirming === 'all' ? off || allCount === 0 : pickedOff)) closeConfirm(); });
  if (items.length === 0) return <p className="sidle-text">У этой игры нет достижений</p>;
  return (
    <>
      <div className="sidle-ach-head">
        <p className="sidle-meta"><span>получено <b className="tabular">{items.length - locked.length}</b> из <b className="tabular">{items.length}</b></span></p>
        <div className="sidle-actions">
          <button type="button" className="sidle-textbtn" disabled={locked.length === 0} onClick={selectAll}>Выбрать все недостающие</button>
          <button type="button" className="sidle-textbtn" disabled={count === 0} onClick={() => setPicked(new Set())}>Снять выбор</button>
        </div>
      </div>
      {skipHidden && hiddenLocked > 0 && <p className="sidle-meta"><span>Скрытые не входят в «Выбрать все», их можно отметить вручную.</span></p>}
      <ul className="sidle-list-rows sidle-ach-list" aria-label="Достижения игры">
        {items.map((a) => <Row key={a.apiName} a={a} checked={picked.has(a.apiName)} onToggle={() => toggle(a.apiName)} />)}
      </ul>
      {tooMany && (
        <p className="sidle-refusal" role="status">За один раз можно отправить не больше <b className="tabular">{START_NAMES_MAX}</b> достижений. Выбрано: <b className="tabular">{count}</b>.</p>
      )}
      <div className="sidle-actions">
        <button ref={pickedBtn} type="button" className={runActive ? 'tactile-btn' : 'chunky-cta'} aria-disabled={pickedOff} aria-expanded={confirming === 'picked'}
          onClick={() => { if (!pickedOff) setConfirming('picked'); }}>
          Получить выбранные <span className="tabular">({count})</span>
        </button>
        <button ref={allBtn} type="button" className="tactile-btn" aria-disabled={off || allCount === 0} aria-expanded={confirming === 'all'}
          onClick={() => { if (!off && allCount > 0) setConfirming('all'); }}>
          Получить все недостающие в игре
        </button>
      </div>
      {confirming && (
        <div className="sidle-confirm" role="group" aria-label="Подтверждение" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeConfirm(); } }}>
          {confirming === 'all'
            ? <p className="sidle-text">Будет выдано достижений: <b className="tabular">{allCount}</b> (скрытых пропущено: <b className="tabular">{hiddenSkipped}</b>).</p>
            : <p className="sidle-text">Будет выдано достижений: <b className="tabular">{count}</b>. <span>Снять выданное нельзя.</span></p>}
          <div className="sidle-actions">
            <button type="button" className="tactile-btn sidle-danger" aria-disabled={off}
              onClick={() => { if (!off) { const body = confirming === 'all' ? { all: true as const } : { names: [...picked] }; closeConfirm(); onStart(body); } }}>Выдать</button>
            <button ref={cancelBtn} type="button" className="tactile-btn" onClick={closeConfirm}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
};
