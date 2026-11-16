import React, { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SteamIdleLibraryGame, SteamIdleState } from '../../types';
import { parseExcludeList } from './excludeParse.mjs';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

const CONFIRM_WORD = 'ALL';

/** Every owned game at once. A text field of AppIDs to leave out, and a typed confirmation in the page before anything starts. */
export const AchAllGames: React.FC<{ s: SteamIdleState; games: SteamIdleLibraryGame[] | null; runActive: boolean; busy: SteamIdleCommand | null; send: SendCommand }> = ({ s, games, runActive, busy, send }) => {
  const [exclude, setExclude] = useState('');
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const parsed = parseExcludeList(exclude);
  const ids = parsed.bad === null ? parsed.ids : null;
  const ready = (s.library.status ?? (s.library.count !== null ? 'ready' : 'none')) === 'ready';
  const loaded = ready && games !== null;
  const total = games && ids ? games.filter((g) => !ids.includes(g.appId)).length : null;
  const excluded = games && total !== null ? games.length - total : null;
  const off = busy !== null || runActive || !s.available;
  const openOff = off || !loaded || ids === null;
  useEffect(() => { if (open) field.current?.focus(); }, [open]);
  // The typed word belongs to the exact list shown: any change of the exclusions or of the library disarms it.
  const idsKey = ids === null ? '' : ids.join(',');
  useEffect(() => { setWord(''); }, [exclude, idsKey, games]);
  const close = () => { setOpen(false); setWord(''); opener.current?.focus(); };
  const confirmed = word === CONFIRM_WORD;
  return (
    <section className="titanium-island" aria-labelledby="sidle-all-title">
      <h2 id="sidle-all-title" className="sidle-title">Все игры</h2>
      <p className="sidle-refusal"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Выдача пройдёт по всей библиотеке, включая сетевые игры и игры с античитом. Исключите их.</p>
      <div className="sidle-field">
        <label htmlFor="sidle-exclude" className="sidle-label">Исключить игры (AppID)</label>
        <input id="sidle-exclude" type="text" className="sidle-input" value={exclude} autoComplete="off" aria-invalid={ids === null}
          aria-describedby={ids === null ? 'sidle-exclude-help sidle-exclude-err' : 'sidle-exclude-help'} onChange={(e) => setExclude(e.target.value)} />
        <span id="sidle-exclude-help" className="sidle-meta">через запятую или пробел</span>
        {parsed.bad !== null && <span id="sidle-exclude-err" className="sidle-err">Не AppID: <b>{parsed.bad.length > 14 ? `${parsed.bad.slice(0, 14)}…` : parsed.bad}</b></span>}
      </div>
      {total !== null && ids !== null && <p className="sidle-meta"><span>будет обработано игр: <b className="tabular">{total}</b></span></p>}
      {!loaded && <p className="sidle-text">Сначала загрузите список игр в блоке «Одна игра».</p>}
      <div className="sidle-actions">
        <button ref={opener} type="button" className="tactile-btn" aria-disabled={openOff} aria-expanded={open} onClick={() => { if (!openOff) setOpen(true); }}>
          Получить недостающие во всех играх
        </button>
      </div>
      {open && (
        <div className="sidle-confirm" role="group" aria-labelledby="sidle-confirm-title" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <p id="sidle-confirm-title" className="sidle-refusal"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Это запустит выдачу по всей библиотеке. Выданное нельзя снять.</p>
          <p className="sidle-text">Игр к обработке: <b className="tabular">{total ?? '?'}</b>. Исключено: <b className="tabular">{excluded ?? '?'}</b>. Окончательный список определяет служба.</p>
          <p className="sidle-text">Игры с античитом пропускаются. Список известных игр неполон: проверьте библиотеку сами.</p>
          <div className="sidle-field">
            <label htmlFor="sidle-confirm-word" className="sidle-label">Чтобы подтвердить, введите ALL</label>
            <input ref={field} id="sidle-confirm-word" type="text" className="sidle-input sidle-input-num" value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} />
          </div>
          <div className="sidle-actions">
            <button type="button" className="tactile-btn sidle-danger" aria-disabled={!confirmed || off || !loaded}
              onClick={() => { if (confirmed && !off && loaded && ids !== null) { send('achStart', { library: true, exclude: ids, confirm: CONFIRM_WORD }); close(); } }}>
              Запустить по всей библиотеке
            </button>
            <button type="button" className="tactile-btn" onClick={close}>Отмена</button>
          </div>
        </div>
      )}
    </section>
  );
};
