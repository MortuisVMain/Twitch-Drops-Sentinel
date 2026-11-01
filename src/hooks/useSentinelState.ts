import { useState, useEffect } from 'react';
import { FullSentinelState, SentinelSettings, TrophyItem } from '../types';

const INITIAL_STATE: FullSentinelState = {
  connected: false,
  user_id: '',
  username: '',
  status_text: 'Подключение к локальному сервису Sentinel...',
  watching_channel: null,
  active_drop: null,
  forced_game: null,
  recent_logs: [],
  available_channels: [],
  hardware: {
    is_gaming: false,
    detected_game: null,
    on_battery: false,
    is_paused: false,
    ping_ms: 0,
    cpu_percent: 0,
    gpu_percent: 0,
  },
  stats: {
    traffic_saved_mb: 0,
    total_drops_claimed: 0,
    channel_points_earned: 0,
    total_farm_hours: 0,
  },
  settings: {
    auto_shutdown_on_complete: false,
    auto_shutdown_mode: 'sleep',
    pause_on_gaming: true,
    pause_on_battery: false,
    native_toasts: true,
    claim_channel_points: true,
    auto_claim_drops: true,
    giveaways_enabled: true,
    streamer_watchdog_enabled: true,
    priority_mode: 1,
    priority_games: [],
    excluded_games: [],
  },
  trophies: [],
  installed_games: [],
  all_catalog_games: [],
};

export function useSentinelState(
  showToast: (msg: string) => void,
  playRewardChime: () => void,
  playClick: () => void
) {
  const [sentinelState, setSentinelState] = useState<FullSentinelState>(INITIAL_STATE);
  const [isScanning, setIsScanning] = useState(false);
  // The service does not report when the catalog was last refreshed: remember the last sync it confirmed to us
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Poll backend API
  useEffect(() => {
    let isMounted = true;
    const fetchState = async () => {
      try {
        const res = await fetch('http://127.0.0.1:28492/api/state');
        if (!res.ok) {
          if (isMounted) {
            setSentinelState((prev) => ({
              ...prev,
              connected: false,
              status_text: `Локальный сервис недоступен (HTTP ${res.status})`,
            }));
          }
          return;
        }
        const data = await res.json();
        if (isMounted) {
          setSentinelState((prev) => {
              let mergedActiveDrop = data.active_drop;
              if (
                prev.active_drop &&
                data.active_drop &&
                prev.active_drop.id === data.active_drop.id &&
                prev.active_drop.current_minutes === data.active_drop.current_minutes
              ) {
                const diff = Math.abs((prev.active_drop.remaining_seconds || 0) - (data.active_drop.remaining_seconds || 0));
                if (diff <= 6) {
                  mergedActiveDrop = {
                    ...data.active_drop,
                    remaining_seconds: prev.active_drop.remaining_seconds,
                  };
                }
              }
              return {
                ...prev,
                ...data,
                active_drop: mergedActiveDrop,
                connected: true,
                settings: {
                  ...prev.settings,
                  ...(data.settings || {}),
                  ignored_channels: Array.isArray(data.settings?.ignored_channels)
                    ? data.settings.ignored_channels
                    : (prev.settings.ignored_channels || []),
                },
                installed_games: data.installed_games || prev.installed_games,
                all_catalog_games: data.all_catalog_games || prev.all_catalog_games,
                ignored_games: data.ignored_games || prev.ignored_games || [],
              };
          });
        }
      } catch (error) {
        if (isMounted) {
          setSentinelState((prev) => ({
            ...prev,
            connected: false,
            status_text: 'Локальный сервис Sentinel недоступен',
          }));
        }
      }
    };

    fetchState();
    // On startup, execute initial live drops sync in background once
    fetch('http://127.0.0.1:28492/api/campaigns/sync', { method: 'POST' })
      .then((res) => {
        if (isMounted && res.ok) setLastSyncAt(Date.now());
        return fetchState();
      })
      .catch(() => {});

    const interval = setInterval(fetchState, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 1-second countdown ticker for active drop
  useEffect(() => {
    const timer = setInterval(() => {
      setSentinelState((prev) => {
        if (!prev.active_drop || prev.active_drop.is_claimed || prev.hardware.is_paused) {
          return prev;
        }
        if (prev.active_drop.remaining_seconds <= 0) {
          return prev;
        }
        const newRemaining = Math.max(0, prev.active_drop.remaining_seconds - 1);
        const totalSec = prev.active_drop.required_minutes * 60;
        const elapsedSec = totalSec - newRemaining;
        const progressPct = totalSec > 0 ? Math.min(100, Math.round((elapsedSec / totalSec) * 100)) : 100;
        const canClaim = newRemaining === 0 && !prev.active_drop.is_claimed;

        return {
          ...prev,
          active_drop: {
            ...prev.active_drop,
            remaining_seconds: newRemaining,
            current_minutes: Math.floor(elapsedSec / 60),
            progress_percent: progressPct,
            can_claim: canClaim,
          },
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Toggle Game Priority
  const handleTogglePriority = async (gameIdentifier: string) => {
    const found = sentinelState.all_catalog_games.find(
      (g) => g.id.toLowerCase() === gameIdentifier.toLowerCase() || g.name.toLowerCase() === gameIdentifier.toLowerCase()
    );
    const targetName = found ? found.name : gameIdentifier;

    const currentPriority = Array.isArray(sentinelState.settings?.priority_games)
      ? sentinelState.settings.priority_games
      : [];

    const isPriority = currentPriority.some(
      (name) => name && name.toLowerCase() === targetName.toLowerCase()
    );

    const newPriority = isPriority
      ? currentPriority.filter((name) => name && name.toLowerCase() !== targetName.toLowerCase())
      : [...currentPriority, targetName];

    const updatedSettings = {
      ...sentinelState.settings,
      priority_games: newPriority,
    };

    let updatedCatalog = sentinelState.all_catalog_games;
    if (!found) {
      const customItem = {
        id: targetName.toLowerCase().replace(/[^a-z0-9]/g, '_') || `game_${Date.now()}`,
        name: targetName,
        is_installed: false,
        has_drops: true,
        category: 'Пользовательская / Twitch Drops',
      };
      updatedCatalog = [customItem, ...sentinelState.all_catalog_games];
    }

    setSentinelState((prev) => ({
      ...prev,
      all_catalog_games: updatedCatalog,
      settings: updatedSettings,
    }));

    try {
      await fetch('http://127.0.0.1:28492/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
    } catch {
      // Standalone mode
    }

    showToast(isPriority ? `"${targetName}" удалена из приоритета` : `"${targetName}" добавлена в очередь фарма`);
  };

  // Toggle Game Exclude
  const handleToggleExclude = async (gameIdentifier: string) => {
    const found = sentinelState.all_catalog_games.find(
      (g) => g.id.toLowerCase() === gameIdentifier.toLowerCase() || g.name.toLowerCase() === gameIdentifier.toLowerCase()
    );
    const targetName = found ? found.name : gameIdentifier;

    const currentExcluded = Array.isArray(sentinelState.settings?.excluded_games)
      ? sentinelState.settings.excluded_games
      : [];

    const isExcluded = currentExcluded.some(
      (name) => name && name.toLowerCase() === targetName.toLowerCase()
    );

    const newExcluded = isExcluded
      ? currentExcluded.filter((name) => name && name.toLowerCase() !== targetName.toLowerCase())
      : [...currentExcluded, targetName];

    const updatedSettings = {
      ...sentinelState.settings,
      excluded_games: newExcluded,
    };

    setSentinelState((prev) => ({
      ...prev,
      settings: updatedSettings,
    }));

    try {
      await fetch('http://127.0.0.1:28492/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
    } catch {
      // Standalone mode
    }

    showToast(isExcluded ? `"${targetName}" возвращена в ротацию` : `"${targetName}" исключена из дропов`);
  };

  // Toggle User Linked Game with fuzzy match (e.g. Hunt: Showdown 1896 matches Hunt: Showdown)
  const handleToggleUserLinked = async (gameName: string) => {
    const currentLinked = Array.isArray(sentinelState.settings?.user_linked_games)
      ? sentinelState.settings.user_linked_games
      : [];

    const isGameMatch = (a: string, b: string) => {
      if (!a || !b) return false;
      const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanA === cleanB) return true;
      if (cleanA.length >= 5 && cleanB.length >= 5) {
        if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
      }
      return false;
    };

    const isLinked = currentLinked.some((name) => isGameMatch(name, gameName));

    const newLinked = isLinked
      ? currentLinked.filter((name) => !isGameMatch(name, gameName))
      : [...currentLinked, gameName];

    const updatedSettings = {
      ...sentinelState.settings,
      user_linked_games: newLinked,
    };

    const updatedCatalog = sentinelState.all_catalog_games.map((g) => {
      if (isGameMatch(g.name, gameName)) {
        return {
          ...g,
          is_account_connected: !isLinked,
        };
      }
      return g;
    });

    setSentinelState((prev) => ({
      ...prev,
      settings: updatedSettings,
      all_catalog_games: updatedCatalog,
    }));

    try {
      await fetch('http://127.0.0.1:28492/api/games/toggle-linked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: gameName }),
      });
    } catch {
      // Standalone mode
    }

    showToast(isLinked ? `Привязка для "${gameName}" снята` : `"${gameName}" отмечена как привязанная ✓`);
  };

  // Update Settings
  const handleUpdateSettings = async (newSettings: Partial<SentinelSettings>) => {
    const merged = { ...sentinelState.settings, ...newSettings };
    setSentinelState((prev) => ({ ...prev, settings: merged }));

    try {
      await fetch('http://127.0.0.1:28492/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    } catch {
      // Standalone mode
    }
  };

  // Claim Drop
  const handleClaimNow = async (dropId?: string) => {
    if (!sentinelState.active_drop) {
      showToast('В данный момент нет готовых к зачислению дропов. Sentinel автоматически заберет дроп при достижении 100%.');
      return;
    }

    if (!sentinelState.active_drop.can_claim && !sentinelState.active_drop.is_claimed && sentinelState.active_drop.progress_percent < 100) {
      showToast(`Дроп еще фармится (${sentinelState.active_drop.progress_percent}%). Он будет зачислен автоматически при завершении!`);
    }

    const newTrophy: TrophyItem = {
      id: `tr-${Date.now()}`,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      game: sentinelState.active_drop.game,
      drop_name: sentinelState.active_drop.name,
      campaign: 'Twitch Drops Campaign',
      status: 'Claimed',
    };

    setSentinelState((prev) => ({
      ...prev,
      trophies: [newTrophy, ...prev.trophies],
      stats: {
        ...prev.stats,
        total_drops_claimed: prev.stats.total_drops_claimed + 1,
      },
      active_drop: {
        ...prev.active_drop!,
        is_claimed: true,
        can_claim: false,
      },
    }));

    try {
      await fetch('http://127.0.0.1:28492/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_id: dropId }),
      });
    } catch {
      // Standalone mode
    }

    playRewardChime();
    showToast(`🏆 Награда "${sentinelState.active_drop.name}" успешно зачислена в инвентарь!`);
  };

  // Manual Refresh
  const handleManualRefresh = async () => {
    playClick();
    showToast('Синхронизация инвентаря и активных кампаний...');
    try {
      const res = await fetch('http://127.0.0.1:28492/api/sync', { method: 'POST' });
      if (res.ok) {
        const stateRes = await fetch('http://127.0.0.1:28492/api/state');
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          setSentinelState((prev) => ({
            ...prev,
            ...stateData,
            connected: true,
            installed_games: stateData.installed_games || prev.installed_games,
            all_catalog_games: stateData.all_catalog_games || prev.all_catalog_games,
          }));
        }
        setLastSyncAt(Date.now());
        showToast('✓ Данные Twitch Drops успешно обновлены');
      }
    } catch {
      showToast('✓ Локальное состояние актуализировано');
    }
  };

  // Open Vault File
  const handleOpenVaultFile = () => {
    playClick();
    fetch('http://127.0.0.1:28492/api/open-trophies-file', { method: 'POST' }).catch(() => {});
    showToast('Открытие Trophies.md в локальном редакторе...');
  };

  // Rescan Installed Games
  const handleRescanGames = async () => {
    playClick();
    setIsScanning(true);
    showToast('Глубокое сканирование Steam, Epic Games, GOG и выбранных папок...');
    try {
      const res = await fetch('http://127.0.0.1:28492/api/scan-games', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await handleManualRefresh();
      const count = data.installed_count ?? data.games?.length;
      if (typeof count !== 'number') throw new Error('В ответе сервиса нет количества найденных игр');
      showToast(`✓ Найдено установленных игр: ${count}`);
      return count;
    } catch (error) {
      showToast(`Не удалось завершить сканирование: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle Daemon Farm Pause / Resume
  const handleToggleDaemon = async () => {
    playClick();
    const willPause = !sentinelState.hardware.is_paused;
    setSentinelState((prev) => ({
      ...prev,
      hardware: {
        ...prev.hardware,
        is_paused: willPause,
      },
    }));
    try {
      const res = await fetch('http://127.0.0.1:28492/api/toggle-daemon', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSentinelState((prev) => ({
          ...prev,
          hardware: {
            ...prev.hardware,
            is_paused: Boolean(data.force_paused),
          },
        }));
      }
    } catch {
      // Standalone mode
    }
    showToast(willPause ? '⏸️ Фарм приостановлен пользователем' : '▶️ Фарм возобновлен в штатном режиме');
  };

  // Switch Streamer to next available channel in the current game campaign
  const handleSwitchStreamer = async (skipGame: boolean = false) => {
    playClick();
    showToast(skipGame ? '🔀 Ротация игры: переход к следующей...' : '🔀 Смена стримера: поиск следующей активной трансляции...');
    try {
      await fetch('http://127.0.0.1:28492/api/switch-streamer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip_game: skipGame }),
      });
      setTimeout(handleManualRefresh, 1200);
    } catch {
      showToast('✓ Команда ротации стримера отправлена');
    }
  };

  // Reorder Priority Games (Move UP or DOWN in the queue)
  const handleReorderPriority = async (gameName: string, direction: 'up' | 'down') => {
    playClick();
    const current = [...(sentinelState.settings?.priority_games || [])];
    const idx = current.indexOf(gameName);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= current.length) return;

    // Swap positions
    [current[idx], current[targetIdx]] = [current[targetIdx], current[idx]];
    const updatedSettings = {
      ...sentinelState.settings,
      priority_games: current,
    };
    setSentinelState((prev) => ({ ...prev, settings: updatedSettings }));
    try {
      await fetch('http://127.0.0.1:28492/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
    } catch {
      // Standalone mode
    }
    showToast(`⭐ Приоритет обновлен: ${gameName} перемещен ${direction === 'up' ? 'выше' : 'ниже'}`);
  };

  // Manual Farm Override (Принудительный запуск фарма выбранной игры)
  const handleForceFarm = async (gameName: string) => {
    playClick();
    setSentinelState((prev) => ({ ...prev, forced_game: gameName }));
    try {
      const res = await fetch('http://127.0.0.1:28492/api/farm/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: gameName }),
      });
      if (res.ok) {
        showToast(`⚡ Принудительный фокус: ${gameName}`);
      } else {
        showToast(`⚠️ Не удалось переключить фарм на ${gameName}`);
      }
    } catch {
      showToast(`⚡ Принудительный фокус: ${gameName}`);
    }
  };

  // Ban or Snooze Streamer
  const handleBanStreamer = async (channelName: string, isSnooze2h: boolean) => {
    playClick();
    const until = isSnooze2h ? Date.now() + 2 * 3600 * 1000 : undefined;
    const reason: 'snooze2h' | 'permaban' = isSnooze2h ? 'snooze2h' : 'permaban';
    const existing = sentinelState.settings.ignored_channels || [];
    const filtered = existing.filter((c) => c.name.toLowerCase() !== channelName.toLowerCase());
    const newIgnored = [...filtered, { name: channelName, until, reason }];
    const updatedSettings = {
      ...sentinelState.settings,
      ignored_channels: newIgnored,
    };
    setSentinelState((prev) => ({ ...prev, settings: updatedSettings }));
    try {
      await fetch('http://127.0.0.1:28492/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
    } catch {
      // Standalone mode
    }
    showToast(isSnooze2h ? `⏳ Канал "${channelName}" скрыт на 2 часа` : `🚫 Канал "${channelName}" добавлен в чёрный список`);
    handleSwitchStreamer(false);
  };

  // Unban Streamer
  const handleUnbanStreamer = async (channelName: string) => {
    playClick();
    const existing = sentinelState.settings.ignored_channels || [];
    const newIgnored = existing.filter((c) => c.name.toLowerCase() !== channelName.toLowerCase());
    const updatedSettings = {
      ...sentinelState.settings,
      ignored_channels: newIgnored,
    };
    setSentinelState((prev) => ({ ...prev, settings: updatedSettings }));
    try {
      await fetch('http://127.0.0.1:28492/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
    } catch {
      // Standalone mode
    }
    showToast(`✓ Канал "${channelName}" удалён из черного списка`);
  };

  // Cancel Manual Farm Override (Возврат в авто-очередь)
  const handleCancelForceFarm = async () => {
    playClick();
    setSentinelState((prev) => ({ ...prev, forced_game: null }));
    try {
      await fetch('http://127.0.0.1:28492/api/farm/cancel-force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      showToast('✕ Ручной фокус сброшен. Возврат в авто-очередь.');
    } catch {
      showToast('✕ Ручной фокус сброшен.');
    }
  };

  return {
    sentinelState,
    setSentinelState,
    isScanning,
    handleTogglePriority,
    handleToggleExclude,
    handleUpdateSettings,
    handleClaimNow,
    handleManualRefresh,
    lastSyncAt,
    handleOpenVaultFile,
    handleRescanGames,
    handleToggleDaemon,
    handleSwitchStreamer,
    handleReorderPriority,
    handleForceFarm,
    handleCancelForceFarm,
    handleBanStreamer,
    handleUnbanStreamer,
    handleToggleUserLinked,
  };
}
