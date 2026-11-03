// A login attempt worked only if the engine confirmed a login after it started: an account known from before proves nothing.
export const loginAttemptSucceeded = (
  store: { loginConfirmedAt?: number | null } | null | undefined,
  attemptStartedAt: number,
): boolean => (store?.loginConfirmedAt ?? 0) >= attemptStartedAt;

// The "sign in in the browser window" hint is only true until this attempt is confirmed; an error replaces it.
export const loginHintVisible = (
  store: { loginConfirmedAt?: number | null } | null | undefined,
  attemptStartedAt: number,
  actionError: string | null,
): boolean => !actionError && !loginAttemptSucceeded(store, attemptStartedAt);
