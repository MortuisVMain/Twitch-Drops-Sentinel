// Pure parser for the "exclude games" field. A plain .mjs so the node test can import it without a build step.
export const APP_ID_MAX = 4294967295;

/**
 * Splits on commas, semicolons and whitespace (each is a separator, so "730 440" is two AppIDs), drops empty pieces
 * (a trailing comma is fine) and deduplicates. The first piece that is not a plain AppID is returned in `bad`.
 * @param {string} text
 * @returns {{ ids: number[], bad: string | null }}
 */
export function parseExcludeList(text) {
  /** @type {Set<number>} */
  const ids = new Set();
  for (const token of text.split(/[,;\s]+/)) {
    if (token === '') continue;
    if (!/^[1-9][0-9]{0,9}$/.test(token) || Number(token) > APP_ID_MAX) return { ids: [], bad: token };
    ids.add(Number(token));
  }
  return { ids: [...ids], bad: null };
}
