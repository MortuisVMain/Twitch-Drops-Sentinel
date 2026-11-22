import { ClipboardCopy, Folder, History, Hourglass, Lock, Moon, Package, Plus, Power, RefreshCw, Stethoscope, Target, Timer, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { SentinelSettings, SentinelStats, UpdateCheckResult, UpdateProgressStatus } from '../types';
import { getLang, setLang, type Lang } from '../i18n';
import { TEXT_SCALE_DEFAULT, TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_SCALE_STEP, getTextScale, setTextScale } from '../utils/textScale';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { FarmScheduleCard } from './FarmScheduleCard';
import { WebhooksCard } from './WebhooksCard';
import { StartupCopiesCard } from './StartupCopiesCard';
import { useModalFocus } from '../hooks/useModalFocus';
import { moduleStates, modulesLabel, type ModuleKey } from '../utils/moduleSwitches';
import { rewardSwitches } from '../utils/rewardCampaigns.mjs';
import { tabSwitches, tabSetPatch, needsOffConfirmation, type TabId } from '../utils/tabVisibility.mjs';

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
  updateCheckFailure?: string | null;
  updateProgress?: UpdateProgressStatus | null;
  appVersion?: string;
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
  updateCheckFailure,
  updateProgress,
  appVersion,
}) => {
  const [textScale, setTextScaleState] = useState(getTextScale());
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [scanLabel, setScanLabel] = useState<string>('Пересканировать все диски');
  const [backupLabel, setBackupLabel] = useState<string>('Бэкап профиля (.zip)');
  const [pendingDanger, setPendingDanger] = useState<'trophies' | 'logout' | 'cache' | null>(null);
  const lastDanger = useRef<'trophies' | 'logout' | 'cache' | null>(null);
  // A closed question unmounts the focused button: hand focus back to the button that asked it
  useEffect(() => {
    if (pendingDanger !== null) { lastDanger.current = pendingDanger; return; }
    const asked = lastDanger.current;
    lastDanger.current = null;
    if (asked) document.querySelector<HTMLButtonElement>(`[data-danger="${asked}"]`)?.focus();
  }, [pendingDanger]);
  // Tabs block: turning Steam IDLE off while it works asks first; focus returns to the switch when the question closes
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [checkingTab, setCheckingTab] = useState<TabId | null>(null);
  const lastTab = useRef<TabId | null>(null);
  useEffect(() => {
    if (pendingTab !== null) { lastTab.current = pendingTab; return; }
    const asked = lastTab.current;
    lastTab.current = null;
    if (asked) document.querySelector<HTMLButtonElement>(`[data-tab-switch="${asked}"]`)?.focus();
  }, [pendingTab]);
  const [showDiagModal, setShowDiagModal] = useState<boolean>(false);
  const diagDialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(showDiagModal, diagDialogRef, () => setShowDiagModal(false));
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

  const handleConfirmDanger = async (type: 'trophies' | 'logout' | 'cache') => {
    playClick();
    setPendingDanger(null);
    const action = {
      trophies: { path: '/api/trophies/clear', done: 'Журнал Trophies.md очищен!', failed: 'Не удалось очистить журнал: ошибка сервиса' },
      logout: { path: '/api/logout', done: 'Сессия сброшена! Перезапустите Sentinel.', failed: 'Не удалось сбросить сессию: ошибка сервиса' },
      cache: { path: '/api/game-directories/clear-cache', done: 'Кэш распознавания игр очищен!', failed: 'Не удалось очистить кэш: ошибка сервиса' },
    }[type];
    try {
      const res = await fetch(`http://127.0.0.1:28492${action.path}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert(action.done);
    } catch (err) {
      console.error(`SettingsStudio: ${action.path} failed`, err);
      alert(action.failed);
    }
  };

  const handleBackupProfile = async () => {
    playClick();
    setBackupLabel('Создание архива...');
    try {
      const res = await fetch('http://127.0.0.1:28492/api/backup', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      playRewardChime();
      setBackupLabel('БЭКАП СОХРАНЕН (.ZIP)');
    } catch {
      setBackupLabel('Ошибка создания бэкапа');
    }
    setTimeout(() => {
      setBackupLabel('Бэкап профиля (.zip)');
    }, 3500);
  };

  // Restore: a backup is staged by the service and applied at the next start, so the app restarts right after
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backups, setBackups] = useState<Array<{ name: string; size: number; modified: number }> | null>(null);
  const [restoreAsk, setRestoreAsk] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const loadBackups = async () => {
    setBackups(null);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/backups');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBackups(Array.isArray(data.backups) ? data.backups : []);
    } catch (err) {
      console.error('SettingsStudio: listing backups failed', err);
      setBackups([]);
      setRestoreMsg({ text: 'Не удалось получить список бэкапов', error: true });
    }
  };

  const toggleRestore = () => {
    playClick();
    const next = !restoreOpen;
    setRestoreOpen(next);
    setRestoreAsk(null);
    setRestoreMsg(null);
    if (next) void loadBackups();
  };

  const restartAfterRestore = async () => {
    const wv = (window as any).chrome?.webview;
    if (wv && typeof wv.postMessage === 'function') {
      wv.postMessage({ type: 'RESTART_SENTINEL' });
      return;
    }
    try {
      await fetch('http://127.0.0.1:28492/api/restart', { method: 'POST' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('SettingsStudio: restart after restore failed', err);
    }
  };

  const runRestore = async (body: { name: string } | { pick: true }) => {
    playClick();
    setRestoreAsk(null);
    setRestoreBusy(true);
    setRestoreMsg({ text: 'Проверяем бэкап…', error: false });
    try {
      const res = await fetch('http://127.0.0.1:28492/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'cancelled') { setRestoreMsg(null); return; }
      if (!res.ok || data.status !== 'ok') throw new Error(data.message || `HTTP ${res.status}`);
      setRestoreMsg({ text: `Бэкап проверен. Текущий профиль сохранён в ${data.safety}. Перезапуск…`, error: false });
      setTimeout(() => { void restartAfterRestore(); }, 1500);
    } catch (err) {
      console.error('SettingsStudio: restore failed', err);
      setRestoreMsg({ text: `Не удалось восстановить: ${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setRestoreBusy(false);
    }
  };

  // Rollback: the files the last update replaced are kept; putting them back needs a restart
  const [rollback, setRollback] = useState<{ from_version: string; to_version: string } | null>(null);
  const [rollbackAsk, setRollbackAsk] = useState(false);
  const [rollbackMsg, setRollbackMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    fetch('http://127.0.0.1:28492/api/updates/rollback')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setRollback(d.rollback || null))
      .catch((err) => console.error('SettingsStudio: rollback info failed', err));
  }, []);
  const runRollback = async () => {
    playClick();
    setRollbackAsk(false);
    setRollbackMsg({ text: 'Возвращаем прошлую версию…', error: false });
    try {
      const res = await fetch('http://127.0.0.1:28492/api/updates/rollback', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'ok') throw new Error(data.message || `HTTP ${res.status}`);
      setRollbackMsg({ text: `Готово: ${data.message} Перезапуск…`, error: false });
      setRollback(null);
      setTimeout(() => { void restartAfterRestore(); }, 1500);
    } catch (err) {
      setRollbackMsg({ text: `Откат не удался: ${err instanceof Error ? err.message : String(err)}`, error: true });
    }
  };

  const handleRescanClick = async () => {
    playClick();
    setScanLabel('Сканирование библиотек...');
    try {
      const count = await onRescanGames?.();
      setScanLabel(typeof count === 'number' ? `Найдено игр: ${count}` : 'Сканирование не подтверждено');
    } catch (error) {
      setScanLabel('Ошибка сканирования');
    }
    setTimeout(() => {
      setScanLabel('Пересканировать все диски');
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

  const handleClearCache = () => { playClick(); setPendingDanger('cache'); };

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
        ? `Доступно обновление v${updateInfo.remote_version}${updateInfo.prerelease ? ' (бета)' : ''}`
        : updateCheckFailure
          ? `Не удалось проверить обновления: ${updateCheckFailure}`
          : updateInfo
            ? `Установлена актуальная версия v${updateInfo.local_version}`
            : 'Обновления: не проверялись';
  const updatePct = updateProgress?.percent ?? (updateInfo && !updateCheckFailure ? 100 : 0);

  const moduleOn = moduleStates(settings, { muted: isMuted, autostart: autostartEnabled });
  const rewardsOn = settings.reward_campaigns_enabled === true;
  const rewardSwitch = rewardSwitches(settings);
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
  const renderModuleCard = (m: (typeof moduleCards)[number]) => (
    <div key={m.key} className="module-switch-card" onClick={m.onToggle} title={m.tooltip}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700 }}>{m.title}</div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{m.hint}</div>
      </div>
      <div className={`cnc-switch ${moduleOn[m.key] ? 'on' : ''}`} id={m.key === 'powerCascade' ? 'lunaSwitch' : undefined}>
        <div className="knob"></div>
      </div>
    </div>
  );
  // The after-queue switch sits in the block with its choice of action, not in the grid
  const powerCard = moduleCards.find((m) => m.key === 'powerCascade');

  const tabCards: { id: TabId; title: string; hint: string }[] = [
    { id: 'shelf', title: 'Полка игр', hint: 'Скрыть вкладку. Сканер игр продолжит работать для очереди.' },
    { id: 'giveaways', title: 'Раздачи', hint: 'Выключить раздачи: вкладка и сбор пропадут.' },
    { id: 'steamidle', title: 'Steam IDLE', hint: 'Выключить: фарм и выдача останавливаются, команды не выполняются.' },
    { id: 'dimmer', title: 'Диммер', hint: 'Выключить: горячие клавиши Alt+Backspace освобождаются, затемнение снимается.' },
  ];
  const tabOn = Object.fromEntries(tabSwitches(settings).map((s) => [s.id, s.on])) as Record<string, boolean>;
  // The patch is built after the awaits from the newest settings: a tab switched during the check must not be undone
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const toggleTab = async (id: TabId) => {
    if (checkingTab !== null) return; // a check is running: the switch is aria-disabled, clicks are ignored
    playClick();
    const wasOn = tabOn[id];
    let busy: boolean | null = null;
    if (id === 'steamidle' && wasOn) {
      setCheckingTab(id);
      try {
        const res = await fetch('http://127.0.0.1:28492/api/v1/steam-idle/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        busy = (await res.json()).busy === true;
      } catch (err) {
        console.error('SettingsStudio: не удалось узнать, занят ли Steam IDLE; спрашиваем подтверждение', err);
      } finally {
        setCheckingTab(null);
      }
    }
    if (needsOffConfirmation(id, wasOn, busy)) { setPendingTab(id); return; }
    onUpdateSettings(tabSetPatch(settingsRef.current, id, !wasOn));
  };
  const confirmTabOff = (id: TabId) => { playClick(); setPendingTab(null); onUpdateSettings(tabSetPatch(settingsRef.current, id, false)); };


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
              {moduleCards.filter((m) => m.key !== 'powerCascade').map(renderModuleCard)}
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
                className={`tactile-btn ${getLang() === value ? 'active-mint' : ''}`}
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
            style={{ marginTop: '8px', padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {powerCard && renderModuleCard(powerCard)}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>ПОСЛЕ ОЧЕРЕДИ:</span>
              <button 
                className={`tactile-btn ${settings.auto_shutdown_mode === 'sleep' || !settings.auto_shutdown_mode ? 'active-amber' : ''}`}
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_mode: 'sleep' });
                }}
              >
                <Moon className="ui-icon" aria-hidden="true" focusable="false" /> Сон (Sleep)
              </button>
              <button 
                className={`tactile-btn ${settings.auto_shutdown_mode === 'shutdown' ? 'active-amber' : ''}`}
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_mode: 'shutdown' });
                }}
              >
                <Power className="ui-icon" aria-hidden="true" focusable="false" /> Выключение
              </button>
              <button 
                className={`tactile-btn ${settings.auto_shutdown_mode === 'lock' ? 'active-amber' : ''}`}
                onClick={() => {
                  playClick();
                  onUpdateSettings({ auto_shutdown_mode: 'lock' });
                }}
              >
                <Lock className="ui-icon" aria-hidden="true" focusable="false" /> Блокировка
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
              <Timer className="ui-icon" aria-hidden="true" focusable="false" /> {testCountdown !== null ? `Отмена (${testCountdown} с)` : 'Проверить таймер (5 с, ПК не затронет)'}
            </button>
            </div>
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
                <Target className="ui-icon" aria-hidden="true" focusable="false" /> Только очередь (рекомендуется)
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
                <Zap className="ui-icon" aria-hidden="true" focusable="false" /> Очередь, а если пусто — любые доступные
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
                <Hourglass className="ui-icon" aria-hidden="true" focusable="false" /> Очередь, затем кампании, которые скоро закончатся
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Сначала ваша очередь, потом кампании с наименьшим оставшимся временем.
              </div>
            </div>
          </div>

          <FarmScheduleCard schedule={settings.farm_schedule} onChange={(next) => onUpdateSettings({ farm_schedule: next })} playClick={playClick} />

          {/* Game Folders Island */}
          <div className="titanium-island" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            <div className="engraved-header" style={{ marginBottom: 0 }}>
              <span className="tag">
                <span className="led-dot"></span> <span title="Библиотеки и папки с играми">ПАПКИ С ИГРАМИ · {installedCount}</span>
              </span>
              <button className="tactile-btn active-mint" style={{ minHeight: '24px', fontSize: 'var(--fs-xs)' }} onClick={handleAddFolder}>
                <Plus className="ui-icon" aria-hidden="true" focusable="false" /> Добавить папку
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {directories.map((dir, idx) => (
                <div key={idx} className="obsidian-well tabular" style={{ padding: '6px 10px', fontSize: 'var(--fs-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}><Folder className="ui-icon" aria-hidden="true" focusable="false" /> {dir}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--led-mint)', fontSize: 'var(--fs-xs)' }}>[НАСТРОЕН]</span>
                    <button
                      className="tactile-btn danger-hover"
                      style={{ padding: '1px 6px', minHeight: '24px', fontSize: 'var(--fs-xs)' }}
                      onClick={() => handleRemoveFolder(dir)}
                      title="Удалить папку"
                    >
                      <X className="ui-icon" aria-hidden="true" focusable="false" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="obsidian-well tabular" style={{ padding: '7px 10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><Folder className="ui-icon" aria-hidden="true" focusable="false" /> Настроено папок: {directories.length}</span>
              <span>Обнаружено игр: {installedCount}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              <button className="chunky-cta" style={{ flex: 1 }} onClick={handleRescanClick}>
                <RefreshCw className="ui-icon" aria-hidden="true" focusable="false" /> {scanLabel}
              </button>
              {pendingDanger === 'cache' ? (
                <>
                  <span className="danger-zone-question" style={{ alignSelf: 'center' }}>Очистить список найденных игр? Его вернёт пересканирование.</span>
                  <button className="safety-guard-btn armed" onClick={() => handleConfirmDanger('cache')}>Да, очистить</button>
                  <button className="tactile-btn" autoFocus onClick={() => { playClick(); setPendingDanger(null); }}>Отмена</button>
                </>
              ) : (
                <button className="tactile-btn danger-hover" data-danger="cache" onClick={handleClearInstalledGames} title="Очистить список">
                  <Trash2 className="ui-icon" aria-hidden="true" focusable="false" /> Очистить кэш / Очистить список
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: which optional tabs are shown (and their modules work) */}
      <div className="titanium-island" role="group" aria-labelledby="tabsBlockTitle" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="engraved-header">
          <span className="tag"><span className="led-dot"></span> <span id="tabsBlockTitle">ВКЛАДКИ</span></span>
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Выключенная вкладка пропадает из шапки и палитры команд.</div>
        <div className="modules-10-grid">
          {tabCards.map((t) => (
            pendingTab === t.id ? (
              <div key={t.id} className="module-switch-card module-switch-ask" role="group" aria-label={t.title}>
                <span className="danger-zone-question">Выключить Steam IDLE? Фарм и выдача остановятся, прерванную выдачу можно будет продолжить.</span>
                <span className="module-switch-ask-actions">
                  <button type="button" className="safety-guard-btn armed" onClick={() => confirmTabOff(t.id)}>Выключить</button>
                  <button type="button" className="tactile-btn" autoFocus onClick={() => { playClick(); setPendingTab(null); }}>Отмена</button>
                </span>
              </div>
            ) : (
              <button
                key={t.id}
                type="button"
                role="switch"
                aria-checked={tabOn[t.id]}
                aria-busy={checkingTab === t.id}
                data-tab-switch={t.id}
                className="module-switch-card module-switch-btn"
                aria-disabled={checkingTab === t.id}
                onClick={() => { void toggleTab(t.id); }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="module-switch-title">{t.title}</span>
                  <span className="module-switch-hint">{t.hint}</span>
                </span>
                <span className={`cnc-switch ${tabOn[t.id] ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
              </button>
            )
          ))}
        </div>
      </div>

      {/* Reward campaigns: only shown on the dashboard, so the switch is not one of the ten counted modules */}
      <div className="titanium-island" role="group" aria-labelledby="extrasBlockTitle" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="engraved-header">
          <span className="tag"><span className="led-dot"></span> <span id="extrasBlockTitle">ДОПОЛНИТЕЛЬНО</span></span>
        </div>
        <div className="modules-10-grid">
          <button
            type="button"
            role="switch"
            aria-checked={rewardsOn}
            data-reward-switch="1"
            className="module-switch-card module-switch-btn"
            onClick={() => { playClick(); onUpdateSettings({ reward_campaigns_enabled: !rewardsOn }); }}
          >
            <span style={{ minWidth: 0 }}>
              <span className="module-switch-title">Кампании наград</span>
              <span className="module-switch-hint">Показывать кампании наград Twitch: квесты и предложения брендов. Время просмотра набирает Sentinel, платные условия только вручную.</span>
            </span>
            <span className={`cnc-switch ${rewardsOn ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={rewardSwitch.slot}
            aria-disabled={rewardSwitch.disabled}
            data-reward-slot-switch="1"
            className="module-switch-card module-switch-btn"
            onClick={() => { if (rewardSwitch.disabled) return; playClick(); onUpdateSettings({ reward_daily_slot: !rewardSwitch.slot }); }}
          >
            <span style={{ minWidth: 0 }}>
              <span className="module-switch-title">Дневной слот для наград</span>
              <span className="module-switch-hint">Кампания из очереди сначала добирает дневную цель, потом Sentinel возвращается к дропам. Около часа в день.</span>
            </span>
            <span className={`cnc-switch ${rewardSwitch.slot && !rewardSwitch.disabled ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={rewardSwitch.autoQueue}
            aria-disabled={rewardSwitch.disabled}
            data-reward-autoqueue-switch="1"
            className="module-switch-card module-switch-btn"
            onClick={() => { if (rewardSwitch.disabled) return; playClick(); onUpdateSettings({ reward_auto_queue: !rewardSwitch.autoQueue }); }}
          >
            <span style={{ minWidth: 0 }}>
              <span className="module-switch-title">Сам добавлять новые кампании в очередь</span>
              <span className="module-switch-hint">Только кампании с просмотром и найденной категорией. Платные условия никогда.</span>
            </span>
            <span className={`cnc-switch ${rewardSwitch.autoQueue && !rewardSwitch.disabled ? 'on' : ''}`} aria-hidden="true"><span className="knob"></span></span>
          </button>
        </div>
      </div>

      <WebhooksCard playClick={playClick} />

      <StartupCopiesCard playClick={playClick} restartApp={restartAfterRestore} />

      {/* Danger zone: destructive actions live apart from everyday buttons and always ask first */}
      <div className="danger-zone" role="group" aria-label="Опасная зона">
        <span className="danger-zone-title"><TriangleAlert className="ui-icon" aria-hidden="true" focusable="false" /> Опасная зона</span>
        <div className="danger-zone-item" style={{ flexWrap: 'wrap' }}>
          <button className="safety-guard-btn" onClick={toggleRestore} aria-expanded={restoreOpen} title="Вернуть настройки, вход и трофеи из бэкапа профиля">
            <History className="ui-icon" aria-hidden="true" focusable="false" /> Восстановить из бэкапа
          </button>
          <span className="danger-zone-hint">Заменяет текущий профиль, перед этим сохраняет его</span>
        </div>
        {restoreOpen && (
          <div className="restore-panel" role="region" aria-label="Восстановление из бэкапа">
            {backups === null ? (
              <span className="danger-zone-hint">Загружаем список бэкапов…</span>
            ) : backups.length === 0 ? (
              <span className="danger-zone-hint">В папке data/backups бэкапов нет. Выберите файл вручную.</span>
            ) : (
              <ul className="restore-list">
                {backups.slice(0, 8).map((b) => (
                  <li key={b.name} className="restore-row">
                    <span className="restore-name" title={b.name}>
                      {new Date(b.modified * 1000).toLocaleString()} <span className="tabular" style={{ color: 'var(--text-muted)' }}>· {Math.max(1, Math.round(b.size / 1024))} КБ</span>
                    </span>
                    {restoreAsk === b.name ? (
                      <>
                        <span className="danger-zone-question">Заменить профиль этим бэкапом? Приложение перезапустится.</span>
                        <button className="safety-guard-btn armed" disabled={restoreBusy} onClick={() => runRestore({ name: b.name })}>Да, восстановить</button>
                        <button className="tactile-btn" autoFocus onClick={() => { playClick(); setRestoreAsk(null); }}>Отмена</button>
                      </>
                    ) : (
                      <button className="tactile-btn" disabled={restoreBusy} onClick={() => { playClick(); setRestoreAsk(b.name); }}>Восстановить</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="tactile-btn" disabled={restoreBusy} onClick={() => runRestore({ pick: true })} title="Выбрать .zip бэкапа в другом месте, например с другого компьютера">
                <Folder className="ui-icon" aria-hidden="true" focusable="false" /> Выбрать файл…
              </button>
              {restoreMsg && (
                <span role="status" className="danger-zone-hint" style={{ color: restoreMsg.error ? 'var(--led-rose)' : 'var(--text-secondary)' }}>{restoreMsg.text}</span>
              )}
            </div>
          </div>
        )}
        <div className="danger-zone-item">
          {pendingDanger === 'trophies' ? (
            <>
              <span className="danger-zone-question">Очистить трофеи? Журнал будет удалён.</span>
              <button className="safety-guard-btn armed" onClick={() => handleConfirmDanger('trophies')}>Да, очистить</button>
              <button className="tactile-btn" autoFocus onClick={() => { playClick(); setPendingDanger(null); }}>Отмена</button>
            </>
          ) : (
            <>
              <button className="safety-guard-btn" data-danger="trophies" onClick={handleClearTrophies} title="Удалить журнал полученных наград Trophies.md">Очистить трофеи</button>
              <span className="danger-zone-hint">Удаляет журнал полученных наград</span>
            </>
          )}
        </div>
        <div className="danger-zone-item">
          {pendingDanger === 'logout' ? (
            <>
              <span className="danger-zone-question">Выйти из аккаунта Twitch? Фарм остановится, войти придётся заново.</span>
              <button className="safety-guard-btn armed" onClick={() => handleConfirmDanger('logout')}>Да, выйти</button>
              <button className="tactile-btn" autoFocus onClick={() => { playClick(); setPendingDanger(null); }}>Отмена</button>
            </>
          ) : (
            <>
              <button className="safety-guard-btn" data-danger="logout" onClick={handleLogout} title="Сбросить вход в Twitch и войти другим аккаунтом">Сменить аккаунт</button>
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
              <Package className="ui-icon" aria-hidden="true" focusable="false" /> {backupLabel}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="obsidian-well" style={{ padding: '6px 12px', width: '15rem', maxWidth: '100%', minWidth: 0 }}>
              <div className="tabular" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '3px' }}>
                <span id="updStageText" title={updateStage} style={{ color: updateCheckFailure && !updateInfo?.update_available ? 'var(--led-rose)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{updateStage}</span>
                <strong style={{ color: 'var(--led-mint)' }} id="updPctText">{updatePct}%</strong>
              </div>
              <div style={{ height: '5px', background: 'var(--bg-row)', borderRadius: '3px', overflow: 'hidden' }}>
                <div 
                  id="updBarFill" 
                  style={{ height: '100%', width: `${updatePct}%`, background: 'var(--led-mint)', transition: 'width 0.2s' }}
                />
              </div>
            </div>
            <button
              className="tactile-btn"
              role="switch"
              aria-checked={settings.update_channel === 'beta'}
              onClick={() => {
                playClick();
                onUpdateSettings({ update_channel: settings.update_channel === 'beta' ? 'stable' : 'beta' });
                // the service drops the other channel's answer; ask again once the setting has landed
                if (onCheckUpdates) setTimeout(() => { void onCheckUpdates().catch((err) => console.error('SettingsStudio: update check after the channel switch failed', err)); }, 800);
              }}
              title="Предлагать и pre-release версии с GitHub: новые функции раньше, но они могут быть сырыми"
            >
              {settings.update_channel === 'beta' ? 'Бета-версии: вкл' : 'Бета-версии: выкл'}
            </button>
            {rollback && (rollbackAsk ? (
              <>
                <span className="danger-zone-question">{`Вернуть v${rollback.from_version}? v${rollback.to_version} больше не будет предлагаться, приложение перезапустится.`}</span>
                <button className="safety-guard-btn armed" onClick={runRollback}>Да, вернуть</button>
                <button className="tactile-btn" autoFocus onClick={() => { playClick(); setRollbackAsk(false); }}>Отмена</button>
              </>
            ) : (
              <button className="tactile-btn" onClick={() => { playClick(); setRollbackAsk(true); }} title={`Если v${rollback.to_version} работает хуже, вернуть v${rollback.from_version}. Настройки и вход не меняются.`}>
                <History className="ui-icon" aria-hidden="true" focusable="false" /> {`Вернуть v${rollback.from_version}`}
              </button>
            ))}
            {rollbackMsg && <span role="status" className="danger-zone-hint" style={{ color: rollbackMsg.error ? 'var(--led-rose)' : 'var(--text-secondary)' }}>{rollbackMsg.text}</span>}
            <button className="chunky-cta" onClick={handleCheckUpdates} disabled={isCheckingUpdates || !onCheckUpdates}>
              {isCheckingUpdates ? 'Проверка...' : 'Проверить обновления'}
            </button>
            <button className="tactile-btn" onClick={handleOpenDiag} title="Диагностический отчет">
              <Stethoscope className="ui-icon" aria-hidden="true" focusable="false" /> Отчет
            </button>
            {appVersion && <span className="tabular" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }} title="Версия приложения">v{appVersion}</span>}
          </div>
        </div>

      {/* Diagnostic Report Modal (diagModal) */}
      {showDiagModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowDiagModal(false)}
        >
          <div 
            ref={diagDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="diag-title"
            tabIndex={-1}
            className="report-dialog w-full max-w-4xl border border-[var(--border-main)] rounded-2xl p-6 space-y-4 outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <span className="led-dot"></span>
                <h3 id="diag-title" className="text-sm font-bold tracking-[0.04em] uppercase text-[var(--text-primary)]">
                  <Stethoscope className="ui-icon" aria-hidden="true" focusable="false" /> ДИАГНОСТИЧЕСКИЙ ОТЧЕТ СИСТЕМЫ
                </h3>
              </div>
              <button 
                aria-label="Закрыть"
                className="tactile-btn" 
                style={{ height: '24px', width: '24px', padding: 0 }}
                onClick={() => setShowDiagModal(false)}
              >
                <X className="ui-icon" aria-hidden="true" focusable="false" />
              </button>
            </div>

            <div 
              className="obsidian-well report-text p-4 text-xs text-[var(--text-secondary)]"
              role="region"
              aria-label="Текст диагностического отчета"
              tabIndex={0}
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
                <ClipboardCopy className="ui-icon" aria-hidden="true" focusable="false" /> Скопировать отчет
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
