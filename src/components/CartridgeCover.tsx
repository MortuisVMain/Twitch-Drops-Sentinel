import React, { useEffect, useMemo, useState } from 'react';
import { resolveGameBoxArtSources, isBlankCover, isSteamArt, serverCoverFor } from '../utils/gameBoxArts';

const COVER_RETRY_MS = 5 * 60 * 1000;

// compact: a thumbnail-sized cover (the fallback drops its caption and shrinks the initials);
// decorative: the name is printed next to the cover, so the image gets an empty alt
export const CartridgeCover: React.FC<{ name: string; boxArt?: string; compact?: boolean; decorative?: boolean }> = ({ name, boxArt, compact = false, decorative = false }) => {
  const found = serverCoverFor(name); // arrives with a later poll: the list is rebuilt then
  const sources = useMemo(() => resolveGameBoxArtSources(name, [boxArt]), [name, boxArt, found]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentIdx(0);
    setFailed(false);
  }, [sources]);

  // A new game's Twitch art often appears hours after its campaign; the window stays open for days, so a failed
  // cover is tried again from the first source instead of showing initials until the next restart.
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => { setCurrentIdx(0); setFailed(false); }, COVER_RETRY_MS);
    return () => clearTimeout(timer);
  }, [failed]);

  const currentSrc = sources[currentIdx];
  const nextSource = () => {
    if (currentIdx + 1 < sources.length) setCurrentIdx(prev => prev + 1);
    else setFailed(true);
  };

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
          gap: compact ? 0 : '6px',
          fontFamily: 'var(--font-ui)',
          color: 'var(--led-mint)',
          letterSpacing: '0.04em',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: compact ? 'var(--fs-sm)' : 'var(--fs-xl)', fontWeight: 900, textShadow: compact ? undefined : '0 0 16px rgba(115, 187, 165, 0.35)' }}>
          {initials}
        </span>
        {!compact && (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            NO POSTER
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={decorative ? '' : name}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      loading="lazy"
      crossOrigin={isSteamArt(currentSrc) ? 'anonymous' : undefined}
      onLoad={(e) => { if (isBlankCover(e.currentTarget)) nextSource(); }}
      onError={nextSource}
    />
  );
};
