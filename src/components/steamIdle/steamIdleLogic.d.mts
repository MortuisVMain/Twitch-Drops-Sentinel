export function durParts(s: number, up?: boolean): { sec: number } | { min: number } | { h: number; rest: number } | null;
export function signedOutHint(session: string): 'check' | 'login';
export function interruptedBanner(
  interrupted: { kind: string; gamesDone: number; gamesTotal: number; unlocked: number } | null | undefined,
  runActive: boolean,
): { done: number; total: number; unlocked: number; needsConfirm: boolean } | null;
