import React, { useEffect, useRef } from 'react';

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

const VERT = `#version 300 es
layout(location=0) in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

/* Cover-fit with slow drift and theme recolor (neutrals tinted to the background, saturated pixels mapped to the
   accent), then a per-backdrop motion mode (uMode, centre and size in uC) on top of glow, light sweep and mouse light. */
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
uniform vec3 uBg; uniform vec3 uAcc; uniform vec3 uAcc2; uniform float uLight;
uniform sampler2D uTex; uniform vec2 uTexRes; uniform vec4 uP; uniform vec4 uQ;
uniform int uMode; uniform vec4 uC;
out vec4 outColor;
const float TAU = 6.2831853;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v/.94; }
float chroma(vec3 c){ return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 tone(vec3 s, vec3 bgHue){
  float L = dot(s, vec3(.2126, .7152, .0722)), mx = max(s.r, max(s.g, s.b));
  float em = smoothstep(.05, .3, chroma(s));
  vec3 hot = mix(uAcc, mix(uAcc2, vec3(1.), .55), smoothstep(.55, 1., mx));
  vec3 dark = mix(uBg*.8 + L*mix(vec3(1.), bgHue, .45), hot*mx*1.15, em);
  vec3 lite = mix(uBg*(.76 + .75*L), uAcc*mix(.75, 1., mx), em*smoothstep(.12, .55, mx));
  return mix(dark, lite, uLight);
}
// light added on dark themes, accent ink on light themes
vec3 glow(vec3 c, vec3 col, float a){ return mix(c + col*a, mix(c, col*.85, clamp(a, 0., 1.)*.75), uLight); }
// rising bokeh bubbles in aspect-correct texture space
float bubbles(vec2 p, float ta, float t, float size, float seed){
  float acc = 0.;
  for (int i = 0; i < 16; i++) {
    float fi = float(i) + seed, h = hash(vec2(fi, 7.1)), h2 = hash(vec2(fi, 3.7));
    float y = fract(h2*5.3 + t*(.018 + .035*h)) * 1.3 - .15;
    vec2 c = vec2(fract(h*13.7) + .02*sin(t*(.5 + h) + fi), y);
    float r = size*(.45 + .9*h*h2);
    float d = length((p - c)*vec2(ta, 1.));
    float rim = smoothstep(r, r*.86, d) - smoothstep(r*.86, r*.62, d)*.8;
    float core = exp(-d*d/(r*r*.04));
    acc += (rim*.55 + core*.6)*smoothstep(-.15, .05, y)*smoothstep(1.15, .85, y);
  }
  return acc;
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes, m = uMouse/uRes;
  float t = uTime, ca = uRes.x/uRes.y, ta = uTexRes.x/uTexRes.y;
  vec2 sc = ca > ta ? vec2(1., ta/ca) : vec2(ca/ta, 1.);
  float z = 1.05 + .025*uP.z*(1. + sin(t*.045));
  vec2 tuv = (uv - .5)*sc/z + .5 + uP.z*vec2(sin(t*.031), cos(t*.023))*.012 + (m - .5)*.02*uQ.y;
  vec2 asp = vec2(ta, 1.);
  // per-backdrop motion of the image itself
  if (uMode == 4) tuv += .0045*vec2(sin(tuv.y*11. + t*.9) + .5*sin(tuv.x*7. - t*.6), cos(tuv.x*9. + t*.7));
  if (uMode == 6) { vec2 q = tuv*asp*3.; tuv += .012*vec2(noise(q + t*.35) - .5, noise(q.yx - t*.3) - .5); }
  if (uMode == 7) tuv.y += .012*sin(tuv.x*6. - t*.8);
  if (uMode == 13) tuv += .0025*vec2(sin(tuv.y*14. + t*1.1), cos(tuv.x*12. + t*.9));
  if (uMode == 12) tuv += smoothstep(.15, .35, length((tuv - uC.xy)*asp))*vec2(.012, -.012)*sin(t*.35);
  if (uMode == 14) tuv.x += (.6 - tuv.y)*(m.x - .5)*.03;
  vec3 src = texture(uTex, tuv).rgb, blr = textureLod(uTex, tuv, 5.).rgb;
  vec3 bgHue = uBg/max(max(uBg.r, max(uBg.g, uBg.b)), 1e-3);
  float L = dot(src, vec3(.2126, .7152, .0722));
  float em = max(smoothstep(.05, .3, chroma(src)), smoothstep(.08, .25, chroma(blr))*smoothstep(.45, .9, L));
  vec3 c = mix(src, tone(src, bgHue), uP.w);
  vec3 hotC = mix(uAcc, mix(uAcc2, vec3(1.), .5), .5);

  // emission factor: 1 keeps the frame as it is
  float h = hash(floor(tuv*uTexRes/4.));
  float spark = .5 + .5*sin(t*(1.2 + 3.*h) + h*40.);
  float e = mix(1., .55 + .9*noise(tuv*vec2(5., 3.) + t*vec2(.09, -.05)), uP.x)*mix(1., .3 + 1.4*spark, uQ.z);
  if (uMode == 1) {
    float front = fract(dot(tuv*asp, normalize(vec2(1., .55)))*.42 - t*.14);
    float wave = exp(-pow((front - .5)*7., 2.));
    float md = length((tuv - m)*asp);
    e = 1. + (.3 + 1.3*wave + .6*exp(-md*md*18.) - 1.)*uP.x;
  } else if (uMode == 2) {
    float heat = uC.z > 0.
      ? .5 + .5*sin(length((tuv - uC.xy)*asp)*15. - t*1.9 + noise(tuv*asp*5.)*3.)
      : noise(tuv*asp*4. + vec2(t*.22, -t*.38));
    e = .25 + 1.35*heat*heat*(.8 + .4*spark);
  } else if (uMode == 6) {
    e = .35 + 3.*pow(noise(tuv*asp*6. + vec2(t*.5, -t*.35)), 2.)*(.7 + .6*spark);
  } else if (uMode == 7) {
    e = .2 + 2.6*pow(.5 + .5*sin(tuv.x*15. - t*2.6 + noise(tuv*8.)*2.), 3.);
  } else if (uMode == 9) {
    float col = floor((tuv.x - uC.x)/(uC.w - uC.x)*110.);
    float thr = uC.y + uC.z*(.15 + .85*noise(vec2(col*.37, t*2.4)));
    e = mix(1.4, .06, smoothstep(thr, thr + .012, tuv.y))*(.6 + .8*(.5 + .5*sin(tuv.x*8. - t*2.2)));
  } else if (uMode == 10) {
    vec2 p = (tuv - uC.xy)*asp;
    float dA = mod(atan(p.y, p.x) + t*.85, TAU);
    e = .45 + 4.*exp(-dA*3.5);
  } else if (uMode == 11) {
    float row = floor(tuv.y*28.), col = floor(tuv.x*ta*28.);
    float sx = fract(tuv.x*.7 - t*(.1 + .12*hash(vec2(row, 1.))) + hash(vec2(row, 2.)));
    float sy = fract(tuv.y*.7 - t*(.08 + .1*hash(vec2(col, 3.))) + hash(vec2(col, 4.)));
    e = .35 + .6*spark;
  }
  c += c*em*(e - 1.);
  c += mix(blr, tone(blr, bgHue), uP.w)*smoothstep(.04, .25, chroma(blr))*.55*uP.x*(uMode == 10 ? 1. : clamp(e, .3, 2.))*(1. - uLight*.7);

  // overlays drawn on top of the frame
  if (uMode == 1) {
    float front = fract(dot(tuv*asp, normalize(vec2(1., .55)))*.42 - t*.14);
    float seam = smoothstep(.012, .06, chroma(src))*(1. - em)*uC.x;  // only for frames whose seams are faint lines
    c = glow(c, hotC, seam*exp(-pow((front - .5)*7., 2.))*.9);
  } else if (uMode == 2) {
    float emb = bubbles(tuv + vec2(0., -.05), ta, t*1.6, .004, 3.);
    c = glow(c, mix(uAcc, uAcc2, .4)*1.4, emb*(.5 + .5*spark));
  } else if (uMode == 5) {
    vec2 p = (tuv - uC.xy)*asp/uC.z;
    float r2 = dot(p, p), on = smoothstep(1., .97, r2);
    float orbits = 0.;
    for (int i = 0; i < 3; i++) {
      float fi = float(i), inc = .35 + .45*fi, rot = -.5 + .55*fi, R = 1.14 + .06*fi;
      vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*p;
      float th = atan(q.y/(R*sin(inc)), q.x/R);
      vec2 on2 = vec2(cos(th), sin(th)*sin(inc))*R;
      float dist = length(q - on2), front = sin(th)*cos(inc) < 0. ? 1. : .35;
      float occl = (front < 1. && dot(q, q) < 1.) ? 0. : 1.;
      float head = fract(th/TAU - t*(.05 + .025*fi) + hash(vec2(fi, 9.)));
      orbits += exp(-dist*dist/.00012)*front*occl*(.18 + 2.2*pow(head, 12.));
    }
    float term = smoothstep(.35, 0., abs(p.x - sin(t*.18)*.9))*on;
    float rim = exp(-pow((sqrt(r2) - 1.)/.02, 2.))*(.6 + .4*sin(t*1.3));
    c = glow(c, hotC, orbits*.9 + rim*.18);
    c = glow(c, uAcc, term*L*1.2);
  } else if (uMode == 8) {
    c = glow(c, mix(uAcc, uAcc2, .3), bubbles(tuv, ta, t, .03, 0.)*.45);
  } else if (uMode == 9) {
    float col = floor((tuv.x - uC.x)/(uC.w - uC.x)*110.);
    float thr = uC.y + uC.z*(.15 + .85*noise(vec2(col*.37, t*2.4)));
    float bar = smoothstep(.04, .2, chroma(texture(uTex, vec2(tuv.x, thr - .006)).rgb));
    c = glow(c, hotC, exp(-pow((tuv.y - thr)/.003, 2.))*bar*1.3);
  } else if (uMode == 10) {
    vec2 p = (tuv - uC.xy)*asp;
    float dA = mod(atan(p.y, p.x) + t*.85, TAU), in_ = smoothstep(uC.z, uC.z*.9, length(p));
    c = glow(c, uAcc, (exp(-dA*4.)*.09 + exp(-dA*90.)*.45)*in_);
  } else if (uMode == 12) {
    vec2 p = (tuv - uC.xy)*asp/vec2(uC.z, uC.z*.32);
    float ring = exp(-pow((length(p) - 1.)/.12, 2.));
    float ang = atan(p.y, p.x), dA = mod(ang - t*1.1, TAU);
    c = glow(c, hotC, ring*(exp(-dA*1.8)*1.4 + .15));
  } else if (uMode == 11) {
    float row = floor(tuv.y*28.), col = floor(tuv.x*ta*28.);
    float sx = fract(tuv.x*.7 - t*(.1 + .12*hash(vec2(row, 1.))) + hash(vec2(row, 2.)));
    float sy = fract(tuv.y*.7 - t*(.08 + .1*hash(vec2(col, 3.))) + hash(vec2(col, 4.)));
    float line = smoothstep(.015, .08, chroma(src));
    c = glow(c, hotC, line*(pow(sx, 40.)*step(.45, hash(vec2(row, 5.))) + pow(sy, 40.)*step(.45, hash(vec2(col, 6.))))*2.);
  } else if (uMode == 13) {
    c = glow(c, mix(uAcc, vec3(1.), .3), bubbles(tuv, ta, t*.8, .007, 11.)*.45);
  } else if (uMode == 14) {
    float fog = fbm(vec2(tuv.x*ta*1.3 - t*.09, tuv.y*4. + sin(tuv.x*3. + t*.2)*.4));
    float band = smoothstep(.1, .3, tuv.y)*smoothstep(.66, .4, tuv.y);
    c = glow(c, mix(uAcc, vec3(.75), .55)*.32, smoothstep(.3, .8, fog)*band*1.2);
  }

  float sw = mod(t*(uQ.x > 0. ? uQ.x : .045), 1.8) - .4;
  float band = exp(-pow((uv.x*.8 + uv.y*.35 - sw)*7., 2.));
  c += band*uP.y*pow(L, 1.3)*mix(vec3(1.), uAcc, .25)*1.1*(1. - uLight*.6);
  float d = length((uv - m)*vec2(ca, 1.));
  c += exp(-d*d*5.)*(pow(L, 1.2)*.4 + c*em*.7)*(1. - uLight*.6);
  vec2 q = uv - .5;
  c *= mix(1. - dot(q, q)*.9, 1., uLight*.7);
  c += (hash(gl_FragCoord.xy + fract(t*7.)) - .5)/255.;
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
