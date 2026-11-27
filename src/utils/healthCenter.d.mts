export type SectionId = 'summary' | 'checks' | 'developer' | 'maintenance';
export interface HealthSection { id: SectionId; label: string }
export interface HealthButtonView { tone: 'neutral' | 'amber' | 'rose'; badge: number | null; label: string; title: string }
export interface HealthHistoryEvent { time: number; checkId: string; area: string; title: string; status: 'ok' | 'warn' | 'fail'; event: 'found' | 'fixed' }
export interface ExportResult { kind: 'report' | 'logs' | 'issue'; ok: boolean; message: string }
export const SECTIONS: readonly HealthSection[];
export function healthButtonView(watch: unknown): HealthButtonView;
export function nextSection(current: string, key: string): SectionId | null;
export function isHealthHotkey(e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; code?: string } | null | undefined): boolean;
export function lastCheckTime(watch: unknown): number | null;
export function formatLocalTime(seconds: unknown, locale?: string, zone?: string): string;
export function parseHistory(data: unknown): HealthHistoryEvent[];
export function parseExportResult(data: unknown): ExportResult | null;
export function isOpenCenterMessage(data: unknown): boolean;
