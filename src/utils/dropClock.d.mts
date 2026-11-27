export interface ClockDrop { id: string; required_minutes: number; current_minutes: number; progress_percent: number; remaining_seconds: number; is_claimed: boolean; can_claim: boolean }
export function isCountdownRunning(drop: ClockDrop | null | undefined, paused: boolean): boolean;
export function tickDrop<T extends ClockDrop>(drop: T, ticks: number): T;
export function tickDrop<T extends ClockDrop>(drop: T | null | undefined, ticks: number): T | null | undefined;
export function reconcileDrop<T extends ClockDrop>(shown: T | null | undefined, incoming: T): T;
export function reconcileDrop<T extends ClockDrop>(shown: T | null | undefined, incoming: T | null | undefined): T | null | undefined;
