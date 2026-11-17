export type TabId = 'dashboard' | 'shelf' | 'giveaways' | 'steamidle' | 'dimmer' | 'settings';
export const TAB_ORDER: readonly TabId[];
export const OPTIONAL_TABS: readonly TabId[];
export function visibleTabs(settings?: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null): TabId[];
export function dimmerModuleMessage(
  settings: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null | undefined,
  serviceAnswered: boolean,
  lastSent: boolean | undefined,
): { type: 'DIMMER_MODULE'; enabled: boolean } | null;
