// What a view shows while its data is loading, failed or arrived. No imports, so the test gate can bundle the file on its own.

export type LoadFailure = 'http' | 'network' | 'shape';

export interface LoadState<T> {
  phase: 'loading' | 'error' | 'ready';
  data: T | null;
  /** Set on 'error', and on 'ready' when the latest poll failed but earlier data is still shown. */
  failure: LoadFailure | null;
  status: number | null;
}

export const initialLoad = <T>(): LoadState<T> => ({ phase: 'loading', data: null, failure: null, status: null });

export const loadOk = <T>(data: T): LoadState<T> => ({ phase: 'ready', data, failure: null, status: null });

/** A failed poll never erases what is already on screen. */
export const loadFailed = <T>(prev: LoadState<T>, failure: LoadFailure, status: number | null = null): LoadState<T> =>
  prev.data !== null
    ? { phase: 'ready', data: prev.data, failure, status }
    : { phase: 'error', data: null, failure, status };

/** A retry shows the skeleton again only when there is nothing to show; the 5 s poll never flashes it. */
export const loadRetry = <T>(prev: LoadState<T>): LoadState<T> =>
  prev.data === null ? { phase: 'loading', data: null, failure: null, status: null } : prev;

export const hasStaleData = <T>(state: LoadState<T>): boolean => state.phase === 'ready' && state.failure !== null;

/** The service's answer must at least carry the runner; stores and inventory are optional but must have their shape. */
export const isGiveawaysState = (json: unknown): boolean => {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return false;
  const body = json as Record<string, unknown>;
  const runner = body.runner as Record<string, unknown> | null | undefined;
  if (typeof runner !== 'object' || runner === null || typeof runner.state !== 'string') return false;
  if (body.stores !== undefined && (typeof body.stores !== 'object' || body.stores === null || Array.isArray(body.stores))) return false;
  if (body.inventory !== undefined && !Array.isArray(body.inventory)) return false;
  return true;
};

export const failureText = (failure: LoadFailure): string => {
  if (failure === 'http') return 'Служба ответила ошибкой.';
  if (failure === 'network') return 'Не удалось связаться со службой.';
  return 'Служба ответила в неожиданном формате.';
};

/** The dimmer gets its list from the shell as a message: nothing yet is not the same as an empty list. */
export type DimmerPhase = 'waiting' | 'timeout' | 'ready';

export const DIMMER_HOST_TIMEOUT_MS = 6000;

export const dimmerPhase = (received: boolean, timedOut: boolean): DimmerPhase =>
  received ? 'ready' : timedOut ? 'timeout' : 'waiting';
