import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DisplayMonitor } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { DIMMER_HOST_TIMEOUT_MS, dimmerPhase } from '../utils/dataLoad';

interface ScreenDimmerViewProps {
  onBackToDashboard?: () => void;
  showToast?: (msg: string) => void;
}

const BRIGHTNESS_PRESETS = [
  { label: '🌑 Блэкаут 0%', val: 0, hint: 'Блэкаут 0%' },
  { label: '🌘 Ночь 15%', val: 15, hint: 'Ночь 15%' },
  { label: '🌤️ Комфорт 40%', val: 40, hint: 'Комфорт 40%' },
  { label: '☀️ Работа 75%', val: 75, hint: 'Работа 75%' },
  { label: '✨ Максимум 100%', val: 100, hint: 'Максимум 100%' },
];

const SLEEP_TIMER_PRESETS = [
  { mins: 0, label: 'Выкл' },
  { mins: 15, label: '15м' },
  { mins: 30, label: '30м' },
  { mins: 45, label: '45м' },
  { mins: 60, label: '60м' },
  { mins: 120, label: '120м' },
];

// Raw names look like "Laptop_Internal" or "\\.\DISPLAY1": show a human name, keep the raw one for the tooltip
const monitorLabel = (mon: DisplayMonitor, idx: number): string => {
  const clean = String(mon.name || '').replace(/^[^\wА-Яа-я#]+/, '').trim();
  if (!clean || /^laptop[_ ]?internal/i.test(clean)) {
    return mon.is_laptop_internal ? 'Встроенный дисплей' : `Экран ${idx + 1}`;
  }
  return clean;
};

const connectionInfo = (mon: DisplayMonitor): { short: string; hint: string } => {
  if (mon.is_laptop_internal) {
    return { short: 'ACPI', hint: 'Встроенный экран ноутбука: яркость задаётся через ACPI/WMI' };
  }
  if (mon.supports_control) {
    return { short: 'DDC/CI', hint: 'Внешний монитор: яркость задаётся командой по кабелю (DDC/CI, VCP 0x10)' };
  }
  return { short: 'GDI', hint: 'Монитор не принимает команды яркости: используется программное затемнение' };
};

interface BusLogEntry {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'success' | 'warn';
}

export const ScreenDimmerView: React.FC<ScreenDimmerViewProps> = ({
  onBackToDashboard,
  showToast,
}) => {
  const { playClick } = useTactileAudio();

  const [monitors, setMonitors] = useState<DisplayMonitor[]>([]);
  // The shell sends the list as a message: until the first one arrives "no monitors" would be a guess
  const [hostReceived, setHostReceived] = useState<boolean>(false);
  const [hostTimedOut, setHostTimedOut] = useState<boolean>(false);
  const [scanAttempt, setScanAttempt] = useState<number>(0);
  const phase = dimmerPhase(hostReceived, hostTimedOut);
  useEffect(() => {
    if (hostReceived) return;
    setHostTimedOut(false);
    const timer = setTimeout(() => setHostTimedOut(true), DIMMER_HOST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hostReceived, scanAttempt]);
  const [masterBrightness, setMasterBrightness] = useState<number>(75);
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [soloScreenIdx, setSoloScreenIdx] = useState<number | null>(null);
  const [isLinked, setIsLinked] = useState<boolean>(true);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number>(0);
  const [muteAudioOnBlackout, setMuteAudioOnBlackout] = useState<boolean>(false);
  const [ultraDarkActive, setUltraDarkActive] = useState<boolean>(false);
  const [ultraDarkTint, setUltraDarkTint] = useState<number>(55);
  const [isDraggingDial, setIsDraggingDial] = useState<boolean>(false);
  const [busLogs, setBusLogs] = useState<BusLogEntry[]>([]);

  const dialRef = useRef<HTMLDivElement>(null);
  const jogAngle = -135 + (masterBrightness / 100) * 270;
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Interaction lock & I2C throttle refs to eliminate rubber-banding and hardware bus congestion
  const masterBrightnessRef = useRef<number>(75);
  const isInteractingRef = useRef<boolean>(false);
  const interactionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMasterBriRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ startY: number; startX: number; startBri: number } | null>(null);

  const markUserInteraction = useCallback((durationMs = 800) => {
    isInteractingRef.current = true;
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, durationMs);
  }, []);

  const addBusLog = useCallback((text: string, type: 'info' | 'success' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setBusLogs(prev => [...prev.slice(-40), { id: Math.random().toString(36).slice(2), time, text, type }]);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [busLogs]);

  // Send command to C# Host via WebView2 postMessage + HTTP REST fallback
  const sendDimmerCommand = useCallback(async (action: string, payload: any = {}) => {
    try {
      const hasWebview = !!(window as any).chrome?.webview;
      if (hasWebview) {
        (window as any).chrome.webview.postMessage({
          type: 'DIMMER_COMMAND',
          action,
          ...payload,
        });
      }

      // If inside native WebView2, C# executes hardware DDC/CI & WMI directly.
      // Avoid spamming parallel HTTP requests to Python during continuous dragging!
      if (!hasWebview || action === 'GET_STATE' || action === 'SCAN_MONITORS') {
        const endpointMap: Record<string, string> = {
          GET_STATE: 'http://127.0.0.1:28492/api/v1/dimmer/state',
          SET_BRIGHTNESS: 'http://127.0.0.1:28492/api/v1/dimmer/brightness',
          SET_BLACKOUT: 'http://127.0.0.1:28492/api/v1/dimmer/blackout',
          SET_TIMER: 'http://127.0.0.1:28492/api/v1/dimmer/timer',
          SET_ULTRA_DARK: 'http://127.0.0.1:28492/api/v1/dimmer/ultradark',
          SET_MUTE_ON_BLACKOUT: 'http://127.0.0.1:28492/api/v1/dimmer/mute',
          SAVE_BASELINE: 'http://127.0.0.1:28492/api/v1/dimmer/save-baseline',
          RESTORE_BASELINE: 'http://127.0.0.1:28492/api/v1/dimmer/restore-baseline',
          SCAN_MONITORS: 'http://127.0.0.1:28492/api/v1/dimmer/state',
        };
        const url = endpointMap[action] || 'http://127.0.0.1:28492/api/v1/dimmer/state';

        await fetch(url, {
          method: action === 'GET_STATE' || action === 'SCAN_MONITORS' ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: action === 'GET_STATE' || action === 'SCAN_MONITORS' ? undefined : JSON.stringify(payload),
        }).catch(() => {});
      }
    } catch {
      // IPC / Network fallback
    }
  }, []);

  // Sync state from C# Host via webview message or REST polling
  const handleWebviewMessage = useCallback((event: any) => {
    const msg = event.data || event;
    if (msg?.type === 'DIMMER_STATE_CHANGED' && msg.state) {
      setHostReceived(true);
      // Ironclad interaction shield: if user is actively touching wheel, dragging dial, or moving sliders,
      // completely ignore incoming messages to eliminate jumping back and forth!
      if (isInteractingRef.current) {
        return;
      }

      const s = msg.state;
      if (Array.isArray(s.monitors)) {
        // Strict deduplication defense: eliminate duplicate external monitors with identical device_name
        const deduped: DisplayMonitor[] = [];
        const seenDevices = new Set<string>();
        for (const m of s.monitors) {
          const key = m.is_laptop_internal ? 'laptop_internal' : (m.device_name || m.id);
          if (!seenDevices.has(key)) {
            seenDevices.add(key);
            deduped.push(m);
          }
        }
        setMonitors(deduped);
      }
      if (typeof s.master_brightness === 'number') {
        masterBrightnessRef.current = s.master_brightness;
        setMasterBrightness(s.master_brightness);
      }
      if (typeof s.is_blackout === 'boolean') {
        setIsBlackout(s.is_blackout);
      }
      if (s.solo_screen_index !== undefined) {
        setSoloScreenIdx(s.solo_screen_index);
      }
      if (typeof s.ultra_dark_active === 'boolean') {
        setUltraDarkActive(s.ultra_dark_active);
      }
      if (typeof s.ultra_dark_tint === 'number') {
        setUltraDarkTint(s.ultra_dark_tint);
      }
      if (typeof s.mute_audio_on_blackout === 'boolean') {
        setMuteAudioOnBlackout(s.mute_audio_on_blackout);
      }
    }
  }, []);

  useEffect(() => {
    // Initial request to fetch hardware dimmer state
    sendDimmerCommand('GET_STATE');

    if ((window as any).chrome?.webview) {
      (window as any).chrome.webview.addEventListener('message', handleWebviewMessage);
    }
    window.addEventListener('message', handleWebviewMessage);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === 'Backspace') {
        e.preventDefault();
        handleRestoreBaseline();
      } else if (e.altKey && e.code === 'Backspace') {
        e.preventDefault();
        handleTriggerBlackout();
      } else if (e.key === 'Escape') {
        if (isBlackout) {
          e.preventDefault();
          handleTriggerBlackout();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ((window as any).chrome?.webview) {
        (window as any).chrome.webview.removeEventListener('message', handleWebviewMessage);
      }
      window.removeEventListener('message', handleWebviewMessage);
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, [sendDimmerCommand, handleWebviewMessage, isBlackout]);

  const dispatchMasterHardwareThrottled = useCallback((val: number, forceImmediate = false) => {
    pendingMasterBriRef.current = val;

    const flush = () => {
      if (pendingMasterBriRef.current !== null) {
        const toSend = pendingMasterBriRef.current;
        pendingMasterBriRef.current = null;
        sendDimmerCommand('SET_BRIGHTNESS', {
          brightness: toSend,
          level: toSend,
          monitorId: 'master',
          monitor_id: 'master',
          is_linked: isLinked,
          monitor_index: null,
        });
      }
    };

    if (forceImmediate) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      flush();
      return;
    }

    if (!throttleTimerRef.current) {
      flush();
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        if (pendingMasterBriRef.current !== null) {
          flush();
        }
      }, 100);
    }
  }, [sendDimmerCommand, isLinked]);

  const flushThrottledMaster = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    if (pendingMasterBriRef.current !== null) {
      dispatchMasterHardwareThrottled(pendingMasterBriRef.current, true);
    }
  }, [dispatchMasterHardwareThrottled]);

  const handleMasterChange = useCallback((val: number, isDirectHardware = true) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    masterBrightnessRef.current = clamped;
    setMasterBrightness(clamped);
    markUserInteraction(800);

    if (isLinked) {
      setMonitors(prev => prev.map(m => ({ ...m, current_brightness: clamped })));
    }

    if (isDirectHardware) {
      dispatchMasterHardwareThrottled(clamped, true);
      addBusLog(`Общая яркость: ${clamped}% (синхронно: ${isLinked ? 'да' : 'нет'})`, 'info');
    } else {
      dispatchMasterHardwareThrottled(clamped, false);
    }
  }, [isLinked, markUserInteraction, dispatchMasterHardwareThrottled, addBusLog]);

  const handleSingleMonitorChange = (idx: number, val: number) => {
    markUserInteraction(800);
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setMonitors(prev => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = { ...copy[idx], current_brightness: clamped };
      }
      return copy;
    });

    const targetMon = monitors[idx];
    const monId = targetMon?.id || (idx === 0 ? 'disp-primary' : 'disp-secondary');

    sendDimmerCommand('SET_BRIGHTNESS', {
      brightness: clamped,
      level: clamped,
      monitorId: monId,
      monitor_id: monId,
      is_linked: false,
      monitor_index: idx,
    });
    addBusLog(`Яркость экрана #${idx + 1} (${targetMon ? monitorLabel(targetMon, idx) : monId}): ${clamped}%`, 'info');
  };

  const handleToggleSoloBlackout = (idx: number) => {
    playClick();
    if (soloScreenIdx === idx) {
      setSoloScreenIdx(null);
      handleSingleMonitorChange(idx, masterBrightness);
      sendDimmerCommand('SET_BLACKOUT', {
        enabled: false,
        blackout: false,
        soloIndex: null,
        solo_index: null,
      });
      addBusLog(`Экран #${idx + 1} снова включён`, 'info');
      if (showToast) showToast(`Дисплей #${idx + 1} активирован (${masterBrightness}%)`);
    } else {
      setSoloScreenIdx(idx);
      handleSingleMonitorChange(idx, 0);
      sendDimmerCommand('SET_BLACKOUT', {
        enabled: true,
        blackout: true,
        soloIndex: idx,
        solo_index: idx,
      });
      addBusLog(`Экран #${idx + 1} затемнён отдельно от остальных`, 'warn');
      if (showToast) showToast(`🌑 Затемнён только экран #${idx + 1}`);
    }
  };

  const handleTriggerBlackout = () => {
    playClick();
    const nextState = !isBlackout;
    setIsBlackout(nextState);
    setSoloScreenIdx(null);

    sendDimmerCommand('SET_BLACKOUT', {
      enabled: nextState,
      blackout: nextState,
      soloIndex: null,
      solo_index: null,
    });

    if (nextState) {
      addBusLog('🌑 Ночной блэкаут (0%) включён. ПК не засыпает и продолжает фарм.', 'warn');
      if (showToast) showToast('🌑 Ночной блэкаут включён: ПК не спит и продолжает фарм');
    } else {
      handleMasterChange(masterBrightness > 0 ? masterBrightness : 75);
      addBusLog(`☀️ Экраны пробуждены (${masterBrightness || 75}%).`, 'success');
      if (showToast) showToast(`☀️ Экраны пробуждены (${masterBrightness || 75}%)`);
    }
  };

  const handleSaveSingleBaseline = (idx: number) => {
    playClick();
    const mon = monitors[idx];
    if (!mon) return;
    const cur = mon.current_brightness;
    setMonitors(prev => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = { ...copy[idx], baseline_brightness: cur };
      }
      return copy;
    });
    sendDimmerCommand('SAVE_BASELINE');
    addBusLog(`💾 База для экрана #${idx + 1} (${monitorLabel(mon, idx)}): ${cur}%`, 'success');
    if (showToast) showToast(`💾 База #${idx + 1} сохранена: ${cur}%`);
  };

  const handleRestoreSingleBaseline = (idx: number) => {
    playClick();
    const mon = monitors[idx];
    if (!mon) return;
    const target = mon.baseline_brightness ?? mon.current_brightness;
    handleSingleMonitorChange(idx, target);
    addBusLog(`☀️ Экран #${idx + 1} возвращён к базе: ${target}%`, 'success');
    if (showToast) showToast(`☀️ Дисплей #${idx + 1} возвращен к базе ${target}%`);
  };

  // Pro-Audio Rotary Drag: Relative delta tracking ensures ZERO jumping to 100% on start or near 0%
  const handleDialPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setIsDraggingDial(true);
    markUserInteraction(1000);
    playClick();
    // Record starting anchor and starting brightness without jumping!
    dragStartRef.current = {
      startY: e.clientY,
      startX: e.clientX,
      startBri: masterBrightnessRef.current,
    };
  };

  const handleDialPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDial || !dragStartRef.current) return;
    e.preventDefault();
    markUserInteraction(1000);

    // Directional Drag:
    // Dragging UP or RIGHT increases brightness (+1% per 1.5px)
    // Dragging DOWN or LEFT decreases brightness (-1% per 1.5px)
    const dy = dragStartRef.current.startY - e.clientY; // positive up
    const dx = e.clientX - dragStartRef.current.startX; // positive right
    const deltaPct = (dy * 0.85 + dx * 0.55) * (100 / 150);
    const nextBri = Math.max(0, Math.min(100, Math.round(dragStartRef.current.startBri + deltaPct)));

    masterBrightnessRef.current = nextBri;
    setMasterBrightness(nextBri);
    handleMasterChange(nextBri, false);
  };

  const handleDialPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingDial) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setIsDraggingDial(false);
      dragStartRef.current = null;
      flushThrottledMaster();
      markUserInteraction(800);
    }
  };

  const handleJogWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    markUserInteraction(800);
    const step = e.shiftKey ? 1 : 5;
    const delta = e.deltaY < 0 ? step : -step;
    // Read from masterBrightnessRef.current so rapid wheel ticks NEVER use stale closure value!
    const current = masterBrightnessRef.current;
    const nextBri = Math.max(0, Math.min(100, current + delta));
    masterBrightnessRef.current = nextBri;
    setMasterBrightness(nextBri);
    playClick();
    handleMasterChange(nextBri, false);
  };

    const handleSaveBaseline = () => {
    playClick();
    sendDimmerCommand('SAVE_BASELINE');
    setMonitors(prev => prev.map(m => ({ ...m, baseline_brightness: m.current_brightness })));
    const summary = monitors.map((m, i) => `#${i + 1} (${monitorLabel(m, i)}): ${m.current_brightness}%`).join(' • ');
    addBusLog(`💾 Базовый профиль сохранен: ${summary}`, 'success');
    if (showToast) showToast(`💾 Базовая яркость сохранена! (${summary})`);
  };

  const handleRestoreBaseline = () => {
    playClick();
    markUserInteraction();
    sendDimmerCommand('RESTORE_BASELINE');
    setIsBlackout(false);
    setSoloScreenIdx(null);
    setMonitors(prev => prev.map(m => ({
      ...m,
      current_brightness: m.baseline_brightness ?? m.current_brightness,
    })));
    const targets = monitors.map(m => m.baseline_brightness ?? m.current_brightness);
    const avg = targets.length > 0 ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : 75;
    setMasterBrightness(avg);
    const summary = monitors.map((m, i) => `#${i + 1}: ${m.baseline_brightness ?? m.current_brightness}%`).join(' • ');
    addBusLog(`☀️ Восстановлена базовая яркость: ${summary} (общая: ${avg}%)`, 'success');
    if (showToast) showToast(`☀️ Базовая яркость восстановлена! (${summary})`);
  };

  const handleScanHardware = () => {
    playClick();
    setScanAttempt((n) => n + 1);
    sendDimmerCommand('SCAN_MONITORS');
    addBusLog('🔄 Опрашиваю мониторы: читаю их реальную яркость...', 'info');
    if (showToast) showToast('🔄 Опрос физических дисплеев выполнен');
  };

  const handleApplyScenario = (extBri: number, laptopBri: number, title: string) => {
    playClick();
    if (isBlackout) setIsBlackout(false);
    setMonitors(prev => prev.map((m, idx) => {
      const val = m.is_laptop_internal ? laptopBri : extBri;
      sendDimmerCommand('SET_BRIGHTNESS', {
        brightness: val,
        level: val,
        monitorId: m.id,
        monitor_id: m.id,
        is_linked: false,
        monitor_index: idx,
      });
      return { ...m, current_brightness: val };
    }));
    addBusLog(`Сценарий "${title}" применён: внешний ${extBri}%, ноутбук ${laptopBri}%`, 'info');
    if (showToast) showToast(`Сценарий: ${title}`);
  };

  const handleSelectSleepTimer = (mins: number) => {
    playClick();
    setSleepTimerMinutes(mins);
    sendDimmerCommand('SET_TIMER', { minutes: mins });
    addBusLog(mins > 0 ? `Таймер сна: ${mins} минут` : 'Таймер сна отключен', 'info');
    if (showToast) {
      showToast(mins > 0 ? `⏱️ Таймер сна установлен на ${mins} мин` : '⏱️ Таймер сна отключен');
    }
  };

  const handleToggleMuteAudio = () => {
    playClick();
    const next = !muteAudioOnBlackout;
    setMuteAudioOnBlackout(next);
    sendDimmerCommand('SET_MUTE_ON_BLACKOUT', { enabled: next });
    addBusLog(`Отключение звука при затемнении: ${next ? 'включено' : 'выключено'}`, next ? 'warn' : 'info');
    if (showToast) {
      showToast(next ? '🔇 Звук будет выключаться при затемнении' : '🔊 Звук при затемнении не выключается');
    }
  };

  const handleToggleUltraDark = () => {
    playClick();
    const next = !ultraDarkActive;
    setUltraDarkActive(next);
    sendDimmerCommand('SET_ULTRA_DARK', { enabled: next, tint: ultraDarkTint });
    addBusLog(`Сверхтемнота: ${next ? `включена (${ultraDarkTint}%)` : 'выключена'}`, next ? 'success' : 'info');
    if (showToast) {
      showToast(next ? `🌌 Сверхтемнота активирована (${ultraDarkTint}%)` : 'Сверхтемнота отключена');
    }
  };

  const handleUltraDarkTintChange = (val: number) => {
    const clamped = Math.max(10, Math.min(95, val));
    setUltraDarkTint(clamped);
    if (ultraDarkActive) {
      sendDimmerCommand('SET_ULTRA_DARK', { enabled: true, tint: clamped });
    }
  };



  return (
    <div
      id="view-dimmer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '2px 0 14px 0',
      }}
    >
      {/* =========================================================================
         MONITORS (one card per monitor) + COMMON BRIGHTNESS
         ========================================================================= */}
      <div className="dimmer-top-grid" style={{ display: 'grid', gap: '10px', alignItems: 'start' }}>
        <div className="titanium-island" style={{ gap: '10px', padding: '12px 14px' }}>
          <div className="engraved-header" style={{ marginBottom: '2px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Физическое расположение дисплеев. Яркость и база хранятся для каждого монитора отдельно.">МОНИТОРЫ</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className={`tactile-btn ${isLinked ? 'active-mint' : ''}`}
                style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
                onClick={() => {
                  playClick();
                  setIsLinked(!isLinked);
                  if (showToast) showToast(isLinked ? 'Мониторы регулируются раздельно' : '🔗 Все мониторы меняются вместе');
                }}
                title="Синхронно: общая яркость меняет все мониторы сразу. Раздельно: каждый монитор настраивается сам."
              >
                {isLinked ? '🔗 Синхронно' : '🔓 Раздельно'}
              </button>
              <button
                className="tactile-btn"
                style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
                onClick={handleScanHardware}
                title="Перечитать реальную яркость мониторов"
              >
                🔄 Опрос
              </button>
              <span className="metric-badge" style={{ fontSize: 'var(--fs-xs)', padding: '2px 6px' }}>
                {monitors.length ? `${monitors.length} ${monitors.length === 1 ? 'монитор' : monitors.length < 5 ? 'монитора' : 'мониторов'}` : phase === 'waiting' ? 'загрузка…' : phase === 'timeout' ? 'нет данных' : 'мониторы не найдены'}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11.5rem), 1fr))',
              gap: '10px',
            }}
          >
            {monitors.length === 0 && (
              <div className="obsidian-well" role="status" aria-busy={phase === 'waiting'} style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                {phase === 'waiting' && (
                  <>
                    <span className="sk-bar" aria-hidden="true" style={{ display: 'block', width: '60%', height: '0.9em', marginBottom: '6px' }} />
                    Ждём список мониторов от приложения…
                  </>
                )}
                {phase === 'timeout' && 'Приложение не прислало список мониторов. В обычном браузере так и бывает: диммер управляет экранами только внутри приложения. Нажмите «Опрос», чтобы спросить ещё раз.'}
                {phase === 'ready' && 'Мониторы не найдены. Проверьте, что дисплеи включены, и нажмите «Опрос».'}
              </div>
            )}
            {monitors.map((mon, idx) => {
              const isSoloThis = soloScreenIdx === idx;
              const locked = isBlackout || isSoloThis;
              const displayBri = locked ? 0 : mon.current_brightness;
              const baseBri = mon.baseline_brightness ?? mon.current_brightness;
              const diff = mon.current_brightness - baseBri;
              const label = monitorLabel(mon, idx);
              const conn = connectionInfo(mon);

              return (
                <div
                  key={mon.id || idx}
                  className="obsidian-well"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isSoloThis ? '1px solid var(--led-rose)' : '1px solid var(--border-subtle)',
                    background: 'rgba(15, 20, 18, 0.6)',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', minWidth: 0 }} title={`${mon.name}${mon.device_name ? ` • ${mon.device_name}` : ''}`}>
                      <span style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.3 }}>{mon.is_laptop_internal ? '💻' : '🖥️'}</span>
                      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-heading)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                        #{idx + 1} {label}
                      </span>
                    </div>
                    <span
                      title={conn.hint}
                      style={{
                        flexShrink: 0,
                        fontSize: 'var(--fs-xs)',
                        fontFamily: 'var(--font-ui)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {conn.short}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                    <span
                      title="Текущая яркость монитора"
                      style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-xl)', fontWeight: 800, lineHeight: 1, color: locked ? 'var(--text-muted)' : 'var(--accent-mint)' }}
                    >
                      {displayBri}%
                    </span>
                    <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-muted)', textAlign: 'right' }}>
                      база <strong style={{ color: 'var(--text-heading)' }}>{baseBri}%</strong>
                      {!locked && diff !== 0 && (
                        <span style={{ color: diff > 0 ? '#60a5fa' : '#f59e0b' }}> ({diff > 0 ? `+${diff}` : diff})</span>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>🌑</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={displayBri}
                      disabled={locked}
                      aria-label={`Яркость: ${label}`}
                      onChange={e => handleSingleMonitorChange(idx, Number(e.target.value))}
                      style={{ flex: 1, minWidth: 0, accentColor: 'var(--accent-mint)', cursor: locked ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>☀️</span>
                  </div>

                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    {isSoloThis ? '● Затемнён отдельно' : isLinked ? '🔗 Синхронно с общей' : '🔓 Независимо'}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    <button
                      className="tactile-btn"
                      style={{ flex: '1 1 auto', minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 7px' }}
                      onClick={() => handleSaveSingleBaseline(idx)}
                      title={`Запомнить текущие ${mon.current_brightness}% как базовую яркость этого монитора`}
                    >
                      💾 Запомнить как базу
                    </button>
                    <button
                      className="tactile-btn active-mint"
                      style={{ flex: '1 1 auto', minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 7px' }}
                      onClick={() => handleRestoreSingleBaseline(idx)}
                      title={`Вернуть этот монитор к базовой яркости (${baseBri}%)`}
                    >
                      ☀️ Вернуть к базе
                    </button>
                    <button
                      className={`tactile-btn ${isSoloThis ? 'active-rose' : ''}`}
                      style={{ flex: '1 1 100%', minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 7px', color: isSoloThis ? '#ff5252' : undefined }}
                      onClick={() => handleToggleSoloBlackout(idx)}
                      title={isSoloThis ? 'Включить этот монитор обратно' : 'Погасить только этот монитор, остальные не трогать'}
                    >
                      {isSoloThis ? '● Затемнён — включить' : '🌑 Затемнить только этот'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="tactile-btn"
              style={{ minHeight: '28px', fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '0 12px' }}
              onClick={handleSaveBaseline}
              title="Зафиксировать текущую яркость ВСЕХ мониторов как базовую"
            >
              💾 Запомнить все как базу
            </button>
            <button
              className="tactile-btn active-mint"
              style={{ minHeight: '28px', fontSize: 'var(--fs-xs)', fontWeight: 800, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 12px rgba(58, 210, 159, 0.25)' }}
              onClick={handleRestoreBaseline}
              title="Вернуть базовую яркость всех мониторов"
            >
              <span>☀️ Вернуть базу всем</span>
              <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-ui)', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,0,0,0.4)', color: '#ffffff' }}>
                Alt+Shift+Backspace
              </span>
            </button>
          </div>
        </div>

        {/* Common brightness: dial, presets, scenarios, blackout */}
        <div className="titanium-island" style={{ justifyContent: 'space-between' }}>
          <div className="engraved-header" style={{ marginBottom: '4px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Общая яркость всех дисплеев (диск)">ОБЩАЯ ЯРКОСТЬ</span>
            </span>
            <span className="metric-badge" style={{ color: 'var(--accent-mint)', fontWeight: 700 }}>
              {monitors.length === 0 ? '—' : isBlackout ? '🌑 0%' : `☀️ ${masterBrightness}%`}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '6px 0',
            }}
          >
            <div
              ref={dialRef}
              data-overflow-ok
              onPointerDown={handleDialPointerDown}
              onPointerMove={handleDialPointerMove}
              onPointerUp={handleDialPointerUp}
              onPointerCancel={handleDialPointerUp}
              onWheel={handleJogWheel}
              style={{
                width: '6.5625rem',
                height: '6.5625rem',
                borderRadius: '50%',
                background: 'radial-gradient(circle, #25332e 0%, #151e1b 70%, #0d1311 100%)',
                border: '3px solid #30413a',
                boxShadow: isBlackout
                  ? '0 4px 14px rgba(0,0,0,0.8)'
                  : '0 0 16px rgba(58, 210, 159, 0.25), inset 0 2px 5px rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: isDraggingDial ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none',
                flexShrink: 0,
              }}
              title="Зажмите левую кнопку мыши и вращайте диск, или крутите колесо мыши (±5%)"
            >
              <div
                style={{
                  position: 'absolute',
                  inset: '5px',
                  borderRadius: '50%',
                  border: '1px dashed rgba(255,255,255,0.15)',
                }}
              />

              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  position: 'absolute',
                  transform: `rotate(${jogAngle}deg)`,
                  transition: isDraggingDial ? 'none' : 'transform 0.12s ease-out',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '14px',
                    background: isBlackout ? 'var(--led-rose)' : 'var(--accent-mint)',
                    borderRadius: '3px',
                    position: 'absolute',
                    top: '6px',
                    left: 'calc(50% - 3px)',
                    boxShadow: isBlackout ? '0 0 8px #ff5252' : '0 0 8px #3AD29F',
                  }}
                />
              </div>

              <div
                style={{
                  width: '3.875rem',
                  height: '3.875rem',
                  borderRadius: '50%',
                  background: '#17221e',
                  border: '2px solid #23312c',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--fs-lg)',
                    fontWeight: 800,
                    color: isBlackout ? 'var(--text-muted)' : 'var(--accent-mint)',
                    lineHeight: 1,
                  }}
                >
                  {monitors.length === 0 ? '—' : isBlackout ? '0' : masterBrightness}
                </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                  %
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '95px' }}>
              {BRIGHTNESS_PRESETS.map(p => (
                <button
                  key={p.val}
                  className={`tactile-btn ${(!isBlackout && masterBrightness === p.val) ? 'active-mint' : ''}`}
                  style={{
                    height: '21px',
                    fontSize: 'var(--fs-xs)',
                    justifyContent: 'flex-start',
                    padding: '0 8px',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 700,
                  }}
                  onClick={() => {
                    playClick();
                    if (isBlackout) setIsBlackout(false);
                    handleMasterChange(p.val);
                  }}
                  title={p.hint}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Сценарии:</span>
            <button
              className="tactile-btn"
              style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
              onClick={() => handleApplyScenario(85, 75, '☀️ День')}
              title="Внешние: 85%, ноутбук: 75%"
            >
              ☀️ День
            </button>
            <button
              className="tactile-btn"
              style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
              onClick={() => handleApplyScenario(45, 40, '🌆 Вечер')}
              title="Внешние: 45%, ноутбук: 40%"
            >
              🌆 Вечер
            </button>
            <button
              className="tactile-btn"
              style={{ minHeight: '22px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
              onClick={() => handleApplyScenario(15, 10, '🌑 Ночь')}
              title="Внешние: 15%, ноутбук: 10%"
            >
              🌑 Ночь
            </button>
          </div>

          <button
            className={`tactile-btn ${isBlackout ? 'active-rose' : ''}`}
            style={{
              width: '100%',
              height: '32px',
              fontSize: 'var(--fs-xs)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: isBlackout ? 'rgba(255, 82, 82, 0.16)' : 'rgba(255, 255, 255, 0.04)',
              border: isBlackout ? '1px solid var(--led-rose)' : '1px solid var(--border-main)',
              color: isBlackout ? '#ff5252' : 'var(--text-heading)',
              boxShadow: isBlackout ? '0 0 14px rgba(255, 82, 82, 0.25)' : 'none',
            }}
            onClick={handleTriggerBlackout}
            title="Мгновенно погасить все экраны до 0%. ПК продолжает работать на полной мощности."
          >
            <span>{isBlackout ? '☀️ ПРОБУДИТЬ ЭКРАНЫ' : '🌑 НОЧНОЙ БЛЭКАУТ (0%)'}</span>
            <span
              style={{
                fontSize: 'var(--fs-xs)',
                fontFamily: 'var(--font-ui)',
                padding: '2px 5px',
                borderRadius: '3px',
                background: 'rgba(0,0,0,0.3)',
                color: 'var(--text-muted)',
              }}
            >
              Alt+Backspace
            </span>
          </button>
        </div>
      </div>

      {/* =========================================================================
         TIER 4: SLEEP TIMER + OLED PROTECTION + ULTRA-DARK MODE
         ========================================================================= */}
      <div className="dimmer-bottom-grid" style={{ display: 'grid', gap: '10px' }}>
        {/* Sleep Timer Island */}
        <div className="titanium-island" style={{ justifyContent: 'space-between', gap: '8px' }}>
          <div className="engraved-header" style={{ marginBottom: '2px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Таймер сна (Sleep Timer)">ТАЙМЕР СНА</span>
            </span>
            <span
              style={{
                fontSize: 'var(--fs-xs)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                color: sleepTimerMinutes > 0 ? 'var(--accent-mint)' : 'var(--text-muted)',
              }}
            >
              {sleepTimerMinutes > 0 ? `● ${sleepTimerMinutes} мин` : '○ Отключен'}
            </span>
          </div>

          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '2px 0 6px 0', lineHeight: 1.4 }}>
            Через заданное время экраны сами погаснут (ночной блэкаут). Компьютер не засыпает: фарм и закачки продолжаются.
          </p>

          {/* Timer Preset Chips */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {SLEEP_TIMER_PRESETS.map(t => (
              <button
                key={t.mins}
                className={`tactile-btn ${sleepTimerMinutes === t.mins ? 'active-mint' : ''}`}
                style={{
                  height: '24px',
                  fontSize: 'var(--fs-xs)',
                  padding: '0 8px',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                }}
                onClick={() => handleSelectSleepTimer(t.mins)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* OLED & Security Protection Island */}
        <div className="titanium-island" style={{ justifyContent: 'space-between', gap: '8px' }}>
          <div className="engraved-header" style={{ marginBottom: '2px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Защита системы и аудио">ЗАЩИТА И ЗВУК</span>
            </span>
            {isBlackout && (
              <span className="metric-badge" style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-mint)' }} title="Пока экраны погашены, ПК не уходит в сон и продолжает фарм">
                ПК не засыпает
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* CoreAudio Mute Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-heading)' }}>
                  🔇 Выключать звук при затемнении
                </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  Звук возвращается, когда экраны просыпаются
                </span>
              </div>
              <button
                className={`tactile-btn ${muteAudioOnBlackout ? 'active-mint' : ''}`}
                style={{ minHeight: '20px', fontSize: 'var(--fs-xs)', padding: '0 6px' }}
                onClick={handleToggleMuteAudio}
              >
                {muteAudioOnBlackout ? '✓ ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>

            {/* Strict Shield Info */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-heading)' }}>
                  🛡️ Защита от случайных кликов
                </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  Блэкаут снимается только по Esc или Alt+Backspace
                </span>
              </div>
              <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-ui)', color: 'var(--accent-mint)' }}>
                АКТИВЕН
              </span>
            </div>
          </div>
        </div>

        {/* Ultra-Dark Mode Island */}
        <div className="titanium-island" style={{ justifyContent: 'space-between', gap: '8px' }}>
          <div className="engraved-header" style={{ marginBottom: '2px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Сверхтемнота: затемнение ниже предела монитора">СВЕРХТЕМНОТА</span>
            </span>
            <button
              className={`tactile-btn ${ultraDarkActive ? 'active-mint' : ''}`}
              style={{ minHeight: '20px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
              onClick={handleToggleUltraDark}
              title="Включить затемнение сильнее, чем позволяет подсветка монитора"
            >
              {ultraDarkActive ? '● АКТИВЕН' : '○ ВКЛЮЧИТЬ'}
            </button>
          </div>

          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '2px 0', lineHeight: 1.35 }}>
            Тёмный полупрозрачный слой поверх экрана: темнее, чем позволяет сам монитор. Клики проходят сквозь него, работать можно как обычно.
          </p>

          {/* UltraDark Tint Depth Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              <span>Глубина тонирования:</span>
              <span style={{ color: 'var(--accent-mint)', fontWeight: 700 }}>{ultraDarkTint}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>10%</span>
              <input
                type="range"
                min="10"
                max="95"
                value={ultraDarkTint}
                onChange={e => handleUltraDarkTintChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-mint)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>95%</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
         TIER 5: HARDWARE BUS TELEMETRY & ACTIVITY JOURNAL (ЗАКРЫТИЕ ПУСТОТЫ)
         ========================================================================= */}
      <div
        className="titanium-island"
        style={{
          flex: busLogs.length > 0 ? 1 : '0 0 auto',
          minHeight: busLogs.length > 0 ? '130px' : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '10px 14px',
        }}
      >
        <div className="engraved-header" style={{ marginBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="tag">
              <span className="led-dot"></span> <span title="Что диммер делал с мониторами: команды яркости, опросы, сценарии">Журнал диммера</span>
            </span>
          </div>
          <button
            className="tactile-btn"
            style={{ minHeight: '18px', fontSize: 'var(--fs-xs)', padding: '0 6px' }}
            onClick={() => setBusLogs([])}
            title="Очистить журнал событий"
          >
            Очистить
          </button>
        </div>

        {/* Scrollable Live Console Well */}
        <div
          ref={logContainerRef}
          className="obsidian-well"
          style={{
            flex: busLogs.length > 0 ? 1 : '0 0 auto',
            minHeight: busLogs.length > 0 ? '80px' : 0,
            borderRadius: '6px',
            padding: '8px 10px',
            overflowY: 'auto',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--fs-xs)',
            lineHeight: 1.45,
            background: 'rgba(10, 14, 12, 0.75)',
            border: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {busLogs.length === 0 && (
            <span style={{ color: 'var(--text-muted)' }}>Журнал пуст — записи появятся при первом действии</span>
          )}
          {busLogs.map(log => (
            <div key={log.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 'var(--fs-xs)' }}>[{log.time}]</span>
              <span
                style={{
                  color: log.type === 'success'
                    ? 'var(--accent-mint)'
                    : (log.type === 'warn' ? '#ff9800' : 'var(--text-secondary)'),
                }}
              >
                {log.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* =========================================================================
         HOTKEYS REFERENCE & STATUS CHIP BAR
         ========================================================================= */}
      <div
        className="obsidian-well"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-ui)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>⌨️ <strong style={{ color: 'var(--text-heading)' }}>Alt + Backspace:</strong> блэкаут (0%)</span>
          <span>•</span>
          <span>⌨️ <strong style={{ color: 'var(--accent-mint)' }}>Alt + Shift + Backspace:</strong> вернуть базовую яркость (работает и из игр)</span>
          <span>•</span>
          <span><strong style={{ color: 'var(--text-heading)' }}>Esc:</strong> выйти из блэкаута</span>
          <span>•</span>
          <span>🖱️ <strong style={{ color: 'var(--text-heading)' }}>Колесо над диском:</strong> ±5%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-mint)' }}>
          <span className="led-dot" style={{ width: '5px', height: '5px' }}></span>
          <span title="Подробности: управление идёт через DDC/CI, DXVA2 и WMI">{monitors.length > 0 ? 'Мониторы готовы' : phase === 'waiting' ? 'Ждём список мониторов' : phase === 'timeout' ? 'Нет данных от приложения' : 'Мониторы не найдены'}</span>
        </div>
      </div>
    </div>
  );
};
