import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DisplayMonitor } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';

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
      addBusLog(`Мастер-яркость установлена на ${clamped}% (Связка: ${isLinked ? 'ВКЛ' : 'ВЫКЛ'})`, 'info');
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
    addBusLog(`Яркость дисплея #${idx + 1} (${targetMon?.name || monId}): ${clamped}%`, 'info');
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
      addBusLog(`Solo Blackout снят для дисплея #${idx + 1}`, 'info');
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
      addBusLog(`Solo Blackout активирован для дисплея #${idx + 1}`, 'warn');
      if (showToast) showToast(`🌑 Solo Blackout для Дисплея #${idx + 1}`);
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
      addBusLog('🌑 Ночной Blackout (0%) активирован. ПК продолжает фармить (AwayMode ON).', 'warn');
      if (showToast) showToast('🌑 Ночной Blackout активирован! ПК не спит (AwayMode)');
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
    addBusLog(`💾 База для дисплея #${idx + 1} (${mon.name}): ${cur}%`, 'success');
    if (showToast) showToast(`💾 База #${idx + 1} сохранена: ${cur}%`);
  };

  const handleRestoreSingleBaseline = (idx: number) => {
    playClick();
    const mon = monitors[idx];
    if (!mon) return;
    const target = mon.baseline_brightness ?? mon.current_brightness;
    handleSingleMonitorChange(idx, target);
    addBusLog(`☀️ Восстановлена база дисплея #${idx + 1}: ${target}%`, 'success');
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
    const summary = monitors.map((m, i) => `#${i + 1} (${m.name.replace(/^[^\wА-Яа-я#]+/, '')}): ${m.current_brightness}%`).join(' • ');
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
    addBusLog(`☀️ Восстановлена базовая яркость: ${summary} (Мастер: ${avg}%, Хоткей Alt+Shift+Backspace)`, 'success');
    if (showToast) showToast(`☀️ Базовая яркость восстановлена! (${summary})`);
  };

  const handleScanHardware = () => {
    playClick();
    sendDimmerCommand('SCAN_MONITORS');
    addBusLog('🔄 Опрос физических шин DDC/CI (VCP 0x10) и WMI ACPI...', 'info');
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
    addBusLog(`Сценарий "${title}" применен: Внешний ${extBri}%, Ноутбук ${laptopBri}%`, 'info');
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
    addBusLog(`Ночной CoreAudio Mute: ${next ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`, next ? 'warn' : 'info');
    if (showToast) {
      showToast(next ? '🔇 Ночной Mute CoreAudio включен' : '🔊 Ночной Mute выключен');
    }
  };

  const handleToggleUltraDark = () => {
    playClick();
    const next = !ultraDarkActive;
    setUltraDarkActive(next);
    sendDimmerCommand('SET_ULTRA_DARK', { enabled: next, tint: ultraDarkTint });
    addBusLog(`Сверхтемнота (Ultra-Dark WS_EX_TRANSPARENT): ${next ? `АКТИВНА (${ultraDarkTint}%)` : 'ВЫКЛЮЧЕНА'}`, next ? 'success' : 'info');
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
        padding: '2px 0 14px 0',
      }}
    >
      {/* =========================================================================
         TIER 1 (ВЕРХ СТРАНИЦЫ): ПАМЯТЬ ОБОРУДОВАНИЯ & ПРОФИЛИ КАЛИБРОВКИ
         ========================================================================= */}
      <div className="titanium-island" style={{ gap: '10px', padding: '12px 14px' }}>
        {/* Header Row */}
        <div className="engraved-header" style={{ marginBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="tag">
              <span className="led-dot"></span> ПАМЯТЬ ОБОРУДОВАНИЯ & ПРОФИЛИ КАЛИБРОВКИ
            </span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Эталонная аппаратная яркость (Хоткей: <strong style={{ color: 'var(--accent-mint)' }}>Alt+Shift+Backspace</strong>)
            </span>
          </div>

          {/* Quick Scenarios */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Сценарии:
            </span>
            <button
              className="tactile-btn"
              style={{ height: '22px', fontSize: '9px', padding: '0 8px' }}
              onClick={() => handleApplyScenario(85, 75, '☀️ День')}
              title="Внешний: 85%, Ноутбук: 75%"
            >
              ☀️ День
            </button>
            <button
              className="tactile-btn"
              style={{ height: '22px', fontSize: '9px', padding: '0 8px' }}
              onClick={() => handleApplyScenario(45, 40, '🌆 Вечер')}
              title="Внешний: 45%, Ноутбук: 40%"
            >
              🌆 Вечер
            </button>
            <button
              className="tactile-btn"
              style={{ height: '22px', fontSize: '9px', padding: '0 8px' }}
              onClick={() => handleApplyScenario(15, 10, '🌑 Ночь')}
              title="Внешний: 15%, Ноутбук: 10%"
            >
              🌑 Ночь
            </button>
          </div>
        </div>

        {/* Per-Monitor Saved Baseline Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: monitors.length > 1 ? `repeat(${Math.min(monitors.length, 2)}, 1fr)` : '1fr', gap: '10px' }}>
          {monitors.length === 0 && (
            <div className="obsidian-well" role="status" style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '10px' }}>
              Ожидание данных о дисплеях от локального сервиса.
            </div>
          )}
          {monitors.map((mon, idx) => {
            const baseBri = mon.baseline_brightness ?? mon.current_brightness;
            const curBri = mon.current_brightness;
            const diff = curBri - baseBri;
            const isMatch = diff === 0;

            return (
              <div
                key={mon.id || idx}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-main)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Top: Icon + Name + Bus */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px' }}>{mon.is_laptop_internal ? '💻' : '🖥'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-heading)' }}>
                      #{idx + 1} {mon.is_laptop_internal ? 'Встроенный дисплей' : 'Внешний монитор'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '8.5px',
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: mon.is_laptop_internal ? 'rgba(58, 210, 159, 0.12)' : 'rgba(74, 158, 255, 0.12)',
                      color: mon.is_laptop_internal ? 'var(--accent-mint)' : '#60a5fa',
                      border: `1px solid ${mon.is_laptop_internal ? 'rgba(58, 210, 159, 0.25)' : 'rgba(74, 158, 255, 0.25)'}`,
                    }}
                  >
                    {mon.is_laptop_internal ? 'WMI ACPI' : 'DDC/CI VCP'}
                  </span>
                </div>

                {/* Middle: Big Prominent Numerical Readout */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(23, 34, 30, 0.65)',
                    border: '1px solid #23312c',
                    borderRadius: '5px',
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                      СОХРАНЕННАЯ БАЗОВАЯ ЯРКОСТЬ
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-mint)', lineHeight: 1 }}>
                        {baseBri}
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        %
                      </span>
                    </div>
                  </div>

                  {/* Status Comparison Pill */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Текущая: <strong style={{ color: 'var(--text-heading)' }}>{curBri}%</strong>
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        color: isMatch ? 'var(--accent-mint)' : (diff > 0 ? '#60a5fa' : '#f59e0b'),
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      {isMatch ? '● Соответствует базе' : (diff > 0 ? `▲ на +${diff}% выше базы` : `▼ на ${diff}% ниже базы`)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="tactile-btn"
                    style={{ flex: 1, height: '24px', fontSize: '9.5px', padding: '0 6px' }}
                    onClick={() => handleSaveSingleBaseline(idx)}
                    title={`Запомнить текущие ${curBri}% как базовую яркость для дисплея #${idx + 1}`}
                  >
                    💾 Запомнить {curBri}%
                  </button>
                  <button
                    className="tactile-btn active-mint"
                    style={{ flex: 1, height: '24px', fontSize: '9.5px', padding: '0 6px' }}
                    onClick={() => handleRestoreSingleBaseline(idx)}
                    title={`Вернуть дисплей #${idx + 1} к базовой яркости (${baseBri}%)`}
                  >
                    ☀️ Вернуть к {baseBri}%
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="tactile-btn"
              style={{
                height: '30px',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid var(--border-main)',
              }}
              onClick={handleSaveBaseline}
              title="Зафиксировать текущие уровни ВСЕХ мониторов как эталонную базовую яркость"
            >
              <span>💾 Запомнить оба монитора как базу</span>
            </button>

            <button
              className="tactile-btn active-mint"
              style={{
                height: '30px',
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 0 12px rgba(58, 210, 159, 0.25)',
              }}
              onClick={handleRestoreBaseline}
              title="Восстановить базовую яркость всех мониторов (Хоткей: Alt + Shift + Backspace)"
            >
              <span>☀️ Восстановить базу обоих мониторов</span>
              <span
                style={{
                  fontSize: '8.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'rgba(0,0,0,0.4)',
                  color: '#ffffff',
                }}
              >
                Alt+Shift+Backspace
              </span>
            </button>
          </div>

          <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Глобальный хоткей <strong style={{ color: 'var(--accent-mint)' }}>Alt+Shift+Backspace</strong> восстанавливает базу из любых игр и программ.
          </span>
        </div>
      </div>


      {/* =========================================================================
         TIER 1: PHYSICAL MONITORS MATRIX + JOG-DIAL ISLAND
         ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '10px', minHeight: '260px' }}>
        {/* Physical Monitors Matrix Display */}
        <div className="titanium-island" style={{ justifyContent: 'space-between' }}>
          <div className="engraved-header" style={{ marginBottom: '6px' }}>
            <span className="tag">
              <span className="led-dot"></span> Физическое расположение дисплеев
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className={`tactile-btn ${isLinked ? 'active-mint' : ''}`}
                style={{ height: '22px', fontSize: '9.5px', padding: '0 8px' }}
                onClick={() => {
                  playClick();
                  setIsLinked(!isLinked);
                  if (showToast) showToast(isLinked ? 'Связка экранов отключена' : '🔗 Все экраны синхронизированы');
                }}
                title="Синхронизировать яркость всех подключенных мониторов"
              >
                {isLinked ? '🔗 Синхронно' : '🔓 Раздельно'}
              </button>
              <button
                className="tactile-btn"
                style={{ height: '22px', fontSize: '9.5px', padding: '0 8px' }}
                onClick={handleScanHardware}
                title="Перечитать реальные значения яркости из DDC/CI и WMI"
              >
                🔄 Опрос
              </button>
              <span className="metric-badge" style={{ fontSize: '9px', padding: '2px 6px' }}>
                {monitors.length ? `${monitors.length} ${monitors.length === 1 ? 'МОНИТОР' : 'МОНИТОРА'}` : 'ДИСПЛЕИ НЕ ОПРЕДЕЛЕНЫ'}
              </span>
            </div>
          </div>

          {/* Dynamic Monitor Frames Grid (External + Laptop) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: monitors.length > 1 ? `repeat(${Math.min(monitors.length, 3)}, 1fr)` : '1fr',
              gap: '10px',
              flex: 1,
              alignItems: 'center',
            }}
          >
            {monitors.length === 0 && (
              <div className="obsidian-well" role="status" style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '10px' }}>
                Список дисплеев появится после подключения к локальному сервису.
              </div>
            )}
            {monitors.map((mon, idx) => {
              const isSoloThis = soloScreenIdx === idx;
              const effectiveBri = isBlackout || isSoloThis ? 0 : mon.current_brightness;
              const controlLabel = mon.is_laptop_internal ? 'WMI' : (mon.supports_control ? 'DDC/CI' : 'GDI');
              const baseBri = mon.baseline_brightness ?? mon.current_brightness;

              return (
                <div
                  key={mon.id || idx}
                  className="obsidian-well"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '12px 10px',
                    borderRadius: '10px',
                    border: isSoloThis ? '1px solid var(--led-rose)' : '1px solid var(--border-subtle)',
                    background: 'rgba(15, 20, 18, 0.6)',
                    position: 'relative',
                  }}
                >
                  {/* Monitor Name Header */}
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                      <span style={{ fontSize: '13px' }}>{mon.is_laptop_internal ? '💻' : '🖥️'}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--text-heading)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '125px',
                        }}
                        title={mon.name}
                      >
                        {mon.name.replace(/^[^\wА-Яа-я#]+/, '')}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '8.5px',
                        fontFamily: 'var(--font-mono)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'rgba(58, 210, 159, 0.1)',
                        color: 'var(--accent-mint)',
                        border: '1px solid rgba(58, 210, 159, 0.25)',
                      }}
                    >
                      {controlLabel}
                    </span>
                  </div>

                  {/* Physical Display Bezel Preview */}
                  <div
                    style={{
                      width: '100%',
                      height: '75px',
                      borderRadius: '6px',
                      border: '2px solid #222b27',
                      background: isBlackout || isSoloThis
                        ? '#000000'
                        : `linear-gradient(135deg, rgba(20, 35, 28, 0.95) 0%, rgba(10, 18, 14, 0.95) 100%)`,
                      boxShadow: isBlackout || isSoloThis
                        ? 'inset 0 0 10px rgba(0,0,0,0.9)'
                        : `inset 0 0 15px rgba(58, 210, 159, ${(effectiveBri / 100) * 0.35})`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.25s ease-out',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '20px',
                          fontWeight: 800,
                          color: isBlackout || isSoloThis ? 'var(--text-muted)' : 'var(--accent-mint)',
                          lineHeight: 1,
                        }}
                      >
                        {effectiveBri}%
                      </span>
                      <span
                        style={{
                          fontSize: '7.5px',
                          color: isSoloThis ? '#ff5252' : (effectiveBri === 0 ? 'var(--text-muted)' : 'var(--accent-mint)'),
                          marginTop: '3px',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {isSoloThis ? 'SOLO BLACKOUT' : (effectiveBri === 0 ? 'BLACKOUT' : (mon.is_laptop_internal ? 'WMI ACPI' : 'HARDWARE DDC'))}
                      </span>
                    </div>

                    {/* Baseline Pill inside preview */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        fontSize: '8px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                        background: 'rgba(0,0,0,0.6)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        border: '1px solid var(--border-subtle)',
                      }}
                      title="Сохраненная рабочая базовая яркость"
                    >
                      Базовая: <strong style={{ color: 'var(--accent-mint)' }}>{baseBri}%</strong>
                    </div>
                  </div>

                  {/* Monitor Actions Footer */}
                  <div style={{ width: '100%', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {mon.device_name || `DISPLAY${idx + 1}`}
                    </span>
                    <button
                      className={`tactile-btn ${isSoloThis ? 'active-rose' : ''}`}
                      style={{
                        height: '20px',
                        fontSize: '9px',
                        padding: '0 6px',
                        color: isSoloThis ? '#ff5252' : undefined,
                      }}
                      onClick={() => handleToggleSoloBlackout(idx)}
                      title={`Погасить только дисплей #${idx + 1}`}
                    >
                      {isSoloThis ? '● Погашен' : 'Solo Blackout'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Master Jog-Dial & Presets Island */}
        <div className="titanium-island" style={{ justifyContent: 'space-between' }}>
          <div className="engraved-header" style={{ marginBottom: '4px' }}>
            <span className="tag">
              <span className="led-dot"></span> Общая яркость всех дисплеев (JOG-DIAL)
            </span>
            <span className="metric-badge" style={{ color: 'var(--accent-mint)', fontWeight: 700 }}>
              {monitors.length === 0 ? '—' : isBlackout ? '🌑 0%' : `☀️ ${masterBrightness}%`}
            </span>
          </div>

          {/* Mechanical Jog Dial Wheel */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '6px 0',
            }}
          >
            <div
              ref={dialRef}
              onPointerDown={handleDialPointerDown}
              onPointerMove={handleDialPointerMove}
              onPointerUp={handleDialPointerUp}
              onPointerCancel={handleDialPointerUp}
              onWheel={handleJogWheel}
              style={{
                width: '105px',
                height: '105px',
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
              }}
              title="Зажмите ЛКМ и вращайте колесо по кругу, или крутите колесико мыши (±5%)"
            >
              <div
                style={{
                  position: 'absolute',
                  inset: '5px',
                  borderRadius: '50%',
                  border: '1px dashed rgba(255,255,255,0.15)',
                }}
              />

              {/* Rotary Indicator Knob (270° Potentiometer Sweep) */}
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

              {/* Central Metallic Core */}
              <div
                style={{
                  width: '62px',
                  height: '62px',
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
                    fontFamily: 'var(--font-mono)',
                    fontSize: '18px',
                    fontWeight: 800,
                    color: isBlackout ? 'var(--text-muted)' : 'var(--accent-mint)',
                    lineHeight: 1,
                  }}
                >
                  {monitors.length === 0 ? '—' : isBlackout ? '0' : masterBrightness}
                </span>
                <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  % BRI
                </span>
              </div>
            </div>

            {/* Quick 5 Presets Stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '95px' }}>
              {BRIGHTNESS_PRESETS.map(p => (
                <button
                  key={p.val}
                  className={`tactile-btn ${(!isBlackout && masterBrightness === p.val) ? 'active-mint' : ''}`}
                  style={{
                    height: '21px',
                    fontSize: '9.5px',
                    justifyContent: 'flex-start',
                    padding: '0 8px',
                    fontFamily: 'var(--font-mono)',
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

          {/* Master Blackout CTA Button */}
          <button
            className={`tactile-btn ${isBlackout ? 'active-rose' : ''}`}
            style={{
              width: '100%',
              height: '32px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.08em',
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
            title="Мгновенное погружение всех экранов в 100% темноту (Alt + Backspace). ПК продолжает работать на полной мощности."
          >
            <span>{isBlackout ? '☀️ ПРОБУДИТЬ ЭКРАНЫ' : '🌑 НОЧНОЙ BLACKOUT (0%)'}</span>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
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
         TIER 3: PER-MONITOR PRECISION HARDWARE SLIDERS
         ========================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: monitors.length > 1 ? `repeat(${Math.min(monitors.length, 3)}, 1fr)` : '1fr',
          gap: '10px',
        }}
      >
        {monitors.length === 0 && (
          <div className="obsidian-well" role="status" style={{ gridColumn: '1 / -1', padding: '12px', color: 'var(--text-muted)', fontSize: '10px' }}>
            Индивидуальные настройки яркости будут доступны после обнаружения дисплеев.
          </div>
        )}
        {monitors.map((mon, idx) => {
          const isSoloThis = soloScreenIdx === idx;
          const displayBri = isBlackout || isSoloThis ? 0 : mon.current_brightness;
          const baseBri = mon.baseline_brightness ?? mon.current_brightness;

          return (
            <div key={mon.id || idx} className="titanium-island" style={{ gap: '8px' }}>
              <div className="engraved-header" style={{ marginBottom: 0 }}>
                <span className="tag">
                  <span className="led-dot"></span> СЛАЙДЕР: #{idx + 1} {mon.name.replace(/^[^\wА-Яа-я#]+/, '') || `Экран ${idx + 1}`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    База: {baseBri}%
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, color: 'var(--accent-mint)' }}>
                    {displayBri}%
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🌑</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={displayBri}
                  disabled={isBlackout || isSoloThis}
                  onChange={e => handleSingleMonitorChange(idx, Number(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: 'var(--accent-mint)',
                    cursor: (isBlackout || isSoloThis) ? 'not-allowed' : 'pointer',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>☀️</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                <span>{mon.is_laptop_internal ? 'WMI ACPI Protocol' : 'DDC/CI VCP 0x10'}</span>
                <span>{isLinked ? '🔗 Связан с Мастером' : '🔓 Независимый'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================================
         TIER 4: SLEEP TIMER + OLED PROTECTION + ULTRA-DARK MODE
         ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: '10px' }}>
        {/* Sleep Timer Island */}
        <div className="titanium-island" style={{ justifyContent: 'space-between', gap: '8px' }}>
          <div className="engraved-header" style={{ marginBottom: '2px' }}>
            <span className="tag">
              <span className="led-dot"></span> ТАЙМЕР СНА (SLEEP TIMER)
            </span>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: sleepTimerMinutes > 0 ? 'var(--accent-mint)' : 'var(--text-muted)',
              }}
            >
              {sleepTimerMinutes > 0 ? `● ${sleepTimerMinutes} мин` : '○ Отключен'}
            </span>
          </div>

          <p style={{ fontSize: '9.5px', color: 'var(--text-secondary)', margin: '2px 0 6px 0', lineHeight: 1.4 }}>
            Автоматический вход в ночной Blackout через заданное время. Компьютер не прерывает фарм и закачки.
          </p>

          {/* Timer Preset Chips */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {SLEEP_TIMER_PRESETS.map(t => (
              <button
                key={t.mins}
                className={`tactile-btn ${sleepTimerMinutes === t.mins ? 'active-mint' : ''}`}
                style={{
                  height: '24px',
                  fontSize: '9.5px',
                  padding: '0 8px',
                  fontFamily: 'var(--font-mono)',
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
              <span className="led-dot"></span> ЗАЩИТА СИСТЕМЫ & АУДИО
            </span>
            <span className="metric-badge" style={{ fontSize: '8.5px', color: 'var(--accent-mint)' }}>
              AWAYMODE ON
            </span>
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
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  🔇 Ночной Mute (CoreAudio)
                </span>
                <span style={{ fontSize: '8.5px', color: 'var(--text-muted)' }}>
                  Глушить звук в Blackout и возвращать при пробуждении
                </span>
              </div>
              <button
                className={`tactile-btn ${muteAudioOnBlackout ? 'active-mint' : ''}`}
                style={{ height: '20px', fontSize: '9px', padding: '0 6px' }}
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
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  🛡️ Strict Shield
                </span>
                <span style={{ fontSize: '8.5px', color: 'var(--text-muted)' }}>
                  Защита от случайных кликов (выход по Esc / Alt+Backspace)
                </span>
              </div>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent-mint)' }}>
                АКТИВЕН
              </span>
            </div>
          </div>
        </div>

        {/* Ultra-Dark Mode Island */}
        <div className="titanium-island" style={{ justifyContent: 'space-between', gap: '8px' }}>
          <div className="engraved-header" style={{ marginBottom: '2px' }}>
            <span className="tag">
              <span className="led-dot"></span> СВЕРХТЕМНОТА (ULTRA-DARK)
            </span>
            <button
              className={`tactile-btn ${ultraDarkActive ? 'active-mint' : ''}`}
              style={{ height: '20px', fontSize: '9px', padding: '0 8px' }}
              onClick={handleToggleUltraDark}
              title="Активировать кликабельный сквозной фильтр затемнения ниже аппаратного предела монитора"
            >
              {ultraDarkActive ? '● АКТИВЕН' : '○ ВКЛЮЧИТЬ'}
            </button>
          </div>

          <p style={{ fontSize: '9.5px', color: 'var(--text-secondary)', margin: '2px 0', lineHeight: 1.35 }}>
            Сквозной кликабельный оверлей (<code style={{ color: 'var(--accent-mint)' }}>WS_EX_TRANSPARENT</code>) для комфортной ночной работы без паразитной засветки матрицы.
          </p>

          {/* UltraDark Tint Depth Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>Глубина тонирования:</span>
              <span style={{ color: 'var(--accent-mint)', fontWeight: 700 }}>{ultraDarkTint}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>10%</span>
              <input
                type="range"
                min="10"
                max="95"
                value={ultraDarkTint}
                onChange={e => handleUltraDarkTintChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-mint)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>95%</span>
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
          flex: 1,
          minHeight: '130px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '10px 14px',
        }}
      >
        <div className="engraved-header" style={{ marginBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="tag">
              <span className="led-dot"></span> ЖУРНАЛ АППАРАТНОЙ ШИНЫ (DDC/CI & WMI TELEMETRY)
            </span>
            <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              LIVE I2C BUS & ACPI DRIVER EVENTS
            </span>
          </div>
          <button
            className="tactile-btn"
            style={{ height: '18px', fontSize: '8.5px', padding: '0 6px' }}
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
            flex: 1,
            minHeight: '80px',
            borderRadius: '6px',
            padding: '8px 10px',
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '9.5px',
            lineHeight: 1.45,
            background: 'rgba(10, 14, 12, 0.75)',
            border: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {busLogs.map(log => (
            <div key={log.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '9px' }}>[{log.time}]</span>
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
          fontSize: '9.5px',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>⌨️ <strong style={{ color: 'var(--text-heading)' }}>Alt + Backspace:</strong> Blackout (0%)</span>
          <span>•</span>
          <span>⌨️ <strong style={{ color: 'var(--accent-mint)' }}>Alt + Shift + Backspace:</strong> Восстановить базовую</span>
          <span>•</span>
          <span><strong style={{ color: 'var(--text-heading)' }}>Esc:</strong> Выход из Blackout</span>
          <span>•</span>
          <span>🖱️ <strong style={{ color: 'var(--text-heading)' }}>Колесо над Jog:</strong> Регулировка ±5%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-mint)' }}>
          <span className="led-dot" style={{ width: '5px', height: '5px' }}></span>
          <span>DDC/CI DXVA2 & WMI READY</span>
        </div>
      </div>
    </div>
  );
};
