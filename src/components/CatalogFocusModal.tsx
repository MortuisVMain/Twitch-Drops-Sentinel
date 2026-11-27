import { HardDrive, Plus, Search, Star, X, Zap } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameItem } from '../types';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { useModalFocus } from '../hooks/useModalFocus';
import { resolveGameBoxArt, isBlankCover, isSteamArt, retryCover } from '../utils/gameBoxArts';

// The dashboard's "pick a game to focus" catalog dialog, split out of LiveDashboard.tsx without behavior change.
// It stays mounted while closed so the search and the filter survive closing and reopening, as before.
export interface CatalogFocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  allGames: GameItem[];
  priorityList: string[];
  forcedGame?: string | null;
  forcedLabel?: string | null;
  onAddToPriority?: (gameName: string) => void;
  onRemoveFromPriority?: (gameName: string) => void;
  onForceFarm?: (gameName: string) => void;
  onCancelForceFarm?: () => void;
}

const safeLower = (val: any): string => {
  return typeof val === 'string' ? val.toLowerCase().trim() : '';
};

export const CatalogFocusModal: React.FC<CatalogFocusModalProps> = ({
  isOpen, onClose, allGames, priorityList, forcedGame, forcedLabel,
  onAddToPriority, onRemoveFromPriority, onForceFarm, onCancelForceFarm,
}) => {
  const { playClick } = useTactileAudio();
  const catalogDialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(isOpen, catalogDialogRef, onClose, 'input');
  const [catalogModalSearch, setCatalogModalSearch] = useState('');
  const [catalogModalTab, setCatalogModalTab] = useState<'ALL' | 'TOP' | 'INSTALLED'>('ALL');
  const activeTwitchDropsGames = useMemo(() => allGames.filter(g => g.has_drops && g.is_active_now), [allGames]);
  const topPriorityCount = activeTwitchDropsGames.filter((game) =>
    priorityList.some((name) => safeLower(name) === safeLower(game.name))
  ).length;
  const installedActiveCount = activeTwitchDropsGames.filter((game) => game.is_installed).length;
  const forceCandidates = useMemo(() => allGames.filter((g) => g.has_drops || g.is_installed), [allGames]);

  const modalFilteredGames = useMemo(() => forceCandidates.filter((game) => {
    if (catalogModalSearch.trim() && !safeLower(game.name).includes(safeLower(catalogModalSearch))) return false;
    if (catalogModalTab === 'TOP' && !priorityList.some((name) => safeLower(name) === safeLower(game.name))) return false;
    if (catalogModalTab === 'INSTALLED' && !game.is_installed) return false;
    return true;
  }), [forceCandidates, catalogModalSearch, catalogModalTab, priorityList]);

  if (!isOpen) return null;
  // Out of .main-stage's stacking context so the header cannot paint over the dialog
  return createPortal(
    <div 
      className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
      onClick={() => { playClick(); onClose(); }}
    >
      <div 
        ref={catalogDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
        tabIndex={-1}
        className="w-full max-w-2xl bg-[var(--bg-island)] border border-[var(--border-main)] rounded-2xl shadow-2xl p-5 space-y-3.5 max-h-[85vh] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--border-subtle)'
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="led-dot amber" />
            <div>
              <h3 id="catalog-title" className="text-sm font-bold tracking-[0.04em] text-[var(--text-primary)]">
                <Zap className="ui-icon" aria-hidden="true" focusable="false" /> ВЫБОР ИГРЫ ДЛЯ РУЧНОГО ФОКУСА • Каталог игр Twitch & Steam
              </h3>
              <div className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                Все действующие кампании Twitch Drops ({activeTwitchDropsGames.length} игр в эфире)
              </div>
            </div>
          </div>
          <button 
            aria-label="Закрыть"
            className="tactile-btn" 
            style={{ height: '26px', width: '26px', padding: 0 }} 
            onClick={() => { playClick(); onClose(); }}
          >
            <X className="ui-icon" aria-hidden="true" focusable="false" />
          </button>
        </div>

        {/* Currently Forced Game Alert */}
        {forcedGame && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="led-dot amber animate-pulse" />
              <span className="text-[var(--text-secondary)]">
                Сейчас принудительно фармится: <strong className="text-amber-400">{forcedLabel}</strong>
              </span>
            </div>
            <button
              className="tactile-btn active-amber"
              style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
              onClick={() => {
                playClick();
                onCancelForceFarm?.();
              }}
            >
              <X className="ui-icon" aria-hidden="true" focusable="false" /> Сбросить в авто
            </button>
          </div>
        )}

        {/* Search Input and Filter Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" focusable="false" />
            <input
              type="text"
              placeholder="Поиск по названию игры (например, Rust, Witcher, PoE, Cyberpunk)..."
              value={catalogModalSearch}
              onChange={(e) => setCatalogModalSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-[var(--bg-well)] border border-[var(--border-main)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--led-mint)]"
            />
            {catalogModalSearch && (
              <button 
                onClick={() => setCatalogModalSearch('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-6 text-[var(--text-muted)] hover:text-white"
              >
                <X className="ui-icon" aria-hidden="true" focusable="false" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={`tactile-btn ${catalogModalTab === 'ALL' ? 'active-mint' : ''}`}
              style={{ fontSize: 'var(--fs-xs)', padding: '0 10px' }}
              onClick={() => { playClick(); setCatalogModalTab('ALL'); }}
            >
              Все ({activeTwitchDropsGames.length})
            </button>
            <button
              className={`tactile-btn ${catalogModalTab === 'TOP' ? 'active-mint' : ''}`}
              style={{ fontSize: 'var(--fs-xs)', padding: '0 10px' }}
              onClick={() => { playClick(); setCatalogModalTab('TOP'); }}
            >
              <Star className="ui-icon" aria-hidden="true" focusable="false" /> Очередь ({topPriorityCount})
            </button>
            <button
              className={`tactile-btn ${catalogModalTab === 'INSTALLED' ? 'active-mint' : ''}`}
              style={{ fontSize: 'var(--fs-xs)', padding: '0 10px' }}
              onClick={() => { playClick(); setCatalogModalTab('INSTALLED'); }}
            >
              <HardDrive className="ui-icon" aria-hidden="true" focusable="false" /> На ПК ({installedActiveCount})
            </button>
          </div>
        </div>

        {/* Scrollable Games List */}
        <div className="obsidian-well p-2 flex-1 overflow-y-auto space-y-1.5 min-h-[260px]">
          {modalFilteredGames.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)] text-xs space-y-1.5">
              <p>Игры с таким названием не найдены среди активных кампаний.</p>
              <p className="text-[length:var(--fs-xs)]">Попробуйте изменить поисковый запрос или переключить фильтр.</p>
            </div>
          ) : (
            modalFilteredGames.map((g) => {
              const isForced = forcedGame === g.name;
              const isTop = priorityList.some((p) => typeof p === 'string' && safeLower(p) === safeLower(g.name));
              const boxArtUrl = resolveGameBoxArt(g.name, g.box_art);
              return (
                <div 
                  key={g.name}
                  className={`flex items-center justify-between p-2 rounded-xl transition-all border ${
                    isForced 
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' 
                      : 'bg-black/20 hover:bg-white/[0.04] border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={boxArtUrl}
                      alt={g.name}
                      className="w-9 h-12 object-cover rounded-md border border-white/10 shrink-0 bg-[var(--bg-chassis-base)]"
                      crossOrigin={isSteamArt(boxArtUrl) ? 'anonymous' : undefined}
                      onLoad={(e) => { const img = e.currentTarget; if (isBlankCover(img) && !retryCover(img, g.name)) img.style.display = 'none'; }}
                      onError={(e) => { const img = e.currentTarget; if (!retryCover(img, g.name)) img.style.display = 'none'; }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {g.name}
                        </span>
                        {isTop && (
                          <span className="px-1.5 py-0.5 rounded text-[length:var(--fs-xs)] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            <Star className="ui-icon" aria-hidden="true" focusable="false" /> Очередь
                          </span>
                        )}
                        {g.is_installed && (
                          <span className="px-1.5 py-0.5 rounded text-[length:var(--fs-xs)] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                            <HardDrive className="ui-icon" aria-hidden="true" focusable="false" /> УСТАНОВЛЕНА
                          </span>
                        )}
                      </div>
                      <div className="text-[length:var(--fs-xs)] text-[var(--text-muted)] truncate mt-0.5">
                        {g.category || 'Активная кампания Twitch Drops'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <button
                      className={`tactile-btn ${isTop ? 'active-amber' : ''}`}
                      style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
                      onClick={() => {
                        playClick();
                        if (isTop) {
                          onRemoveFromPriority?.(g.name);
                        } else {
                          onAddToPriority?.(g.name);
                        }
                      }}
                      title={isTop ? 'Удалить из приоритетной очереди' : 'Добавить в очередь'}
                    >
                      {isTop ? <Star className="ui-icon" aria-hidden="true" focusable="false" /> : <Plus className="ui-icon" aria-hidden="true" focusable="false" />} {isTop ? 'В очереди' : 'В ОЧЕРЕДЬ'}
                    </button>
                    <button 
                      className={`tactile-btn ${isForced ? 'active-amber' : 'active-mint'}`}
                      style={{ minHeight: '24px', fontSize: 'var(--fs-xs)', padding: '0 10px' }}
                      onClick={() => {
                        playClick();
                        if (isForced) {
                          onCancelForceFarm?.();
                        } else {
                          onForceFarm?.(g.name);
                          onClose();
                        }
                      }}
                    >
                      {isForced ? <X className="ui-icon" aria-hidden="true" focusable="false" /> : <Zap className="ui-icon" aria-hidden="true" focusable="false" />} {isForced ? 'Отмена' : 'Фармить сейчас'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between text-[length:var(--fs-xs)] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)] shrink-0">
          <span>Показано: {modalFilteredGames.length} из {forceCandidates.length} игр</span>
          <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">
            Фокус переключает бота на выбранную игру вне очереди
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
