import React, { useState, useEffect } from 'react';
import { SentinelSettings, SentinelStats, UpdateCheckResult, UpdateProgressStatus } from '../types';
import { getLang, setLang, type Lang } from '../i18n';
import { TEXT_SCALE_DEFAULT, TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_SCALE_STEP, getTextScale, setTextScale } from '../utils/textScale';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { moduleStates, modulesLabel, type ModuleKey } from '../utils/moduleSwitches';

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
  const [textScale, setTextScaleState] = useState(getTextScale());
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [scanLabel, setScanLabel] = useState<string>('↻ Пересканировать все диски');
  const [backupLabel, setBackupLabel] = useState<string>('📦 Бэкап профиля (.zip)');
  const [pendingDanger, setPendingDanger] = useState<'trophies' | 'logout' | null>(null);
  const [showDiagModal, setShowDiagModal] = useState<boolean>(false);
  const [diagContent, setDiagContent] = useState<string>('');
  const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(false);

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [closeAction, setCloseAction] = useState<'ask' | 'tray' | 'exit' | null>(null);

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
        if (data && data.type === 'CLOSE_ACTION') {
          setCloseAction(data.value === 'tray' || data.value === 'exit' ? data.value : 'ask');
        }
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

  // The shell (MainForm.cs) owns the close-button behavior; ask it for the current value
  useEffect(() => {
    (window as any).chrome?.webview?.postMessage({ type: 'GET_CLOSE_ACTION' });
  }, []);

  const handleCloseActionChange = (value: 'ask' | 'tray' | 'exit') => {
    playClick();
    (window as any).chrome?.webview?.postMessage({ type: 'SET_CLOSE_ACTION', value });
  };

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

  const handleConfirmDanger = (type: 'trophies' | 'logout') => {
    playClick();
    if (type === 'trophies') {
      fetch('http://127.0.0.1:28492/api/trophies/clear', { method: 'POST' }).catch(() => {});
      alert('Журнал Trophies.md очищен!');
    } else {
      fetch('http://127.0.0.1:28492/api/logout', { method: 'POST' }).catch(() => {});
      alert('Сессия сброшена! Перезапустите Sentinel.');
    }
    setPendingDanger(null);
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
    } catch (err) {
      console.error(`SettingsStudio: не удалось удалить папку ${folderPath}`, err);
    }
  };

  const handleClearCache = async () => {
    playClick();
    try {
      await fetch('http://127.0.0.1:28492/api/game-directories/clear-cache', { method: 'POST' });
      alert('Кэш распознавания игр очищен!');
    } catch (err) {
      console.error('SettingsStudio: не удалось очистить кэш распознавания', err);
      alert('Не удалось очистить кэш: сервис недоступен');
    }
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
  const handleClearTrophies = () => { playClick(); setPendingDanger('trophies'); };
  const handleLogout = () => { playClick(); setPendingDanger('logout'); };
  const handlePowerModeChange = (mode: string) => onUpdateSettings({ auto_shutdown_mode: mode as any });
  const [showReportModal, setShowReportModal] = [showDiagModal, setShowDiagModal];
  const updateStageNames: Record<string, string> = {
    downloading: 'Загрузка обновления',
    extracting: 'Распаковка обновления',
    done: 'Обновление готово',
    error: 'Ошибка обновления',
  };
  const updateStage = updateCheckError
    ? `Ошибка проверки: ${updateCheckError}`
    : updateProgress && updateProgress.stage !== 'idle'
      ? updateProgress.error_message || updateStageNames[updateProgress.stage] || updateProgress.stage
      : updateInfo?.update_available
        ? `Доступно обновление v${updateInfo.remote_version}`
        : updateInfo
          ? `Установлена актуальная версия v${updateInfo.local_version}`
          : 'Обновления: не проверялись';
  const updatePct = updateProgress?.percent ?? (updateInfo ? 100 : 0);

  const moduleOn = moduleStates(settings, { muted: isMuted, autostart: autostartEnabled });
  const powerModeWord = settings.auto_shutdown_mode === 'shutdown' ? 'выключится' : settings.auto_shutdown_mode === 'lock' ? 'заблокируется' : 'уйдёт в сон';
  const moduleCards: { key: ModuleKey; title: string; hint: string; tooltip?: string; onToggle: () => void }[] = [
    {
      key: 'claimPoints',
      title: 'Собирать бонусные баллы канала',
      hint: `Собрано: +${stats.channel_points_earned.toLocaleString()} бонусных очков`,
      onToggle: () => { playClick(); onUpdateSettings({ claim_channel_points: !moduleOn.claimPoints }); },
    },
    {
      key: 'autoClaim',
      title: 'Забирать дропы автоматически',
      hint: 'Сразу после 100 %',
      onToggle: () => { playClick(); onUpdateSettings({ auto_claim_drops: !moduleOn.autoClaim }); },
    },
    {
      key: 'giveaways',
      title: 'Бесплатные раздачи',
      hint: 'Следит за бесплатными играми в магазинах',
      onToggle: () => { playClick(); onUpdateSettings({ giveaways_enabled: !moduleOn.giveaways }); },
    },
    {
      key: 'watchdog',
      title: 'Менять зависший стрим',
      hint: 'Если минуты не идут, берёт другой канал',
      tooltip: 'Следит, чтобы минуты просмотра росли; при зависании переключается на другого стримера',
      onToggle: () => { playClick(); onUpdateSettings({ streamer_watchdog_enabled: !moduleOn.watchdog }); },
    },
    {
      key: 'hardwareGuard',
      title: 'Пауза, когда вы играете',
      hint: 'Фарм встаёт на паузу, пока запущена игра',
      tooltip: 'Чтобы фарм не отнимал FPS: пока Sentinel видит запущенную игру, он ничего не смотрит',
      onToggle: () => { playClick(); onUpdateSettings({ hardware_guard_enabled: !moduleOn.hardwareGuard }); },
    },
    {
      key: 'batteryPause',
      title: 'Энергосбережение батареи ноутбука',
      hint: 'Пауза фарма при переходе на аккумулятор',
      onToggle: () => { playClick(); onUpdateSettings({ pause_on_battery: !moduleOn.batteryPause }); },
    },
    {
      key: 'toasts',
      title: 'Всплывающие уведомления Windows',
      hint: 'Сообщает о дропах и важных событиях',
      onToggle: () => { playClick(); onUpdateSettings({ native_toasts: !moduleOn.toasts }); },
    },
    {
      key: 'sounds',
      title: 'Звуки интерфейса',
      hint: 'Щелчки и сигналы при действиях',
      onToggle: () => { toggleMute(); },
    },
    {
      key: 'powerCascade',
      title: 'Выключить или усыпить ПК после очереди',
      hint: moduleOn.powerCascade ? `Когда очередь закончится, ПК ${powerModeWord}` : 'Сон, выключение или блокировка после очереди',
      tooltip: 'Включено: Sentinel выполнит выбранное действие с ПК, когда все дропы очереди получены (за 60 секунд до этого покажет предупреждение)',
      onToggle: () => { playClick(); onUpdateSettings({ auto_shutdown_on_complete: !moduleOn.powerCascade }); },
    },
    {
      key: 'autostart',
      title: 'Запускать с Windows (свёрнуто)',
      hint: 'Стартует вместе с системой, окно скрыто в трее',
      onToggle: () => { playClick(); void handleToggleAutostart(); },
    },
  ];


  return (
    <div id="view-settings" className="view-tab active" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100%', gap: '12px' }}>
      <div className="settings-full-layout">
        
        {/* Left Column: 10 CNC Switches Grid + Luna Cascade 1-to-1 with SPEC */}
        <div className="titanium-island" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div className="engraved-header">
              <span className="tag">
                <span className="led-dot"></span> <span title="Управление модулями и автоматизация (все 10 систем Sentinel)">МОДУЛИ</span>
              </span>
              <span className="version-chip" title="Сколько из десяти модулей сейчас включено">{modulesLabel(moduleOn)}</span>
            </div>

            <div className="modules-10-grid">
              {moduleCards.map((m) => (
                <div key={m.key} className="module-switch-card" onClick={m.onToggle} title={m.tooltip}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>{m.title}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{m.hint}</div>
                  </div>
                  <div className={`cnc-switch ${moduleOn[m.key] ? 'on' : ''}`} id={m.key === 'powerCascade' ? 'lunaSwitch' : undefined}>
                    <div className="knob"></div>
                  </div>
                </div>
              ))}
              {autostartError && (
                <div role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--led-amber)' }}>
                  Автозапуск недоступен: {autostartError}
                </div>
              )}
            </div>
          </div>

          <div className="obsidian-well" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }} title="Что делает крестик окна. Фарм продолжается, пока приложение не закрыто полностью">ПРИ ЗАКРЫТИИ ОКНА:</span>
            {([['ask', 'Спрашивать'], ['tray', 'В трей'], ['exit', 'Выход']] as const).map(([value, label]) => (
              <button
                key={value}
                className={`tactile-btn ${closeAction === value ? 'active-amber' : ''}`}
                disabled={closeAction === null}
                onClick={() => handleCloseActionChange(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="obsidian-well" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>ЯЗЫК ИНТЕРФЕЙСА:</span>
            {([['ru', 'Русский'], ['en', 'English']] as const).map(([value, label]) => (
              <button
                key={value}
                className={`tactile-btn ${getLang() === value ? 'active-amber' : ''}`}
                onClick={() => { playClick(); if (getLang() !== value) void setLang(value as Lang); }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="obsidian-well" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }} title="Крупнее текст: удобнее читать, на экране помещается меньше">
            <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>РАЗМЕР ТЕКСТА:</span>
            <input
              type="range"
              min={TEXT_SCALE_MIN}
              max={TEXT_SCALE_MAX}
              step={TEXT_SCALE_STEP}
              value={textScale}
              aria-label="Размер текста"
              onChange={(e) => { const value = Number(e.target.value); setTextScaleState(value); void setTextScale(value); }}
              style={{ flex: '1 1 8rem', minWidth: '6rem', maxWidth: '16rem', accentColor: 'var(--led-mint)', cursor: 'pointer' }}
            />
            <span className="tabular" style={{ minWidth: '3.2em', fontWeight: 700, color: 'var(--led-amber)' }}>{textScale}%</span>
            <button
              className="tactile-btn"
              disabled={textScale === TEXT_SCALE_DEFAULT}
              onClick={() => { playClick(); setTextScaleState(TEXT_SCALE_DEFAULT); void setTextScale(TEXT_SCALE_DEFAULT); }}
            >
              Сбросить (100 %)
            </button>
          </div>

          {/* Luna Cascade Box 1-to-1 with SPEC */}
          <div 
            id="lunaCascadeBox" 
            className="obsidian-well" 
            style={{ marginTop: '8px', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>ПОСЛЕ ОЧЕРЕДИ:</span>
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
                setTestCountdown(testCountdown !== null ? null : 5);
              }}
              title="Только отсчёт на экране: ПК не будет выключен, усыплён или заблокирован"
            >
              {testCountdown !== null ? `⏱ Отмена (${testCountdown} с)` : '⏱ Проверить таймер (5 с, ПК не затронет)'}
            </button>
          </div>
        </div>

        {/* Right Column: Farming Strategy + Game Directories 1-to-1 with SPEC */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Strategy Island */}
          <div className="titanium-island" style={{ gap: '6px' }}>
            <div className="engraved-header" style={{ marginBottom: '2px' }}>
              <span className="tag">
                <span className="led-dot"></span> <span title="Что фармить, когда в очереди нечего собирать">СТРАТЕГИЯ ФАРМА</span>
              </span>
            </div>

            <div 
              className={`strategy-option ${currentStrategy === 'priority_only' ? 'active' : ''}`}
              onClick={() => {
                playClick();
                onUpdateSettings({ priority_mode: 0 });
              }}
            >
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>
                🎯 Только очередь (рекомендуется)
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Фармит только игры из вашей очереди.
              </div>
            </div>

            <div 
              className={`strategy-option ${currentStrategy === 'priority_fallback_any' ? 'active' : ''}`}
              onClick={() => {
                playClick();
                onUpdateSettings({ priority_mode: 1 });
              }}
            >
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>
                ⚡ Очередь, а если пусто — любые доступные
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Если по очереди нечего фармить (нет кампаний или стримеры офлайн), временно берёт любые доступные дропы.
              </div>
            </div>

            <div 
              className={`strategy-option ${currentStrategy === 'priority_ending_soon' ? 'active' : ''}`}
              onClick={() => {
                playClick();
                onUpdateSettings({ priority_mode: 2 });
              }}
            >
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>
                ⏳ Очередь, затем кампании, которые скоро закончатся
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Сначала ваша очередь, потом кампании с наименьшим оставшимся временем.
              </div>
            </div>
          </div>

          {/* Game Folders Island */}
          <div className="titanium-island" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            <div className="engraved-header" style={{ marginBottom: 0 }}>
              <span className="tag">
                <span className="led-dot"></span> <span title="Библиотеки и папки с играми">ПАПКИ С ИГРАМИ · {installedCount}</span>
              </span>
              <button className="tactile-btn active-mint" style={{ minHeight: '22px', fontSize: 'var(--fs-xs)' }} onClick={handleAddFolder}>
                + Добавить папку
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {directories.map((dir, idx) => (
                <div key={idx} className="obsidian-well tabular" style={{ padding: '6px 10px', fontSize: 'var(--fs-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>📁 {dir}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--led-mint)', fontSize: 'var(--fs-xs)' }}>[НАСТРОЕН]</span>
                    <button
                      className="tactile-btn danger-hover"
                      style={{ padding: '1px 6px', minHeight: '18px', fontSize: 'var(--fs-xs)' }}
                      onClick={() => handleRemoveFolder(dir)}
                      title="Удалить папку"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="obsidian-well tabular" style={{ padding: '7px 10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* Danger zone: destructive actions live apart from everyday buttons and always ask first */}
      <div className="danger-zone" role="group" aria-label="Опасная зона">
        <span className="danger-zone-title">⚠ Опасная зона</span>
        <div className="danger-zone-item">
          {pendingDanger === 'trophies' ? (
            <>
              <span className="danger-zone-question">Очистить трофеи? Журнал будет удалён.</span>
              <button className="safety-guard-btn armed" onClick={() => handleConfirmDanger('trophies')}>Да, очистить</button>
              <button className="tactile-btn" onClick={() => { playClick(); setPendingDanger(null); }}>Отмена</button>
            </>
          ) : (
            <>
              <button className="safety-guard-btn" onClick={handleClearTrophies} title="Удалить журнал полученных наград Trophies.md">Очистить трофеи</button>
              <span className="danger-zone-hint">Удаляет журнал полученных наград</span>
            </>
          )}
        </div>
        <div className="danger-zone-item">
          {pendingDanger === 'logout' ? (
            <>
              <span className="danger-zone-question">Выйти из аккаунта Twitch?</span>
              <button className="safety-guard-btn armed" onClick={() => handleConfirmDanger('logout')}>Да, выйти</button>
              <button className="tactile-btn" onClick={() => { playClick(); setPendingDanger(null); }}>Отмена</button>
            </>
          ) : (
            <>
              <button className="safety-guard-btn" onClick={handleLogout} title="Сбросить вход в Twitch и войти другим аккаунтом">Сменить аккаунт</button>
              <span className="danger-zone-hint">Сбрасывает вход в Twitch</span>
            </>
          )}
        </div>
      </div>

      {/* Bottom Full-Width Account & Live Update Bar (Pinned to the bottom) */}
      <div 
        className="titanium-island" 
        style={{ marginTop: 'auto', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', padding: '10px 16px', flexShrink: 0 }}
      >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
            <div className="obsidian-well" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, maxWidth: '100%' }}>
              <span className="led-dot"></span>
              <div style={{ minWidth: 0 }}>
                <div className="clip-1" style={{ fontSize: 'var(--fs-xs)', fontWeight: 800 }} title={userId ? `ID аккаунта: ${userId}` : 'Аккаунт не подтверждён'}>
                  Twitch: {username} <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{userId ? '' : '(аккаунт не подтверждён) '}• Mortuis_V_Studio</span>
                </div>
              </div>
            </div>
            
            <button className="tactile-btn" onClick={handleBackupProfile}>
              {backupLabel}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="obsidian-well" style={{ padding: '6px 12px', width: '15rem', maxWidth: '100%', minWidth: 0 }}>
              <div className="tabular" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '3px' }}>
                <span id="updStageText" title={updateStage} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{updateStage}</span>
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
                <h3 className="text-sm font-bold tracking-[0.04em] uppercase text-[var(--text-primary)]">
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
              className="obsidian-well p-4 tabular text-xs text-[var(--text-secondary)] whitespace-pre-wrap overflow-y-auto max-h-[420px]"
              style={{ lineHeight: 1.6 }}
            >
              {isLoadingDiag ? 'Сбор телеметрии системы...' : diagContent}
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">
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
