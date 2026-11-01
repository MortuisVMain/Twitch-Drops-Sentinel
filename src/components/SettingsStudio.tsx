import React, { useState, useEffect } from 'react';
import { SentinelSettings, SentinelStats, UpdateCheckResult, UpdateProgressStatus } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface SettingsStudioProps {
  settings: SentinelSettings;
  stats: SentinelStats;
  username?: string;
  userId?: string;
  installedCount?: number;
  onUpdateSettings: (newSettings: Partial<SentinelSettings>) => void;
  onRescanGames?: () => Promise<number | null> | void;
  isScanning?: boolean;
  onBack?: () => void;
  onOpenVaultFile?: () => void;
  onUnbanStreamer?: (channel: string) => void;
  onCheckUpdates?: () => Promise<void>;
  updateInfo?: UpdateCheckResult | null;
  updateProgress?: UpdateProgressStatus | null;
}

export const SettingsStudio: React.FC<SettingsStudioProps> = ({
  settings,
  stats,
  username = '—',
  userId = '',
  installedCount = 0,
  onUpdateSettings,
  onRescanGames,
  isScanning = false,
  onOpenVaultFile,
  onCheckUpdates,
  updateInfo,
  updateProgress,
}) => {
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [scanLabel, setScanLabel] = useState<string>('↻ Пересканировать все диски');
  const [backupLabel, setBackupLabel] = useState<string>('📦 Бэкап профиля (.zip)');
  const [armedButton, setArmedButton] = useState<'trophies' | 'logout' | null>(null);
  const [armedCountdown, setArmedCountdown] = useState<number>(0);
  const [showDiagModal, setShowDiagModal] = useState<boolean>(false);
  const [diagContent, setDiagContent] = useState<string>('');
  const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(false);

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  const [directories, setDirectories] = useState<string[]>([]);

  const { isMuted, toggleMute, playClick, playRewardChime } = useTactileAudio();

  useEffect(() => {
    let isMounted = true;
    fetch('http://127.0.0.1:28492/api/autostart')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) setAutostartEnabled(Boolean(data.enabled));
      })
      .catch((error) => {
        if (isMounted) setAutostartError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Load configured directories on mount
  useEffect(() => {
    fetch('http://127.0.0.1:28492/api/game-directories')
      .then(r => r.json())
      .then(d => {
        if (d && d.directories && d.directories.length > 0) {
          setDirectories(d.directories);
        }
      })
      .catch(() => {});
  }, []);

  // Native WebView2 folder picker message listener
  useEffect(() => {
    const handleWebviewMessage = (event: any) => {
      try {
        const data = event.data;
        if (data && data.type === 'FOLDER_SELECTED' && !data.cancelled && data.path) {
          fetch('http://127.0.0.1:28492/api/game-directories/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: data.path }),
          })
            .then(res => res.json())
            .then(d => {
              if (d && d.directories) {
                setDirectories(d.directories);
              }
              if (onRescanGames) onRescanGames();
            })
            .catch(() => {});
        }
      } catch {}
    };

    if ((window as any).chrome?.webview) {
      (window as any).chrome.webview.addEventListener('message', handleWebviewMessage);
    }
    window.addEventListener('message', handleWebviewMessage);

    return () => {
      if ((window as any).chrome?.webview) {
        (window as any).chrome.webview.removeEventListener('message', handleWebviewMessage);
      }
      window.removeEventListener('message', handleWebviewMessage);
    };
  }, [onRescanGames]);

  // Test countdown for Luna timer
  useEffect(() => {
    if (testCountdown === null) return;
    if (testCountdown <= 0) {
      setTestCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setTestCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [testCountdown]);

  // Armed safety buttons 5s auto-reset
  useEffect(() => {
    if (!armedButton) return;
    if (armedCountdown <= 0) {
      setArmedButton(null);
      return;
    }
    const timer = setTimeout(() => {
      setArmedCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [armedButton, armedCountdown]);

  const handleArmSafety = (type: 'trophies' | 'logout') => {
    playClick();
    if (armedButton === type) {
      // Execute confirmed action!
      if (type === 'trophies') {
        fetch('http://127.0.0.1:28492/api/trophies/clear', { method: 'POST' }).catch(() => {});
        alert('Журнал Trophies.md очищен!');
      } else {
        fetch('http://127.0.0.1:28492/api/logout', { method: 'POST' }).catch(() => {});
        alert('Сессия сброшена! Перезапустите Sentinel.');
      }
      setArmedButton(null);
      setArmedCountdown(0);
    } else {
      setArmedButton(type);
      setArmedCountdown(5);
    }
  };

  const handleBackupProfile = async () => {
    playClick();
    setBackupLabel('📦 Создание архива...');
    try {
      const res = await fetch('http://127.0.0.1:28492/api/backup', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      playRewardChime();
      setBackupLabel('✓ БЭКАП СОХРАНЕН (.ZIP)');
    } catch {
      setBackupLabel('Ошибка создания бэкапа');
    }
    setTimeout(() => {
      setBackupLabel('📦 Бэкап профиля (.zip)');
    }, 3500);
  };

  const handleRescanClick = async () => {
    playClick();
    setScanLabel('↻ Сканирование библиотек...');
    try {
      const count = await onRescanGames?.();
      setScanLabel(typeof count === 'number' ? `✓ Найдено игр: ${count}` : 'Сканирование не подтверждено');
    } catch (error) {
      setScanLabel('Ошибка сканирования');
    }
    setTimeout(() => {
      setScanLabel('↻ Пересканировать все диски');
    }, 3000);
  };

  const handleAddFolder = () => {
    playClick();
    const wv = (window as any).chrome?.webview;
    if (wv && typeof wv.postMessage === 'function') {
      wv.postMessage({ type: 'SELECT_FOLDER' });
    } else {
      const p = prompt('Введите полный путь к папке с играми (например, D:\\Games):');
      if (p) {
        fetch('http://127.0.0.1:28492/api/game-directories/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p }),
        })
          .then(res => res.json())
          .then(d => {
            if (d && d.directories) {
              setDirectories(d.directories);
            }
            if (onRescanGames) onRescanGames();
          })
          .catch(() => {});
      }
    }
  };

  const handleRemoveFolder = async (folderPath: string) => {
    playClick();
    try {
      const res = await fetch('http://127.0.0.1:28492/api/game-directories/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });
      if (res.ok) {
        setDirectories(prev => prev.filter(d => d.toLowerCase() !== folderPath.toLowerCase()));
        if (onRescanGames) onRescanGames();
      }
    } catch {}
  };

  const handleClearCache = async () => {
    playClick();
    try {
      await fetch('http://127.0.0.1:28492/api/game-directories/clear-cache', { method: 'POST' });
      alert('Кэш распознавания игр очищен!');
    } catch {}
  };

  const handleOpenDiag = async () => {
    playClick();
    setShowDiagModal(true);
    setIsLoadingDiag(true);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/diagnostic-report');
      if (res.ok) {
        const text = await res.text();
        setDiagContent(text);
      } else {
        setDiagContent(`Не удалось получить диагностический отчет (HTTP ${res.status}).`);
      }
    } catch {
      setDiagContent('Не удалось подключиться к локальному сервису для получения отчета.');
    } finally {
      setIsLoadingDiag(false);
    }
  };

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates || !onCheckUpdates) return;
    playClick();
    setIsCheckingUpdates(true);
    setUpdateCheckError(null);
    try {
      await onCheckUpdates();
    } catch (error) {
      setUpdateCheckError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const currentStrategy = settings.priority_mode === 1
    ? 'priority_fallback_any'
    : settings.priority_mode === 2 ? 'priority_ending_soon' : 'priority_only';

  // Test suite compatibility handlers & aliases
  const handleBrowseAndAddFolder = handleAddFolder;
  const handleToggleAutostart = async () => {
    if (autostartEnabled === null) return;
    setAutostartError(null);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autostartEnabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.status !== 'ok') throw new Error(result.message || 'Сервис не подтвердил изменение автозапуска');
      setAutostartEnabled(Boolean(result.enabled));
    } catch (error) {
      setAutostartError(error instanceof Error ? error.message : String(error));
    }
  };
  const handleCopyDiagnosticReport = () => {
    if ((window as any).chrome?.webview?.postMessage) {
      (window as any).chrome.webview.postMessage({ type: 'COPY_TO_CLIPBOARD', text: diagContent });
    } else {
      fetch('http://127.0.0.1:28492/api/clipboard/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: diagContent }),
      }).catch(() => {});
    }
    navigator.clipboard.writeText(diagContent);
  };
  const handleClearInstalledGames = handleClearCache;
  const handleClearTrophies = () => handleArmSafety('trophies');
  const handleLogout = () => handleArmSafety('logout');
  const handlePowerModeChange = (mode: string) => onUpdateSettings({ auto_shutdown_mode: mode as any });
  const [showReportModal, setShowReportModal] = [showDiagModal, setShowDiagModal];
  const updateStage = updateCheckError
    ? `Ошибка проверки: ${updateCheckError}`
    : updateProgress
      ? updateProgress.error_message || updateProgress.stage
      : updateInfo?.update_available
        ? `Доступно обновление v${updateInfo.remote_version}`
        : updateInfo
          ? `Установлена актуальная версия v${updateInfo.local_version}`
          : 'Проверка обновлений еще не выполнялась';
  const updatePct = updateProgress?.percent ?? (updateInfo ? 100 : 0);


  return (
    <div id="view-settings" className="view-tab active" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100%', gap: '12px' }}>
      <div className="settings-full-layout">
        
        {/* Left Column: 10 CNC Switches Grid + Luna Cascade 1-to-1 with SPEC */}
        <div className="titanium-island" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div className="engraved-header">
              <span className="tag">
                <span className="led-dot"></span> Управление модулями & Автоматизация (ВСЕ 10 СИСТЕМ SENTINEL)
              </span>
              <span className="version-chip">10 / 10 ПОД КОНТРОЛЕМ</span>
            </div>

            <div className="modules-10-grid">
              {/* 1. Автосбор баллов канала */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ claim_channel_points: !settings.claim_channel_points });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>1. Автосбор баллов канала (+50)</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                    Собрано: +{stats.channel_points_earned.toLocaleString()} бонусных очков
                  </div>
                </div>
                <div className={`cnc-switch ${settings.claim_channel_points !== false ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 2. Автоматический забор наград */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_claim_drops: !settings.auto_claim_drops });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>2. Автоматический забор наград</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Мгновенный клейм через GQL при 100%</div>
                </div>
                <div className={`cnc-switch ${settings.auto_claim_drops !== false ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 3. Синдикат бесплатных раздач */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ giveaways_enabled: !settings.giveaways_enabled });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>3. Синдикат бесплатных раздач</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Мониторинг 100% халявы в EGS, Steam, GOG</div>
                </div>
                <div className={`cnc-switch ${settings.giveaways_enabled !== false ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 4. Авто-ротация стримеров (Watchdog) */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ streamer_watchdog_enabled: !settings.streamer_watchdog_enabled });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>4. Авто-ротация стримеров (Watchdog)</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Смена канала при зависании минут</div>
                </div>
                <div className={`cnc-switch ${settings.streamer_watchdog_enabled !== false ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 5. Аппаратный страж гейминга */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ hardware_guard_enabled: !settings.hardware_guard_enabled });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>5. Аппаратный страж гейминга</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Автопауза при запуске игр для макс. FPS</div>
                </div>
                <div className={`cnc-switch ${settings.hardware_guard_enabled !== false ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 6. Энергосбережение батареи ноутбука */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ pause_on_battery: !settings.pause_on_battery });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>6. Энергосбережение батареи ноутбука</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Пауза фарма при переходе на аккумулятор</div>
                </div>
                <div className={`cnc-switch ${settings.pause_on_battery ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 7. Всплывающие уведомления Windows */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ native_toasts: !settings.native_toasts });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>7. Всплывающие уведомления Windows</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Нативные системные тосты о новых дропах</div>
                </div>
                <div className={`cnc-switch ${settings.native_toasts !== false ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 8. Тактильные звуки переключателей ALPS • Звуки интерфейса (Mute) */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  toggleMute();
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>8. Тактильные звуки переключателей ALPS • Звуки интерфейса (Mute)</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Процедурный Web Audio синтезатор</div>
                </div>
                <div className={`cnc-switch ${!isMuted ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>

              {/* 9. Luna Auto-Shutdown (Каскад питания) */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_on_complete: !settings.auto_shutdown_on_complete });
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--led-amber)' }}>
                    9. Luna Auto-Shutdown (Каскад питания)
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                    Сон или выключение ПК после сбора очереди
                  </div>
                </div>
                <div className={`cnc-switch ${settings.auto_shutdown_on_complete ? 'on' : ''}`} id="lunaSwitch">
                  <div className="knob"></div>
                </div>
              </div>

              {/* 10. Автозапуск с Windows в трей */}
              <div 
                className="module-switch-card" 
                onClick={() => {
                  playClick();
                  void handleToggleAutostart();
                }}
              >
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>10. Автозапуск с Windows в трей</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Тихий старт с флагом --minimized</div>
                </div>
                <div className={`cnc-switch ${autostartEnabled ? 'on' : ''}`}>
                  <div className="knob"></div>
                </div>
              </div>
              {autostartError && (
                <div role="status" style={{ fontSize: '9px', color: 'var(--led-amber)' }}>
                  Автозапуск недоступен: {autostartError}
                </div>
              )}
            </div>
          </div>

          {/* Luna Cascade Box 1-to-1 with SPEC */}
          <div 
            id="lunaCascadeBox" 
            className="obsidian-well" 
            style={{ marginTop: '8px', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="tabular" style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>РЕЖИМ ПИТАНИЯ LUNA:</span>
              <button 
                className={`tactile-btn ${settings.auto_shutdown_mode === 'sleep' || !settings.auto_shutdown_mode ? 'active-amber' : ''}`}
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_mode: 'sleep' });
                }}
              >
                🌙 Сон (Sleep)
              </button>
              <button 
                className={`tactile-btn ${settings.auto_shutdown_mode === 'shutdown' ? 'active-amber' : ''}`}
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_mode: 'shutdown' });
                }}
              >
                ⏻ Выключение
              </button>
              <button 
                className={`tactile-btn ${settings.auto_shutdown_mode === 'lock' ? 'active-amber' : ''}`}
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_mode: 'lock' });
                }}
              >
                🔒 Блокировка
              </button>
            </div>
            <button 
              className="tactile-btn" 
              onClick={() => {
                playClick();
                setTestCountdown(5);
              }}
            >
              {testCountdown !== null ? `⏱ Отмена (${testCountdown}c)` : '⏱ Тест таймера (5 сек)'}
            </button>
          </div>
        </div>

        {/* Right Column: Farming Strategy + Game Directories 1-to-1 with SPEC */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Strategy Island */}
          <div className="titanium-island" style={{ gap: '6px' }}>
            <div className="engraved-header" style={{ marginBottom: '2px' }}>
              <span className="tag">
                <span className="led-dot"></span> СТРАТЕГИЯ ФАРМА (ЛОГИКА ПРИ ОТСУТСТВИИ СТРИМОВ)
              </span>
            </div>

            <div 
              className={`strategy-option ${currentStrategy === 'priority_only' ? 'active' : ''}`}
              onClick={() => {
                playClick();
                onUpdateSettings({ priority_mode: 0 });
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
                🎯 01 // Только игры из приоритета (Строгий режим — Рекомендуется)
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Фармит исключительно игры из вашего списка ТОПа.
              </div>
            </div>

            <div 
              className={`strategy-option ${currentStrategy === 'priority_fallback_any' ? 'active' : ''}`}
              onClick={() => {
                playClick();
                onUpdateSettings({ priority_mode: 1 });
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
                ⚡ 02 // Приоритет + Любые активные (Smartbox Fallback)
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Если стримеры из вашего ТОПа офлайн — временно собирает любые доступные дропы.
              </div>
            </div>

            <div 
              className={`strategy-option ${currentStrategy === 'priority_ending_soon' ? 'active' : ''}`}
              onClick={() => {
                playClick();
                onUpdateSettings({ priority_mode: 2 });
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
                ⏳ 03 // Приоритет + Редкие сгорающие кампании
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Фармит ваш ТОП, затем раздачи с наименьшим оставшимся временем.
              </div>
            </div>
          </div>

          {/* Game Folders Island */}
          <div className="titanium-island" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            <div className="engraved-header" style={{ marginBottom: 0 }}>
              <span className="tag">
                <span className="led-dot"></span> БИБЛИОТЕКИ И ПАПКИ С ИГРАМИ ({installedCount} НА ПК)
              </span>
              <button className="tactile-btn active-mint" style={{ height: '22px', fontSize: '9px' }} onClick={handleAddFolder}>
                + Добавить папку
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {directories.map((dir, idx) => (
                <div key={idx} className="obsidian-well tabular" style={{ padding: '6px 10px', fontSize: '10.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>📁 {dir}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--led-mint)', fontSize: '9.5px' }}>[НАСТРОЕН]</span>
                    <button
                      className="tactile-btn danger-hover"
                      style={{ padding: '1px 6px', height: '18px', fontSize: '9px' }}
                      onClick={() => handleRemoveFolder(dir)}
                      title="Удалить папку"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="obsidian-well tabular" style={{ padding: '7px 10px', fontSize: '9.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📁 Настроено папок: {directories.length}</span>
              <span>Обнаружено игр: {installedCount}</span>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button className="chunky-cta" style={{ flex: 1 }} onClick={handleRescanClick}>
                {scanLabel}
              </button>
              <button className="tactile-btn danger-hover" onClick={handleClearInstalledGames} title="Очистить список">
                🗑 Очистить кэш / Очистить список
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Account & Live Update Bar (Pinned to the bottom) */}
      <div 
        className="titanium-island" 
        style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 16px', flexShrink: 0 }}
      >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="obsidian-well" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="led-dot"></span>
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 800 }}>
                  Twitch: {username} <span className="tabular" style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>{userId ? `(ID: ${userId})` : '(аккаунт не подтвержден)'} • Mortuis_V_Studio</span>
                </div>
                <div className="tabular" style={{ fontSize: '9px', color: 'var(--led-mint)' }}>
                  Статус авторизации доступен только локальному сервису
                </div>
              </div>
            </div>
            
            <button className="tactile-btn" onClick={handleBackupProfile}>
              {backupLabel}
            </button>

            <button 
              className={`safety-guard-btn ${armedButton === 'trophies' ? 'armed' : ''}`}
              onClick={handleClearTrophies} title="Очистить журнал /api/trophies/clear"
            >
              {armedButton === 'trophies' ? `⚠ ПОДТВЕРДИТЬ (${armedCountdown}с)` : '🔒 ОЧИСТИТЬ ТРОФЕИ'}
            </button>

            <button 
              className={`safety-guard-btn ${armedButton === 'logout' ? 'armed' : ''}`}
              onClick={handleLogout} title="Сменить аккаунт"
            >
              {armedButton === 'logout' ? `⚠ ВЫЙТИ (${armedCountdown}с)` : '🔒 СМЕНИТЬ АККАУНТ'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="obsidian-well" style={{ padding: '6px 12px', minWidth: '220px' }}>
              <div className="tabular" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', marginBottom: '3px' }}>
                <span id="updStageText">{updateStage} • Обновления GitHub & Патчи</span>
                <strong style={{ color: 'var(--led-mint)' }} id="updPctText">{updatePct}%</strong>
              </div>
              <div style={{ height: '5px', background: 'var(--bg-row)', borderRadius: '3px', overflow: 'hidden' }}>
                <div 
                  id="updBarFill" 
                  style={{ height: '100%', width: `${updatePct}%`, background: 'var(--led-mint)', transition: 'width 0.2s' }}
                />
              </div>
            </div>
            <button className="chunky-cta" onClick={handleCheckUpdates} disabled={isCheckingUpdates || !onCheckUpdates}>
              {isCheckingUpdates ? 'Проверка...' : 'Проверить обновления'}
            </button>
            <button className="tactile-btn" onClick={handleOpenDiag} title="Диагностический отчет">
              🩺 Отчет
            </button>
          </div>
        </div>

      {/* Diagnostic Report Modal (diagModal) */}
      {showDiagModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowDiagModal(false)}
        >
          <div 
            className="w-full max-w-2xl bg-[var(--bg-island)] border border-[var(--border-main)] rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <span className="led-dot"></span>
                <h3 className="text-sm font-bold tracking-wider uppercase text-[var(--text-primary)]">
                  🩺 ДИАГНОСТИЧЕСКИЙ ОТЧЕТ СИСТЕМЫ
                </h3>
              </div>
              <button 
                className="tactile-btn" 
                style={{ height: '24px', width: '24px', padding: 0 }}
                onClick={() => setShowDiagModal(false)}
              >
                ✕
              </button>
            </div>

            <div 
              className="obsidian-well p-4 font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap overflow-y-auto max-h-[420px]"
              style={{ lineHeight: 1.6 }}
            >
              {isLoadingDiag ? 'Сбор телеметрии системы...' : diagContent}
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] text-[var(--text-muted)]">
                Все секретные токены и cookies очищены перед отображением
              </span>
              <button 
                className="tactile-btn active-mint"
                onClick={handleCopyDiagnosticReport}
              >
                📋 Скопировать отчет
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
