export type CheckStatus = 'ok' | 'warn' | 'fail';
export type CheckArea = 'service' | 'twitch' | 'steam' | 'giveaways' | 'network' | 'updates' | 'settings' | 'system';

export interface DiagnosticCheck {
  id: string;
  status: CheckStatus;
  area: CheckArea;
  title: string;
  detail: string;
  advice: string;
  action: 'close_other' | null;
  pid: number | null;
}

export interface DiagnosticsResult {
  checks: DiagnosticCheck[];
  report: string;
  error: string | null;
}

export function statusView(status: string): { icon: 'check' | 'alert' | 'cross'; tone: CheckStatus };
export function parseDiagnosticsMessage(data: unknown): DiagnosticsResult | null;
export const AREA_ORDER: readonly CheckArea[];
export function groupChecks(checks: DiagnosticCheck[]): { area: CheckArea; checks: DiagnosticCheck[] }[];
export function countProblems(checks: DiagnosticCheck[]): { fail: number; warn: number };
export function overallStatus(checks: DiagnosticCheck[]): CheckStatus;
export function hostAvailable(win: unknown): boolean;
