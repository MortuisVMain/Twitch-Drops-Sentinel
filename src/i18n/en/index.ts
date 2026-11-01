import { APP } from './app';
import { DASHBOARD } from './dashboard';
import { DIMMER } from './dimmer';
import { GIVEAWAYS } from './giveaways';
import { SETTINGS } from './settings';
import { SHELF } from './shelf';
import { STATE } from './state';

export const EN: Record<string, string> = {
  ...APP,
  ...DASHBOARD,
  ...DIMMER,
  ...GIVEAWAYS,
  ...SETTINGS,
  ...SHELF,
  ...STATE,
};
