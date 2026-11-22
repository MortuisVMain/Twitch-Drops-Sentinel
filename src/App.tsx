import React, { useState, useEffect, useMemo, useRef } from 'react';

import { NavTab, UpdateCheckResult, UpdateProgressStatus } from './types';

import { LiveDashboard } from './components/LiveDashboard';

import { GameShelf } from './components/GameShelf';

import { GiveawaysView } from './components/GiveawaysView';
import { SteamIdleView } from './components/SteamIdleView';

import { SettingsStudio } from './components/SettingsStudio';

import { ScreenDimmerView } from './components/ScreenDimmerView';

import { LiquidCanvas } from './components/LiquidCanvas';
import { PhotoBackdrop } from './components/PhotoBackdrop';
import { AppearancePanel } from './components/AppearancePanel';

import { HelpModal } from './components/HelpModal';
import { HistoryModal } from './components/HistoryModal';
import { CommandPalette } from './components/CommandPalette';
import { PipMiniDeck } from './components/PipMiniDeck';
import { useModalFocus } from './hooks/useModalFocus';
import { resolveGameBoxArt } from './utils/gameBoxArts';

import { useTactileAudio } from './hooks/useTactileAudio';

import { useSentinelState } from './hooks/useSentinelState';
import { visibleTabs, dimmerModuleMessage } from './utils/tabVisibility.mjs';
import { tabDigit, tabForDigit, digitRange, titleWithDigit, digitHotkeyAllowed } from './utils/tabHotkeys.mjs';
import { useConsoleLogs } from './hooks/useConsoleLogs';
import { useHeaderFit } from './hooks/useHeaderFit';

import {
  Check, ChevronRight, CircleHelp, Copy, History, Ellipsis, Gamepad2, Gift, Hourglass,
  LayoutDashboard, Minus, Moon, Palette, Pause, PictureInPicture2, Play,
  RefreshCw, Settings, Square,
} from 'lucide-react';

import { 

  AlertTriangle, 

  Sparkles, 

  X, 

  RotateCw,

  Search,

  Command,

  Monitor,

  Flame,

  Layers,

  Cpu,


  Sliders,

  ShieldAlert,

  Volume2,

  VolumeX

} from 'lucide-react';



interface TabErrorBoundaryProps {

  children: React.ReactNode;

  fallbackTab: () => void;

}



interface TabErrorBoundaryState {

  hasError: boolean;

  error?: Error;

}



class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {

  constructor(props: TabErrorBoundaryProps) {

    super(props);

    this.state = { hasError: false };

  }



  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {

    return { hasError: true, error };

  }



  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {

    console.error("Sentinel TabErrorBoundary caught an error:", error, errorInfo);

  }



  handleReset = () => {

    this.setState({ hasError: false, error: undefined });

    this.props.fallbackTab();

  };



  render() {

    if (this.state.hasError) {

      return (

        <div className="card p-8 md:p-12 text-center max-w-lg mx-auto my-12 border border-rose-500/30 bg-[var(--bg-island)] space-y-4">

          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">

            <AlertTriangle className="w-6 h-6" aria-hidden="true" focusable="false" />

          </div>

          <h3 className="text-base font-bold text-[var(--text-primary)]">Временная ошибка отображения вкладки</h3>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">

            {this.state.error?.message || 'Произошел сбой при отрисовке содержимого.'}

          </p>

          <div className="pt-2 flex items-center justify-center gap-3">

            <button

              onClick={this.handleReset}

              className="px-4 py-2.5 rounded-xl bg-[var(--led-mint)] hover:opacity-90 text-[var(--cta-text)] text-xs font-semibold shadow-sm transition-all cursor-pointer"

            >

              Вернуться в Дашборд

            </button>

          </div>

        </div>

      );

    }

    return this.props.children;

  }

}



// Twitch Drops Sentinel • Author: Mortuis_V / Mortuis_V_Studio

const UPDATE_POLL_MS = 30 * 60 * 1000;

/** Hide the PiP cover and show its emoji fallback. */

// Not a Tailwind class: the row's own hover background would otherwise hide it

export const App: React.FC = () => {

  const [selectedTab, setSelectedTab] = useState<NavTab>('dashboard');

  const [giveawaysReadinessRequested, setGiveawaysReadinessRequested] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [showCmdPalette, setShowCmdPalette] = useState(false);

  const [cmdSearch, setCmdSearch] = useState('');
  const [cmdIndex, setCmdIndex] = useState<number | null>(null); // null: the user has not moved yet, the default rule applies
  const cmdDialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(showCmdPalette, cmdDialogRef, () => setShowCmdPalette(false), 'input');
  useEffect(() => setCmdIndex(null), [cmdSearch, showCmdPalette]);
  useEffect(() => {
    cmdDialogRef.current?.querySelector('[data-cmd-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cmdIndex, cmdSearch, showCmdPalette]);



  // Dual-Engine Theme & Backdrop Settings (LocalStorage + Settings sync)

  const [theme, setTheme] = useState<string>(() => localStorage.getItem('sentinel_theme') || 'titanium');

  const [backdropType, setBackdropType] = useState<string>(() => localStorage.getItem('sentinel_backdrop_type') || '3d');

  const [reliefMode, setReliefMode] = useState<string>(() => localStorage.getItem('sentinel_relief_mode') || 'hex-magma');

  const [reliefOpacity, setReliefOpacity] = useState<number>(() => {

    const val = localStorage.getItem('sentinel_relief_opacity');

    return val ? parseFloat(val) : 0.85;

  });

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const headerRef = useHeaderFit();

  const [isPipMode, setIsPipMode] = useState(false);

  const [isTopMost, setIsTopMost] = useState(false);

  const [isNightGuard, setIsNightGuard] = useState(false);

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);



  useEffect(() => {

    const handleWebMsg = (e: any) => {

      const msg = e.data || (typeof e === 'object' && e);

      if (msg?.type === 'WINDOW_STATE_CHANGED') {

        const isMax = Boolean(msg.isMaximized);

        setIsWindowMaximized(isMax);

        document.body.classList.toggle('window-maximized', isMax);

      }

    };

    window.addEventListener('message', handleWebMsg);

    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.addEventListener === 'function') {

      wv.addEventListener('message', handleWebMsg);

    }

    return () => {

      window.removeEventListener('message', handleWebMsg);

      if (wv && typeof wv.removeEventListener === 'function') {

        wv.removeEventListener('message', handleWebMsg);

      }

    };

  }, []);



  const { playClick, playRewardChime, isMuted, toggleMute } = useTactileAudio();



  const showToast = (msg: string) => {

    setToastMessage(msg);

    setTimeout(() => {

      setToastMessage(null);

    }, 4000);

  };



  const {

    sentinelState,

    confirmedSettings,

    isScanning,

    handleTogglePriority,

    handleToggleExclude,

    handleUpdateSettings,

    handleClaimNow,

    handleManualRefresh,

    lastSyncAt,

    handleOpenVaultFile,

    handleRescanGames,

    handleToggleDaemon,

    handleSwitchStreamer,

    handleReorderPriority,

    handleForceFarm,

    handleCancelForceFarm,

    handleBanStreamer,

    handleUnbanStreamer,

    handleToggleUserLinked,

    connectionPhase,

  } = useSentinelState(showToast, playRewardChime, playClick);
  // A tab the user turned off in Settings is never shown, whatever was selected; the state then falls back to the Dashboard
  const shownTabs = visibleTabs(sentinelState.settings);
  const shownTabsKey = shownTabs.join(',');
  const activeTab: NavTab = shownTabs.includes(selectedTab) ? selectedTab : 'dashboard';
  useEffect(() => {
    if (selectedTab !== activeTab) setSelectedTab(activeTab);
  }, [selectedTab, activeTab]);
  // The desktop host keeps the Dimmer hotkeys and overlays only while the tab is on: tell it the first answer and every
  // change, from the settings the service confirmed (a save that failed never reaches the host)
  const dimmerSentRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const message = dimmerModuleMessage(confirmedSettings, sentinelState.connected, dimmerSentRef.current);
    if (!message) return;
    const wv = (window as any).chrome?.webview;
    if (wv && typeof wv.postMessage === 'function') wv.postMessage(message);
    dimmerSentRef.current = message.enabled; // without a host (browser) there is nobody to tell
  }, [confirmedSettings, sentinelState.connected]);
  const { logs: consoleLogs, historyFailed: logHistoryFailed } = useConsoleLogs(sentinelState.log_seq, sentinelState.log_session, sentinelState.recent_logs);



  // Apply theme to HTML root

  useEffect(() => {

    document.documentElement.setAttribute('data-theme', theme);

    document.documentElement.style.setProperty('--relief-opacity', reliefOpacity.toString());

  }, [theme, reliefOpacity]);



  const handleApplyTheme = (newTheme: string) => {

    playClick();

    setTheme(newTheme);

    localStorage.setItem('sentinel_theme', newTheme);

    handleUpdateSettings({ ui_theme: newTheme as any });

    showToast(`Активирована тема: ${newTheme.toUpperCase()}`);

  };



  const handleApplyBackdrop = (bType: string, rMode: string, label: string) => {

    playClick();

    setBackdropType(bType);

    setReliefMode(rMode);

    localStorage.setItem('sentinel_backdrop_type', bType);

    localStorage.setItem('sentinel_relief_mode', rMode);

    handleUpdateSettings({ 

      ui_backdrop_type: bType as any,

      ui_relief_mode: rMode as any

    });

    showToast(`Задник шасси: ${label}`);

  };



  const handleUpdateReliefIntensity = (val: number) => {

    const op = val / 100;

    setReliefOpacity(op);

    localStorage.setItem('sentinel_relief_opacity', op.toString());

    handleUpdateSettings({ ui_relief_opacity: val });

  };



  // Toggle PIP Mode

  const handleTogglePipMode = () => {

    playClick();

    const nextPip = !isPipMode;

    setIsPipMode(nextPip);
    setIsTopMost(nextPip);

    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.postMessage === 'function') {

      wv.postMessage({ type: 'SET_PIP_MODE', enabled: nextPip });

    }

    showToast(nextPip ? 'Выделенный мини-кокпит PIP активирован' : 'Стандартный оконный режим');

  };



  // Toggle Topmost in PIP

  const handleToggleTopMost = () => {

    playClick();

    const nextTop = !isTopMost;

    setIsTopMost(nextTop);

    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.postMessage === 'function') {

      wv.postMessage({ type: 'SET_TOPMOST', enabled: nextTop });

    }

  };



  // Toggle 1-Click Night Guard

  const handleToggleNightGuard = () => {

    playClick();

    const nextNight = !isNightGuard;

    setIsNightGuard(nextNight);

    if (nextNight) {

      setReliefOpacity(0.20);

      handleUpdateSettings({ 

        pause_on_battery: true,

        ui_sound_enabled: false 

      });

      showToast('Ночной режим активирован: затемнение задника, тишина ALPS');

    } else {

      setReliefOpacity(0.85);

      showToast('Дневной режим восстановлен');

    }

  };



  // GitHub Auto-Updater State & Lifecycle

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const [updateCheckFailure, setUpdateCheckFailure] = useState<string | null>(null);

  const announcedUpdateRef = useRef<string | null>(null);

  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const updateDialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(showUpdateModal && !!updateInfo, updateDialogRef, () => setShowUpdateModal(false));

  const [isApplyingUpdate, setIsApplyingUpdate] = useState<boolean>(false);

  const [updateProgress, setUpdateProgress] = useState<UpdateProgressStatus | null>(null);

  const [updateInstalled, setUpdateInstalled] = useState<boolean>(false);



  const checkUpdates = async (force: boolean = false) => {

    try {

      const res = await fetch(`http://127.0.0.1:28492/api/updates/check?force=${force ? '1' : '0'}`);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: UpdateCheckResult = await res.json();

      setUpdateInfo(data);

      setUpdateCheckFailure(data.error || null);

      // A periodic check announces each version once, so it never reopens a dismissed window
      if (data.update_available && (force || announcedUpdateRef.current !== data.remote_version)) {

        announcedUpdateRef.current = data.remote_version;

        setShowUpdateModal(true);

      }

      return data;

    } catch (err) {

      console.warn('Could not check for updates:', err);
      setUpdateCheckFailure(err instanceof Error ? err.message : String(err));
      throw err;

    }

  };

  const handleManualCheckUpdates = async () => {
    try {
      const result = await checkUpdates(true);
      if (result.error) {
        showToast(`Не удалось проверить обновления: ${result.error}`);
      } else if (!result.update_available) {
        showToast(`Установлена актуальная версия ${result.local_version}`);
      }
    } catch (error) {
      showToast(`Не удалось проверить обновления: ${error instanceof Error ? error.message : String(error)}`);
    }
  };



  useEffect(() => {

    const pollUpdates = () => { void checkUpdates(false).catch(() => {}); };

    const onVisibilityChange = () => { if (document.visibilityState === 'visible') pollUpdates(); };

    pollUpdates();

    const timer = setInterval(pollUpdates, UPDATE_POLL_MS);

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {

      clearInterval(timer);

      document.removeEventListener('visibilitychange', onVisibilityChange);

    };

  }, []);



  const handleRestartApp = async () => {

    playClick();

    showToast('Перезапуск Sentinel...');

    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.postMessage === 'function') {

      wv.postMessage({ type: 'RESTART_SENTINEL' });

      return;

    }

    try {

      await fetch('http://127.0.0.1:28492/api/restart', { method: 'POST' });

      setTimeout(() => window.location.reload(), 1500);

    } catch { }

  };



  const handleApplyUpdate = async () => {

    if (!updateInfo?.download_url) return;

    setIsApplyingUpdate(true);

    setUpdateProgress(null);

    playClick();



    const progressPoll = setInterval(async () => {

      try {

        const pRes = await fetch('http://127.0.0.1:28492/api/updates/status');

        if (pRes.ok) {

          const pData: UpdateProgressStatus = await pRes.json();

          setUpdateProgress(pData);

        }

      } catch {}

    }, 400);

    try {

      const res = await fetch('http://127.0.0.1:28492/api/updates/apply', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          download_url: updateInfo.download_url,

          asset_api_url: updateInfo.asset_api_url,

        }),

      });

      const data = await res.json();

      if (data.status === 'ok') {

        playRewardChime();

        setUpdateInstalled(true);

        showToast('Обновление успешно установлено! Нажмите «Перезапустить сейчас».');

        checkUpdates(true);

      } else {

        showToast(`Ошибка обновления: ${data.message}`);

      }

    } catch (err: any) {

      showToast(`Сбой при обновлении: ${err.message || err}`);

    } finally {

      clearInterval(progressPoll);

      setIsApplyingUpdate(false);

    }

  };



  // WebView2 Native Message Listener (Folder selection from native dialog)

  useEffect(() => {

    const handleWebMessage = async (event: any) => {

      try {

        const raw = event.data;

        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

        if (data && data.type === 'FOLDER_SELECTED' && data.path) {

          showToast(`Добавление библиотеки: ${data.path}`);

          const res = await fetch('http://127.0.0.1:28492/api/game-directories/add', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ path: data.path }),

          });

          if (res.ok) {

            handleManualRefresh();

            showToast(`Библиотека подключена: ${data.path}`);

          }

        }

      } catch (err) {

        console.error('Failed to handle web message:', err);

      }

    };



    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.addEventListener === 'function') {

      wv.addEventListener('message', handleWebMessage);

      return () => {

        wv.removeEventListener('message', handleWebMessage);

      };

    }

  }, [handleManualRefresh]);



  // Global Keyboard Shortcuts (digits for the visible tabs, Ctrl+K for Palette, Ctrl+M for PIP)

  useEffect(() => {

    const handleKeyDown = (e: KeyboardEvent) => {

      // Don't trigger shortcuts if typing in input

      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {

        if (e.key === 'Escape') setShowCmdPalette(false);

        return;

      }



      if (e.key !== 'Escape' && document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const digitTab = digitHotkeyAllowed(e) ? tabForDigit(shownTabs, e.key) : null; // 1..N follow the visible tabs in header order

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {

        e.preventDefault();

        setShowCmdPalette((prev) => !prev);

      } else if (e.altKey && e.key === 'Backspace') {

        e.preventDefault();

        if (sentinelState.forced_game) void handleCancelForceFarm();

      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {

        e.preventDefault();

        handleTogglePipMode();

      } else if (digitTab) {

        handleTabChange(digitTab);

      } else if (e.key === 'F5') {

        e.preventDefault();

        handleManualRefresh();

      } else if (e.key === 'Escape') {

        setShowHelpModal(false);

        setShowCmdPalette(false);

        setShowThemeMenu(false);

      }

    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);

  }, [handleManualRefresh, handleCancelForceFarm, isPipMode, sentinelState.forced_game, shownTabsKey]);



  // Sync PIP mode with document.body

  useEffect(() => {

    if (isPipMode) {

      document.body.classList.add('pip-active-body');

    } else {

      document.body.classList.remove('pip-active-body');

    }

    return () => {

      document.body.classList.remove('pip-active-body');

    };

  }, [isPipMode]);



  const handleHeaderMouseDown = (e: React.MouseEvent) => {

    if (e.button === 0) {

      if ((e.target as HTMLElement).closest('button, a, input, select, [role="button"], .theme-dropdown-menu, .master-rocker-wrap, .win-btn, .device-badge')) {

        return;

      }

      const wv = (window as any).chrome?.webview;

      if (wv && typeof wv.postMessage === 'function') {

        wv.postMessage({ type: 'DRAG_WINDOW' });

      }

    }

  };



  const handleHeaderDoubleClick = (e: React.MouseEvent) => {

    if ((e.target as HTMLElement).closest('button, a, input, select, [role="button"], .theme-dropdown-menu, .master-rocker-wrap, .win-btn')) {

      return;

    }

    if (!isPipMode) {

      handleWindowControl('maximize');

    }

  };



  const handleWindowControl = (action: 'minimize' | 'maximize' | 'close') => {

    playClick();

    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.postMessage === 'function') {

      wv.postMessage({ type: 'WINDOW_CONTROL', action });

    }

  };



  // Close dropdown on outside click

  useEffect(() => {

    const closeMenu = () => { setShowThemeMenu(false); setShowMoreMenu(false); };

    if (showThemeMenu || showMoreMenu) {

      window.addEventListener('click', closeMenu);

      return () => window.removeEventListener('click', closeMenu);

    }

  }, [showThemeMenu, showMoreMenu]);



  const handleTabChange = (tab: NavTab) => {

    playClick();

    setSelectedTab(tab);

    setGiveawaysReadinessRequested(false);

    window.scrollTo({ top: 0, behavior: 'smooth' });

  };



  const activeDrop = sentinelState.active_drop;

  const progressPct = activeDrop?.progress_percent || 0;

  const activeGameBoxArt = useMemo(() => {
    if (!activeDrop?.game) return undefined;
    const match = sentinelState.all_catalog_games?.find(
      (g) => g.name.toLowerCase() === activeDrop.game.toLowerCase()
    );
    return resolveGameBoxArt(activeDrop.game, [activeDrop.game_box_art, match?.box_art]);
  }, [activeDrop?.game, activeDrop?.game_box_art, sentinelState.all_catalog_games]);





  return (

    <div 

      className={`field-chassis ${isPipMode ? 'pip-mode' : ''}`} 

      id="chassis" 

      data-theme={theme} 

      data-backdrop={backdropType}

    >

      {/* LAYER 1A: 3D NORMAL-LIT CANVAS ENGINE */}

      {/* The mini window mounts no backdrop: crisp (LCD) text and zero GPU use; leaving PiP remounts both. */}
      {!isPipMode && (

        <LiquidCanvas 

          backdropType={backdropType as any} 

          reliefMode={reliefMode as any} 

          themeId={theme} 

          opacity={reliefOpacity} 

        />

      )}

      <PhotoBackdrop photoId={backdropType === 'photo' && !isPipMode ? reliefMode : null} themeId={theme} opacity={reliefOpacity} />



      {/* LAYER 1B: 2D CLASSIC FLAT VECTOR PATTERNS */}

      <div className={`flat-2d-backdrop ${backdropType.startsWith('2d-') ? backdropType : ''}`}></div>



      {/* LAYER 2: OPTICAL VIGNETTE & DEPTH LENS */}

      <div className="chassis-optical-vignette"></div>



      {/* Precision CNC Hex Bolts on corners */}

      <div className="hex-bolt tl"></div>

      <div className="hex-bolt tr"></div>

      <div className="hex-bolt bl"></div>

      <div className="hex-bolt br"></div>



      {/* ==================== CONSOLE HEADER ==================== */}

      <header ref={headerRef} className="console-header" onMouseDown={handleHeaderMouseDown} onDoubleClick={handleHeaderDoubleClick}>

        <div 

          className="brand-block drag-handle" 

          title="Зажмите левую кнопку мыши для перемещения окна"

        >

          <div 

            className="device-badge cursor-pointer"

            onClick={(e) => { e.stopPropagation(); handleTabChange('dashboard'); }}

            title="Перейти в Дашборд"

          >

            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>

            </svg>

            <div className="pulse-dot"></div>

          </div>

          <div className="brand-title">

            <h1>

              <span className="brand-name-full">Sentinel Field-Deck</span>

              <span className="brand-name-short">Sentinel</span>

            </h1>


          </div>

        </div>



        {/* 5 Center Deck Tabs with live numerical badges */}

        <nav className="deck-tabs">

          <button 

            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} 

            onClick={() => handleTabChange('dashboard')}
            title={titleWithDigit('Дашборд', tabDigit(shownTabs, 'dashboard'))}

          >

            <span className="tab-ico"><LayoutDashboard className="ui-icon" aria-hidden="true" focusable="false" /></span><span className="tab-label">Дашборд</span>

            <span className="badge-num">LIVE</span>

          </button>

{shownTabs.includes('shelf') && (
          <button 

            className={`tab-btn ${activeTab === 'shelf' ? 'active' : ''}`} 

            onClick={() => handleTabChange('shelf')}
            title={titleWithDigit('Полка игр', tabDigit(shownTabs, 'shelf'))}

          >

            <span className="tab-ico"><Gamepad2 className="ui-icon" aria-hidden="true" focusable="false" /></span><span className="tab-label">Полка Игр</span>

            {connectionPhase !== 'starting' && <span className="badge-num" title="Игр, установленных на этом ПК">{sentinelState.installed_games.length}</span>}

          </button>
)}

{shownTabs.includes('giveaways') && (
          <button 

            className={`tab-btn ${activeTab === 'giveaways' ? 'active' : ''}`} 

            onClick={() => handleTabChange('giveaways')}
            title={titleWithDigit('Бесплатные раздачи', tabDigit(shownTabs, 'giveaways'))}

          >

            <span className="tab-ico"><Gift className="ui-icon" aria-hidden="true" focusable="false" /></span><span className="tab-label">Раздачи</span>

          </button>
)}

{shownTabs.includes('steamidle') && (
          <button

            className={`tab-btn ${activeTab === 'steamidle' ? 'active' : ''}`}

            onClick={() => handleTabChange('steamidle')}
            title={titleWithDigit('Steam IDLE: фарм карточек', tabDigit(shownTabs, 'steamidle'))}

          >

            <span className="tab-ico"><Hourglass className="ui-icon" aria-hidden="true" focusable="false" /></span><span className="tab-label">Steam IDLE</span>

          </button>
)}

{shownTabs.includes('dimmer') && (
          <button 

            className={`tab-btn ${activeTab === 'dimmer' ? 'active' : ''}`} 

            onClick={() => handleTabChange('dimmer')}
            title={titleWithDigit('Диммер мониторов: DDC/CI', tabDigit(shownTabs, 'dimmer'))}

          >

            <span className="tab-ico"><Monitor className="ui-icon" aria-hidden="true" focusable="false" /></span><span className="tab-label">Диммер</span>


          </button>
)}

          <button 

            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} 

            onClick={() => handleTabChange('settings')}
            title={titleWithDigit('Настройки: 10 систем Sentinel', tabDigit(shownTabs, 'settings'))}

          >

            <span className="tab-ico"><Settings className="ui-icon" aria-hidden="true" focusable="false" /></span><span className="tab-label">Настройки</span>


          </button>

        </nav>



        {/* Generous Flexible Header Drag Bar */}

        <div 

          className="header-drag-zone" data-overflow-ok 

          onMouseDown={handleHeaderMouseDown} 

          onDoubleClick={handleHeaderDoubleClick}

          title="Зажмите для перемещения окна / двойной клик для разворачивания"

        />




        {/* Header Action Tools */}

        <div className="header-actions">

          {updateInfo?.update_available && (

            <button

              onClick={() => setShowUpdateModal(true)}

              className="tactile-btn active-mint pip-hide animate-pulse"

              title={`Обновление доступно: v${updateInfo.remote_version}`}
              aria-label={`Обновление доступно: v${updateInfo.remote_version}`}

            >

              <Sparkles className="ui-icon" aria-hidden="true" focusable="false" /><span className="upd-text"> v{updateInfo.remote_version}</span>

            </button>

          )}



          <button 

            className="tactile-btn cmd-palette-btn pip-hide" 

            onClick={() => { playClick(); setShowCmdPalette(true); }} 

            title="Палитра быстрых команд (Ctrl+K)"

          >

            <Search className="w-3.5 h-3.5 inline" aria-hidden="true" focusable="false" /><span className="ml-1">Ctrl+K</span>

          </button>



          {isPipMode && (
            <button 
  
              className={`tactile-btn ${isPipMode ? 'active-mint' : ''}`} 
  
              id="pipToggleBtn" 
  
              onClick={handleTogglePipMode} 
  
              title={isPipMode ? "Вернуться в стандартный оконный режим (Ctrl+M)" : "Выделенный мини-кокпит PIP для второго монитора (Ctrl+M)"}
  
            >
  
              <PictureInPicture2 className="ui-icon" aria-hidden="true" focusable="false" /><span>{isPipMode ? 'В ОКНО' : 'PIP'}</span>
  
            </button>
          )}






          <div className="header-more-wrap pip-hide">
            <button
              className={`tactile-btn ${showMoreMenu ? 'active-mint' : ''}`}
              id="moreMenuBtn"
              onClick={(e) => { e.stopPropagation(); playClick(); setShowThemeMenu(false); setShowMoreMenu(!showMoreMenu); }}
              title="Ещё: мини-окно, ночной режим, тема, звук"
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              aria-label="Дополнительные действия"
            >
              <span><Ellipsis className="ui-icon" aria-hidden="true" focusable="false" /></span>
              {isNightGuard && <span className="more-night" title="Ночной режим включён" aria-label="Ночной режим включён"><Moon className="ui-icon" aria-hidden="true" focusable="false" /></span>}
            </button>
            <div className={`more-menu ${showMoreMenu ? 'open' : ''}`} role="menu" onClick={(e) => e.stopPropagation()}>
              <button className="more-item more-item-palette" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); setShowCmdPalette(true); }}>
                <span><Search className="ui-icon" aria-hidden="true" focusable="false" /> Быстрые команды</span>
                <span className="more-hint">Ctrl+K</span>
              </button>
              <button className="more-item" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); handleTogglePipMode(); }}>
                <span><PictureInPicture2 className="ui-icon" aria-hidden="true" focusable="false" /> Мини-окно (PIP)</span>
                <span className="more-hint">Ctrl+M</span>
              </button>
              <button className="more-item" role="menuitemcheckbox" aria-checked={isNightGuard} onClick={() => { playClick(); handleToggleNightGuard(); }}>
                <span><Moon className="ui-icon" aria-hidden="true" focusable="false" /> Ночной режим</span>
                <span className="more-check">{isNightGuard && <Check className="ui-icon" aria-hidden="true" focusable="false" />}</span>
              </button>
              <button className="more-item" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); setShowHistory(true); }}>
                <span><History className="ui-icon" aria-hidden="true" focusable="false" /> История и статистика</span>
              </button>
              <button className="more-item more-item-help" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); setShowHelpModal(true); }}>
                <span><CircleHelp className="ui-icon" aria-hidden="true" focusable="false" /> Справка и горячие клавиши</span>
              </button>
              <button className="more-item" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); setShowThemeMenu(true); }}>
                <span><Palette className="ui-icon" aria-hidden="true" focusable="false" /> Тема</span>
                <span className="more-hint"><ChevronRight className="ui-icon" aria-hidden="true" focusable="false" /></span>
              </button>
              <button
                className="more-item"
                role="menuitemcheckbox"
                aria-checked={!isMuted}
                onClick={() => { toggleMute(); showToast(!isMuted ? 'Звук интерфейса выключен' : 'Звук интерфейса включён'); }}
              >
                <span>{isMuted ? <VolumeX className="ui-icon" aria-hidden="true" focusable="false" /> : <Volume2 className="ui-icon" aria-hidden="true" focusable="false" />} Звук интерфейса: {isMuted ? 'выкл' : 'вкл'}</span>
                <span className="more-check">{!isMuted && <Check className="ui-icon" aria-hidden="true" focusable="false" />}</span>
              </button>
            </div>
          <div className="theme-dropdown-wrap pip-hide" id="themeDropdownWrap">
            <AppearancePanel
              open={showThemeMenu}
              theme={theme}
              backdropType={backdropType}
              reliefMode={reliefMode}
              reliefOpacity={reliefOpacity}
              onTheme={handleApplyTheme}
              onBackdrop={handleApplyBackdrop}
              onOpacity={handleUpdateReliefIntensity}
            />
          </div>






          </div>
          <button 

            className="tactile-btn help-btn pip-hide" 

            onClick={() => { playClick(); setShowHelpModal(true); }}
            title="База знаний и горячие клавиши"
            aria-label="База знаний и горячие клавиши"

          >

            <span>?</span>

          </button>



          <div className="master-rocker-wrap" title="Главный тумблер фонового демона">

            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-engraved)' }}>

              FARM

            </span>

            <button
              type="button"
              role="switch"
              aria-checked={!sentinelState.hardware.is_paused}
              aria-label="Главный тумблер фарма"
              className={`power-rocker ${!sentinelState.hardware.is_paused ? 'on' : ''}`}
              onClick={handleToggleDaemon}
            >
              <span className="power-rocker-thumb"></span>
            </button>

          </div>



        </div>



        {/* WINDOW CONTROLS (Frameless Luxury Desktop Chrome) - DIRECT SIBLING, ALWAYS PINNED */}

        <div className="window-controls-pod pip-hide">

          <button 

            className="win-btn win-min" 

            onClick={(e) => { e.stopPropagation(); handleWindowControl('minimize'); }} 

            title="Свернуть окно"

          >

            <Minus size={12} aria-hidden="true" focusable="false" />

          </button>

          <button 

            className="win-btn win-max" 

            onClick={(e) => { e.stopPropagation(); handleWindowControl('maximize'); }} 

            title={isWindowMaximized ? "Восстановить окно" : "Развернуть на весь экран"}

          >

            {isWindowMaximized ? (

              <Copy size={12} aria-hidden="true" focusable="false" />

            ) : (

              <Square size={12} aria-hidden="true" focusable="false" />

            )}

          </button>

          <button 

            className="win-btn win-close" 

            onClick={(e) => { e.stopPropagation(); handleWindowControl('close'); }} 

            title="Свернуть в системный трей (Фарм продолжается)"

          >

            <X size={12} aria-hidden="true" focusable="false" />

          </button>

        </div>

      </header>



      {/* ==================== DEDICATED PIP MINI-DECK HUD ==================== */}
      <PipMiniDeck
        activeDrop={activeDrop}
        activeGameBoxArt={activeGameBoxArt}
        progressPct={progressPct}
        watchingChannel={sentinelState.watching_channel}
        isTopMost={isTopMost}
        onHeaderMouseDown={handleHeaderMouseDown}
        onToggleTopMost={handleToggleTopMost}
        onSwitchStreamer={handleSwitchStreamer}
        onBanStreamer={handleBanStreamer}
      />



      {/* ==================== MAIN WORKSPACE ==================== */}

      <main className="main-stage">

        <TabErrorBoundary fallbackTab={() => handleTabChange('dashboard')}>

          {activeTab === 'dashboard' && (

            <LiveDashboard
              activeDrop={sentinelState.active_drop}

              hardware={sentinelState.hardware}

              stats={sentinelState.stats}

            connected={sentinelState.connected}

              connectionPhase={connectionPhase}

              settings={sentinelState.settings}

              statusText={sentinelState.status_text}

              watchingChannel={sentinelState.watching_channel}

              recentLogs={consoleLogs}

              logHistoryFailed={logHistoryFailed}

              watchdogStatus={sentinelState.watchdog_status}

              oauthCode={sentinelState.oauth_code}

              oauthUri={sentinelState.oauth_uri}

              rewardCampaigns={sentinelState.reward_campaigns}
              rewardWatching={sentinelState.reward_watching ?? null}

              onToggleAutoShutdown={() =>

                handleUpdateSettings({

                  auto_shutdown_on_complete: !sentinelState.settings.auto_shutdown_on_complete,

                })

              }

              onSelectShutdownMode={(mode) =>

                handleUpdateSettings({

                  auto_shutdown_mode: mode,

                })

              }

              allGames={sentinelState.all_catalog_games}
              trophies={sentinelState.trophies}

              forcedGame={sentinelState.forced_game}

              onForceFarm={handleForceFarm}

              onCancelForceFarm={handleCancelForceFarm}

              onAddToPriority={handleTogglePriority}

              onRemoveFromPriority={handleTogglePriority}

              onManualRefresh={handleManualRefresh}

              onGoToShelf={() => handleTabChange('shelf')}

              onGoToSettings={() => handleTabChange('settings')}

              onClaimNow={(dropId) => handleClaimNow(dropId)}

              onToggleDaemon={handleToggleDaemon}

              onSwitchStreamer={handleSwitchStreamer}

              onReorderPriority={handleReorderPriority}

              onUpdateSettings={handleUpdateSettings}

              onBanStreamer={handleBanStreamer}

              availableChannels={sentinelState.available_channels}

            />

          )}



          {activeTab === 'shelf' && (

            <GameShelf

              games={sentinelState.all_catalog_games}

              priorityList={sentinelState.settings.priority_games}

              excludedList={sentinelState.settings.excluded_games}

              ignoredGames={sentinelState.ignored_games}

              trophies={sentinelState.trophies}

              forcedGame={sentinelState.forced_game}

              onForceFarm={handleForceFarm}

              onCancelForceFarm={handleCancelForceFarm}

              onAddToPriority={(name) => handleTogglePriority(name)}

              onRemoveFromPriority={(name) => handleTogglePriority(name)}

              onAddToExcluded={(name) => handleToggleExclude(name)}

              onRemoveFromExcluded={(name) => handleToggleExclude(name)}

              onReorderPriority={handleReorderPriority}

              onRescanGames={handleRescanGames}

              onManualRefresh={handleManualRefresh}

              lastSyncAt={lastSyncAt}
              rewardCampaigns={sentinelState.settings.reward_campaigns_enabled === true ? sentinelState.reward_campaigns : undefined}
              hiddenRewardList={sentinelState.settings.hidden_reward_campaigns}
              rewardCategories={sentinelState.settings.reward_campaign_categories}
              rewardWatchingId={sentinelState.reward_watching?.id ?? null}
              onUpdateSettings={handleUpdateSettings}

              onShowToast={showToast}

              onBack={() => handleTabChange('dashboard')}

              onOpenVaultFile={handleOpenVaultFile}

              userLinkedGames={sentinelState.settings?.user_linked_games || []}

              onToggleUserLinked={handleToggleUserLinked}

            />

          )}



          {activeTab === 'giveaways' && (

            <GiveawaysView

              onBackToDashboard={() => handleTabChange('dashboard')}

              settings={sentinelState.settings}

              onUpdateSettings={handleUpdateSettings}

              appVersion={sentinelState.version || updateInfo?.local_version}

              openReadinessOnMount={giveawaysReadinessRequested}

            />

          )}



          {activeTab === 'steamidle' && <SteamIdleView appVersion={sentinelState.version || updateInfo?.local_version} onOpenGiveawaysReadiness={shownTabs.includes('giveaways') ? () => { handleTabChange('giveaways'); setGiveawaysReadinessRequested(true); } : undefined} />}



          {activeTab === 'dimmer' && (

            <ScreenDimmerView

              onBackToDashboard={() => handleTabChange('dashboard')}

              showToast={showToast}

            />

          )}



          {activeTab === 'settings' && (

            <SettingsStudio

              settings={sentinelState.settings}

              stats={sentinelState.stats}

              username={sentinelState.username}
              userId={sentinelState.user_id}

              installedCount={sentinelState.installed_games.length}

              onUpdateSettings={handleUpdateSettings}

              onRescanGames={handleRescanGames}

              isScanning={isScanning}

              onBack={() => handleTabChange('dashboard')}

              onOpenVaultFile={handleOpenVaultFile}

              onUnbanStreamer={handleUnbanStreamer}
              onCheckUpdates={handleManualCheckUpdates}
              updateInfo={updateInfo}
              updateCheckFailure={updateCheckFailure}
              updateProgress={updateProgress}
              appVersion={sentinelState.version || updateInfo?.local_version}
            />

          )}

        </TabErrorBoundary>

      </main>



      {/* ==================== COMMAND PALETTE MODAL (Ctrl+K) ==================== */}
      {showCmdPalette && (() => {
        const query = cmdSearch.toLowerCase().trim();

        const navActions = [
          { id: 'dashboard', icon: LayoutDashboard, title: 'Дашборд', action: () => handleTabChange('dashboard') },
          { id: 'shelf', icon: Gamepad2, title: 'Полка игр', action: () => handleTabChange('shelf') },
          { id: 'giveaways', icon: Gift, title: 'Раздачи', action: () => handleTabChange('giveaways') },
          { id: 'steamidle', icon: Hourglass, title: 'Steam IDLE', action: () => handleTabChange('steamidle') },
          { id: 'dimmer', icon: Monitor, title: 'Диммер', action: () => handleTabChange('dimmer') },
          { id: 'settings', icon: Settings, title: 'Настройки', action: () => handleTabChange('settings') },
        ].filter(item => (shownTabs as string[]).includes(item.id))
          .map(item => ({ ...item, key: tabDigit(shownTabs, item.id) ?? '' }))
          .filter(item => !query || item.title.toLowerCase().includes(query) || item.key === query);

        const quickActions = [
          { id: 'switch-streamer', icon: RefreshCw, title: 'Сменить стримера', action: () => handleSwitchStreamer(false) },
          { id: 'refresh-twitch', key: 'F5', icon: RefreshCw, title: 'Обновить данные Twitch', action: () => handleManualRefresh() },
          { id: 'toggle-daemon', icon: sentinelState.hardware.is_paused ? Play : Pause, title: sentinelState.hardware.is_paused ? 'Запустить сбор дропов' : 'Приостановить сбор дропов', action: () => handleToggleDaemon() },
          { id: 'toggle-pip', key: 'Ctrl+M', icon: PictureInPicture2, title: isPipMode ? 'Вернуться из мини-окна (PIP)' : 'Мини-окно (PIP)', action: () => handleTogglePipMode() },
          { id: 'toggle-night', icon: Moon, title: isNightGuard ? 'Выключить ночной режим' : 'Включить ночной режим', action: () => handleToggleNightGuard() },
          { id: 'open-theme', icon: Palette, title: 'Выбрать тему оформления', action: () => setShowThemeMenu(true) },
          { id: 'toggle-sound', icon: isMuted ? VolumeX : Volume2, title: isMuted ? 'Включить звук интерфейса' : 'Выключить звук интерфейса', action: () => { toggleMute(); showToast(!isMuted ? 'Звук интерфейса выключен' : 'Звук интерфейса включён'); } },
          { id: 'open-help', icon: CircleHelp, title: 'Справка и горячие клавиши', action: () => setShowHelpModal(true) },
          { id: 'open-history', icon: History, title: 'История и статистика', action: () => setShowHistory(true) },
        ].filter(item => !query || item.title.toLowerCase().includes(query) || (item.key || '').toLowerCase().includes(query));

        const matchingGames = (sentinelState?.all_catalog_games || [])
          .filter(g => query && g.name.toLowerCase().includes(query))
          .slice(0, 5);

        const focusGame = (game: { name: string }) => {
          handleForceFarm(game.name);
          handleTabChange('dashboard');
          showToast(`Фокус: ${game.name}`);
        };
        return (
          <CommandPalette
            dialogRef={cmdDialogRef}
            search={cmdSearch}
            onSearchChange={setCmdSearch}
            cmdIndex={cmdIndex}
            onIndexChange={setCmdIndex}
            onClose={() => setShowCmdPalette(false)}
            navActions={navActions}
            quickActions={quickActions}
            matchingGames={matchingGames}
            onFocusGame={focusGame}
          />
        );
      })()}

      {/* Tactile Toast Notification */}

      {toastMessage && (

        <div className="hud-toast" role="status">

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            <Sparkles size={14} style={{ color: 'var(--led-mint)' }} aria-hidden="true" focusable="false" />

            <span>{toastMessage}</span>

          </div>

          <button 

            onClick={() => setToastMessage(null)} 

            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}

          >

            <X size={14} aria-hidden="true" focusable="false" />

          </button>

        </div>

      )}



      {/* Help Modal */}

      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} trophies={sentinelState.trophies || []} />
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} activeTab={activeTab} dimmerEnabled={shownTabs.includes('dimmer')} digitRange={digitRange(shownTabs)} />



      {/* GitHub Auto-Updater Modal */}

      {showUpdateModal && updateInfo && (

        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">

          <div
            ref={updateDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-title"
            tabIndex={-1}
            className="titanium-island max-w-lg w-full p-6 md:p-8 space-y-5 relative outline-none"
          >

            <button

              aria-label="Закрыть"

              onClick={() => setShowUpdateModal(false)}

              className="absolute top-4 right-4 p-1.5 rounded-[var(--radius-md)] hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"

            >

              <X size={18} aria-hidden="true" focusable="false" />

            </button>



            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--led-mint)]/20 border border-[var(--led-mint)]/40 flex items-center justify-center text-[var(--led-mint)]">

                <Sparkles size={20} aria-hidden="true" focusable="false" />

              </div>

              <div>

                <h3 id="update-title" className="text-base font-bold text-[var(--text-primary)]">

                  Доступно обновление v{updateInfo.remote_version}

                </h3>

                <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">

                  Текущая версия: v{sentinelState.version || '3.11.0'}

                </p>

              </div>

            </div>



            {updateInfo.release_notes && (

              <div className="obsidian-well p-4 text-[length:var(--fs-xs)] space-y-2 max-h-48 overflow-y-auto">

                <div className="font-semibold text-[var(--text-primary)]">Что нового:</div>

                <div className="text-[var(--text-muted)] whitespace-pre-line leading-relaxed">

                  {updateInfo.release_notes}

                </div>

              </div>

            )}



            {updateProgress && (

              <div className="space-y-1.5">

                <div className="flex justify-between text-[length:var(--fs-xs)] text-[var(--text-muted)]">

                  <span>{updateProgress.error_message || updateProgress.stage}</span>
                  <span className="tabular text-[var(--led-mint)]">{updateProgress.percent}%</span>

                </div>

                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">

                  <div 

                    className="h-full bg-[var(--led-mint)] transition-all duration-300" 

                    style={{ width: `${updateProgress.percent}%` }}

                  />

                </div>

              </div>

            )}



            <div className="flex justify-end gap-3 pt-2">

              <button

                onClick={() => setShowUpdateModal(false)}

                className="tactile-btn"

              >

                Позже

              </button>

              {updateInstalled ? (

                <button

                  onClick={handleRestartApp}

                  className="chunky-cta"

                >

                  Перезапустить сейчас

                </button>

              ) : (

                <button

                  onClick={handleApplyUpdate}

                  disabled={isApplyingUpdate}

                  className="chunky-cta disabled:opacity-50"

                >

                  {isApplyingUpdate ? 'Установка...' : 'Установить обновление'}

                </button>

              )}

            </div>

          </div>

        </div>

      )}

    </div>

  );

};
