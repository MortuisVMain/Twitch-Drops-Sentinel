import { APP } from './app';
import { DASHBOARD } from './dashboard';
import { SETTINGS } from './settings';
import { STATE } from './state';

export const EN: Record<string, string> = {
  ...APP,
  ...DASHBOARD,
  ...SETTINGS,
  ...STATE,
};
