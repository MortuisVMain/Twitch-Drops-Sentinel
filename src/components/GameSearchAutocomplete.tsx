import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, X, Plus, Check, Flame, HardDrive, Sparkles, 
  Gamepad2, ShieldCheck, AlertCircle, Loader2, Ban, Trash2
} from 'lucide-react';
import { GameItem } from '../types';

interface GameSearchAutocompleteProps {
  allGames: GameItem[];
  priorityList: string[];
  excludedList?: string[];
  ignoredList?: string[];
  onAddToPriority: (gameName: string) => void;
  onRemoveFromPriority: (gameName: string) => void;
  query?: string;
  onQueryChange?: (q: string) => void;
  placeholder?: string;
  className?: string;
  onSelectGame?: (gameName: string) => void;
}

interface VerificationResult {
  verified: boolean;
  status: string;
  canonical_name: string;
  has_active_drops: boolean;
  drops_end_at?: string;
  rewards_count?: number;
  message?: string;
}

export const GameSearchAutocomplete: React.FC<GameSearchAutocompleteProps> = ({
  allGames,
  priorityList,
  excludedList = [],
  ignoredList = [],
  onAddToPriority,
  onRemoveFromPriority,
  query: externalQuery,
  onQueryChange,
  placeholder = 'Начните вводить название игры (например, Rust, Witcher, PoE, Cyberpunk)...',
  className = '',
  onSelectGame
}) => {
  const [internalQuery, setInternalQuery] = useState('');
  const query = externalQuery !== undefined ? externalQuery : internalQuery;
  const setQuery = (val: string) => {
    if (onQueryChange) onQueryChange(val);
    else setInternalQuery(val);
  };
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveVerification, setLiveVerification] = useState<{
    loading: boolean;
    data: VerificationResult | null;
  }>({ loading: false, data: null });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live GQL verification debounce
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLiveVerification({ loading: false, data: null });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLiveVerification(prev => ({ ...prev, loading: true }));
        const res = await fetch(`http://127.0.0.1:28492/api/verify-game?query=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setLiveVerification({ loading: false, data });
        } else {
          setLiveVerification({ loading: false, data: null });
        }
      } catch {
        setLiveVerification({ loading: false, data: null });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Filter games based on query
  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return allGames
        .filter((g) => priorityList.includes(g.name) || g.has_drops)
        .slice(0, 8);
    }

    return allGames
      .filter((g) => {
        const nameMatch = g.name.toLowerCase().includes(trimmed);
        const catMatch = g.category ? g.category.toLowerCase().includes(trimmed) : false;
        return nameMatch || catMatch;
      })
      .slice(0, 10);
  }, [allGames, query, priorityList]);

  // Split into active drops and regular
  const activeDropsSuggestions = useMemo(() => {
    return suggestions.filter(g => g.has_drops);
  }, [suggestions]);

  const otherSuggestions = useMemo(() => {
    return suggestions.filter(g => !g.has_drops);
  }, [suggestions]);

  const exactMatchExists = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return allGames.some((g) => g.name.toLowerCase() === trimmed);
  }, [allGames, query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIndex = suggestions.length + (!exactMatchExists && query.trim() ? 1 : 0) - 1;
      setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const maxIndex = suggestions.length + (!exactMatchExists && query.trim() ? 1 : 0) - 1;
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0 && selectedIndex < suggestions.length) {
        const selected = suggestions[selectedIndex];
        handleToggle(selected.name);
      } else if (liveVerification.data?.canonical_name) {
        handleCustomAdd(liveVerification.data.canonical_name);
      } else if (query.trim()) {
        handleCustomAdd(query.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleToggle = (gameName: string) => {
    const isExcluded = excludedList.some(e => e.toLowerCase().trim() === gameName.toLowerCase().trim());
    const isRemoved = ignoredList.some(r => r.toLowerCase().trim() === gameName.toLowerCase().trim());
    if (isExcluded || isRemoved) {
      return;
    }
    if (priorityList.includes(gameName)) {
      onRemoveFromPriority(gameName);
    } else {
      onAddToPriority(gameName);
    }
    if (onSelectGame) {
      onSelectGame(gameName);
    }
  };

  const handleCustomAdd = (gameName: string) => {
    const isExcluded = excludedList.some(e => e.toLowerCase().trim() === gameName.toLowerCase().trim());
    const isRemoved = ignoredList.some(r => r.toLowerCase().trim() === gameName.toLowerCase().trim());
    if (isExcluded || isRemoved) {
      return;
    }
    onAddToPriority(gameName);
    if (onSelectGame) {
      onSelectGame(gameName);
    }
    setQuery('');
    setIsOpen(false);
  };

  // Helper to highlight matching text
  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return text;
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase() ? (
        <span key={i} className="text-[var(--accent)] font-semibold bg-[#368873]/15 px-0.5 rounded">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center group">
        <Search className="w-4 h-4 text-[var(--muted)] group-focus-within:text-[var(--accent)] absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-[var(--surface)] hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-[var(--line)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[#73bba5]/35 rounded-xl pl-10 pr-9 py-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted)] outline-none transition-all shadow-inner backdrop-blur-xl"
        />
        {liveVerification.loading && (
          <div className="absolute right-9 top-1/2 -translate-y-1/2">
            <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
          </div>
        )}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white p-0.5 rounded-lg hover:bg-white/[0.08] transition-all cursor-pointer"
            title="Очистить"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--line)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
          {/* Header pill */}
          <div className="px-3.5 py-2 border-b border-[var(--line)] bg-white/[0.02] flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              {query.trim() ? `Поиск «${query.trim()}» с проверкой Twitch:` : 'Популярные игры и активные Drops:'}
            </span>
            <span className="text-[10px] text-[var(--muted)]/60 font-mono">Enter — выбрать · Esc — закрыть</span>
          </div>

          {/* Suggestions List */}
          <div className="max-h-[360px] overflow-y-auto p-1.5 space-y-2">
            {/* 1. Verified Active Drops Section */}
            {activeDropsSuggestions.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider flex items-center gap-1">
                  <Flame className="w-3 h-3 text-[var(--accent)]" />
                  <span>Гарантированные Drops (Идут прямо сейчас)</span>
                </div>
                <div className="space-y-1 mt-1">
                  {activeDropsSuggestions.map((game, idx) => {
                    const inPriority = priorityList.includes(game.name);
                    const inExcluded = excludedList.some(e => e.toLowerCase().trim() === game.name.toLowerCase().trim());
                    const inRemoved = ignoredList.some(r => r.toLowerCase().trim() === game.name.toLowerCase().trim() || r.toLowerCase().trim() === (game.id || '').toLowerCase().trim());
                    const isSelected = selectedIndex === idx;

                    return (
                      <div
                        key={game.id}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#368873]/15 border border-[#73bba5]/30 shadow-sm'
                            : 'hover:bg-white/[0.04] border border-transparent'
                        }`}
                        onClick={() => handleToggle(game.name)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            inPriority 
                              ? 'bg-[#368873]/20 border-[#73bba5]/40 text-[var(--accent)]' 
                              : inExcluded
                                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                : inRemoved
                                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                  : 'bg-[#368873]/10 border-[#73bba5]/30 text-[var(--accent)]'
                          }`}>
                            {inExcluded ? <Ban className="w-3.5 h-3.5" /> : inRemoved ? <Trash2 className="w-3.5 h-3.5" /> : <Flame className="w-3.5 h-3.5" />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[var(--foreground)] truncate">
                                {highlightMatch(game.name, query.trim())}
                              </span>
                              {inPriority && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/40 shrink-0">
                                  В ТОПе #{priorityList.indexOf(game.name) + 1}
                                </span>
                              )}
                              {inExcluded && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 flex items-center gap-1">
                                  <Ban className="w-2.5 h-2.5 text-rose-300" />
                                  <span>В исключениях</span>
                                </span>
                              )}
                              {inRemoved && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 flex items-center gap-1">
                                  <Trash2 className="w-2.5 h-2.5 text-amber-300" />
                                  <span>В удалённых</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] font-semibold text-[var(--accent)] flex items-center gap-0.5">
                                <ShieldCheck className="w-2.5 h-2.5" /> 100% Фарм {game.drops_end_at ? `до ${new Date(game.drops_end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : ''}
                              </span>
                              {game.rewards_count && (
                                <span className="text-[9px] text-[var(--muted)] bg-[var(--surface)] border border-[var(--line)] px-1 rounded tabular-nums">
                                  {game.rewards_count} наград
                                </span>
                              )}
                              {game.is_installed && (
                                <span className="text-[9px] text-[var(--muted)] flex items-center gap-0.5">
                                  <HardDrive className="w-2.5 h-2.5" /> На ПК
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {inExcluded ? (
                          <button
                            type="button"
                            disabled={true}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 opacity-60 cursor-not-allowed bg-rose-500/10 text-rose-300 border border-rose-500/30"
                            title="Игра находится в исключениях. Сначала уберите её из исключений на полке."
                          >
                            <Ban className="w-3 h-3 text-rose-300" />
                            <span>Исключена</span>
                          </button>
                        ) : inRemoved ? (
                          <button
                            type="button"
                            disabled={true}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 opacity-60 cursor-not-allowed bg-amber-500/10 text-amber-300 border border-amber-500/30"
                            title="Игра находится в удалённых. Сначала восстановите её на полке."
                          >
                            <Trash2 className="w-3 h-3 text-amber-300" />
                            <span>Удалена</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggle(game.name);
                            }}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ${
                              inPriority
                                ? 'bg-[#368873] text-white border border-[#73bba5] shadow-sm hover:bg-rose-500 hover:border-rose-400'
                                : 'bg-[#368873]/20 hover:bg-[#368873] hover:text-white text-[var(--accent)] border border-[#73bba5]/40 font-bold'
                            }`}
                          >
                            {inPriority ? (
                              <>
                                <Check className="w-3 h-3 text-white" />
                                <span>В ТОПе</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>+ В ТОП</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Other Games Section (Installed / Catalog without active drops) */}
            {otherSuggestions.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider flex items-center gap-1">
                  <Gamepad2 className="w-3 h-3 text-[var(--muted)]" />
                  <span>Каталог игр (Дропы не активны на Twitch)</span>
                </div>
                <div className="space-y-1 mt-1">
                  {otherSuggestions.map((game, idx) => {
                    const globalIdx = activeDropsSuggestions.length + idx;
                    const inPriority = priorityList.includes(game.name);
                    const inExcluded = excludedList.some(e => e.toLowerCase().trim() === game.name.toLowerCase().trim());
                    const inRemoved = ignoredList.some(r => r.toLowerCase().trim() === game.name.toLowerCase().trim() || r.toLowerCase().trim() === (game.id || '').toLowerCase().trim());
                    const isSelected = selectedIndex === globalIdx;

                    return (
                      <div
                        key={game.id}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--surface)] border border-[var(--line)] shadow-sm'
                            : 'hover:bg-white/[0.03] border border-transparent'
                        }`}
                        onClick={() => handleToggle(game.name)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            inPriority 
                              ? 'bg-[#368873]/20 border-[#73bba5]/40 text-[var(--accent)]' 
                              : inExcluded
                                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                : inRemoved
                                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                  : 'bg-white/[0.04] border-[var(--line)] text-[var(--muted)]'
                          }`}>
                            {inExcluded ? <Ban className="w-3.5 h-3.5" /> : inRemoved ? <Trash2 className="w-3.5 h-3.5" /> : <Gamepad2 className="w-3.5 h-3.5" />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[var(--foreground)] truncate">
                                {highlightMatch(game.name, query.trim())}
                              </span>
                              {inPriority && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/40 shrink-0">
                                  В очереди
                                </span>
                              )}
                              {inExcluded && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 flex items-center gap-1">
                                  <Ban className="w-2.5 h-2.5 text-rose-300" />
                                  <span>В исключениях</span>
                                </span>
                              )}
                              {inRemoved && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 flex items-center gap-1">
                                  <Trash2 className="w-2.5 h-2.5 text-amber-300" />
                                  <span>В удалённых</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] text-amber-400/90 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5" /> Нет раздачи на Twitch
                              </span>
                              {game.is_installed && (
                                <span className="text-[9px] text-[var(--muted)] flex items-center gap-0.5">
                                  · На ПК
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {inExcluded ? (
                          <button
                            type="button"
                            disabled={true}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 opacity-60 cursor-not-allowed bg-rose-500/10 text-rose-300 border border-rose-500/30"
                            title="Игра находится в исключениях. Сначала уберите её из исключений на полке."
                          >
                            <Ban className="w-3 h-3 text-rose-300" />
                            <span>Исключена</span>
                          </button>
                        ) : inRemoved ? (
                          <button
                            type="button"
                            disabled={true}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 opacity-60 cursor-not-allowed bg-amber-500/10 text-amber-300 border border-amber-500/30"
                            title="Игра находится в удалённых. Сначала восстановите её на полке."
                          >
                            <Trash2 className="w-3 h-3 text-amber-300" />
                            <span>Удалена</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggle(game.name);
                            }}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ${
                              inPriority
                                ? 'bg-[#368873] text-white border border-[#73bba5] shadow-sm'
                                : 'bg-white/[0.06] hover:bg-white/[0.15] text-[var(--muted)] hover:text-white border border-[var(--line)]'
                            }`}
                          >
                            {inPriority ? (
                              <>
                                <Check className="w-3 h-3 text-white" />
                                <span>В очереди</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>В очередь</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Live Verified Custom Add Card */}
            {query.trim().length > 0 && !exactMatchExists && (
              <div
                onMouseEnter={() => setSelectedIndex(suggestions.length)}
                onClick={() => {
                  const targetName = liveVerification.data?.canonical_name || query.trim();
                  handleCustomAdd(targetName);
                }}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  liveVerification.data?.has_active_drops
                    ? 'bg-[#368873]/15 border-[#73bba5]/40 text-white shadow-sm'
                    : 'bg-white/[0.02] border-dashed border-[var(--line)] text-white hover:border-[#73bba5]/40'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    liveVerification.data?.has_active_drops
                      ? 'bg-[#368873]/20 border-[#73bba5]/40 text-[var(--accent)]'
                      : 'bg-[#368873]/10 border-[#73bba5]/20 text-[var(--accent)]'
                  }`}>
                    {liveVerification.data?.has_active_drops ? (
                      <Flame className="w-4 h-4 text-[var(--accent)]" />
                    ) : (
                      <Plus className="w-4 h-4 text-[var(--accent)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-tight text-[var(--foreground)]">
                      Добавить «<span className="text-[var(--accent)]">{liveVerification.data?.canonical_name || query.trim()}</span>»
                    </p>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5 truncate">
                      {liveVerification.data?.message || 'Sentinel начнет автоматический поиск подходящих трансляций'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`shrink-0 px-3 py-1.5 rounded-lg font-semibold text-[11px] shadow-sm transition-all cursor-pointer ${
                    liveVerification.data?.has_active_drops
                      ? 'bg-[#368873] text-white hover:bg-[#2d7462]'
                      : 'bg-[#368873] hover:bg-[#2d7462] text-white border border-[#73bba5]/40'
                  }`}
                >
                  {liveVerification.data?.has_active_drops ? '⚡ Гарантированный фарм' : 'Добавить'}
                </button>
              </div>
            )}

            {suggestions.length === 0 && !query.trim() && (
              <div className="py-6 text-center text-xs text-[var(--muted)]">
                Начните вводить название игры...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
