import React, { useState, useMemo, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { GameItem, TrophyItem } from '../types';
import { resolveGameBoxArtSources } from '../utils/gameBoxArts';
import { useTactileAudio } from '../hooks/useTactileAudio';

interface GameShelfProps {
  games: GameItem[];
  priorityList: string[];
  excludedList: string[];
  ignoredGames?: string[];
  trophies?: TrophyItem[];
  userLinkedGames?: string[];
  forcedGame?: string | null;
  onForceFarm?: (gameName: string) => void;
  onCancelForceFarm?: () => void;
  onAddToPriority: (gameName: string) => void;
  onRemoveFromPriority: (gameName: string) => void;
  onAddToExcluded: (gameName: string) => void;
  onRemoveFromExcluded: (gameName: string) => void;
  onToggleUserLinked?: (gameName: string) => void;
  onReorderPriority?: (gameName: string, direction: 'up' | 'down') => void;
  onRescanGames?: () => void;
  onBack?: () => void;
  onOpenVaultFile?: () => void;
  onShowToast?: (msg: string) => void;
  onManualRefresh?: () => void;
}

const CartridgeCover: React.FC<{ name: string; boxArt?: string }> = ({ name, boxArt }) => {
  const sources = useMemo(() => resolveGameBoxArtSources(name, [boxArt]), [name, boxArt]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentIdx(0);
    setFailed(false);
  }, [sources]);

  const currentSrc = sources[currentIdx];

  if (!currentSrc || failed) {
    const initials = name.slice(0, 2).toUpperCase();
    return (
      <div 
        style={{
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle at 50% 35%, rgba(115, 187, 165, 0.12) 0%, transparent 70%), linear-gradient(180deg, #1A2220 0%, #111716 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--led-mint)',
          letterSpacing: '1px',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '28px', fontWeight: 900, textShadow: '0 0 16px rgba(115, 187, 165, 0.35)' }}>
          {initials}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
          NO POSTER
        </span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={name}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      loading="lazy"
      onError={() => {
        if (currentIdx + 1 < sources.length) {
          setCurrentIdx(prev => prev + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
};

const isTitleMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanA === cleanB) return true;
  if (cleanA.length >= 5 && cleanB.length >= 5) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }
  return false;
};

export const GameShelf: React.FC<GameShelfProps> = ({
  games,
  priorityList = [],
  excludedList = [],
  ignoredGames = [],
  trophies = [],
  userLinkedGames = [],
  forcedGame = null,
  onForceFarm,
  onCancelForceFarm,
  onAddToPriority,
  onRemoveFromPriority,
  onAddToExcluded,
  onRemoveFromExcluded,
  onReorderPriority,
  onManualRefresh,
  onOpenVaultFile,
  onShowToast,
  onToggleUserLinked,
}) => {
  const { playClick } = useTactileAudio();

  // 1. All useState hooks declared cleanly at the top to prevent TDZ errors
  const [filterMode, setFilterMode] = useState<'all' | 'drops' | 'priority' | 'claimed' | 'installed' | 'excluded' | 'removed'>('all');
  const [removedKeys, setRemovedKeys] = useState<string[]>(ignoredGames || []);
  const [showTrophyVault, setShowTrophyVault] = useState<boolean>(true);
  const [syncLabel, setSyncLabel] = useState<string>('↻ Синхронизировать Drops');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (ignoredGames && ignoredGames.length > 0) {
      setRemovedKeys(prev => Array.from(new Set([...prev, ...ignoredGames])));
    }
  }, [ignoredGames]);

  // 2. Computed Sets & Mappings
  const excludedSet = useMemo(() => new Set(excludedList), [excludedList]);

  const claimedTrophiesByGame = useMemo(() => {
    const map: Record<string, TrophyItem[]> = {};
    trophies.forEach(t => {
      const g = t.game || (t as any).game_name || t.campaign || 'OTHER';
      if (!map[g]) map[g] = [];
      map[g].push(t);
    });
    return map;
  }, [trophies]);

  const isGameClaimed = (target: GameItem | string) => {
    const targetName = typeof target === 'string' ? target : target.name;
    const match = games.find(g => isTitleMatch(g.name, targetName));
    if (match && ((match.claimed_drops || 0) > 0 || match.is_finished)) return true;
    if ((claimedTrophiesByGame[targetName]?.length || 0) > 0) return true;
    return Object.keys(claimedTrophiesByGame).some(
      k => isTitleMatch(k, targetName) && claimedTrophiesByGame[k].length > 0
    );
  };

  const isDropActiveNow = (game: GameItem) =>
    Boolean(
      game.has_drops ||
      game.is_active_now ||
      (game.rewards_count || 0) > 0 ||
      (game as any).is_drop_active ||
      ((game as any).drops_count || 0) > 0
    );

  const isSyncingDrops = syncLabel.includes('Синхронизация');
  const isSyncSuccess = syncLabel.includes('ОБНОВЛЕНО');

  const activeFilter = filterMode;
  const setActiveFilter = (f: any) => setFilterMode(f);

  // 3. API Handlers with absolute URLs and backend sync
  const handleClearInstalled = async () => {
    playClick();
    try {
      const res = await fetch('http://127.0.0.1:28492/api/installed-games/clear', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (onManualRefresh) onManualRefresh();
      if (onShowToast) onShowToast('Список установленных игр очищен');
    } catch (err) {
      console.error('GameShelf: не удалось очистить список установленных игр', err);
      if (onShowToast) onShowToast('Не удалось очистить список: сервис недоступен');
    }
  };

  const handleRemoveInstalled = async (gameName: string) => {
    setRemovedKeys(prev => [...prev, gameName]);
    if (onAddToExcluded) onAddToExcluded(gameName);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/installed-games/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName, game: gameName })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (onShowToast) onShowToast(`"${gameName}" скрыта с полки`);
      if (onManualRefresh) onManualRefresh();
    } catch (err) {
      console.error(`GameShelf: не удалось скрыть "${gameName}"`, err);
      if (onShowToast) onShowToast(`Не удалось скрыть "${gameName}": сервис недоступен`);
    }
  };

  const handleRestoreGame = async (gameName: string) => {
    setRemovedKeys(prev => prev.filter(k => k.toLowerCase() !== gameName.toLowerCase()));
    if (onRemoveFromExcluded) onRemoveFromExcluded(gameName);
    try {
      const res = await fetch('http://127.0.0.1:28492/api/installed-games/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName, game: gameName })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (onShowToast) onShowToast(`"${gameName}" восстановлена на полку`);
      if (onManualRefresh) onManualRefresh();
    } catch (err) {
      console.error(`GameShelf: не удалось восстановить "${gameName}"`, err);
      if (onShowToast) onShowToast(`Не удалось восстановить "${gameName}": сервис недоступен`);
    }
  };

  const handleSyncClick = async () => {
    playClick();
    setSyncLabel('↻ Синхронизация...');
    let synced = true;
    try {
      if (onManualRefresh) {
        await onManualRefresh();
      }
    } catch (err) {
      synced = false;
      console.error('GameShelf: синхронизация не удалась', err);
    }
    setSyncLabel(synced ? `✓ ОБНОВЛЕНО (${games.length})` : '✗ ОШИБКА СИНХРОНИЗАЦИИ');
    setTimeout(() => {
      setSyncLabel('↻ Синхронизировать Drops');
    }, 3000);
  };

  const handleSyncDrops = () => handleSyncClick();

  const handleOpenTrophies = () => {
    playClick();
    if ((window as any).chrome?.webview) {
      try {
        (window as any).chrome.webview.postMessage({ type: 'OPEN_VAULT' });
      } catch {}
    }
    fetch('http://127.0.0.1:28492/api/open-trophies-file', { method: 'POST' }).catch(() => {});
    if (onOpenVaultFile) {
      onOpenVaultFile();
    } else if (onShowToast) {
      onShowToast('Журнал Trophies.md открыт');
    }
  };

  const allRemovedLower = useMemo(() => {
    return new Set([...removedKeys, ...(ignoredGames || [])].map(k => k.toLowerCase().trim()));
  }, [removedKeys, ignoredGames]);

  // 4. Filter games based on active tab and search
  const filteredGames = useMemo(() => {
    if (activeFilter === 'removed' || filterMode === 'removed') {
      const removedCatalogGames = games.filter(g => allRemovedLower.has(g.name.toLowerCase()));
      const catalogNamesLower = new Set(removedCatalogGames.map(g => g.name.toLowerCase()));

      const synthesizedGames: GameItem[] = [];
      allRemovedLower.forEach(lowerName => {
        if (!catalogNamesLower.has(lowerName)) {
          const title = lowerName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          synthesizedGames.push({
            id: `removed-${lowerName}`,
            name: title,
            is_installed: false,
            has_drops: false,
            is_active_now: false,
            category: 'Удалено из каталога'
          });
        }
      });

      const combined = [...removedCatalogGames, ...synthesizedGames];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return combined.filter(g => g.name.toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q));
      }
      return combined.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (activeFilter === 'claimed' || filterMode === 'claimed') {
      const matchedGames = games.filter(g => {
        if ((g.claimed_drops || 0) > 0 || g.is_finished) return true;
        if ((claimedTrophiesByGame[g.name]?.length || 0) > 0) return true;
        return Object.keys(claimedTrophiesByGame).some(
          k => isTitleMatch(k, g.name) && claimedTrophiesByGame[k].length > 0
        );
      });
      const matchedNamesLower = new Set(matchedGames.map(g => g.name.toLowerCase().trim()));

      const synthClaimed: GameItem[] = [];
      Object.entries(claimedTrophiesByGame).forEach(([trophyGame, items]) => {
        const lower = trophyGame.toLowerCase().trim();
        const alreadyMatched = matchedGames.some(mg => isTitleMatch(mg.name, trophyGame));
        if (!alreadyMatched && items.length > 0) {
          synthClaimed.push({
            id: `trophy-${lower}`,
            name: trophyGame,
            is_installed: false,
            has_drops: false,
            is_active_now: false,
            category: `🏆 Трофеев: ${items.length}`
          });
        }
      });

      const combined = [...matchedGames, ...synthClaimed];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return combined.filter(g => g.name.toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q));
      }
      return combined;
    }

    const list = games.filter(g => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!g.name.toLowerCase().includes(q) && !(g.category || '').toLowerCase().includes(q)) return false;
      }
      if (activeFilter === 'excluded') {
        return excludedSet.has(g.name) || excludedList.includes(g.name);
      }
      // Non-excluded tabs hide excluded and removed games
      if (excludedSet.has(g.name) || excludedList.includes(g.name) || allRemovedLower.has(g.name.toLowerCase())) {
        return false;
      }
      if (activeFilter === 'all' || filterMode === 'drops') {
        return isDropActiveNow(g);
      }
      if (activeFilter === 'priority') {
        return priorityList.includes(g.name);
      }
      if (activeFilter === 'installed') {
        return Boolean(g.is_installed);
      }
      return true;
    });

    if (activeFilter === 'priority') {
      return [...list].sort((a, b) => {
        const idxA = priorityList.indexOf(a.name);
        const idxB = priorityList.indexOf(b.name);
        return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
      });
    }

    return list;
  }, [games, priorityList, excludedList, excludedSet, allRemovedLower, activeFilter, searchQuery, claimedTrophiesByGame]);

  const installedCount = useMemo(() => games.filter(g => g.is_installed).length, [games]);
  const dropsCount = useMemo(() => games.filter(g => isDropActiveNow(g)).length || games.length, [games]);
  const claimedCount = useMemo(() => {
    const claimedGames = new Set<string>();
    games.forEach(g => {
      if ((g.claimed_drops || 0) > 0 || g.is_finished || (claimedTrophiesByGame[g.name]?.length || 0) > 0) {
        claimedGames.add(g.name.toLowerCase().trim());
      }
    });
    Object.keys(claimedTrophiesByGame).forEach(k => {
      if (claimedTrophiesByGame[k].length > 0) {
        claimedGames.add(k.toLowerCase().trim());
      }
    });
    return claimedGames.size;
  }, [games, claimedTrophiesByGame]);

  const removedCount = useMemo(() => {
    return allRemovedLower.size;
  }, [allRemovedLower]);

  // Fallback demo trophies if none loaded yet
  const displayTrophies = useMemo(() => {
    if (trophies && trophies.length > 0) return trophies.slice(0, 9);
    return [
      {
        id: 'tr-001',
        game: 'RUST • TWITCH RIVALS',
        name: 'Tactical Thompson & Metal Mask',
        drop_name: 'Tactical Thompson & Metal Mask',
        date: '2026-10-24',
        claimed_at: '2026-10-24',
        campaign: 'Twitch Rivals',
        status: 'CLAIMED',
      },
      {
        id: 'tr-002',
        game: 'THE WITCHER 3: WILD HUNT',
        name: 'Dwarven Spirit & Gwent Pack',
        drop_name: 'Dwarven Spirit & Gwent Pack',
        date: '2026-10-22',
        claimed_at: '2026-10-22',
        campaign: 'Witcher 3 Anniversary',
        status: 'CLAIMED',
      },
      {
        id: 'tr-003',
        game: 'HITMAN WORLD OF ASSASSINATION',
        name: 'Duck Suit & Explosive Device',
        drop_name: 'Duck Suit & Explosive Device',
        date: '2026-10-19',
        claimed_at: '2026-10-19',
        campaign: 'Duck Festival',
        status: 'CLAIMED',
      },
    ];
  }, [trophies]);

  return (
    <div id="view-shelf" className="view-tab" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Top Filter Bar 1-to-1 with SPEC */}
      <div className="titanium-island" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px' }}>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            className={`tactile-btn ${activeFilter === 'all' ? 'active-mint' : ''}`}
            onClick={() => { playClick(); setActiveFilter('all'); }}
          >
            🔥 Гарантированные Drops ({dropsCount})
          </button>
          <button 
            className={`tactile-btn ${activeFilter === 'priority' ? 'active-mint' : ''}`}
            onClick={() => { playClick(); setActiveFilter('priority'); }}
          >
            ⭐ В моей очереди ({priorityList.length})
          </button>
          <button 
            className={`tactile-btn ${activeFilter === 'claimed' ? 'active-amber' : ''}`}
            onClick={() => { playClick(); setActiveFilter('claimed'); setShowTrophyVault(true); }}
            title="Показать игры с полученными наградами и 3D-витрину трофеев"
          >
            🏆 Собрано ({claimedCount})
          </button>
          <button 
            className={`tactile-btn ${activeFilter === 'installed' ? 'active-mint' : ''}`}
            onClick={() => { playClick(); setActiveFilter('installed'); }}
          >
            💾 Установлено на ПК ({installedCount})
          </button>
          <button 
            className={`tactile-btn ${activeFilter === 'excluded' ? 'active-mint' : ''}`}
            onClick={() => { playClick(); setActiveFilter('excluded'); }}
          >
            🚫 Исключения ({excludedList.length})
          </button>
          <button 
            className={`tactile-btn ${activeFilter === 'removed' ? 'active-mint' : ''}`}
            onClick={() => { playClick(); setActiveFilter('removed'); }}
          >
            🗑️ Удалённые ({removedCount})
          </button>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Быстрый поиск игры..."
              style={{
                background: 'var(--bg-well)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '7px',
                padding: '4px 22px 4px 10px',
                fontSize: '11px',
                color: 'var(--text-primary)',
                outline: 'none',
                marginLeft: '6px',
                width: '180px',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  lineHeight: '1',
                  padding: '2px',
                }}
                title="Очистить поиск"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <button className="chunky-cta" onClick={handleSyncClick}>
          {syncLabel}
        </button>
      </div>

      {/* Collapsible 3D Trophy Showcase (#holoTrophyVault) 1-to-1 with SPEC */}
      {(showTrophyVault || activeFilter === 'claimed') && (
        <div id="holoTrophyVault" className="titanium-island">
          <div className="engraved-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="tag" style={{ color: 'var(--led-amber)' }}>
                <span title="Коллекционная 3D-витрина трофеев (Trophies.md)">🏆 ТРОФЕИ</span>
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                🏆 Витрина 3D Трофеев • {claimedCount} игр с наградами
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className="tactile-btn" 
                style={{ height: '24px', fontSize: '9.5px' }} 
                onClick={() => setShowTrophyVault(prev => !prev)}
                title="Свернуть или развернуть 3D витрину"
              >
                {showTrophyVault ? '▲ Свернуть 3D' : '▼ 🏆 Витрина 3D Трофеев'}
              </button>
              <button className="tactile-btn" style={{ height: '24px' }} onClick={handleOpenTrophies}>
                📄 Открыть Trophies.md
              </button>
            </div>
          </div>
          {showTrophyVault && (
          <div className="holo-trophy-grid">
            {displayTrophies.map((item, idx) => {
              const gameTitle = item.game || (item as any).game_name || item.campaign || 'DROPS EVENT';
              const dropTitle = item.drop_name || (item as any).name || 'Unlocked In-Game Trophy';
              const claimTime = item.date || (item as any).claimed_at || 'НЕДАВНО';
              return (
                <div key={idx} className="holo-card">
                  <div className="tabular" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--led-mint)' }}>
                    <span>{gameTitle}</span>
                    <span>{claimTime}</span>
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, margin: '4px 0' }}>
                    {dropTitle}
                  </div>
                  <div className="tabular" style={{ fontSize: '9px', color: 'var(--led-amber)' }}>
                    ★ AUTO-CLAIMED VIA GQL
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* Cartridges Grid (.cartridges-grid) 1-to-1 with SPEC */}
      <div className="cartridges-grid">
        {filteredGames.length === 0 ? (
          <div 
            className="titanium-island" 
            style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}
          >
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {activeFilter === 'claimed'
                ? '🏆 Наград пока не собрано'
                : activeFilter === 'removed'
                  ? 'Список удалённых пуст'
                  : 'Игры не найдены'}
            </div>
            <div style={{ fontSize: '11.5px', maxWidth: '440px', margin: '0 auto', lineHeight: '1.6' }}>
              {activeFilter === 'claimed'
                ? 'Sentinel автоматически фиксирует полученные трофеи в Trophies.md при каждом завершении кампании. Запустите фарм, и первые трофеи появятся здесь!'
                : activeFilter === 'removed'
                  ? 'Все игры из каталога сейчас активны и отображаются на полке.'
                  : 'Попробуйте сбросить поисковый запрос или выбрать другой фильтр.'}
            </div>
          </div>
        ) : (
          filteredGames.map((game) => {
            const isForced = forcedGame === game.name;
            const priorityIndex = priorityList.indexOf(game.name);
            const isInPriority = priorityIndex !== -1;
            const isExcluded = excludedList.includes(game.name);
            const isRemoved = allRemovedLower.has(game.name.toLowerCase());

            // Subtitle text matching spec format
            let subtitle = 'Ожидание новой раздачи';
            let subtitleColor = 'var(--text-muted)';
            if (isExcluded) {
              subtitle = '🚫 В исключениях (нельзя в очередь)';
              subtitleColor = 'var(--text-muted)';
            } else if (isRemoved) {
              subtitle = '🗑 В удалённых (нельзя в очередь)';
              subtitleColor = 'var(--text-muted)';
            } else if (isForced) {
              subtitle = '⚡ ПРИНУДИТЕЛЬНЫЙ ФАРМ #1';
              subtitleColor = 'var(--led-amber)';
            } else if (isInPriority) {
              const rewardsTxt = game.rewards_count || (game as any).drops_count;
              subtitle = `⭐ #${priorityIndex + 1} в очереди • ${rewardsTxt ? `${rewardsTxt} наград` : 'награды уточняются'}`;
              subtitleColor = 'var(--led-amber)';
            } else if (game.is_installed) {
              subtitle = '💾 Установлено на ПК';
              subtitleColor = 'var(--led-mint)';
            } else if (game.has_drops || game.is_active_now || (game as any).is_drop_active) {
              const rewardsTxt = game.rewards_count || (game as any).drops_count;
              subtitle = `🔥 Дропы активны • ${rewardsTxt ? `${rewardsTxt} наград` : 'Активная кампания'}`;
              subtitleColor = 'var(--led-mint)';
            }

            const isDropActive = isDropActiveNow(game);
            const isLinked = Boolean(
              game.is_account_connected === true ||
              (userLinkedGames && userLinkedGames.some(k => isTitleMatch(k, game.name))) ||
              (game.claimed_drops || 0) > 0 ||
              game.is_finished ||
              trophies.some(t => isTitleMatch(t.game, game.name))
            );
            const needsLink = isDropActive && !isLinked;

            return (
              <div key={game.name} className="cartridge-card">
                <div 
                  style={{ 
                    position: 'relative', 
                    width: '100%', 
                    aspectRatio: '3 / 4', 
                    maxHeight: '260px', 
                    borderRadius: '10px', 
                    overflow: 'hidden',
                    background: 'var(--bg-well)',
                    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <CartridgeCover name={game.name} boxArt={game.box_art} />
                  {isLinked && isDropActive && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        playClick();
                        if (onToggleUserLinked) onToggleUserLinked(game.name);
                      }}
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        maxWidth: 'calc(100% - 12px)',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace",
                        background: 'rgba(6, 44, 28, 0.94)',
                        color: 'var(--led-mint)',
                        border: '1px solid rgba(58, 210, 159, 0.5)',
                        backdropFilter: 'blur(8px)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        userSelect: 'none',
                        cursor: 'pointer'
                      }}
                      title="Аккаунт привязан к Twitch (нажмите, чтобы изменить статус)"
                    >
                      <span style={{ fontSize: '10px' }}>✓</span>
                      <span>Привязан</span>
                    </div>
                  )}
                  {needsLink && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        maxWidth: 'calc(100% - 12px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        zIndex: 2,
                      }}
                    >
                      <a 
                        href={game.account_link_url || (game as any).details_url || "https://www.twitch.tv/settings/connections"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '2px 5px',
                          borderRadius: '5px 0 0 5px',
                          fontSize: '10px',
                          fontWeight: 800,
                          fontFamily: "'JetBrains Mono', monospace",
                          background: 'rgba(54, 30, 4, 0.94)',
                          color: 'var(--led-amber)',
                          border: '1px solid rgba(245, 158, 11, 0.5)',
                          borderRight: 'none',
                          backdropFilter: 'blur(8px)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.65)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          whiteSpace: 'nowrap',
                          textDecoration: 'none',
                          cursor: 'pointer'
                        }}
                        title="Нажмите, чтобы открыть страницу привязки аккаунта"
                      >
                        <span>⚠️ Требуется привязка</span>
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          if (onToggleUserLinked) onToggleUserLinked(game.name);
                        }}
                        style={{
                          padding: '2px 5px',
                          borderRadius: '0 5px 5px 0',
                          fontSize: '10px',
                          fontWeight: 800,
                          fontFamily: "'JetBrains Mono', monospace",
                          background: 'rgba(58, 210, 159, 0.18)',
                          color: 'var(--led-mint)',
                          border: '1px solid rgba(58, 210, 159, 0.5)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Отметить аккаунт как уже привязанный"
                      >
                        ✓
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {game.name}
                  </div>
                  <div className="tabular" style={{ fontSize: '9.5px', color: subtitleColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {subtitle}
                  </div>
                </div>

                {/* Direct Action Controls: Exclude, Remove, Restore & Priority Reorder */}
                {isExcluded ? (
                  <button
                    className="tactile-btn"
                    style={{ height: '22px', fontSize: '9px', width: '100%' }}
                    onClick={() => {
                      playClick();
                      handleRestoreGame(game.name);
                      if (onRemoveFromExcluded) onRemoveFromExcluded(game.name);
                    }}
                  >
                    ↩ Восстановить из исключений
                  </button>
                ) : isRemoved ? (
                  <button
                    className="tactile-btn"
                    style={{ height: '22px', fontSize: '9px', width: '100%' }}
                    onClick={() => {
                      playClick();
                      handleRestoreGame(game.name);
                    }}
                  >
                    ↩ Восстановить
                  </button>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '20px' }}>
                    {/* Priority Queue Reorder Rockers */}
                    {isInPriority && onReorderPriority ? (
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <button
                          className="node-chip"
                          style={{ height: '18px', padding: '0 5px', fontSize: '10px', fontWeight: 700 }}
                          title="Повысить приоритет (переместить выше в очереди)"
                          disabled={priorityIndex === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            playClick();
                            onReorderPriority(game.name, 'up');
                          }}
                        >
                          ▲
                        </button>
                        <button
                          className="node-chip"
                          style={{ height: '18px', padding: '0 5px', fontSize: '10px', fontWeight: 700 }}
                          title="Понизить приоритет (переместить ниже в очереди)"
                          disabled={priorityIndex === priorityList.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            playClick();
                            onReorderPriority(game.name, 'down');
                          }}
                        >
                          ▼
                        </button>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>#{priorityIndex + 1}</span>
                      </div>
                    ) : <div />}

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {game.is_installed && (
                        <button
                          className="node-chip"
                          style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                          title="Удалить из списка установленных"
                          onClick={(e) => {
                            e.stopPropagation();
                            playClick();
                            handleRemoveInstalled(game.name);
                          }}
                        >
                          <Trash2 style={{ width: '10px', height: '10px' }} />
                        </button>
                      )}
                      <button
                        className="node-chip"
                        style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                        title="Скрыть / в исключения"
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          const gameName = game.name;
                          onAddToExcluded(gameName);
                        }}
                      >
                        🚫 Исключить
                      </button>
                    </div>
                  </div>
                )}

                {/* 3-Position Rocker Switch (.rocker-3p): IDLE (СТАНДАРТ) / QUEUE (ОЧЕРЕДЬ) / FORCE #1 (СЕЙЧАС #1) */}
                <div className="rocker-3p" data-mode={isForced ? "FORCE #1" : isInPriority ? "QUEUE" : "IDLE"}>
                  <span 
                    className={`r-step ${!isInPriority && !isForced ? 'idle' : ''}`}
                    data-state="IDLE"
                    onClick={() => {
                      playClick();
                      if (isForced && onCancelForceFarm) onCancelForceFarm();
                      if (isInPriority) onRemoveFromPriority(game.name);
                    }}
                    title="Стандартный сбор: фармить по очереди общего каталога без приоритета"
                  >
                    СТАНДАРТ
                  </span>
                  <span 
                    className={`r-step ${isInPriority && !isForced ? 'queue' : ''} ${isExcluded || isRemoved ? 'opacity-40 cursor-not-allowed' : ''}`}
                    data-state="QUEUE"
                    onClick={() => {
                      playClick();
                      if (isExcluded || isRemoved) {
                        if (onShowToast) onShowToast(isExcluded ? 'В исключениях (нельзя в очередь)' : 'В удалённых (нельзя в очередь)');
                        return;
                      }
                      if (isForced && onCancelForceFarm) onCancelForceFarm();
                      if (!isInPriority) onAddToPriority(game.name);
                    }}
                    title={isExcluded ? 'В исключениях (нельзя в очередь)' : isRemoved ? 'В удалённых (нельзя в очередь)' : 'Приоритетная очередь: фармить раньше обычных игр'}
                  >
                    ОЧЕРЕДЬ
                  </span>
                  <span 
                    className={`r-step ${isForced ? 'force' : ''} ${isExcluded || isRemoved ? 'opacity-40 cursor-not-allowed' : ''}`}
                    data-state="FORCE #1"
                    onClick={() => {
                      playClick();
                      if (isExcluded || isRemoved) {
                        if (onShowToast) onShowToast(isExcluded ? 'В исключениях (нельзя в очередь)' : 'В удалённых (нельзя в очередь)');
                        return;
                      }
                      if (isForced) {
                        if (onCancelForceFarm) onCancelForceFarm();
                      } else {
                        if (onForceFarm) onForceFarm(game.name);
                      }
                    }}
                    title={isExcluded ? 'В исключениях (нельзя в очередь)' : isRemoved ? 'В удалённых (нельзя в очередь)' : isForced ? 'Нажмите для отмены принудительного фарма' : 'Фармить прямо сейчас: наивысший приоритет #1'}
                  >
                    СЕЙЧАС #1
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
