import React, { useState, useMemo } from 'react';
import { 
  HardDrive, Flame, Plus, Check, Ban, Star, ArrowLeft, Gamepad2, Calendar, ShieldCheck, AlertCircle, ChevronUp, ChevronDown, Trash2
} from 'lucide-react';
import { GameItem } from '../types';
import { GameSearchAutocomplete } from './GameSearchAutocomplete';
import { resolveGameBoxArtSources } from '../utils/gameBoxArts';

interface GameShelfProps {
  games: GameItem[];
  priorityList: string[];
  excludedList: string[];
  onAddToPriority: (gameName: string) => void;
  onRemoveFromPriority: (gameName: string) => void;
  onAddToExcluded: (gameName: string) => void;
  onRemoveFromExcluded: (gameName: string) => void;
  onReorderPriority?: (gameName: string, direction: 'up' | 'down') => void;
  onRescanGames?: () => void;
  onBack?: () => void;
}

const ShelfItemPoster: React.FC<{ name: string; boxArt?: string }> = ({ name, boxArt }) => {
  const sources = useMemo(() => resolveGameBoxArtSources(name, [boxArt]), [name, boxArt]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  React.useEffect(() => {
    setCurrentIdx(0);
    setIsLandscape(false);
    setAllFailed(sources.length === 0);
  }, [sources]);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth <= 10 || img.currentSrc.includes('404_boxart')) {
      handleImgError();
      return;
    }
    setIsLandscape(img.naturalWidth / img.naturalHeight > 1.25);
  };

  const handleImgError = () => {
    if (currentIdx + 1 < sources.length) {
      setCurrentIdx(prev => prev + 1);
    } else {
      setAllFailed(true);
    }
  };

  const monogram = useMemo(() => {
    const tokens = name.split(/[\s:_-]+/).filter(Boolean);
    const lastTok = tokens[tokens.length - 1];
    const hasSeq = /^(\d+|II|III|IV|V|VI)$/i.test(lastTok) && tokens.length > 1;
    const wordTokens = hasSeq ? tokens.slice(0, -1) : tokens;
    const initials = wordTokens.length >= 2
      ? `${wordTokens[0][0]}${wordTokens[1][0]}`.toUpperCase()
      : (wordTokens[0]?.slice(0, 2) || 'GM').toUpperCase();
    return { initials, sequel: hasSeq ? lastTok.toUpperCase() : null };
  }, [name]);

  const currentSrc = sources[currentIdx];

  if (!currentSrc || allFailed) {
    return (
      <div className="w-14 h-19 shrink-0 rounded-xl bg-gradient-to-br from-[#1d2622] to-[#121816] flex flex-col items-center justify-center text-xs font-mono font-black text-[var(--accent)] border border-white/5 select-none shadow-sm">
        <span className="leading-tight tracking-wider">{monogram.initials}</span>
        {monogram.sequel && (
          <span className="text-[8px] font-sans px-1 py-[1px] bg-white/10 rounded text-white/80 leading-none mt-0.5">
            {monogram.sequel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-14 h-19 shrink-0 relative overflow-hidden rounded-xl border border-white/10 shadow-sm bg-[#121816]">
      {isLandscape ? (
        <>
          <img
            src={currentSrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-150 blur-sm opacity-40 pointer-events-none"
          />
          <img
            key={currentSrc}
            src={currentSrc}
            alt={name}
            className="relative z-10 w-full h-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            onError={handleImgError}
          />
        </>
      ) : (
        <img
          key={currentSrc}
          src={currentSrc}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onLoad={handleImgLoad}
          onError={handleImgError}
        />
      )}
    </div>
  );
};

export const GameShelf: React.FC<GameShelfProps> = ({
  games,
  priorityList,
  excludedList,
  onAddToPriority,
  onRemoveFromPriority,
  onAddToExcluded,
  onRemoveFromExcluded,
  onReorderPriority,
  onRescanGames,
  onBack
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'drops' | 'installed' | 'priority' | 'excluded' | 'all'>('drops');
  const [isClearingInstalled, setIsClearingInstalled] = useState(false);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  const handleClearInstalled = async () => {
    setIsClearingInstalled(true);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/installed-games/clear', {
        method: 'POST',
      });
      if (res.ok) {
        if (onRescanGames) onRescanGames();
      }
    } catch (err) {
      console.error('Failed to clear installed games:', err);
    } finally {
      setIsClearingInstalled(false);
    }
  };

  const handleRemoveInstalled = async (gameName: string, gameId?: string) => {
    const key = (gameId || gameName).toLowerCase();
    setRemovedKeys(prev => new Set(prev).add(key).add(gameName.toLowerCase()));
    try {
      await fetch('http://127.0.0.1:28492/api/installed-games/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gameId || '', name: gameName }),
      });
      if (onRescanGames) onRescanGames();
    } catch (err) {
      console.error('Failed to remove installed game:', err);
    }
  };

  // Filtered games
  const filteredGames = useMemo(() => {
    return games.filter((g: GameItem) => {
      const key = (g.id || g.name).toLowerCase();
      if (removedKeys.has(key) || removedKeys.has(g.name.toLowerCase())) return false;
      const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (filterMode === 'drops') return g.has_drops;
      if (filterMode === 'installed') return g.is_installed;
      if (filterMode === 'priority') return priorityList.includes(g.name);
      if (filterMode === 'excluded') return excludedList.includes(g.name);
      return true;
    });
  }, [games, search, filterMode, priorityList, excludedList, removedKeys]);

  const installedCount = games.filter(g => g.is_installed).length;
  const dropsCount = games.filter(g => g.has_drops).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 select-none pb-12 animate-in fade-in duration-300">
      {/* Top Header & Search Bar */}
      <div className="card p-6 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4 w-full md:w-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--line)] text-xs font-semibold text-[var(--foreground)] transition-all shadow-sm active:scale-95 group shrink-0 cursor-pointer"
              title="Вернуться в обзор фарма"
            >
              <ArrowLeft className="w-4 h-4 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
              <span>Назад в Обзор</span>
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-[var(--accent)]" />
              Полка Игр и Управление Фармом
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              Доступно <strong className="text-[var(--accent)] font-semibold">{dropsCount} гарантированных раздач</strong> на Twitch и {installedCount} игр на ПК.
            </p>
          </div>
        </div>

        {/* Quick Add & Autocomplete Suggestions Search */}
        <div className="w-full md:w-96 relative z-30">
          <GameSearchAutocomplete
            allGames={games}
            priorityList={priorityList}
            onAddToPriority={onAddToPriority}
            onRemoveFromPriority={onRemoveFromPriority}
            query={search}
            onQueryChange={setSearch}
            placeholder="Поиск или ввод названия игры..."
          />
        </div>
      </div>

      {/* Guaranteed Drops Assurance Banner */}
      <div className="p-4 rounded-2xl bg-[var(--bg-surface-1)] border border-[var(--line-accent)] flex items-center justify-between gap-4 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#217C5E]/20 text-[var(--accent)] flex items-center justify-center shrink-0 border border-[var(--accent)]/30">
            <Flame className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--foreground)] flex items-center gap-2">
              <span>Гарантированный сбор Twitch Drops</span>
              <span className="px-2 py-0.5 rounded-full bg-[#217C5E]/20 text-[var(--accent)] text-[10px] font-mono border border-[var(--accent)]/30">
                100% Live Verified
              </span>
            </h4>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              Все игры во вкладке <strong className="text-[var(--accent)]">«🔥 Гарантированные Drops»</strong> имеют подтверждённые раздачи на Twitch прямо сейчас. Добавление любой из них в ТОП сразу запускает процесс фарма наград.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Badges */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'drops' as const, label: `🔥 Гарантированные Drops (${dropsCount})` },
          { id: 'priority' as const, label: `⭐ В моем ТОПе (${priorityList.length})` },
          { id: 'installed' as const, label: `💾 Установлено на ПК (${installedCount})` },
          { id: 'excluded' as const, label: `🚫 Исключения (${excludedList.length})` },
          { id: 'all' as const, label: `Все игры каталога (${games.length})` }
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilterMode(f.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
              filterMode === f.id
                ? 'bg-gradient-to-r from-[#217C5E] to-[#3AD29F] text-[#050608] font-bold border border-[#7CE8C2]/40 shadow-[0_2px_10px_rgba(58,210,159,0.25)]'
                : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)] hover:text-[var(--foreground)] hover:bg-white/[0.04]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Installed Games Management Banner */}
      {filterMode === 'installed' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--line)] text-xs text-[var(--muted)] shadow-sm backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span>Обнаружено <strong className="text-[var(--foreground)]">{installedCount}</strong> установленных игр на ПК.</span>
          </div>
          {installedCount > 0 && (
            <button
              type="button"
              onClick={handleClearInstalled}
              disabled={isClearingInstalled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 text-[var(--muted)] hover:text-rose-400 border border-[var(--line)] hover:border-rose-500/30 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 self-end sm:self-auto"
              title="Очистить обнаруженные установленные игры"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isClearingInstalled ? 'Очистка...' : 'Очистить список'}</span>
            </button>
          )}
        </div>
      )}

      {/* Games Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGames.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs text-[var(--muted)] card p-8">
            <Gamepad2 className="w-10 h-10 mx-auto text-[var(--muted)]/40 mb-2" />
            <p className="font-semibold text-[var(--foreground)]">Игры по запросу «{search}» не найдены</p>
            <p className="text-[11px] text-[var(--muted)] mt-1">Попробуйте изменить поисковый запрос или фильтр</p>
          </div>
        ) : (
          filteredGames.map((game: GameItem) => {
            const inPriority = priorityList.includes(game.name);
            const inExcluded = excludedList.includes(game.name);

            return (
              <div
                key={game.id}
                className={`card p-4 flex flex-col justify-between group relative overflow-hidden transition-all hover:border-[var(--accent)]/50 ${
                  inPriority ? 'border-[var(--accent)] shadow-[0_4px_20px_rgba(58,210,159,0.15)] ring-1 ring-[var(--accent)]/30' : ''
                } ${inExcluded ? 'opacity-60 border-red-500/20' : ''}`}
              >
                {/* Glow accent for priority or active drops */}
                {inPriority ? (
                  <div className="absolute top-0 right-0 w-28 h-28 bg-[var(--accent)]/10 rounded-full blur-2xl pointer-events-none" />
                ) : game.has_drops ? (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent)]/5 rounded-full blur-2xl pointer-events-none" />
                ) : null}

                <div>
                  <div className="flex items-start gap-3">
                    {/* Game Box Art Poster */}
                    <ShelfItemPoster name={game.name} boxArt={game.box_art} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5">
                        <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors leading-snug line-clamp-2">
                          {game.name}
                        </h3>
                        {inPriority && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-1.5 py-0.5 rounded-md bg-[#217C5E]/25 text-[var(--accent)] border border-[var(--accent)]/30 text-[10px] font-mono font-bold" title={`Позиция в очереди: #${priorityList.indexOf(game.name) + 1}`}>
                              #{priorityList.indexOf(game.name) + 1}
                            </span>
                            {onReorderPriority && (
                              <div className="flex items-center bg-white/[0.04] rounded-lg border border-[var(--line)] p-0.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onReorderPriority(game.name, 'up');
                                  }}
                                  disabled={priorityList.indexOf(game.name) === 0}
                                  className="p-1 text-[var(--muted)] hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none rounded cursor-pointer transition-colors"
                                  title="Переместить выше в очереди"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onReorderPriority(game.name, 'down');
                                  }}
                                  disabled={priorityList.indexOf(game.name) === priorityList.length - 1}
                                  className="p-1 text-[var(--muted)] hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none rounded cursor-pointer transition-colors"
                                  title="Переместить ниже в очереди"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            <span className="p-1 rounded-lg bg-[#217C5E]/20 text-[var(--accent)] border border-[var(--accent)]/30" title="В ТОП-приоритете">
                              <Star className="w-3.5 h-3.5 fill-[var(--accent)] text-[var(--accent)]" />
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {game.has_drops ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[#217C5E]/20 text-[var(--accent)] border border-[var(--accent)]/30 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-[var(--accent)]" />
                            <span>Гарантированный фарм {game.rewards_count ? `(${game.rewards_count})` : ''}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/25 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Ожидание Drops</span>
                          </span>
                        )}
                        {game.is_installed && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--muted)] border border-[var(--line)]">
                            💾 ПК
                          </span>
                        )}
                        {game.drops_end_at && (
                          <span className="text-[10px] font-medium text-[var(--muted)] bg-[var(--surface-elevated)] px-2 py-0.5 rounded-lg border border-[var(--line)] flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[var(--accent)]" />
                            <span className="tabular-nums">до {new Date(game.drops_end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center gap-2">
                  {/* Priority Button */}
                  <button
                    onClick={() => inPriority ? onRemoveFromPriority(game.name) : onAddToPriority(game.name)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                      inPriority
                        ? 'bg-gradient-to-r from-[#217C5E] to-[#3AD29F] text-[#050608] font-bold border border-[#7CE8C2]/40 shadow-sm'
                        : game.has_drops
                          ? 'bg-[var(--accent)]/15 hover:bg-[var(--accent)] hover:text-[#050608] text-[var(--accent)] border border-[var(--accent)]/30 font-bold'
                          : 'bg-white/[0.04] text-[var(--muted)] hover:text-white hover:bg-white/[0.08] border border-[var(--line)]'
                    }`}
                  >
                    {inPriority ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#050608]" />
                        <span>В ТОП-приоритете</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{game.has_drops ? '+ В ТОП (Фармить)' : '+ В ТОП (Ждать)'}</span>
                      </>
                    )}
                  </button>

                  {/* Exclude Button */}
                  <button
                    onClick={() => inExcluded ? onRemoveFromExcluded(game.name) : onAddToExcluded(game.name)}
                    className={`flex items-center justify-center p-2 rounded-xl text-xs transition-all cursor-pointer active:scale-95 ${
                      inExcluded
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                        : 'bg-white/[0.04] text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 border border-[var(--line)]'
                    }`}
                    title={inExcluded ? 'Убрать из исключений' : 'Исключить из фарма'}
                  >
                    <Ban className="w-4 h-4" />
                  </button>

                  {/* Remove / Hide Game Button */}
                  <button
                    onClick={() => handleRemoveInstalled(game.name, game.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 hover:text-rose-200 hover:border-rose-500/50 shadow-sm"
                    title="Удалить / скрыть игру из списка навсегда"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">Скрыть</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
