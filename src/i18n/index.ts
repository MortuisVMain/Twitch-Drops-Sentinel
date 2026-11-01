import { EN } from './en';
import { PATTERNS } from './patterns';

export type Lang = 'ru' | 'en';

const STORAGE_KEY = 'sentinel_ui_lang';
const API_SETTINGS = 'http://127.0.0.1:28492/api/settings';
// Backend (core/lang/*.json) names the same two languages like this
const BACKEND_NAME: Record<Lang, string> = { ru: 'Русский', en: 'English' };

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

let currentLang: Lang = readStoredLang();

export function getLang(): Lang {
  return currentLang;
}

const SEGMENT_SEPARATORS = [' · ', ' — ', ', '];

function translateCore(core: string, depth: number): string {
  const exact = EN[core];
  if (exact !== undefined) return exact;
  for (const [pattern, replacement] of PATTERNS) {
    const found = pattern.exec(core);
    if (!found) continue;
    // captured pieces (names, numbers, durations) are translated too
    const groups = found.slice(1).map((group) => (group === undefined ? '' : translateCore(group, depth + 1)));
    if (typeof replacement === 'function') return replacement(...groups);
    return replacement.replace(/\$(\d)/g, (_all, index: string) => groups[Number(index) - 1] ?? '');
  }
  if (depth < 3) {
    for (const separator of SEGMENT_SEPARATORS) {
      if (!core.includes(separator)) continue;
      const parts = core.split(separator);
      const translated = parts.map((part) => translateCore(part, depth + 1));
      if (translated.some((part, index) => part !== parts[index])) return translated.join(separator);
    }
  }
  return core;
}

/** Russian is the source language of the UI; English is looked up by the Russian text. */
export function translate(text: string): string {
  if (currentLang === 'ru') return text;
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match || !match[2]) return text;
  return match[1] + translateCore(match[2], 0) + match[3];
}

export function uiLocale(): string {
  return currentLang === 'en' ? 'en-GB' : 'ru-RU';
}

/** Saves the language for the UI and the engine console, then reloads so module-level labels are rebuilt. */
export async function setLang(lang: Lang): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (err) {
    console.warn('i18n: localStorage unavailable, language will not persist', err);
  }
  try {
    await fetch(API_SETTINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: BACKEND_NAME[lang] }),
    });
  } catch (err) {
    console.warn('i18n: could not tell the service about the language change', err);
  }
  window.location.reload();
}

/** If config.json already names English/Russian and the UI disagrees, follow config.json once. */
export function followBackendLanguage(backendName: unknown): void {
  const lang = (Object.keys(BACKEND_NAME) as Lang[]).find((key) => BACKEND_NAME[key] === backendName);
  if (!lang || lang === currentLang) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    return; // cannot persist: reloading would loop
  }
  window.location.reload();
}

const TEXT_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'alt'];

function translateNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.nodeValue ?? '';
    const next = translate(value);
    if (next !== value) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;
  for (const name of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value) {
      const next = translate(value);
      if (next !== value) element.setAttribute(name, next);
    }
  }
  element.childNodes.forEach(translateNode);
}

/**
 * English mode: rewrites Russian text nodes and title/placeholder/aria-label attributes in place and keeps
 * doing so as React re-renders. The Russian strings stay untouched in the components.
 */
export function installTranslator(): void {
  if (currentLang === 'ru') return;
  document.documentElement.lang = 'en';
  document.title = translate(document.title);
  const nativeAlert = window.alert.bind(window);
  window.alert = (message?: unknown) => nativeAlert(typeof message === 'string' ? translate(message) : message);
  const nativePrompt = window.prompt.bind(window);
  window.prompt = (message?: string, fallback?: string) => nativePrompt(message === undefined ? message : translate(message), fallback);
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = (message?: string) => nativeConfirm(message === undefined ? message : translate(message));
  const start = () => {
    translateNode(document.body);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' || record.type === 'characterData') translateNode(record.target);
        else record.addedNodes.forEach(translateNode);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TEXT_ATTRIBUTES,
    });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
