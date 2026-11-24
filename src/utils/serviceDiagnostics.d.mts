export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DiagnosticCheck {
  id: string;
  status: CheckStatus;
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
export function overallStatus(checks: DiagnosticCheck[]): CheckStatus;
export function hostAvailable(win: unknown): boolean;
