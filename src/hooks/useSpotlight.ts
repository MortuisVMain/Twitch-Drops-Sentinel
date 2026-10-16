import { useCallback } from 'react';

/**
 * High-performance Spotlight Cursor Hook (ref2game Standard)
 * Bypasses React state completely to achieve 144Hz buttery-smooth physics with zero re-renders.
 * Injects --mouse-x and --mouse-y directly into the DOM node's inline styles.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const attachSpotlight = useCallback((node: T | null) => {
    if (!node) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      node.style.setProperty('--mouse-x', `${x}px`);
      node.style.setProperty('--mouse-y', `${y}px`);
    };

    node.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      node.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return attachSpotlight;
}
