export type CheckStatus = 'ok' | 'warn' | 'fail';
export type CheckArea = 'service' | 'twitch' | 'steam' | 'giveaways' | 'network' | 'updates' | 'settings' | 'system';

export interface DiagnosticFix {
  id: string;
  label: string;
  confirm: string | null;
  client: boolean;
  uri: string | null;
  code: string | null;
}

export interface FixResult {
  id: string;
  ok: boolean;
  message: string;
  restart: boolean;
}

export interface FixPlan {
  confirm: string | null;
  messages: { type: string; [key: string]: unknown }[];
  copy: string | null;
}

export interface DiagnosticCheck {
  id: string;
  status: CheckStatus;
  area: CheckArea;
  title: string;
  detail: string;
  advice: string;
  action: 'close_other' | null;
  pid: number | null;
  fix: DiagnosticFix | null;
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
export function planFix(fix: DiagnosticFix | null | undefined, busy: boolean): FixPlan | null;
export function parseFixResult(data: unknown): FixResult | null;
export function noticeFor(check: DiagnosticCheck, notice: FixResult | null): boolean;
export function noticeOrphan(checks: DiagnosticCheck[], notice: FixResult | null): boolean;
export function restartOffered(notice: FixResult | null): boolean;
export function controlsBusy(running: boolean, fixing: string | null): boolean;
