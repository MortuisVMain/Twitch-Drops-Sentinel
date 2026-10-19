import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sun, 
  SunMedium, 
  Moon, 
  Monitor, 
  Power, 
  VolumeX, 
  Volume2, 
  Clock, 
  Sparkles, 
  ShieldCheck, 
  EyeOff, 
  Laptop, 
  RotateCw, 
  Sliders, 
  Zap, 
  CheckCircle2, 
  Radio
} from 'lucide-react';
import { DimmerState, DisplayMonitor } from '../types';

interface ScreenDimmerViewProps {
  onBackToDashboard?: () => void;
  showToast?: (msg: string) => void;
}

const DEFAULT_DIMMER_STATE: DimmerState = {
  monitors: [
    {
      id: 'disp-primary',
      name: 'Основной дисплей',
      device_name: '\\\\.\\DISPLAY1',
      is_primary: true,
      is_laptop_internal: false,
      current_brightness: 80,
      min_brightness: 0,
      max_brightness: 100,
      supports_control: true,
    }
  ],
  master_brightness: 80,
  is_dimmed: false,
  is_blackout: false,
  solo_screen_index: null,
  sleep_timer_minutes: 0,
  away_mode_active: false,
  mute_audio_on_blackout: false,
};

export const ScreenDimmerView: React.FC<ScreenDimmerViewProps> = ({ onBackToDashboard, showToast }) => {
  const [dimmerState, setDimmerState] = useState<DimmerState>(DEFAULT_DIMMER_STATE);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  // Send message to C# Host if available, or fall back to REST API
  const sendDimmerCommand = useCallback(async (action: string, payload: any = {}) => {
    setIsUpdating(true);
    try {
      if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage({
          type: 'DIMMER_COMMAND',
          action,
          ...payload
        });
      } else {
        // Browser REST fallback
        const endpointMap: Record<string, string> = {
          GET_STATE: 'http://127.0.0.1:28492/api/v1/dimmer/state',
          SET_BRIGHTNESS: 'http://127.0.0.1:28492/api/v1/dimmer/brightness',
          SET_BLACKOUT: 'http://127.0.0.1:28492/api/v1/dimmer/blackout',
          SET_TIMER: 'http://127.0.0.1:28492/api/v1/dimmer/timer',
        };
        const url = endpointMap[action] || 'http://127.0.0.1:28492/api/v1/dimmer/state';
        const method = action === 'GET_STATE' ? 'GET' : 'POST';
        const resp = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'POST' ? JSON.stringify(payload) : undefined,
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.state) {
            setDimmerState(data.state);
          }
        }
      }
    } catch (err) {
      console.warn('Dimmer command error:', err);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  // Fetch initial state & listen for webview updates
  useEffect(() => {
    let isMounted = true;

    const fetchState = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:28492/api/v1/dimmer/state');
        if (resp.ok && isMounted) {
          const data = await resp.json();
          if (data && data.state) {
            setDimmerState(data.state);
          }
        }
      } catch {
        // Fallback or retry
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchState();

    // Listen for WebMessages from C#
    const handleWebMessage = (e: any) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data && data.type === 'DIMMER_STATE_CHANGED' && data.state) {
          setDimmerState(data.state);
        }
      } catch {}
    };

    if ((window as any).chrome?.webview) {
      (window as any).chrome.webview.addEventListener('message', handleWebMessage);
    }

    return () => {
      isMounted = false;
      if ((window as any).chrome?.webview) {
        (window as any).chrome.webview.removeEventListener('message', handleWebMessage);
      }
    };
  }, []);

  // Master brightness change
  const handleMasterBrightness = (val: number) => {
    setDimmerState(prev => ({
      ...prev,
      master_brightness: val,
      is_dimmed: val < 50,
      is_blackout: val === 0,
      monitors: prev.monitors.map(m => ({ ...m, current_brightness: val }))
    }));
    sendDimmerCommand('SET_BRIGHTNESS', { monitorId: 'master', level: val });
  };

  // Monitor-specific brightness change
  const handleMonitorBrightness = (monitorId: string, val: number) => {
    setDimmerState(prev => {
      const updated = prev.monitors.map(m => m.id === monitorId ? { ...m, current_brightness: val } : m);
      const avg = Math.round(updated.reduce((sum, m) => sum + m.current_brightness, 0) / updated.length);
      return {
        ...prev,
        monitors: updated,
        master_brightness: avg,
        is_dimmed: avg < 50,
      };
    });
    sendDimmerCommand('SET_BRIGHTNESS', { monitorId, level: val });
  };

  // Toggle Blackout
  const handleToggleBlackout = () => {
    const nextBlackout = !dimmerState.is_blackout;
    setDimmerState(prev => ({
      ...prev,
      is_blackout: nextBlackout,
      solo_screen_index: null,
      away_mode_active: nextBlackout,
    }));
    sendDimmerCommand('SET_BLACKOUT', { enabled: nextBlackout, soloIndex: null });
    showToast?.(nextBlackout ? 'Режим Blackout активирован (ПК не спит, экраны выключены)' : 'Режим Blackout отключен');
  };

  // Solo blackout
  const handleToggleSoloBlackout = (idx: number) => {
    const isCurrentSolo = dimmerState.solo_screen_index === idx;
    const nextSolo = isCurrentSolo ? null : idx;
    setDimmerState(prev => ({
      ...prev,
      is_blackout: nextSolo !== null,
      solo_screen_index: nextSolo,
    }));
    sendDimmerCommand('SET_BLACKOUT', { enabled: nextSolo !== null, soloIndex: nextSolo });
    showToast?.(nextSolo !== null ? `Затемнен только монитор #${idx + 1}` : 'Затемнение снято');
  };

  // Sleep Timer Selection
  const handleSelectSleepTimer = (minutes: number) => {
    setDimmerState(prev => ({
      ...prev,
      sleep_timer_minutes: minutes,
    }));
    sendDimmerCommand('SET_TIMER', { minutes });
    showToast?.(minutes > 0 ? `Таймер затемнения установлен на ${minutes} мин` : 'Таймер затемнения отключен');
  };

  // Dynamic Apple Luna Sun/Moon icon
  const getBrightnessIcon = (val: number) => {
    if (val >= 70) return <Sun className="w-5 h-5 text-amber-300" />;
    if (val >= 30) return <SunMedium className="w-5 h-5 text-[#73bba5]" />;
    if (val >= 1) return <Moon className="w-5 h-5 text-indigo-300" />;
    return <EyeOff className="w-5 h-5 text-rose-400" />;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ==================== Master Brightness Hero Card ==================== */}
      <section className="card p-6 md:p-8 bg-gradient-to-br from-[#1d2522] via-[#171d1c] to-[#121816] border border-[#303a35] relative overflow-hidden">
        {/* Glow backdrop */}
        <div 
          className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-700"
          style={{
            background: dimmerState.is_blackout 
              ? 'rgba(15, 23, 42, 0.4)' 
              : `rgba(115, 187, 165, ${Math.max(0.04, dimmerState.master_brightness / 350)})`
          }}
        />

        <div className="relative z-10 space-y-6">
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] text-[#73bba5]">
                  {getBrightnessIcon(dimmerState.master_brightness)}
                </span>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-[var(--foreground)] tracking-tight">
                    Общая яркость дисплеев
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Управление DDC/CI внешними мониторами и WMI-матрицами ноутбуков
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                dimmerState.is_blackout
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 animate-pulse'
                  : 'bg-[#368873]/15 border-[#73bba5]/30 text-[#73bba5]'
              }`}>
                <span className={`w-2 h-2 rounded-full ${dimmerState.is_blackout ? 'bg-rose-400' : 'bg-[#73bba5]'}`} />
                {dimmerState.is_blackout ? 'BLACKOUT АКТИВЕН' : `${dimmerState.master_brightness}% ЯРКОСТИ`}
              </span>

              <button
                aria-label="Обновить состояние"
                title="Пересканировать подключенные мониторы"
                onClick={() => sendDimmerCommand('GET_STATE')}
                className="p-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <RotateCw className={`w-4 h-4 ${isUpdating ? 'animate-spin text-[#73bba5]' : ''}`} />
              </button>
            </div>
          </div>

          {/* Master Slider & Live Value */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--muted)] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#73bba5]" />
                Мастер-слайдер
              </span>
              <span className="text-lg font-bold text-[#73bba5] tabular-nums">
                {dimmerState.master_brightness}%
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                disabled={dimmerState.is_blackout}
                value={dimmerState.master_brightness}
                onChange={(e) => handleMasterBrightness(parseInt(e.target.value, 10))}
                className="w-full h-3 bg-black/40 rounded-lg appearance-none cursor-pointer accent-[#73bba5] border border-[var(--line)] focus:outline-none focus:ring-2 focus:ring-[#73bba5]/40 transition-all disabled:opacity-40"
              />
            </div>
          </div>

          {/* Quick Preset Pills */}
          <div className="pt-2">
            <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2.5">
              Быстрые пресеты
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: '100% День', val: 100 },
                { label: '75% Комфорт', val: 75 },
                { label: '50% Вечер', val: 50 },
                { label: '25% Сумерки', val: 25 },
                { label: '10% Ночь', val: 10 },
                { label: '0% Темнота', val: 0 },
              ].map(preset => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => handleMasterBrightness(preset.val)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer tactile-press flex items-center justify-center gap-1.5 ${
                    dimmerState.master_brightness === preset.val && !dimmerState.is_blackout
                      ? 'bg-[#368873] border-[#73bba5] text-white shadow-sm'
                      : 'bg-[var(--surface-elevated)] border-[var(--line)] text-[var(--foreground)] hover:border-[#73bba5]/40'
                  }`}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Blackout Main Toggle Bar */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            dimmerState.is_blackout 
              ? 'bg-rose-500/10 border-rose-500/30' 
              : 'bg-black/30 border-[#303a35]'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border shrink-0 ${
                dimmerState.is_blackout 
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' 
                  : 'bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--line)]'
              }`}>
                <EyeOff className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <span>Режим полной темноты (Blackout)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80">
                    Alt + Backspace
                  </span>
                </div>
                <div className="text-xs text-[var(--muted)] leading-relaxed">
                  Погружает все экраны в 100% темноту. ПК продолжает фармить дропы и раздачи на 100% мощности (AwayMode).
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleBlackout}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer tactile-press shrink-0 flex items-center gap-2 ${
                dimmerState.is_blackout
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-[#368873] hover:bg-[#2d7462] text-white'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{dimmerState.is_blackout ? 'Выйти из Blackout' : 'Включить Blackout'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================== Connected Monitors Grid ==================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#73bba5]" />
            <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">
              Подключенные дисплеи ({dimmerState.monitors.length})
            </h3>
          </div>
          <span className="text-xs text-[var(--muted)]">
            DDC/CI DXVA2 & WMI Hub
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dimmerState.monitors.map((mon, idx) => {
            const isSoloDimmed = dimmerState.solo_screen_index === idx;
            return (
              <div 
                key={mon.id || idx}
                className={`card p-5 border transition-all flex flex-col justify-between space-y-4 ${
                  isSoloDimmed 
                    ? 'border-indigo-500/50 bg-indigo-500/5' 
                    : 'border-[var(--line)] bg-[var(--surface-elevated)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-black/30 border border-[var(--line)] text-[#73bba5] shrink-0">
                      {mon.is_laptop_internal ? <Laptop className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span>{mon.name || `Монитор #${idx + 1}`}</span>
                        {mon.is_primary && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#368873]/20 text-[#73bba5] border border-[#73bba5]/30">
                            ОСНОВНОЙ
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted)] font-mono">
                        {mon.device_name || 'Display Device'} &bull; {mon.is_laptop_internal ? 'WMI Panel' : 'DDC/CI External'}
                      </div>
                    </div>
                  </div>

                  <span className="text-sm font-bold text-[#73bba5] font-mono tabular-nums">
                    {mon.current_brightness}%
                  </span>
                </div>

                {/* Individual Monitor Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span>Уровень подсветки</span>
                    <span>{mon.current_brightness} / 100</span>
                  </div>
                  <input
                    type="range"
                    min={mon.min_brightness}
                    max={mon.max_brightness}
                    step="1"
                    disabled={dimmerState.is_blackout || isSoloDimmed}
                    value={mon.current_brightness}
                    onChange={(e) => handleMonitorBrightness(mon.id, parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-[#73bba5] border border-[var(--line)] disabled:opacity-40"
                  />
                </div>

                {/* Action Row */}
                <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#73bba5]" />
                    Аппаратный контроль OK
                  </span>

                  <button
                    type="button"
                    onClick={() => handleToggleSoloBlackout(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer tactile-press flex items-center gap-1.5 ${
                      isSoloDimmed 
                        ? 'bg-indigo-500 text-white border-indigo-400' 
                        : 'bg-black/20 hover:bg-black/40 text-[var(--muted)] hover:text-[var(--foreground)] border-[var(--line)]'
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>{isSoloDimmed ? 'Снять Solo' : 'Solo Blackout'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================== Night Care & Sleep Timer Bento ==================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sleep Timer Card */}
        <div className="card p-6 border border-[var(--line)] bg-[var(--surface-elevated)] space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">
                Таймер автозатемнения
              </h3>
              <p className="text-xs text-[var(--muted)]">
                Автоматический перевод экранов в Blackout через заданное время
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2">
            {[
              { label: 'Выкл', val: 0 },
              { label: '15м', val: 15 },
              { label: '30м', val: 30 },
              { label: '45м', val: 45 },
              { label: '60м', val: 60 },
              { label: '120м', val: 120 },
            ].map(timer => (
              <button
                key={timer.val}
                type="button"
                onClick={() => handleSelectSleepTimer(timer.val)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer tactile-press flex items-center justify-center ${
                  dimmerState.sleep_timer_minutes === timer.val
                    ? 'bg-[#368873] border-[#73bba5] text-white shadow-sm'
                    : 'bg-black/20 border-[var(--line)] text-[var(--foreground)] hover:border-[#73bba5]/40'
                }`}
              >
                <span>{timer.label}</span>
              </button>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-black/20 border border-[var(--line)] text-xs text-[var(--muted)] flex items-center justify-between">
            <span>Текущий статус таймера:</span>
            <span className="font-bold text-[#73bba5]">
              {dimmerState.sleep_timer_minutes > 0 
                ? `Активен (${dimmerState.sleep_timer_minutes} мин)` 
                : 'Отключен'}
            </span>
          </div>
        </div>

        {/* Hotkeys & Native Shield Card */}
        <div className="card p-6 border border-[var(--line)] bg-[var(--surface-elevated)] space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">
                Горячие клавиши и защита
              </h3>
              <p className="text-xs text-[var(--muted)]">
                Низкоуровневые скан-коды Windows (не зависят от раскладки)
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/20 border border-[var(--line)]">
              <span className="text-[var(--muted)]">Мгновенный Blackout</span>
              <kbd className="px-2 py-1 rounded bg-black/50 text-[#73bba5] font-mono border border-[var(--line)] font-bold">
                Alt + Backspace
              </kbd>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/20 border border-[var(--line)]">
              <span className="text-[var(--muted)]">Минимальная яркость (10%)</span>
              <kbd className="px-2 py-1 rounded bg-black/50 text-[var(--foreground)] font-mono border border-[var(--line)]">
                Alt + .
              </kbd>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/20 border border-[var(--line)]">
              <span className="text-[var(--muted)]">Сброс в 100% День</span>
              <kbd className="px-2 py-1 rounded bg-black/50 text-[var(--foreground)] font-mono border border-[var(--line)]">
                Alt + /
              </kbd>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
