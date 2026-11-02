/** Shaders for PhotoBackdrop: cover-fit photo, theme recolor and per-backdrop motion modes. */
export const VERT = `#version 300 es
layout(location=0) in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

/* Cover-fit with slow drift and theme recolor (neutrals tinted to the background, saturated pixels mapped to the
   accent), then a per-backdrop motion mode (uMode, centre and size in uC) on top of glow, light sweep and mouse light. */
export const FRAG = `#version 300 es
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
  vec3 lite = mix(uBg*clamp(pow(L/.86, 1.6), 0., 1.1), mix(uAcc, uBg, smoothstep(.6, .98, L)*.35), em);
  return mix(dark, lite, uLight);
}
// light added on dark themes, accent ink on light themes
vec3 glow(vec3 c, vec3 col, float a){ return mix(c + col*a, mix(c, col*.7, clamp(a, 0., 1.)*.8), uLight); }
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
  float em = smoothstep(.05, .3, chroma(src));
  em = mix(max(em, smoothstep(.08, .25, chroma(blr))*smoothstep(.45, .9, L)), em, uLight);
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
  c = mix(c + c*em*(e - 1.), mix(c, uBg*.92, em*(1. - clamp(e, 0., 1.))*.4), uLight);
  c += mix(blr, tone(blr, bgHue), uP.w)*smoothstep(.04, .25, chroma(blr))*.55*uP.x*(uMode == 10 ? 1. : clamp(e, .3, 2.))*(1. - uLight);

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
    c = glow(c, uAcc, term*L*mix(1.2, .15, uLight));
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
    float mist = smoothstep(.3, .8, fog)*band;
    c = mix(glow(c, mix(uAcc, vec3(.75), .55)*.32, mist*1.2), mix(c, uBg*1.04, mist*.75), uLight);
  }

  float sw = mod(t*(uQ.x > 0. ? uQ.x : .045), 1.8) - .4;
  float band = exp(-pow((uv.x*.8 + uv.y*.35 - sw)*7., 2.));
  c += band*uP.y*pow(L, 1.3)*mix(vec3(1.), uAcc, .25)*1.1*(1. - uLight*.9);
  float d = length((uv - m)*vec2(ca, 1.));
  c += exp(-d*d*5.)*(pow(L, 1.2)*.4 + c*em*.7)*(1. - uLight*.9);
  vec2 q = uv - .5;
  c *= mix(1. - dot(q, q)*.9, 1., uLight*.7);
  c += (hash(gl_FragCoord.xy + fract(t*7.)) - .5)/255.;
  outColor = vec4(c, 1.);
}`;
