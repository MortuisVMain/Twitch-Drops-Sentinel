import { Download } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useConfirm } from '../ConfirmDialog';
import { type SortKey, type SortState, type StatsPeriod, gamesCsv, nextSort, periodTotals, sortGames, weekBars } from './idleStats.mjs';
import { hoursNumber } from './steamIdleText';
import { resetIdleStats, useIdleStats } from './useIdleStats';

const PERIODS: Array<[StatsPeriod, string]> = [['7', '7 дней'], ['30', '30 дней'], ['all', 'Всё время']];
const COLUMNS: Array<[SortKey, string]> = [['time', 'Время'], ['cards', 'Карточки'], ['achievements', 'Достижения'], ['last', 'Последний раз']];
const RESET_CONFIRM = 'Сбросить статистику Steam IDLE? Будут удалены часы фарма, карточки и достижения по всем играм текущего аккаунта. Это нельзя отменить.';

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Hours, games, cards and achievements the app counted, with weekly bars, a sortable per-game table, CSV and a reset. */
export const StatsPanel: React.FC = () => {
  const { ask, confirmDialog } = useConfirm();
  const [period, setPeriod] = useState<StatsPeriod>('7');
  const [sort, setSort] = useState<SortState>({ key: 'last', dir: 'desc' });
  const { stats, failed, loading, reload } = useIdleStats(period);
  const tiles = periodTotals(stats);
  const bars = useMemo(() => weekBars(stats?.weeks ?? []), [stats]);
  const games = useMemo(() => sortGames(stats?.games ?? [], sort.key, sort.dir), [stats, sort]);
  const empty = stats !== null && stats.games.length === 0 && stats.weeks.every((w) => w.farmSeconds + w.cards + w.achievements === 0);

  const exportCsv = () => {
    const blob = new Blob([gamesCsv(games)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steam_idle_stats_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = async () => {
    if (!(await ask(RESET_CONFIRM, 'Сбросить статистику'))) return;
    if (await resetIdleStats()) reload();
  };

  return (
    <section className="titanium-island sidle-stats" aria-labelledby="sidle-stats-title">
      {confirmDialog}
      <div className="sidle-preview-head">
        <h2 id="sidle-stats-title" className="sidle-title">Статистика</h2>
        <div className="sidle-seg" role="group" aria-label="Период">
          {PERIODS.map(([id, label]) => (
            <button key={id} type="button" className="sidle-seg-btn" aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>
          ))}
        </div>
      </div>
      {failed && (
        <p className="sidle-refusal" role="alert">
          Не удалось загрузить статистику. <button type="button" className="tactile-btn" onClick={reload}>Повторить</button>
        </p>
      )}
      {stats === null ? (!failed && loading && <p className="sidle-text" role="status">Загрузка статистики…</p>) : (
        <>
          <dl className="sidle-stats-tiles">
            <div className="sidle-stats-tile"><dt>Время фарма</dt><dd className="tabular">{hoursNumber(tiles.hours)} ч</dd></div>
            <div className="sidle-stats-tile"><dt>Игры</dt><dd className="tabular">{tiles.games}</dd></div>
            <div className="sidle-stats-tile"><dt>Карточки</dt><dd className="tabular">{tiles.cards}</dd></div>
            <div className="sidle-stats-tile"><dt>Достижения</dt><dd className="tabular">{tiles.achievements}</dd></div>
          </dl>
          {empty ? (
            <p className="sidle-text">Статистика считается начиная с этой версии: часы фарма, карточки и достижения появятся здесь после первого запуска фарма или выдачи достижений.</p>
          ) : (
            <>
              <div className="sidle-stats-weeks" role="img" aria-label="Часы фарма по неделям за последние 12 недель">
                {bars.map((w) => (
                  <div key={w.weekStart} className="sidle-stats-week" title={`Неделя с ${dayLabel(w.weekStart)}: ${hoursNumber(w.hours)} ч, карточек ${w.cards}, достижений ${w.achievements}`}>
                    <div className="history-bar"><span className="history-bar-twitch" style={{ height: `${w.height}%` }} /></div>
                    <span className="history-week-label tabular">{dayLabel(w.weekStart)}</span>
                  </div>
                ))}
              </div>
              <p id="sidle-stats-hint" className="sidle-meta">Время по играм может пересекаться, если фарм идёт сразу в нескольких играх.</p>
              <div className="sidle-stats-scroll">
                <table className="sidle-stats-table" aria-label="По играм" aria-describedby="sidle-stats-hint">
                  <thead>
                    <tr>
                      <th scope="col">Игра</th>
                      {COLUMNS.map(([key, label]) => (
                        <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" className="sidle-stats-sort" onClick={() => setSort((cur) => nextSort(cur, key))}>
                            {label}{sort.key === key && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.appId}>
                        <th scope="row" className="sidle-stats-name" title={g.name}>{g.name}</th>
                        <td className="tabular">{hoursNumber(g.farmSeconds / 3600)} ч</td>
                        <td className="tabular">{g.cardsDropped}</td>
                        <td className="tabular">{g.achievements}</td>
                        <td className="tabular">{new Date(g.lastAt * 1000).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="sidle-actions">
            <button type="button" className="tactile-btn" onClick={exportCsv} disabled={games.length === 0} title="Сохранить таблицу игр в CSV для Excel">
              <Download className="ui-icon" aria-hidden="true" focusable="false" /> CSV
            </button>
            <button type="button" className="tactile-btn" onClick={() => void reset()}>Сбросить статистику</button>
          </div>
        </>
      )}
    </section>
  );
};
