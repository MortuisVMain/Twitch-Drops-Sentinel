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
