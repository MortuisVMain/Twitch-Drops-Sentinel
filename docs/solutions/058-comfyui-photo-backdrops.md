# 058. ComfyUI photo backdrops recoloured per theme

## Problem
The procedural Canvas2D backdrops look flat next to photoreal renders. ComfyUI frames look far better, but a fixed image
has one palette, and Sentinel has many themes.

## Solution
`src/components/PhotoBackdrop.tsx` draws one WebGL2 shader over a ComfyUI frame:
- **Theme recolour.** Pixels with low chroma are tinted towards `--bg-chassis-base`. Saturated (glowing) pixels map to
  `--led-mint`, and their brightest cores map to `--led-mint-core`. Light themes are detected by the luminance of the
  background (above 0.5), not by theme id, so new themes work without code changes.
- **Motion.** Emissive pulse, per-cell sparkle, cheap bloom from mip level 5 of the texture, a diagonal light sweep,
  mouse light and a slow drift. `prefers-reduced-motion` freezes time and redraws only when the light moves.
- **GPU lifecycle.** Each frame gets its own canvas (`key={photoId}`). On unmount the texture and program are deleted
  and `WEBGL_lose_context` frees the context right away. Without that, Chrome's limit of about 16 contexts is reached
  after a dozen switches. Context loss and restore are handled.

## Assets
- Frames: `public/backdrops/<id>.webp` (2560 px, 4x-UltraSharp) and thumbnails in `public/backdrops/s/` (640 px).
- Vite copies `public/` into `dist/`, and the WebView2 shell serves `dist/` through the `app.sentinel` virtual host,
  so the frames are not inlined into the singlefile `index.html`.
- On the embedded-resource fallback (`NavigateToString`) the images cannot load. The component logs the error and
  draws nothing.

## Gotchas
- The child component's effect runs before `App` sets `data-theme` on `<html>`, so theme tokens are read on the next
  animation frame.
- Photos are much brighter than the procedural backdrops, so their opacity is the brightness slider times 0.8.
- `tools/build_ui_harness.mjs` now copies `dist/` subfolders recursively (it used `copyFileSync` before).

## Motion modes (v3.5.3)
A still frame can only glow, so each backdrop now has its own motion mode (`mode` and `c` in `PHOTO_BACKDROPS`,
uniforms `uMode`/`uC`): a light wave across hex seams, heat rings and embers from the lava core, satellites on inclined
orbits around the globe, a rotating radar beam, an equalizer on the spectrum, rising bubbles, water ripple (UV
displacement) on caustics, silk and chrome, flowing light along the wave, drifting fog between the ridges, pulses along
the grid lines and a highlight running around the glass ring. Centres and sizes were measured on the 640 px thumbnails
with a coordinate grid. White-hot cores count as emissive when their blurred surroundings are coloured, otherwise they
never animate. Cost at 1080p on an RTX 5070 Ti: 0.11-0.22 ms per frame.
Tune with a stand page that renders one backdrop at a given time and compare frames 1 s apart; thumbnails hide motion,
judge on full-size frames.

## Light themes (v3.5.4)
Dark frames recolored for a light page washed out for three reasons: shadows stayed within 20 % of the page color, every
light effect (bloom, sweep, mouse) added white, and CSS opacity blended the canvas with the light page. Now the
luminance is stretched into real shadows (`uBg*(.6 + .45*Ln)`), white-hot cores become the strongest accent ink, motion
fades ink toward the page instead of brightening it, additive light is off, and `--photo-opacity` is 1 on light themes.
Classic backdrops are drawn for dark pages, so on light themes they get a CSS filter: invert, hue-rotate 180, then
brightness before contrast (the other order bleaches pale patterns away).
