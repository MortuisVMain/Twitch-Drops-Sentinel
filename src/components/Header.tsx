import React from 'react';
import { HardwareGuard, SentinelStats } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { 
  LayoutGrid, 
  Gamepad2, 
  Trophy, 
  SlidersHorizontal, 
  ChevronRight, 
  RotateCw, 
  ShieldCheck, 
  Zap, 
  Wifi, 
  Cpu, 
  Play, 
  Pause,
  Gift
} from 'lucide-react';

// Twitch Drops Sentinel v3 — Author: Mortuis_V / Mortuis_V_Studio
export type NavTab = 'dashboard' | 'shelf' | 'giveaways' | 'settings';

interface HeaderProps {
  hardware: HardwareGuard;
  stats: SentinelStats;
  connected: boolean;
  username: string;
  isDaemonActive?: boolean;
  onToggleDaemon?: () => void;
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  installedCount: number;
  trophiesCount: number;
  onManualRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  hardware,
  stats,
  connected,
  username,
  isDaemonActive = true,
  onToggleDaemon,
  currentTab,
  onSelectTab,
  installedCount,
  trophiesCount,
  onManualRefresh,
}) => {
  const { playClick } = useTactileAudio();

  const handleToggle = () => {
    playClick();
    if (onToggleDaemon) {
      onToggleDaemon();
    }
  };

  const handleTabClick = (tab: NavTab) => {
    playClick();
    onSelectTab(tab);
  };

  const isActive = isDaemonActive && !hardware.is_paused;

  const tabLabels: Record<NavTab, { label: string; icon: React.ElementType; badge?: string }> = {
    dashboard: { label: 'Дашборд', icon: LayoutGrid, badge: 'LIVE' },
    shelf: { label: 'Полка Игр', icon: Gamepad2, badge: `${installedCount}` },
    giveaways: { label: 'Раздачи', icon: Gift, badge: 'FREE' },
    settings: { label: 'Настройки', icon: SlidersHorizontal },
  };

  return (
    <header className="liquid-glass rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 select-none relative z-40 shadow-[0_8px_28px_rgba(0,0,0,0.35)] border border-white/10">
      {/* 1. Left Group: Apple Brand + Breadcrumbs */}
      <div className="flex items-center gap-3.5">
        {/* Brand Symbol (Luna 2.0 Tilted Squircle) */}
        <div 
          onClick={() => handleTabClick('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer group"
          title="Twitch Drops Sentinel v3"
        >
          <div className="relative w-9 h-9 bg-gradient-to-br from-[#368873] to-[#277763] text-white flex items-center justify-center rounded-[11px] shadow-[0_3px_10px_rgba(39,119,99,0.35)] transform -rotate-3 transition-transform group-hover:rotate-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white transform -rotate-3">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#d6f2e5] rounded-full animate-pulse" />
          </div>

          <div className="flex flex-col">
            <div className="text-sm font-extrabold tracking-tight text-[#f0f6fc] flex items-center">
              sentinel<span className="text-[#73bba5] text-base leading-none">.</span>
            </div>
            <span className="text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider leading-none">
              ТИХИЙ СТРАЖ
            </span>
          </div>
        </div>

        {/* Apple Breadcrumb Divider */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-white/10 text-xs text-[#8b949e]">
          <span>Рабочее пространство</span>
          <ChevronRight size={13} className="text-[#6e7681]" />
          <span className="text-[#f0f6fc] font-semibold flex items-center gap-1.5">
            {tabLabels[currentTab].label}
            <span className="text-[9px] px-1.5 py-0.2 rounded border border-[#73bba5]/40 text-[#73bba5] bg-[#73bba5]/10 font-bold uppercase">
              PRO
            </span>
          </span>
        </div>
      </div>

      {/* 2. Center: macOS Segmented Navigation Control */}
      <nav className="flex items-center bg-[#0d1117]/80 border border-white/10 p-1 rounded-xl shadow-inner gap-1 order-3 lg:order-2 w-full lg:w-auto justify-center">
        {(Object.keys(tabLabels) as NavTab[]).map((tabKey) => {
          const tab = tabLabels[tabKey];
          const Icon = tab.icon;
          const isSelected = currentTab === tabKey;

          return (
            <button
              key={tabKey}
              onClick={() => handleTabClick(tabKey)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all relative cursor-pointer active:scale-95 ${
                isSelected
                  ? 'bg-[#73bba5]/20 text-[#73bba5] border border-[#73bba5]/35 font-semibold shadow-sm'
                  : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon size={14} className={isSelected ? 'text-[#73bba5]' : 'text-[#8b949e]'} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSelected 
                    ? 'bg-[#73bba5]/25 text-[#d6f2e5]' 
                    : 'bg-white/10 text-[#8b949e]'
                }`}>
                  {tab.badge}
                </span>
              )}
              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#73bba5] ml-0.5" />}
            </button>
          );
        })}
      </nav>

      {/* 3. Right: System Host & Telemetry Badges & Power Switch */}
      <div className="flex items-center gap-2.5 order-2 lg:order-3">
        {/* Host Status Badge (Apple Native Indicator) */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-[#8b949e]" title="Нативный десктопный хост Windows WebView2">
          <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
          <span>Windows Native</span>
        </div>

        {/* Hardware Guard Pills */}
        <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-[#8b949e]">
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 tabular-nums">
            GPU {hardware.gpu_percent || 8}%
          </span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 tabular-nums">
            {hardware.ping_ms || 18}ms
          </span>
        </div>

        {/* Manual Refresh Button */}
        {onManualRefresh && (
          <button
            onClick={() => {
              playClick();
              onManualRefresh();
            }}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[#8b949e] hover:text-[#f0f6fc] transition-all cursor-pointer"
            title="Синхронизировать состояние с Twitch API"
          >
            <RotateCw size={14} />
          </button>
        )}

        {/* Power Daemon Switch Capsule */}
        <button
          onClick={handleToggle}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
            isActive
              ? 'bg-[#73bba5]/15 border-[#73bba5]/40 text-[#73bba5] shadow-[0_0_15px_rgba(115,187,165,0.2)]'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          }`}
          title={isActive ? 'Кликните, чтобы приостановить демон' : 'Кликните, чтобы возобновить демон'}
        >
          {isActive ? <Play size={12} className="fill-current" /> : <Pause size={12} className="fill-current" />}
          <span>{isActive ? 'Активен' : 'Пауза'}</span>
        </button>
      </div>
    </header>
  );
};
