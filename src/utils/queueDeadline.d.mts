export interface QueueDeadlineRow { key: string; endAtIso?: string | null; watchMinutes?: number | null }
export interface QueueDeadlineRisk { watchMinutes: number; aheadMinutes: number; msLeft: number; alone: boolean }
export function queueDeadlineRisks(rows: readonly QueueDeadlineRow[], now: number): Map<string, QueueDeadlineRisk>;
