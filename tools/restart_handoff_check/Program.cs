// Checks the restart hand-off (marker argument, mutex wait) and the backend shutdown wait without a second copy of the app.
using TwitchDropsSentinel;

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); }
    else Console.WriteLine("ok:   " + what);
}

// marker argument
Check(RestartHandoff.RestartedArg == "--restarted", "the marker is --restarted");
Check(RestartHandoff.IsRestarted(new[] { "--restarted" }), "the marker is found");
Check(RestartHandoff.IsRestarted(new[] { "--minimized", "--RESTARTED" }), "the marker is found among other args, any case");
Check(!RestartHandoff.IsRestarted(new[] { "--minimized", "hellharvest://health" }), "other args are not the marker");
Check(!RestartHandoff.IsRestarted(null) && !RestartHandoff.IsRestarted(Array.Empty<string>()), "null and empty are not the marker");

// when to wait for the old copy
Check(RestartHandoff.ShouldWaitForMutex(false, new[] { "--restarted" }), "restarted child with a held mutex waits for it");
Check(!RestartHandoff.ShouldWaitForMutex(true, new[] { "--restarted" }), "restarted child that owns the mutex does not wait");
Check(!RestartHandoff.ShouldWaitForMutex(false, Array.Empty<string>()), "a plain second start never waits (it wakes the running copy)");
Check(!RestartHandoff.ShouldWaitForMutex(false, new[] { "--minimized" }), "--minimized alone never waits");
Check(RestartHandoff.MutexWaitMs >= 10_000 && RestartHandoff.MutexWaitMs <= 15_000, "the wait is bounded to 10-15 s");

// acquiring the mutex of a dying parent
using (var free = new Mutex(false))
    Check(RestartHandoff.TryAcquire(free, 200), "a free mutex is acquired at once");

using (var held = new Mutex(false))
{
    var holding = new ManualResetEventSlim();
    var release = new ManualResetEventSlim();
    var t = new Thread(() => { held.WaitOne(); holding.Set(); release.Wait(); });
    t.Start();
    holding.Wait();
    var sw = System.Diagnostics.Stopwatch.StartNew();
    bool got = RestartHandoff.TryAcquire(held, 300);
    Check(!got && sw.ElapsedMilliseconds >= 250, "a mutex that stays held times out and reports false");
    release.Set(); // the thread ends without ReleaseMutex: the mutex is abandoned
    t.Join();
    Check(RestartHandoff.TryAcquire(held, 2000), "an abandoned mutex (parent exited without releasing) counts as acquired");
}

// restart command line
Check(RestartHandoff.RestartArguments() == "--restarted", "the restart passes only the marker");

// backend shutdown wait
var quick = BackendShutdownWait.For(false);
var graceful = BackendShutdownWait.For(true);
Check(quick == TimeSpan.FromMilliseconds(2500), "a failed /api/shutdown keeps the short 2.5 s wait");
Check(graceful >= TimeSpan.FromSeconds(20) && graceful <= TimeSpan.FromSeconds(25), "an accepted /api/shutdown waits for the Steam IDLE budget (19 s) plus margin");

Console.WriteLine(failures == 0 ? "ALL PASSED" : $"{failures} FAILED");
return failures == 0 ? 0 : 1;
