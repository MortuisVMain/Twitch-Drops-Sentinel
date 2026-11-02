import React, { useState, useEffect, useMemo } from 'react';

import { NavTab, UpdateCheckResult, UpdateProgressStatus } from './types';

import { LiveDashboard } from './components/LiveDashboard';

import { GameShelf } from './components/GameShelf';

import { GiveawaysView } from './components/GiveawaysView';

import { SettingsStudio } from './components/SettingsStudio';

import { ScreenDimmerView } from './components/ScreenDimmerView';

import { LiquidCanvas } from './components/LiquidCanvas';
import { PhotoBackdrop, PHOTO_BACKDROPS, photoBackdropUrl } from './components/PhotoBackdrop';

import { HelpModal } from './components/HelpModal';
import { resolveGameBoxArt } from './utils/gameBoxArts';

import { useTactileAudio } from './hooks/useTactileAudio';

import { useSentinelState } from './hooks/useSentinelState';

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

  Radio,

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

            <AlertTriangle className="w-6 h-6" />

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



// Twitch Drops Sentinel v7.0 • Author: Mortuis_V / Mortuis_V_Studio

export const App: React.FC = () => {

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showHelpModal, setShowHelpModal] = useState(false);

  const [showCmdPalette, setShowCmdPalette] = useState(false);

  const [cmdSearch, setCmdSearch] = useState('');



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

  } = useSentinelState(showToast, playRewardChime, playClick);



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

    showToast(`✓ Активирована тема: ${newTheme.toUpperCase()}`);

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

    showToast(`✓ Задник шасси: ${label}`);

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

    const wv = (window as any).chrome?.webview;

    if (wv && typeof wv.postMessage === 'function') {

      wv.postMessage({ type: 'SET_PIP_MODE', enabled: nextPip });

    }

    showToast(nextPip ? '📐 Выделенный мини-кокпит PIP активирован' : '📐 Стандартный оконный режим');

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

      showToast('🌙 Ночной режим активирован: затемнение задника, тишина ALPS');

    } else {

      setReliefOpacity(0.85);

      showToast('☀️ Дневной режим восстановлен');

    }

  };



  // GitHub Auto-Updater State & Lifecycle

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  const [isApplyingUpdate, setIsApplyingUpdate] = useState<boolean>(false);

  const [updateProgress, setUpdateProgress] = useState<UpdateProgressStatus | null>(null);

  const [updateInstalled, setUpdateInstalled] = useState<boolean>(false);



  const checkUpdates = async (force: boolean = false) => {

    try {

      const res = await fetch(`http://127.0.0.1:28492/api/updates/check?force=${force ? '1' : '0'}`);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: UpdateCheckResult = await res.json();

      setUpdateInfo(data);

      if (data.update_available) {

        setShowUpdateModal(true);

      }

      return data;

    } catch (err) {

      console.warn('Could not check for updates:', err);
      throw err;

    }

  };

  const handleManualCheckUpdates = async () => {
    try {
      const result = await checkUpdates(true);
      if (!result.update_available) {
        showToast(`Установлена актуальная версия ${result.local_version}`);
      }
    } catch (error) {
      showToast(`Не удалось проверить обновления: ${error instanceof Error ? error.message : String(error)}`);
    }
  };



  useEffect(() => {

    void checkUpdates(false).catch(() => {});

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

        showToast('✨ Обновление успешно установлено! Нажмите «Перезапустить сейчас».');

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



  // Global Keyboard Shortcuts (1-5 for tabs, Ctrl+K for Palette, Ctrl+M for PIP)

  useEffect(() => {

    const handleKeyDown = (e: KeyboardEvent) => {

      // Don't trigger shortcuts if typing in input

      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {

        if (e.key === 'Escape') setShowCmdPalette(false);

        return;

      }



      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {

        e.preventDefault();

        setShowCmdPalette((prev) => !prev);

      } else if (e.altKey && e.key === 'Backspace') {

        e.preventDefault();

        if (sentinelState.forced_game) void handleCancelForceFarm();

      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {

        e.preventDefault();

        handleTogglePipMode();

      } else if (e.key === '1') {

        handleTabChange('dashboard');

      } else if (e.key === '2') {

        handleTabChange('shelf');

      } else if (e.key === '3') {

        handleTabChange('giveaways');

      } else if (e.key === '4') {

        handleTabChange('dimmer');

      } else if (e.key === '5') {

        handleTabChange('settings');

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

  }, [handleManualRefresh, handleCancelForceFarm, isPipMode, sentinelState.forced_game]);



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

    setActiveTab(tab);

    window.scrollTo({ top: 0, behavior: 'smooth' });

  };



  const activeDrop = sentinelState.active_drop;

  const progressPct = activeDrop?.progress_percent || 0;

  const circumference = 188;

  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

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

      <LiquidCanvas 

        backdropType={backdropType as any} 

        reliefMode={reliefMode as any} 

        themeId={theme} 

        opacity={reliefOpacity} 

      />

      <PhotoBackdrop photoId={backdropType === 'photo' ? reliefMode : null} themeId={theme} opacity={reliefOpacity} />



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

      <header className="console-header" onMouseDown={handleHeaderMouseDown} onDoubleClick={handleHeaderDoubleClick}>

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

              <span className="brand-name-short">Sentinel</span>{' '}

              <span className="version-chip version-pro" id="headerThemeBadge">

                {sentinelState?.version || updateInfo?.local_version || 'v7.0'} <span className="relief-chip-full">{backdropType === '3d' ? '3D-RELIEF' : 'FLAT-2D'}</span><span className="relief-chip-short">{backdropType === '3d' ? '3D' : '2D'}</span>

              </span>

            </h1>


          </div>

        </div>



        {/* 5 Center Deck Tabs with live numerical badges */}

        <nav className="deck-tabs">

          <button 

            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} 

            onClick={() => handleTabChange('dashboard')}
            title="Дашборд"

          >

            <span className="tab-ico">⊞</span><span className="tab-label">Дашборд</span>

            <span className="badge-num">LIVE</span>

          </button>

          <button 

            className={`tab-btn ${activeTab === 'shelf' ? 'active' : ''}`} 

            onClick={() => handleTabChange('shelf')}
            title="Полка игр"

          >

            <span className="tab-ico">🎮</span><span className="tab-label">Полка Игр</span>

            <span className="badge-num" title="Игр, установленных на этом ПК">{sentinelState.installed_games.length}</span>

          </button>

          <button 

            className={`tab-btn ${activeTab === 'giveaways' ? 'active' : ''}`} 

            onClick={() => handleTabChange('giveaways')}
            title="Бесплатные раздачи"

          >

            <span className="tab-ico">🎁</span><span className="tab-label">Раздачи</span>

          </button>

          <button 

            className={`tab-btn ${activeTab === 'dimmer' ? 'active' : ''}`} 

            onClick={() => handleTabChange('dimmer')}
            title="Диммер мониторов: DDC/CI"

          >

            <span className="tab-ico">🖥</span><span className="tab-label">Диммер</span>


          </button>

          <button 

            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} 

            onClick={() => handleTabChange('settings')}
            title="Настройки: 10 систем Sentinel"

          >

            <span className="tab-ico">⚙</span><span className="tab-label">Настройки</span>


          </button>

        </nav>



        {/* Generous Flexible Header Drag Bar */}

        <div 

          className="header-drag-zone" data-overflow-ok 

          onMouseDown={handleHeaderMouseDown} 

          onDoubleClick={handleHeaderDoubleClick}

          title="Зажмите для перемещения окна / двойной клик для разворачивания"

        >

          <div className="drag-grip-indicator">

            <span></span><span></span><span></span>

          </div>

        </div>



        {/* Header Action Tools */}

        <div className="header-actions">

          {updateInfo?.update_available && (

            <button

              onClick={() => setShowUpdateModal(true)}

              className="tactile-btn active-mint pip-hide animate-pulse"

              title={`Обновление доступно: v${updateInfo.remote_version}`}

            >

              <span>✨ v{updateInfo.remote_version}</span>

            </button>

          )}



          <button 

            className="tactile-btn cmd-palette-btn pip-hide" 

            onClick={() => { playClick(); setShowCmdPalette(true); }} 

            title="Палитра быстрых команд (Ctrl+K)"

          >

            <Search className="w-3.5 h-3.5 inline" /><span className="ml-1">Ctrl+K</span>

          </button>



          {isPipMode && (
            <button 
  
              className={`tactile-btn ${isPipMode ? 'active-mint' : ''}`} 
  
              id="pipToggleBtn" 
  
              onClick={handleTogglePipMode} 
  
              title={isPipMode ? "Вернуться в стандартный оконный режим (Ctrl+M)" : "Выделенный мини-кокпит PIP для второго монитора (Ctrl+M)"}
  
            >
  
              <span>{isPipMode ? '📐 В ОКНО' : '📐 PIP'}</span>
  
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
              <span>⋯</span>
              {isNightGuard && <span className="more-night" title="Ночной режим включён" aria-label="Ночной режим включён">🌙</span>}
            </button>
            <div className={`more-menu ${showMoreMenu ? 'open' : ''}`} role="menu" onClick={(e) => e.stopPropagation()}>
              <button className="more-item" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); handleTogglePipMode(); }}>
                <span>📐 Мини-окно (PIP)</span>
                <span className="more-hint">Ctrl+M</span>
              </button>
              <button className="more-item" role="menuitemcheckbox" aria-checked={isNightGuard} onClick={() => { playClick(); handleToggleNightGuard(); }}>
                <span>🌙 Ночной режим</span>
                <span className="more-check">{isNightGuard ? '✓' : ''}</span>
              </button>
              <button className="more-item more-item-help" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); setShowHelpModal(true); }}>
                <span>💡 Справка и горячие клавиши</span>
              </button>
              <button className="more-item" role="menuitem" onClick={() => { playClick(); setShowMoreMenu(false); setShowThemeMenu(true); }}>
                <span>🎨 Тема</span>
                <span className="more-hint">▸</span>
              </button>
              <button
                className="more-item"
                role="menuitemcheckbox"
                aria-checked={!isMuted}
                onClick={() => { toggleMute(); showToast(!isMuted ? '🔇 Звук интерфейса выключен' : '🔊 Звук интерфейса включён'); }}
              >
                <span>{isMuted ? '🔇' : '🔊'} Звук интерфейса: {isMuted ? 'выкл' : 'вкл'}</span>
                <span className="more-check">{!isMuted ? '✓' : ''}</span>
              </button>
            </div>
          {/* MASTER DROPDOWN: 1. THEMES (6) | 2. 3D RELIEFS (6) | 3. 2D FLAT (6) | 4. BRIGHTNESS */}

          <div className="theme-dropdown-wrap pip-hide" id="themeDropdownWrap">




            <div 

              className={`theme-dropdown-menu ${showThemeMenu ? 'open' : ''}`} 

              onClick={(e) => e.stopPropagation()}

            >

              {/* BLOCK 1: 6 COLOR THEMES */}

              <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-engraved)', padding: '1px 4px', letterSpacing: '0.04em', display: 'flex', justifyContent: 'space-between' }}>

                <span>1. ЦВЕТОВАЯ ПАЛИТРА (11 ТЕМ)</span>

                <span style={{ color: 'var(--led-mint)' }}>INSTANT SWITCH</span>

              </div>

              <div className="dropdown-section-grid-3">

                <div 

                  className={`theme-option ${theme === 'titanium' ? 'active' : ''}`} 

                  onClick={() => handleApplyTheme('titanium')}

                >

                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#171A22 50%,#3AD29F 50%)' }}></div>

                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Titanium</div>

                </div>

                <div 

                  className={`theme-option ${theme === 'luna-mint' ? 'active' : ''}`} 

                  onClick={() => handleApplyTheme('luna-mint')}

                >

                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#202725 50%,#73BBA5 50%)' }}></div>

                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Luna Mint</div>

                </div>

                <div 

                  className={`theme-option ${theme === 'gradient' ? 'active' : ''}`} 

                  onClick={() => handleApplyTheme('gradient')}

                >

                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#6366F1,#10B981,#A855F7)' }}></div>

                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Aurora</div>

                </div>

                <div 

                  className={`theme-option ${theme === 'cyberpunk' ? 'active' : ''}`} 

                  onClick={() => handleApplyTheme('cyberpunk')}

                >

                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#FCEE0A 50%,#00F0FF 50%)' }}></div>

                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Cyberpunk</div>

                </div>

                <div 

                  className={`theme-option ${theme === 'light' ? 'active' : ''}`} 

                  onClick={() => handleApplyTheme('light')}

                >

                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#F4F2EE 50%,#EA580C 50%)' }}></div>

                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Daylight</div>

                </div>

                <div 

                  className={`theme-option ${theme === 'copper' ? 'active' : ''}`} 

                  onClick={() => handleApplyTheme('copper')}

                >

                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#2B1810 50%,#F97316 50%)' }}></div>

                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Copper</div>
                </div>

                <div 
                  className={`theme-option ${theme === 'apple-luna' ? 'active' : ''}`} 
                  onClick={() => handleApplyTheme('apple-luna')}
                >
                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#171D1C 50%,#73BBA5 50%)' }}></div>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Apple Luna</div>
                </div>

                <div
                  className={`theme-option ${theme === 'midnight' ? 'active' : ''}`}
                  onClick={() => handleApplyTheme('midnight')}
                >
                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#0F1626 50%,#7DB4FF 50%)' }}></div>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Midnight</div>
                </div>

                <div
                  className={`theme-option ${theme === 'graphite' ? 'active' : ''}`}
                  onClick={() => handleApplyTheme('graphite')}
                >
                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#0E0E10 50%,#D8DDE3 50%)' }}></div>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Graphite OLED</div>
                </div>

                <div
                  className={`theme-option ${theme === 'paper' ? 'active' : ''}`}
                  onClick={() => handleApplyTheme('paper')}
                >
                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#FCFDFE 50%,#2457D6 50%)' }}></div>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Paper</div>
                </div>

                <div
                  className={`theme-option ${theme === 'sakura' ? 'active' : ''}`}
                  onClick={() => handleApplyTheme('sakura')}
                >
                  <div className="theme-swatch" style={{ background: 'linear-gradient(135deg,#1C1419 50%,#F4A7B9 50%)' }}></div>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Sakura Night</div>
                </div>

              </div>



              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }}></div>



              {/* BLOCK 2: 3D VOLUME RELIEFS */}

              <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-amber)', padding: '1px 4px', letterSpacing: '0.04em', display: 'flex', justifyContent: 'space-between' }}>

                <span>2. 3D ОБЪЕМНЫЕ ШЕЙДЕРЫ (NORMAL-MAPPED)</span>

                <span>DYNAMIC GPU</span>

              </div>

              <div className="dropdown-section-grid">

                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'hex-magma' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'hex-magma', '3D-Призмы (Магма)')}

                >

                  <span>🔥</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>3D-Призмы (Магма)</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>6 нормалей + магма</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'hex-theme' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'hex-theme', '3D-Призмы (Цвет темы)')}

                >

                  <span>⚡</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>3D-Призмы (Тема)</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Реактор цвета темы</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'tectonic-lava' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'tectonic-lava', '3D-Разломы Лавы')}

                >

                  <span>🌋</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>3D-Разломы Лавы</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Базальт + искры</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'topo-damascus' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'topo-damascus', '3D-Дамасская сталь')}

                >

                  <span>🌊</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>3D-Дамасская сталь</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Изолинии дамаска</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'carbon-weave' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'carbon-weave', '3D-Карбон (Анизотропный)')}

                >

                  <span>🏁</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>3D-Кованый Карбон</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Анизотропный блик</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'pcb-3d' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'pcb-3d', '3D-Чипы и Шины')}

                >

                  <span>📟</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>3D-Чипы и Шины</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Процессоры + импульсы</div>

                  </div>
                </div>

                <div 
                  className={`relief-option ${backdropType === '3d' && reliefMode === 'apple-luna' ? 'active' : ''}`} 
                  onClick={() => handleApplyBackdrop('3d', 'apple-luna', 'Apple Luna (Ambient Orbs)')}
                >
                  <span>🌿</span>
                  <div>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Apple Luna (Orbs)</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Мягкие мятные сферы</div>
                  </div>
                </div>

              </div>



              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }}></div>



              {/* BLOCK 3: 2D FLAT PATTERNS */}

              <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-mint)', padding: '1px 4px', letterSpacing: '0.04em', display: 'flex', justifyContent: 'space-between' }}>

                <span>3. КЛАССИЧЕСКИЕ 2D-ЗАДНИКИ (БЕЗ 3D-ОБЪЕМА)</span>

                <span>FLAT 2D</span>

              </div>

              <div className="dropdown-section-grid">

                <div 

                  className={`relief-option ${backdropType === '2d-honeycomb' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('2d-honeycomb', 'none', '2D-Соты (Классика)')}

                >

                  <span>⬢</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>2D-Соты (Классика)</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Тонкая векторная сетка</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '2d-lava' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('2d-lava', 'none', '2D-Контур Лавы')}

                >

                  <span>⚡</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>2D-Контур Лавы</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Плоские линии разломов</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '2d-dots' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('2d-dots', 'none', '2D-Точки Linear')}

                >

                  <span>🎛️</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>2D-Точки Linear</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Инженерная микро-сетка</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '2d-carbon' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('2d-carbon', 'none', '2D-Карбон')}

                >

                  <span>🕸️</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>2D-Карбон</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Диагональный узор</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === '3d' && reliefMode === 'liquid-silk' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('3d', 'liquid-silk', 'Жидкий Шелк (Orbs)')}

                >

                  <span>💎</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Жидкий Шелк (Orbs)</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Мягкое свечение сфер</div>

                  </div>

                </div>



                <div 

                  className={`relief-option ${backdropType === 'smooth' ? 'active' : ''}`} 

                  onClick={() => handleApplyBackdrop('smooth', 'none', 'Чистый Матовый Металл')}

                >

                  <span>⬛</span>

                  <div>

                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>Чистый Матовый</div>

                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Полностью без узора</div>

                  </div>

                </div>

              </div>



              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }}></div>



              {/* BLOCK 3B: COMFYUI PHOTO BACKDROPS */}
              <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-amber)', padding: '1px 4px', letterSpacing: '0.04em', display: 'flex', justifyContent: 'space-between' }}>
                <span>4. ФОТО-ЗАДНИКИ COMFYUI</span>
                <span>WEBGL</span>
              </div>
              <div className="dropdown-section-grid">
                {PHOTO_BACKDROPS.map(p => (
                  <div
                    key={p.id}
                    className={`relief-option ${backdropType === 'photo' && reliefMode === p.id ? 'active' : ''}`}
                    onClick={() => handleApplyBackdrop('photo', p.id, p.name)}
                  >
                    <img src={photoBackdropUrl(p.id, true)} alt="" loading="lazy" width={44} height={25} style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0, filter: 'brightness(1.8)' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{p.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }}></div>

              {/* BLOCK 4: INTENSITY SLIDER */}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '2px 4px' }}>

                <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-engraved)' }}>ЯРКОСТЬ ЗАДНИКА:</span>

                <input 

                  type="range" 

                  min="15" 

                  max="100" 

                  value={Math.round(reliefOpacity * 100)} 

                  style={{ flex: 1, accentColor: 'var(--led-mint)', cursor: 'pointer', height: '4px' }} 

                  onChange={(e) => handleUpdateReliefIntensity(parseInt(e.target.value, 10))} 

                />

                <span className="tabular" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--led-mint)', width: '32px', textAlign: 'right' }}>

                  {Math.round(reliefOpacity * 100)}%

                </span>

              </div>

            </div>

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

            <div 

              className={`power-rocker ${!sentinelState.hardware.is_paused ? 'on' : ''}`} 

              onClick={handleToggleDaemon}

            >

              <div className="power-rocker-thumb"></div>

            </div>

          </div>



        </div>



        {/* WINDOW CONTROLS (Frameless Luxury Desktop Chrome) - DIRECT SIBLING, ALWAYS PINNED */}

        <div className="window-controls-pod pip-hide">

          <button 

            className="win-btn win-min" 

            onClick={(e) => { e.stopPropagation(); handleWindowControl('minimize'); }} 

            title="Свернуть окно"

          >

            <svg width="10" height="10" viewBox="0 0 10 10">

              <path d="M1.5 5.5h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>

            </svg>

          </button>

          <button 

            className="win-btn win-max" 

            onClick={(e) => { e.stopPropagation(); handleWindowControl('maximize'); }} 

            title={isWindowMaximized ? "Восстановить окно" : "Развернуть на весь экран"}

          >

            {isWindowMaximized ? (

              <svg width="10" height="10" viewBox="0 0 10 10">

                <path d="M3 1.5h5.5v5.5M1.5 3.5h5.5v5.5h-5.5z" fill="none" stroke="currentColor" strokeWidth="1.1"/>

              </svg>

            ) : (

              <svg width="10" height="10" viewBox="0 0 10 10">

                <rect x="1.5" y="1.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1"/>

              </svg>

            )}

          </button>

          <button 

            className="win-btn win-close" 

            onClick={(e) => { e.stopPropagation(); handleWindowControl('close'); }} 

            title="Свернуть в системный трей (Фарм продолжается)"

          >

            <svg width="10" height="10" viewBox="0 0 10 10">

              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>

            </svg>

          </button>

        </div>

      </header>



      {/* ==================== DEDICATED PIP MINI-DECK HUD ==================== */}

      <div 

        className="pip-dedicated-hud" 

        onMouseDown={handleHeaderMouseDown}

        title="Зажмите левую кнопку мыши для свободного перемещения мини-кокпита PIP"

      >

        <div className="pip-top-row">

          <div className="pip-cover-slot" title={activeDrop?.game ? `Фармится: ${activeDrop.game}` : 'Ожидание дропа'}>
            {activeGameBoxArt ? (
              <img 
                src={activeGameBoxArt} 
                alt={activeDrop?.game || 'Game Cover'} 
                className="pip-cover-img"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.pip-cover-fallback') as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div className="pip-cover-fallback" style={{ display: activeGameBoxArt ? 'none' : 'flex' }}>
              <span style={{ fontSize: 'var(--fs-xl)' }}>🎮</span>
            </div>
            <div className="pip-cover-tag">
              <span className="pulse-dot"></span>
              <span>LIVE</span>
            </div>
          </div>

          <div className="pip-ring-wrap">

            <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>

              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth="6"></circle>

              <circle 

                cx="36" 

                cy="36" 

                r="30" 

                fill="none" 

                stroke="var(--led-mint)" 

                strokeWidth="6" 

                strokeLinecap="round" 

                strokeDasharray={circumference} 

                strokeDashoffset={strokeDashoffset} 

              />

            </svg>

            <div style={{ textAlign: 'center', zIndex: 2 }}>

              <div className="tabular" style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>

                {Math.round(progressPct)}%

              </div>

              <div className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-mint)' }}>

                {activeDrop ? `~${Math.round(activeDrop.remaining_seconds / 60)}М` : 'ГОТОВ'}

              </div>

            </div>

          </div>



          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <span className="version-chip">

                {activeDrop?.game || 'STANDBY'} • ЭТАП 2/3

              </span>

              <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-mint)' }}>

                📡 {sentinelState.watching_channel ? `@${sentinelState.watching_channel}` : 'ожидание стримера'}

              </span>

            </div>



            <div className="pip-marquee-box">

              <span className="pip-marquee-text scrolling">

                {activeDrop?.name || 'Twitch Drops Sentinel v7.0: Автономный фарм активен'}

              </span>

            </div>



            <div className="pip-led-20">

              {Array.from({ length: 20 }).map((_, idx) => (

                <div 

                  key={idx} 

                  className={`pip-led-cell ${idx < Math.round((progressPct / 100) * 20) ? 'lit' : ''}`}

                />

              ))}

            </div>

          </div>

        </div>




        <div className="pip-action-bar">

          <button 

            className={`tactile-btn pip-action-btn ${isTopMost ? 'active-mint' : ''}`} 

            onClick={handleToggleTopMost}

            title={isTopMost ? "Открепить окно от верхнего слоя" : "Закрепить поверх всех окон"}

          >

            <span>📌</span>

            <span className="pip-label-full">{isTopMost ? 'ЗАКРЕПЛЕНО' : 'ПОВЕРХ ОКОН'}</span>

            <span className="pip-label-short">{isTopMost ? 'ЗАКРЕП' : 'ПОВЕРХ'}</span>

          </button>

          <button 

            className="tactile-btn pip-action-btn" 

            onClick={() => handleSwitchStreamer(false)}

            title="Сменить текущий стрим"

          >

            <span>↻</span>

            <span className="pip-label-full">Сменить узел</span>

            <span className="pip-label-short">Узел</span>

          </button>

          <button 

            className="tactile-btn pip-action-btn" 

            onClick={() => handleSwitchStreamer(true)}

            title="Перейти к следующей игре в очереди"

          >

            <span>⏭</span>

            <span className="pip-label-full">След. игра</span>

            <span className="pip-label-short">След.</span>

          </button>

          <button 

            className="tactile-btn pip-action-btn danger-hover" 

            onClick={() => {

              if (sentinelState.watching_channel) {

                handleBanStreamer(sentinelState.watching_channel, false);

              }

            }}

            title="Добавить текущий канал в список игнорируемых"

          >

            <span>🚫</span>

            <span className="pip-label-full">В игнор</span>

            <span className="pip-label-short">Игнор</span>

          </button>

        </div>

      </div>



      {/* ==================== MAIN WORKSPACE ==================== */}

      <main className="main-stage">

        <TabErrorBoundary fallbackTab={() => handleTabChange('dashboard')}>

          {activeTab === 'dashboard' && (

            <LiveDashboard
              activeDrop={sentinelState.active_drop}

              hardware={sentinelState.hardware}

              stats={sentinelState.stats}

            connected={sentinelState.connected}

              settings={sentinelState.settings}

              statusText={sentinelState.status_text}

              watchingChannel={sentinelState.watching_channel}

              recentLogs={sentinelState.recent_logs}

              watchdogStatus={sentinelState.watchdog_status}

              oauthCode={sentinelState.oauth_code}

              oauthUri={sentinelState.oauth_uri}

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

            />

          )}



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
              updateProgress={updateProgress}
            />

          )}

        </TabErrorBoundary>

      </main>



      {/* ==================== COMMAND PALETTE MODAL (Ctrl+K) ==================== */}
      {showCmdPalette && (() => {
        const query = cmdSearch.toLowerCase().trim();

        const navActions = [
          { id: 'dashboard', key: '1', icon: '⊞', title: 'Дашборд', action: () => handleTabChange('dashboard') },
          { id: 'shelf', key: '2', icon: '🎮', title: 'Полка игр', action: () => handleTabChange('shelf') },
          { id: 'giveaways', key: '3', icon: '🎁', title: 'Раздачи', action: () => handleTabChange('giveaways') },
          { id: 'dimmer', key: '4', icon: '🖥', title: 'Диммер', action: () => handleTabChange('dimmer') },
          { id: 'settings', key: '5', icon: '⚙', title: 'Настройки', action: () => handleTabChange('settings') },
        ].filter(item => !query || item.title.toLowerCase().includes(query) || item.key === query);

        const quickActions = [
          { id: 'switch-streamer', icon: '↻', title: 'Сменить стримера', action: () => handleSwitchStreamer(false) },
          { id: 'refresh-twitch', key: 'F5', icon: '⟳', title: 'Обновить данные Twitch', action: () => handleManualRefresh() },
          { id: 'toggle-daemon', icon: '⏯', title: sentinelState.hardware.is_paused ? 'Запустить сбор дропов' : 'Приостановить сбор дропов', action: () => handleToggleDaemon() },
          { id: 'toggle-pip', key: 'Ctrl+M', icon: '📐', title: isPipMode ? 'Вернуться из мини-окна (PIP)' : 'Мини-окно (PIP)', action: () => handleTogglePipMode() },
          { id: 'toggle-night', icon: '🌙', title: isNightGuard ? 'Выключить ночной режим' : 'Включить ночной режим', action: () => handleToggleNightGuard() },
          { id: 'open-theme', icon: '🎨', title: 'Выбрать тему оформления', action: () => setShowThemeMenu(true) },
          { id: 'toggle-sound', icon: isMuted ? '🔇' : '🔊', title: isMuted ? 'Включить звук интерфейса' : 'Выключить звук интерфейса', action: () => { toggleMute(); showToast(!isMuted ? '🔇 Звук интерфейса выключен' : '🔊 Звук интерфейса включён'); } },
          { id: 'open-help', icon: '💡', title: 'Справка и горячие клавиши', action: () => setShowHelpModal(true) },
        ].filter(item => !query || item.title.toLowerCase().includes(query) || (item.key || '').toLowerCase().includes(query));

        const matchingGames = (sentinelState?.all_catalog_games || [])
          .filter(g => query && g.name.toLowerCase().includes(query))
          .slice(0, 5);

        const totalResults = navActions.length + quickActions.length + matchingGames.length;

        return (
          <div 
            className="fixed inset-0 z-50 bg-[#0c100f]/65 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-150"
            onClick={() => setShowCmdPalette(false)}
          >
            <div 
              className="w-full max-w-xl bg-[#171d1c] border border-[#303a35] rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col max-h-[80vh] my-auto animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 px-4 bg-[#202725] border-b border-[#303a35] flex items-center gap-2.5 shrink-0">
                <Search className="w-4 h-4 text-[#73bba5] shrink-0" />
                <input 
                  type="text" 
                  placeholder="Поиск по играм, стримам и действиям... (Esc)" 
                  autoFocus 
                  className="w-full bg-transparent border-none outline-none text-xs md:text-sm text-[#e9eeec] placeholder-[var(--text-muted)] font-medium"
                  value={cmdSearch}
                  onChange={(e) => setCmdSearch(e.target.value)}
                />
                <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[length:var(--fs-xs)] tabular text-[var(--text-muted)] shrink-0 select-none">
                  ESC
                </kbd>
              </div>

              <div className="p-2 overflow-y-auto space-y-2 scrollbar-thin flex-1 min-h-0">
                {navActions.length > 0 && (
                  <div>
                    <div className="text-[length:var(--fs-xs)] tabular font-bold text-[var(--text-muted)] uppercase tracking-[0.04em] px-2 py-0.5">
                      Навигация
                    </div>
                    <div className="space-y-0.5">
                      {navActions.map(item => (
                        <button 
                          key={item.id}
                          className="w-full flex items-center justify-between p-2 px-2.5 rounded-lg hover:bg-white/[0.06] text-left transition-colors cursor-pointer group"
                          onClick={() => {
                            playClick();
                            item.action();
                            setShowCmdPalette(false);
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 text-center text-xs shrink-0">{item.icon}</span>
                            <span className="text-xs font-semibold text-white group-hover:text-[#73bba5] transition-colors truncate">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[length:var(--fs-xs)] tabular px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[#73bba5] font-bold shrink-0">
                            {item.key}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {quickActions.length > 0 && (
                  <div>
                    <div className="text-[length:var(--fs-xs)] tabular font-bold text-[var(--text-muted)] uppercase tracking-[0.04em] px-2 py-0.5 pt-1">
                      Действия
                    </div>
                    <div className="space-y-0.5">
                      {quickActions.map(item => (
                        <button 
                          key={item.id}
                          className="w-full flex items-center justify-between p-2 px-2.5 rounded-lg hover:bg-white/[0.06] text-left transition-colors cursor-pointer group"
                          onClick={() => {
                            playClick();
                            item.action();
                            setShowCmdPalette(false);
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 text-center text-xs shrink-0">{item.icon}</span>
                            <span className="text-xs font-semibold text-white group-hover:text-[#73bba5] transition-colors truncate">
                              {item.title}
                            </span>
                          </div>
                          {item.key && (
                            <span className="text-[length:var(--fs-xs)] tabular px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/5 text-[var(--text-muted)] shrink-0">
                              {item.key}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {matchingGames.length > 0 && (
                  <div>
                    <div className="text-[length:var(--fs-xs)] tabular font-bold text-[#73bba5] uppercase tracking-[0.04em] px-2 py-0.5 pt-1 flex items-center justify-between">
                      <span>Игры в каталоге</span>
                      <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Фокус ↵</span>
                    </div>
                    <div className="space-y-0.5">
                      {matchingGames.map(game => (
                        <button 
                          key={game.id}
                          className="w-full flex items-center justify-between p-2 px-2.5 rounded-lg hover:bg-[#368873]/20 text-left transition-colors cursor-pointer group border border-transparent hover:border-[#73bba5]/30"
                          onClick={() => {
                            playClick();
                            handleForceFarm(game.name);
                            handleTabChange('dashboard');
                            setShowCmdPalette(false);
                            showToast(`Фокус: ${game.name}`);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 text-center text-xs shrink-0">🎯</span>
                            <span className="text-xs font-bold text-white group-hover:text-[#73bba5] transition-colors truncate">
                              {game.name}
                            </span>
                          </div>
                          <span className="text-[length:var(--fs-xs)] tabular px-1.5 py-0.5 rounded bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30 font-bold shrink-0">
                            В ФОКУС ↵
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {totalResults === 0 && (
                  <div className="p-6 text-center text-[var(--text-muted)] space-y-1">
                    <p className="text-xs font-semibold text-white">Ничего не найдено по запросу «{cmdSearch}»</p>
                    <p className="text-[length:var(--fs-xs)]">Попробуйте ввести имя игры или номер вкладки (1–5).</p>
                  </div>
                )}
              </div>

              <div className="p-2.5 px-4 bg-[#202725] border-t border-[#303a35] flex items-center justify-between text-[length:var(--fs-xs)] text-[var(--text-muted)] shrink-0 select-none">
                <span><kbd className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10 text-white tabular text-[length:var(--fs-xs)]">1–5</kbd> Вкладки • <kbd className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10 text-white tabular text-[length:var(--fs-xs)]">Esc</kbd> Закрыть</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tactile Toast Notification */}

      {toastMessage && (

        <div className="hud-toast" role="status">

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            <Sparkles size={14} style={{ color: 'var(--led-mint)' }} />

            <span>{toastMessage}</span>

          </div>

          <button 

            onClick={() => setToastMessage(null)} 

            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}

          >

            <X size={14} />

          </button>

        </div>

      )}



      {/* Help Modal */}

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} activeTab={activeTab} />



      {/* GitHub Auto-Updater Modal */}

      {showUpdateModal && updateInfo && (

        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">

          <div className="titanium-island max-w-lg w-full p-6 md:p-8 space-y-5 relative">

            <button

              onClick={() => setShowUpdateModal(false)}

              className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"

            >

              <X size={18} />

            </button>



            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-[var(--led-mint)]/20 border border-[var(--led-mint)]/40 flex items-center justify-center text-[var(--led-mint)]">

                <Sparkles size={20} />

              </div>

              <div>

                <h3 className="text-base font-bold text-[var(--text-primary)]">

                  Доступно обновление v{updateInfo.remote_version}

                </h3>

                <p className="text-xs text-[var(--text-muted)]">

                  Текущая версия: v{sentinelState.version || '3.4.1'}

                </p>

              </div>

            </div>



            <div className="obsidian-well p-4 rounded-xl text-xs space-y-2 max-h-48 overflow-y-auto">

              <div className="font-semibold text-[var(--text-primary)]">Что нового:</div>

              <div className="text-[var(--text-muted)] whitespace-pre-line leading-relaxed">

                {updateInfo.release_notes || 'Улучшена стабильность работы фонового демона и оптимизирована обработка очередей.'}

              </div>

            </div>



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

                className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"

              >

                Позже

              </button>

              {updateInstalled ? (

                <button

                  onClick={handleRestartApp}

                  className="px-5 py-2.5 rounded-xl bg-[var(--led-mint)] hover:opacity-90 text-[var(--cta-text)] text-xs font-bold transition-all cursor-pointer shadow-lg"

                >

                  Перезапустить сейчас

                </button>

              ) : (

                <button

                  onClick={handleApplyUpdate}

                  disabled={isApplyingUpdate}

                  className="px-5 py-2.5 rounded-xl bg-[var(--led-mint)] hover:opacity-90 disabled:opacity-50 text-[var(--cta-text)] text-xs font-bold transition-all cursor-pointer shadow-lg"

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
