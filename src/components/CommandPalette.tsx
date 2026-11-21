import { CornerDownLeft, Search, Target } from 'lucide-react';
import React from 'react';
import { useTactileAudio } from '../hooks/useTactileAudio';
import { clampPaletteIndex, defaultPaletteIndex, movePaletteIndex } from '../utils/paletteIndex';

// The Ctrl+K command palette, split out of App.tsx without behavior change: App builds the actions, this draws them,
// walks them with the arrows and runs the selected one.
export interface PaletteAction {
  id: string;
  key?: string;
  icon: React.ComponentType<any>;
  title: string;
  action: () => void;
}

export interface CommandPaletteProps {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  search: string;
  onSearchChange: (value: string) => void;
  cmdIndex: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  navActions: PaletteAction[];
  quickActions: PaletteAction[];
  matchingGames: Array<{ id?: string; name: string }>;
  onFocusGame: (game: { name: string }) => void;
}

const CMD_SELECTED_STYLE: React.CSSProperties = { background: 'var(--bg-row-hover)', boxShadow: 'inset 0 0 0 1px var(--led-mint)' };

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  dialogRef, search, onSearchChange, cmdIndex, onIndexChange, onClose, navActions, quickActions, matchingGames, onFocusGame,
}) => {
  const { playClick } = useTactileAudio();
  // The order the sections are drawn in: the arrows walk this list
  const results = [
    ...navActions.map(item => ({ title: item.title, run: item.action })),
    ...quickActions.map(item => ({ title: item.title, run: item.action })),
    ...matchingGames.map(game => ({ title: game.name, run: () => onFocusGame(game) })),
  ];
  const totalResults = results.length;
  const selectedIndex = cmdIndex === null ? defaultPaletteIndex(navActions.length) : clampPaletteIndex(cmdIndex, totalResults);
  const runResult = (index: number) => {
    const result = index >= 0 ? results[index] : undefined; // nothing selected: Enter does nothing
    if (!result) return;
    playClick();
    result.run();
    onClose();
  };
  const optionProps = (index: number) => ({
    'data-cmd-selected': index === selectedIndex,
    'aria-current': index === selectedIndex ? ('true' as const) : undefined,
    style: index === selectedIndex ? CMD_SELECTED_STYLE : undefined,
  });

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-150"
      onClick={() => onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Быстрые команды"
        tabIndex={-1}
        className="w-full max-w-xl outline-none bg-(--bg-chassis-base) border border-(--border-subtle) rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col max-h-[80vh] my-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 px-4 bg-(--bg-row) border-b border-(--border-subtle) flex items-center gap-2.5 shrink-0">
          <Search className="w-4 h-4 text-(--led-mint) shrink-0" aria-hidden="true" focusable="false" />
          <input 
            type="text" 
            placeholder="Поиск по играм, стримам и действиям... (Esc)" 
            className="w-full bg-transparent border-none text-xs md:text-sm text-(--text-primary) placeholder-[var(--text-muted)] font-medium"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                onIndexChange(movePaletteIndex(selectedIndex, e.key === 'ArrowDown' ? 1 : -1, totalResults));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (!e.repeat) runResult(selectedIndex);
              }
            }}
          />
          <kbd className="px-1.5 py-0.5 rounded bg-(--bg-well) border border-(--border-subtle) text-[length:var(--fs-xs)] tabular text-[var(--text-muted)] shrink-0 select-none">
            ESC
          </kbd>
        </div>

        <span className="sr-only" role="status" data-overflow-ok>{results[selectedIndex]?.title ?? ''}</span>
        <div className="p-2 overflow-y-auto space-y-2 scrollbar-thin flex-1 min-h-0">
          {navActions.length > 0 && (
            <div>
              <div className="text-[length:var(--fs-xs)] tabular font-bold text-[var(--text-muted)] uppercase tracking-[0.04em] px-2 py-0.5">
                Навигация
              </div>
              <div className="space-y-0.5">
                {navActions.map((item, i) => (
                  <button 
                    key={item.id}
                    className="w-full flex items-center justify-between p-2 px-2.5 rounded-lg hover:bg-(--bg-row-hover) text-left transition-colors cursor-pointer group"
                    {...optionProps(i)}
                    onClick={() => runResult(i)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 text-center text-xs shrink-0"><item.icon className="ui-icon" aria-hidden="true" focusable="false" /></span>
                      <span className="text-xs font-semibold text-(--text-primary) group-hover:text-(--led-mint) transition-colors truncate">
                        {item.title}
                      </span>
                    </div>
                    <span className="text-[length:var(--fs-xs)] tabular px-1.5 py-0.5 rounded bg-(--bg-well) border border-(--border-subtle) text-(--led-mint) font-bold shrink-0">
                      {item.key}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {quickActions.length > 0 && (
            <div>
              <div className="text-[length:var(--fs-xs)] tabular font-bold text-[var(--text-muted)] uppercase tracking-[0.04em] px-2 py-0.5 pt-1">
                Действия
              </div>
              <div className="space-y-0.5">
                {quickActions.map((item, i) => (
                  <button 
                    key={item.id}
                    className="w-full flex items-center justify-between p-2 px-2.5 rounded-lg hover:bg-(--bg-row-hover) text-left transition-colors cursor-pointer group"
                    {...optionProps(navActions.length + i)}
                    onClick={() => runResult(navActions.length + i)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 text-center text-xs shrink-0"><item.icon className="ui-icon" aria-hidden="true" focusable="false" /></span>
                      <span className="text-xs font-semibold text-(--text-primary) group-hover:text-(--led-mint) transition-colors truncate">
                        {item.title}
                      </span>
                    </div>
                    {item.key && (
                      <span className="text-[length:var(--fs-xs)] tabular px-1.5 py-0.5 rounded bg-(--bg-row) border border-(--border-subtle) text-[var(--text-muted)] shrink-0">
                        {item.key}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchingGames.length > 0 && (
            <div>
              <div className="text-[length:var(--fs-xs)] tabular font-bold text-(--led-mint) uppercase tracking-[0.04em] px-2 py-0.5 pt-1 flex items-center justify-between">
                <span>Игры в каталоге</span>
                <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Фокус <CornerDownLeft className="ui-icon" aria-hidden="true" focusable="false" /></span>
              </div>
              <div className="space-y-0.5">
                {matchingGames.map((game, i) => (
                  <button 
                    key={game.id}
                    className="w-full flex items-center justify-between p-2 px-2.5 rounded-lg hover:bg-(--led-mint)/20 text-left transition-colors cursor-pointer group border border-transparent hover:border-(--led-mint)/30"
                    {...optionProps(navActions.length + quickActions.length + i)}
                    onClick={() => runResult(navActions.length + quickActions.length + i)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 text-center text-xs shrink-0"><Target className="ui-icon" aria-hidden="true" focusable="false" /></span>
                      <span className="text-xs font-bold text-(--text-primary) group-hover:text-(--led-mint) transition-colors truncate">
                        {game.name}
                      </span>
                    </div>
                    <span className="text-[length:var(--fs-xs)] tabular px-1.5 py-0.5 rounded bg-(--led-mint)/20 text-(--led-mint) border border-(--led-mint)/30 font-bold shrink-0">
                      В ФОКУС <CornerDownLeft className="ui-icon" aria-hidden="true" focusable="false" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {totalResults === 0 && (
            <div className="p-6 text-center text-[var(--text-muted)] space-y-1">
              <p className="text-xs font-semibold text-(--text-primary)">Ничего не найдено по запросу «{search}»</p>
              <p className="text-[length:var(--fs-xs)]">Попробуйте ввести имя игры или название вкладки.</p>
            </div>
          )}
        </div>

        <div className="p-2.5 px-4 bg-(--bg-row) border-t border-(--border-subtle) flex items-center justify-between text-[length:var(--fs-xs)] text-[var(--text-muted)] shrink-0 select-none">
          <span title="Цифра открывает вкладку, если она не выключена в настройках"><kbd className="px-1.5 py-0.5 bg-(--bg-well) rounded border border-(--border-subtle) text-(--text-primary) tabular text-[length:var(--fs-xs)]">Цифры</kbd> Вкладки •<kbd className="px-1.5 py-0.5 bg-(--bg-well) rounded border border-(--border-subtle) text-(--text-primary) tabular text-[length:var(--fs-xs)]">Esc</kbd> Закрыть</span>
        </div>
      </div>
    </div>
  );
};
