import { Ban, ChevronRight, ClipboardCopy, Clock, FileText, HardDrive, Play, Plus, SkipForward, Star, Zap } from 'lucide-react';
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { 
  KeyRound, ShieldAlert, Copy, Check, ExternalLink, RefreshCw, 
  Search, X, RotateCcw, Flame, CheckCircle2, Tv, AlertTriangle,
  ChevronUp, ChevronDown
} from 'lucide-react';
import { ActiveDrop, HardwareGuard, SentinelStats, SentinelSettings, SentinelLogEntry, GameItem, TrophyItem, ConnectionPhase } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { useModalFocus } from '../hooks/useModalFocus';
import { CartridgeCover } from './GameShelf';
import { resolveGameBoxArt, registerDynamicBoxArt, smartGameMatch, isBlankCover, isSteamArt, retryCover } from '../utils/gameBoxArts';
import { computeIdleInfo, formatTimeLeft, isOffQueueCandidate, pluralRu, shortGameName } from '../utils/idleInfo';
import { deadlineFacts } from '../utils/campaignFacts';
import { collapseLogs, CONSOLE_COLLAPSED_KEY, filterLogs, hostCanOpenLogFile, openLogFile, resolveConsoleCollapsed, withoutLevelPrefix } from '../utils/consoleLog';
import { activateUrl, copyText } from '../utils/loginCode';
import { campaignLabel, getCampaignState, parseQueueFilter, queueCounts, queueView, type CampaignState, type QueueFilter } from '../utils/campaignState';

// Narrowest compact off-queue card (a 36 px cover, a name, a chip); the columns that fit this are the columns shown.
const OVERRIDE_CARD_MIN_REM = 12.5;

export interface LiveDashboardProps {
  activeDrop: ActiveDrop | null;
  connected?: boolean;
  connectionPhase?: ConnectionPhase;
  onBanStreamer?: (channelName: string, isSnooze2h: boolean) => void;
  availableChannels?: Array<{ name: string; display_name?: string; viewers?: number; current?: boolean }>;
  hardware: HardwareGuard;
  stats: SentinelStats;
  settings: SentinelSettings;
  statusText?: string;
  watchingChannel?: string | null;
  recentLogs?: SentinelLogEntry[];
  /** The older part of the journal could not be fetched: the console shows only what /api/state carries. */
  logHistoryFailed?: boolean;
  watchdogStatus?: string | null;
  oauthCode?: string | null;
  oauthUri?: string | null;
  allGames?: GameItem[];
  trophies?: TrophyItem[];
  onAddToPriority?: (gameName: string) => void;
  onRemoveFromPriority?: (gameName: string) => void;
  onToggleAutoShutdown: () => void;
  onSelectShutdownMode: (mode: 'shutdown' | 'sleep' | 'lock') => void;
  onManualRefresh: () => void;
  onGoToShelf?: () => void;
  onGoToSettings?: () => void;
  onClaimNow?: (dropId: string) => void;
  onToggleDaemon?: () => void;
  onSwitchStreamer?: (skipGame?: boolean) => void;
  onReorderPriority?: (gameName: string, direction: 'up' | 'down') => void;
  onUpdateSettings?: (newSettings: Partial<SentinelSettings>) => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  forcedGame?: string | null;
  onForceFarm?: (gameName: string) => void;
  onCancelForceFarm?: () => void;
}

// Resilient safe helpers to prevent undefined dereferences
const getDropGame = (drop: ActiveDrop | null | undefined): string => {
  if (!drop) return '';
  return drop.game || (drop as any).game_name || '';
};

const getDropName = (drop: ActiveDrop | null | undefined): string => {
  if (!drop) return '';
  return drop.name || (drop as any).drop_name || '';
};

const getChannelName = (drop: ActiveDrop | null | undefined, watchingChannel?: string | null): string => {
  if (watchingChannel) return watchingChannel;
  if (!drop) return '';
  return drop.channel_name || (drop as any).current_channel || '';
};

const safeLower = (val: any): string => {
  return typeof val === 'string' ? val.toLowerCase().trim() : '';
};

const QUEUE_FILTER_OPTIONS: Array<{ value: QueueFilter; label: string; hint: string }> = [
  { value: 'all', label: 'Все', hint: 'Вся очередь, включая завершённые игры. Порядок очереди не меняется.' },
  { value: 'available', label: 'Доступны', hint: 'Игры с идущей кампанией, которую можно фармить. Порядок очереди не меняется.' },
  { value: 'action', label: 'Требуют действия', hint: 'Кампания есть, но нужно привязать аккаунт игры. Порядок очереди не меняется.' },
  { value: 'none', label: 'Без кампаний', hint: 'Игры очереди, у которых сейчас нет кампании. Порядок очереди не меняется.' },
];

const QUEUE_FILTER_EMPTY: Record<QueueFilter, string> = {
  all: 'Очередь кампаний пуста',
  available: 'Нет игр с доступной кампанией',
  action: 'Нет игр, которым нужна привязка',
  none: 'Нет игр без кампании',
};

export const LiveDashboard: React.FC<LiveDashboardProps> = ({
  activeDrop,
  connected = false,
  connectionPhase = connected ? 'connected' : 'unavailable',
  onBanStreamer,
  availableChannels,
  hardware,
  stats,
  settings,
  statusText,
  watchingChannel,
  recentLogs = [],
  logHistoryFailed = false,
  watchdogStatus,
  oauthCode,
  oauthUri,
  allGames = [],
  trophies = [],
  onAddToPriority,
  onRemoveFromPriority,
  onSwitchStreamer,
  onReorderPriority,
  onUpdateSettings,
  forcedGame,
  onForceFarm,
  onCancelForceFarm,
}) => {
  const { playClick } = useTactileAudio();
  // No answer from the service yet: empty lists and zero counts below are not data, so they are not shown as facts
  const starting = connectionPhase === 'starting';
  const [logFilter, setLogFilter] = useState<'ALL' | 'WATCH' | 'CLAIM' | 'CORE'>('ALL');
  const [expandedSync, setExpandedSync] = useState<string[]>([]);
  const [codeCopy, setCodeCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const handleCopyCode = async () => {
    if (!oauthCode) return;
    playClick();
    const ok = await copyText(oauthCode);
    setCodeCopy(ok ? 'copied' : 'failed');
    setTimeout(() => setCodeCopy('idle'), ok ? 2000 : 5000);
  };
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const handleIgnoreDetectedProcess = async (procName: string) => {
    playClick();
    try {
      await fetch('http://127.0.0.1:28492/api/hardware/ignore-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process: procName }),
      });
    } catch (err) {
      console.error(`LiveDashboard: не удалось игнорировать процесс ${procName}`, err);
    }
  };
  const [shelfFilter, setShelfFilter] = useState('ALL');
  const [showFullCatalogModal, setShowFullCatalogModal] = useState(false);
  const catalogDialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(showFullCatalogModal, catalogDialogRef, () => setShowFullCatalogModal(false), 'input');
  const [catalogModalSearch, setCatalogModalSearch] = useState('');
  const [catalogModalTab, setCatalogModalTab] = useState<'ALL' | 'TOP' | 'INSTALLED'>('ALL');
  const safeAllGames = useMemo(() => (Array.isArray(allGames) ? allGames : []), [allGames]);
  const safeRecentLogs = useMemo(() => (Array.isArray(recentLogs) ? recentLogs : []), [recentLogs]);
  const safeAvailableChannels = useMemo(() => (Array.isArray(availableChannels) ? availableChannels : []), [availableChannels]);
  const activeTwitchDropsGames = useMemo(() => safeAllGames.filter(g => g.has_drops && g.is_active_now), [safeAllGames]);
  const filterQueuedItem = (item: any) => {
    if (shelfFilter === 'ALL') return true;
    return true;
  };

  const [overrideFilter, setOverrideFilter] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const consoleViewportRef = useRef<HTMLDivElement>(null);
  const isDashboardScrollBottomRef = useRef<boolean>(true);
  const searchTimeoutRef = useRef<any>(null);

  const handleDashboardConsoleScroll = () => {
    if (!consoleViewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = consoleViewportRef.current;
    isDashboardScrollBottomRef.current = scrollHeight - scrollTop - clientHeight <= 45;
  };

  // Auto-scroll terminal on new logs inside console container only if user is at bottom (before paint: no flash of the oldest line)
  useLayoutEffect(() => {
    if (consoleViewportRef.current && isDashboardScrollBottomRef.current) {
      consoleViewportRef.current.scrollTop = consoleViewportRef.current.scrollHeight;
    }
  }, [safeRecentLogs, logFilter]);

  // Copy logs handler
  const handleCopyLogs = () => {
    playClick();
    const text = safeRecentLogs.map((l) => {
      const level = l.level || l.category || 'SYS';
      return `[${l.time || l.timestamp || ''}] [${level}] ${withoutLevelPrefix(l.message, String(level).toUpperCase())}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // Search autocomplete with live GQL backend query
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const clean = safeLower(q);
    const local = allGames
      .filter((g) => safeLower(g.name).includes(clean))
      .slice(0, 5)
      .map((g) => ({
        name: g.name,
        canonical_name: g.name,
        box_art: resolveGameBoxArt(g.name, g.box_art),
        has_active_drops: g.has_drops,
      }));
    setSearchResults(local);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`http://127.0.0.1:28492/api/search-games?q=${encodeURIComponent(q)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            setSearchResults(data);
            data.forEach((item: any) => {
              if (item.canonical_name && item.box_art) {
                registerDynamicBoxArt(item.canonical_name, item.box_art);
              }
            });
          }
        }
      } catch {
        // Offline / standalone
      }
    }, 250);
  };

  // Safe active drop extractions
  const activeGame = getDropGame(activeDrop);
  const activeTitle = getDropName(activeDrop);
  const activeStreamer = getChannelName(activeDrop, watchingChannel);

  const activeGameArt = useMemo(() => {
    if (!activeGame) return undefined;
    const match = safeAllGames.find((g) => safeLower(g.name) === safeLower(activeGame))
      || safeAllGames.find((g) => smartGameMatch(g.name, activeGame));
    return resolveGameBoxArt(activeGame, match?.box_art);
  }, [activeGame, safeAllGames]);

  // Progress metrics
  const progressPct = Math.min(100, Math.max(0, activeDrop?.progress_percent || 0));
  const currentMinutes = activeDrop?.current_minutes || 0;
  const requiredMinutes = activeDrop?.required_minutes || 240;
  const remainingMinutes = Math.max(0, requiredMinutes - currentMinutes);
  const etaMinutes = remainingMinutes > 0 ? remainingMinutes : 0;

  // 98px Radial gauge math (radius 42 => circumference ~263.89)
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  // COMPACT QUEUED CAMPAIGNS (Shows only user's priority games or active campaigns, NOT all 138 installed games!)
  const priorityList = settings.priority_games || [];
  const topPriorityCount = activeTwitchDropsGames.filter((game) =>
    priorityList.some((name) => safeLower(name) === safeLower(game.name))
  ).length;
  const installedActiveCount = activeTwitchDropsGames.filter((game) => game.is_installed).length;
  const forceCandidates = useMemo(() => safeAllGames.filter((g) => g.has_drops || g.is_installed), [safeAllGames]);

  const modalFilteredGames = useMemo(() => forceCandidates.filter((game) => {
    if (catalogModalSearch.trim() && !safeLower(game.name).includes(safeLower(catalogModalSearch))) return false;
    if (catalogModalTab === 'TOP' && !priorityList.some((name) => safeLower(name) === safeLower(game.name))) return false;
    if (catalogModalTab === 'INSTALLED' && !game.is_installed) return false;
    return true;
  }), [forceCandidates, catalogModalSearch, catalogModalTab, priorityList]);

  const queueCampaigns = useMemo(() => {
    const list: Array<{
      name: string;
      drop: string;
      state: CampaignState;
      art?: string;
      pct: number;
      cur?: number;
      req?: number;
      has_drops: boolean;
      priorityIndex: number;
    }> = [];

    // 1. If priority list exists, resolve each priority game
    if (priorityList.length > 0) {
      priorityList.forEach((gameName, idx) => {
        // Exclude currently farming game from lower queue so it is not duplicated
        if (activeGame && safeLower(gameName) === safeLower(activeGame)) return;

        const match = allGames.find((g) => safeLower(g.name) === safeLower(gameName) || smartGameMatch(g.name, gameName));
        const art = resolveGameBoxArt(gameName, match?.box_art);
const state = getCampaignState(match, trophies, smartGameMatch);
        // platform / disk goes to the row tooltip, the visible caption is the campaign state
        const dropTitle = match?.category || (match?.is_installed ? 'Установлена' : 'В очереди');
        const pct = state.kind === 'done' ? 100 : (match?.progress_percent || 0);

        list.push({
          name: gameName,
          drop: dropTitle,
          state,
          art: art,
          pct: pct,
          has_drops: match?.has_drops ?? false,
          priorityIndex: idx,
        });
      });
    }

    // 2. If priority list is empty or short, supplement with other active Twitch drops games
    if (list.length < 5) {
      const activeTwitchGames = allGames.filter((g) => {
        if (activeGame && safeLower(g.name) === safeLower(activeGame)) return false;
        if (priorityList.some((p) => safeLower(p) === safeLower(g.name))) return false;
        return g.has_drops;
      });

      for (const g of activeTwitchGames) {
        if (list.length >= 5) break;
        list.push({
          name: g.name,
          drop: g.category || 'Дроп доступен',
          state: getCampaignState(g, trophies, smartGameMatch),
          art: resolveGameBoxArt(g.name, g.box_art),
          pct: g.progress_percent || 0,
          has_drops: true,
          priorityIndex: -1,
        });
      }
    }

    return list;
  }, [priorityList, allGames, activeGame, trophies]);

  const sortedQueuedCampaigns = queueCampaigns;
  const allQueuedCampaignsLabel = `Все (${sortedQueuedCampaigns.length})`;

  // Campaigns closing within 24h, by game name. The banner is only for games in the user's queue;
  // the rest get a small "closing in ..." tag on their card in the off-queue block.
  const endingSoonByGame = useMemo(() => {
    const map = new Map<string, { hours: number; timeLeft: string }>();
    for (const g of allGames) {
      if (!g.has_drops || !g.drops_end_at) continue;
      const diffHours = (new Date(g.drops_end_at).getTime() - Date.now()) / (1000 * 3600);
      if (diffHours > 0 && diffHours <= 24) {
        const h = Math.floor(diffHours);
        const m = Math.floor((diffHours - h) * 60);
        map.set(safeLower(g.name), { hours: diffHours, timeLeft: `${h}ч ${m}м` });
      }
    }
    return map;
  }, [allGames]);

  const [dismissedRadar, setDismissedRadar] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('sentinel_radar_dismissed');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('LiveDashboard: не удалось прочитать скрытые баннеры', err);
      return [];
    }
  });
  const dismissRadar = (key: string) => {
    playClick();
    const next = [...dismissedRadar.filter((k) => k !== key), key].slice(-50);
    setDismissedRadar(next);
    try {
      localStorage.setItem('sentinel_radar_dismissed', JSON.stringify(next));
    } catch (err) {
      console.warn('LiveDashboard: не удалось сохранить скрытый баннер', err);
    }
  };
  const RADAR_QUEUE_DEPTH = 10;

const endingSoonGame = useMemo(() => {
    // Only for a campaign that is closing, still has drops to claim, has a linked account and
    // belongs to the first games of the queue or already has progress
    let best: { name: string; timeLeft: string; hours: number; key: string } | null = null;
    for (let idx = 0; idx < priorityList.length; idx++) {
      const queued = priorityList[idx];
      const match = allGames.find((g) => safeLower(g.name) === safeLower(queued) || smartGameMatch(g.name, queued));
      if (!match) continue;
      const state = getCampaignState(match, trophies, smartGameMatch);
      if (state.kind !== 'running') continue;
      const hasProgress = (match.progress_percent ?? 0) > 0 || (match.claimed_drops ?? 0) > 0;
      if (idx >= RADAR_QUEUE_DEPTH && !hasProgress) continue;
      const info = endingSoonByGame.get(safeLower(match.name));
      if (info && (!best || info.hours < best.hours)) best = { name: match.name, ...info, key: `${match.name}|${match.drops_end_at}` };
    }
    return best;
  }, [priorityList, allGames, endingSoonByGame, trophies]);

  // Manual focus candidates: closing soon first, then live campaigns, finished, the rest
  const overrideAll = useMemo(() => {
    // off-queue only: not in the queue (same matcher as everywhere) and not already fully received
    let list = allGames.filter((g) => (g.has_drops || g.is_installed) && isOffQueueCandidate(g, priorityList, trophies, smartGameMatch));
    if (overrideFilter.trim()) {
      const q = safeLower(overrideFilter);
      list = list.filter((g) => safeLower(g.name).includes(q));
    }
    const rank = (g: GameItem): number => {
      if (endingSoonByGame.has(safeLower(g.name))) return 0;
      const finished = Boolean(g.is_finished || (g.total_drops && g.claimed_drops && g.claimed_drops >= g.total_drops) || (g.progress_percent !== undefined && g.progress_percent >= 100));
      if (g.has_drops && !finished) return 1;
      if (g.has_drops) return 2;
      return 3;
    };
    return [...list].sort((x, y) => rank(x) - rank(y));
  }, [allGames, overrideFilter, endingSoonByGame, priorityList, trophies]);
  // Idle hero: why nothing is being farmed right now, from data already in /api/state
  const isIdle = !(activeDrop && activeGame);

  // Console: one line while idle, full while farming; an explicit user choice ('1'/'0') always wins
  const [consoleChoice, setConsoleChoice] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CONSOLE_COLLAPSED_KEY);
    } catch (err) {
      console.warn('LiveDashboard: localStorage недоступен', err);
      return null;
    }
  });
  const consoleCollapsed = resolveConsoleCollapsed(consoleChoice, isIdle);
  const toggleConsole = () => {
    playClick();
    const next = consoleCollapsed ? '0' : '1';
    setConsoleChoice(next);
    try {
      localStorage.setItem(CONSOLE_COLLAPSED_KEY, next);
    } catch (err) {
      console.warn('LiveDashboard: не удалось сохранить состояние консоли', err);
    }
  };

  // The viewport is unmounted while collapsed: on expand, jump to the newest line again
  useEffect(() => {
    if (!consoleCollapsed && consoleViewportRef.current) consoleViewportRef.current.scrollTop = consoleViewportRef.current.scrollHeight;
  }, [consoleCollapsed]);

  // Farming: compact cards in two rows, as many columns as the panel's real width holds (measured, so the cards span the panel).
  // Idle: poster cards, a fixed number.
  const overrideGridRef = useRef<HTMLDivElement>(null);
  const [overrideCols, setOverrideCols] = useState(3);
  useLayoutEffect(() => {
    const grid = overrideGridRef.current;
    if (!grid) return;
    const measure = () => {
      const style = getComputedStyle(grid);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = parseFloat(style.columnGap) || 0;
      const width = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setOverrideCols(Math.max(1, Math.floor((width + gap) / (OVERRIDE_CARD_MIN_REM * rem + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  // The height freed by a collapsed console goes to the off-queue block
  const OVERRIDE_VISIBLE = consoleCollapsed ? 12 : overrideCols * 2;
  const overrideGames = overrideAll.slice(0, OVERRIDE_VISIBLE);

  // Filtered console logs
const filteredLogs = useMemo(() => {
    // display only: progress spam and repeated lines are folded, "Copy" still takes the full journal
    return collapseLogs(filterLogs(safeRecentLogs, logFilter), { expandSync: logFilter === 'CORE' });
  }, [safeRecentLogs, logFilter]);
  // the collapsed line has no filter chips, so it always shows the newest event of the ALL view
  const lastEvent = useMemo(() => {
    const all = collapseLogs(filterLogs(safeRecentLogs, 'ALL').slice(-200));
    return all[all.length - 1];
  }, [safeRecentLogs]);

  const idleInfo = useMemo(
    () =>
      computeIdleInfo({
        priorityList,
        allGames,
        trophies,
        strictMode: settings.priority_mode === 0,
        now: Date.now(),
        smartMatch: smartGameMatch,
      }),
    [priorityList, allGames, trophies, settings.priority_mode]
  );

  const scrollToOverride = () => {
    playClick();
    document.getElementById('overrideSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Queue rows: finished games (100%) go to a collapsed group at the bottom, priority numbers are kept
  const [showFinishedQueue, setShowFinishedQueue] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sentinel_queue_finished_open') === '1';
    } catch (err) {
      console.warn('LiveDashboard: localStorage недоступен', err);
      return false;
    }
  });
  const toggleFinishedGroup = () => {
    playClick();
    const next = !showFinishedQueue;
    setShowFinishedQueue(next);
    try {
      localStorage.setItem('sentinel_queue_finished_open', next ? '1' : '0');
    } catch (err) {
      console.warn('LiveDashboard: не удалось сохранить состояние группы', err);
    }
  };
  const [queueFilter, setQueueFilter] = useState<QueueFilter>(() => {
    try {
      return parseQueueFilter(localStorage.getItem('sentinel_queue_filter'));
    } catch (err) {
      console.warn('LiveDashboard: localStorage недоступен', err);
      return 'all';
    }
  });
  const changeQueueFilter = (next: QueueFilter) => {
    playClick();
    setQueueFilter(next);
    try {
      localStorage.setItem('sentinel_queue_filter', next);
    } catch (err) {
      console.warn('LiveDashboard: не удалось сохранить фильтр очереди', err);
    }
  };
  const queueShown = queueView(queueCampaigns, queueFilter);
  const activeQueue = queueShown.visible.filter((item) => item.state.kind !== 'done');
  const finishedQueue = queueShown.visible.filter((item) => item.state.kind === 'done');
  // the game that is farming right now is not a row: it is counted as available
  const queueStats = queueCounts(queueCampaigns, Boolean(activeGame));

  const renderQueueRow = (item: (typeof queueCampaigns)[number]) => (
                <div
                  key={item.name}
                  className="queue-row"
                  onClick={() => {
                    playClick();
                    onForceFarm?.(item.name);
                  }}
                  title={`Кликните для переключения фарма на ${item.name} · ${item.drop}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                    <img
                      className="box-thumb"
                      src={item.art}
                      alt={item.name}
                      style={{ width: '34px', height: '34px', borderRadius: '6px' }}
                      crossOrigin={isSteamArt(item.art) ? 'anonymous' : undefined}
                      onLoad={(e) => { const img = e.currentTarget; if (isBlankCover(img) && !retryCover(img, item.name)) img.style.display = 'none'; }}
                      onError={(e) => { const img = e.currentTarget; if (!retryCover(img, item.name)) img.style.display = 'none'; }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
                        <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                        {item.priorityIndex >= 0 && (
                          <span
                            className="tabular"
                            role="img"
                            title={`Место в очереди: ${item.priorityIndex + 1}`}
                            aria-label={`Место в очереди: ${item.priorityIndex + 1}`}
                            style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--fs-xs)', fontWeight: 700, lineHeight: 1.2, padding: '0 5px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-well)', color: 'var(--text-secondary)' }}
                          >
                            #{item.priorityIndex + 1}
                          </span>
                        )}
                      </div>
                      <div title={item.state.kind === 'none' ? item.state.reason : undefined} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {item.state.kind === 'link' ? (
                          <button
                            className="queue-link-caption"
                            onClick={(e) => { e.stopPropagation(); playClick(); if (item.state.linkUrl) window.open(item.state.linkUrl, '_blank'); }}
                            disabled={!item.state.linkUrl}
                            title={item.state.linkUrl ? `Открыть страницу привязки: ${item.state.linkUrl}` : 'Ссылка на привязку не передана'}
                          >
                            {campaignLabel(item.state)} <ExternalLink className="ui-icon" aria-hidden="true" focusable="false" />
                          </button>
                        ) : (
                          campaignLabel(item.state)
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    <span className="tabular" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: item.state.kind !== 'none' && item.pct > 0 ? 'var(--led-mint)' : 'var(--text-muted)' }}>
                      {item.state.kind === 'none' ? '—' : `${item.pct}%`}
                    </span>

                    {item.priorityIndex >= 0 && onReorderPriority && (
                      <div className="reorder-rocker">
                        <button
                          onClick={() => {
                            playClick();
                            onReorderPriority(item.name, 'up');
                          }}
                          disabled={item.priorityIndex === 0}
                          style={{ opacity: item.priorityIndex === 0 ? 0.2 : 1 }}
                          title="Поднять в очереди"
                        >
                          <ChevronUp className="ui-icon" aria-hidden="true" focusable="false" />
                        </button>
                        <button
                          onClick={() => {
                            playClick();
                            onReorderPriority(item.name, 'down');
                          }}
                          disabled={item.priorityIndex === priorityList.length - 1}
                          style={{ opacity: item.priorityIndex === priorityList.length - 1 ? 0.2 : 1 }}
                          title="Опустить в очереди"
                        >
                          <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
  );

  const syncKey = (block: SentinelLogEntry[]) => `${block[0].time || block[0].timestamp}|${block[0].message}`;
  const toggleSync = (block: SentinelLogEntry[]) => {
    const key = syncKey(block);
    setExpandedSync((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev.slice(-20), key]));
  };

  return (
    <div id="view-dashboard" className="view-tab active">
      {starting && (
        <div className="ending-soon-radar mb-2.5" role="status" style={{ borderColor: 'var(--border-main)', justifyContent: 'flex-start', color: 'var(--text-secondary)' }}>
          Запускаем службу Sentinel…
        </div>
      )}
      {!connected && !starting && (
        <div className="ending-soon-radar mb-2.5 border-rose-500/40" role="status">
          <strong style={{ color: 'var(--led-rose)' }}>Локальный сервис Sentinel недоступен.</strong>
          <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
            Данные и действия обновятся после подключения.
          </span>
        </div>
      )}
      {/* 1. HARDWARE GUARD AUTOPAUSE BANNER */}
      {hardware.detected_game && (
        <div className="ending-soon-radar mb-2.5 border-amber-500/40 animate-in fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-xs)' }}>
            <span className="led-dot amber" />
            <strong className="tabular" style={{ color: 'var(--led-amber)' }}>ИГРОВАЯ ПАУЗА:</strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              Обнаружен активный игровой процесс <strong style={{ color: 'var(--text-primary)' }}>{hardware.detected_game}</strong>. Фарм приостановлен для сбережения GPU.
            </span>
          </div>
          <button
            className="tactile-btn active-amber"
            style={{ minHeight: '24px', fontSize: 'var(--fs-xs)' }}
            onClick={() => handleIgnoreDetectedProcess(hardware.detected_game!)}
            title="Это не игра (Игнорировать)"
          >
            <Zap className="ui-icon" aria-hidden="true" focusable="false" /> Это не игра (Игнорировать)
          </button>
        </div>
      )}

      {/* 2. OAUTH DEVICE CODE BANNER */}
      {oauthCode && (
        <div className="ending-soon-radar mb-2.5 border-amber-500/40 animate-in fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-xs)' }}>
            <KeyRound className="w-4 h-4 text-amber-400 animate-pulse" aria-hidden="true" focusable="false" />
            <strong className="tabular" style={{ color: 'var(--led-amber)' }}>ТРЕБУЕТСЯ АВТОРИЗАЦИЯ TWITCH:</strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              Код привязки устройства: <strong className="tabular" style={{ color: '#fff', fontSize: 'var(--fs-sm)', userSelect: 'all', cursor: 'text' }}>{oauthCode}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {codeCopy === 'failed' && (
              <span role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-rose)' }}>Не удалось скопировать, выделите код вручную</span>
            )}
            <button
              className={`tactile-btn ${codeCopy === 'copied' ? 'active-mint' : ''}`}
              style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={handleCopyCode}
              title="Скопировать код в буфер обмена"
            >
              {codeCopy === 'copied' ? <Check className="w-3 h-3" aria-hidden="true" focusable="false" /> : <Copy className="w-3 h-3" aria-hidden="true" focusable="false" />}
              <span>{codeCopy === 'copied' ? 'Скопировано' : 'Копировать'}</span>
            </button>
            <a
              href={activateUrl(oauthUri, oauthCode)}
              target="_blank"
              rel="noreferrer"
              className="tactile-btn active-amber"
              style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Откроет twitch.tv/activate с уже подставленным кодом"
            >
              <span>Открыть twitch.tv/activate</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" focusable="false" />
            </a>
          </div>
        </div>
      )}

      {/* 3. ENDING SOON RADAR */}
      {endingSoonGame && !dismissedRadar.includes(endingSoonGame.key) && (
        <div className="ending-soon-radar mb-2.5" id="endingRadar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-xs)' }}>
            <span className="led-dot amber" />
            <strong className="tabular" style={{ color: 'var(--led-amber)' }}>РАДАР СГОРАЮЩЕЙ КАМПАНИИ:</strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              Кампания <strong style={{ color: 'var(--text-primary)' }}>{endingSoonGame.name}</strong> закрывается через <strong className="tabular" style={{ color: 'var(--led-amber)' }}>{endingSoonGame.timeLeft}</strong>.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="tactile-btn active-amber"
            style={{ minHeight: '24px', fontSize: 'var(--fs-xs)' }}
            onClick={() => {
              playClick();
              onForceFarm?.(endingSoonGame.name);
            }}
          >
            <Zap className="ui-icon" aria-hidden="true" focusable="false" /> Переключить в фокус сейчас
          </button>
          <button
  className="tactile-btn"
  style={{ minHeight: '24px', width: '24px', padding: 0, fontSize: 'var(--fs-sm)' }}
  onClick={() => dismissRadar(endingSoonGame.key)}
  title="Скрыть это предупреждение"
  aria-label="Скрыть предупреждение о сгорающей кампании"
>
  <X className="ui-icon" aria-hidden="true" focusable="false" />
</button>
</div>
        </div>
      )}

      {/* 4. MAIN BENTO GRID */}
      <div className="dashboard-bento">

        {/* LEFT COLUMN: ACTIVE CAMPAIGNS SHELF (420px) */}
        <section className="titanium-island dashboard-shelf-island" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
          <div className="engraved-header" style={{ flexWrap: 'wrap', rowGap: '4px' }}>
            <span className="tag" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', maxWidth: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="led-dot" />
                <span title="Очередь кампаний: игры в порядке фарма">ОЧЕРЕДЬ{!starting && <> · <span id="queueCount">{`${queueStats.total} ${pluralRu(queueStats.total, 'игра', 'игры', 'игр')}`}</span></>}</span>
              </span>
              <span style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--text-muted)' }}>
                {starting ? '\u00a0' : (
                  <>
                    <span title="Игры очереди с идущей кампанией, которую можно фармить (вместе с игрой, которая фармится сейчас)">{`Доступно ${queueStats.available}`}</span>
                    {' · '}
                    <span title="Кампания есть, но аккаунт игры не привязан: фарм невозможен, пока вы его не привяжете">{`Нужна привязка ${queueStats.needLink}`}</span>
                    {' · '}
                    <span title="Игры очереди, где все награды уже получены">{`Завершено ${queueStats.finished}`}</span>
                  </>
                )}
              </span>
            </span>
<div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {forcedGame ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 'var(--fs-xs)', color: 'var(--led-amber)', fontWeight: 700 }}>
                  <span><Zap className="ui-icon" aria-hidden="true" focusable="false" /> ПРИНУДИТЕЛЬНЫЙ ФОКУС: {forcedGame}</span>
                  <button onClick={onCancelForceFarm} style={{ background: 'none', border: 'none', color: 'var(--led-mint)', textDecoration: 'underline', cursor: 'pointer', fontSize: 'var(--fs-xs)' }}>
                    Сбросить фокус / В авто
                  </button>
                </div>
              ) : (
                <button 
                  className="tactile-btn" 
                  style={{ minHeight: '22px', padding: '0 8px', fontSize: 'var(--fs-xs)' }}
                  onClick={() => setShowFullCatalogModal(true)}
                  title="Открыть каталог игр: выбранная игра встаёт первой поверх очереди и фармится, пока вы не отмените выбор или не получены все её награды"
                >
                  Выбрать игру для фарма <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" />
                </button>
              )}
              <button
                className="tactile-btn active-mint"
                style={{ minHeight: '22px', padding: '0 8px', fontSize: 'var(--fs-xs)' }}
                onClick={() => {
                  playClick();
                  onUpdateSettings?.({ priority_mode: settings.priority_mode === 0 ? 1 : 0 });
                }}
                title={settings.priority_mode === 0
                  ? 'Постоянная настройка: сейчас фармятся только игры из очереди. Нажмите, чтобы после них брать и другие игры с активными кампаниями'
                  : 'Постоянная настройка: сначала игры из очереди, затем любые другие игры с активными кампаниями. Нажмите, чтобы фармить только очередь'}
              >
                {settings.priority_mode === 0 ? 'Режим: только очередь' : 'Режим: очередь + любые'}
              </button>
            </div>
          </div>

          {/* QUEUE STATUS FILTER: view only, the real queue order and priority numbers never change */}
          <div role="group" aria-label="Фильтр очереди по статусу" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {QUEUE_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`tactile-btn ${queueFilter === option.value ? 'active-mint' : ''}`}
                style={{ minHeight: '22px', padding: '0 8px', fontSize: 'var(--fs-xs)' }}
                onClick={() => changeQueueFilter(option.value)}
                aria-pressed={queueFilter === option.value}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* GQL SEARCH INPUT & DROPDOWN */}
          <div className="obsidian-well search-well relative">
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}><Search className="ui-icon" aria-hidden="true" focusable="false" /></span>
            <input
              type="text"
              id="gqlSearchInput"
              placeholder="Найти игру…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
            />
            {isSearchFocused && searchResults.length > 0 && (
              <div className="gql-autocomplete" id="gqlDropdown" style={{ display: 'flex' }}>
                <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', padding: '2px 6px' }}>
                  <span>ПРОВЕРКА TWITCH</span>
                  <span>ENTER · В ОЧЕРЕДЬ</span>
                </div>
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="queue-row cursor-pointer"
                    onClick={() => {
                      playClick();
                      onAddToPriority?.(item.canonical_name || item.name);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>{item.canonical_name || item.name}</div>
                      <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: item.has_active_drops ? 'var(--led-mint)' : 'var(--text-muted)' }}>
                        {item.has_active_drops ? 'Активные Twitch Drops доступны' : 'Нет активных дропов'}
                      </div>
                    </div>
                    <span className="version-chip"><Plus className="ui-icon" aria-hidden="true" focusable="false" /> В ОЧЕРЕДЬ</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COMPACT QUEUE SCROLL CONTAINER */}
          <div className="queue-scroll" id="queueContainer" style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
            {starting ? (
              <div className="text-center py-6 text-xs text-[var(--text-muted)]">Загружаем очередь…</div>
            ) : queueShown.visible.length === 0 ? (
              <div className="text-center py-6 text-xs text-[var(--text-muted)]">
                {queueCampaigns.length === 0 ? 'Очередь кампаний пуста' : QUEUE_FILTER_EMPTY[queueFilter]}
              </div>
            ) : (
              <>
                {activeQueue.map(renderQueueRow)}
                {finishedQueue.length > 0 && (
                  <>
                    <button
                      className="queue-finished-toggle"
                      onClick={toggleFinishedGroup}
                      aria-expanded={showFinishedQueue}
                      title="Игры, где все награды уже получены; порядок приоритета сохраняется"
                    >
                      <span>{showFinishedQueue ? <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronRight className="ui-icon" aria-hidden="true" focusable="false" />} Завершено · {finishedQueue.length}</span>
                    </button>
                    {showFinishedQueue && finishedQueue.map(renderQueueRow)}
                  </>
                )}
              </>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: 1. CHRONOGRAPH -> 2. LIVE CONSOLE -> 3. OVERRIDE */}
        <div className="right-deck-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>

          {/* MODULE 1: TARGET REWARD CHRONOGRAPH */}
          <section className="titanium-island" style={{ flexShrink: 0 }}>
            <div className="engraved-header">
              <span className="tag">
                <span className="led-dot" /> <span title="Целевая награда и хронограф активного дропа">ТЕКУЩАЯ ЦЕЛЬ</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="version-chip" title="Смотрим без загрузки видео — экономит трафик и CPU">Без видео</span>
              </div>
            </div>

            {isIdle ? (
              <div className="idle-hero">
                <h2 className="idle-hero-title" id="heroDropTitle">{starting ? 'Загружаем данные…' : 'Ожидание кампаний'}</h2>
                {connected && (
                  <div className="idle-hero-extra tabular" style={hardware.is_paused ? { color: 'var(--led-amber)' } : undefined}>
                    {hardware.is_paused ? 'Автосбор приостановлен' : 'Автосбор включён · Сейчас ожидает'}
                  </div>
                )}
                <div className="idle-hero-reason">{starting ? 'Данные появятся, когда служба ответит.' : idleInfo.reason}</div>
                {!starting && idleInfo.extra && <div className="idle-hero-extra tabular">{idleInfo.extra}</div>}
                {!starting && idleInfo.unlinked.slice(0, 3).map((u) => (
                  <button
                    key={u.name}
                    className="idle-hero-link"
                    onClick={() => { playClick(); if (u.url) window.open(u.url, '_blank'); }}
                    disabled={!u.url}
                    title={u.url ? `Открыть страницу привязки аккаунта: ${u.url}` : 'Ссылка на привязку не передана'}
                  >
                    {shortGameName(u.name)}: {u.count} {pluralRu(u.count, 'дроп ждёт', 'дропа ждут', 'дропов ждут')} — привяжите аккаунт <ExternalLink className="ui-icon" aria-hidden="true" focusable="false" />
                  </button>
                ))}
                {!starting && idleInfo.unlinked.length > 3 && (
                  <div className="idle-hero-extra tabular">и ещё {idleInfo.unlinked.length - 3}</div>
                )}
                <div className="idle-hero-actions">
                  <button
                    className="tactile-btn active-mint"
                    style={{ minHeight: '28px' }}
                    onClick={() => { playClick(); setShowFullCatalogModal(true); }}
                    title="Открыть каталог игр: выбранная игра встаёт первой поверх очереди и фармится, пока вы не отмените выбор или не получены все её награды"
                  >
                    Выбрать игру для фарма
                  </button>
                  <button
                    className="tactile-btn"
                    style={{ minHeight: '28px' }}
                    onClick={scrollToOverride}
                    title="Перейти к блоку ручного фокуса"
                  >
                    Показать игры вне очереди
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="chrono-hero-grid">
              {/* The game being farmed: the first thing to read in the hero */}
              <div className="hero-game-card" id="heroGameCard" title={activeGame || undefined}>
                <div className="hero-game-cover">
                  {activeGameArt && (
                    <img
                      key={activeGame}
                      src={activeGameArt}
                      alt=""
                      crossOrigin={isSteamArt(activeGameArt) ? 'anonymous' : undefined}
                      onLoad={(e) => { const img = e.currentTarget; if (isBlankCover(img) && !retryCover(img, activeGame)) img.style.display = 'none'; }}
                      onError={(e) => { const img = e.currentTarget; if (!retryCover(img, activeGame)) img.style.display = 'none'; }}
                    />
                  )}
                </div>
                <div className="hero-game-name clip-2">{activeGame || 'Не выбрана'}</div>
              </div>

              {/* 98px Radial Speedometer Dial */}
              <div className="radial-ring-box">
                <svg className="radial-svg" viewBox="0 0 98 98">
                  <circle className="radial-track" cx="49" cy="49" r={radius} />
                  <circle
                    id="radialArc"
                    className="radial-arc"
                    cx="49"
                    cy="49"
                    r={radius}
                    style={{
                      strokeDasharray: circumference,
                      strokeDashoffset: strokeDashoffset,
                      transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                </svg>
                <div style={{ textAlign: 'center', zIndex: 2 }}>
                  <div className="tabular" style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }} id="heroPct">
                    {progressPct}%
                  </div>
                  <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-mint)', fontWeight: 700 }} id="heroEta">
                    ~{etaMinutes} МИН
                  </div>
                </div>
              </div>

              {/* Middle Drop Info & Quick Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px 6px', flexWrap: 'wrap' }}>
                  <span className="version-chip">ЭТАП 2 ИЗ 3</span>
                  <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }} id="heroMins">
                    {currentMinutes} ИЗ {requiredMinutes} МИН
                  </span>
                  <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-mint)' }}>
                    скорость 1x
                  </span>
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--fs-lg)',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  id="heroDropTitle"
                >
                  {activeTitle || 'Ожидание дропа...'}
                </h2>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                  ИГРА: <strong style={{ color: 'var(--text-primary)' }} id="heroGameTitle">{activeGame || 'Не выбрана'}</strong> • СТАТУС:{' '}
                  <strong style={{ color: 'var(--led-mint)' }}>
                    {activeStreamer ? `@${activeStreamer} (LIVE)` : 'ПОИСК СТРИМЕРА'}
                  </strong>
                </div>

                <div style={{ display: 'flex', gap: '5px', marginTop: '2px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="autoclaim-armed-pill">
                    <span className="led-dot" />
                    <span>АВТОЗАБОР НАГРАД: ВКЛ</span>
                  </div>
                  <button
                    className="tactile-btn"
                    style={{ minHeight: '28px' }}
                    onClick={() => {
                      playClick();
                      onSwitchStreamer?.(false);
                    }}
                    title="Сменить текущего стримера на другого из той же игры"
                  >
                    <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> Сменить
                  </button>
                  <button
                    className="tactile-btn"
                    style={{ minHeight: '28px' }}
                    onClick={() => {
                      playClick();
                      onSwitchStreamer?.(true);
                    }}
                    title="Пропустить текущую игру и перейти к следующей в очереди"
                  >
                    <SkipForward className="ui-icon" aria-hidden="true" focusable="false" /> След. игра
                  </button>
                  {activeStreamer && onBanStreamer && (
                    <>
                      <button
                        className="tactile-btn"
                        style={{ minHeight: '28px' }}
                        onClick={() => {
                          playClick();
                          onBanStreamer(activeStreamer, true);
                        }}
                        title="Поставить стримера на паузу на 2 часа"
                      >
                        <Clock className="ui-icon" aria-hidden="true" focusable="false" /> Скрыть на 2 ч
                      </button>
                      <button
                        className="tactile-btn danger-hover"
                        style={{ minHeight: '28px' }}
                        onClick={() => {
                          playClick();
                          onBanStreamer(activeStreamer, false);
                        }}
                        title="Исключить стримера из фарма навсегда"
                      >
                        <Ban className="ui-icon" aria-hidden="true" focusable="false" /> Исключить
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Streamer Viewfinder */}
              <div className="obsidian-well streamer-viewfinder">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                    <span className="led-dot" style={{ flexShrink: 0 }} />
                    <span className="clip-1" title={activeStreamer ? `@${activeStreamer}` : undefined} id="streamerName">{activeStreamer ? `@${activeStreamer}` : 'ожидание стримера'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {activeStreamer && (
                      <button
                        className="node-chip"
                        onClick={() => window.open(`https://twitch.tv/${activeStreamer}`, '_blank')}
                      >
                        <ExternalLink className="ui-icon" aria-hidden="true" focusable="false" /> Twitch
                      </button>
                    )}
                    <span className="node-chip" title="Игнорируемые стримеры">
                      <Ban className="ui-icon" aria-hidden="true" focusable="false" /> {settings.ignored_channels?.length || 0}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} id="availableNodesRow">
                  {(availableChannels || []).slice(0, 3).map((ch, idx) => (
                    <span
                      key={idx}
                      className={`node-chip clip-1 ${ch.current ? 'active' : ''}`}
                      title={ch.display_name || ch.name}
                      onClick={() => {
                        playClick();
                        onSwitchStreamer?.(false);
                      }}
                    >
                      {ch.display_name || ch.name} ({ch.viewers ? `${Math.round(ch.viewers / 1000)}k` : 'ok'})
                    </span>
                  ))}
                </div>

                <div className="tabular" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2px 8px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '3px' }}>
                  <span title="Связь со стримом: SPADE HEAD каждые 20 с">Сигнал просмотра: каждые 20 с</span>
                  <span style={{ color: 'var(--led-mint)' }}>{activeStreamer ? 'на связи' : 'ожидание'}</span>
                </div>
              </div>
            </div>

            {/* Sapphire LED Housing & Stage Pills */}
            <div className="obsidian-well sapphire-led-housing">
              <div className="campaign-stages-3">
                <div className="stage-pill done">
                  <span><Check className="ui-icon" aria-hidden="true" focusable="false" /> 1. Начальная награда</span>
                  <span className="tabular">100%</span>
                </div>
                <div className="stage-pill active">
                  <span><Play className="ui-icon" aria-hidden="true" focusable="false" /> 2. {activeTitle || 'Текущая цель'}</span>
                  <span className="tabular" id="stage2Pct">{progressPct}%</span>
                </div>
                <div className="stage-pill">
                  <span style={{ color: 'var(--text-muted)' }}>3. Финальный трофей</span>
                  <span className="tabular" style={{ color: 'var(--text-muted)' }}>0%</span>
                </div>
              </div>
              <div className="led-strip-40" id="ledMatrix40">
                {Array.from({ length: 40 }).map((_, i) => (
                  <span
                    key={i}
                    className={`led-seg ${i < Math.round((progressPct / 100) * 40) ? 'lit' : ''}`}
                  />
                ))}
              </div>
            </div>
            </>
            )}
          </section>

          {/* MODULE 2: LIVE OPERATIONS & ACTION CONSOLE */}
          <section
            className={`titanium-island middle-console-island${consoleCollapsed ? ' console-collapsed' : ''}`}
            style={consoleCollapsed ? { flex: '0 0 auto', minHeight: 0, overflow: 'hidden' } : { flex: 1, minHeight: 0, overflow: 'hidden' }}
          >
            <div className="engraved-header" style={{ marginBottom: '5px' }}>
              <span className="tag">
                <span className="led-dot" /> <span title="Живая консоль операций и событий демона">КОНСОЛЬ</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  className="node-chip"
                  onClick={toggleConsole}
                  aria-expanded={!consoleCollapsed}
                  title={consoleCollapsed ? 'Развернуть консоль: полный журнал событий' : 'Свернуть консоль до одной строки с последним событием'}
                >
                  {consoleCollapsed ? <ChevronRight className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" />} Журнал
                </button>
                {!consoleCollapsed && (<>
                <button
                  className={`node-chip ${logFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => { playClick(); setLogFilter('ALL'); }}
                >
                  Все
                </button>
                <button
                  className={`node-chip ${logFilter === 'WATCH' ? 'active' : ''}`}
                  onClick={() => { playClick(); setLogFilter('WATCH'); }}
                >
                  Стримы
                </button>
                <button
                  className={`node-chip ${logFilter === 'CLAIM' ? 'active' : ''}`}
                  onClick={() => { playClick(); setLogFilter('CLAIM'); }}
                >
                  Трофеи
                </button>
                <button
                  className={`node-chip ${logFilter === 'CORE' ? 'active' : ''}`}
                  onClick={() => { playClick(); setLogFilter('CORE'); }}
                >
                  Ядро
                </button>
                </>)}
                {hostCanOpenLogFile() && (
                  <button
                    className="node-chip"
                    onClick={() => { playClick(); openLogFile(); }}
                    title="Показать файл логов в Проводнике: sentinel_service.log"
                  >
                    <FileText className="ui-icon" aria-hidden="true" focusable="false" /> Файл логов
                  </button>
                )}
                <button
                  className="node-chip"
                  onClick={handleCopyLogs}
                  title="Скопировать журнал операций в буфер"
                >
                  {copiedLogs ? <Check className="ui-icon" aria-hidden="true" focusable="false" /> : <ClipboardCopy className="ui-icon" aria-hidden="true" focusable="false" />} {copiedLogs ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>

            {consoleCollapsed && (
              <div className="obsidian-well console-last-event" id="mainConsoleLine" style={{ display: 'flex', gap: '8px', padding: '6px 10px', fontSize: 'var(--fs-xs)', minWidth: 0 }}>
                {lastEvent ? (
                  <>
                    <span className="tabular" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      [{lastEvent.log.time || lastEvent.log.timestamp || '00:00:00'}]
                    </span>
                    <span
                      className="clip-1"
                      style={{ color: 'var(--text-primary)', minWidth: 0, flex: 1 }}
                      title={withoutLevelPrefix(lastEvent.log.message, (lastEvent.log.level || lastEvent.log.category || 'INFO').toUpperCase())}
                    >
                      {withoutLevelPrefix(lastEvent.log.message, (lastEvent.log.level || lastEvent.log.category || 'INFO').toUpperCase())}
                      {lastEvent.count > 1 && <span className="tabular" style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>×{lastEvent.count}</span>}
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Журнал операций ожидает входящих событий...</span>
                )}
              </div>
            )}

            {!consoleCollapsed && (
            <div 
              ref={consoleViewportRef} 
              onScroll={handleDashboardConsoleScroll}
              className="obsidian-well console-log-viewport" 
              id="mainConsoleViewport" 
              tabIndex={0}
              role="log"
              aria-live="off"
              aria-label="Журнал операций"
              style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}
            >
              {logHistoryFailed && (
                <div role="status" style={{ color: 'var(--led-amber)', padding: '2px 0 6px' }}>
                  Не удалось загрузить историю журнала: показаны последние строки
                </div>
              )}
              {filteredLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' }}>
                  Журнал операций ожидает входящих событий...
                </div>
              ) : (
                filteredLogs.map(({ log, count, block }, i) => {
                  const cat = (log.level || log.category || 'INFO').toUpperCase();
                  const isClaim = cat.includes('CLAIM') || cat.includes('DROP');
                  const isWatch = cat.includes('WATCH') || cat.includes('STREAM');
                  const isError = cat.includes('ERR') || cat.includes('WARN');
                  return (
                    <React.Fragment key={i}>
                    <div
                      style={{ display: 'flex', gap: '8px', lineHeight: '1.4', cursor: block ? 'pointer' : 'default' }}
                      onClick={block ? () => toggleSync(block) : undefined}
                      title={block ? `Свёрнуто строк: ${block.length}. Нажмите, чтобы раскрыть` : undefined}
                      role={block ? 'button' : undefined}
                    >
                      <span className="tabular" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        [{log.time || log.timestamp || '00:00:00'}]
                      </span>
                      <span
                        className="tabular font-bold"
                        style={{
                          color: isClaim ? 'var(--led-amber)' : isWatch ? 'var(--led-mint)' : isError ? 'var(--led-rose)' : 'var(--led-cyan)',
                          flexShrink: 0,
                          minWidth: '3em',
                        }}
                      >
                        [{cat}]
                      </span>
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                        {block ? (expandedSync.includes(syncKey(block)) ? <ChevronDown className="ui-icon" aria-hidden="true" focusable="false" /> : <ChevronRight className="ui-icon" aria-hidden="true" focusable="false" />) : null}{withoutLevelPrefix(log.message, cat)}
                        {count > 1 && <span className="tabular" style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>×{count}</span>}
                      </span>
                    </div>
                    {block && expandedSync.includes(syncKey(block)) && block.map((b, j) => (
                      <div key={`${i}-${j}`} style={{ display: 'flex', gap: '8px', lineHeight: '1.4', paddingLeft: '18px', opacity: 0.75 }}>
                        <span className="tabular" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{b.time || b.timestamp || '00:00:00'}]</span>
                        <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{b.message}</span>
                      </div>
                    ))}
                    </React.Fragment>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
            )}
          </section>

          {/* MODULE 3: MANUAL FARM OVERRIDE */}
          <section
            id="overrideSection"
            className="titanium-island"
            style={consoleCollapsed ? { flex: '1 1 auto', minHeight: 0, overflow: 'hidden' } : { flexShrink: 0 }}
          >
            <div className="engraved-header" style={{ marginBottom: '4px' }}>
              <span className="tag">
                <span className="led-dot amber" /> <span title="Фарм вне очереди (ручной фокус)">ВНЕ ОЧЕРЕДИ</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Фильтр активных кампаний..."
                  value={overrideFilter}
                  onChange={(e) => setOverrideFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-well)',
                    border: '1px solid var(--border-main)',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--fs-xs)',
                    outline: 'none',
                    width: '145px',
                  }}
                />
                {forcedGame && (
                  <button
                    className="tactile-btn"
                    style={{ minHeight: '22px', padding: '0 7px', fontSize: 'var(--fs-xs)', color: 'var(--led-amber)' }}
                    onClick={() => {
                      playClick();
                      onCancelForceFarm?.();
                    }}
                  >
                    <X className="ui-icon" aria-hidden="true" focusable="false" /> В Авто
                  </button>
                )}
              </div>
            </div>

            <div ref={overrideGridRef} className={`override-scroll-grid ${consoleCollapsed ? 'is-poster' : 'is-compact'}`} id="overrideGrid" style={consoleCollapsed ? { maxHeight: 'none', overflowY: 'auto', flex: '1 1 auto' } : ({ maxHeight: 'none', overflow: 'visible', '--override-cols': overrideCols } as React.CSSProperties)}>
              {overrideGames.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                  {starting ? 'Загружаем кампании…' : 'Нет подходящих кампаний для ручного переключения'}
                </div>
              ) : (
                overrideGames.map((g, idx) => {
                  const isForced = forcedGame === g.name;
                  const isFinished = Boolean(
                    g.is_finished ||
                    (g.total_drops && g.claimed_drops && g.claimed_drops >= g.total_drops) ||
                    (g.progress_percent !== undefined && g.progress_percent >= 100)
                  );
                  // campaigns closing within a day: time left against the watching still needed (never a promise)
                  const deadline = !isForced && !isFinished && endingSoonByGame.has(safeLower(g.name))
                    ? deadlineFacts(g.drops_end_at, g.remaining_watch_minutes, Date.now())
                    : null;
                  let deadlineText: string | null = null; // the full wording, for the tooltip
                  let deadlineShort: string | null = null; // what fits the pill's one line
                  if (deadline && deadline.msLeft !== null) {
                    const left = formatTimeLeft(deadline.msLeft);
                    const watch = deadline.watchMinutes === null ? '' : formatTimeLeft(deadline.watchMinutes * 60000);
                    if (deadline.watchMinutes === null) { deadlineText = `До конца ${left} · время просмотра неизвестно`; deadlineShort = `До конца ${left}`; }
                    else if (deadline.verdict === 'late') { deadlineText = `Не успеть: до конца ${left}, смотреть ${watch}`; deadlineShort = `Не успеть: ${left}, смотреть ${watch}`; }
                    else { deadlineText = `До конца ${left} · смотреть ${watch}`; deadlineShort = `${left} · смотреть ${watch}`; }
                  }
                  return (
                    <div
                      key={idx}
                      className={`override-pill-card ${isForced ? 'forced' : ''}`}
                      onClick={() => {
                        playClick();
                        if (isForced) {
                          onCancelForceFarm?.();
                        } else {
                          onForceFarm?.(g.name);
                        }
                      }}
                      title={isForced ? 'Нажмите для отмены ручного режима' : isFinished ? `${g.name}: все награды уже получены (100%)` : `Переключить фарм на ${g.name}`}
                    >
                      <div className="override-cover">
                        <CartridgeCover name={g.name} boxArt={g.box_art} compact={!consoleCollapsed} />
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.name}
                        </div>
                        <div
                          className="tabular"
                          title={deadlineText ? `${deadlineText}. Время до конца кампании и сколько ещё нужно смотреть. Гарантии нет: игры фармятся по очереди.` : undefined}
                          style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isForced ? 'var(--led-amber)' : isFinished ? 'var(--led-mint)' : endingSoonByGame.has(safeLower(g.name)) ? 'var(--led-amber)' : 'var(--text-muted)' }}
                        >
                          {isForced ? 'В ФОКУСЕ' : isFinished ? 'Собрано (100%)' : endingSoonByGame.has(safeLower(g.name)) ? (deadlineShort ?? `сгорает через ${endingSoonByGame.get(safeLower(g.name))?.timeLeft}`) : g.has_drops ? 'Активные дропы' : 'Ожидание'}
                        </div>
                      </div>
                      <span
                        className="version-chip shrink-0"
                        style={{ color: isForced ? 'var(--led-amber)' : isFinished ? 'var(--led-mint)' : 'var(--led-mint)' }}
                      >
                        {isForced ? 'Сейчас · отменить' : isFinished ? 'СОБРАНО' : 'Собирать сейчас'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {overrideAll.length > OVERRIDE_VISIBLE && (
              <button
                className="tactile-btn override-show-all"
                onClick={() => { playClick(); setShowFullCatalogModal(true); }}
                title="Открыть полный список игр для ручного фокуса"
              >
                Показать все · {overrideAll.length}
              </button>
            )}
          </section>

        </div>
      </div>

      {/* Full Catalog Modal (Rich Apple Luna 2.0 Dialog) */}
      {showFullCatalogModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => { playClick(); setShowFullCatalogModal(false); }}
        >
          <div 
            ref={catalogDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-title"
            tabIndex={-1}
            className="w-full max-w-2xl bg-[var(--bg-island)] border border-[var(--border-main)] rounded-2xl shadow-2xl p-5 space-y-3.5 max-h-[85vh] flex flex-col outline-none"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--border-subtle)'
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="led-dot amber" />
                <div>
                  <h3 id="catalog-title" className="text-sm font-bold tracking-[0.04em] text-[var(--text-primary)]">
                    <Zap className="ui-icon" aria-hidden="true" focusable="false" /> ВЫБОР ИГРЫ ДЛЯ РУЧНОГО ФОКУСА • Каталог игр Twitch & Steam • Каталог игр Twitch & Steam
                  </h3>
                  <div className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                    Все действующие кампании Twitch Drops ({activeTwitchDropsGames.length} игр в эфире)
                  </div>
                </div>
              </div>
              <button 
                aria-label="Закрыть"
                className="tactile-btn" 
                style={{ height: '26px', width: '26px', padding: 0 }} 
                onClick={() => { playClick(); setShowFullCatalogModal(false); }}
              >
                <X className="ui-icon" aria-hidden="true" focusable="false" />
              </button>
            </div>

            {/* Currently Forced Game Alert */}
            {forcedGame && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="led-dot amber animate-pulse" />
                  <span className="text-[var(--text-secondary)]">
                    Сейчас принудительно фармится: <strong className="text-amber-400">{forcedGame}</strong>
                  </span>
                </div>
                <button
                  className="tactile-btn active-amber"
                  style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
                  onClick={() => {
                    playClick();
                    onCancelForceFarm?.();
                  }}
                >
                  <X className="ui-icon" aria-hidden="true" focusable="false" /> Сбросить в авто
                </button>
              </div>
            )}

            {/* Search Input and Filter Pills */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" focusable="false" />
                <input
                  type="text"
                  placeholder="Поиск по названию игры (например, Rust, Witcher, PoE, Cyberpunk)..."
                  value={catalogModalSearch}
                  onChange={(e) => setCatalogModalSearch(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-[var(--bg-well)] border border-[var(--border-main)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--led-mint)]"
                />
                {catalogModalSearch && (
                  <button 
                    onClick={() => setCatalogModalSearch('')} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white"
                  >
                    <X className="ui-icon" aria-hidden="true" focusable="false" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={`tactile-btn ${catalogModalTab === 'ALL' ? 'active-mint' : ''}`}
                  style={{ minHeight: '28px', fontSize: 'var(--fs-xs)', padding: '0 10px' }}
                  onClick={() => { playClick(); setCatalogModalTab('ALL'); }}
                >
                  Все ({activeTwitchDropsGames.length})
                </button>
                <button
                  className={`tactile-btn ${catalogModalTab === 'TOP' ? 'active-mint' : ''}`}
                  style={{ minHeight: '28px', fontSize: 'var(--fs-xs)', padding: '0 10px' }}
                  onClick={() => { playClick(); setCatalogModalTab('TOP'); }}
                >
                  <Star className="ui-icon" aria-hidden="true" focusable="false" /> Очередь ({topPriorityCount})
                </button>
                <button
                  className={`tactile-btn ${catalogModalTab === 'INSTALLED' ? 'active-mint' : ''}`}
                  style={{ minHeight: '28px', fontSize: 'var(--fs-xs)', padding: '0 10px' }}
                  onClick={() => { playClick(); setCatalogModalTab('INSTALLED'); }}
                >
                  <HardDrive className="ui-icon" aria-hidden="true" focusable="false" /> На ПК ({installedActiveCount})
                </button>
              </div>
            </div>

            {/* Scrollable Games List */}
            <div className="obsidian-well p-2 flex-1 overflow-y-auto space-y-1.5 min-h-[260px]">
              {modalFilteredGames.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)] text-xs space-y-1.5">
                  <p>Игры с таким названием не найдены среди активных кампаний.</p>
                  <p className="text-[length:var(--fs-xs)]">Попробуйте изменить поисковый запрос или переключить фильтр.</p>
                </div>
              ) : (
                modalFilteredGames.map((g) => {
                  const isForced = forcedGame === g.name;
                  const isTop = priorityList.some((p) => typeof p === 'string' && safeLower(p) === safeLower(g.name));
                  const boxArtUrl = resolveGameBoxArt(g.name, g.box_art);
                  return (
                    <div 
                      key={g.name}
                      className={`flex items-center justify-between p-2 rounded-xl transition-all border ${
                        isForced 
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' 
                          : 'bg-black/20 hover:bg-white/[0.04] border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={boxArtUrl}
                          alt={g.name}
                          className="w-9 h-12 object-cover rounded-md border border-white/10 shrink-0 bg-[var(--bg-chassis)]"
                          crossOrigin={isSteamArt(boxArtUrl) ? 'anonymous' : undefined}
                          onLoad={(e) => { const img = e.currentTarget; if (isBlankCover(img) && !retryCover(img, g.name)) img.style.display = 'none'; }}
                          onError={(e) => { const img = e.currentTarget; if (!retryCover(img, g.name)) img.style.display = 'none'; }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                              {g.name}
                            </span>
                            {isTop && (
                              <span className="px-1.5 py-0.5 rounded text-[length:var(--fs-xs)] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                <Star className="ui-icon" aria-hidden="true" focusable="false" /> Очередь
                              </span>
                            )}
                            {g.is_installed && (
                              <span className="px-1.5 py-0.5 rounded text-[length:var(--fs-xs)] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                <HardDrive className="ui-icon" aria-hidden="true" focusable="false" /> УСТАНОВЛЕНА
                              </span>
                            )}
                          </div>
                          <div className="text-[length:var(--fs-xs)] text-[var(--text-muted)] truncate mt-0.5">
                            {g.category || 'Активная кампания Twitch Drops'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-3">
                        <button
                          className={`tactile-btn ${isTop ? 'active-amber' : ''}`}
                          style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
                          onClick={() => {
                            playClick();
                            if (isTop) {
                              onRemoveFromPriority?.(g.name);
                            } else {
                              onAddToPriority?.(g.name);
                            }
                          }}
                          title={isTop ? 'Удалить из приоритетной очереди' : 'Добавить в очередь'}
                        >
                          {isTop ? <Star className="ui-icon" aria-hidden="true" focusable="false" /> : <Plus className="ui-icon" aria-hidden="true" focusable="false" />} {isTop ? 'В очереди' : 'В ОЧЕРЕДЬ'}
                        </button>
                        <button 
                          className={`tactile-btn ${isForced ? 'active-amber' : 'active-mint'}`}
                          style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 10px' }}
                          onClick={() => {
                            playClick();
                            if (isForced) {
                              onCancelForceFarm?.();
                            } else {
                              onForceFarm?.(g.name);
                              setShowFullCatalogModal(false);
                            }
                          }}
                        >
                          {isForced ? <X className="ui-icon" aria-hidden="true" focusable="false" /> : <Zap className="ui-icon" aria-hidden="true" focusable="false" />} {isForced ? 'Отмена' : 'Фармить сейчас'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between text-[length:var(--fs-xs)] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)] shrink-0">
              <span>Показано: {modalFilteredGames.length} из {forceCandidates.length} игр</span>
              <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
                Фокус переключает бота на выбранную игру вне очереди
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
