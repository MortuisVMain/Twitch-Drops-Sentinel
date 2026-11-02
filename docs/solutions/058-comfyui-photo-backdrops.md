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
