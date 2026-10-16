import React from 'react';
import { Activity, Gamepad2, Gift, Sliders } from 'lucide-react';

export type NavTab = 'dashboard' | 'shelf' | 'giveaways' | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  trophiesCount: number;
  installedCount: number;
  giveawaysCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  trophiesCount,
  installedCount,
  giveawaysCount = 0,
}) => {
  const tabs = [
    {
      id: 'dashboard' as NavTab,
      label: 'Обзор фарма',
      icon: Activity,
      badge: 'LIVE',
      badgeColor: 'bg-[#368873]/25 text-[#73bba5] border-[#73bba5]/40'
    },
    {
      id: 'shelf' as NavTab,
      label: 'Полка Игр',
      icon: Gamepad2,
      badge: `${installedCount} ПК`,
      badgeColor: 'bg-[#368873]/20 text-[#73bba5] border-[#73bba5]/35'
    },
    {
      id: 'giveaways' as NavTab,
      label: 'Раздачи',
      icon: Gift,
      badge: giveawaysCount > 0 ? `${giveawaysCount}` : 'FREE',
      badgeColor: 'bg-[#368873]/20 text-[#73bba5] border-[#73bba5]/35'
    },
    {
      id: 'settings' as NavTab,
      label: 'Параметры',
      icon: Sliders
    }
  ];

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 p-2 luna-glass-dock rounded-2xl max-w-2xl select-none transition-all duration-300">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 sm:px-5 rounded-xl text-xs font-semibold transition-all duration-200 relative cursor-pointer active:scale-95 min-h-[48px] whitespace-nowrap shrink-0 tactile-press ${
              isActive
                ? 'bg-gradient-to-r from-[#217C5E] to-[#3AD29F] text-[#050608] font-bold shadow-[0_4px_16px_rgba(58,210,159,0.3)] border border-[#7CE8C2]/40'
                : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/[0.04]'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'text-[#050608] scale-110' : 'text-[var(--muted)]'}`} />
            <span className="tracking-tight">{tab.label}</span>
            {tab.badge && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border tabular-nums ${
                isActive
                  ? 'bg-white/20 text-white border-white/30 shadow-sm'
                  : tab.badgeColor || 'bg-white/[0.08] text-[var(--muted)] border-[var(--line)]'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
