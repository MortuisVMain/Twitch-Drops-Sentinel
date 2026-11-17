export type TabId = 'dashboard' | 'shelf' | 'giveaways' | 'steamidle' | 'dimmer' | 'settings';
export const TAB_ORDER: readonly TabId[];
export const OPTIONAL_TABS: readonly TabId[];
export function visibleTabs(settings?: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null): TabId[];
export function dimmerModuleMessage(
  settings: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null | undefined,
  serviceAnswered: boolean,
  lastSent: boolean | undefined,
): { type: 'DIMMER_MODULE'; enabled: boolean } | null;
export function tabSwitches(settings?: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null): { id: TabId; on: boolean }[];
export function tabTogglePatch(
  settings: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null | undefined,
  id: string,
): { giveaways_enabled?: boolean; disabled_tabs?: ('shelf' | 'steamidle' | 'dimmer')[] };
export function needsOffConfirmation(id: string, wasOn: boolean, busy: boolean | null | undefined): boolean;
