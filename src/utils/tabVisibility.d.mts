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
export function tabSetPatch(
  settings: { disabled_tabs?: unknown; giveaways_enabled?: boolean } | null | undefined,
  id: string,
  wantOn: boolean,
): { giveaways_enabled?: boolean; disabled_tabs?: ('shelf' | 'steamidle' | 'dimmer')[] };
export function snapshotKeys<T extends object>(settings: object | null | undefined, changes: T): Partial<Record<keyof T, unknown>>;
export function rollbackSettings<S extends object>(current: S, previous: Record<string, unknown>, changes: object): S;
export function needsOffConfirmation(id: string, wasOn: boolean, busy: boolean | null | undefined): boolean;
