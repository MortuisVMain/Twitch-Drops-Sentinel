import React, { useState, useEffect } from 'react';
import { NavTab, UpdateCheckResult } from './types';
import { LiveDashboard } from './components/LiveDashboard';
import { GameShelf } from './components/GameShelf';
import { GiveawaysView } from './components/GiveawaysView';
import { SettingsStudio } from './components/SettingsStudio';
import { LiquidCanvas } from './components/LiquidCanvas';
import { HelpModal } from './components/HelpModal';
import { useTactileAudio } from './hooks/useTactileAudio';
import { useSentinelState } from './hooks/useSentinelState';
import { 
  ShieldCheck, 
  Moon, 
  Sparkles, 
  CircleHelp, 
  ChevronRight, 
  Maximize2, 
  AlertTriangle, 
  Zap, 
  Lock, 
  ArrowRight, 
  Check, 
  LayoutDashboard, 
  Gamepad2, 
  Gift,
  SlidersHorizontal, 
  X, 
  RotateCw,
  Volume2,
  VolumeX,
  Download
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
        <div className="card p-8 md:p-12 text-center max-w-lg mx-auto my-12 border border-rose-500/30 bg-[var(--surface-elevated)] space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--foreground)]">Временная ошибка отображения вкладки</h3>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            {this.state.error?.message || 'Произошел сбой при отрисовке содержимого.'}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="px-4 py-2.5 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

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
    handleOpenVaultFile,
    handleRescanGames,
    handleToggleDaemon,
    handleSwitchStreamer,
    handleReorderPriority,
  } = useSentinelState(showToast, playRewardChime, playClick);

  // GitHub Auto-Updater State & Lifecycle
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState<boolean>(false);
  const [updateInstalled, setUpdateInstalled] = useState<boolean>(false);

  const checkUpdates = async (force: boolean = false) => {
    try {
      const res = await fetch(`http://127.0.0.1:28492/api/updates/check?force=${force ? '1' : '0'}`);
      if (res.ok) {
        const data: UpdateCheckResult = await res.json();
        setUpdateInfo(data);
        if (data.update_available) {
          setShowUpdateModal(true);
        }
      }
    } catch (err) {
      console.warn('Could not check for updates:', err);
    }
  };

  useEffect(() => {
    checkUpdates(false);
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
    playClick();
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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        handleManualRefresh();
      } else if (e.key === 'Escape') {
        setShowHelpModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualRefresh]);

  const handleTabChange = (tab: NavTab) => {
    playClick();
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Дашборд', icon: LayoutDashboard, badge: 'PRO' },
    { id: 'shelf' as NavTab, label: 'Полка Игр', icon: Gamepad2, badge: `${sentinelState.installed_games.length}` },
    { id: 'giveaways' as NavTab, label: 'Раздачи', icon: Gift, badge: 'FREE' },
    { id: 'settings' as NavTab, label: 'Настройки', icon: SlidersHorizontal },
  ];

  const currentNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className="app dark">
      {/* Living Ambient Canvas */}
      <LiquidCanvas />

      {/* ==================== 1:1 Apple Luna 2.0 Left Sidebar ==================== */}
      <aside className="sidebar">
        {/* Brand */}
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleTabChange('dashboard');
          }}
        >
          <div className="brand-symbol">
            <ShieldCheck size={24} fill="currentColor" strokeWidth={1.5} />
            <span />
          </div>
          <span className="brand-title">Twitch Drops Sentinel</span>
        </a>

        {/* Vertical Navigation */}
        <nav>
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              title={label}
              className={`nav-item ${activeTab === id ? 'selected' : ''}`}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => handleTabChange(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {badge && <span className="nav-pro">{badge}</span>}
              {activeTab === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>

        {/* Sidebar Bottom (Night Note + Help + Version) */}
        <div className="sidebar-bottom">
          <div className="night-note">
            <div className="little-moon">
              <Moon size={19} />
              <Sparkles size={12} />
            </div>
            <h3>
              Хороший день начинается
              <br />
              с хорошего отдыха.
            </h3>
            <p>Остальное Sentinel возьмёт на себя.</p>
            <div className="night-note-line" />
          </div>

          <button className="help-link" onClick={() => setShowHelpModal(true)}>
            <CircleHelp size={18} />
            <span>Помощь и горячие клавиши</span>
          </button>

          <div className="sidebar-version">
            <span>Twitch Drops Sentinel</span>
            <span className="version-pro">v.3.1</span>
          </div>
        </div>
      </aside>

      {/* ==================== Main Content Shell ==================== */}
      <div className="main-shell">
        {/* 1:1 Apple Luna 2.0 Topbar (67px) */}
        <header className="topbar">
          <div className="breadcrumb">
            Twitch Drops Sentinel <ChevronRight size={13} />
            <span>{currentNav.label}</span>
            {activeTab === 'dashboard' && <span className="premium-version">PRO</span>}
          </div>

          <div className="topbar-right">
            {updateInfo?.update_available && (
              <button
                aria-label="Доступно обновление"
                title={`Доступна новая версия Sentinel v${updateInfo.remote_version}. Нажмите для обновления.`}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#368873]/20 border border-[#73bba5]/40 text-[#73bba5] text-xs font-semibold hover:bg-[#368873]/30 transition-all cursor-pointer shadow-sm animate-pulse"
                onClick={() => setShowUpdateModal(true)}
              >
                <Sparkles size={13} className="text-[#73bba5]" />
                <span>Обновление v{updateInfo.remote_version}</span>
              </button>
            )}

            <div className="telemetry-pill">
              <span>CPU {sentinelState.hardware.cpu_percent}%</span>
              <span>&bull;</span>
              <span>{(sentinelState.stats.traffic_saved_mb / 1024).toFixed(1)} GB сэкономлено</span>
            </div>

            <span className="web-status">
              <span />
              Windows Native
            </span>

            <span className="topbar-divider" />

            <button
              aria-label="Синхронизировать"
              title="Синхронизировать данные"
              onClick={() => {
                handleManualRefresh();
                checkUpdates(true);
              }}
            >
              <RotateCw size={17} />
            </button>

            <button
              aria-label={isMuted ? "Включить звуки интерфейса" : "Отключить звуки интерфейса"}
              title={isMuted ? "Включить звуки интерфейса (сейчас Muted)" : "Отключить звуки интерфейса (Mute)"}
              className={`tactile-press ${isMuted ? 'text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30' : ''}`}
              onClick={() => {
                toggleMute();
                showToast(isMuted ? "Звуки интерфейса включены" : "Звуки интерфейса отключены (Mute)");
              }}
            >
              {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>

            <button
              aria-label="Полноэкранный режим"
              title="Полноэкранный режим"
              onClick={async () => {
                try {
                  if (document.fullscreenElement) await document.exitFullscreen();
                  else await document.documentElement.requestFullscreen();
                } catch {
                  showToast('Полноэкранный режим недоступен');
                }
              }}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main>
          {/* Gaming Pause HUD Notification */}
          {sentinelState.hardware.is_gaming && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white">
                    Hardware Guard: Обнаружена игра ({sentinelState.hardware.detected_game || 'Активный гейминг'})
                  </span>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Sentinel временно приостановил фоновый опрос для 100% плавности и нулевого пинга
                  </p>
                </div>
              </div>
              <span className="text-xs px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30 shrink-0">
                Автопауза активна
              </span>
            </div>
          )}

          {/* 1:1 Apple Luna 2.0 Page Heading */}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                {activeTab === 'dashboard' && 'SENTINEL PRO · ТИХИЙ АВТОНОМНЫЙ ФАРМ ДРОПОВ 24/7'}
                {activeTab === 'shelf' && 'БИБЛИОТЕКА ИГР · ПРИОРИТЕТЫ И ИСКЛЮЧЕНИЯ'}
                {activeTab === 'giveaways' && 'СИНДИКАТ ХАЛЯВЫ · АВТОМАТИЧЕСКИЙ СБОР РАЗДАЧ'}
                {activeTab === 'settings' && 'КОНФИГУРАЦИЯ · ПОВЕДЕНИЕ ДЕМОНА И ПИТАНИЕ'}
              </div>
              <h1>
                {activeTab === 'dashboard' && 'Все трофеи под контролем.'}
                {activeTab === 'shelf' && 'Каждой игре — свой приоритет.'}
                {activeTab === 'giveaways' && 'Все магазины под контролем.'}
                {activeTab === 'settings' && 'Тонкая настройка по вашим правилам.'}
              </h1>
              <p>
                {activeTab === 'dashboard' && 'Автономный сбор наград Twitch без видеопотока, лагов и нагрузки на видеокарту.'}
                {activeTab === 'shelf' && 'Управляйте приоритетами дропов и исключайте ненужные игры в один клик.'}
                {activeTab === 'giveaways' && 'Автоматический забор бесплатных игр и ассетов в Epic Games, GOG, Steam, Fab и Unity без открытого браузера.'}
                {activeTab === 'settings' && 'Управление поведением при гейминге, питанием и сканированием локальных дисков.'}
              </p>
            </div>

            <div className="local-badge">
              <ShieldCheck size={15} className="text-[#73bba5]" />
              <span>Локально и приватно &bull; 0% GPU &bull; {(sentinelState.stats.traffic_saved_mb / 1024).toFixed(1)} GB сэкономлено</span>
            </div>
          </div>

          {/* Tab Views */}
          <div className="tab-content-container pb-8">
            <TabErrorBoundary fallbackTab={() => handleTabChange('dashboard')}>
              {activeTab === 'dashboard' && (
                <LiveDashboard
                  activeDrop={sentinelState.active_drop}
                  hardware={sentinelState.hardware}
                  stats={sentinelState.stats}
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
                  onAddToPriority={handleTogglePriority}
                  onRemoveFromPriority={handleTogglePriority}
                  onManualRefresh={handleManualRefresh}
                  onGoToShelf={() => handleTabChange('shelf')}
                  onGoToSettings={() => handleTabChange('settings')}
                  onClaimNow={(dropId) => handleClaimNow(dropId)}
                  onToggleDaemon={handleToggleDaemon}
                  onSwitchStreamer={handleSwitchStreamer}
                  onReorderPriority={handleReorderPriority}
                />
              )}

              {activeTab === 'shelf' && (
                <GameShelf
                  games={sentinelState.all_catalog_games}
                  priorityList={sentinelState.settings.priority_games}
                  excludedList={sentinelState.settings.excluded_games}
                  onAddToPriority={(name) => handleTogglePriority(name)}
                  onRemoveFromPriority={(name) => handleTogglePriority(name)}
                  onAddToExcluded={(name) => handleToggleExclude(name)}
                  onRemoveFromExcluded={(name) => handleToggleExclude(name)}
                  onReorderPriority={handleReorderPriority}
                  onBack={() => handleTabChange('dashboard')}
                />
              )}

              {activeTab === 'giveaways' && (
                <GiveawaysView
                  onBackToDashboard={() => handleTabChange('dashboard')}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsStudio
                  settings={sentinelState.settings}
                  stats={sentinelState.stats}
                  username={sentinelState.username}
                  installedCount={sentinelState.installed_games.length}
                  onUpdateSettings={handleUpdateSettings}
                  onRescanGames={handleRescanGames}
                  isScanning={isScanning}
                  onBack={() => handleTabChange('dashboard')}
                  onOpenVaultFile={handleOpenVaultFile}
                />
              )}
            </TabErrorBoundary>
          </div>

          {/* Apple Luna 2.0 Lower Strips (on Dashboard) */}
          {activeTab === 'dashboard' && (
            <>
              <section className="features-strip my-6">
                <div>
                  <span className="feature-icon">
                    <Zap size={18} />
                  </span>
                  <div>
                    <h3>Streamless-протокол</h3>
                    <p>Фарм на уровне WebSocket, 0% нагрузки на GPU</p>
                  </div>
                  <Check size={14} className="feature-check" />
                </div>

                <div>
                  <span className="feature-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <div>
                    <h3>Hardware Guard</h3>
                    <p>Мгновенная пауза при запуске тяжелых игр</p>
                  </div>
                  <Check size={14} className="feature-check" />
                </div>

                <div>
                  <span className="feature-icon">
                    <Lock size={18} />
                  </span>
                  <div>
                    <h3>Только на вашем ПК</h3>
                    <p>Никаких серверов, токены хранятся строго локально</p>
                  </div>
                  <Check size={14} className="feature-check" />
                </div>
              </section>

              <div className="tip-strip mb-6">
                <div className="tip-icon">
                  <Sparkles size={18} />
                </div>
                <p>
                  <strong>Небольшой совет от Sentinel</strong>
                  <span>Включите автовыключение ПК в настройках: Sentinel завершит текущие дропы и бережно выключит компьютер.</span>
                </p>
                <button onClick={() => handleTabChange('settings')}>
                  Настроить <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}

          {/* Apple Luna 2.0 Footer */}
          <footer>
            <span>
              <span className="footer-dot" />
              Всё спокойно. Sentinel рядом.
            </span>
            <div className="flex items-center gap-4 text-[10px] text-[#828f88]">
              <span>Sentinel v3.1 · Mortuis_V</span>
              <span>&bull;</span>
              <span>Sentinel Engine Active</span>
            </div>
          </footer>
        </main>
      </div>

      {/* Tactile Toast Notification */}
      {toastMessage && (
        <div className="toast" role="status">
          <div>
            <Sparkles size={16} />
          </div>
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} aria-label="Закрыть">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Help Modal */}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {/* GitHub Auto-Updater Modal (Apple Luna 2.0) */}
      {showUpdateModal && updateInfo && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="card max-w-lg w-full p-6 md:p-8 space-y-5 border border-[#73bba5]/30 shadow-2xl relative bg-[var(--surface-elevated)]">
            <button
              onClick={() => setShowUpdateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-white/[0.08] text-[var(--muted)] hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#368873]/20 border border-[#73bba5]/40 text-[#73bba5] flex items-center justify-center shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">Доступно обновление Sentinel</h3>
                <p className="text-xs text-[var(--muted)]">
                  Текущая версия: v{updateInfo.local_version} &rarr;{' '}
                  <span className="text-[#73bba5] font-semibold">Новая: v{updateInfo.remote_version}</span>
                </p>
              </div>
            </div>

            {updateInfo.release_name && (
              <div className="text-xs font-semibold text-[var(--foreground)] px-3 py-1.5 rounded-lg bg-black/20 border border-[var(--line)]">
                {updateInfo.release_name}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[var(--muted)]">Что нового в релизе:</div>
              <div className="max-h-48 overflow-y-auto p-3.5 rounded-xl bg-black/30 border border-[var(--line)] text-xs text-[var(--foreground)] font-mono whitespace-pre-wrap leading-relaxed select-text">
                {updateInfo.release_notes || 'Улучшения стабильности, исправления ошибок и оптимизация работы.'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#368873]/10 border border-[#73bba5]/20 text-[11px] text-[var(--accent)] flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0 text-[#73bba5]" />
              <span>Ваши сессии, токены, настройки и журнал наград 100% защищены и сохраняются.</span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowUpdateModal(false)}
                disabled={isApplyingUpdate}
                className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--line)] transition-all cursor-pointer disabled:opacity-50"
              >
                Напомнить позже
              </button>
              {updateInstalled ? (
                <button
                  onClick={handleRestartApp}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer animate-pulse"
                >
                  <RotateCw size={15} />
                  <span>Перезапустить сейчас</span>
                </button>
              ) : (
                <button
                  onClick={handleApplyUpdate}
                  disabled={isApplyingUpdate || !updateInfo.download_url}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isApplyingUpdate ? (
                    <>
                      <RotateCw size={15} className="animate-spin" />
                      <span>Установка обновления...</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Установить в 1 клик</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
