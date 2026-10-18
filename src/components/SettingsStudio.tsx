import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Power,
  RefreshCw,
  Sliders,
  Volume2,
  VolumeX,
  BatteryCharging,
  Coins,
  CheckCircle2,
  FolderSync,
  ArrowLeft,
  FileText,
  FolderPlus,
  Trash2,
  Folder,
  Disc,
  Gamepad2,
  Copy,
  Check,
  Laptop,
  Download,
  Sparkles,
} from 'lucide-react';
import { SentinelSettings, SentinelStats, UpdateCheckResult } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface SettingsStudioProps {
  settings: SentinelSettings;
  stats: SentinelStats;
  username?: string;
  installedCount?: number;
  onUpdateSettings: (newSettings: Partial<SentinelSettings>) => void;
  onRescanGames?: () => void;
  isScanning?: boolean;
  onBack?: () => void;
  onOpenVaultFile?: () => void;
}

export const SettingsStudio: React.FC<SettingsStudioProps> = ({
  settings,
  stats,
  username,
  installedCount = 0,
  onUpdateSettings,
  onRescanGames,
  isScanning = false,
  onBack,
  onOpenVaultFile,
}) => {
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [isBrowsingFolder, setIsBrowsingFolder] = useState<boolean>(false);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
  const [isCopiedReport, setIsCopiedReport] = useState<boolean>(false);
  const [isCopyingReport, setIsCopyingReport] = useState<boolean>(false);
  const [isClearingGames, setIsClearingGames] = useState<boolean>(false);
  const [clearedGamesMessage, setClearedGamesMessage] = useState<string | null>(null);

  // GitHub Auto-Updater States
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState<boolean>(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const { isMuted, toggleMute, playClick, playRewardChime } = useTactileAudio();

  const handleCheckUpdates = async () => {
    playClick();
    setIsCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/updates/check?force=1');
      if (res.ok) {
        const data: UpdateCheckResult = await res.json();
        setUpdateInfo(data);
        if (data.update_available) {
          setUpdateMessage(`Доступна новая версия: v${data.remote_version}`);
        } else {
          setUpdateMessage(`У вас актуальная версия (v${data.local_version})`);
        }
      } else {
        setUpdateMessage('Не удалось проверить обновления');
      }
    } catch (err) {
      setUpdateMessage('Ошибка связи со службой обновлений');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const [isUpdateInstalled, setIsUpdateInstalled] = useState(false);

  const handleRestartApp = async () => {
    playClick();
    const wv = (window as any).chrome?.webview;
    if (wv && typeof wv.postMessage === 'function') {
      wv.postMessage({ type: 'RESTART_SENTINEL' });
      return;
    }
    try {
      await fetch('http://127.0.0.1:28492/api/restart', { method: 'POST' });
      setTimeout(() => window.location.reload(), 1500);
    } catch { }
  };

  const handleApplyUpdate = async () => {
    if (!updateInfo?.download_url) return;
    playClick();
    setIsApplyingUpdate(true);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/updates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          download_url: updateInfo.download_url,
          asset_api_url: updateInfo.asset_api_url,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        playRewardChime();
        setIsUpdateInstalled(true);
        setUpdateMessage('✨ Обновление успешно установлено! Перезапустите Sentinel.');
        setUpdateInfo(null);
      } else {
        setUpdateMessage(`Ошибка установки: ${data.message}`);
      }
    } catch (err: any) {
      setUpdateMessage(`Сбой при установке: ${err.message || err}`);
    } finally {
      setIsApplyingUpdate(false);
    }
  };

  React.useEffect(() => {
    let isMounted = true;
    fetch('http://127.0.0.1:28492/api/autostart')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && typeof data.enabled === 'boolean') {
          setAutostartEnabled(data.enabled);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleAutostart = async () => {
    playClick();
    const nextState = !autostartEnabled;
    setAutostartEnabled(nextState);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutostartEnabled(data.enabled);
      }
    } catch (err) {
      console.error('Failed to update autostart:', err);
    }
  };

  const handleCopyDiagnosticReport = async () => {
    playClick();
    setIsCopyingReport(true);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/diagnostic-report');
      if (res.ok) {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setIsCopiedReport(true);
        setTimeout(() => setIsCopiedReport(false), 3000);
      }
    } catch (err) {
      console.error('Failed to copy diagnostic report:', err);
    } finally {
      setIsCopyingReport(false);
    }
  };

  const handleClearInstalledGames = async () => {
    playClick();
    setIsClearingGames(true);
    setClearedGamesMessage(null);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/installed-games/clear', {
        method: 'POST',
      });
      if (res.ok) {
        playRewardChime();
        setClearedGamesMessage('✓ Список установленных игр очищен');
        if (onRescanGames) onRescanGames();
        setTimeout(() => setClearedGamesMessage(null), 4000);
      } else {
        setClearedGamesMessage('Ошибка очистки списка');
      }
    } catch (err) {
      console.error('Failed to clear installed games:', err);
      setClearedGamesMessage('Сбой связи со службой');
    } finally {
      setIsClearingGames(false);
    }
  };

  const startTestShutdown = () => {
    playClick();
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

  // Listen for WebView2 native messages (e.g. FOLDER_SELECTED from C# FolderBrowserDialog)
  React.useEffect(() => {
    const wv = (window as any).chrome?.webview;
    if (!wv || typeof wv.addEventListener !== 'function') return;

    const handleWebMessage = async (event: any) => {
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (data && data.type === 'FOLDER_SELECTED') {
        setIsBrowsingFolder(false);
        if (!data.cancelled && data.path) {
          try {
            const addRes = await fetch('http://127.0.0.1:28492/api/game-directories/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: data.path }),
            });
            if (addRes.ok) {
              const addData = await addRes.json();
              onUpdateSettings({ game_directories: addData.directories });
              if (onRescanGames) onRescanGames();
              playRewardChime();
            }
          } catch (err) {
            console.error('Failed to add folder from native picker:', err);
          }
        }
      }
    };

    wv.addEventListener('message', handleWebMessage);
    return () => {
      try {
        wv.removeEventListener('message', handleWebMessage);
      } catch {}
    };
  }, [onUpdateSettings, onRescanGames, playRewardChime]);

  const handleBrowseAndAddFolder = async () => {
    playClick();
    setIsBrowsingFolder(true);
    try {
      // 1. Try native WebView2 message bridge
      const wv = (window as any).chrome?.webview;
      if (wv && typeof wv.postMessage === 'function') {
        wv.postMessage({ type: 'SELECT_FOLDER' });
        setTimeout(() => setIsBrowsingFolder(false), 3000);
        return;
      }

      // 2. Fallback to REST API dialog
      const res = await fetch('http://127.0.0.1:28492/api/browse-folder', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.path) {
          const addRes = await fetch('http://127.0.0.1:28492/api/game-directories/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: data.path }),
          });
          if (addRes.ok) {
            const addData = await addRes.json();
            onUpdateSettings({ game_directories: addData.directories });
            if (onRescanGames) onRescanGames();
            playRewardChime();
          }
        }
      }
    } catch (err) {
      console.error('Error opening folder browser:', err);
    } finally {
      setIsBrowsingFolder(false);
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
        const data = await res.json();
        onUpdateSettings({ game_directories: data.directories });
        if (onRescanGames) onRescanGames();
      }
    } catch (err) {
      console.error('Error removing directory:', err);
    }
  };

  const gameDirectories = settings.game_directories || [];

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
                Twitch Drops Sentinel v3.1 &bull; Универсальный клиент
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
              <span>Twitch Session: {username || 'Активна'}</span>
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
                <button
                  type="button"
                  aria-label="Переключить автовыключение"
                  onClick={() => onUpdateSettings({ auto_shutdown_on_complete: !settings.auto_shutdown_on_complete })}
                  className={`studio-switch ${settings.auto_shutdown_on_complete ? 'checked' : ''}`}
                >
                  <span />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] space-y-2">
                <div className="text-xs font-semibold text-[var(--foreground)]">Режим питания</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['shutdown', 'sleep', 'lock'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onUpdateSettings({ auto_shutdown_mode: mode })}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        settings.auto_shutdown_mode === mode
                          ? 'bg-[#368873]/20 border-[#73bba5] text-[var(--accent)] font-semibold'
                          : 'bg-black/20 border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {mode === 'shutdown' ? 'Выключение' : mode === 'sleep' ? 'Сон' : 'Блокировка'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={startTestShutdown}
              disabled={testCountdown !== null}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-[var(--foreground)] border border-[var(--line)] transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
            >
              {testCountdown !== null ? `Тест питания... (${testCountdown}s)` : 'Проверить таймер питания (5 сек)'}
            </button>
          </div>
        </div>

        {/* Hardware Guard (Gaming Detection & Battery) */}
        <div className="card p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Hardware Guard</h3>
                <p className="text-xs text-[var(--muted)]">Защита от просадок FPS и разрядки батареи</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <Gamepad2 className="w-4 h-4 text-[var(--accent)]" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--foreground)]">Автопауза при запуске игр</div>
                    <div className="text-[11px] text-[var(--muted)]">Освобождает CPU и сеть во время гейминга</div>
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
            <span>Процесс мониторинга: 0% CPU</span>
            <span className="font-semibold text-[var(--accent)]">Hardware Guard OK</span>
          </div>
        </div>
      </div>

      {/* ==================== Universal Game Libraries & Custom Folders ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Local Libraries & Custom Folders */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
                <FolderSync className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Библиотеки и папки с играми</h3>
                <p className="text-xs text-[var(--muted)]">Автоопределение Steam, Epic Games, GOG + свои папки</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/30 tabular-nums">
              {installedCount} игр обнаружено
            </span>
          </div>

          {/* Launcher Detection Badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] border border-[var(--line)] text-[11px] text-[var(--muted)]">
              <Disc className="w-3.5 h-3.5 text-[#73bba5]" />
              <span className="font-medium text-[var(--foreground)]">Steam:</span>
              <span>Все диски (libraryfolders.vdf)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] border border-[var(--line)] text-[11px] text-[var(--muted)]">
              <Disc className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium text-[var(--foreground)]">Epic Games:</span>
              <span>Манифесты</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] border border-[var(--line)] text-[11px] text-[var(--muted)]">
              <Disc className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-medium text-[var(--foreground)]">GOG Galaxy:</span>
              <span>Реестр</span>
            </div>
          </div>

          {/* Custom Folders Section */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--foreground)]">
              <span>Дополнительные папки с играми:</span>
              <button
                type="button"
                onClick={handleBrowseAndAddFolder}
                disabled={isBrowsingFolder}
                className="flex items-center gap-1.5 text-[var(--accent)] hover:underline cursor-pointer text-xs font-semibold disabled:opacity-50"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>{isBrowsingFolder ? 'Выбор папки...' : '+ Выбрать папку на диске'}</span>
              </button>
            </div>

            {gameDirectories.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-dashed border-[var(--line)] text-[11px] text-[var(--muted)] text-center">
                Пользовательские папки не добавлены. Игры из Steam, Epic Games и GOG определяются автоматически со всех подключенных дисков.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {gameDirectories.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                      <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span className="text-[var(--foreground)] truncate" title={dir}>
                        {dir}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFolder(dir)}
                      className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-400 border border-transparent hover:border-rose-500/30 transition-all cursor-pointer shrink-0 ml-2"
                      title="Удалить эту папку из списка сканирования"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onRescanGames}
              disabled={isScanning}
              className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-semibold border border-[#73bba5]/40 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Сканирование библиотек...' : 'Пересканировать установленные игры'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearInstalledGames}
              disabled={isClearingGames || isScanning}
              className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 text-[var(--muted)] hover:text-rose-400 text-xs font-semibold border border-[var(--line)] hover:border-rose-500/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
              title="Очистить обнаруженные установленные игры на ПК"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isClearingGames ? 'Очистка...' : 'Очистить список'}</span>
            </button>
          </div>

          {clearedGamesMessage && (
            <p className="text-[11px] text-[var(--accent)] font-medium text-center animate-in fade-in duration-200">
              {clearedGamesMessage}
            </p>
          )}
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

        {/* Notifications & Audio Control */}
        <div className="card p-6 space-y-4 md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Звуки интерфейса & Баллы канала</h3>
              <p className="text-xs text-[var(--muted)]">Управление тактильным звуком Web Audio и автоматический сбор бонусов</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Channel Points Stats */}
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

            {/* Apple Chime on Trophy */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-4 h-4 text-[var(--accent)]" />
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Сигнал Apple Chime</div>
                  <div className="text-[11px] text-[var(--muted)]">При получении трофея</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Переключить звуковой сигнал получения трофея"
                onClick={() => onUpdateSettings({ native_toasts: !settings.native_toasts })}
                className={`studio-switch ${settings.native_toasts ? 'checked' : ''}`}
              >
                <span />
              </button>
            </div>

            {/* UI Click Sound Mute Switch */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                {isMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-[var(--accent)]" />}
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Звуки интерфейса (Mute)</div>
                  <div className="text-[11px] text-[var(--muted)]">{isMuted ? 'Звук отключен' : 'Клики и переключатели активны'}</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Переключить звуки интерфейса"
                onClick={() => {
                  toggleMute();
                  onUpdateSettings({ ui_sound_enabled: isMuted });
                }}
                className={`studio-switch ${!isMuted ? 'checked' : ''}`}
              >
                <span />
              </button>
            </div>
          </div>
        </div>

        {/* Windows System & Diagnostics */}
        <div className="card p-6 space-y-4 md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Интеграция с Windows & Диагностика</h3>
              <p className="text-xs text-[var(--muted)]">Автозапуск приложения при включении компьютера и отчет для техподдержки</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Windows Autostart */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <Power className="w-4 h-4 text-[var(--accent)]" />
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Автозапуск с Windows</div>
                  <div className="text-[11px] text-[var(--muted)]">Старт в свернутом виде в трей при запуске ПК</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Переключить автозапуск с Windows"
                onClick={handleToggleAutostart}
                className={`studio-switch ${autostartEnabled ? 'checked' : ''}`}
              >
                <span />
              </button>
            </div>

            {/* Diagnostic Report */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-[var(--accent)]" />
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">Диагностический отчет</div>
                  <div className="text-[11px] text-[var(--muted)]">Без токенов и паролей — готов для отправки в чат поддержки</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyDiagnosticReport}
                disabled={isCopyingReport}
                className="px-3.5 py-2 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-semibold border border-[#73bba5]/40 shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isCopiedReport ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedReport ? 'Скопировано!' : 'Скопировать'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* GitHub Auto-Updater Studio Card */}
        <div className="card p-6 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)]">
                <Sparkles className="w-5 h-5 text-[#73bba5]" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-bold text-[var(--foreground)]">Обновления GitHub & Патчи</h3>
                <p className="text-xs text-[var(--muted)]">Проверка и автоматическая установка обновлений программы в один клик</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#368873]/20 text-[var(--accent)] border border-[#73bba5]/30">
              v3.1.0 Public
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--line)] space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <span>Репозиторий GitHub Releases:</span>
                  <span className="text-[var(--accent)] font-mono">MortuisVMain/Twitch-Drops-Sentinel</span>
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">
                  {updateMessage || 'Проверьте наличие новых релизов с GitHub без потери пользовательских настроек и сессий.'}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isUpdateInstalled ? (
                  <button
                    type="button"
                    onClick={handleRestartApp}
                    className="px-4 py-2 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-bold border border-[#73bba5]/40 shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer animate-pulse"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Перезапустить сейчас</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCheckUpdates}
                    disabled={isCheckingUpdate || isApplyingUpdate}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[var(--foreground)] text-xs font-semibold border border-[var(--line)] shadow-sm transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin text-[var(--accent)]' : ''}`} />
                    <span>{isCheckingUpdate ? 'Проверка...' : 'Проверить обновления'}</span>
                  </button>
                )}

                {updateInfo?.update_available && (
                  <button
                    type="button"
                    onClick={handleApplyUpdate}
                    disabled={isApplyingUpdate || !updateInfo.download_url}
                    className="px-4 py-2 rounded-xl bg-[#368873] hover:bg-[#2d7462] text-white text-xs font-bold border border-[#73bba5]/40 shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 animate-pulse"
                  >
                    {isApplyingUpdate ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Установка...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Обновить до v{updateInfo.remote_version}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {updateInfo?.update_available && updateInfo.release_notes && (
              <div className="pt-2 border-t border-[var(--line)]/50">
                <div className="text-[11px] font-semibold text-[var(--foreground)] mb-1">Что нового:</div>
                <div className="max-h-28 overflow-y-auto p-2.5 rounded-lg bg-black/30 border border-[var(--line)] text-[11px] font-mono text-[var(--foreground)] whitespace-pre-wrap select-text">
                  {updateInfo.release_notes}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="text-center pt-4 pb-2 text-[11px] text-[var(--muted)] space-y-1">
        <div>Twitch Drops Sentinel v3.1</div>
        <div>Crafted with precision by Mortuis_V & Mortuis_V_Studio &bull; 2026</div>
      </div>
    </div>
  );
};
