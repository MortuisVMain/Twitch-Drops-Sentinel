export interface CopyFinding {
  id: string;
  kind: 'run_value' | 'startup_link' | 'scheduler_task' | 'process' | 'hklm_run' | string;
  name: string;
  target: string;
  copyDir: string | null;
  version: string | null;
  dirExists: boolean | null;
  removable: boolean;
  closable: boolean;
  location?: string;
  pid?: number | null;
  ownsAutostart?: boolean;
  startedAt?: number | null;
  taskPath?: string | null;
}

export interface CopyInfo {
  dir: string;
  version: string | null;
  running: boolean;
  exists: boolean;
  importable: boolean;
  dataTime: number | null; // epoch seconds of the newest profile file, null when unknown
}

export interface OwnData {
  nonDefaultConfig: boolean;
  signedIn: boolean;
  dataTime: number | null;
}

export interface StartupCopiesState {
  findings: CopyFinding[];
  autostartOwner: CopyFinding | null;
  copies: CopyInfo[];
  thisVersion: string;
  thisDir: string;
  ownData: OwnData;
  installerHint: { show: boolean; url: string };
}

export function normalizeState(raw: unknown): StartupCopiesState | null;
export function sortFindings(findings: CopyFinding[]): CopyFinding[];
export function removableCount(findings: CopyFinding[]): number;
export function importCandidates(copies: CopyInfo[]): CopyInfo[];
export function needsOwnDataConfirm(ownData: OwnData | undefined): boolean;
export function createSequencer(): { next(): number; isLatest(id: number): boolean };
export function removalMessage(body: unknown): { text: string; error: boolean };
export function errorMessage(body: unknown, status: number): string;
export function importWarning(ownData: OwnData | undefined, copy: CopyInfo | undefined, formatTime?: (seconds: number) => string): { newer: boolean; text: string };
