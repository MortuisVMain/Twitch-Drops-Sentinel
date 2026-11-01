// Truncated text (ellipsis or line-clamp) gets its full text as a tooltip when the pointer reaches it,
// unless the element already has its own title.
function isTruncated(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  const clamped = cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '';
  if (clamped) return el.scrollHeight > el.clientHeight + 1;
  return cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
}

export function installTruncationTitles(): void {
  document.addEventListener(
    'mouseover',
    (event) => {
      let el = event.target as HTMLElement | null;
      for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
        const auto = el.hasAttribute('data-auto-title');
        if (el.hasAttribute('title') && !auto) return;
        if (isTruncated(el)) {
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (text) {
            el.setAttribute('title', text);
            el.setAttribute('data-auto-title', '');
          }
          return;
        }
        if (auto) {
          el.removeAttribute('title');
          el.removeAttribute('data-auto-title');
        }
      }
    },
    { passive: true },
  );
}
