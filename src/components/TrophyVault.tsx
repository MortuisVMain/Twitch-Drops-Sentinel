import React, { useState, useMemo } from 'react';
import { Trophy, Award, Search, Sparkles, ExternalLink, Gift, CheckCircle2, ArrowLeft } from 'lucide-react';
import { TrophyItem } from '../types';
import { resolveGameBoxArtSources } from '../utils/gameBoxArts';

interface TrophyVaultProps {
  trophies: TrophyItem[];
  onOpenVaultFile?: () => void;
  onBack?: () => void;
}

const TrophyItemPoster: React.FC<{ name: string }> = ({ name }) => {
  const sources = useMemo(() => resolveGameBoxArtSources(name), [name]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  React.useEffect(() => {
    setCurrentIdx(0);
    setAllFailed(sources.length === 0);
  }, [sources]);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth <= 10 || img.currentSrc.includes('404_boxart')) {
      handleImgError();
    }
  };

  const handleImgError = () => {
    if (currentIdx + 1 < sources.length) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setAllFailed(true);
    }
  };

  const monogram = useMemo(() => {
    const tokens = name.split(/[\s:_-]+/).filter(Boolean);
    const lastTok = tokens[tokens.length - 1];
    const hasSeq = /^(\d+|II|III|IV|V|VI)$/i.test(lastTok) && tokens.length > 1;
    const wordTokens = hasSeq ? tokens.slice(0, -1) : tokens;
    const initials =
      wordTokens.length >= 2
        ? `${wordTokens[0][0]}${wordTokens[1][0]}`.toUpperCase()
        : (wordTokens[0]?.slice(0, 2) || 'GM').toUpperCase();
    return { initials, sequel: hasSeq ? lastTok.toUpperCase() : null };
  }, [name]);

  const currentSrc = sources[currentIdx];

  if (!currentSrc || allFailed) {
    return (
      <div className="w-12 h-16 shrink-0 rounded-lg bg-gradient-to-br from-[#1d2622] to-[#121816] flex flex-col items-center justify-center text-xs font-mono font-black text-[var(--accent)] border border-white/5 select-none shadow-sm">
        <span className="leading-tight tracking-wider">{monogram.initials}</span>
        {monogram.sequel && (
          <span className="text-[7px] font-sans px-1 py-[0.5px] bg-white/10 rounded text-white/80 leading-none mt-0.5">
            {monogram.sequel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-12 h-16 shrink-0 relative overflow-hidden rounded-lg border border-white/10 shadow-sm bg-[#121816]">
      <img
        key={currentSrc}
        src={currentSrc}
        alt={name}
        className="w-full h-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onLoad={handleImgLoad}
        onError={handleImgError}
      />
    </div>
  );
};

export const TrophyVault: React.FC<TrophyVaultProps> = ({ trophies, onOpenVaultFile, onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGame, setFilterGame] = useState<string>('all');

  // Unique games list
  const uniqueGames = ['all', ...Array.from(new Set(trophies.map((t) => t.game)))];

  const filteredTrophies = trophies.filter((item) => {
    const matchSearch =
      item.drop_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.game.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.campaign.toLowerCase().includes(searchQuery.toLowerCase());
    const matchGame = filterGame === 'all' || item.game === filterGame;
    return matchSearch && matchGame;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none pb-12 animate-in fade-in duration-300">
      {/* Top Banner (Luna 2.0 Obsidian Glass) */}
      <div className="card p-6 md:p-8 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
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
              <Trophy className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--foreground)]">Хранилище Трофеев</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#217C5E]/20 text-[var(--accent)] border border-[var(--accent)]/30 tabular-nums">
                  {trophies.length} получено
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Личный арсенал всех забранных скинов, ключей и лута с Twitch Drops
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={onOpenVaultFile}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-white/[0.06] border border-[var(--line)] text-[var(--foreground)] text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Открыть Trophies.md на диске"
            >
              <ExternalLink className="w-4 h-4 text-[var(--accent)]" />
              <span>Открыть журнал Trophies.md</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Поиск по скинам и играм..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl pl-10 pr-4 py-2 text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Game Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {uniqueGames.map((game) => (
            <button
              key={game}
              onClick={() => setFilterGame(game)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                filterGame === game
                  ? 'bg-gradient-to-r from-[#217C5E] to-[#3AD29F] text-[#050608] font-bold border border-[#7CE8C2]/40 shadow-sm'
                  : 'bg-[var(--surface)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {game === 'all' ? 'Все игры' : game}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Loot Cards */}
      {filteredTrophies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrophies.map((item) => (
            <div
              key={item.id}
              className="card p-4 md:p-5 flex flex-col justify-between group relative overflow-hidden transition-all hover:border-[var(--accent)]/50 hover:shadow-lg"
            >
              <div className="flex gap-3.5 items-start">
                <TrophyItemPoster name={item.game} />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-[var(--surface-elevated)] text-[var(--accent)] border border-[var(--line)] truncate max-w-[130px]"
                      title={item.game}
                    >
                      {item.game}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-[var(--accent)] bg-[#217C5E]/20 px-2 py-0.5 rounded-full border border-[var(--accent)]/30 font-semibold shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Получен</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 leading-snug">
                      <Gift className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span className="truncate" title={item.drop_name}>
                        {item.drop_name}
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1" title={item.campaign}>
                      {item.campaign}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span className="font-mono tabular-nums">{item.date}</span>
                <span className="flex items-center gap-1 text-[var(--accent)] font-semibold">
                  <Sparkles className="w-3.5 h-3.5" /> В инвентаре
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-14 flex flex-col items-center justify-center text-center">
          <Award className="w-12 h-12 text-[var(--muted)] mb-3" />
          <h4 className="text-sm md:text-base font-bold text-[var(--foreground)]">Трофеи не найдены</h4>
          <p className="text-xs text-[var(--muted)] max-w-sm mt-1">
            Завершенные кампании Twitch Drops добавят забранные предметы прямо сюда и в файл Trophies.md
          </p>
        </div>
      )}
    </div>
  );
};
