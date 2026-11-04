/** Arrow keys walk the visible palette results and wrap around at both ends. */
export const movePaletteIndex = (index: number, delta: number, total: number): number =>
  total > 0 ? (index + delta + total) % total : 0;

/** The list can shrink under the selection while the query changes. */
export const clampPaletteIndex = (index: number, total: number): number =>
  total > 0 ? Math.min(index, total - 1) : 0;
