import React, { useEffect, useState } from 'react';
import { photoBackdropUrl, readThemeColors, type ThemeColors } from './PhotoBackdrop';

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
    const hs = smooth(.55, 1, mx), pale = smooth(.6, .98, L) * .35;
    for (let k = 0; k < 3; k++) {
      let o: number;
      if (c.light) {
        const base = c.bg[k] * Math.min(1.1, Math.pow(L / .86, 1.6));
        o = base + (c.acc[k] + (c.bg[k] - c.acc[k]) * pale - base) * em;
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

/** Thumbnail of a photo backdrop in the colors of the active theme (light themes start from the light frame set). */
export const ThemedThumb: React.FC<{ id: string; themeId: string }> = ({ id, themeId }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // App sets data-theme on <html> after child effects run, so read the tokens a frame later
    const raf = requestAnimationFrame(() => {
      const c = readThemeColors();
      const src = photoBackdropUrl(id, true, c.light === 1);
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
  }, [id, themeId]);

  return url ? <img className="ap-thumb" src={url} alt="" /> : <span className="ap-thumb" />;
};
