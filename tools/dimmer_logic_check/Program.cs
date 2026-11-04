// Checks the dimmer logic without a monitor, a sound card or real time: waits are completed by hand.
using TwitchDropsSentinel;

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); }
    else Console.WriteLine("ok:   " + what);
}
string Fmt(List<(string, int)> w) => string.Join(",", w.Select(x => $"{x.Item1}={x.Item2}"));

// A debounce window that ends only when Tick() is called; cancelling the token cancels the wait like Task.Delay does.
var waiters = new List<(TaskCompletionSource<bool> Tcs, CancellationToken Token)>();
Task ManualWait(CancellationToken token)
{
    var tcs = new TaskCompletionSource<bool>();
    token.Register(() => tcs.TrySetCanceled(token));
    waiters.Add((tcs, token));
    return tcs.Task;
}
void Tick()
{
    var now = waiters.ToList();
    waiters.Clear();
    foreach (var w in now) w.Tcs.TrySetResult(true);
}

(BrightnessDebouncer D, List<(string, int)> Writes, List<Exception> Errors) NewDebouncer(Func<string, int, bool>? failOn = null)
{
    waiters.Clear();
    var writes = new List<(string, int)>();
    var errors = new List<Exception>();
    var d = new BrightnessDebouncer(ManualWait, (id, lvl) =>
    {
        if (failOn != null && failOn(id, lvl)) throw new InvalidOperationException("bus error");
        writes.Add((id, lvl));
    }, errors.Add);
    return (d, writes, errors);
}

// C11: separate monitors, one window
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 80); d.Post("B", 70); Tick();
    Check(Fmt(w) == "A=80,B=70", $"A->80 and B->70 inside one window give two writes ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 60); d.Post("A", 65); d.Post("A", 70); Tick();
    Check(Fmt(w) == "A=70", $"A->60->65->70 gives one write of 70 ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("master", 50); d.Post("A", 60); Tick();
    Check(Fmt(w) == "master=50,A=60", $"a single value after master is kept and comes after it ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 60); d.Post("master", 50); Tick();
    Check(Fmt(w) == "master=50", $"master cancels the pending single value ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("master", 40); d.Post("master", 45); Tick();
    Check(Fmt(w) == "master=45", $"two masters give the last one ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    Check(!d.IsPending("A"), "nothing is pending at the start");
    d.Post("master", 50);
    Check(d.IsPending("A") && d.IsPending("B"), "a pending master makes every monitor pending");
    Tick();
    Check(!d.IsPending("A") && !d.IsPending("master"), "nothing is pending once written");
    d.Post("A", 10);
    Check(d.IsPending("A") && !d.IsPending("B"), "a single value is pending only for its monitor");
    Tick();
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 10); d.Post("master", 20); d.CancelAll(); Tick();
    Check(w.Count == 0 && !d.IsPending("A"), "CancelAll on close drops every waiting write");
}
{
    var (d, w, e) = NewDebouncer((id, lvl) => id == "A");
    d.Post("A", 10); d.Post("B", 20); Tick();
    Check(e.Count == 1 && Fmt(w) == "B=20", $"a failed write goes to onError and does not stop the next ({Fmt(w)}, errors {e.Count})");
}
{
    waiters.Clear();
    var (d, w, _) = NewDebouncer();
    d.Post("A", 10);
    var token = waiters[0].Token;
    Tick();
    bool disposed;
    try { _ = token.WaitHandle; disposed = false; } catch (ObjectDisposedException) { disposed = true; }
    Check(disposed, "the token source of a finished write is disposed");
}

// C12: sound before and after a blackout
{
    bool muted = false; int muteCalls = 0, unmuteCalls = 0;
    var mem = new BlackoutMuteMemory();
    void Enter() => mem.Enter(() => muted, () => { muted = true; muteCalls++; });
    void Exit() => mem.Exit(() => { muted = false; unmuteCalls++; });
    Enter(); Enter();
    Check(muted && muteCalls == 1, "a repeated blackout does nothing the second time");
    Exit();
    Check(!muted && unmuteCalls == 1, "unmuted -> blackout -> blackout again -> exit returns the sound");
    Exit();
    Check(unmuteCalls == 1, "a second exit does nothing");
}
{
    bool muted = true; int unmuteCalls = 0;
    var mem = new BlackoutMuteMemory();
    mem.Enter(() => muted, () => muted = true);
    mem.Enter(() => muted, () => muted = true);
    mem.Exit(() => { muted = false; unmuteCalls++; });
    Check(muted && unmuteCalls == 0, "a sound that was muted before stays muted");
}
{
    bool muted = false; int muteCalls = 0, unmuteCalls = 0;
    var mem = new BlackoutMuteMemory();
    mem.Exit(() => unmuteCalls++);
    Check(unmuteCalls == 0, "an exit without an entry does not touch the sound");
    bool threw = false;
    try { mem.Enter(() => throw new InvalidOperationException("no audio device"), () => muteCalls++); } catch (InvalidOperationException) { threw = true; }
    Check(threw && muteCalls == 0, "a failed read is reported and nothing is muted");
    mem.Enter(() => muted, () => { muted = true; muteCalls++; });
    Check(muted && muteCalls == 1, "after a failed read the next blackout still counts as the entry");
    mem.Exit(() => { muted = false; unmuteCalls++; });
    Check(!muted && unmuteCalls == 1, "and returns the sound");
}

// C10: what a poll shows
{
    var cache = new Dictionary<string, int> { ["m"] = 80 };
    Check(BrightnessReading.Resolve(cache, "m", 60, 75, explicitRefresh: false, writePending: false) == 80 && cache["m"] == 80,
          "cache 80, hardware 60: a normal read keeps 80");
    Check(BrightnessReading.Resolve(cache, "m", 60, 75, explicitRefresh: true, writePending: false) == 60 && cache["m"] == 60,
          "cache 80, hardware 60: an explicit poll shows 60 and stores it");
}
{
    var cache = new Dictionary<string, int> { ["m"] = 80 };
    Check(BrightnessReading.Resolve(cache, "m", 60, 75, explicitRefresh: true, writePending: true) == 80 && cache["m"] == 80,
          "a pending write is not rolled back by a poll");
    Check(BrightnessReading.Resolve(cache, "m", null, 75, explicitRefresh: true, writePending: false) == 80,
          "a failed read does not replace the known value");
}
{
    var cache = new Dictionary<string, int>();
    Check(BrightnessReading.Resolve(cache, "a", 33, 75, false, false) == 33 && cache["a"] == 33, "first read takes the hardware value");
    Check(BrightnessReading.Resolve(cache, "b", null, 75, false, false) == 75 && cache["b"] == 75, "first read without hardware takes the fallback");
}

Console.WriteLine(failures == 0 ? "ALL DIMMER CHECKS PASSED" : $"{failures} DIMMER CHECK(S) FAILED");
return failures == 0 ? 0 : 1;
