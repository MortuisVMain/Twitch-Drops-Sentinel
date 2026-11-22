export function durParts(s: number, up?: boolean): { sec: number } | { min: number } | { h: number; rest: number } | null;
export function etaText(hours: number | null | undefined): string;
export function refundNote(daysLeft: number): string;
export function releaseQuestion(name: string): string;
export function signedOutHint(session: string): 'check' | 'login';
export function steamCover(appId: number): string;
export function playedHours(minutes: number | null | undefined): number | null;
export function finishedFacts(game: { unlocked?: number; skipped?: number; rejected?: number; already?: number; failed?: number }): Array<{ label: string; count: number }>;
export function interruptedBanner(
  interrupted: { kind: string; gamesDone: number; gamesTotal: number; unlocked: number } | null | undefined,
  runActive: boolean,
): { done: number; total: number; unlocked: number; needsConfirm: boolean } | null;
export type ThresholdSuggestion = { kind: 'restricted' | 'unrestricted'; suggestedHours: number; samples: number };
export function parseSuggestion(raw: unknown): ThresholdSuggestion | null;
export function parseAutoPause(raw: unknown): { reason: 'user_playing'; appId: number; since: number } | null;
export function thresholdHint(suggestion: ThresholdSuggestion | null | undefined): string | null;
