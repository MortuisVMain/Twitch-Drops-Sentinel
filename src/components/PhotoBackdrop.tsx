import React, { useEffect, useRef } from 'react';

/** fx: [glow, sweep, drift, recolor]; fq: [unused, parallax, sparkle, unused] — shader knobs per frame. */
export interface PhotoBackdropDef {
  id: string;
  name: string;
  sub: string;
  fx: [number, number, number, number];
  fq: [number, number, number, number];
}

/** ComfyUI frames in `public/backdrops/<id>.webp` (2560 px) with 640 px thumbnails in `public/backdrops/s/`. */
export const PHOTO_BACKDROPS: PhotoBackdropDef[] = [
  { id: 'hex2', name: 'Неоновые соты', sub: 'Призмы и неон в швах', fx: [1, .3, .6, 1], fq: [0, 1, .25, 0] },
  { id: 'hex1', name: 'Тёмные соты', sub: 'Плитки и мягкий отсвет', fx: [.7, .6, .6, 1], fq: [0, 1, 0, 0] },
  { id: 'lava0', name: 'Лава', sub: 'Раскалённые трещины', fx: [1, .15, .5, 1], fq: [0, 1, .15, 0] },
  { id: 'metal2', name: 'Титан', sub: 'Шлифованный металл', fx: [0, .9, .4, 1], fq: [0, 1, 0, 0] },
  { id: 'globe', name: 'Глобус', sub: 'Земля из светящихся точек', fx: [.8, .2, .3, 1], fq: [0, 1, 1, 0] },
  { id: 'silk', name: 'Шёлк', sub: 'Атлас со складками', fx: [.3, 1, .7, 1], fq: [0, 1, 0, 0] },
  { id: 'ridges', name: 'Хребты', sub: 'Горы в тумане', fx: [.4, .5, .6, 1], fq: [0, 1.5, 0, 0] },
  { id: 'lavai', name: 'Разломы', sub: 'Плиты и светящиеся трещины', fx: [1, .2, .5, 1], fq: [0, 1, .3, 0] },
  { id: 'hexi', name: 'Соты-сетка', sub: 'Металлические шестигранники', fx: [.7, .5, .5, 1], fq: [0, 1, 0, 0] },
  { id: 'caustics', name: 'Каустика', sub: 'Нити света с узлами', fx: [1, .2, .5, 1], fq: [0, 1, .45, 0] },
  { id: 'wave', name: 'Волна', sub: 'Лента светящихся нитей', fx: [.9, .2, .5, 1], fq: [0, 1, .3, 0] },
  { id: 'drops', name: 'Пузыри', sub: 'Сферы и боке', fx: [.8, .1, .8, 1], fq: [0, 1.5, .7, 0] },
  { id: 'signal', name: 'Эфир', sub: 'Спектр над горизонтом', fx: [.8, .3, .4, 1], fq: [0, 1, .5, 0] },
  { id: 'radar', name: 'Дозор', sub: 'Радар с лучом', fx: [.7, .2, .3, 1], fq: [0, 1, .5, 0] },
  { id: 'beams', name: 'Магистрали', sub: 'Сетка со вспышками', fx: [.9, .1, .3, 1], fq: [0, 1, .8, 0] },
  { id: 'glass', name: 'Стекло', sub: 'Кольцо и диагональный свет', fx: [.7, .7, .4, 1], fq: [0, 1, 0, 0] },
  { id: 'chrome', name: 'Ртуть', sub: 'Хромовые сферы', fx: [.6, .8, .5, 1], fq: [0, 1.2, .4, 0] },
];

export const photoBackdropUrl = (id: string, thumb = false) => `backdrops/${thumb ? 's/' : ''}${id}.webp`;

const VERT = `#version 300 es
layout(location=0) in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

/* Cover-fit with slow drift, theme recolor (neutrals tinted to the background, saturated pixels mapped to the accent),
   emissive pulse and sparkle, cheap bloom from a high mip, light sweep and mouse light. */
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
uniform vec3 uBg; uniform vec3 uAcc; uniform vec3 uAcc2; uniform float uLight;
uniform sampler2D uTex; uniform vec2 uTexRes; uniform vec4 uP; uniform vec4 uQ;
out vec4 outColor;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float chroma(vec3 c){ return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 tone(vec3 s, vec3 bgHue){
  float L = dot(s, vec3(.2126, .7152, .0722)), mx = max(s.r, max(s.g, s.b));
  float em = smoothstep(.05, .3, chroma(s));
  vec3 hot = mix(uAcc, mix(uAcc2, vec3(1.), .55), smoothstep(.55, 1., mx));
  vec3 dark = mix(uBg*.8 + L*mix(vec3(1.), bgHue, .45), hot*mx*1.15, em);
  vec3 lite = mix(uBg*(.76 + .75*L), uAcc*mix(.75, 1., mx), em*smoothstep(.12, .55, mx));
  return mix(dark, lite, uLight);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes, m = uMouse/uRes;
  float ca = uRes.x/uRes.y, ta = uTexRes.x/uTexRes.y;
  vec2 sc = ca > ta ? vec2(1., ta/ca) : vec2(ca/ta, 1.);
  float z = 1.05 + .025*uP.z*(1. + sin(uTime*.045));
  vec2 tuv = (uv - .5)*sc/z + .5 + uP.z*vec2(sin(uTime*.031), cos(uTime*.023))*.01 + (m - .5)*.016*uQ.y;
  vec3 src = texture(uTex, tuv).rgb, blr = textureLod(uTex, tuv, 5.).rgb;
  vec3 bgHue = uBg/max(max(uBg.r, max(uBg.g, uBg.b)), 1e-3);
  float L = dot(src, vec3(.2126, .7152, .0722)), em = smoothstep(.05, .3, chroma(src));
  vec3 c = mix(src, tone(src, bgHue), uP.w);
  float pulse = .55 + .9*noise(tuv*vec2(5., 3.) + uTime*vec2(.09, -.05));
  float h = hash(floor(tuv*uTexRes/4.));
  float spark = .5 + .5*sin(uTime*(.8 + 2.5*h) + h*40.);
  c += c*em*(mix(1., pulse, uP.x)*mix(1., .4 + 1.2*spark, uQ.z) - 1.);
  c += mix(blr, tone(blr, bgHue), uP.w)*smoothstep(.04, .25, chroma(blr))*.55*uP.x*pulse*(1. - uLight*.7);
  float sw = mod(uTime*.045, 1.8) - .4;
  float band = exp(-pow((uv.x*.8 + uv.y*.35 - sw)*7., 2.));
  c += band*uP.y*pow(L, 1.3)*mix(vec3(1.), uAcc, .25)*.9*(1. - uLight*.6);
  float d = length((uv - m)*vec2(ca, 1.));
  c += exp(-d*d*5.)*(pow(L, 1.2)*.35 + c*em*.6)*(1. - uLight*.6);
  vec2 q = uv - .5;
  c *= mix(1. - dot(q, q)*.9, 1., uLight*.7);
  c += (hash(gl_FragCoord.xy + fract(uTime*7.)) - .5)/255.;
  outColor = vec4(c, 1.);
}`;

type Rgb = [number, number, number];
interface ThemeColors { bg: Rgb; acc: Rgb; acc2: Rgb; light: number }

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

function readThemeColors(): ThemeColors {
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
  for (const n of ['uRes', 'uTime', 'uMouse', 'uBg', 'uAcc', 'uAcc2', 'uLight', 'uTex', 'uTexRes', 'uP', 'uQ']) u[n] = gl.getUniformLocation(prog, n);
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

export interface PhotoBackdropProps {
  /** id from PHOTO_BACKDROPS, or null when another backdrop is active (renders nothing, holds no GPU memory). */
  photoId: string | null;
  themeId: string;
  opacity: number;
}

const FRAME_MS = 33;
/** Photos are far brighter than the procedural backdrops; scale the user's brightness slider so panels stay readable. */
const PHOTO_OPACITY = .8;

export const PhotoBackdrop: React.FC<PhotoBackdropProps> = ({ photoId, themeId, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<ThemeColors | null>(null);
  const dirtyRef = useRef(true);

  // Child effects run before App sets data-theme on <html>, so read the new tokens on the next frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => { colorsRef.current = readThemeColors(); dirtyRef.current = true; });
    return () => cancelAnimationFrame(id);
  }, [themeId]);

  useEffect(() => {
    const def = PHOTO_BACKDROPS.find(p => p.id === photoId);
    const canvas = canvasRef.current;
    if (!def || !canvas) return;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let gpu: Gpu | null = null;
    let raf = 0, last = 0, time = 14, autoT = 0, disposed = false;
    let mx = .62, my = .58, tx = .62, ty = .58, hover = false;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    img.src = photoBackdropUrl(def.id);

    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); gpu = null; console.warn('PhotoBackdrop: WebGL context lost'); };
    const onRestored = () => { if (!disposed && img.complete) start(img); };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);

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
  }, [photoId]);

  if (!photoId) return null;
  return (
    <canvas
      ref={canvasRef}
      key={photoId}
      className="relief-canvas"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, opacity: opacity * PHOTO_OPACITY }}
      aria-hidden="true"
    />
  );
};
