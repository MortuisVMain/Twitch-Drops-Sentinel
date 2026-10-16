import React, { useState, useEffect } from 'react';
import { NavTab } from './components/Header';
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
  Sun, 
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
  Monitor
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
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [isZenMode, setIsZenMode] = useState(false);

  const { playClick, playRewardChime } = useTactileAudio();

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
  }, []);

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
    <div className={`app ${isDarkTheme ? 'dark' : ''} ${isZenMode ? 'zen-mode' : ''}`}>
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
            <span className="version-pro">v.3.0</span>
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
            <div className="telemetry-pill">
              <span>CPU {sentinelState.hardware.cpu_percent}%</span>
              <span>&bull;</span>
              <span>GPU {sentinelState.hardware.gpu_percent}%</span>
              <span>&bull;</span>
              <span>{sentinelState.hardware.ping_ms} ms</span>
            </div>

            <span className="web-status">
              <span />
              Windows Native
            </span>

            <span className="topbar-divider" />

            <button
              aria-label="Синхронизировать"
              title="Синхронизировать данные"
              onClick={handleManualRefresh}
            >
              <RotateCw size={17} />
            </button>

            <button
              aria-label="Переключить тему"
              title="Переключить тему (Светлая / Тёмная)"
              onClick={() => {
                playClick();
                setIsDarkTheme(!isDarkTheme);
              }}
            >
              {isDarkTheme ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <button
              aria-label="Zen HUD (Режим второго монитора)"
              title={isZenMode ? "Выйти из Zen HUD (Показать полный интерфейс)" : "Zen HUD (Режим второго монитора)"}
              className={`tactile-press ${isZenMode ? 'text-[var(--accent)] font-bold bg-[#368873]/20 border border-[var(--accent)]/40' : ''}`}
              onClick={() => {
                playClick();
                setIsZenMode(!isZenMode);
                showToast(isZenMode ? "Стандартный режим интерфейса" : "Zen HUD: Фокус на фарме для второго монитора");
              }}
            >
              <Monitor size={17} />
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
                  isZenMode={isZenMode}
                  onToggleZenMode={() => setIsZenMode(!isZenMode)}
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
              <span>Sentinel v3.0 · Mortuis_V</span>
              <span>&bull;</span>
              <span>TrophiesVault Verified</span>
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
    </div>
  );
};
