import React, { useEffect, useState } from 'react';
import { readThemeColors, type ThemeColors } from './PhotoBackdrop';

/** Recolored thumbnails per source and theme, so switching tabs or themes back does not recompute them. */
const cache = new Map<string, string>();
const THUMB_W = 256;
/** dark themes: lift the recolored thumbnail so it reads on a dark card (the full backdrop has its own glow) */
const DARK_LIFT = 1.35;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The `tone()` rule of the backdrop shader on the CPU: neutrals tinted to the theme background, glow to the accent. */
function recolor(img: HTMLImageElement, c: ThemeColors): string {
  const w = THUMB_W, h = Math.round(THUMB_W * img.naturalHeight / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h), d = px.data;
  const mb = Math.max(c.bg[0], c.bg[1], c.bg[2], 1e-3);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const L = .2126 * r + .7152 * g + .0722 * b, mx = Math.max(r, g, b), em = smooth(.05, .3, mx - Math.min(r, g, b));
    const hs = smooth(.55, 1, mx), lightMix = em * smooth(.12, .55, mx);
    for (let k = 0; k < 3; k++) {
      let o: number;
      if (c.light) {
        const base = c.bg[k] * (.76 + .75 * L);
        o = base + (c.acc[k] * (.75 + .25 * mx) - base) * lightMix;
      } else {
        const hot = c.acc[k] + (c.acc2[k] + (1 - c.acc2[k]) * .55 - c.acc[k]) * hs;
        const base = c.bg[k] * .8 + L * (1 + (c.bg[k] / mb - 1) * .45);
        o = (base + (hot * mx * 1.15 - base) * em) * DARK_LIFT;
      }
      d[i + k] = Math.min(255, o * 255);
    }
  }
  ctx.putImageData(px, 0, 0);
  return canvas.toDataURL('image/webp', .85);
}

/** Thumbnail of a photo backdrop in the colors of the active theme. */
export const ThemedThumb: React.FC<{ src: string; themeId: string }> = ({ src, themeId }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // App sets data-theme on <html> after child effects run, so read the tokens a frame later
    const raf = requestAnimationFrame(() => {
      const c = readThemeColors();
      const key = `${src}|${c.bg}|${c.acc}|${c.acc2}|${c.light}`;
      const hit = cache.get(key);
      if (hit) { setUrl(hit); return; }
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        try {
          const out = recolor(img, c);
          cache.set(key, out);
          setUrl(out);
        } catch (err) {
          console.error(`ThemedThumb: recolor failed for ${src}:`, err);
          setUrl(src);
        }
      };
      img.onerror = () => console.error(`ThemedThumb: failed to load ${src}`);
      img.src = src;
    });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [src, themeId]);

  return <img className="ap-thumb" src={url || src} alt="" />;
};
