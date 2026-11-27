// Checks the debounce of the window-position save: many Move events lead to one save, and a close flushes the pending one.
using TwitchDropsSentinel;

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); }
    else Console.WriteLine("ok:   " + what);
}

var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
var d = new WindowSaveDebounce(TimeSpan.FromMilliseconds(500));

Check(!d.Pending && !d.IsDue(t0), "nothing pending at the start, nothing due");
for (int i = 0; i < 100; i++) d.Touch(t0.AddMilliseconds(i * 5)); // a drag: 100 Move events in 0.5 s
Check(d.Pending, "a Move marks a save as pending");
Check(!d.IsDue(t0.AddMilliseconds(700)), "not due while the last Move is younger than the delay (last at 495 ms)");
Check(d.IsDue(t0.AddMilliseconds(995)), "due once the delay passed since the last Move");
Check(!d.Pending && !d.IsDue(t0.AddMilliseconds(2000)), "a due check consumes the pending save: exactly one save per drag");

d.Touch(t0.AddSeconds(10));
Check(d.Flush(), "flush reports a pending save (close must save the last position)");
Check(!d.Flush() && !d.IsDue(t0.AddSeconds(20)), "after a flush nothing is pending");
Check(!new WindowSaveDebounce(TimeSpan.Zero).Flush(), "flush with nothing pending reports false");

Console.WriteLine(failures == 0 ? "ALL PASSED" : $"{failures} FAILED");
return failures == 0 ? 0 : 1;
