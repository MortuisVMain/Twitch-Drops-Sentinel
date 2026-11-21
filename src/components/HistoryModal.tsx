import { Download, Gift, History, Trophy, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import type { ClaimedGameItem, TrophyItem } from '../types';
import { buildHistory, historyCsv, historyTotals, weeklyBuckets, type HistorySource } from '../utils/history.mjs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  trophies: TrophyItem[];
}

type Filter = 'all' | HistorySource;
const FEED_LIMIT = 100;

// What the app brought in: Twitch drops from Trophies.md and claimed free games, with totals, weeks and a CSV
export const HistoryModal: React.FC<Props> = ({ isOpen, onClose, trophies }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(isOpen, dialogRef, onClose);
  const [giveaways, setGiveaways] = useState<ClaimedGameItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!isOpen) return;
    setLoadError(false);
    fetch('http://127.0.0.1:28492/api/v1/giveaways/state')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setGiveaways(Array.isArray(d?.inventory) ? d.inventory : []))
      .catch((err) => { console.error('HistoryModal: giveaways load failed', err); setGiveaways([]); setLoadError(true); });
  }, [isOpen]);

  const now = Date.now();
  const items = useMemo(() => buildHistory(trophies, giveaways ?? []), [trophies, giveaways]);
  const totals = useMemo(() => historyTotals(items, now), [items, now]);
  const weeks = useMemo(() => weeklyBuckets(items, now, 8), [items, now]);
  const shown = useMemo(() => items.filter((i) => filter === 'all' || i.source === filter).slice(0, FEED_LIMIT), [items, filter]);
  const peak = Math.max(1, ...weeks.map((w) => w.twitch + w.giveaway));

  const exportCsv = () => {
    const blob = new Blob([historyCsv(items)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel_history_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!isOpen) return null;
  const tiles: Array<[string, { twitch: number; giveaway: number }]> = [['7 дней', totals.week], ['30 дней', totals.month], ['Всё время', totals.all]];
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="history-dialog w-[min(860px,94vw)] max-h-[90vh] outline-none flex flex-col overflow-hidden rounded-2xl border border-(--border-subtle) bg-(--bg-chassis-base)">
        <div className="history-head">
          <History className="ui-icon" aria-hidden="true" focusable="false" />
          <h2 id="history-title">История и статистика</h2>
          <button className="tactile-btn" onClick={exportCsv} disabled={items.length === 0} title="Сохранить всю историю в CSV для Excel">
            <Download className="ui-icon" aria-hidden="true" focusable="false" /> CSV
          </button>
          <button className="tactile-btn" onClick={onClose} aria-label="Закрыть"><X className="ui-icon" aria-hidden="true" focusable="false" /></button>
        </div>
        <div className="history-body">
          <div className="history-tiles">
            {tiles.map(([label, c]) => (
              <div key={label} className="history-tile">
                <span className="history-tile-label">{label}</span>
                <span className="history-tile-row"><Trophy className="ui-icon" aria-hidden="true" focusable="false" /> <span>Дропы</span> <strong className="tabular">{c.twitch}</strong></span>
                <span className="history-tile-row"><Gift className="ui-icon" aria-hidden="true" focusable="false" /> <span>Игры</span> <strong className="tabular">{c.giveaway}</strong></span>
              </div>
            ))}
          </div>

          <div className="history-weeks" role="img" aria-label="По неделям за последние 8 недель">
            {weeks.map((w) => (
              <div key={w.start} className="history-week" title={`Неделя с ${new Date(w.start).toLocaleDateString()}: дропов ${w.twitch}, игр ${w.giveaway}`}>
                <div className="history-bar">
                  <span className="history-bar-giveaway" style={{ height: `${(w.giveaway / peak) * 100}%` }} />
                  <span className="history-bar-twitch" style={{ height: `${(w.twitch / peak) * 100}%` }} />
                </div>
                <span className="history-week-label tabular">{new Date(w.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
          <div className="history-legend"><span className="dot twitch" /> Дропы Twitch <span className="dot giveaway" /> Бесплатные игры</div>

          <div className="history-filters" role="group" aria-label="Фильтр">
            {([['all', 'Всё'], ['twitch', 'Дропы Twitch'], ['giveaway', 'Бесплатные игры']] as Array<[Filter, string]>).map(([id, label]) => (
              <button key={id} className={`tactile-btn ${filter === id ? 'active-mint' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>

          {giveaways === null ? (
            <div className="history-empty">Загружаем историю…</div>
          ) : shown.length === 0 ? (
            <div className="history-empty">Пока ничего не получено.</div>
          ) : (
            <ul className="history-feed">
              {shown.map((item) => (
                <li key={item.id} className="history-row">
                  {item.source === 'twitch'
                    ? <Trophy className="ui-icon" aria-label="Дроп Twitch" focusable="false" />
                    : <Gift className="ui-icon" aria-label="Бесплатная игра" focusable="false" />}
                  <span className="history-row-title" title={item.title}>{item.title}</span>
                  <span className="history-row-detail" title={item.detail}>{item.detail}</span>
                  <span className="history-row-date tabular">{new Date(item.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          )}
          {loadError && <div className="history-empty" style={{ color: 'var(--led-rose)' }}>Раздачи не загрузились: показаны только дропы Twitch.</div>}
        </div>
      </div>
    </div>
  );
};
