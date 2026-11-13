import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { SteamIdleAchievements, SteamIdleLibraryGame, SteamIdleState } from '../../types';
import { ACH_BUSY_NOTE, achLoadErrorText, achRunActive, SEARCH_LIMIT } from './achievementsText';
import { AchList } from './AchList';
import { GetState, useAchievementList, useBusyRetry } from './useAchievementsData';
import { SendCommand, SteamIdleCommand } from './useSteamIdle';

export type LibraryLoad = GetState<SteamIdleLibraryGame[]> & { reload: () => void };

const Bars: React.FC<{ label: string; rows?: number }> = ({ label, rows = 3 }) => (
  <div aria-hidden="true">
    {Array.from({ length: rows }, (_, n) => <span key={n} className="sk-bar" style={{ width: `${88 - n * 14}%`, height: '1em', marginTop: n ? 10 : 0 }} />)}
    <span className="sr-only" role="status" data-overflow-ok>{label}</span>
  </div>
);

const ErrorLine: React.FC<{ code: string; onRetry: () => void }> = ({ code, onRetry }) => (
  <>
    <p className="sidle-refusal" role="alert"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> {achLoadErrorText(code)}</p>
    <div className="sidle-actions"><button type="button" className="tactile-btn" onClick={onRetry}>Повторить</button></div>
  </>
);

/** A read answered busy during a run: neutral, no retry button, the list comes back when the run ends. */
const BusyNote: React.FC = () => <p className="sidle-text" role="status">{ACH_BUSY_NOTE}</p>;

const norm = (text: string) => text.toLocaleLowerCase();

const GamePicker: React.FC<{ games: SteamIdleLibraryGame[]; appId: number | null; onPick: (id: number) => void }> = ({ games, appId, onPick }) => {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...games].sort((a, b) => a.name.localeCompare(b.name)), [games]);
  const matches = useMemo(() => { const q = norm(query.trim()); return q ? sorted.filter((g) => norm(g.name).includes(q)) : sorted; }, [sorted, query]);
  const shown = matches.slice(0, SEARCH_LIMIT);
  return (
    <>
      <label className="sidle-field">
        <span className="sidle-label">Поиск по названию</span>
        <input type="search" className="sidle-input" value={query} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      {shown.length === 0 ? <p className="sidle-text" role="status">Ничего не найдено</p> : (
        <ul className="sidle-list-rows sidle-pick-list" aria-label="Игры библиотеки">
          {shown.map((g) => (
            <li key={g.appId}>
              <button type="button" className="sidle-pick" aria-pressed={g.appId === appId} onClick={() => onPick(g.appId)}>
                <span className="sidle-row-name" title={g.name}>{g.name}</span>
                {g.appId === appId && <Check className="ui-icon" aria-hidden="true" focusable="false" style={{ color: 'var(--led-mint)' }} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches.length > SEARCH_LIMIT && <p className="sidle-meta">показаны первые {SEARCH_LIMIT}</p>}
    </>
  );
};

/** One game: load the library list, pick a game, read its achievements, choose what to get. */
export const AchOneGame: React.FC<{ s: SteamIdleState; ach: SteamIdleAchievements; library: LibraryLoad; busy: SteamIdleCommand | null; send: SendCommand }> = ({ s, ach, library, busy, send }) => {
  const [appId, setAppId] = useState<number | null>(null);
  const runActive = achRunActive(ach.run.state);
  // The list is stale once the run has written to it. Mark it dirty when the totals or the newest finished game change,
  // while a run is on, or after a start command (the first state read after it); read it again once the run is not active.
  const { run } = ach;
  const newest = run.finished[0];
  const sig = `${Object.values(run.totals).join('.')}|${newest ? `${newest.appId}:${newest.unlocked}:${newest.skipped}:${newest.failed}` : ''}`;
  const [gen, setGen] = useState(0);
  const dirty = useRef(false);
  const prevSig = useRef(sig);
  const sentAt = useRef<SteamIdleAchievements | null>(null);
  useEffect(() => {
    if (sig !== prevSig.current) { prevSig.current = sig; dirty.current = true; }
    if (runActive) dirty.current = true;
    if (sentAt.current !== null && ach !== sentAt.current && busy === null) { sentAt.current = null; dirty.current = true; }
    if (dirty.current && !runActive && busy === null && sentAt.current === null) { dirty.current = false; setGen((g) => g + 1); }
  }, [sig, runActive, busy, ach]);
  const list = useAchievementList(appId, gen);
  useBusyRetry(list, runActive);
  const status = s.library.status ?? (s.library.count !== null ? 'ready' : 'none');
  const picked = library.data?.find((g) => g.appId === appId);
  const scanOff = busy !== null || !s.available || status === 'scanning';
  return (
    <section className="titanium-island" aria-labelledby="sidle-one-title" aria-busy={status === 'scanning' || list.status === 'loading'}>
      <h2 id="sidle-one-title" className="sidle-title">Одна игра</h2>
      {status !== 'ready' && (
        <>
          {status === 'failed' && <p className="sidle-refusal" role="status"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Не удалось прочитать список игр. Повторите позже.</p>}
          {status === 'scanning' && <Bars label="Читаем список игр" />}
          <div className="sidle-actions">
            <button type="button" className="tactile-btn" aria-disabled={scanOff} onClick={() => { if (!scanOff) send('libScan'); }}>
              <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> Загрузить список игр
            </button>
          </div>
        </>
      )}
      {status === 'ready' && library.status === 'loading' && <Bars label="Загружаем список игр" />}
      {status === 'ready' && library.status === 'error' && library.error !== null
        && (library.error === 'busy' && runActive ? <BusyNote /> : <ErrorLine code={library.error} onRetry={library.reload} />)}
      {status === 'ready' && library.data && <GamePicker games={library.data} appId={appId} onPick={setAppId} />}
      {appId !== null && (
        <div className="sidle-ach-game">
          <h3 className="sidle-subtitle sidle-game">{picked?.name ?? appId}</h3>
          {list.status === 'loading' && <Bars label="Читаем достижения игры" rows={4} />}
          {list.status === 'error' && list.error !== null
            && (list.error === 'busy' && runActive ? <BusyNote /> : <ErrorLine code={list.error} onRetry={list.reload} />)}
          {list.data && (
            <AchList key={appId} items={list.data} skipHidden={ach.settings.skipHidden} runActive={runActive} disabled={busy !== null || !s.available}
              onStart={(body) => { sentAt.current = ach; send('achStart', { appId, ...body }); }} />
          )}
        </div>
      )}
    </section>
  );
};
