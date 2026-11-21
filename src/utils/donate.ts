/** Donation page shown as "Поддержать проект" in the "…" menu. Empty hides the menu item. */
export const DONATE_URL = 'DONATE_URL_PLACEHOLDER';

/** Only an absolute https address is offered: the desktop host opens it in the default browser. */
export const donateUrl = (): string | null => (/^https:\/\/\S+$/.test(DONATE_URL) ? DONATE_URL : null);
