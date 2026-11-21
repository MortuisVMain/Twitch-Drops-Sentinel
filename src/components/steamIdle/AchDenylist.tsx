import React, { useState } from 'react';
import { SteamIdleDenylist } from '../../types';
import { parseDenyTarget } from './denyParse.mjs';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

/** The user's own anti-cheat games: add by AppID or by the address of the store page, remove with one button.
 * The built-in list is shown only as a count; the service refuses a write to any game on either list. */
export const AchDenylist: React.FC<{ list: SteamIdleDenylist; busy: SteamIdleCommand | null; send: SendCommand }> = ({ list, busy, send }) => {
  const [text, setText] = useState('');
  const target = parseDenyTarget(text);
  const appId = target.appId;
  const bad = appId === null && target.bad;
  const known = appId !== null && list.entries.some((e) => e.appId === appId);
  const full = list.entries.length >= list.max;
  const off = appId === null || known || full || busy !== null;
  const add = () => {
    if (off || appId === null) return;
    send('denyAdd', { appId });
    setText('');
  };
  const note = bad ? 'Это не AppID и не ссылка на страницу игры в магазине Steam'
    : known ? 'Эта игра уже в списке'
    : full ? 'Список заполнен. Уберите ненужные игры.'
    : null;
  return (
    <section className="titanium-island" aria-labelledby="sidle-deny-title">
      <h2 id="sidle-deny-title" className="sidle-title">Свои исключения (античит)</h2>
      <p className="sidle-text">В этих играх выдача достижений не запускается. Встроенный список неполон: добавьте сюда игры с античитом, которых в нём нет.</p>
      <form className="sidle-field" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label htmlFor="sidle-deny-input" className="sidle-label">AppID или ссылка на игру в Steam</label>
        <div className="sidle-deny-add">
          <input id="sidle-deny-input" type="text" className="sidle-input" value={text} autoComplete="off" spellCheck={false}
            aria-invalid={bad} aria-describedby={note !== null ? 'sidle-deny-help sidle-deny-note' : 'sidle-deny-help'} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="tactile-btn" aria-disabled={off}>Добавить в список</button>
        </div>
        <span id="sidle-deny-help" className="sidle-meta">Например, 730 или ссылка вида store.steampowered.com/app/730</span>
        {note !== null && <span id="sidle-deny-note" className="sidle-err" role="status">{note}</span>}
      </form>
      <p className="sidle-meta">
        <span>В списке: <b className="tabular">{list.entries.length} / {list.max}</b></span>
        <span>Встроенных игр: <b className="tabular">{list.builtinCount}</b></span>
      </p>
      {list.entries.length === 0
        ? <p className="sidle-text">Список пуст. Добавьте игру по AppID или ссылке.</p>
        : (
          <ul className="sidle-list-rows sidle-deny-list" aria-labelledby="sidle-deny-title">
            {list.entries.map((e) => (
              <li key={e.appId} className="sidle-row sidle-deny-row">
                <span className="sidle-row-main">
                  <span id={`sidle-deny-name-${e.appId}`} className="sidle-row-name" title={e.name ?? undefined}>{e.name ?? 'Название неизвестно'}</span>
                  <span className="sidle-row-note">AppID <span className="tabular">{e.appId}</span></span>
                </span>
                <button type="button" id={`sidle-deny-rm-${e.appId}`} className="tactile-btn sidle-deny-remove" aria-disabled={busy !== null}
                  aria-labelledby={`sidle-deny-rm-${e.appId} sidle-deny-name-${e.appId}`}
                  onClick={() => { if (busy === null) send('denyRemove', { appId: e.appId }); }}>Убрать</button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
};
