// Digit hotkeys: 1..9 open the visible tabs in header order, so turning a tab off leaves no hole.
// The list is visibleTabs(settings) from tabVisibility.mjs. Pure: no imports.
// Run: node --test tools/engine_tests/tab_hotkeys.test.mjs

const MAX_DIGITS = 9;

/** The digit ('1'..'9') that opens the tab, or null when the tab is not shown or sits past the ninth place. */
export function tabDigit(tabs, id) {
  const index = tabs.indexOf(id);
  return index >= 0 && index < MAX_DIGITS ? String(index + 1) : null;
}

/** The tab a pressed key opens: only a single digit 1-9 counts, and only up to the number of visible tabs. */
export function tabForDigit(tabs, key) {
  if (typeof key !== 'string' || !/^[1-9]$/.test(key)) return null;
  return tabs[Number(key) - 1] ?? null;
}

/** The digits in use as one label for the help: '1–6', or '1' for a single tab, '' for none. */
export function digitRange(tabs) {
  const count = Math.min(tabs.length, MAX_DIGITS);
  if (count === 0) return '';
  return count === 1 ? '1' : `1–${count}`;
}

/** A tab tooltip with its hotkey digit in brackets; the plain title when the tab has no digit. */
export function titleWithDigit(title, digit) {
  return digit ? `${title} (${digit})` : title;
}
