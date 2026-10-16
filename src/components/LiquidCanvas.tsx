import React, { useEffect, useRef } from 'react';

interface Orb {
  x: number;
  y: number;
  r: number;
  color: string;
  vx: number;
  vy: number;
}

export const LiquidCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isVisible = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const orbs: Orb[] = [
      { x: canvas.width * 0.2, y: canvas.height * 0.25, r: 280, color: 'rgba(58, 210, 159, 0.08)', vx: 0.25, vy: 0.18 },
      { x: canvas.width * 0.78, y: canvas.height * 0.55, r: 320, color: 'rgba(33, 124, 94, 0.07)', vx: -0.18, vy: 0.22 },
      { x: canvas.width * 0.45, y: canvas.height * 0.82, r: 240, color: 'rgba(124, 232, 194, 0.05)', vx: 0.14, vy: -0.16 },
    ];

    const render = () => {
      if (!isVisible) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        orb.x += orb.vx;
        orb.y += orb.vy;

        if (orb.x < -100 || orb.x > canvas.width + 100) orb.vx *= -1;
        if (orb.y < -100 || orb.y > canvas.height + 100) orb.vy *= -1;

        const grad = ctx.createRadialGradient(orb.x, orb.y, 10, orb.x, orb.y, orb.r);
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-70"
      aria-hidden="true"
    />
  );
};
