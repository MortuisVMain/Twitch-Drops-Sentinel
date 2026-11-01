import type { SentinelSettings } from '../types';

// One definition of "is this module on" for the ten switches on the Settings tab. The switches and the
// "Включено: N из 10" counter both read it, so they cannot disagree. Pure: only types are imported.

export type ModuleKey =
  | 'claimPoints'
  | 'autoClaim'
  | 'giveaways'
  | 'watchdog'
  | 'hardwareGuard'
  | 'batteryPause'
  | 'toasts'
  | 'sounds'
  | 'powerCascade'
  | 'autostart';

export type ModuleStates = Record<ModuleKey, boolean>;

export interface ModuleExtras {
  muted: boolean; // interface sounds live in the browser, not in the service settings
  autostart: boolean | null; // null = the service has not answered yet: counts as off
}

export const moduleStates = (s: SentinelSettings, extras: ModuleExtras): ModuleStates => ({
  claimPoints: s.claim_channel_points !== false,
  autoClaim: s.auto_claim_drops !== false,
  giveaways: s.giveaways_enabled !== false,
  watchdog: s.streamer_watchdog_enabled !== false,
  hardwareGuard: s.hardware_guard_enabled !== false,
  batteryPause: Boolean(s.pause_on_battery),
  toasts: s.native_toasts !== false,
  sounds: !extras.muted,
  powerCascade: Boolean(s.auto_shutdown_on_complete),
  autostart: extras.autostart === true,
});

export const modulesLabel = (states: ModuleStates): string => {
  const values = Object.values(states);
  return `Включено: ${values.filter(Boolean).length} из ${values.length}`;
};
