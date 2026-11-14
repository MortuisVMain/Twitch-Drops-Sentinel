export function durParts(s: number, up?: boolean): { sec: number } | { min: number } | { h: number; rest: number } | null;
export function signedOutHint(session: string): 'check' | 'login';
