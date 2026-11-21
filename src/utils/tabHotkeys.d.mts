import type { TabId } from './tabVisibility.mjs';
export function tabDigit(tabs: readonly TabId[], id: string): string | null;
export function tabForDigit(tabs: readonly TabId[], key: unknown): TabId | null;
export function digitRange(tabs: readonly TabId[]): string;
export function digitHotkeyAllowed(event: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; target?: EventTarget | { tagName?: string; isContentEditable?: boolean } | null }): boolean;
export function titleWithDigit(title: string, digit: string | null): string;
