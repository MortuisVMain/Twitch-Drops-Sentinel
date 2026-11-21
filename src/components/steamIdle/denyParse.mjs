// Pure parser for the "own anti-cheat games" field. A plain .mjs so the node test can import it without a build step.
import { APP_ID_MAX } from './excludeParse.mjs';

/**
 * One AppID ("730") or the address of a game page in the Steam store (".../app/730/Name/"), nothing else.
 * Only the store host is accepted, with http or https; anything else is `{ bad: true }` and nothing is added.
 * @param {string} text
 * @returns {{ appId: number } | { appId: null, bad: boolean }} `bad` is false for an empty field
 */
export function parseDenyTarget(text) {
  const raw = text.trim();
  if (raw === '') return { appId: null, bad: false };
  let digits = null;
  if (/^[0-9]+$/.test(raw)) digits = raw;
  else {
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname === 'store.steampowered.com') {
        digits = /^\/app\/([0-9]+)(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
      }
    } catch {
      digits = null;
    }
  }
  if (digits === null || !/^[1-9][0-9]{0,9}$/.test(digits) || Number(digits) > APP_ID_MAX) return { appId: null, bad: true };
  return { appId: Number(digits) };
}
