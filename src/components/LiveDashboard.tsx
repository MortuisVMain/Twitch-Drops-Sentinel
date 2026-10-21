import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldAlert, RefreshCw, Sparkles, Gift, Settings, 
  Gamepad2, Zap, Clock, Tv, CheckCircle2, ChevronRight, Moon, Power,
  Terminal, Copy, Check, ExternalLink, KeyRound, Activity, ScrollText, Filter,
  Play, Pause, RotateCcw, ChevronUp, ChevronDown, Radio, Layers, Monitor,
  Search, ArrowUpDown, ArrowDownAZ, X, Flame, Plus
} from 'lucide-react';
import { ActiveDrop, HardwareGuard, SentinelStats, SentinelSettings, SentinelLogEntry, GameItem } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { resolveGameBoxArt, resolveGameBoxArtSources, registerDynamicBoxArt, smartGameMatch } from '../utils/gameBoxArts';

interface CampaignGame {
  name: string;
  drop_name: string;
  badge: string;
  icon: string;
  box_art?: string;
  box_art_sources?: string[];
  has_drops?: boolean;
  drops_end_at?: string;
  progress_percent: number;
  current_minutes?: number;
  required_minutes?: number;
  status: 'FARMING' | 'CLAIMED' | 'QUEUED' | 'IDLE';
  bgGradient: string;
}

interface SearchResultItem {
  name: string;
  canonical_name: string;
  box_art?: string;
  has_active_drops?: boolean;
  is_installed?: boolean;
  status?: string;
  drops_end_at?: string;
  rewards_count?: number;
}

const GAME_EMOJIS: Record<string, string> = {
  'the witcher 3': '🐺',
  'witcher': '🐺',
  'rust': '⛺',
  'cyberpunk': '🌆',
  'hunt': '🤠',
  'path of exile': '💎',
  'poe': '💎',
  'no man\'s sky': '🚀',
  'hearthstone': '🎴',
  'aion': '⚔️',
  'warhammer': '🛡️',
  'world of warships': '🚢',
};

const GAME_GRADIENTS = [
  'linear-gradient(135deg, #1f2a26, #171d1c)',
  'linear-gradient(135deg, #25332e, #1a221f)',
  'linear-gradient(135deg, #1e2825, #171d1c)',
  'linear-gradient(135deg, #22302a, #19201d)',
  'linear-gradient(135deg, #283731, #1c2522)',
  'linear-gradient(135deg, #1d2723, #161c1b)',
];

function getGameEmoji(name: string): string {
  const low = name.toLowerCase();
  for (const [k, v] of Object.entries(GAME_EMOJIS)) {
    if (low.includes(k)) return v;
  }
  return '🎮';
}

const DEFAULT_FALLBACK_CAMPAIGNS: CampaignGame[] = [
  {
    name: 'The Witcher 3: Wild Hunt',
    drop_name: 'Ожидание раздачи на Twitch',
    badge: '🐺 The Witcher 3',
    icon: '🐺',
    progress_percent: 0,
    status: 'QUEUED',
    bgGradient: 'linear-gradient(135deg, #1f2a26, #171d1c)',
  },
  {
    name: 'Rust',
    drop_name: 'Ожидание раздачи на Twitch',
    badge: '⛺ Rust Survival',
    icon: '⛺',
    progress_percent: 0,
    status: 'QUEUED',
    bgGradient: 'linear-gradient(135deg, #25332e, #1a221f)',
  },
  {
    name: 'Cyberpunk 2077',
    drop_name: 'Ожидание раздачи на Twitch',
    badge: '🌆 Cyberpunk 2077',
    icon: '🌆',
    progress_percent: 0,
    status: 'QUEUED',
    bgGradient: 'linear-gradient(135deg, #1e2825, #171d1c)',
  },
  {
    name: 'Hunt: Showdown 1896',
    drop_name: 'Ожидание раздачи на Twitch',
    badge: '🤠 Hunt: Showdown',
    icon: '🤠',
    progress_percent: 0,
    status: 'IDLE',
    bgGradient: 'linear-gradient(135deg, #22302a, #19201d)',
  },
];

interface GameBoxArtProps {
  boxArt?: string;
  boxArtSources?: string[];
  name: string;
  fallbackEmoji: string;
  isFarming?: boolean;
}

const GameBoxArt: React.FC<GameBoxArtProps> = ({ boxArt, boxArtSources, name, fallbackEmoji, isFarming }) => {
  const sources = React.useMemo(() => {
    const list: string[] = [];
    if (boxArtSources && boxArtSources.length > 0) {
      list.push(...boxArtSources);
    }
    if (boxArt && !list.includes(boxArt)) {
      list.unshift(boxArt);
    }
    return list;
  }, [boxArt, boxArtSources]);

  const [currentSrcIdx, setCurrentSrcIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    setCurrentSrcIdx(0);
    setIsLandscape(false);
    setAllFailed(sources.length === 0);
  }, [sources]);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth <= 10 || img.currentSrc.includes('404_boxart')) {
      handleImgError();
      return;
    }
    // Detect horizontal Steam header (aspect ratio > 1.25)
    setIsLandscape(img.naturalWidth / img.naturalHeight > 1.25);
  };

  const handleImgError = () => {
    if (currentSrcIdx + 1 < sources.length) {
      setCurrentSrcIdx(prev => prev + 1);
    } else {
      setAllFailed(true);
    }
  };

  const currentSrc = sources[currentSrcIdx];

  // Derive elegant 2-letter monogram & sequel tag
  const monogram = React.useMemo(() => {
    const tokens = name.split(/[\s:_-]+/).filter(Boolean);
    const lastTok = tokens[tokens.length - 1];
    const hasSeq = /^(\d+|II|III|IV|V|VI)$/i.test(lastTok) && tokens.length > 1;
    const wordTokens = hasSeq ? tokens.slice(0, -1) : tokens;
    const initials = wordTokens.length >= 2
      ? `${wordTokens[0][0]}${wordTokens[1][0]}`.toUpperCase()
      : (wordTokens[0]?.slice(0, 2) || 'GM').toUpperCase();
    return { initials, sequel: hasSeq ? lastTok.toUpperCase() : null };
  }, [name]);

  return (
    <div className={`shelf-icon relative shrink-0 ${isFarming ? 'ring-2 ring-[var(--accent)] shadow-[0_0_14px_rgba(58,210,159,0.35)]' : ''}`}>
      {currentSrc && !allFailed ? (
        isLandscape ? (
          <div className="relative w-full h-full overflow-hidden rounded-[7px] bg-[#121816]">
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
          </div>
        ) : (
          <img
            key={currentSrc}
            src={currentSrc}
            alt={name}
            className="shelf-icon-img"
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            onError={handleImgError}
          />
        )
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[#1d2622] to-[#121816] flex flex-col items-center justify-center text-xs font-mono font-black text-[var(--accent)] border border-white/5 select-none rounded-[7px]">
          {fallbackEmoji && fallbackEmoji !== '🎮' ? (
            <span>{fallbackEmoji}</span>
          ) : (
            <>
              <span className="leading-tight tracking-wider">{monogram.initials}</span>
              {monogram.sequel && (
                <span className="text-[8px] font-sans px-1 py-[1px] bg-white/10 rounded text-white/80 leading-none">
                  {monogram.sequel}
                </span>
              )}
            </>
          )}
        </div>
      )}
      {isFarming && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#3AD29F] border-2 border-[#171d1c] animate-pulse" />
      )}
    </div>
  );
};

interface LiveDashboardProps {
  activeDrop: ActiveDrop | null;
  hardware: HardwareGuard;
  stats: SentinelStats;
  settings: SentinelSettings;
  statusText?: string;
  watchingChannel?: string | null;
  recentLogs?: SentinelLogEntry[];
  watchdogStatus?: string | null;
  oauthCode?: string | null;
  oauthUri?: string | null;
  allGames?: GameItem[];
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

export const LiveDashboard: React.FC<LiveDashboardProps> = ({
  activeDrop,
  hardware,
  stats,
  settings,
  statusText,
  watchingChannel,
  recentLogs = [],
  watchdogStatus,
  oauthCode,
  oauthUri,
  allGames,
  onAddToPriority,
  onRemoveFromPriority,
  onToggleAutoShutdown,
  onSelectShutdownMode,
  onManualRefresh,
  onGoToShelf,
  onGoToSettings,
  onClaimNow,
  onToggleDaemon,
  onSwitchStreamer,
  onReorderPriority,
  onUpdateSettings,
  isZenMode,
  onToggleZenMode,
  forcedGame,
  onForceFarm,
  onCancelForceFarm
}) => {
  const { playClick, playRewardChime } = useTactileAudio();
  const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);
  const [uptimeSeconds, setUptimeSeconds] = useState(
    Math.max(0, Math.floor((stats?.total_farm_hours || 0) * 3600))
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLog, setCopiedLog] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedStreamer, setCopiedStreamer] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'WATCH' | 'CLAIM' | 'CORE'>('ALL');
  const [shelfFilter, setShelfFilter] = useState<'ALL' | 'QUEUED' | 'CLAIMED'>('ALL');
  const [shelfSortMode, setShelfSortMode] = useState<'priority' | 'alphabetical'>('priority');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [isRotatingStreamer, setIsRotatingStreamer] = useState(false);
  const [isIgnoringProcess, setIsIgnoringProcess] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Manual Farm Override States
  const [showFullCatalogModal, setShowFullCatalogModal] = useState(false);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');

  const handleForceFarmGame = (gameName: string) => {
    playClick();
    setShowFullCatalogModal(false);
    if (onForceFarm) {
      onForceFarm(gameName);
    }
  };

  const handleResetManualFocus = () => {
    playClick();
    if (onCancelForceFarm) {
      onCancelForceFarm();
    }
  };

  const handleIgnoreDetectedProcess = async () => {
    const proc = hardware?.detected_game;
    if (!proc) return;
    setIsIgnoringProcess(true);
    playClick();
    try {
      const res = await fetch('http://127.0.0.1:28492/api/hardware/ignore-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process: proc }),
      });
      if (res.ok) {
        playRewardChime();
        if (onManualRefresh) onManualRefresh();
      }
    } catch (err) {
      console.error('Failed to ignore process:', err);
    } finally {
      setIsIgnoringProcess(false);
    }
  };

  // Close search popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const qClean = query.toLowerCase().trim();
    // 1. Instant local matches
    const localMatches: SearchResultItem[] = (allGames || [])
      .filter(g => g.name.toLowerCase().includes(qClean))
      .slice(0, 5)
      .map(g => ({
        name: g.name,
        canonical_name: g.name,
        box_art: g.box_art,
        has_active_drops: g.has_drops,
        is_installed: g.is_installed,
        drops_end_at: g.drops_end_at,
      }));
    setSearchResults(localMatches);

    // 2. Debounced multi-source backend search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`http://127.0.0.1:28492/api/search-games?q=${encodeURIComponent(query)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            setSearchResults(data);
            data.forEach((item: SearchResultItem) => {
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

  const handleAddGameFromSearch = (item: SearchResultItem) => {
    playClick();
    if (item.box_art) {
      registerDynamicBoxArt(item.canonical_name, item.box_art);
    }
    if (onAddToPriority) {
      onAddToPriority(item.canonical_name);
    }
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchFocused(false);
  };

  // Auto-scroll terminal on new logs
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollTop = terminalEndRef.current.scrollHeight;
    }
  }, [recentLogs, autoScroll]);

  // Auto-increment uptime ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeSeconds(prev => (isNaN(prev) ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (totalSec: number) => {
    if (isNaN(totalSec) || totalSec <= 0) return '0h 00m 00s';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  // Build authentic campaign list from settings.priority_games, activeDrop, and real live catalog
  const campaigns: CampaignGame[] = [];
  const priorityGames = settings.priority_games || [];

  const activeDropMatchesPriority = Boolean(
    activeDrop && priorityGames.some(pg => 
      activeDrop.game.toLowerCase().includes(pg.toLowerCase()) || 
      pg.toLowerCase().includes(activeDrop.game.toLowerCase())
    )
  );

  const isFallbackFarming = Boolean(activeDrop && priorityGames.length > 0 && !activeDropMatchesPriority);

  // If activeDrop is currently mining a fallback game, prepend it so the shelf matches reality!
  if (activeDrop && !activeDropMatchesPriority) {
    const emoji = getGameEmoji(activeDrop.game);
    const catalogMatch = (allGames || []).find(g => 
      g.name.toLowerCase() === activeDrop.game.toLowerCase() || 
      g.name.toLowerCase().includes(activeDrop.game.toLowerCase()) ||
      activeDrop.game.toLowerCase().includes(g.name.toLowerCase())
    );
    const boxArtSources = resolveGameBoxArtSources(activeDrop.game, [activeDrop.game_box_art, catalogMatch?.box_art]);

    campaigns.push({
      name: activeDrop.game,
      drop_name: activeDrop.name,
      badge: `${emoji} ${activeDrop.game} (Активный сбор)`,
      icon: emoji,
      box_art: boxArtSources[0],
      box_art_sources: boxArtSources,
      has_drops: true,
      drops_end_at: catalogMatch?.drops_end_at,
      progress_percent: activeDrop.progress_percent,
      current_minutes: activeDrop.current_minutes,
      required_minutes: activeDrop.required_minutes,
      status: activeDrop.is_claimed ? 'CLAIMED' : 'FARMING',
      bgGradient: 'linear-gradient(135deg, #1e1b4b, #0f172a)'
    });
  }

  // Then add user priority games
  priorityGames.forEach((gameName, idx) => {
    const isCurrentlyActive = Boolean(activeDrop && (
      activeDrop.game.toLowerCase() === gameName.toLowerCase() || 
      smartGameMatch(activeDrop.game, gameName)
    ));

    const catalogMatch = (allGames || []).find(g => 
      g.name.toLowerCase() === gameName.toLowerCase() ||
      smartGameMatch(g.name, gameName)
    );
    const hasActiveDrops = catalogMatch ? catalogMatch.has_drops : false;
    const boxArtSources = resolveGameBoxArtSources(isCurrentlyActive && activeDrop ? activeDrop.game : gameName, [
      isCurrentlyActive ? activeDrop?.game_box_art : undefined,
      catalogMatch?.box_art
    ]);

    const isFinished = catalogMatch?.is_finished === true;
    const emoji = getGameEmoji(gameName);
    const dropName = isCurrentlyActive && activeDrop 
      ? activeDrop.name 
      : (isFinished
          ? 'Все награды получены ✔'
          : (hasActiveDrops 
              ? 'Раздача активна на Twitch' 
              : 'Ожидание раздачи на Twitch'));

    const gameStatus: 'FARMING' | 'CLAIMED' | 'QUEUED' | 'IDLE' = isCurrentlyActive && activeDrop 
      ? (activeDrop.is_claimed ? 'CLAIMED' : 'FARMING') 
      : (isFinished ? 'CLAIMED' : 'QUEUED');

    const progressPct = isCurrentlyActive && activeDrop 
      ? activeDrop.progress_percent 
      : (isFinished ? 100 : (catalogMatch?.progress_percent || 0));

    campaigns.push({
      name: isCurrentlyActive && activeDrop ? activeDrop.game : gameName,
      drop_name: dropName,
      badge: `${emoji} ${gameName}`,
      icon: emoji,
      box_art: boxArtSources[0],
      box_art_sources: boxArtSources,
      has_drops: hasActiveDrops,
      drops_end_at: catalogMatch?.drops_end_at,
      progress_percent: progressPct,
      current_minutes: isCurrentlyActive && activeDrop ? activeDrop.current_minutes : undefined,
      required_minutes: isCurrentlyActive && activeDrop ? activeDrop.required_minutes : undefined,
      status: gameStatus,
      bgGradient: GAME_GRADIENTS[idx % GAME_GRADIENTS.length]
    });
  });

  // If still empty, populate from live catalog games with active drops
  if (campaigns.length === 0) {
    const liveDropsGames = (allGames || []).filter(g => g.has_drops).slice(0, 4);
    if (liveDropsGames.length > 0) {
      liveDropsGames.forEach((g, idx) => {
        const emoji = getGameEmoji(g.name);
        campaigns.push({
          name: g.name,
          drop_name: `Активная раздача (до ${g.drops_end_at ? new Date(g.drops_end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'скоро'})`,
          badge: `${emoji} ${g.name}`,
          icon: emoji,
          box_art: resolveGameBoxArt(g.name, [g.box_art]),
          progress_percent: 0,
          status: 'QUEUED',
          bgGradient: GAME_GRADIENTS[idx % GAME_GRADIENTS.length]
        });
      });
    } else {
      campaigns.push(...DEFAULT_FALLBACK_CAMPAIGNS);
    }
  }

  // Auto-focus on active farming campaign if user hasn't explicitly clicked another
  const activeFarmIndex = campaigns.findIndex(c => c.status === 'FARMING');
  const activeFarmingCampaign = activeFarmIndex !== -1 ? campaigns[activeFarmIndex] : null;

  // Separate queued campaigns (excluding active farming campaign from lower list to avoid duplication)
  const queuedCampaigns = campaigns.filter(c => {
    if (!activeFarmingCampaign) return true;
    return c.name.toLowerCase() !== activeFarmingCampaign.name.toLowerCase();
  });

  // Sort queued campaigns (by priority or alphabetically)
  const sortedQueuedCampaigns = useMemo(() => {
    const list = [...queuedCampaigns];
    if (shelfSortMode === 'alphabetical') {
      return list.sort((a, b) => a.name.localeCompare(b.name, 'ru-RU', { sensitivity: 'base' }));
    }
    return list;
  }, [queuedCampaigns, shelfSortMode]);

  // Dedicated list of games that currently have ACTIVE Drops on Twitch (strictly has_drops: true)
  const activeTwitchDropsGames = useMemo(() => {
    const list = (allGames || []).filter(g => g.has_drops && g.is_active_now !== false);
    const prioritySet = new Set((settings.priority_games || []).map(p => p.toLowerCase()));

    // Fallback if allGames is still loading or offline
    if (list.length === 0) {
      const fallbackList: GameItem[] = campaigns
        .filter(c => c.has_drops)
        .map(c => ({
          id: c.name.toLowerCase().replace(/\s+/g, '-'),
          name: c.name,
          is_installed: false,
          has_drops: true,
          is_active_now: true,
          box_art: c.box_art,
          box_art_sources: c.box_art_sources,
          progress_percent: c.progress_percent,
        }));
      if (fallbackList.length > 0) return fallbackList;
    }

    return [...list].sort((a, b) => {
      // 1. Forced game stays first
      if (forcedGame) {
        if (a.name.toLowerCase() === forcedGame.toLowerCase()) return -1;
        if (b.name.toLowerCase() === forcedGame.toLowerCase()) return 1;
      }
      // 2. Games in user's priority queue come next
      const aInTop = prioritySet.has(a.name.toLowerCase());
      const bInTop = prioritySet.has(b.name.toLowerCase());
      if (aInTop && !bInTop) return -1;
      if (!aInTop && bInTop) return 1;
      // 3. Alphabetical
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [allGames, settings.priority_games, campaigns, forcedGame]);

  const firstUnclaimedDropIndex = campaigns.findIndex(c => c.status !== 'CLAIMED' && c.has_drops);
  const firstUnclaimedIndex = campaigns.findIndex(c => c.status !== 'CLAIMED');
  const fallbackIndex = firstUnclaimedDropIndex !== -1 
    ? firstUnclaimedDropIndex 
    : (firstUnclaimedIndex !== -1 ? firstUnclaimedIndex : 0);
  const selectedIndex = userSelectedIndex !== null && userSelectedIndex < campaigns.length
    ? userSelectedIndex
    : (activeFarmIndex !== -1 ? activeFarmIndex : fallbackIndex);
  const currentFocus = campaigns[selectedIndex] || campaigns[0];

  const isFocusActive = currentFocus?.status === 'FARMING' || Boolean(
    activeDrop && currentFocus && (
      currentFocus.name.toLowerCase() === activeDrop.game.toLowerCase() ||
      smartGameMatch(currentFocus.name, activeDrop.game)
    )
  );
  const curMin = currentFocus?.current_minutes ?? (isFocusActive ? activeDrop?.current_minutes : undefined);
  const reqMin = currentFocus?.required_minutes ?? (isFocusActive ? activeDrop?.required_minutes : undefined);
  const remainingMin = (reqMin !== undefined && curMin !== undefined)
    ? Math.max(0, reqMin - curMin)
    : (activeDrop && isFocusActive && activeDrop.remaining_seconds
        ? Math.ceil(activeDrop.remaining_seconds / 60)
        : null);

  const handleSelectGame = (idx: number) => {
    playClick();
    setUserSelectedIndex(idx);
  };

  const handleClaim = () => {
    playRewardChime();
    if (onClaimNow) {
      onClaimNow(activeDrop?.id || '');
    }
  };

  // Detect OAuth Device Code only if backend actively requested it in real-time
  const isCurrentlyDemandingAuth = Boolean(
    oauthCode || 
    (statusText && (statusText.includes('🔑') || statusText.toLowerCase().includes('требуется вход')))
  );

  const detectedOAuthCode = isCurrentlyDemandingAuth ? (oauthCode || (() => {
    if (statusText) {
      const match = statusText.match(/код\s+([A-Z0-9]{8})/i) || statusText.match(/\b([A-Z0-9]{8})\b/);
      if (match) return match[1];
    }
    return null;
  })()) : null;

  const handleCopyOAuthCode = () => {
    if (detectedOAuthCode) {
      navigator.clipboard.writeText(detectedOAuthCode);
      playClick();
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleCopyLogs = () => {
    const text = recentLogs.map(l => `[${l.time}] [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    playClick();
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2500);
  };

  const filteredLogs = recentLogs.filter(log => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'WATCH') return log.level === 'WATCH' || log.message.toLowerCase().includes('watching') || log.message.toLowerCase().includes('стример');
    if (logFilter === 'CLAIM') return log.level === 'CLAIM' || log.message.toLowerCase().includes('claimed') || log.message.toLowerCase().includes('трофей');
    if (logFilter === 'CORE') return log.level === 'INFO' || log.level === 'STATUS' || log.level === 'PROGRESS';
    return true;
  });

  const getLogBadge = (level: string) => {
    const lvl = level.toUpperCase();
    if (lvl === 'WATCH') return 'bg-[var(--mint-surface)] text-[var(--mint-core)] border-[var(--border-mint)]';
    if (lvl === 'CLAIM') return 'bg-[var(--status-success)]/15 text-[var(--status-success)] border-[var(--status-success)]/30 font-semibold';
    if (lvl === 'PROGRESS') return 'bg-[var(--mint-surface)] text-[var(--mint-specular)] border-[var(--border-mint)] font-mono';
    if (lvl === 'AUTH' || lvl === 'LOGIN') return 'bg-[var(--status-warning)]/20 text-[var(--status-warning)] border-[var(--status-warning)]/50 font-bold animate-pulse';
    if (lvl === 'WARN' || lvl === 'WARNING') return 'bg-[var(--status-warning)]/15 text-[var(--status-warning)] border-[var(--status-warning)]/30';
    if (lvl === 'ERROR') return 'bg-[var(--status-danger)]/15 text-[var(--status-danger)] border-[var(--status-danger)]/30';
    if (lvl === 'STATUS') return 'bg-white/[0.05] text-[var(--text-secondary)] border-white/[0.08]';
    return 'bg-white/[0.04] text-[var(--text-muted)] border-white/[0.06]';
  };

  return (
    <div className="space-y-6 select-none animate-in fade-in duration-300">
      {/* OAuth Device Code Authorization Banner if required */}
      {detectedOAuthCode && (
        <div className="rounded-2xl p-4.5 bg-[var(--bg-surface-2)] border-2 border-[var(--status-warning)]/60 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-between gap-4 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-amber-500/30 text-amber-300 border border-amber-400/50 shrink-0">
              <KeyRound className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>ТРЕБУЕТСЯ ВХОД В TWITCH (OAUTH DEVICE CODE)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-black font-extrabold">
                  КОД АВТОРИЗАЦИИ
                </span>
              </div>
              <p className="text-xs text-amber-100/90 mt-1 leading-relaxed">
                Twitch запросил подтверждение входа для вашего аккаунта. Введите этот код на открывшейся странице Twitch:
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="font-mono text-xl font-black px-4 py-2 rounded-xl bg-black/70 border border-amber-400/70 text-amber-300 tracking-widest shadow-inner">
              {detectedOAuthCode}
            </div>
            <button
              onClick={handleCopyOAuthCode}
              className="px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedCode ? 'Скопировано!' : 'Копировать код'}
            </button>
            <a
              href={oauthUri || `https://www.twitch.tv/activate?device-code=${detectedOAuthCode}`}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all border border-white/15"
            >
              <ExternalLink className="w-4 h-4" />
              twitch.tv/activate ↗
            </a>
          </div>
        </div>
      )}
      {/* Gaming Auto-Pause Alert if detected */}
      {hardware.is_paused && (
        <div className="rounded-2xl p-4.5 bg-[var(--surface-elevated)] border border-amber-500/30 text-[var(--foreground)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                Hardware Guard: Автопауза фарма
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono font-bold">
                  {hardware.detected_game ? '0% НАГРУЗКИ' : 'АККУМУЛЯТОР'}
                </span>
              </h4>
              <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
                {hardware.detected_game ? (
                  <>
                    Обнаружен процесс: <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded border border-white/10">{hardware.detected_game}</strong>. 
                    Если это системная утилита или фоновый софт, а не игра — снимите паузу в 1 клик:
                  </>
                ) : (
                  <>Устройство работает от аккумулятора. Фоновый сбор приостановлен для экономии заряда.</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {hardware.detected_game && (
              <button
                type="button"
                onClick={handleIgnoreDetectedProcess}
                disabled={isIgnoringProcess}
                className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/40 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                title="Исключить этот процесс из списка паузы навсегда"
              >
                <X className="w-3.5 h-3.5" />
                <span>{isIgnoringProcess ? 'Исключение...' : 'Это не игра (Игнорировать)'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleDaemon}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-[var(--line)] transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Play className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Продолжить сбор</span>
            </button>
          </div>
        </div>
      )}

      {/* Fallback Campaign Notification Banner */}
      {isFallbackFarming && (
        <div className="p-3.5 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--line)] text-white/90 text-xs flex items-center justify-between gap-3 shadow-sm backdrop-blur-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/40 shrink-0">
              <Zap className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <span>Автоматический поиск наград</span>
                <span className="px-1.5 py-0.2 rounded bg-[#368873]/20 text-[var(--accent)] text-[9px] font-mono">
                  Smartbox Auto-Fallback
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-snug">
                В играх из вашего ТОП-приоритета сейчас нет активных раздач на Twitch. Sentinel временно фармит доступную кампанию{' '}
                <strong className="text-[var(--accent)]">{activeDrop?.game}</strong>. Как только для ваших игр запустятся дропы, сбор переключится моментально.
              </p>
            </div>
          </div>
          {onGoToShelf && (
            <button
              onClick={onGoToShelf}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[var(--accent)] hover:text-white font-semibold text-[11px] shrink-0 border border-[var(--line)] transition-all cursor-pointer active:scale-95"
            >
              Выбрать игры →
            </button>
          )}
        </div>
      )}

      {/* ==================== 1. TACTICAL CONTROL STRIP ==================== */}
      <section className="p-3 md:p-3.5 rounded-2xl bg-[var(--bg-surface-1)] border border-[var(--line)] shadow-[0_4px_24px_rgba(0,0,0,0.4)] backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
        {/* Left: Quick Tactical Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Pause / Resume Button */}
          <button
            onClick={() => {
              playClick();
              onToggleDaemon?.();
            }}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center gap-2.5 border transition-all cursor-pointer active:scale-95 ${
              hardware.is_paused
                ? 'bg-gradient-to-r from-[#217C5E] to-[#3AD29F] text-[#050608] border-[#7CE8C2]/50 shadow-[0_0_20px_rgba(58,210,159,0.35)]'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-[var(--foreground)] border-[var(--line)]'
            }`}
            title={hardware.is_paused ? 'Возобновить сбор дропов' : 'Приостановить сбор дропов'}
          >
            {hardware.is_paused ? (
              <>
                <Play className="w-4 h-4 fill-current text-[#050608]" />
                <span>Возобновить сбор</span>
                <span className="px-1.5 py-0.5 rounded-md bg-black/30 text-[10px] font-mono">
                  НА ПАУЗЕ
                </span>
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 text-amber-400" />
                <span>Пауза фарма</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
              </>
            )}
          </button>

          {/* Switch Streamer Button */}
          <button
            onClick={() => {
              playClick();
              setIsRotatingStreamer(true);
              onSwitchStreamer?.(false);
              setTimeout(() => setIsRotatingStreamer(false), 1500);
            }}
            disabled={isRotatingStreamer}
            className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-[var(--foreground)] border border-[var(--line)] flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Переключиться на следующего стримера текущей игры"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[var(--accent)] ${isRotatingStreamer ? 'animate-spin' : ''}`} />
            <span>Сменить стримера 🔀</span>
          </button>

          {/* Open Twitch Stream Button */}
          {(watchingChannel || activeDrop?.channel_name) && (
            <a
              href={`https://twitch.tv/${watchingChannel || activeDrop?.channel_name}`}
              target="_blank"
              rel="noreferrer"
              className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] hover:bg-[#3AD29F]/15 hover:text-[var(--accent)] text-xs font-semibold text-[var(--foreground)] border border-[var(--line)] flex items-center gap-2 transition-all"
              title="Открыть прямую трансляцию в браузере"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Смотреть на Twitch ↗</span>
            </a>
          )}

        </div>

        {/* Right: Golden Claim Ready Drop or Stealth Telemetry Badge */}
        <div className="flex items-center gap-2.5">
          {activeDrop && !activeDrop.is_claimed && (activeDrop.can_claim || activeDrop.progress_percent >= 100 || (activeDrop.required_minutes && activeDrop.current_minutes >= activeDrop.required_minutes)) ? (
            <button
              onClick={handleClaim}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-black font-extrabold text-xs flex items-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.5)] border border-yellow-200 animate-pulse cursor-pointer active:scale-95"
            >
              <Gift className="w-4 h-4 text-black animate-bounce" />
              <span>Забрать готовый дроп! 🎁 ({activeDrop.name})</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-[var(--line)] text-[11px] text-[var(--muted)] font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[#73bba5] font-semibold">Фарм активен</span>
            </div>
          )}
        </div>
      </section>

      {/* Main 3-Column Bento Grid Layout */}
      <div className="bento-grid">
        {/* ==================== LEFT COLUMN: ACTIVE CAMPAIGNS SHELF ==================== */}
        <section 
          onMouseMove={handleCardMouseMove}
          className="bento-card"
        >
          <div className="card-title-row">
            <span className="card-heading">Полка Кампаний ({campaigns.length})</span>
            <button
              onClick={() => {
                playClick();
                const curMode = settings.priority_mode ?? 0;
                const nextMode = curMode === 0 ? 1 : 0;
                onUpdateSettings?.({ priority_mode: nextMode });
              }}
              title="Кликните для переключения стратегии: Только ТОП vs ТОП + Любые активные раздачи Twitch"
              className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 active:scale-95 select-none ${
                (settings.priority_mode ?? 0) === 0
                  ? 'bg-[#368873]/20 text-[var(--accent)] border-[#73bba5]/30 hover:bg-[#368873]/35'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/35'
              }`}
            >
              <span>{(settings.priority_mode ?? 0) === 0 ? '🎯 ТОЛЬКО ТОП' : '⚡ ТОП + ЛЮБЫЕ'}</span>
              <span className="text-[9px] opacity-60">⇄</span>
            </button>
          </div>

          {/* ==================== 1. ACTIVE FARMING HERO CARD ==================== */}
          {activeFarmingCampaign ? (
            <div 
              onClick={() => {
                const idx = campaigns.findIndex(c => c.name.toLowerCase() === activeFarmingCampaign.name.toLowerCase());
                if (idx !== -1) handleSelectGame(idx);
              }}
              className={`active-farming-hero group mb-2.5 p-3 rounded-2xl bg-gradient-to-br from-[#1c2723] via-[#161e1b] to-[#121816] border-2 border-[#3AD29F]/50 shadow-[0_4px_24px_rgba(58,210,159,0.18)] cursor-pointer transition-all hover:border-[#3AD29F] relative overflow-hidden ${
                selectedIndex === campaigns.findIndex(c => c.name.toLowerCase() === activeFarmingCampaign.name.toLowerCase()) ? 'ring-2 ring-[#7CE8C2]/40' : ''
              }`}
            >
              {/* Ambient radial glow */}
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-[#3AD29F]/15 rounded-full blur-2xl pointer-events-none" />

              {/* Top Badge + Channel */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3AD29F] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3AD29F]" />
                  </span>
                  <span className="text-[10.5px] font-black tracking-wider text-[#3AD29F] uppercase font-mono">
                    АКТИВНЫЙ ФАРМ
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono">
                  {watchingChannel || activeDrop?.channel_name ? (
                    <span className="px-1.5 py-0.5 rounded bg-black/50 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1 truncate max-w-[140px]">
                      <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse shrink-0" />
                      <span className="truncate">{watchingChannel || activeDrop?.channel_name}</span>
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[var(--muted)]">
                      Поиск стрима...
                    </span>
                  )}
                </div>
              </div>

              {/* Poster + Details */}
              <div className="flex items-center gap-3">
                <div className="w-[44px] h-[62px] shrink-0 rounded-lg overflow-hidden border border-[#3AD29F]/50 shadow-md relative bg-black/60">
                  <GameBoxArt
                    boxArt={activeFarmingCampaign.box_art}
                    boxArtSources={activeFarmingCampaign.box_art_sources}
                    name={activeFarmingCampaign.name}
                    fallbackEmoji={activeFarmingCampaign.icon}
                    isFarming={true}
                  />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="text-[13.5px] font-extrabold text-white truncate leading-tight" title={activeFarmingCampaign.name}>
                    {activeFarmingCampaign.name}
                  </div>
                  <div className="text-[11px] font-medium text-emerald-200/90 truncate mt-0.5" title={activeFarmingCampaign.drop_name}>
                    🎁 {activeFarmingCampaign.drop_name}
                  </div>

                  {/* Progress bar + minutes */}
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono mb-0.5">
                      <span className="text-[#73bba5] font-bold">
                        {activeFarmingCampaign.current_minutes ?? (activeDrop?.current_minutes || 0)} / {activeFarmingCampaign.required_minutes ?? (activeDrop?.required_minutes || 0)} мин
                      </span>
                      <span className="text-white/95 font-black">
                        {activeFarmingCampaign.progress_percent}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-gradient-to-r from-[#217C5E] via-[#3AD29F] to-[#7CE8C2] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(58,210,159,0.5)]"
                        style={{ width: `${Math.min(100, Math.max(3, activeFarmingCampaign.progress_percent))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-2.5 p-2.5 rounded-xl bg-black/30 border border-white/5 text-[11px] text-[var(--muted)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span>Ожидание активной раздачи в очереди...</span>
              </div>
              <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[var(--muted)]">
                STANDBY
              </span>
            </div>
          )}

          {/* ==================== 2. QUICK SEARCH & ADD ==================== */}
          <div className="relative mb-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/50 border border-[var(--line)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_12px_rgba(115,187,165,0.25)] transition-all">
              <Search className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Найти и добавить игру в фарм..."
                className="bg-transparent border-none outline-none text-xs text-white placeholder-[var(--muted)] w-full py-0.5 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-[var(--muted)] hover:text-white p-0.5 rounded cursor-pointer"
                  title="Очистить"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Search Suggestions Dropdown */}
            {isSearchFocused && searchResults.length > 0 && (
              <div 
                ref={searchDropdownRef}
                className="absolute top-full left-0 right-0 mt-1.5 bg-[#171d1c] border border-[#303a35] rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.85)] z-50 overflow-hidden divide-y divide-white/5 max-h-[300px] overflow-y-auto scrollbar-thin animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-3 py-1 bg-black/60 text-[9.5px] font-mono text-[var(--muted)] flex items-center justify-between">
                  <span>Twitch & Steam ({searchResults.length})</span>
                  <span>Клик для добавления в ТОП</span>
                </div>
                {searchResults.map((item, sIdx) => {
                  const isAlreadyPriority = (settings.priority_games || []).some(
                    pg => pg.toLowerCase() === item.canonical_name.toLowerCase()
                  );
                  return (
                    <div
                      key={`${item.canonical_name}-${sIdx}`}
                      onClick={() => handleAddGameFromSearch(item)}
                      className="p-2 flex items-center justify-between gap-2.5 hover:bg-white/[0.06] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-[28px] h-[38px] shrink-0 rounded overflow-hidden border border-white/10 bg-black/40">
                          <GameBoxArt
                            boxArt={item.box_art}
                            boxArtSources={item.box_art ? [item.box_art] : []}
                            name={item.canonical_name}
                            fallbackEmoji="🎮"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate" title={item.canonical_name}>
                            {item.canonical_name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.has_active_drops ? (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-0.5">
                                <Flame className="w-2.5 h-2.5 text-emerald-400" /> РАЗДАЧА
                              </span>
                            ) : item.is_installed ? (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                💾 ПК
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/5 text-[var(--muted)]">
                                🎮 STEAM
                              </span>
                            )}
                            {item.drops_end_at && (
                              <span className="text-[9px] text-[var(--muted)] truncate">
                                до {new Date(item.drops_end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddGameFromSearch(item);
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                          isAlreadyPriority 
                            ? 'bg-white/5 text-[var(--muted)] border border-white/10'
                            : 'bg-[#368873]/30 hover:bg-[#368873]/50 text-[var(--accent)] border border-[#73bba5]/40'
                        }`}
                      >
                        {isAlreadyPriority ? '✓ В топе' : '+ В топ'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ==================== 3. FILTERS & SORT TOGGLE ==================== */}
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <div className="flex items-center gap-1 p-0.5 bg-black/40 rounded-xl border border-[var(--line)] text-[10px] font-mono flex-1">
              {[
                { id: 'ALL' as const, label: `Все (${sortedQueuedCampaigns.length})` },
                { id: 'QUEUED' as const, label: `В очереди (${sortedQueuedCampaigns.filter(c => c.status !== 'CLAIMED').length})` },
                { id: 'CLAIMED' as const, label: `Собрано (${sortedQueuedCampaigns.filter(c => c.status === 'CLAIMED').length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    playClick();
                    setShelfFilter(tab.id);
                  }}
                  className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer text-center ${
                    shelfFilter === tab.id
                      ? 'bg-[#368873]/30 text-[var(--accent)] border border-[#73bba5]/30 shadow-sm'
                      : 'text-[var(--muted)] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sort Toggle: Priority order vs Alphabetical (A-Z / А-Я) */}
            <button
              onClick={() => {
                playClick();
                setShelfSortMode(prev => prev === 'priority' ? 'alphabetical' : 'priority');
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-[10.5px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                shelfSortMode === 'alphabetical'
                  ? 'bg-[#368873]/25 text-[var(--accent)] border-[#73bba5]/50 shadow-sm'
                  : 'bg-black/40 text-[var(--muted)] hover:text-white border-[var(--line)]'
              }`}
              title={shelfSortMode === 'alphabetical' ? 'Включена сортировка по алфавиту (кликните для ручного приоритета)' : 'Включен ручной приоритет (кликните для сортировки по алфавиту)'}
            >
              {shelfSortMode === 'alphabetical' ? (
                <>
                  <ArrowDownAZ className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>А-Я</span>
                </>
              ) : (
                <>
                  <ArrowUpDown className="w-3.5 h-3.5 text-[var(--muted)]" />
                  <span>ТОП</span>
                </>
              )}
            </button>
          </div>

          {/* ==================== 4. QUEUED CAMPAIGNS LIST ==================== */}
          <div className="shelf-list max-h-[460px] overflow-y-auto pr-1.5 scrollbar-thin">
            {sortedQueuedCampaigns
              .filter(c => {
                if (shelfFilter === 'ALL') return true;
                if (shelfFilter === 'QUEUED') return c.status !== 'CLAIMED';
                if (shelfFilter === 'CLAIMED') return c.status === 'CLAIMED';
                return true;
              })
              .map((camp, idx) => {
                const originalIndex = campaigns.findIndex(c => c.name === camp.name && c.drop_name === camp.drop_name);
                const isActive = originalIndex === selectedIndex;
                const isPriorityGame = (settings.priority_games || []).includes(camp.name);
                const priorityIndex = isPriorityGame ? settings.priority_games.indexOf(camp.name) : -1;

                return (
                  <div
                    key={`${camp.name}-${idx}`}
                    onClick={() => handleSelectGame(originalIndex !== -1 ? originalIndex : idx)}
                    className={`shelf-item ${isActive ? 'active' : ''}`}
                  >
                    <div className="shelf-left min-w-0 flex-1 overflow-hidden">
                      <GameBoxArt 
                        boxArt={camp.box_art}
                        boxArtSources={camp.box_art_sources}
                        name={camp.name} 
                        fallbackEmoji={camp.icon} 
                        isFarming={camp.status === 'FARMING'} 
                      />
                      <div className="shelf-meta min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="shelf-name truncate font-bold text-[13.5px] text-white/95" title={camp.name}>
                            {camp.name}
                          </span>
                          {isPriorityGame && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#217C5E]/30 text-[var(--accent)] border border-[var(--accent)]/30 font-bold shrink-0">
                              #{priorityIndex + 1}
                            </span>
                          )}
                        </div>

                        {camp.has_drops ? (
                          <span className="text-[11px] text-emerald-300/90 flex items-center gap-1 mt-0.5 truncate">
                            <Gift className="w-2.5 h-2.5 text-[#3AD29F] shrink-0" />
                            <span>Раздача на Twitch</span>
                            {camp.drops_end_at && (
                              <span className="text-[10px] text-[var(--muted)]">
                                &bull; до {new Date(camp.drops_end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </span>
                        ) : isPriorityGame ? (
                          <span className="text-[11px] text-[var(--muted)] truncate block mt-0.5">
                            В очереди &bull; ожидание раздачи
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--muted)] truncate block mt-0.5" title={camp.drop_name}>
                            {camp.drop_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {/* Priority Quick Reorder Controls (only shown in Priority Sort mode) */}
                      {onReorderPriority && isPriorityGame && shelfSortMode === 'priority' && (
                        <div 
                          className="flex flex-col bg-black/60 rounded-lg p-0.5 border border-white/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onReorderPriority(camp.name, 'up')}
                            disabled={priorityIndex === 0}
                            className="p-0.5 text-[var(--muted)] hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none rounded cursor-pointer transition-colors"
                            title="Переместить выше в очереди"
                          >
                            <ChevronUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => onReorderPriority(camp.name, 'down')}
                            disabled={priorityIndex === settings.priority_games.length - 1}
                            className="p-0.5 text-[var(--muted)] hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none rounded cursor-pointer transition-colors"
                            title="Переместить ниже в очереди"
                          >
                            <ChevronDown className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      {camp.status === 'CLAIMED' && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-lime-500/15 text-lime-400 border border-lime-500/30 shrink-0">
                          ✓ ЗАБРАН
                        </span>
                      )}
                      {camp.status === 'QUEUED' && camp.has_drops && (
                        <span className="px-2 py-0.5 rounded-lg text-[9.5px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0 flex items-center gap-1" title="На Twitch прямо сейчас идет раздача дропов">
                          <Gift className="w-2.5 h-2.5 text-emerald-400" />
                          РАЗДАЧА
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            {sortedQueuedCampaigns.filter(c => {
                if (shelfFilter === 'ALL') return true;
                if (shelfFilter === 'QUEUED') return c.status !== 'CLAIMED';
                if (shelfFilter === 'CLAIMED') return c.status === 'CLAIMED';
                return true;
              }).length === 0 && (
              <div className="p-5 text-center text-xs text-[var(--muted)] bg-black/20 rounded-xl border border-white/5 my-2">
                {shelfFilter === 'CLAIMED' ? (
                  <div>
                    <div className="text-base mb-1">🎁</div>
                    <div>Список собранных наград пока пуст.</div>
                  </div>
                ) : sortedQueuedCampaigns.some(c => c.status === 'CLAIMED') ? (
                  <div className="space-y-2">
                    <div className="text-base">🎉</div>
                    <div className="font-semibold text-white">Все награды из списка уже получены!</div>
                    <button
                      onClick={() => {
                        playClick();
                        setShelfFilter('CLAIMED');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#368873]/30 text-[var(--accent)] border border-[#73bba5]/40 text-[10.5px] font-bold font-mono transition-all cursor-pointer hover:bg-[#368873]/50"
                    >
                      Посмотреть собранные ({sortedQueuedCampaigns.filter(c => c.status === 'CLAIMED').length})
                    </button>
                  </div>
                ) : (
                  <div>Очередь пуста. Воспользуйтесь поиском выше для добавления игр!</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-auto pt-2.5">
            <button
              onClick={() => {
                playClick();
                onManualRefresh();
              }}
              className="btn-secondary w-full justify-center tactile-press"
            >
              🔍 Синхронизировать Кампании Twitch
            </button>
          </div>
        </section>

        {/* ==================== RIGHT COLUMN: ACTIVE DROP DETAIL & MANUAL FARM ==================== */}
        <div className="flex flex-col gap-[18px]">
          <section 
            onMouseMove={handleCardMouseMove}
            className="bento-card relative overflow-hidden"
          >
            <div className="card-title-row">
              <span className="card-heading flex items-center gap-2">
                <span>Целевая Награда</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-[var(--muted)] border border-white/[0.08]">
                  {currentFocus.status === 'FARMING' 
                    ? '⚡ АКТИВНЫЙ ФАРМ' 
                    : (currentFocus.status === 'CLAIMED' ? '✓ ВСЕ НАГРАДЫ ПОЛУЧЕНЫ' : `ОЧЕРЕДЬ #${selectedIndex + 1}`)}
                </span>
              </span>
              <span className={`text-xs font-mono font-bold flex items-center gap-1.5 ${watchingChannel ? 'text-[#73bba5]' : 'text-amber-400'}`}>
                <span className={`w-2 h-2 rounded-full ${watchingChannel ? 'bg-[#73bba5] animate-pulse' : 'bg-amber-400'}`} />
                {watchingChannel ? 'STREAMLESS LIVE' : 'STANDBY'}
              </span>
            </div>

            {/* Hero Content: Radial Gauge + Loot Details */}
            <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-b from-white/[0.05] to-transparent border border-white/[0.08] relative overflow-hidden">
              {/* Ambient Background Glow */}
              <div 
                className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-25 pointer-events-none"
                style={{ background: 'var(--accent)' }}
              />

              <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
                {/* Radial Progress Ring */}
                <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                  <svg className="w-32 h-32 -rotate-90 transform" viewBox="0 0 120 120">
                    <defs>
                      <linearGradient id="lunaMintGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#217C5E" />
                        <stop offset="60%" stopColor="#3AD29F" />
                        <stop offset="100%" stopColor="#7CE8C2" />
                      </linearGradient>
                    </defs>
                    {/* Background Track */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      className="text-white/[0.06]"
                      strokeWidth="9"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    {/* Glowing Progress Arc */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke="url(#lunaMintGlow)"
                      strokeWidth="9"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={2 * Math.PI * 48 * (1 - Math.min(100, Math.max(2, currentFocus.progress_percent)) / 100)}
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-700 ease-out"
                      style={{ filter: 'drop-shadow(0 0 6px rgba(58, 210, 159, 0.45))' }}
                    />
                  </svg>

                  {/* Center of Ring */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
                    <span className="text-2xl font-black text-white font-mono tracking-tight tabular-nums">
                      {currentFocus.progress_percent}%
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--accent)] font-mono tracking-wide uppercase mt-0.5">
                      {currentFocus.status === 'CLAIMED'
                        ? 'Получено 100%'
                        : (remainingMin !== null 
                            ? (remainingMin > 0 ? `~${remainingMin} мин` : 'Готов!')
                            : (currentFocus.status === 'QUEUED' ? 'В очереди' : 'Ожидание'))}
                    </span>
                  </div>
                </div>

                {/* Loot Details & Rarity Frame */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#368873]/20 border border-[#73bba5]/30 text-[10px] font-bold text-[var(--accent)] tracking-wider uppercase">
                    <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                    <span>Twitch Drops Exclusive</span>
                  </div>

                  <div>
                    <h3 className="text-base md:text-lg font-extrabold text-white leading-snug tracking-tight">
                      {currentFocus.drop_name}
                    </h3>
                    <p className="text-xs text-[var(--muted)] font-medium mt-0.5">
                      Игра: <strong className="text-[var(--foreground)]">{currentFocus.name}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-[11px] font-mono">
                    <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-white">
                      ⏱️ {curMin !== undefined && reqMin !== undefined ? `${curMin} из ${reqMin} мин` : `${currentFocus.progress_percent}%`}
                    </span>
                    {activeDrop?.is_claimed && (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        ✓ Уже в инвентаре
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Interactive Streamer Sub-Card OR Standby Intelligence Card */}
              {!watchingChannel && !activeDrop ? (
                <div className="mt-4 pt-3.5 border-t border-white/[0.08] text-xs">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-bold text-sm shrink-0">
                        ⏳
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-300">Режим ожидания стримеров</span>
                          {settings.priority_mode === 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-200 border border-amber-500/30">
                              ТОЛЬКО ТОП
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
                          {settings.priority_mode === 0
                            ? 'Стримеры с раздачей для ваших приоритетных игр сейчас офлайн. Sentinel проверяет их появление в эфире.'
                            : 'Поиск подходящих стримеров с активными раздачами на Twitch...'}
                        </p>
                      </div>
                    </div>

                    {settings.priority_mode === 0 && onUpdateSettings && (
                      <button
                        onClick={() => {
                          playClick();
                          onUpdateSettings({ priority_mode: 1 });
                        }}
                        className="shrink-0 w-full sm:w-auto px-3 py-2 rounded-xl bg-[#368873]/30 hover:bg-[#368873]/50 text-[var(--accent)] border border-[#73bba5]/40 text-xs font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 shadow-sm"
                        title="Разрешить фармить другие активные игры на Twitch, пока стримеры из ТОПа офлайн"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Включить «ТОП + Любые»</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-3.5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center font-bold font-mono shrink-0">
                      <Tv className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[var(--muted)]">Стример:</span>
                        <strong className="text-white font-mono">{watchingChannel || activeDrop?.channel_name || 'Автономный GQL поток'}</strong>
                        {watchingChannel && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" title="Трансляция активна" />
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--muted)] font-mono">
                        Spade Beacon: каждые 20 сек &bull; 15-чанков HEAD
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {watchingChannel && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(watchingChannel);
                          playClick();
                          setCopiedStreamer(true);
                          setTimeout(() => setCopiedStreamer(false), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-mono text-white/80 border border-white/10 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                        title="Скопировать никнейм стримера"
                      >
                        {copiedStreamer ? <Check className="w-3 h-3 text-[#73bba5]" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedStreamer ? 'Скопирован' : 'Ник'}</span>
                      </button>
                    )}
                    {(watchingChannel || activeDrop?.channel_name) && (
                      <a
                        href={`https://twitch.tv/${watchingChannel || activeDrop?.channel_name}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-[#368873]/20 hover:bg-[#3AD29F]/30 text-[10px] font-mono text-[var(--accent)] border border-[#73bba5]/30 flex items-center gap-1 transition-all"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Стрим ↗</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Row */}
            <div className="action-row mt-4">
              <button 
                onClick={handleClaim}
                className="btn-claim tactile-press"
              >
                <Gift className="w-4.5 h-4.5 text-white" />
                <span>Забрать Полученный Дроп</span>
              </button>

              <button 
                onClick={() => {
                  playClick();
                  if (onGoToSettings) {
                    onGoToSettings();
                  } else if (onGoToShelf) {
                    onGoToShelf();
                  }
                }}
                className="btn-secondary tactile-press"
              >
                <Settings className="w-4 h-4 text-[#94a3b8]" />
                <span>Настройки</span>
              </button>
            </div>
          </section>

          {/* ==================== MANUAL GAME FARM OVERRIDE CARD ==================== */}
          <section
            onMouseMove={handleCardMouseMove}
            className={`bento-card relative overflow-hidden transition-all duration-300 ${
              forcedGame ? 'border-[#73bba5]/50 shadow-[0_0_24px_rgba(58,210,159,0.12)]' : ''
            }`}
          >
            <div className="card-title-row">
              <div className="flex flex-col gap-0.5">
                <span className="card-heading flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${forcedGame ? 'text-[#73bba5] animate-pulse' : 'text-amber-400'}`} />
                  <span>Фарм вне очереди (Ручной фокус)</span>
                </span>
                <span className="text-[10px] text-[#8b9a94] font-medium pl-6">
                  Выбрать игру для фарма ▾
                </span>
              </div>

              {forcedGame ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#368873]/30 text-[#73bba5] border border-[#73bba5]/40 font-bold flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#73bba5]" />
                    <span>ФОКУС АКТИВЕН</span>
                  </span>
                  <button
                    onClick={handleResetManualFocus}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10.5px] font-bold font-mono transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Вернуться к стандартной автоматической ротации очереди"
                  >
                    <X className="w-3 h-3 text-rose-400" />
                    <span>Сбросить фокус / В авто</span>
                  </button>
                </div>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-[#8b9a94] border border-white/[0.08] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Стандартная авто-очередь ТОП</span>
                </span>
              )}
            </div>

            {/* Explanatory Distinction Tip */}
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-2.5 text-[11px] leading-relaxed">
              <span className="text-amber-400 text-xs shrink-0 mt-0.5">💡</span>
              <p className="text-[#8b9a94]">
                <strong className="text-white">Отличие от стандарта:</strong> Стандартный режим автоматически перебирает игры из вашего ТОПа. <strong className="text-[#73bba5]">Ручной фокус</strong> переключает бота на выбранную игру немедленно и фармит только её до упора, даже если её нет в вашем списке.
              </p>
            </div>

            {/* Active Forced Focus Banner */}
            {forcedGame && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#202725] via-[#1a2420] to-[#171d1c] border border-[#73bba5]/50 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#368873]/25 border border-[#73bba5]/40 text-[#73bba5] flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 animate-pulse text-[#73bba5]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                      <span>⚡ ПРИНУДИТЕЛЬНЫЙ ФОКУС: {forcedGame.toUpperCase()}</span>
                    </div>
                    <p className="text-[11px] text-[#8b9a94] truncate mt-0.5">
                      Ротация очереди на паузе. Sentinel фармит только эту игру до получения всех наград.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetManualFocus}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold border border-white/20 transition-all cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3 h-3 text-amber-300" />
                  <span>В авто</span>
                </button>
              </div>
            )}

            {/* Search Input for fast filtering */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-[#303a35] focus-within:border-[#73bba5]/60 transition-all">
              <Search className="w-3.5 h-3.5 text-[#8b9a94] shrink-0" />
              <input
                type="text"
                value={pickerSearchQuery}
                onChange={(e) => setPickerSearchQuery(e.target.value)}
                placeholder="Быстрый поиск среди активных раздач Twitch..."
                className="w-full bg-transparent text-xs text-white placeholder-[#8b9a94] outline-none font-medium"
              />
              {pickerSearchQuery && (
                <button
                  onClick={() => setPickerSearchQuery('')}
                  className="text-[#8b9a94] hover:text-white p-0.5 rounded cursor-pointer"
                  title="Очистить поиск"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Game Cards Grid — ONLY ACTIVE TWITCH DROPS GAMES */}
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
              {activeTwitchDropsGames
                .filter(g => !pickerSearchQuery || g.name.toLowerCase().includes(pickerSearchQuery.toLowerCase()))
                .slice(0, 10)
                .map((game) => {
                  const isCurrentForced = forcedGame?.toLowerCase() === game.name.toLowerCase();
                  const isInTop = (settings.priority_games || []).some(
                    pg => pg.toLowerCase() === game.name.toLowerCase()
                  );
                  const activeCamp = campaigns.find(c => c.name.toLowerCase() === game.name.toLowerCase());
                  const progressPct = activeCamp?.progress_percent ?? (game.progress_percent ?? 0);

                  return (
                    <div
                      key={game.id || game.name}
                      onClick={() => handleForceFarmGame(game.name)}
                      className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all active:scale-[0.99] ${
                        isCurrentForced
                          ? 'bg-[#368873]/20 border-[#73bba5] shadow-[0_0_12px_rgba(58,210,159,0.15)]'
                          : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.06] hover:border-white/15'
                      }`}
                      title={isCurrentForced ? 'Эта игра уже фармится принудительно' : `Кликните, чтобы принудительно запустить фарм ${game.name} вне очереди`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-10 rounded-md overflow-hidden shrink-0 bg-black/40 border border-white/10">
                          <GameBoxArt
                            boxArt={game.box_art}
                            boxArtSources={game.box_art_sources}
                            name={game.name}
                            fallbackEmoji="🎮"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold truncate ${isCurrentForced ? 'text-[#73bba5]' : 'text-white'}`}>
                              {game.name}
                            </span>
                            {isInTop && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold shrink-0" title="Игра уже в вашем списке приоритетов ТОП">
                                ⭐ ТОП
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#8b9a94] flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[#73bba5] font-semibold">{progressPct}% готово</span>
                            {game.rewards_count ? (
                              <>
                                <span className="opacity-40">•</span>
                                <span>{game.rewards_count} наград</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isCurrentForced ? (
                          <span className="text-[10px] font-bold text-[#73bba5] px-2.5 py-1 rounded-lg bg-[#368873]/30 border border-[#73bba5]/50 flex items-center gap-1">
                            <Check className="w-3 h-3 text-[#73bba5]" />
                            <span>Фармится</span>
                          </span>
                        ) : (
                          <span className="text-[10.5px] font-bold text-[#73bba5] px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-[#368873]/25 border border-white/10 hover:border-[#73bba5]/40 transition-all flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span>Вне очереди</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Expand Full Catalog Button */}
            <div className="pt-1">
              <button
                onClick={() => {
                  playClick();
                  setShowFullCatalogModal(true);
                }}
                className="btn-secondary w-full justify-center tactile-press"
              >
                <span>Развернуть все активные раздачи на Twitch ({activeTwitchDropsGames.length}) ↗</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ==================== LIVE ACTIVITY & COMMAND CONSOLE ==================== */}
      <div className="console-wrapper mt-7">
        {isTerminalCollapsed ? (
          /* Collapsed 1-Line Stealth Ticker */
          <section 
            onMouseMove={handleCardMouseMove}
            className="bento-card p-3.5 rounded-2xl bg-[#0b0e13]/95 border border-white/[0.08] shadow-lg backdrop-blur-xl flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-[var(--mint-surface)] border border-[var(--border-mint)] flex items-center justify-center">
                  <Terminal className="w-3.5 h-3.5 text-[var(--accent)]" />
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-xs font-mono text-white/90 truncate flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.06] text-[var(--muted)] border border-white/10 uppercase font-semibold">
                  Журнал
                </span>
                {recentLogs.length > 0 ? (
                  <>
                    <span className="text-[#64748b]">[{recentLogs[recentLogs.length - 1].time}]</span>
                    <span className="text-[var(--accent)] font-bold">[{recentLogs[recentLogs.length - 1].level}]</span>
                    <span className="text-[#cbd5e1] truncate">{recentLogs[recentLogs.length - 1].message}</span>
                  </>
                ) : (
                  <span className="text-[#64748b]">Sentinel активен: фоновый сбор дропов в штатном режиме...</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-[#64748b] hidden sm:inline">
                Канал: <strong className="text-[var(--accent)]">{watchingChannel || activeDrop?.channel_name || 'Авто'}</strong>
              </span>
              <button
                onClick={() => {
                  playClick();
                  setIsTerminalCollapsed(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[var(--foreground)] border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                title="Развернуть полный терминал с логами"
              >
                <span>Развернуть журнал</span>
                <ChevronUp className="w-3.5 h-3.5 text-[var(--accent)]" />
              </button>
            </div>
          </section>
        ) : (
          /* Full Expanded Terminal Console */
          <section 
            onMouseMove={handleCardMouseMove}
            className="bento-card border border-white/[0.1] bg-[#090c10]/95 shadow-[0_16px_48px_rgba(0,0,0,0.6)] backdrop-blur-2xl rounded-2xl overflow-hidden p-0 animate-in fade-in duration-200"
          >
            {/* Terminal Title Bar */}
            <div className="px-4 py-3 bg-white/[0.03] border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/40 shadow-sm" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/40 shadow-sm" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/40 shadow-sm" />
                </div>
                <div className="h-4 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-xs font-bold text-white font-mono tracking-wider">
                    ЖУРНАЛ ОПЕРАЦИЙ & СИСТЕМНЫЕ СОБЫТИЯ
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/30 flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#73bba5] animate-ping" />
                  LIVE STREAMLESS
                </span>
              </div>

              {/* Terminal Controls */}
              <div className="flex items-center gap-2">
                {/* Filter Pills */}
                <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-[var(--line)] text-[10px] font-mono">
                  {(['ALL', 'WATCH', 'CLAIM', 'CORE'] as const).map(filter => (
                    <button
                      key={filter}
                      onClick={() => {
                        playClick();
                        setLogFilter(filter);
                      }}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        logFilter === filter
                          ? 'bg-[#368873]/30 text-[var(--accent)] shadow-sm'
                          : 'text-[var(--muted)] hover:text-white'
                      }`}
                    >
                      {filter === 'ALL' ? 'Все' : filter === 'WATCH' ? 'Стримы' : filter === 'CLAIM' ? 'Трофеи' : 'Ядро'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    playClick();
                    setAutoScroll(!autoScroll);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    autoScroll 
                      ? 'bg-[#368873]/20 text-[var(--accent)] border-[#73bba5]/40' 
                      : 'bg-white/5 text-white/40 border-white/10'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? 'bg-[#3AD29F] animate-pulse' : 'bg-white/30'}`} />
                  Автоскролл
                </button>

                <button
                  onClick={handleCopyLogs}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                >
                  {copiedLog ? <Check className="w-3 h-3 text-[#73bba5]" /> : <Copy className="w-3 h-3" />}
                  {copiedLog ? 'Скопировано!' : 'Копировать'}
                </button>

                <button
                  onClick={() => {
                    playClick();
                    setIsTerminalCollapsed(true);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title="Свернуть консоль в компактную статусную полоску"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Свернуть</span>
                </button>
              </div>
            </div>

            {/* Live Streamer & Watchdog Telemetry Strip */}
            <div className="px-4 py-2.5 bg-black/60 border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
              <div className="flex items-center gap-3">
                <span className="text-[#64748b]">Текущий канал:</span>
                <span className="text-[var(--accent)] font-bold flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-[#3AD29F]" />
                  {watchingChannel || activeDrop?.channel_name || 'Поиск активных каналов...'}
                </span>
                <span className="text-white/20">|</span>
                <span className="text-[#64748b]">Игра:</span>
                <span className="text-white font-bold">
                  {activeDrop?.game || 'Ожидание'}
                </span>
                {activeDrop && (
                  <>
                    <span className="text-white/20">|</span>
                    <span className="text-[#64748b]">Прогресс:</span>
                    <span className="text-[#3AD29F] font-bold">
                      {activeDrop.current_minutes}/{activeDrop.required_minutes} мин ({activeDrop.progress_percent}%)
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#64748b]">Состояние:</span>
                <span className="text-amber-200/90 font-medium">
                  {watchdogStatus || statusText || 'Работа в штатном режиме'}
                </span>
              </div>
            </div>

            {/* Console Log Stream */}
            <div 
              ref={terminalEndRef}
              className="p-4 max-h-72 min-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px] leading-relaxed bg-[#05070a]/95 select-text"
            >
              {filteredLogs.length === 0 ? (
                <div className="py-8 text-center text-[#64748b] italic">
                  {recentLogs.length === 0
                    ? 'Инициализация консоли... Ожидание событий от службы Sentinel...'
                    : 'Нет записей для выбранного фильтра.'}
                </div>
              ) : (
                filteredLogs.map((log, index) => {
                  const badgeClass = getLogBadge(log.level);
                  return (
                    <div key={index} className="flex items-start gap-2.5 hover:bg-white/[0.04] py-1 px-2 rounded-lg transition-colors group">
                      <span className="text-[#475569] shrink-0 font-mono text-[10px] select-none pt-0.5">
                        {log.time}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold shrink-0 border uppercase tracking-wider ${badgeClass}`}>
                        {log.level}
                      </span>
                      <span className="text-[#cbd5e1] break-all leading-normal group-hover:text-white transition-colors">
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>

      {/* ==================== FULL CATALOG MODAL ==================== */}
      {showFullCatalogModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 md:p-6 animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[85vh] bg-[#171d1c] border border-[#303a35] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#303a35] flex items-center justify-between bg-[#202725]">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Активные раздачи Twitch Drops</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30">
                    {activeTwitchDropsGames.length} игр в эфире
                  </span>
                </h2>
                <p className="text-xs text-[#8b9a94] mt-1">
                  Каталог игр Twitch & Steam — только игры с активными раздачами прямо сейчас на Twitch
                </p>
              </div>

              <button
                onClick={() => {
                  playClick();
                  setShowFullCatalogModal(false);
                }}
                className="p-2 rounded-xl bg-[#28322e] text-[#8b9a94] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 bg-[#171d1c] border-b border-[#303a35]">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#202725] border border-[#303a35]">
                <Search className="w-4 h-4 text-[#8b9a94]" />
                <input
                  type="text"
                  value={catalogSearchQuery}
                  onChange={(e) => setCatalogSearchQuery(e.target.value)}
                  placeholder="Поиск по названию игры среди активных раздач (Rust, Hitman, Rainbow Six, AION 2)..."
                  className="w-full bg-transparent text-sm text-white placeholder-[#8b9a94] outline-none font-medium"
                  autoFocus
                />
              </div>
            </div>

            {/* Games Grid */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 scrollbar-thin">
              {activeTwitchDropsGames
                .filter(g => !catalogSearchQuery || g.name.toLowerCase().includes(catalogSearchQuery.toLowerCase()))
                .map((game) => {
                  const isCurrentForced = forcedGame?.toLowerCase() === game.name.toLowerCase();
                  const isInTop = (settings.priority_games || []).some(
                    pg => pg.toLowerCase() === game.name.toLowerCase()
                  );

                  return (
                    <div
                      key={game.id || game.name}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        isCurrentForced
                          ? 'bg-[#368873]/15 border-[#73bba5] shadow-[0_0_16px_rgba(58,210,159,0.2)]'
                          : 'bg-[#202725] border-[#303a35] hover:border-[#73bba5]/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 rounded-xl overflow-hidden shrink-0 bg-black/40 border border-white/10">
                          <GameBoxArt
                            boxArt={game.box_art}
                            boxArtSources={game.box_art_sources}
                            name={game.name}
                            fallbackEmoji="🎮"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate" title={game.name}>
                            {game.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                              🔥 АКТИВНЫЙ ДРОП
                            </span>
                            {isInTop && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                ⭐ ТОП
                              </span>
                            )}
                          </div>
                          {game.rewards_count ? (
                            <div className="text-[10px] text-[#8b9a94] mt-1">
                              Доступно наград: <strong className="text-white font-mono">{game.rewards_count}</strong>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <button
                        onClick={() => handleForceFarmGame(game.name)}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold shadow transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
                          isCurrentForced
                            ? 'bg-[#368873] text-white border border-[#73bba5]/50'
                            : 'bg-[#368873] hover:bg-[#2d7462] text-white'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{isCurrentForced ? 'Фармится сейчас' : 'Фармить сейчас'}</span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
