import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Sun, 
  SunMedium, 
  Moon, 
  Monitor, 
  Power, 
  Clock, 
  Sparkles, 
  ShieldCheck, 
  EyeOff, 
  Laptop, 
  RotateCw, 
  Sliders, 
  Zap, 
  CheckCircle2, 
  Link2,
  Unlink2,
  Keyboard,
  Info,
  X
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
      name: 'Основной монитор (LG UltraGear 27GP850)',
      device_name: '\\\\.\\DISPLAY1',
      is_primary: true,
      is_laptop_internal: false,
      current_brightness: 75,
      min_brightness: 0,
      max_brightness: 100,
      supports_control: true,
    },
    {
      id: 'disp-secondary',
      name: 'Второй монитор (ASUS ProArt PA278CV)',
      device_name: '\\\\.\\DISPLAY2',
      is_primary: false,
      is_laptop_internal: false,
      current_brightness: 75,
      min_brightness: 0,
      max_brightness: 100,
      supports_control: true,
    }
  ],
  master_brightness: 75,
  is_dimmed: false,
  is_blackout: false,
  solo_screen_index: null,
  sleep_timer_minutes: 0,
  away_mode_active: false,
  mute_audio_on_blackout: false,
};

export const ScreenDimmerView: React.FC<ScreenDimmerViewProps> = ({ showToast }) => {
  const [dimmerState, setDimmerState] = useState<DimmerState>(DEFAULT_DIMMER_STATE);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isLinked, setIsLinked] = useState<boolean>(true);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('disp-primary');
  const [showBlackoutOverlay, setShowBlackoutOverlay] = useState<boolean>(false);

  // Двойной канал: синхронная отправка на REST API и уведомление C# Host (WebView2)
  const sendDimmerCommand = useCallback(async (action: string, payload: any = {}) => {
    setIsUpdating(true);
    try {
      // 1. Отправляем в C# Host для нативного аппаратного управления
      if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage({
          type: 'DIMMER_COMMAND',
          action,
          ...payload
        });
      }

      // 2. Отправляем в Python REST API для сохранения состояния и бэкенд-таймеров
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
        const incomingState = data.state || (data.master_brightness !== undefined ? data : null);
        if (incomingState) {
          setDimmerState(prev => ({
            ...prev,
            ...incomingState,
            monitors: incomingState.monitors && incomingState.monitors.length > 0 
              ? incomingState.monitors 
              : prev.monitors
          }));
        }
      }
    } catch (err) {
      console.warn('Dimmer sync warning (operating in resilient local state):', err);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  // Первоначальная загрузка состояния
  useEffect(() => {
    let isMounted = true;
    const fetchState = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:28492/api/v1/dimmer/state');
        if (resp.ok && isMounted) {
          const data = await resp.json();
          const incomingState = data.state || (data.master_brightness !== undefined ? data : null);
          if (incomingState) {
            setDimmerState(prev => ({
              ...prev,
              ...incomingState,
              monitors: incomingState.monitors && incomingState.monitors.length > 0 
                ? incomingState.monitors 
                : prev.monitors
            }));
          }
        }
      } catch {
        // Fallback to offline resilient state
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchState();

    // Слушатель веб-сообщений из C#
    const handleWebMessage = (e: any) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'DIMMER_STATE_CHANGED' && data.state) {
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

  // Глобальный хоткей Alt + Backspace для Blackout
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.code === 'Backspace' || e.key === 'Backspace')) {
        e.preventDefault();
        handleToggleBlackout();
      } else if (e.key === 'Escape' && showBlackoutOverlay) {
        handleDismissBlackout();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBlackoutOverlay, dimmerState.is_blackout]);

  const handleMasterBrightness = (val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setDimmerState(prev => ({
      ...prev,
      master_brightness: clamped,
      is_dimmed: clamped < 50,
      is_blackout: clamped === 0,
      monitors: prev.monitors.map(m => ({ ...m, current_brightness: clamped }))
    }));
    sendDimmerCommand('SET_BRIGHTNESS', { monitorId: 'master', level: clamped });
  };

  const handleMonitorBrightness = (monitorId: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setDimmerState(prev => {
      const updated = prev.monitors.map(m => m.id === monitorId ? { ...m, current_brightness: clamped } : m);
      const avg = Math.round(updated.reduce((sum, m) => sum + m.current_brightness, 0) / updated.length);
      return {
        ...prev,
        monitors: updated,
        master_brightness: avg,
        is_dimmed: avg < 50,
      };
    });
    sendDimmerCommand('SET_BRIGHTNESS', { monitorId, level: clamped });
  };

  const handleToggleBlackout = () => {
    const next = !dimmerState.is_blackout;
    setDimmerState(prev => ({
      ...prev,
      is_blackout: next,
      solo_screen_index: null,
      away_mode_active: next
    }));
    setShowBlackoutOverlay(next);
    sendDimmerCommand('SET_BLACKOUT', { enabled: next, soloIndex: null });
    showToast?.(next ? '🌙 Blackout активирован: ПК не спит, экраны выключены' : '☀️ Blackout отключен: исходная подсветка восстановлена');
  };

  const handleDismissBlackout = () => {
    setDimmerState(prev => ({
      ...prev,
      is_blackout: false,
      solo_screen_index: null,
      away_mode_active: false
    }));
    setShowBlackoutOverlay(false);
    sendDimmerCommand('SET_BLACKOUT', { enabled: false, soloIndex: null });
    showToast?.('☀️ Blackout отключен');
  };

  const handleToggleSoloBlackout = (idx: number) => {
    const isCurrentSolo = dimmerState.solo_screen_index === idx;
    const nextSolo = isCurrentSolo ? null : idx;
    setDimmerState(prev => ({
      ...prev,
      is_blackout: nextSolo !== null,
      solo_screen_index: nextSolo,
    }));
    sendDimmerCommand('SET_BLACKOUT', { enabled: nextSolo !== null, soloIndex: nextSolo });
    showToast?.(nextSolo !== null ? `Затемнен монитор #${idx + 1}` : 'Индивидуальное затемнение снято');
  };

  const handleSelectSleepTimer = (minutes: number) => {
    setDimmerState(prev => ({
      ...prev,
      sleep_timer_minutes: minutes,
    }));
    sendDimmerCommand('SET_TIMER', { minutes });
    showToast?.(minutes > 0 ? `Таймер затемнения установлен на ${minutes} мин` : 'Таймер отключен');
  };

  const getBrightnessIcon = (val: number) => {
    if (val >= 70) return <Sun className="w-5 h-5 text-amber-300" />;
    if (val >= 30) return <SunMedium className="w-5 h-5 text-[#73bba5]" />;
    if (val >= 1) return <Moon className="w-5 h-5 text-indigo-300" />;
    return <EyeOff className="w-5 h-5 text-rose-400" />;
  };

  return (
    <div className="space-y-6 select-none animate-fadeIn pb-12">
      {/* ==================== 1. PAGE HEADER ==================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-[#202725] border border-[#303a35] shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold font-mono tracking-widest text-[#73bba5] uppercase">
            <span className="w-2 h-2 rounded-full bg-[#73bba5] animate-pulse" />
            АППАРАТНЫЙ КОНТРОЛЬ ЯРКОСТИ
          </div>
          <h1 className="text-xl md:text-2xl font-black text-[#e9eeec] tracking-tight">
            Управление дисплеями и ночной режим
          </h1>
          <p className="text-xs text-[#8b9a94]">
            Низкоуровневая регулировка DDC/CI внешних мониторов и WMI матриц ноутбука без мерцания подсветки
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-[#28322e] border border-[#303a35] text-xs font-semibold text-[#e9eeec] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#73bba5]" />
            <span>DDC/CI & WMI · Прямой доступ</span>
          </div>
          <button
            onClick={() => sendDimmerCommand('GET_STATE')}
            className="p-2.5 rounded-xl bg-[#28322e] border border-[#303a35] text-[#8b9a94] hover:text-[#e9eeec] transition-colors cursor-pointer active:scale-95"
            title="Пересканировать шину DDC/CI"
          >
            <RotateCw className={`w-4 h-4 ${isUpdating ? 'animate-spin text-[#73bba5]' : ''}`} />
          </button>
        </div>
      </div>

      {/* ==================== 2. VISUAL DISPLAY STAGE ==================== */}
      <section className="relative rounded-3xl overflow-hidden border border-[#303a35] bg-gradient-to-b from-[#202725] via-[#171d1c] to-[#121816] p-6 shadow-xl">
        {/* Ambient Orbit & Lighting */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-30 bg-[#368873]" />
        
        <div className="relative z-10 flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#73bba5]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#e9eeec]">
              Физическое расположение дисплеев ({dimmerState.monitors.length})
            </span>
          </div>

          <button
            onClick={() => setIsLinked(!isLinked)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2 transition-all cursor-pointer ${
              isLinked 
                ? 'bg-[#368873]/20 border-[#73bba5]/40 text-[#73bba5]' 
                : 'bg-[#28322e] border-[#303a35] text-[#8b9a94]'
            }`}
          >
            {isLinked ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
            <span>{isLinked ? 'Связаны (Синхронно)' : 'Раздельно'}</span>
          </button>
        </div>

        {/* Display Silhouettes Row */}
        <div className="relative z-10 flex items-end justify-center gap-8 py-4 min-h-[160px]">
          {dimmerState.monitors.map((mon, idx) => {
            const isSelected = selectedMonitorId === mon.id;
            const darkOpacity = dimmerState.is_blackout 
              ? 0.98 
              : Math.max(0, (100 - mon.current_brightness) / 100 * 0.88);

            return (
              <div 
                key={mon.id}
                onClick={() => setSelectedMonitorId(mon.id)}
                className={`flex flex-col items-center cursor-pointer transition-all duration-300 ${
                  isSelected ? 'scale-105' : 'opacity-85 hover:opacity-100'
                }`}
              >
                {/* Physical Monitor Bezel */}
                <div className="relative w-40 h-24 rounded-lg bg-[#28322e] border-4 border-[#3a4640] p-1 shadow-2xl flex flex-col justify-between overflow-hidden">
                  {/* Wallpaper Canvas with Dynamic Darkness */}
                  <div className="relative w-full h-full rounded bg-gradient-to-tr from-[#1b2b25] via-[#2d4a3e] to-[#487363] overflow-hidden">
                    <div 
                      className="absolute inset-0 bg-black transition-opacity duration-300"
                      style={{ opacity: darkOpacity }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow">
                        {dimmerState.is_blackout ? 'BLACKOUT' : `${mon.current_brightness}%`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stand Neck & Base */}
                {!mon.is_laptop_internal && (
                  <>
                    <div className="w-4 h-3 bg-[#3a4640]" />
                    <div className="w-16 h-1.5 rounded-full bg-[#48564f] shadow-md" />
                  </>
                )}
                {mon.is_laptop_internal && (
                  <div className="w-44 h-2 rounded-b-md bg-[#3a4640] shadow-md" />
                )}

                {/* Label */}
                <div className="mt-2.5 text-center">
                  <div className="text-xs font-bold text-[#e9eeec] flex items-center gap-1.5 justify-center">
                    <span>{mon.is_laptop_internal ? '💻' : '🖥️'} #{idx + 1}</span>
                    {mon.is_primary && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#368873]/30 text-[#73bba5] font-mono">
                        MAIN
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#8b9a94] font-mono">
                    {mon.current_brightness}% яркости
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative z-10 pt-4 border-t border-[#303a35] mt-4 flex items-center justify-between text-xs text-[#8b9a94]">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#73bba5]" />
            {dimmerState.monitors.length} дисплея подключены · Плавный переход 300мс
          </span>
          <span className="font-mono text-[11px]">
            Alt + Backspace для мгновенного Blackout
          </span>
        </div>
      </section>

      {/* ==================== 3. MASTER BRIGHTNESS HERO ==================== */}
      <section className="p-6 md:p-8 rounded-3xl bg-[#202725] border border-[#303a35] shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#28322e] border border-[#303a35] text-[#73bba5]">
              {getBrightnessIcon(dimmerState.master_brightness)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#e9eeec]">
                Общая яркость всех дисплеев
              </h2>
              <p className="text-xs text-[#8b9a94]">
                Синхронная регулировка аппаратной подсветки с сохранением калибровки цвета
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-[#73bba5] font-mono tabular-nums tracking-tight">
              {dimmerState.master_brightness}%
            </span>
          </div>
        </div>

        {/* Master Slider with Mint Gradient Track */}
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleMasterBrightness(dimmerState.master_brightness - 5)}
              className="p-2.5 rounded-xl bg-[#28322e] border border-[#303a35] text-[#8b9a94] hover:text-[#e9eeec] cursor-pointer active:scale-95 transition-all"
              title="Уменьшить на 5%"
            >
              <Moon className="w-4 h-4" />
            </button>

            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                disabled={dimmerState.is_blackout}
                value={dimmerState.master_brightness}
                onChange={(e) => handleMasterBrightness(parseInt(e.target.value, 10))}
                style={{
                  background: `linear-gradient(to right, #368873 0%, #73bba5 ${dimmerState.master_brightness}%, #171d1c ${dimmerState.master_brightness}%, #171d1c 100%)`
                }}
                className="w-full h-3 rounded-lg appearance-none cursor-pointer border border-[#303a35] accent-[#73bba5] focus:outline-none focus:ring-2 focus:ring-[#73bba5]/40 disabled:opacity-40 transition-all"
              />
            </div>

            <button
              onClick={() => handleMasterBrightness(dimmerState.master_brightness + 5)}
              className="p-2.5 rounded-xl bg-[#28322e] border border-[#303a35] text-[#8b9a94] hover:text-[#e9eeec] cursor-pointer active:scale-95 transition-all"
              title="Увеличить на 5%"
            >
              <Sun className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1-Click Quick Presets */}
        <div className="pt-6 mt-6 border-t border-[#303a35]">
          <div className="text-[11px] font-semibold text-[#8b9a94] uppercase tracking-wider mb-3">
            Быстрые пресеты в 1 клик
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { label: 'Блэкаут 0%', val: 0, icon: EyeOff },
              { label: 'Ночь 15%', val: 15, icon: Moon },
              { label: 'Комфорт 40%', val: 40, icon: SunMedium },
              { label: 'Работа 75%', val: 75, icon: Sun },
              { label: 'Максимум 100%', val: 100, icon: Sparkles },
            ].map(preset => {
              const IconComp = preset.icon;
              const isActive = dimmerState.master_brightness === preset.val && !dimmerState.is_blackout;
              return (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => handleMasterBrightness(preset.val)}
                  className={`py-3 px-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                    isActive
                      ? 'bg-[#368873] border-[#73bba5] text-white shadow-md'
                      : 'bg-[#28322e] border-[#303a35] text-[#e9eeec] hover:border-[#73bba5]/50'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================== 4. CONNECTED MONITORS LIST ==================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#73bba5]" />
            <h3 className="text-sm font-bold text-[#e9eeec] uppercase tracking-wider">
              Подключенные мониторы ({dimmerState.monitors.length})
            </h3>
          </div>
          <span className="text-xs text-[#8b9a94]">
            Индивидуальная калибровка каждого дисплея
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dimmerState.monitors.map((mon, idx) => {
            const isSoloDimmed = dimmerState.solo_screen_index === idx;
            return (
              <div 
                key={mon.id}
                className={`p-5 rounded-3xl border transition-all flex flex-col justify-between space-y-4 ${
                  isSoloDimmed 
                    ? 'border-indigo-500/50 bg-[#28322e]' 
                    : 'border-[#303a35] bg-[#202725]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-[#171d1c] border border-[#303a35] text-[#73bba5]">
                      {mon.is_laptop_internal ? <Laptop className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#e9eeec] flex items-center gap-2">
                        <span>{mon.name}</span>
                        {mon.is_primary && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#368873]/25 text-[#73bba5] border border-[#73bba5]/30">
                            ОСНОВНОЙ
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#8b9a94] font-mono mt-0.5">
                        {mon.device_name} &bull; {mon.is_laptop_internal ? 'WMI Panel' : 'DDC/CI DXVA2'}
                      </div>
                    </div>
                  </div>

                  <span className="text-base font-bold text-[#73bba5] font-mono tabular-nums">
                    {mon.current_brightness}%
                  </span>
                </div>

                {/* Individual Monitor Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#8b9a94]">
                    <span>Яркость матрицы</span>
                    <span>{mon.current_brightness} / 100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={dimmerState.is_blackout || isSoloDimmed}
                    value={mon.current_brightness}
                    onChange={(e) => handleMonitorBrightness(mon.id, parseInt(e.target.value, 10))}
                    style={{
                      background: `linear-gradient(to right, #368873 0%, #73bba5 ${mon.current_brightness}%, #171d1c ${mon.current_brightness}%, #171d1c 100%)`
                    }}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#73bba5] border border-[#303a35] disabled:opacity-40"
                  />
                </div>

                {/* Action Row */}
                <div className="pt-3 border-t border-[#303a35] flex items-center justify-between">
                  <span className="text-xs text-[#73bba5] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>DDC/CI Активен</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleToggleSoloBlackout(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                      isSoloDimmed 
                        ? 'bg-indigo-500 text-white border-indigo-400' 
                        : 'bg-[#28322e] hover:bg-[#303a35] text-[#8b9a94] hover:text-[#e9eeec] border-[#303a35]'
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>{isSoloDimmed ? 'Снять затемнение' : 'Solo Blackout'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================== 5. SPECIAL MODES & SAFETY BENTO ==================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Night Blackout Card */}
        <div className="p-6 rounded-3xl bg-[#202725] border border-[#303a35] shadow-lg flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                <Moon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#e9eeec]">
                  Ночной Блэкаут (Защита от ожогов глаз)
                </h3>
                <p className="text-xs text-[#8b9a94] mt-0.5">
                  Погружает все экраны в 100% темноту. ПК продолжает фармить дропы в фоне.
                </p>
              </div>
            </div>

            <kbd className="px-2.5 py-1 rounded-xl bg-[#171d1c] border border-[#303a35] text-[11px] font-mono text-[#73bba5] font-bold shrink-0">
              Alt + Backspace
            </kbd>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[#8b9a94]">
              Снятие в 1 клик мышью в любом месте экрана
            </span>

            <button
              onClick={handleToggleBlackout}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2 ${
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

        {/* Sleep Timer Card */}
        <div className="p-6 rounded-3xl bg-[#202725] border border-[#303a35] shadow-lg flex flex-col justify-between space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#368873]/20 border border-[#73bba5]/30 text-[#73bba5]">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#e9eeec]">
                Таймер сна дисплеев
              </h3>
              <p className="text-xs text-[#8b9a94] mt-0.5">
                Автоматическое выключение экранов после засыпания пользователя
              </p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 pt-1">
            {[
              { label: 'Выкл', val: 0 },
              { label: '15 мин', val: 15 },
              { label: '30 мин', val: 30 },
              { label: '45 мин', val: 45 },
              { label: '60 мин', val: 60 },
            ].map(timer => (
              <button
                key={timer.val}
                type="button"
                onClick={() => handleSelectSleepTimer(timer.val)}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                  dimmerState.sleep_timer_minutes === timer.val
                    ? 'bg-[#368873] border-[#73bba5] text-white shadow-sm'
                    : 'bg-[#28322e] border-[#303a35] text-[#e9eeec] hover:border-[#73bba5]/40'
                }`}
              >
                {timer.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== 6. MATRIX SAFETY BANNER ==================== */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#202725] via-[#1a221f] to-[#171d1c] border border-[#303a35] shadow-lg flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-[#368873]/20 border border-[#73bba5]/30 text-[#73bba5] shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-[#e9eeec] flex items-center gap-2">
            <span>Безопасность матрицы & AwayMode</span>
            <span className="px-2 py-0.5 rounded-full bg-[#73bba5]/20 text-[#73bba5] text-[9px] font-mono">
              ZERO GPU LOAD
            </span>
          </div>
          <p className="text-xs text-[#8b9a94] leading-relaxed">
            Sentinel не выключает видеокарту и не блокирует PCI-E шину, а плавно снижает яркость физической подсветки матрицы до нуля через протокол DDC/CI. Режим AwayMode предотвращает переход Windows в сон во время ночного сбора наград.
          </p>
        </div>
      </div>

      {/* ==================== 7. FULLSCREEN BLACKOUT OVERLAY ==================== */}
      {showBlackoutOverlay && (
        <div 
          onClick={handleDismissBlackout}
          className="fixed inset-0 z-[9999] bg-black cursor-pointer flex flex-col items-center justify-center text-center p-8 select-none animate-fadeIn"
        >
          <div className="space-y-4 max-w-md pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-[#171d1c] border border-white/10 mx-auto flex items-center justify-center text-indigo-300">
              <Moon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white/90">Время тишины.</h2>
            <p className="text-xs text-white/60 leading-relaxed">
              Экраны выключены. Sentinel продолжает собирать дропы на полной мощности.
            </p>
            <div className="pt-2 text-[11px] font-mono text-[#73bba5]">
              Кликните в любом месте или нажмите <kbd className="px-2 py-1 rounded bg-white/10 text-white font-bold">Esc</kbd> / <kbd className="px-2 py-1 rounded bg-white/10 text-white font-bold">Alt + Backspace</kbd> для пробуждения
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
