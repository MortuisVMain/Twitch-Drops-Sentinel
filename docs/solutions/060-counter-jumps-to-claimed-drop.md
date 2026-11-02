# 060. The progress counter jumps to 100% and back

## Symptom
The dashboard counter showed the real value (Supply Crate 80/120, 67%), then 100% and "15 ИЗ 15" with the title of an
already claimed drop (Hunt White), then the real value again. The frontend ticker looked guilty but was not: polling
`/api/state` every 3 s showed the service itself replacing `active_drop` (103/120 -> claimed Hunt White 15/15 at the
one-minute progress tick), and it stayed replaced until the next channel gathering.

## Cause
`STATE_BRIDGE.active_drop` is one slot, and two paths let the wrong drop into it:
- `HeadlessInventory.update_drop` wrote to the slot. In the original Tk GUI that method only refreshes an inventory row,
  but `TimedDrop._on_state_changed` calls it for **every** drop of a campaign when minutes change. If the campaign is
  finished, `first_drop` is `None`, nothing restores the slot, and the last drop of the list stays on screen.
- `display_drop` accepted claimed drops. Twitch's `CurrentDrop` session (`gql_drop.display()`) can name a drop that was
  already claimed in another campaign of the same game, and a game often has several campaigns at once.

Which of the two fired in the live case is not in the log: drop progress is logged at the `CALL` level, below the file's
`INFO`. The fix closes both.

## Fix
`core/gui_headless.py`: `update_drop` refreshes only the drop already on screen, and `display_drop` ignores a claimed
drop unless it is the one on screen, so a farmed drop still reaches 100% when it finishes. Gate:
`test_claimed_drop_never_replaces_the_drop_being_farmed`.

## Not covered
`first_drop` (fewest minutes left) and the session's `gql_drop` can differ for two unclaimed drops running in parallel;
the counter can still alternate between those. Not seen live.

## Prevention
Anything that writes `active_drop` must answer "is this the drop being farmed?". `update_drop` means "this drop changed",
never "show this drop".
