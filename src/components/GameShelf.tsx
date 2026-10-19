import React, { useState, useMemo } from 'react';
import { 
  HardDrive, Flame, Plus, Check, Ban, Star, ArrowLeft, Gamepad2, Calendar, ShieldCheck, AlertCircle, ChevronUp, ChevronDown, Trash2, Trophy, RefreshCw, RotateCcw
} from 'lucide-react';
import { GameItem, TrophyItem } from '../types';
import { GameSearchAutocomplete } from './GameSearchAutocomplete';
import { resolveGameBoxArtSources } from '../utils/gameBoxArts';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface GameShelfProps {
  games: GameItem[];
  priorityList: string[];
  excludedList: string[];
  ignoredGames?: string[];
  trophies?: TrophyItem[];
  onAddToPriority: (gameName: string) => void;
  onRemoveFromPriority: (gameName: string) => void;
  onAddToExcluded: (gameName: string) => void;
  onRemoveFromExcluded: (gameName: string) => void;
  onReorderPriority?: (gameName: string, direction: 'up' | 'down') => void;
  onRescanGames?: () => void;
  onBack?: () => void;
  onOpenVaultFile?: () => void;
  onShowToast?: (msg: string) => void;
  onManualRefresh?: () => void;
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
  ignoredGames = [],
  trophies,
  onAddToPriority,
  onRemoveFromPriority,
  onAddToExcluded,
  onRemoveFromExcluded,
  onReorderPriority,
  onRescanGames,
  onBack,
  onOpenVaultFile,
  onShowToast,
  onManualRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'drops' | 'priority' | 'claimed' | 'installed' | 'excluded' | 'removed' | 'all'>('drops');
  const [isClearingInstalled, setIsClearingInstalled] = useState(false);
  const [isSyncingDrops, setIsSyncingDrops] = useState(false);
  const [isSyncSuccess, setIsSyncSuccess] = useState(false);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  const { playClick, playRewardChime } = useTactileAudio();

  const removedSet = useMemo(() => {
    const set = new Set<string>();
    (ignoredGames || []).forEach(n => set.add(n.toLowerCase().trim()));
    removedKeys.forEach(n => set.add(n.toLowerCase().trim()));
    return set;
  }, [ignoredGames, removedKeys]);

  const isGameRemoved = (g: GameItem): boolean => {
    const key = (g.id || g.name).toLowerCase().trim();
    const gNameLow = g.name.toLowerCase().trim();
    return removedSet.has(key) || removedSet.has(gNameLow);
  };

  const handleRestoreGame = async (gameName: string, gameId?: string) => {
    playClick();
    const key = (gameId || gameName).toLowerCase().trim();
    const nameLow = gameName.toLowerCase().trim();
    setRemovedKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      next.delete(nameLow);
      return next;
    });
    try {
      const res = await fetch('http://127.0.0.1:28492/api/installed-games/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gameId || '', name: gameName }),
      });
      if (res.ok) {
        playRewardChime();
        if (onManualRefresh) onManualRefresh();
        else if (onRescanGames) onRescanGames();
        if (onShowToast) onShowToast(`✓ Игра "${gameName}" восстановлена на полку`);
      } else {
        if (onShowToast) onShowToast(`Не удалось восстановить игру "${gameName}"`);
      }
    } catch (err) {
      console.error('Failed to restore game:', err);
      if (onShowToast) onShowToast(`Ошибка при восстановлении игры`);
    }
  };

  const isDropActiveNow = (g: GameItem): boolean => {
    if (!g.has_drops) return false;
    const now = Date.now();
    if (g.drops_end_at) {
      try {
        const endMs = new Date(g.drops_end_at).getTime();
        if (!isNaN(endMs) && endMs <= now) return false;
      } catch {
        // ignore
      }
    }
    if (g.drops_start_at) {
      try {
        const startMs = new Date(g.drops_start_at).getTime();
        if (!isNaN(startMs) && startMs > now) return false;
      } catch {
        // ignore
      }
    }
    return true;
  };

  const handleSyncDrops = async () => {
    if (isSyncingDrops) return;
    playClick();
    setIsSyncingDrops(true);
    setIsSyncSuccess(false);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/campaigns/sync', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (onManualRefresh) {
          onManualRefresh();
        } else if (onRescanGames) {
          onRescanGames();
        }
        setIsSyncSuccess(true);
        playRewardChime();
        if (onShowToast) {
          const count = data.active_drops_count !== undefined ? data.active_drops_count : dropsCount;
          onShowToast(`✨ Раздачи Twitch синхронизированы: найдено ${count} действующих кампаний онлайн.`);
        }
        setTimeout(() => {
          setIsSyncSuccess(false);
        }, 2500);
      } else {
        if (onShowToast) onShowToast('Не удалось синхронизировать раздачи Twitch.');
      }
    } catch (err) {
      console.error('Failed to sync Twitch drops:', err);
      if (onShowToast) onShowToast('Ошибка соединения с Twitch API.');
    } finally {
      setIsSyncingDrops(false);
    }
  };

  // Map of normalized game name -> list of claimed trophies
  const claimedTrophiesByGame = useMemo(() => {
    const map = new Map<string, TrophyItem[]>();
    if (!trophies) return map;
    for (const t of trophies) {
      if (!t.game) continue;
      const key = t.game.toLowerCase().trim();
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [trophies]);

  // Synthesize games from trophies if they're not in the active catalog
  const allShelfGames = useMemo(() => {
    const existingKeys = new Set(games.map(g => g.name.toLowerCase().trim()));
    const synthetic: GameItem[] = [];
    claimedTrophiesByGame.forEach((items, gameKey) => {
      if (!existingKeys.has(gameKey) && items.length > 0) {
        const origName = items[0].game;
        synthetic.push({
          id: `claimed_${origName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          name: origName,
          is_installed: false,
          has_drops: false,
          is_finished: true,
          claimed_drops: items.length,
          total_drops: items.length,
          progress_percent: 100,
          category: 'Twitch Drops / Собрано',
        });
      }
    });
    return [...games, ...synthetic];
  }, [games, claimedTrophiesByGame]);

  const isGameClaimed = (g: GameItem) => {
    const key = g.name.toLowerCase().trim();
    const trophiesList = claimedTrophiesByGame.get(key);
    if (trophiesList && trophiesList.length > 0) return true;
    if (g.is_finished) return true;
    if (g.claimed_drops && g.total_drops && g.claimed_drops >= g.total_drops) return true;
    if (g.progress_percent !== undefined && g.progress_percent >= 100) return true;
    return false;
  };

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
    // If game is not installed or synthetic from trophies, also add to excludedList so it persists
    if (!games.some(g => g.name.toLowerCase().trim() === gameName.toLowerCase().trim() && g.is_installed)) {
      onAddToExcluded(gameName);
    }
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

  const excludedSet = useMemo(() => {
    return new Set(excludedList.map(n => n.toLowerCase().trim()));
  }, [excludedList]);

  const prioritySet = useMemo(() => {
    return new Set(priorityList.map(n => n.toLowerCase().trim()));
  }, [priorityList]);

  // Filtered games
  const filteredGames = useMemo(() => {
    return allShelfGames.filter((g: GameItem) => {
      const gNameLow = g.name.toLowerCase().trim();
      const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase().trim());
      if (!matchesSearch) return false;

      const isRemoved = isGameRemoved(g);
      if (filterMode === 'removed') return isRemoved;
      if (isRemoved) return false; // Strict gate: removed games NEVER show in other tabs

      const isExcluded = excludedSet.has(gNameLow);
      if (filterMode === 'excluded') return isExcluded;
      if (isExcluded) return false; // Strict gate: excluded games NEVER show in drops, priority, claimed, installed, or all

      if (filterMode === 'drops') return isDropActiveNow(g);
      if (filterMode === 'priority') return prioritySet.has(gNameLow);
      if (filterMode === 'claimed') return isGameClaimed(g);
      if (filterMode === 'installed') return g.is_installed;
      return true;
    });
  }, [allShelfGames, search, filterMode, prioritySet, excludedSet, removedSet, claimedTrophiesByGame]);

  const activeShelfGames = useMemo(() => {
    return allShelfGames.filter(g => {
      const gNameLow = g.name.toLowerCase().trim();
      return !excludedSet.has(gNameLow) && !isGameRemoved(g);
    });
  }, [allShelfGames, excludedSet, removedSet]);

  const installedCount = activeShelfGames.filter(g => g.is_installed).length;
  const dropsCount = activeShelfGames.filter(g => isDropActiveNow(g)).length;
  const claimedCount = activeShelfGames.filter(g => isGameClaimed(g)).length;
  const removedCount = allShelfGames.filter(g => isGameRemoved(g)).length;

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

        {/* Quick Add, Sync Drops & Autocomplete Suggestions Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto relative z-30">
          <button
            type="button"
            onClick={handleSyncDrops}
            disabled={isSyncingDrops}
            className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0 ${
              isSyncSuccess
                ? 'bg-[#217C5E]/25 border-[#3AD29F]/60 text-[#7CE8C2] shadow-[0_0_15px_rgba(58,210,159,0.3)]'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-[var(--line)] text-[var(--foreground)] hover:border-[var(--accent)]/50'
            }`}
            title="Синхронизировать действующие сейчас раздачи напрямую с Twitch API"
          >
            {isSyncSuccess ? (
              <Check className="w-4 h-4 text-[#3AD29F] animate-in zoom-in-75 duration-200" />
            ) : (
              <RefreshCw className={`w-4 h-4 text-[var(--accent)] ${isSyncingDrops ? 'animate-spin' : ''}`} />
            )}
            <span>
              {isSyncingDrops ? 'Синхронизация...' : isSyncSuccess ? 'Синхронизировано!' : 'Синхронизировать Drops'}
            </span>
          </button>

          <div className="w-full sm:w-72 md:w-80">
            <GameSearchAutocomplete
              allGames={games}
              priorityList={priorityList}
              excludedList={excludedList}
              ignoredList={Array.from(removedSet)}
              onAddToPriority={onAddToPriority}
              onRemoveFromPriority={onRemoveFromPriority}
              query={search}
              onQueryChange={setSearch}
              placeholder="Поиск или ввод названия игры..."
            />
          </div>
        </div>
      </div>

      {/* Guaranteed Drops Assurance Banner */}
      <div className="p-4 rounded-2xl bg-[var(--bg-surface-1)] border border-[var(--line-accent)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#217C5E]/20 text-[var(--accent)] flex items-center justify-center shrink-0 border border-[var(--accent)]/30">
            <Flame className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--foreground)] flex items-center gap-2">
              <span>Гарантированный сбор Twitch Drops</span>
              <span className="px-2 py-0.5 rounded-full bg-[#217C5E]/20 text-[var(--accent)] text-[10px] font-mono border border-[var(--accent)]/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3AD29F] animate-pulse" />
                100% Live Verified
              </span>
            </h4>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              Все игры во вкладке <strong className="text-[var(--accent)]">«🔥 Гарантированные Drops»</strong> имеют подтверждённые раздачи на Twitch прямо сейчас. Добавление любой из них в ТОП сразу запускает процесс фарма наград.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSyncDrops}
          disabled={isSyncingDrops}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 self-end sm:self-auto ${
            isSyncSuccess
              ? 'bg-[#217C5E]/25 border border-[#3AD29F]/50 text-[#7CE8C2]'
              : 'bg-white/[0.05] hover:bg-white/[0.1] text-[var(--foreground)] border border-[var(--line)] hover:border-[var(--accent)]/40'
          }`}
          title="Обновить список активных раздач с Twitch"
        >
          {isSyncSuccess ? (
            <Check className="w-3.5 h-3.5 text-[#3AD29F]" />
          ) : (
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent)] ${isSyncingDrops ? 'animate-spin' : ''}`} />
          )}
          <span>{isSyncingDrops ? 'Проверка...' : isSyncSuccess ? 'Обновлено!' : 'Обновить Drops'}</span>
        </button>
      </div>

      {/* Filter Tabs & Badges */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'drops' as const, label: `🔥 Гарантированные Drops (${dropsCount})` },
          { id: 'priority' as const, label: `⭐ В моем ТОПе (${priorityList.length})` },
          { id: 'claimed' as const, label: `🏆 Собрано (${claimedCount})` },
          { id: 'installed' as const, label: `💾 Установлено на ПК (${installedCount})` },
          { id: 'excluded' as const, label: `🚫 Исключения (${excludedList.length})` },
          { id: 'removed' as const, label: `🗑️ Удалённые (${removedCount})` },
          { id: 'all' as const, label: `Все игры каталога (${allShelfGames.length})` }
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

      {/* Claimed Drops Management Banner */}
      {filterMode === 'claimed' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#368873]/10 border border-[#73bba5]/30 text-xs text-[var(--muted)] shadow-sm backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#368873]/20 text-[#73bba5] flex items-center justify-center shrink-0 border border-[#73bba5]/30">
              <Trophy className="w-4 h-4 text-[#73bba5]" />
            </div>
            <div>
              <div className="font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>Коллекция собранных наград Twitch Drops</span>
                <span className="px-2 py-0.5 rounded-full bg-[#368873]/20 text-[#73bba5] text-[10px] font-mono font-bold border border-[#73bba5]/30">
                  {claimedCount} {claimedCount === 1 ? 'игра' : (claimedCount > 1 && claimedCount < 5 ? 'игры' : 'игр')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                Игры, по которым получены награды на вашем аккаунте Twitch. Все трофеи зафиксированы в локальном журнале.
              </p>
            </div>
          </div>
          {onOpenVaultFile && (
            <button
              type="button"
              onClick={onOpenVaultFile}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[var(--foreground)] border border-[var(--line)] hover:border-[#73bba5]/40 text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 self-end sm:self-auto"
              title="Открыть файл Trophies.md в проводнике"
            >
              <Trophy className="w-3.5 h-3.5 text-[#73bba5]" />
              <span>Открыть Trophies.md</span>
            </button>
          )}
        </div>
      )}

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

      {/* Excluded Games Management Banner */}
      {filterMode === 'excluded' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-[var(--muted)] shadow-sm backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
              <Ban className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>Исключённые из фарма игры</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/30">
                  {excludedList.length}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                Игры из этого списка игнорируются авто-фармом. Добавление в ТОП заблокировано. Нажмите на иконку исключения, чтобы вернуть игру на полку.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Removed Games Management Banner */}
      {filterMode === 'removed' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-[var(--muted)] shadow-sm backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
              <Trash2 className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>Удалённые и скрытые игры</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/30">
                  {removedCount} {removedCount === 1 ? 'игра' : (removedCount > 1 && removedCount < 5 ? 'игры' : 'игр')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                Игры, скрытые с вашей полки. Кнопка «+ В ТОП» заблокирована. Нажмите «Восстановить», чтобы вернуть игру на полку.
              </p>
            </div>
          </div>
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
            const isRemoved = isGameRemoved(game);

            return (
              <div
                key={game.id}
                className={`card p-4 flex flex-col justify-between group relative overflow-hidden transition-all hover:border-[var(--accent)]/50 ${
                  inPriority ? 'border-[var(--accent)] shadow-[0_4px_20px_rgba(58,210,159,0.15)] ring-1 ring-[var(--accent)]/30' : ''
                } ${inExcluded || isRemoved ? 'opacity-60 border-rose-500/20' : ''}`}
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
                        {isRemoved ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <Trash2 className="w-3 h-3 text-rose-400" />
                            <span>В удалённых</span>
                          </span>
                        ) : inExcluded ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <Ban className="w-3 h-3 text-rose-400" />
                            <span>В исключениях</span>
                          </span>
                        ) : null}
                        {isDropActiveNow(game) ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[#217C5E]/20 text-[var(--accent)] border border-[var(--accent)]/30 flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3AD29F] animate-pulse" />
                            <span>Действует сейчас {game.rewards_count ? `(${game.rewards_count})` : ''}</span>
                          </span>
                        ) : game.has_drops ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-white/[0.04] text-[var(--muted)] border border-white/10 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-[var(--muted)]" />
                            <span>Drops {game.rewards_count ? `(${game.rewards_count})` : ''}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/25 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Ожидание Drops</span>
                          </span>
                        )}
                        {game.has_drops && game.is_account_connected === false && (
                          <a
                            href={game.account_link_url || "https://www.twitch.tv/settings/connections"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 hover:bg-amber-500/25 transition-colors cursor-pointer"
                            title="Аккаунт игры не привязан к Twitch! Нажмите, чтобы открыть привязку."
                            onClick={(e) => e.stopPropagation()}
                          >
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            <span>⚠️ Требуется привязка</span>
                          </a>
                        )}
                        {game.is_installed && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--muted)] border border-[var(--line)]">
                            💾 ПК
                          </span>
                        )}
                        {game.drops_end_at && (
                          <span className="text-[10px] font-medium text-[var(--muted)] bg-[var(--surface-elevated)] px-2 py-0.5 rounded-lg border border-[var(--line)] flex items-center gap-1" title={`Окончание: ${new Date(game.drops_end_at).toLocaleString('ru-RU')}`}>
                            <Calendar className="w-3 h-3 text-[var(--accent)]" />
                            <span className="tabular-nums">
                              {new Date(game.drops_end_at).getTime() < Date.now()
                                ? 'Завершено'
                                : `до ${new Date(game.drops_end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
                            </span>
                          </span>
                        )}
                        {isGameClaimed(game) && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1" title="Награды получены">
                            <Trophy className="w-3 h-3 text-emerald-400" />
                            <span>
                              Собрано {claimedTrophiesByGame.get(game.name.toLowerCase().trim())?.length
                                ? `(${claimedTrophiesByGame.get(game.name.toLowerCase().trim())!.length} шт.)`
                                : '✓'}
                            </span>
                          </span>
                        )}
                      </div>
                      {claimedTrophiesByGame.get(game.name.toLowerCase().trim()) && (
                        <div className="text-[10px] text-emerald-400/90 font-mono mt-1.5 flex items-center gap-1 truncate">
                          <span className="text-[var(--muted)]">Последний:</span>
                          <span className="truncate">{claimedTrophiesByGame.get(game.name.toLowerCase().trim())!.slice(-1)[0].drop_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center gap-2">
                  {/* Priority Button: disabled if game is excluded or removed */}
                  {inExcluded ? (
                    <button
                      disabled
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-white/[0.02] text-[var(--muted)]/50 border border-[var(--line)]/50 cursor-not-allowed opacity-50"
                      title="Игра находится в исключениях. Сначала верните её из исключений (кнопка справа), чтобы добавить в ТОП."
                    >
                      <Ban className="w-3.5 h-3.5 text-rose-400/60" />
                      <span>В исключениях (нельзя в ТОП)</span>
                    </button>
                  ) : isRemoved ? (
                    <button
                      disabled
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-white/[0.02] text-[var(--muted)]/50 border border-[var(--line)]/50 cursor-not-allowed opacity-50"
                      title="Игра находится в удалённых. Сначала нажмите «Восстановить», чтобы вернуть её на полку."
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400/60" />
                      <span>В удалённых (нельзя в ТОП)</span>
                    </button>
                  ) : (
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
                          <span>{game.has_drops ? '+ В ТОП (Фармить)' : isGameClaimed(game) ? 'Собрано (В ТОП)' : '+ В ТОП (Ждать)'}</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Exclude Button: available only if not removed */}
                  {!isRemoved && (
                    <button
                      onClick={() => inExcluded ? onRemoveFromExcluded(game.name) : onAddToExcluded(game.name)}
                      className={`flex items-center justify-center p-2 rounded-xl text-xs transition-all cursor-pointer active:scale-95 ${
                        inExcluded
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm hover:bg-rose-500/30'
                          : 'bg-white/[0.04] text-[var(--muted)] hover:text-rose-400 hover:bg-rose-500/10 border border-[var(--line)]'
                      }`}
                      title={inExcluded ? 'Убрать из исключений (вернуть возможность фарма)' : 'Исключить из фарма'}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}

                  {/* Restore / Remove Button */}
                  {isRemoved ? (
                    <button
                      onClick={() => handleRestoreGame(game.name, game.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 bg-[#217C5E]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[#217C5E]/35 hover:border-[var(--accent)]/60 shadow-sm"
                      title="Восстановить игру обратно на полку"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Восстановить</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRemoveInstalled(game.name, game.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 hover:text-rose-200 hover:border-rose-500/50 shadow-sm"
                      title="Удалить / скрыть игру из списка навсегда"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden sm:inline">Скрыть</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
