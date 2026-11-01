// "Размер текста": scales html font-size, so every rem-based size (type scale, Tailwind) follows.
export const TEXT_SCALE_MIN = 70;
export const TEXT_SCALE_MAX = 130;
export const TEXT_SCALE_STEP = 5;
export const TEXT_SCALE_DEFAULT = 100;
export type TextScale = number;

const STORAGE_KEY = 'sentinel_ui_text_scale';
const API_SETTINGS = 'http://127.0.0.1:28492/api/settings';

/** Any input -> a multiple of 5 in 70..130; missing or non-numeric input -> 100. */
export function normalizeTextScale(value: unknown): TextScale {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return TEXT_SCALE_DEFAULT;
  const n = Number(value);
  if (!Number.isFinite(n)) return TEXT_SCALE_DEFAULT;
  const stepped = Math.round(n / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, stepped));
}

let current: TextScale = (() => {
  try {
    return normalizeTextScale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return TEXT_SCALE_DEFAULT;
  }
})();

export function getTextScale(): TextScale {
  return current;
}

export function applyTextScale(raw: TextScale): void {
  const scale = normalizeTextScale(raw);
  current = scale;
  document.documentElement.style.fontSize = `${(16 * scale) / 100}px`;
  document.documentElement.dataset.textScale = String(scale);
}

/** Applies at once (no reload) and saves to localStorage and config.json (ui_text_scale). */
export async function setTextScale(raw: TextScale): Promise<void> {
  const scale = normalizeTextScale(raw);
  applyTextScale(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch (err) {
    console.warn('textScale: localStorage unavailable, size will not persist', err);
  }
  try {
    await fetch(API_SETTINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_text_scale: scale }),
    });
  } catch (err) {
    console.warn('textScale: could not tell the service about the text size', err);
  }
}

/** config.json is the source of truth after a reinstall or on another WebView profile. */
export function followBackendTextScale(value: unknown): void {
  if (value === undefined || value === null) return;
  const scale = normalizeTextScale(value);
  if (scale === current) return;
  applyTextScale(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // not persisted: still applied for this session
  }
}
