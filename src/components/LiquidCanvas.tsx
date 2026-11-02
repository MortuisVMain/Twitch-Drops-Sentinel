import React, { useEffect, useRef } from 'react';

export interface LiquidCanvasProps {
  backdropType?: '3d' | '2d-honeycomb' | '2d-lava' | '2d-dots' | '2d-carbon' | 'smooth';
  reliefMode?: 'hex-magma' | 'hex-theme' | 'tectonic-lava' | 'topo-damascus' | 'carbon-weave' | 'pcb-3d' | 'liquid-silk' | 'apple-luna' | 'none';
  themeId?: string;
  opacity?: number;
}

interface HexPrism {
  x: number;
  y: number;
  r: number;
  baseZ: number;
  phase: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface PcbChip {
  x: number;
  y: number;
  w: number;
  h: number;
  isBigCpu: boolean;
}

interface PcbTrace {
  pts: { x: number; y: number }[];
  speed: number;
  offset: number;
}

interface SilkOrb {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  c: string;
}

export const LiquidCanvas: React.FC<LiquidCanvasProps> = ({
  backdropType = '3d',
  reliefMode = 'hex-magma',
  themeId = 'titanium',
  opacity = 0.85,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isVisible = true;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    let hexPrisms: HexPrism[] = [];
    let lavaCanyons: { x: number; y: number }[][] = [];
    let lavaEmbers: Ember[] = [];
    let pcbChips: PcbChip[] = [];
    let pcbTraces: PcbTrace[] = [];
    let silkOrbs: SilkOrb[] = [];

    const initGenerators = () => {
      const w = Math.max(100, canvas.clientWidth || window.innerWidth || 1000);
      const h = Math.max(100, canvas.clientHeight || window.innerHeight || 650);
      canvas.width = w;
      canvas.height = h;

      let seed = 1337;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      // 1. Hex Prisms
      hexPrisms = [];
      const radius = 44;
      const dx = radius * Math.sqrt(3);
      const dy = radius * 1.5;
      for (let r = -2; r < Math.ceil(h / dy) + 3; r++) {
        for (let c = -2; c < Math.ceil(w / dx) + 3; c++) {
          const x = c * dx + (r % 2 !== 0 ? dx / 2 : 0);
          const y = r * dy;
          hexPrisms.push({
            x,
            y,
            r: radius * 0.90,
            baseZ: 0.25 + rand() * 0.75,
            phase: rand() * Math.PI * 2,
          });
        }
      }

      // 2. Tectonic Lava
      lavaCanyons = [];
      for (let i = 0; i < 12; i++) {
        const pts: { x: number; y: number }[] = [];
        let curX = i % 3 === 0 ? -40 : rand() * w;
        let curY = i % 3 !== 0 ? -40 : rand() * h;
        let angle = 0.45 + (rand() - 0.5) * 0.8;
        for (let step = 0; step < 15; step++) {
          pts.push({ x: curX, y: curY });
          angle += (rand() - 0.5) * 1.05;
          curX += Math.cos(angle) * (90 + rand() * 55);
          curY += Math.sin(angle) * (90 + rand() * 55);
        }
        lavaCanyons.push(pts);
      }
      lavaEmbers = [];
      for (let i = 0; i < 45; i++) {
        lavaEmbers.push({
          x: rand() * w,
          y: rand() * h,
          vx: (rand() - 0.5) * 0.4,
          vy: -0.4 - rand() * 0.8,
          size: 1.2 + rand() * 2.5,
          alpha: 0.35 + rand() * 0.65,
        });
      }

      // 3. PCB Chips & Traces
      pcbChips = [];
      pcbTraces = [];
      const gridStep = 145;
      for (let y = 40; y < h + 60; y += gridStep) {
        for (let x = 40; x < w + 60; x += gridStep) {
          const isBigCpu = rand() > 0.62;
          const cw = isBigCpu ? 54 : 34;
          const ch = isBigCpu ? 54 : 26;
          pcbChips.push({
            x: x + (rand() - 0.5) * 24,
            y: y + (rand() - 0.5) * 24,
            w: cw,
            h: ch,
            isBigCpu,
          });

          const targetX = x + gridStep;
          const midX = x + gridStep * 0.45;
          pcbTraces.push({
            pts: [
              { x, y },
              { x: midX, y },
              { x: midX + 24, y: y + 24 },
              { x: targetX, y: y + 24 },
            ],
            speed: 0.0004 + rand() * 0.0006,
            offset: rand(),
          });
        }
      }

      // 4. Liquid Silk & Apple Luna Orbs
      const isLuna = themeId === 'apple-luna' || reliefMode === 'apple-luna';
      silkOrbs = isLuna ? [
        { x: w * 0.22, y: h * 0.28, r: 440, vx: 0.22, vy: 0.18, c: 'rgba(115, 187, 165, 0.18)' },
        { x: w * 0.76, y: h * 0.62, r: 480, vx: -0.20, vy: 0.22, c: 'rgba(54, 136, 115, 0.15)' },
        { x: w * 0.48, y: h * 0.80, r: 380, vx: 0.18, vy: -0.20, c: 'rgba(115, 187, 165, 0.14)' },
      ] : [
        { x: w * 0.22, y: h * 0.28, r: 340, vx: 0.35, vy: 0.24, c: 'rgba(58, 210, 159, 0.16)' },
        { x: w * 0.76, y: h * 0.62, r: 380, vx: -0.28, vy: 0.30, c: 'rgba(56, 189, 248, 0.12)' },
        { x: w * 0.48, y: h * 0.80, r: 300, vx: 0.22, vy: -0.26, c: 'rgba(168, 85, 247, 0.12)' },
      ];
    };

    initGenerators();

    const getHexVertices = (cx: number, cy: number, r: number, sides = 6, rotOffset = Math.PI / 6) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < sides; i++) {
        const ang = (i * 2 * Math.PI) / sides + rotOffset;
        pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
      }
      return pts;
    };

    // Shaders
    const drawHexPrisms3D = (time: number, w: number, h: number, useThemeColor: boolean) => {
      const isCyber = themeId === 'cyberpunk';
      const isAurora = themeId === 'gradient';
      const isDay = themeId === 'light';
      const isPaper = themeId === 'paper';
      const isCopper = themeId === 'copper';
      const isAppleLuna = themeId === 'apple-luna';
      const isMidnight = themeId === 'midnight';
      const isGraphite = themeId === 'graphite';
      const isSakura = themeId === 'sakura';

      const coreCol = useThemeColor
        ? isCyber ? '#00F0FF' : isAurora ? '#A855F7' : isDay ? '#EA580C' : isCopper ? '#F97316' : isAppleLuna ? '#73BBA5'
          : isMidnight ? '#7DB4FF' : isGraphite ? '#D8DDE3' : isPaper ? '#2457D6' : isSakura ? '#F4A7B9' : '#3AD29F'
        : '#FF7700';
      const midCol = useThemeColor
        ? isCyber ? '#FF003C' : isAurora ? '#34D399' : isDay ? '#FDBA74' : isCopper ? '#C2410C' : isAppleLuna ? '#368873'
          : isMidnight ? '#F2C879' : isGraphite ? '#FF5A4E' : isPaper ? '#E2553B' : isSakura ? '#9EE6C9' : '#059669'
        : '#E62E00';
      const darkCol = useThemeColor
        ? (isDay ? '#F4F2EE' : isPaper ? '#EEF1F4' : isAppleLuna ? '#171D1C' : isMidnight ? '#0A0F1C' : isGraphite ? '#050506' : isSakura ? '#120D10' : '#03120D')
        : '#1E0300';

      ctx.fillStyle = darkCol;
      ctx.fillRect(0, 0, w, h);

      const hotspots = [
        { x: mouseX, y: mouseY, rad: 520 },
        { x: w * 0.22 + Math.sin(time * 0.0007) * 80, y: h * 0.28, rad: 440 },
        { x: w * 0.78 + Math.cos(time * 0.0006) * 80, y: h * 0.74, rad: 460 },
      ];
      hotspots.forEach((hs) => {
        const g = ctx.createRadialGradient(hs.x, hs.y, 8, hs.x, hs.y, hs.rad);
        g.addColorStop(0, coreCol);
        g.addColorStop(0.35, midCol);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });

      const facetNormals = [
        { nx: 0.866, ny: 0.5 },
        { nx: 0, ny: 1.0 },
        { nx: -0.866, ny: 0.5 },
        { nx: -0.866, ny: -0.5 },
        { nx: 0, ny: -1.0 },
        { nx: 0.866, ny: -0.5 },
      ];

      for (let i = 0; i < hexPrisms.length; i++) {
        const p = hexPrisms[i];
        const distSq = (p.x - mouseX) ** 2 + (p.y - mouseY) ** 2;
        const prox = Math.max(0, 1 - Math.sqrt(distSq) / 480);
        const wave = Math.sin(time * 0.0018 + p.phase) * 0.16;
        const hOffset = (p.baseZ + wave + prox * 0.7) * 9.0;

        const baseV = getHexVertices(p.x, p.y, p.r);
        const topV = getHexVertices(p.x, p.y - hOffset, p.r * 0.94);

        for (let s = 0; s < 6; s++) {
          const nextS = (s + 1) % 6;
          const fn = facetNormals[s];
          const lx = (mouseX - p.x) / 500;
          const ly = (mouseY - p.y) / 500;
          const diff = Math.max(0.08, fn.nx * lx + fn.ny * ly + 0.32);

          const rCol = Math.round(14 + diff * (useThemeColor ? 40 : 55));
          const gCol = Math.round(18 + diff * (useThemeColor ? 65 : 25));
          const bCol = Math.round(24 + diff * (useThemeColor ? 45 : 10));
          ctx.fillStyle = `rgb(${rCol},${gCol},${bCol})`;

          ctx.beginPath();
          ctx.moveTo(baseV[s].x, baseV[s].y);
          ctx.lineTo(baseV[nextS].x, baseV[nextS].y);
          ctx.lineTo(topV[nextS].x, topV[nextS].y);
          ctx.lineTo(topV[s].x, topV[s].y);
          ctx.closePath();
          ctx.fill();
        }

        const topLux = Math.max(0.12, 1 - Math.sqrt(distSq) / 600);
        const topLuma = Math.round(20 + topLux * 60);
        ctx.fillStyle = `rgb(${topLuma},${topLuma + 4},${topLuma + 8})`;
        ctx.beginPath();
        ctx.moveTo(topV[0].x, topV[0].y);
        for (let s = 1; s < 6; s++) ctx.lineTo(topV[s].x, topV[s].y);
        ctx.closePath();
        ctx.fill();
      }
    };

    const drawTectonicLava3D = (time: number, w: number, h: number) => {
      ctx.fillStyle = '#060608';
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < lavaCanyons.length; i++) {
        const pts = lavaCanyons[i];
        if (pts.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);

        ctx.strokeStyle = '#180402';
        ctx.lineWidth = 42;
        ctx.stroke();

        ctx.strokeStyle = '#8B1400';
        ctx.lineWidth = 18;
        ctx.stroke();

        const pulse = 0.85 + Math.sin(time * 0.003 + i) * 0.15;
        ctx.strokeStyle = `rgba(255, 120, 0, ${0.9 * pulse})`;
        ctx.lineWidth = 4.5;
        ctx.stroke();

        ctx.strokeStyle = '#FFF3D4';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      for (let i = 0; i < lavaEmbers.length; i++) {
        const e = lavaEmbers[i];
        e.y += e.vy;
        e.x += e.vx + Math.sin(time * 0.002 + i) * 0.3;
        if (e.y < -10) {
          e.y = h + 10;
          e.x = Math.random() * w;
        }

        ctx.fillStyle = `rgba(255, ${Math.floor(100 + Math.random() * 90)}, 0, ${e.alpha})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawTopoDamascus3D = (time: number, w: number, h: number) => {
      ctx.fillStyle = '#080A0D';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.lineWidth = 1.6;
      const numRings = 24;
      const centers = [
        { x: w * 0.28, y: h * 0.32 },
        { x: w * 0.74, y: h * 0.65 },
        { x: mouseX, y: mouseY },
      ];

      centers.forEach((c, idx) => {
        for (let r = 1; r < numRings; r++) {
          const baseRad = r * 38;
          ctx.beginPath();
          const steps = 64;
          for (let step = 0; step <= steps; step++) {
            const th = (step / steps) * Math.PI * 2;
            const wobble =
              Math.sin(th * 6 + time * 0.001 + idx) * 14 +
              Math.cos(th * 3 - time * 0.0008) * 8;
            const curR = baseRad + wobble;
            const px = c.x + Math.cos(th) * curR;
            const py = c.y + Math.sin(th) * curR;
            if (step === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(58, 210, 159, ${0.035 + (r % 3 === 0 ? 0.07 : 0.02)})`;
          ctx.stroke();
        }
      });
      ctx.restore();
    };

    const drawCarbonWeave3D = (time: number, w: number, h: number) => {
      ctx.fillStyle = '#060709';
      ctx.fillRect(0, 0, w, h);

      const cell = 26;
      for (let y = 0; y < h + cell; y += cell) {
        for (let x = 0; x < w + cell; x += cell) {
          const isDiag = ((x / cell) + (y / cell)) % 2 === 0;
          const dToMouse = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
          const aniso = Math.max(0, 1 - dToMouse / 550);

          const base = isDiag ? 16 : 24;
          const luma = Math.round(base + aniso * (isDiag ? 38 : 14));

          ctx.fillStyle = `rgb(${luma}, ${luma + 1}, ${luma + 2})`;
          ctx.fillRect(x, y, cell - 1, cell - 1);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cell - 1, cell - 1);
        }
      }
    };

    const drawPcb3D = (time: number, w: number, h: number) => {
      ctx.fillStyle = '#050A08';
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < pcbTraces.length; i++) {
        const tr = pcbTraces[i];
        ctx.beginPath();
        ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
        for (let p = 1; p < tr.pts.length; p++) ctx.lineTo(tr.pts[p].x, tr.pts[p].y);
        ctx.strokeStyle = 'rgba(58, 210, 159, 0.16)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const prog = ((time * tr.speed + tr.offset) % 1);
        const ptIdx = Math.min(
          tr.pts.length - 2,
          Math.floor(prog * (tr.pts.length - 1))
        );
        const subProg = (prog * (tr.pts.length - 1)) - ptIdx;
        const p1 = tr.pts[ptIdx];
        const p2 = tr.pts[ptIdx + 1];
        const pulseX = p1.x + (p2.x - p1.x) * subProg;
        const pulseY = p1.y + (p2.y - p1.y) * subProg;

        ctx.fillStyle = '#3AD29F';
        ctx.beginPath();
        ctx.arc(pulseX, pulseY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < pcbChips.length; i++) {
        const c = pcbChips[i];
        ctx.fillStyle = c.isBigCpu ? '#0B1410' : '#070E0B';
        ctx.fillRect(c.x, c.y, c.w, c.h);

        ctx.strokeStyle = 'rgba(58, 210, 159, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c.x, c.y, c.w, c.h);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6);
      }
    };

    const drawLiquidSilk2D = (w: number, h: number) => {
      const isLuna = themeId === 'apple-luna' || reliefMode === 'apple-luna';
      if (isLuna) {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#171d1c');
        bgGrad.addColorStop(1, '#141918');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      for (let i = 0; i < silkOrbs.length; i++) {
        const o = silkOrbs[i];
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < -100 || o.x > w + 100) o.vx *= -1;
        if (o.y < -100 || o.y > h + 100) o.vy *= -1;

        const g = ctx.createRadialGradient(o.x, o.y, 8, o.x, o.y, o.r);
        g.addColorStop(0, o.c);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const render = (time: number) => {
      if (!isVisible || document.hidden || opacity <= 0.01) {
        animId = requestAnimationFrame(render);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;

      if (w <= 0 || h <= 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      try {
        if (backdropType === '3d') {
          if (reliefMode === 'hex-magma') drawHexPrisms3D(time, w, h, false);
          else if (reliefMode === 'hex-theme') drawHexPrisms3D(time, w, h, true);
          else if (reliefMode === 'tectonic-lava') drawTectonicLava3D(time, w, h);
          else if (reliefMode === 'topo-damascus') drawTopoDamascus3D(time, w, h);
          else if (reliefMode === 'carbon-weave') drawCarbonWeave3D(time, w, h);
          else if (reliefMode === 'pcb-3d') drawPcb3D(time, w, h);
          else if (reliefMode === 'liquid-silk' || reliefMode === 'apple-luna') drawLiquidSilk2D(w, h);
        } else {
          ctx.clearRect(0, 0, w, h);
        }
      } catch (err) {
        console.error('LiquidCanvas draw frame error:', err);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    let pendingX = mouseX;
    let pendingY = mouseY;
    let rafMousePending = false;

    const onMouseMove = (e: MouseEvent) => {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (!rafMousePending) {
        rafMousePending = true;
        requestAnimationFrame(() => {
          rafMousePending = false;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          mouseX = pendingX - rect.left;
          mouseY = pendingY - rect.top;
          const chassis = document.getElementById('chassis');
          if (chassis) {
            chassis.style.setProperty('--mouse-x', `${mouseX}px`);
            chassis.style.setProperty('--mouse-y', `${mouseY}px`);
          }
        });
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', initGenerators);

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', initGenerators);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [backdropType, reliefMode, themeId]);

  return (
    <canvas
      ref={canvasRef}
      id="relief3DCanvas"
      className="relief-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        opacity: opacity,
        display: backdropType === '3d' ? 'block' : 'none',
      }}
      aria-hidden="true"
    />
  );
};
