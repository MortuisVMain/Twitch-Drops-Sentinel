import React, { useEffect, useRef } from 'react';
import { VERT, FRAG } from './photoBackdropShader';

/** fx: [glow, sweep, drift, recolor]; fq: [sweep speed, parallax, sparkle, unused]; mode + c pick the motion in FRAG. */
export interface PhotoBackdropDef {
  id: string;
  name: string;
  sub: string;
  fx: [number, number, number, number];
  fq: [number, number, number, number];
  mode: number;
  c: [number, number, number, number];
}

/** ComfyUI frames in `public/backdrops/<id>.webp` (2560 px) with 640 px thumbnails in `public/backdrops/s/`. */
export const PHOTO_BACKDROPS: PhotoBackdropDef[] = [
  { id: 'hex2', name: 'Неоновые соты', sub: 'Призмы и неон в швах', fx: [1, 0.3, 0.5, 1], fq: [0.08, 1, 0.25, 0], mode: 1, c: [0, 0, 0, 0] },
  { id: 'hex1', name: 'Тёмные соты', sub: 'Плитки и мягкий отсвет', fx: [0.45, 0.7, 0.5, 1], fq: [0.14, 1, 0, 0], mode: 1, c: [0, 0, 0, 0] },
  { id: 'lava0', name: 'Лава', sub: 'Раскалённые трещины', fx: [1, 0.15, 0.5, 1], fq: [0.045, 1, 0.2, 0], mode: 2, c: [0.55, 0.6, 1, 0] },
  { id: 'metal2', name: 'Титан', sub: 'Шлифованный металл', fx: [0, 1.2, 0.4, 1], fq: [0.2, 1, 0, 0], mode: 3, c: [0, 0, 0, 0] },
  { id: 'globe', name: 'Глобус', sub: 'Земля из светящихся точек', fx: [0.8, 0.2, 0.3, 1], fq: [0.045, 1, 1, 0], mode: 5, c: [0.705, 0.5, 0.37, 0] },
  { id: 'silk', name: 'Шёлк', sub: 'Атлас со складками', fx: [0.3, 1.1, 0.6, 1], fq: [0.15, 1, 0, 0], mode: 4, c: [0, 0, 0, 0] },
  { id: 'ridges', name: 'Хребты', sub: 'Горы в тумане', fx: [0.4, 0.6, 0.5, 1], fq: [0.06, 1.5, 0, 0], mode: 14, c: [0, 0, 0, 0] },
  { id: 'lavai', name: 'Разломы', sub: 'Плиты и светящиеся трещины', fx: [1, 0.2, 0.5, 1], fq: [0.045, 1, 0.3, 0], mode: 2, c: [0, 0, 0, 0] },
  { id: 'hexi', name: 'Соты-сетка', sub: 'Металлические шестигранники', fx: [0.9, 0.6, 0.5, 1], fq: [0.12, 1, 0, 0], mode: 1, c: [1, 0, 0, 0] },
  { id: 'caustics', name: 'Каустика', sub: 'Нити света с узлами', fx: [1, 0.2, 0.4, 1], fq: [0.045, 1, 0.4, 0], mode: 6, c: [0, 0, 0, 0] },
  { id: 'wave', name: 'Волна', sub: 'Лента светящихся нитей', fx: [1, 0.2, 0.4, 1], fq: [0.045, 1, 0.2, 0], mode: 7, c: [0, 0, 0, 0] },
  { id: 'drops', name: 'Пузыри', sub: 'Сферы и боке', fx: [0.8, 0.1, 0.6, 1], fq: [0.045, 1.5, 0.6, 0], mode: 8, c: [0, 0, 0, 0] },
  { id: 'signal', name: 'Эфир', sub: 'Спектр над горизонтом', fx: [0.8, 0.2, 0.3, 1], fq: [0.045, 1, 0.2, 0], mode: 9, c: [0.04, 0.28, 0.34, 0.97] },
  { id: 'radar', name: 'Дозор', sub: 'Радар с лучом', fx: [0.7, 0.2, 0.3, 1], fq: [0.045, 1, 0.4, 0], mode: 10, c: [0.73, 0.33, 1.05, 0] },
  { id: 'beams', name: 'Магистрали', sub: 'Сетка со вспышками', fx: [0.9, 0.1, 0.3, 1], fq: [0.045, 1, 0.6, 0], mode: 11, c: [0, 0, 0, 0] },
  { id: 'glass', name: 'Стекло', sub: 'Кольцо и диагональный свет', fx: [0.7, 0.9, 0.4, 1], fq: [0.15, 1, 0, 0], mode: 12, c: [0.67, 0.47, 0.12, 0] },
  { id: 'chrome', name: 'Ртуть', sub: 'Хромовые сферы', fx: [0.6, 1, 0.5, 1], fq: [0.2, 1.2, 0.3, 0], mode: 13, c: [0, 0, 0, 0] },
];

export const photoBackdropUrl = (id: string, thumb = false) => `backdrops/${thumb ? 's/' : ''}${id}.webp`;



type Rgb = [number, number, number];
export interface ThemeColors { bg: Rgb; acc: Rgb; acc2: Rgb; light: number }

function cssRgb(name: string, fallback: Rgb): Rgb {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const fn = raw.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (fn) return [+fn[1] / 255, +fn[2] / 255, +fn[3] / 255];
  console.warn(`PhotoBackdrop: cannot parse ${name}="${raw}", using fallback`);
  return fallback;
}

export function readThemeColors(): ThemeColors {
  const bg = cssRgb('--bg-chassis-base', [.03, .04, .055]);
  const luma = .2126 * bg[0] + .7152 * bg[1] + .0722 * bg[2];
  return { bg, acc: cssRgb('--led-mint', [.23, .82, .62]), acc2: cssRgb('--led-mint-core', [.89, 1, .96]), light: luma > .5 ? 1 : 0 };
}

interface Gpu {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
  tex: WebGLTexture;
  texW: number;
  texH: number;
}

function createGpu(canvas: HTMLCanvasElement, img: HTMLImageElement): Gpu | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
  const u: Gpu['u'] = {};
  for (const n of ['uRes', 'uTime', 'uMouse', 'uBg', 'uAcc', 'uAcc2', 'uLight', 'uTex', 'uTexRes', 'uP', 'uQ', 'uMode', 'uC']) u[n] = gl.getUniformLocation(prog, n);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { gl, prog, u, tex, texW: img.naturalWidth, texH: img.naturalHeight };
}

function disposeGpu(g: Gpu) {
  if (g.gl.isContextLost()) return;
  g.gl.deleteTexture(g.tex);
  g.gl.deleteProgram(g.prog);
  g.gl.getExtension('WEBGL_lose_context')?.loseContext();
}

const FRAME_MS = 33;

export interface RunOptions {
  imageUrl: string;
  /** follow the mouse over the whole window (backdrop) or keep the slow automatic light path (card preview) */
  trackMouse: boolean;
  maxDpr: number;
}

/** Draw one photo backdrop into `canvas` until the returned cleanup runs; the cleanup frees its GPU context. */
export function runPhotoBackdrop(canvas: HTMLCanvasElement, def: PhotoBackdropDef, colorsRef: { current: ThemeColors | null },
  dirtyRef: { current: boolean }, opts: RunOptions): () => void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let gpu: Gpu | null = null;
  let raf = 0, last = 0, time = 14, autoT = 0, disposed = false;
  let mx = .62, my = .58, tx = .62, ty = .58, hover = false;

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; dirtyRef.current = true; }
  };

  const draw = (): boolean => {
    if (!gpu || !colorsRef.current) return false;
    const { gl, u } = gpu, c = colorsRef.current;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(gpu.prog);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uMouse, mx * canvas.width, my * canvas.height);
    gl.uniform3fv(u.uBg, c.bg); gl.uniform3fv(u.uAcc, c.acc); gl.uniform3fv(u.uAcc2, c.acc2);
    gl.uniform1f(u.uLight, c.light);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gpu.tex);
    gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexRes, gpu.texW, gpu.texH);
    gl.uniform4fv(u.uP, def.fx); gl.uniform4fv(u.uQ, def.fq);
    gl.uniform1i(u.uMode, def.mode); gl.uniform4fv(u.uC, def.c);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  };

  const loop = (ts: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || ts - last < FRAME_MS) return;
    const dt = last ? Math.min(.1, (ts - last) / 1000) : 0;
    last = ts;
    const moving = !reduce.matches;
    if (moving) {
      time += dt;
      if (!hover) { autoT += dt; tx = .5 + .3 * Math.cos(autoT * .13); ty = .55 + .2 * Math.sin(autoT * .19); }
    }
    const k = 1 - Math.pow(.88, dt * 30), ox = mx, oy = my;
    mx += (tx - mx) * k; my += (ty - my) * k;
    const lightMoved = Math.abs(mx - ox) + Math.abs(my - oy) > 1e-4;
    if (!moving && !lightMoved && !dirtyRef.current) return;
    fit();
    if (draw()) dirtyRef.current = false;
  };

  const onMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width; ty = 1 - (e.clientY - r.top) / r.height; hover = true;
  };
  const onLeave = () => { hover = false; };

  const start = (img: HTMLImageElement) => {
    try {
      gpu = createGpu(canvas, img);
      if (!gpu) { console.error('PhotoBackdrop: WebGL2 is unavailable, backdrop disabled'); return; }
    } catch (err) {
      console.error(`PhotoBackdrop: GPU setup failed for "${def.id}":`, err);
      return;
    }
    dirtyRef.current = true;
    raf = requestAnimationFrame(loop);
  };

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => { if (!disposed) start(img); };
  img.onerror = () => console.error(`PhotoBackdrop: failed to load ${img.src}`);
  img.src = opts.imageUrl;

  const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); gpu = null; console.warn('PhotoBackdrop: WebGL context lost'); };
  const onRestored = () => { if (!disposed && img.complete) start(img); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  if (opts.trackMouse) {
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    img.onload = null;
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    window.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseleave', onLeave);
    if (gpu) disposeGpu(gpu);
  };
}

/** Theme tokens for the shader. Child effects run before App sets data-theme on <html>, so they are read a frame later. */
export function useThemeColors(themeId: string, dirtyRef: { current: boolean }) {
  const colorsRef = useRef<ThemeColors | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => { colorsRef.current = readThemeColors(); dirtyRef.current = true; });
    return () => cancelAnimationFrame(id);
  }, [themeId, dirtyRef]);
  return colorsRef;
}

export interface PhotoBackdropProps {
  /** id from PHOTO_BACKDROPS, or null when another backdrop is active (renders nothing, holds no GPU memory). */
  photoId: string | null;
  themeId: string;
  opacity: number;
}

export const PhotoBackdrop: React.FC<PhotoBackdropProps> = ({ photoId, themeId, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dirtyRef = useRef(true);
  const colorsRef = useThemeColors(themeId, dirtyRef);

  useEffect(() => {
    const def = PHOTO_BACKDROPS.find(p => p.id === photoId);
    if (!def || !canvasRef.current) return;
    return runPhotoBackdrop(canvasRef.current, def, colorsRef, dirtyRef, { imageUrl: photoBackdropUrl(def.id), trackMouse: true, maxDpr: 1.5 });
  }, [photoId, colorsRef]);

  if (!photoId) return null;
  return (
    <canvas
      ref={canvasRef}
      key={photoId}
      className="relief-canvas"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, opacity: `calc(var(--photo-opacity) * ${opacity})` }}
      aria-hidden="true"
    />
  );
};

/** Live preview of one photo backdrop at card size; mounted only while its card is hovered. */
export const PhotoPreview: React.FC<{ photoId: string; themeId: string }> = ({ photoId, themeId }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dirtyRef = useRef(true);
  const colorsRef = useThemeColors(themeId, dirtyRef);

  useEffect(() => {
    const def = PHOTO_BACKDROPS.find(p => p.id === photoId);
    if (!def || !canvasRef.current) return;
    return runPhotoBackdrop(canvasRef.current, def, colorsRef, dirtyRef, { imageUrl: photoBackdropUrl(def.id, true), trackMouse: false, maxDpr: 1 });
  }, [photoId, colorsRef]);

  return <canvas ref={canvasRef} className="ap-live" aria-hidden="true" />;
};
