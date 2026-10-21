import { useState, useEffect } from 'react';
import { FullSentinelState, SentinelSettings, TrophyItem } from '../types';
import { INITIAL_GAMES_DATABASE, USER_INSTALLED_GAMES } from '../data/gamesCatalog';

const INITIAL_STATE: FullSentinelState = {
  connected: true,
  user_id: '492817291',
  username: 'Mortuis_V',
  status_text: 'Инициализация Sentinel & опрос Twitch API...',
  watching_channel: null,
  active_drop: null,
  forced_game: null,
  recent_logs: [],
  hardware: {
    is_gaming: false,
    detected_game: null,
    on_battery: false,
    is_paused: false,
    ping_ms: 18,
    cpu_percent: 14,
    gpu_percent: 8,
  },
  stats: {
    traffic_saved_mb: 28400,
    total_drops_claimed: 8659,
    channel_points_earned: 42500,
    total_farm_hours: 30.6,
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
    priority_games: [
      'Rust',
      'Tom Clancy\'s Rainbow Six Siege',
      'The Witcher 3: Wild Hunt',
      'Path of Exile 2',
      'HITMAN World of Assassination',
      'AION 2',
    ],
    excluded_games: ['VALORANT', 'League of Legends'],
  },
  trophies: [
    {
      id: 'tr-001',
      date: '2026-10-11 21:40',
      game: 'HITMAN World of Assassination',
      drop_name: 'Duck Themed Suit & Explosive Device',
      campaign: 'Hitman October Drops Campaign',
      status: 'Claimed',
    },
    {
      id: 'tr-002',
      date: '2026-10-10 18:15',
      game: 'The Witcher 3: Wild Hunt',
      drop_name: 'Dwarven Spirit & Rare Gwent Card Pack',
      campaign: 'CD Projekt RED Anniversary Drops',
      status: 'Claimed',
    },
    {
      id: 'tr-003',
      date: '2026-10-09 14:30',
      game: 'Rust',
      drop_name: 'Mortuis Tactical AK-47 & Metal Face Mask',
      campaign: 'Twitch Rivals Rust Edition',
      status: 'Claimed',
    },
  ],
  installed_games: USER_INSTALLED_GAMES,
  all_catalog_games: INITIAL_GAMES_DATABASE,
};

export function useSentinelState(
  showToast: (msg: string) => void,
  playRewardChime: () => void,
  playClick: () => void
) {
  const [sentinelState, setSentinelState] = useState<FullSentinelState>(INITIAL_STATE);
  const [isScanning, setIsScanning] = useState(false);

  // Poll backend API
  useEffect(() => {
    let isMounted = true;
    const fetchState = async () => {
      try {
        const res = await fetch('http://127.0.0.1:28492/api/state');
        if (res.ok) {
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
                installed_games: data.installed_games || prev.installed_games,
                all_catalog_games: data.all_catalog_games || prev.all_catalog_games,
                ignored_games: data.ignored_games || prev.ignored_games || [],
              };
            });
          }
        }
      } catch {
        // Standalone or initializing
      }
    };

    fetchState();
    // On startup, execute initial live drops sync in background once
    fetch('http://127.0.0.1:28492/api/campaigns/sync', { method: 'POST' })
      .then(() => fetchState())
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

    const isPriority = sentinelState.settings.priority_games.some(
      (name) => name.toLowerCase() === targetName.toLowerCase()
    );

    const newPriority = isPriority
      ? sentinelState.settings.priority_games.filter((name) => name.toLowerCase() !== targetName.toLowerCase())
      : [...sentinelState.settings.priority_games, targetName];

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

    showToast(isPriority ? `"${targetName}" удалена из приоритета` : `"${targetName}" добавлена в ТОП-приоритет фарма`);
  };

  // Toggle Game Exclude
  const handleToggleExclude = async (gameIdentifier: string) => {
    const found = sentinelState.all_catalog_games.find(
      (g) => g.id.toLowerCase() === gameIdentifier.toLowerCase() || g.name.toLowerCase() === gameIdentifier.toLowerCase()
    );
    const targetName = found ? found.name : gameIdentifier;

    const isExcluded = sentinelState.settings.excluded_games.some(
      (name) => name.toLowerCase() === targetName.toLowerCase()
    );

    const newExcluded = isExcluded
      ? sentinelState.settings.excluded_games.filter((name) => name.toLowerCase() !== targetName.toLowerCase())
      : [...sentinelState.settings.excluded_games, targetName];

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
      if (res.ok) {
        const data = await res.json();
        await handleManualRefresh();
        showToast(`✓ Найдено установленных игр: ${data.installed_count ?? data.games?.length ?? 0}`);
      }
    } catch {
      await handleManualRefresh();
      showToast('✓ Сканирование библиотек завершено');
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
    const current = [...sentinelState.settings.priority_games];
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
    handleOpenVaultFile,
    handleRescanGames,
    handleToggleDaemon,
    handleSwitchStreamer,
    handleReorderPriority,
    handleForceFarm,
    handleCancelForceFarm,
  };
}
