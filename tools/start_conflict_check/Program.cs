// Checks the start-conflict decision without a second copy of the app: processes, dialogs and waits are fakes.
using TwitchDropsSentinel;

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); }
    else Console.WriteLine("ok:   " + what);
}

string root = Path.Combine(Path.GetTempPath(), "start_conflict_" + Guid.NewGuid().ToString("N"));
string OldDir = Path.Combine(root, "Old Copy");
string OlderDir = Path.Combine(root, "Older Copy");
string NewerDir = Path.Combine(root, "Newer Copy");
string NewDir = Path.Combine(root, "New Copy");
string Nowhere = Path.Combine(root, "Nowhere");
foreach (var (dir, version) in new[] { (OldDir, "3.7.0"), (OlderDir, "3.5.1"), (NewerDir, "3.11.0") })
{
    Directory.CreateDirectory(Path.Combine(dir, "core"));
    File.WriteAllText(Path.Combine(dir, "core", "version.py"), $"__version__ = \"{version}\"\n");
}
Directory.CreateDirectory(Path.Combine(NewDir, "core"));
File.WriteAllText(Path.Combine(NewDir, "core", "settings.json"), "{ \"language\": \"English\" }");

try
{
    // versions
    Check(StartConflict.ReadVersion(OldDir) == "3.7.0", "the version is read from core/version.py");
    Check(StartConflict.ReadVersion(Nowhere) == null, "no folder, no version");
    Check(StartConflict.CompareVersions("3.7.0", "3.10.0") < 0, "3.7.0 is older than 3.10.0 (numbers, not text)");
    Check(StartConflict.CompareVersions("3.10.0", "3.10.0") == 0, "equal versions");
    Check(StartConflict.CompareVersions("3.10.1", "3.10.0") > 0, "3.10.1 is newer");
    Check(StartConflict.CompareVersions("3.10", "3.10.0") == 0, "a missing part is zero");
    Check(StartConflict.CompareVersions("3.10.0-beta", "3.10.0") == 0, "a suffix does not change the numbers");
    Check(StartConflict.IsKnownVersion("3.7.0") && StartConflict.IsKnownVersion("3.10.0-beta") && StartConflict.IsKnownVersion("3"), "dotted numbers are versions");
    Check(!StartConflict.IsKnownVersion(null) && !StartConflict.IsKnownVersion("") && !StartConflict.IsKnownVersion("latest") && !StartConflict.IsKnownVersion("v3.x") && !StartConflict.IsKnownVersion("a.b.c"),
        "text, empty and null are not versions");

    // language and text
    Check(!StartConflict.IsRussian(NewDir, "ru"), "the app's own language setting wins over the system language");
    Check(StartConflict.IsRussian(Nowhere, "ru") && !StartConflict.IsRussian(Nowhere, "en"), "without a setting the system language decides");
    string ru = StartConflict.DialogText("3.7.0", OldDir, true);
    string en = StartConflict.DialogText("3.7.0", OldDir, false);
    Check(ru.Contains("Запущена другая копия v3.7.0") && ru.Contains(OldDir) && ru.Contains("Закрыть её и запустить эту?"), "Russian text names the version and folder and asks");
    Check(en.Contains("Another copy, v3.7.0") && en.Contains(OldDir) && en.Contains("Close it and start this one?"), "English text names the version and folder and asks");
    Check(StartConflict.DialogText(null, OldDir, false).Contains("Another copy is running from"), "an unknown version is not printed as a version");
    string many = StartConflict.DialogText(new (string?, string)[] { ("3.7.0", OldDir), ("3.5.1", OlderDir) }, false);
    Check(many.Contains(OldDir) && many.Contains(OlderDir) && many.Contains("Close them and start this one?"), "several copies are listed and asked about together");

    // the same folder, whatever the spelling
    Check(StartConflict.Normalize(NewDir) == StartConflict.Normalize(NewDir.ToUpperInvariant() + Path.DirectorySeparatorChar), "case and a trailing separator do not make another folder");
    Check(StartConflict.Normalize(NewDir) == StartConflict.Normalize(NewDir.Replace('\\', '/')), "slash direction does not make another folder");

    // the decision
    RunningCopy Copy(int pid, string dir, string exe = "TwitchDropsSentinel.exe") => new(pid, Path.Combine(dir, exe), new DateTime(2026, 11, 1, 10, 0, 0));
    var closed = new List<int>();
    var asked = new List<string>();
    StartConflictOutcome Run(IEnumerable<RunningCopy> running, bool answer, bool mutexFree = true, string ours = "3.10.0")
    {
        closed.Clear(); asked.Clear();
        return StartConflict.Resolve(NewDir, ours, 100, running, StartConflict.ReadVersion,
            copies => { asked.AddRange(copies.Select(c => c.Version + "@" + c.Dir)); return answer; }, copy => closed.Add(copy.Pid), () => mutexFree);
    }
    Check(Run(new[] { Copy(5, OldDir) }, true) == StartConflictOutcome.StartThisCopy && closed.SequenceEqual(new[] { 5 }), "Yes: the older copy is closed and this one starts");
    Check(asked.Count == 1 && asked[0] == "3.7.0@" + OldDir, "the dialog got the version and folder");
    Check(Run(new[] { Copy(5, OldDir) }, false) == StartConflictOutcome.WakeExisting && closed.Count == 0, "No: the old behaviour, nothing is closed");
    Check(Run(new[] { Copy(5, OldDir) }, true, mutexFree: false) == StartConflictOutcome.WakeExisting, "if the mutex never frees, this copy does not start");
    Check(Run(new[] { new RunningCopy(5, Path.Combine(NewDir, "TwitchDropsSentinel.exe").ToUpperInvariant(), DateTime.Now) }, true) == StartConflictOutcome.WakeExisting && asked.Count == 0,
        "the same folder (any case) is the old behaviour, no question");
    Check(Run(new[] { Copy(100, OldDir) }, true) == StartConflictOutcome.WakeExisting && asked.Count == 0, "our own pid is skipped");
    Check(Run(Array.Empty<RunningCopy>(), true) == StartConflictOutcome.WakeExisting && asked.Count == 0, "nothing found: the old behaviour");
    Check(Run(new[] { Copy(5, OldDir) }, true, ours: "3.7.0") == StartConflictOutcome.WakeExisting && asked.Count == 0, "an equal version is left alone");
    Check(Run(new[] { Copy(5, OldDir) }, true, ours: "3.6.0") == StartConflictOutcome.WakeExisting && asked.Count == 0 && closed.Count == 0, "a newer running copy is left alone");
    Check(Run(new[] { Copy(7, OldDir, "notepad.exe") }, true) == StartConflictOutcome.WakeExisting, "only the app's exe is considered");

    string NoVersionDir = Path.Combine(root, "NoVersion");
    Directory.CreateDirectory(NoVersionDir);
    Check(Run(new[] { Copy(6, NoVersionDir) }, true) == StartConflictOutcome.WakeExisting && asked.Count == 0 && closed.Count == 0, "an unknown version is never treated as older: no question, nothing closed");
    string TextVersionDir = Path.Combine(root, "TextVersion");
    Directory.CreateDirectory(Path.Combine(TextVersionDir, "core"));
    File.WriteAllText(Path.Combine(TextVersionDir, "core", "version.py"), "__version__ = \"latest\"\n");
    Check(Run(new[] { Copy(6, TextVersionDir) }, true) == StartConflictOutcome.WakeExisting && asked.Count == 0, "a non-numeric version string counts as unknown");
    Check(Run(new[] { Copy(5, OldDir) }, true, ours: "dev") == StartConflictOutcome.WakeExisting && asked.Count == 0, "when our own version is unknown nothing is compared or closed");

    // several candidates: all older ones are handled together, or none
    Check(Run(new[] { Copy(5, OldDir), Copy(8, OlderDir) }, true) == StartConflictOutcome.StartThisCopy && closed.SequenceEqual(new[] { 5, 8 }) && asked.Count == 2, "two older copies: one question about both, both closed");
    Check(Run(new[] { Copy(5, OldDir), Copy(8, OlderDir) }, false) == StartConflictOutcome.WakeExisting && closed.Count == 0, "two older copies, No: neither is closed");
    Check(Run(new[] { Copy(5, OldDir), Copy(9, NewerDir) }, true) == StartConflictOutcome.WakeExisting && closed.Count == 0 && asked.Count == 0,
        "an older and a newer copy: the mutex owner is unknowable, so nothing is asked or closed and the newer copy is never touched");
    Check(Run(new[] { Copy(9, NewerDir) }, true) == StartConflictOutcome.WakeExisting && closed.Count == 0, "a newer copy alone is never closed");
    Check(Run(new[] { Copy(5, OldDir), Copy(6, NoVersionDir) }, true) == StartConflictOutcome.WakeExisting && closed.Count == 0, "an older and an unknown copy: nothing is closed");

    // closing: verified, polite first, kill only when it did not exit
    var start = new DateTime(2026, 11, 1, 10, 0, 0);
    var target = Copy(5, OldDir);
    var logs = new List<string>();
    FakeProcess Fake(bool exited = false, DateTime? startTime = null, string? exe = null, bool exitsOnClose = true) =>
        new() { Exited = exited, Start = startTime ?? start, Exe = exe ?? target.ExePath, ExitsOnClose = exitsOnClose };

    var p = Fake();
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.ClosedGracefully && p.Steps == "close,wait", "a copy that exits by itself is not killed");
    p = Fake(exitsOnClose: false);
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.Killed && p.Steps == "close,wait,kill" && p.Waited == TimeSpan.FromSeconds(10), "after the grace time the whole tree is killed");
    p = Fake(exited: true);
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.AlreadyGone && p.Steps == "", "a copy that already exited is treated as closed, nothing is sent");
    p = Fake(startTime: start.AddMinutes(5));
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.NotThatProcess && p.Steps == "", "a pid reused by a newer process (other start time) is left alone");
    p = Fake(exe: Path.Combine(root, "elsewhere", "TwitchDropsSentinel.exe"));
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.NotThatProcess && p.Steps == "", "a pid that now runs another exe is left alone");
    p = Fake(exe: target.ExePath.ToUpperInvariant());
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.ClosedGracefully, "the exe path is compared the same way as folders (any case)");
    p = Fake(exitsOnClose: false);
    p.SwapAfterClose = true;
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.NotThatProcess && p.Steps == "close,wait", "the process is verified again before the kill");
    p = Fake();
    p.ThrowOnStart = true;
    Check(StartConflict.CloseVerified(target, p, TimeSpan.FromSeconds(10), logs.Add) == CloseOutcome.AlreadyGone, "a process that exits while it is being checked counts as closed, without an exception");
    Check(logs.Count >= 7 && logs.All(l => l.Contains("pid 5")), "every path says what it did");

    // the real mutex hand-over: an owner that dies without releasing hands the mutex over (abandoned), a live owner does not
    string name = @"Local\StartConflictCheck_" + Guid.NewGuid().ToString("N");
    using var mine = new Mutex(false, name);
    var dying = new Thread(() => { using var m = new Mutex(false, name); m.WaitOne(); }); // exits owning it: abandoned
    dying.Start(); dying.Join();
    Check(StartConflict.AcquireAfter(mine, TimeSpan.FromSeconds(2)), "an abandoned mutex (owner killed) is taken over");
    mine.ReleaseMutex();
    using var held = new ManualResetEventSlim();
    using var release = new ManualResetEventSlim();
    var living = new Thread(() => { using var m = new Mutex(false, name); m.WaitOne(); held.Set(); release.Wait(); m.ReleaseMutex(); });
    living.Start(); held.Wait();
    Check(!StartConflict.AcquireAfter(mine, TimeSpan.FromMilliseconds(200)), "a live owner keeps the mutex");
    release.Set(); living.Join();
}
finally
{
    try { Directory.Delete(root, true); } catch { }
}

if (failures > 0) { Console.WriteLine($"{failures} START CONFLICT CHECKS FAILED"); return 1; }
Console.WriteLine("ALL START CONFLICT CHECKS PASSED");
return 0;

sealed class FakeProcess : IProcessHandle
{
    public bool Exited, ExitsOnClose = true, SwapAfterClose, ThrowOnStart;
    public DateTime Start;
    public string? Exe;
    public string Steps = "";
    public TimeSpan Waited;

    public bool HasExited => Exited;
    public DateTime StartTime => ThrowOnStart ? throw new InvalidOperationException("exited") : Start;
    public string? ExePath => Exe;
    public bool RequestClose() { Steps += Steps.Length == 0 ? "close" : ",close"; if (ExitsOnClose) Exited = true; return true; }
    public bool WaitForExit(TimeSpan timeout)
    {
        Steps += ",wait"; Waited = timeout;
        if (SwapAfterClose) Start = Start.AddMinutes(5); // the pid went to another process while we waited
        return Exited;
    }
    public void KillTree() { Steps += ",kill"; Exited = true; }
}
