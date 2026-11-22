import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, Search, ShieldAlert, TriangleAlert } from 'lucide-react';
import { SteamIdleAchievement, SteamIdleAchievements, SteamIdleLibraryGame, SteamIdleState } from '../../types';
import { ACH_BUSY_NOTE, achLoadErrorText, achRunActive, SEARCH_LIMIT } from './achievementsText';
import { AchList } from './AchList';
import { CartridgeCover } from '../CartridgeCover';
import { playedHours, steamCover } from './steamIdleLogic.mjs';
import { hoursNumber } from './steamIdleText';
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

type Progress = { achieved: number; total: number };
type Filter = 'all' | 'open' | 'done';
const FILTERS: ReadonlyArray<[Filter, string]> = [['all', 'Все'], ['open', 'Не завершены'], ['done', 'Завершены']];
const isDone = (p: Progress | null | undefined): boolean => !!p && p.total > 0 && p.achieved === p.total;
const progressOf = (items: SteamIdleAchievement[]): Progress => ({ achieved: items.filter((a) => a.achieved).length, total: items.length });

/** Achieved of total as a bar and words; null progress means the game's list was never read on this computer. */
const ProgressLine: React.FC<{ p: Progress | null | undefined; large?: boolean }> = ({ p, large = false }) => {
  if (!p || p.total === 0) return <span className="sidle-prog-text muted">Прогресс узнаем, когда откроете игру</span>;
  const pct = Math.round((p.achieved / p.total) * 100);
  return (
    <span className={`sidle-prog${large ? ' large' : ''}`}>
      <span className="sidle-prog-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} className={pct === 100 ? 'full' : undefined} /></span>
      <span className="sidle-prog-text">
        {pct === 100
          ? <><Check className="ui-icon" aria-hidden="true" focusable="false" /> Всё получено: <b className="tabular">{p.total}</b></>
          : p.achieved === 0
            ? <>Не получено ни одного из <b className="tabular">{p.total}</b></>
            : <>Получено <b className="tabular">{p.achieved}</b> из <b className="tabular">{p.total}</b></>}
      </span>
    </span>
  );
};

/** Anti-cheat label of a game: the built-in table (fixed) or the user's own list. */
const shieldOf = (g: SteamIdleLibraryGame): string | null => (g.userDenied ? 'Исключена вами' : g.protected ? 'Античит' : null);

const GameRow: React.FC<{ g: SteamIdleLibraryGame; selected: boolean; onPick: () => void }> = ({ g, selected, onPick }) => {
  const hours = playedHours(g.playtimeMinutes);
  const shield = shieldOf(g);
  return (
    <li>
      <button type="button" className={`sidle-pick${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onPick}>
        <span className="sidle-pick-cover"><CartridgeCover name={g.name} boxArt={steamCover(g.appId)} compact decorative /></span>
        <span className="sidle-pick-main">
          <span className="sidle-pick-title" title={g.name}>{g.name}</span>
          <span className="sidle-pick-facts">
            <span>{hours === null ? 'Не запускалась' : <>В игре: <b className="tabular">{hoursNumber(hours)}</b> ч</>}</span>
            {shield && <span className="sidle-shield"><ShieldAlert className="ui-icon" aria-hidden="true" focusable="false" /> {shield}</span>}
          </span>
          <ProgressLine p={g.achievements} />
        </span>
      </button>
    </li>
  );
};

/** The library as a searchable list of games with achievements; games known to have none are left out. */
const GamePicker: React.FC<{ games: SteamIdleLibraryGame[]; checking: boolean; appId: number | null; onPick: (id: number) => void }> = ({ games, checking, appId, onPick }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(SEARCH_LIMIT);
  const withAch = useMemo(() => games.filter((g) => g.hasAchievements !== false).sort((a, b) => a.name.localeCompare(b.name)), [games]);
  const hidden = games.length - withAch.length;
  const matches = useMemo(() => {
    const q = norm(query.trim());
    return withAch.filter((g) => (!q || norm(g.name).includes(q))
      && (filter === 'all' || (filter === 'done') === isDone(g.achievements)));
  }, [withAch, query, filter]);
  useEffect(() => { setLimit(SEARCH_LIMIT); }, [query, filter]);
  const shown = matches.slice(0, limit);
  return (
    <div className="sidle-picker">
      <label className="sidle-search">
        <Search className="ui-icon" aria-hidden="true" focusable="false" />
        <span className="sr-only">Поиск по названию</span>
        <input type="search" className="sidle-input" value={query} autoComplete="off" placeholder="Найти игру по названию" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="sidle-seg" role="group" aria-label="Показать игры">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className="sidle-seg-btn" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <p className="sidle-meta" role="status">
        <span>игр с достижениями: <b className="tabular">{withAch.length}</b></span>
        {hidden > 0 && <span>без достижений скрыто: <b className="tabular">{hidden}</b></span>}
        {checking && <span>проверяем, в каких играх есть достижения…</span>}
      </p>
      {shown.length === 0 ? <p className="sidle-text" role="status">Ничего не найдено</p> : (
        <ul className="sidle-pick-list" aria-label="Игры с достижениями" tabIndex={0}>
          {shown.map((g) => <GameRow key={g.appId} g={g} selected={g.appId === appId} onPick={() => onPick(g.appId)} />)}
        </ul>
      )}
      {matches.length > limit && (
        <div className="sidle-actions">
          <button type="button" className="tactile-btn" onClick={() => setLimit((n) => n + SEARCH_LIMIT)}>
            Показать ещё <span className="tabular">({Math.min(SEARCH_LIMIT, matches.length - limit)} из {matches.length - limit})</span>
          </button>
        </div>
      )}
    </div>
  );
};

/** "Never write to this game": the user's own anti-cheat list, as one switch. Built-in games are on and locked. */
const ShieldSwitch: React.FC<{ g: SteamIdleLibraryGame; busy: SteamIdleCommand | null; send: SendCommand }> = ({ g, busy, send }) => {
  const builtin = g.protected === true && !g.userDenied;
  const on = g.protected === true;
  const off = builtin || busy !== null;
  return (
    <button type="button" role="switch" aria-checked={on} aria-disabled={off} className="sidle-switch-row"
      onClick={() => { if (!off) send(g.userDenied ? 'denyRemove' : 'denyAdd', { appId: g.appId }); }}>
      <span className="sidle-switch-text">
        <span className="sidle-switch-title"><ShieldAlert className="ui-icon" aria-hidden="true" focusable="false" /> Не выдавать достижения в этой игре</span>
        <span className="sidle-switch-hint">
          {builtin
            ? 'Игра во встроенном списке игр с античитом: выдача в ней запрещена всегда.'
            : 'Для сетевых игр с античитом: защищает аккаунт от бана. Игра пропускается и при выдаче по всей библиотеке.'}
        </span>
      </span>
      <span className={`cnc-switch ${on ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
    </button>
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
  // The service stores the progress of every read, but the list we hold is older: show what was just read right away.
  const [seen, setSeen] = useState<ReadonlyMap<number, Progress>>(new Map());
  const listData = list.data;
  useEffect(() => {
    if (appId !== null && listData) setSeen((m) => new Map(m).set(appId, progressOf(listData)));
  }, [appId, listData]);
  const games = useMemo(() => library.data?.map((g) => (seen.has(g.appId) ? { ...g, achievements: seen.get(g.appId), hasAchievements: seen.get(g.appId)!.total > 0 || g.hasAchievements } : g)) ?? null, [library.data, seen]);
  const picked = games?.find((g) => g.appId === appId);
  const pickedHours = picked ? playedHours(picked.playtimeMinutes) : null;
  const scanOff = busy !== null || !s.available || status === 'scanning';
  return (
    <section className="titanium-island" aria-labelledby="sidle-one-title" aria-busy={status === 'scanning' || list.status === 'loading'}>
      <h2 id="sidle-one-title" className="sidle-title">Игры с достижениями</h2>
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
      {status === 'ready' && library.data && (
        <div className="sidle-one-grid">
          <GamePicker games={games ?? []} checking={s.library.achievementsChecking === true} appId={appId} onPick={setAppId} />
          <div className="sidle-ach-game" aria-live="polite">
            {appId === null ? (
              <p className="sidle-empty">Выберите игру в списке: здесь появятся её достижения и кнопки выдачи.</p>
            ) : (
              <>
                <div className="sidle-game-head">
                  <span className="sidle-card-cover sidle-game-cover"><CartridgeCover name={picked?.name ?? String(appId)} boxArt={steamCover(appId)} compact decorative /></span>
                  <span className="sidle-current-text">
                    <h3 id="sidle-picked-title" className="sidle-subtitle sidle-game">{picked?.name ?? appId}</h3>
                    {pickedHours !== null && <span className="sidle-meta"><span>В игре: <b className="tabular">{hoursNumber(pickedHours)}</b> ч</span></span>}
                    <ProgressLine large p={(list.data && progressOf(list.data)) ?? picked?.achievements} />
                  </span>
                </div>
                {picked && (s.denylist ? <ShieldSwitch g={picked} busy={busy} send={send} />
                  : picked.protected && <p className="sidle-text">Игра с античитом: достижения в ней не выдаются.</p>)}
                {list.status === 'loading' && <Bars label="Читаем достижения игры" rows={4} />}
                {list.status === 'error' && list.error !== null
                  && (list.error === 'busy' && runActive ? <BusyNote /> : <ErrorLine code={list.error} onRetry={list.reload} />)}
                {list.data && (
                  <AchList key={appId} hideCount items={list.data} skipHidden={ach.settings.skipHidden} runActive={runActive} disabled={busy !== null || !s.available || picked?.protected === true}
                    onStart={(body) => { sentAt.current = ach; send('achStart', { appId, ...body }); }} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
