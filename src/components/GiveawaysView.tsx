import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Gift,
  RefreshCw,
  Play,
  Square,
  ExternalLink,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  Terminal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Store
} from 'lucide-react';
import {
  StoreId,
  GiveawaysStateResponse,
  ClaimedGameItem,
  GiveawaysLogEntry
} from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface GiveawaysViewProps {
  onBackToDashboard?: () => void;
}

const STORE_CONFIG: Record<
  StoreId,
  { name: string; color: string; border: string; bg: string; text: string }
> = {
  epic: {
    name: 'Epic Games',
    color: '#ffffff',
    border: 'border-zinc-500/40',
    bg: 'bg-white/[0.06]',
    text: 'text-zinc-200',
  },
  gog: {
    name: 'GOG.com',
    color: '#a78bfa',
    border: 'border-purple-500/40',
    bg: 'bg-purple-500/[0.08]',
    text: 'text-purple-300',
  },
  steam: {
    name: 'Steam',
    color: '#60a5fa',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/[0.08]',
    text: 'text-blue-300',
  },
  fab: {
    name: 'Fab (Unreal Engine)',
    color: '#22d3ee',
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-500/[0.08]',
    text: 'text-cyan-300',
  },
  unity: {
    name: 'Unity Asset Store',
    color: '#94a3b8',
    border: 'border-slate-500/40',
    bg: 'bg-slate-500/[0.08]',
    text: 'text-slate-300',
  },
  itch: {
    name: 'Itch.io',
    color: '#fb7185',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/[0.08]',
    text: 'text-rose-300',
  },
  prime: {
    name: 'Prime Gaming',
    color: '#facc15',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/[0.08]',
    text: 'text-amber-300',
  },
};

export const GiveawaysView: React.FC<GiveawaysViewProps> = ({ onBackToDashboard }) => {
  const [data, setData] = useState<GiveawaysStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [headless, setHeadless] = useState(true);
  const [selectedStores, setSelectedStores] = useState<StoreId[]>([
    'epic',
    'gog',
    'steam',
    'fab',
    'unity',
  ]);
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(false);
  const [logs, setLogs] = useState<GiveawaysLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isTogglingScheduler, setIsTogglingScheduler] = useState(false);

  const consoleContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { playClick, playRewardChime } = useTactileAudio();

  const fetchState = async (force = false) => {
    try {
      const res = await fetch(`http://127.0.0.1:28492/api/v1/giveaways/state?force_refresh=${force ? '1' : '0'}`);
      if (res.ok) {
        const json: GiveawaysStateResponse = await res.json();
        setData(json);
        if (json.runner.state === 'running' || json.runner.state === 'aborting') {
          setIsClaiming(true);
          setIsConsoleExpanded(true);
        } else {
          setIsClaiming(false);
        }
        if (json.recentLogs && json.recentLogs.length > 0 && logs.length === 0) {
          setLogs(json.recentLogs);
        }
      }
    } catch (e) {
      console.error('Failed to fetch giveaways state:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState(true);
    const interval = setInterval(() => fetchState(false), 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect SSE Stream
  useEffect(() => {
    const sse = new EventSource('http://127.0.0.1:28492/api/v1/giveaways/stream');
    eventSourceRef.current = sse;

    sse.addEventListener('log', (event: MessageEvent) => {
      try {
        const logItem: GiveawaysLogEntry = JSON.parse(event.data);
        setLogs((prev) => [...prev.slice(-499), logItem]);
      } catch (e) {
        console.error('Error parsing SSE log:', e);
      }
    });

    sse.addEventListener('state', (event: MessageEvent) => {
      try {
        const stateEvent = JSON.parse(event.data);
        if (stateEvent.state === 'idle') {
          setIsClaiming(false);
          fetchState(true);
          playRewardChime();
        } else if (stateEvent.state === 'running') {
          setIsClaiming(true);
        }
      } catch (e) {
        console.error('Error parsing SSE state:', e);
      }
    });

    return () => {
      sse.close();
      eventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (autoScroll && isConsoleExpanded && consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isConsoleExpanded]);

  const handleToggleScheduler = async () => {
    playClick();
    setIsTogglingScheduler(true);
    try {
      const isCurrentlyDisabled = (data?.scheduler.state === 'Disabled');
      const res = await fetch('http://127.0.0.1:28492/api/v1/giveaways/toggle-scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: isCurrentlyDisabled }),
      });
      if (res.ok) {
        const json = await res.json();
        setData((prev) => prev ? { ...prev, scheduler: json.scheduler } : prev);
      }
    } catch (e) {
      console.error('Failed to toggle scheduler:', e);
    } finally {
      setIsTogglingScheduler(false);
      fetchState(true);
    }
  };

  const handleToggleStore = (store: StoreId) => {
    playClick();
    setSelectedStores((prev) =>
      prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]
    );
  };

  const handleStartClaim = async () => {
    playClick();
    setActionError(null);
    setIsConsoleExpanded(true);
    setIsClaiming(true);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/v1/giveaways/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: selectedStores, headless }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.reason || err.message || 'Ошибка запуска сбора раздач');
        setIsClaiming(false);
      }
    } catch (e: any) {
      setActionError(e.message || 'Сбой подключения к сервису');
      setIsClaiming(false);
    }
  };

  const handleAbort = async () => {
    playClick();
    try {
      await fetch('http://127.0.0.1:28492/api/v1/giveaways/abort', { method: 'POST' });
    } catch (e) {
      console.error('Failed to abort claim:', e);
    }
  };

  const filteredInventory = useMemo(() => {
    if (!data?.inventory) return [];
    return data.inventory.filter((item) => {
      const matchStore = selectedStoreFilter === 'all' || item.store === selectedStoreFilter;
      const matchSearch =
        searchQuery === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.slug.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStore && matchSearch;
    });
  }, [data?.inventory, selectedStoreFilter, searchQuery]);

  return (
    <div className="space-y-6 select-none max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Studio Hero Header Card (Apple Luna 2.0 Obsidian Glass) */}
      <div className="card p-6 md:p-8 relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--line)] text-[#73bba5] shadow-sm">
              <Gift className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  Синдикат Раздач & Халявы
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30 font-bold uppercase">
                  Free Games Claimer
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Автономный забор бесплатных игр и ассетов в Epic Games, GOG, Steam, Fab и Unity без открытого браузера
              </p>
            </div>
          </div>

          {/* Quick Actions & Runner Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Headless Mode Switch */}
            <button
              onClick={() => {
                playClick();
                setHeadless(!headless);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                headless
                  ? 'bg-white/[0.04] border-[var(--line)] text-[var(--muted)] hover:text-white'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-sm'
              }`}
              title={headless ? 'Тихий скрытый режим (фоновый сбор)' : 'Показывать окно браузера при сборе'}
            >
              {headless ? <EyeOff className="w-4 h-4 text-[#73bba5]" /> : <Eye className="w-4 h-4 text-amber-400" />}
              <span>{headless ? 'Тихий Stealth-режим' : 'Показывать браузер'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => {
                playClick();
                fetchState(true);
              }}
              className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--line)] text-[var(--foreground)] transition-all cursor-pointer shadow-sm active:scale-95"
              title="Обновить базу забранных игр"
            >
              <RefreshCw className="w-4 h-4 text-[var(--accent)]" />
            </button>

            {/* Run / Abort Button */}
            {isClaiming ? (
              <button
                onClick={handleAbort}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current animate-pulse text-rose-400" />
                <span>Остановить сбор</span>
              </button>
            ) : (
              <button
                onClick={handleStartClaim}
                disabled={selectedStores.length === 0 || data?.scheduler.state === 'Running'}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#2a6d5c] to-[#368873] hover:from-[#327e6b] hover:to-[#419d85] text-white text-xs font-bold transition-all shadow-[0_4px_16px_rgba(54,136,115,0.35)] active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-current text-[#d6f2e5]" />
                <span>Забрать всё ({selectedStores.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* 2-Column Top Bento: Store Matrix (Left) + Scheduler Telemetry (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Cell 1: Store Matrix & Selection (2 Cols) */}
        <div className="card p-6 lg:col-span-2 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Store className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-[var(--foreground)]">Платформы & Магазины</h3>
            </div>
            <span className="text-[11px] text-[var(--muted)]">
              Выбрано: {selectedStores.length} из {Object.keys(STORE_CONFIG).length - 1}
            </span>
          </div>

          {/* Grid of Stores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(['epic', 'gog', 'steam', 'fab', 'unity'] as StoreId[]).map((storeId) => {
              const cfg = STORE_CONFIG[storeId];
              const isSelected = selectedStores.includes(storeId);
              const storeMeta = data?.stores[storeId];
              const claimedCount = storeMeta?.claimedCount ?? 0;

              return (
                <div
                  key={storeId}
                  onClick={() => handleToggleStore(storeId)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[95px] ${
                    isSelected
                      ? 'bg-[#368873]/10 border-[#73bba5] shadow-[0_2px_12px_rgba(115,187,165,0.15)]'
                      : 'bg-[var(--surface-elevated)] border-[var(--line)] opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${cfg.text}`}>{cfg.name}</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-[#368873] border-[#73bba5] text-white'
                          : 'border-[var(--line)] bg-transparent'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </span>
                  </div>

                  <div className="pt-2 flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-bold text-[var(--foreground)] tabular-nums">
                        {claimedCount}
                      </div>
                      <div className="text-[10px] text-[var(--muted)]">в коллекции</div>
                    </div>
                    {storeMeta?.lastClaimedAt && (
                      <span className="text-[9px] text-[var(--muted)] tabular-nums">
                        {new Date(storeMeta.lastClaimedAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cell 2: Task Scheduler Telemetry (1 Col) */}
        <div className="card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-[var(--foreground)]">Планировщик Windows</h3>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                data?.scheduler.state === 'Ready'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : data?.scheduler.state === 'Running'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                  : data?.scheduler.state === 'Disabled'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
              }`}
            >
              {data?.scheduler.state === 'Ready'
                ? '● Активен'
                : data?.scheduler.state === 'Running'
                ? '● Работает'
                : data?.scheduler.state === 'Disabled'
                ? '● Отключен'
                : '● Настроен'}
            </span>
          </div>

          <div className="space-y-3 py-1">
            <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] space-y-1">
              <div className="text-[11px] text-[var(--muted)] flex items-center justify-between">
                <span>Задание:</span>
                <span className="font-mono text-xs text-[var(--foreground)] font-semibold">
                  FreeGamesClaimerStudio
                </span>
              </div>
              <div className="text-[11px] text-[var(--muted)] flex items-center justify-between">
                <span>График:</span>
                <span className="text-xs text-[var(--accent)] font-semibold">
                  Вт, Пт, Вс в 13:30
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--muted)] px-1">
              <span>Всего забранных игр:</span>
              <span className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                {data?.totalClaimed ?? 0}
              </span>
            </div>

            {data?.scheduler.exists && (
              <button
                type="button"
                onClick={handleToggleScheduler}
                disabled={isTogglingScheduler || data?.scheduler.state === 'Running'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 ${
                  data?.scheduler.state === 'Disabled'
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300'
                }`}
                title={
                  data?.scheduler.state === 'Disabled'
                    ? 'Включить автоматический сбор по расписанию'
                    : 'Отключить автоматический сбор по расписанию'
                }
              >
                {data?.scheduler.state === 'Disabled' ? (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                    <span>Включить Синдикат Раздач</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
                    <span>Отключить Синдикат Раздач</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="text-[11px] text-[var(--muted)] flex items-center gap-1.5 pt-1">
            <ShieldCheck className="w-4 h-4 text-[#73bba5] shrink-0" />
            <span>Сессии в полной безопасности (хранятся локально)</span>
          </div>
        </div>
      </div>

      {/* Cell 3: Live Execution Console (Collapsible) */}
      <div className="card overflow-hidden transition-all">
        <button
          onClick={() => {
            playClick();
            setIsConsoleExpanded(!isConsoleExpanded);
          }}
          className="w-full p-4.5 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer text-left border-b border-[var(--line)]"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--foreground)]">
                  Живая консоль Patchright & Сбора
                </span>
                {isClaiming && (
                  <span className="px-2 py-0.2 rounded-full text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 animate-pulse">
                    RUNNING
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[var(--muted)]">
                {logs.length} строк вывода &bull; Лог-файл: {data?.lastLogFile || 'Ожидание запуска'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{isConsoleExpanded ? 'Свернуть' : 'Развернуть'}</span>
            {isConsoleExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isConsoleExpanded && (
          <div
            ref={consoleContainerRef}
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
              if (autoScroll !== isAtBottom) {
                setAutoScroll(isAtBottom);
              }
            }}
            className="p-4 bg-[#0d1211] font-mono text-xs text-zinc-300 space-y-1 max-h-80 overflow-y-auto select-text scrollbar-thin"
          >
            {logs.length === 0 ? (
              <div className="text-zinc-500 py-6 text-center italic">
                Консоль чиста. Нажмите «Забрать всё», чтобы увидеть живой лог сбора в реальном времени.
              </div>
            ) : (
              logs.map((entry, idx) => (
                <div key={idx} className="leading-relaxed hover:bg-white/[0.03] px-1 rounded flex gap-2">
                  <span className="text-zinc-600 select-none tabular-nums shrink-0">
                    {new Date(entry.ts).toLocaleTimeString('ru-RU')}
                  </span>
                  <span
                    className={
                      entry.line.includes('[WARN]')
                        ? 'text-amber-400'
                        : entry.line.includes('[ERROR]')
                        ? 'text-rose-400 font-bold'
                        : entry.line.includes('Claiming')
                        ? 'text-[#73bba5] font-semibold'
                        : entry.line.includes('Complete')
                        ? 'text-emerald-400 font-bold'
                        : 'text-zinc-300'
                    }
                  >
                    {entry.line}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Cell 4: Claimed Inventory Gallery */}
      <div className="card p-6 md:p-8 space-y-6">
        {/* Controls: Search + Filter Pills */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">Коллекция забранных игр</h3>
              <p className="text-xs text-[var(--muted)]">
                Всего найдено: {filteredInventory.length} тайтлов
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Поиск по названию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[#73bba5] transition-all"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
              {(['all', 'epic', 'gog', 'steam', 'fab', 'unity'] as const).map((store) => (
                <button
                  key={store}
                  onClick={() => {
                    playClick();
                    setSelectedStoreFilter(store);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedStoreFilter === store
                      ? 'bg-[#368873] text-white shadow-sm'
                      : 'text-[var(--muted)] hover:text-white'
                  }`}
                >
                  {store === 'all' ? 'Все' : STORE_CONFIG[store]?.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid of Claimed Games */}
        {filteredInventory.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--muted)] border border-dashed border-[var(--line)] rounded-2xl">
            По вашему запросу ничего не найдено
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredInventory.map((item) => {
              const cfg = STORE_CONFIG[item.store] || STORE_CONFIG.epic;
              const formattedDate = new Date(item.claimedAt).toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--line)] hover:border-[#73bba5]/50 transition-all flex flex-col justify-between group shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${cfg.bg} ${cfg.border} ${cfg.text}`}
                      >
                        {cfg.name}
                      </span>
                      <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--muted)]" />
                        <span>{formattedDate}</span>
                      </span>
                    </div>

                    <h4 className="text-xs md:text-sm font-bold text-[var(--foreground)] line-clamp-2 leading-snug group-hover:text-[#73bba5] transition-colors">
                      {item.title}
                    </h4>
                  </div>

                  <div className="pt-3.5 mt-2 border-t border-[var(--line)] flex items-center justify-between text-[11px]">
                    <span className="text-[var(--muted)] text-[10px]">
                      Аккаунт: <span className="font-semibold text-zinc-300">{item.account}</span>
                    </span>

                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[var(--accent)] hover:underline font-semibold"
                        title="Открыть страницу игры в магазине"
                      >
                        <span>В магазин</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="text-center pt-2 pb-2 text-[11px] text-[var(--muted)] space-y-1">
        <div>Twitch Drops Sentinel &bull; Free Games Claimer Integration</div>
        <div>Crafted with precision by Mortuis_V & Mortuis_V_Studio &bull; 2026</div>
      </div>
    </div>
  );
};
