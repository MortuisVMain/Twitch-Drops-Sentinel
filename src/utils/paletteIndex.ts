/**
 * Arrow keys walk the visible palette results and wrap around at both ends.
 * -1 means "nothing selected": Down then takes the first result and Up the last.
 */
export const movePaletteIndex = (index: number, delta: number, total: number): number => {
  if (total <= 0) return 0;
  if (index < 0) return delta > 0 ? 0 : total - 1;
  return (index + delta + total) % total;
};

/** The list can shrink under the selection while the query changes; "nothing selected" (-1) stays. */
export const clampPaletteIndex = (index: number, total: number): number =>
  total > 0 ? Math.min(index, total - 1) : 0;

/**
 * Where the selection starts: Enter right after typing must not run an action or farm a game by accident,
 * so only a navigation entry (a harmless tab switch) is selected on its own.
 */
export const defaultPaletteIndex = (navigationCount: number): number => (navigationCount > 0 ? 0 : -1);
