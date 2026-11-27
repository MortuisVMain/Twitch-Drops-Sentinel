"""Decides when the farm steps aside for a game the user started themselves, and when it may go on.

Pure logic: the caller reads Steam's RunningAppID and passes it in with the app ids the app itself holds. What Steam
writes there while the app's own helper processes hold games is unverified, so a value counts only after it was seen
twice in a row and is not one of the held ids.
"""
CONFIRM_CHECKS = 2
RESUME_AFTER_SECONDS = 120.0


class PlayWatch:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        """Forget an own pause (the user took over) and the debounce."""
        self.paused: tuple[int, float] | None = None  # the user's app id, when the pause began
        self._seen, self._streak, self._clear_since, self._dismissed = 0, 0, None, 0

    def dismiss(self) -> None:
        """The user took the pause into their own hands: drop it and ignore this game until it has closed."""
        dismissed = self.paused[0] if self.paused else self._seen
        self.reset()
        self._dismissed = dismissed

    def observe(self, running: int, held: frozenset[int], now: float) -> tuple[str, int] | None:
        """One check: ("pause", app_id) or ("resume", app_id) when the caller must act, else None."""
        candidate = running if running and running not in held else 0
        if candidate and candidate == self._dismissed:
            candidate = 0
        elif candidate != self._dismissed:
            self._dismissed = 0  # it closed (or another game came): the ignored one no longer counts
        self._streak = self._streak + 1 if candidate and candidate == self._seen else (1 if candidate else 0)
        self._seen = candidate
        if self.paused is None:
            if self._streak >= CONFIRM_CHECKS:
                self.paused, self._clear_since = (candidate, now), None
                return "pause", candidate
            return None
        if candidate:
            self.paused, self._clear_since = (candidate, self.paused[1]), None
            return None
        self._clear_since = now if self._clear_since is None else self._clear_since
        if now - self._clear_since >= RESUME_AFTER_SECONDS:
            app_id, self.paused = self.paused[0], None
            return "resume", app_id
        return None
