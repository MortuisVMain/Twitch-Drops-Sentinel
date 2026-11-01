// "Размер текста": scales html font-size, so every rem-based size (type scale, Tailwind) follows.
export const TEXT_SCALES = [100, 115, 130] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

const STORAGE_KEY = 'sentinel_ui_text_scale';
const API_SETTINGS = 'http://127.0.0.1:28492/api/settings';

function normalize(value: unknown): TextScale {
  const n = Number(value);
  return (TEXT_SCALES as readonly number[]).includes(n) ? (n as TextScale) : 100;
}

let current: TextScale = (() => {
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 100;
  }
})();

export function getTextScale(): TextScale {
  return current;
}

export function applyTextScale(scale: TextScale): void {
  current = scale;
  document.documentElement.style.fontSize = `${(16 * scale) / 100}px`;
  document.documentElement.dataset.textScale = String(scale);
}

/** Applies at once (no reload) and saves to localStorage and config.json (ui_text_scale). */
export async function setTextScale(scale: TextScale): Promise<void> {
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
  const scale = normalize(value);
  if (scale === current) return;
  applyTextScale(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // not persisted: still applied for this session
  }
}
