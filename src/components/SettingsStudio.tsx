import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Power,
  RefreshCw,
  Sliders,
  Volume2,
  Gamepad2,
  BatteryCharging,
  Coins,
  CheckCircle2,
  FolderSync,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import { SentinelSettings, SentinelStats } from '../types';

interface SettingsStudioProps {
  settings: SentinelSettings;
  stats: SentinelStats;
  onUpdateSettings: (newSettings: Partial<SentinelSettings>) => void;
  onRescanGames?: () => void;
  isScanning?: boolean;
  onBack?: () => void;
  onOpenVaultFile?: () => void;
}

export const SettingsStudio: React.FC<SettingsStudioProps> = ({
  settings,
  stats,
  onUpdateSettings,
  onRescanGames,
  isScanning = false,
  onBack,
  onOpenVaultFile,
}) => {
  const [testCountdown, setTestCountdown] = useState<number | null>(null);

  const startTestShutdown = () => {
    setTestCountdown(5);
    const interval = setInterval(() => {
      setTestCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto select-none pb-12 animate-in fade-in duration-300">
      {/* Studio Header Card (Luna 2.0 Obsidian Glass) */}
      <div className="card p-6 md:p-8 relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--line)] text-xs font-semibold text-[var(--foreground)] transition-all shadow-sm active:scale-95 group shrink-0 cursor-pointer"
                title="Вернуться в обзор фарма"
              >
                <ArrowLeft className="w-4 h-4 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
                <span>Назад в Обзор</span>
              </button>
            )}
            <div className="p-3 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--line)] text-[var(--accent)] shadow-sm">
              <Settings className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--foreground)]">Параметры & Архитектура</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Twitch Drops Sentinel v3.0 &bull; Mortuis_V_Studio
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenVaultFile && (
              <button
                onClick={onOpenVaultFile}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--line)] text-xs font-semibold text-[var(--foreground)] transition-all cursor-pointer shadow-sm active:scale-95"
                title="Открыть локальный журнал Trophies.md на диске"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Журнал Trophies.md</span>
              </button>
            )}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#368873]/15 border border-[#73bba5]/30 text-[var(--accent)] text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-[#73bba5]" />
              <span>Twitch Session: Mortuis_V (Активна)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Settings Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Luna Auto-Shutdown Engine */}
        <div className="card p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Luna Auto-Shutdown</h3>
                <p className="text-xs text-[var(--muted)]">Автовыключение ПК после завершения всех дропов</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Выключать при завершении</div>
                  <div className="text-[11px] text-[var(--muted)]">После фарма всех выбранных игр</div>
                </div>
                {/* Tactile Apple Studio Switch */}
                <button
                  type="button"
                  aria-label="Переключить автовыключение"
                  onClick={() => onUpdateSettings({ auto_shutdown_on_complete: !settings.auto_shutdown_on_complete })}
                  className={`studio-switch ${settings.auto_shutdown_on_complete ? 'checked' : ''}`}
                >
                  <span />
                </button>
              </div>

              {/* Mode Selector */}
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted)] font-semibold">Режим выключения</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['shutdown', 'sleep', 'lock'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onUpdateSettings({ auto_shutdown_mode: mode })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition-all cursor-pointer ${
                        settings.auto_shutdown_mode === mode
                          ? 'bg-[#368873] border-[#73bba5] text-white shadow-sm'
                          : 'bg-[var(--surface-elevated)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {mode === 'shutdown' ? 'Power Off' : mode === 'sleep' ? 'Сон' : 'Блокировка'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            {testCountdown !== null ? (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between">
                <span className="text-xs text-rose-300 font-semibold tabular-nums">
                  Тест Luna: таймер {testCountdown}с...
                </span>
                <button
                  onClick={() => setTestCountdown(null)}
                  className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                onClick={startTestShutdown}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-white/[0.06] border border-[var(--line)] text-[var(--foreground)] text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                Протестировать таймер Luna (5с)
              </button>
            )}
          </div>
        </div>

        {/* Hardware Guard & Gaming Detector */}
        <div className="card p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Hardware Guard</h3>
                <p className="text-xs text-[var(--muted)]">Защита пинга и производительности системы</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <Gamepad2 className="w-4 h-4 text-[var(--accent)]" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--foreground)]">Автопауза в играх</div>
                    <div className="text-[11px] text-[var(--muted)]">138 игр на ПК в базе мониторинга</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Переключить автопаузу в играх"
                  onClick={() => onUpdateSettings({ pause_on_gaming: !settings.pause_on_gaming })}
                  className={`studio-switch ${settings.pause_on_gaming ? 'checked' : ''}`}
                >
                  <span />
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <BatteryCharging className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--foreground)]">Энергосбережение батареи</div>
                    <div className="text-[11px] text-[var(--muted)]">Пауза при работе от аккумулятора</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Переключить энергосбережение батареи"
                  onClick={() => onUpdateSettings({ pause_on_battery: !settings.pause_on_battery })}
                  className={`studio-switch ${settings.pause_on_battery ? 'checked' : ''}`}
                >
                  <span />
                </button>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] text-xs text-[var(--muted)] flex items-center justify-between font-mono">
            <span className="tabular-nums">RTX 5070 Ti / 32 GB RAM</span>
            <span className="font-semibold text-[var(--accent)]">Hardware Guard OK</span>
          </div>
        </div>
      </div>

      {/* Library Rescan & Farming Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Local Games Library */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Каталог игр ПК</h3>
              <p className="text-xs text-[var(--muted)]">Steam, E:\Games, E:\Games Cracked</p>
            </div>
          </div>

          <p className="text-xs text-[var(--muted)] leading-relaxed">
            В каталоге обнаружено 138 локальных игр. При выходе новых Twitch Drops для ваших установленных игр Sentinel автоматически поставит их в наивысший приоритет.
          </p>

          <button
            onClick={onRescanGames}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-semibold border border-[#73bba5]/40 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Сканирование дисков...' : 'Пересканировать установленные игры'}</span>
          </button>
        </div>

        {/* Priority Strategy */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Стратегия Фарма</h3>
              <p className="text-xs text-[var(--muted)]">Логика выбора каналов при отсутствии стримов</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {[
              {
                mode: 0,
                title: '🎯 Только игры из приоритета (Строгий режим — Рекомендуется)',
                desc: 'Фармит исключительно игры из вашего списка ТОПа. Если раздач по ним нет — ожидает старта кампаний, не распыляясь на сторонние токены.',
              },
              {
                mode: 1,
                title: '⚡ Приоритет + Любые активные (Fallback-режим)',
                desc: 'Фармит выбранные игры. Если стримов по ним нет — автоматически собирает любые доступные дропы на Twitch.',
              },
              {
                mode: 2,
                title: '⏳ Приоритет + Редкие кампании',
                desc: 'Фармит приоритет, затем кампании с наименьшим оставшимся временем доступности.',
              },
            ].map((item) => (
              <button
                key={item.mode}
                onClick={() => onUpdateSettings({ priority_mode: item.mode })}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  (settings.priority_mode ?? 0) === item.mode
                    ? 'bg-[#368873]/15 border-[#73bba5] text-[var(--foreground)] shadow-sm'
                    : 'bg-[var(--surface-elevated)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <div className="text-xs font-semibold text-[var(--foreground)]">{item.title}</div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5 leading-snug">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Notifications & Points */}
        <div className="card p-6 space-y-4 md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Баллы канала & Уведомления</h3>
              <p className="text-xs text-[var(--muted)]">Автоматический сбор бонусов стримеров и звуковые оповещения</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Coins className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Всего баллов собрано</div>
                  <div className="text-base md:text-lg font-bold text-amber-300 tabular-nums">+{stats.channel_points_earned.toLocaleString()}</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/30">
                Auto-Claimer ON
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-4 h-4 text-[var(--muted)]" />
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Звуковой сигнал Apple Chime</div>
                  <div className="text-[11px] text-[var(--muted)]">При получении трофея</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Переключить звуковой сигнал"
                onClick={() => onUpdateSettings({ native_toasts: !settings.native_toasts })}
                className={`studio-switch ${settings.native_toasts ? 'checked' : ''}`}
              >
                <span />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="text-center pt-4 pb-2 text-[11px] text-[var(--muted)] space-y-1">
        <div>Twitch Drops Sentinel v3.0</div>
        <div>Crafted with precision by Mortuis_V & Mortuis_V_Studio &bull; 2026</div>
      </div>
    </div>
  );
};
