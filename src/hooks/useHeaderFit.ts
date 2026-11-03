import { useCallback, useRef } from 'react';

const MAX_LEVEL = 2;

/**
 * Collapses secondary header controls step by step until nothing sticks out of the header:
 * data-fit="1" drops button labels, data-fit="2" moves Ctrl+K and Help into the "..." menu.
 * The tabs and window buttons never collapse. The level lives in a DOM attribute (styled in index.css),
 * so a resize does not re-render React. Returns a ref callback: the header mounts only after the first state arrives.
 */
export function useHeaderFit() {
  const observerRef = useRef<ResizeObserver | null>(null);
  return useCallback((header: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!header) return;
    const fit = () => {
      let level = 0;
      header.dataset.fit = '0';
      while (header.scrollWidth > header.clientWidth + 1 && level < MAX_LEVEL) {
        level += 1;
        header.dataset.fit = String(level);
      }
    };
    fit();
    // text size, language, the update button and the night icon change the width of a child, not of the header
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    for (const child of Array.from(header.children)) observer.observe(child);
    observerRef.current = observer;
  }, []);
}
