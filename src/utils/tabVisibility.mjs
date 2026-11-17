// Which header tabs are shown. Dashboard and Settings are always there; Giveaways follows the older
// giveaways_enabled switch (one source of truth); the others follow disabled_tabs. Pure: no imports.
// Run: node --test tools/engine_tests/tab_visibility.test.mjs

export const TAB_ORDER = ['dashboard', 'shelf', 'giveaways', 'steamidle', 'dimmer', 'settings'];

/** Tabs the user may turn off through disabled_tabs, in the order the service stores them. */
export const OPTIONAL_TABS = ['shelf', 'steamidle', 'dimmer'];

export function visibleTabs(settings) {
  const off = Array.isArray(settings?.disabled_tabs) ? settings.disabled_tabs : [];
  return TAB_ORDER.filter((tab) => {
    if (tab === 'giveaways') return settings?.giveaways_enabled !== false;
    return !(OPTIONAL_TABS.includes(tab) && off.includes(tab));
  });
}

/** The switches of the Settings «Вкладки» block, in header order, with their current state. */
export function tabSwitches(settings) {
  const shown = visibleTabs(settings);
  return ['shelf', 'giveaways', 'steamidle', 'dimmer'].map((id) => ({ id, on: shown.includes(id) }));
}

/** The settings change that flips one switch. Giveaways is giveaways_enabled itself; unknown ids change nothing. */
export function tabTogglePatch(settings, id) {
  if (id === 'giveaways') return { giveaways_enabled: settings?.giveaways_enabled === false };
  if (!OPTIONAL_TABS.includes(id)) return {};
  const off = Array.isArray(settings?.disabled_tabs) ? settings.disabled_tabs : [];
  const next = new Set(OPTIONAL_TABS.filter((t) => off.includes(t)));
  if (next.has(id)) next.delete(id); else next.add(id);
  return { disabled_tabs: OPTIONAL_TABS.filter((t) => next.has(t)) };
}

/** Turning Steam IDLE off asks first unless the service said it is idle (busy === false); a failed check (null) asks too. */
export function needsOffConfirmation(id, wasOn, busy) {
  return id === 'steamidle' && wasOn === true && busy !== false;
}

/**
 * What to tell the desktop host about the Dimmer switch: the global hotkeys follow it. Nothing before the service
 * has answered (the host keeps its own saved value until then); the first answer is always sent; then only a change.
 * lastSent is the last value sent (undefined before the first).
 */
export function dimmerModuleMessage(settings, serviceAnswered, lastSent) {
  if (!serviceAnswered) return null;
  const enabled = visibleTabs(settings).includes('dimmer');
  return enabled === lastSent ? null : { type: 'DIMMER_MODULE', enabled };
}
