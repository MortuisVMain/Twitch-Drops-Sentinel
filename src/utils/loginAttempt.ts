// A login attempt worked only if the engine confirmed a login after it started: an account known from before proves nothing.
export const loginAttemptSucceeded = (
  store: { loginConfirmedAt?: number | null } | null | undefined,
  attemptStartedAt: number,
): boolean => (store?.loginConfirmedAt ?? 0) >= attemptStartedAt;
