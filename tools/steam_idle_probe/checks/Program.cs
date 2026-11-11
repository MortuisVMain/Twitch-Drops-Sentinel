using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using SteamIdleProbe;

if (args is ["parent-watch-fixture", var watchedId, var watchedStart])
{
    using var watched = IdentityWorker.WatchParent(int.Parse(watchedId), long.Parse(watchedStart));
    if (watched is null) return 1;
    Console.WriteLine("ready");
    await Task.Delay(Timeout.InfiniteTimeSpan);
}

if (args is ["worker-fixture", var mode, .. var fixtureRest])
{
    if (mode.StartsWith("apps-") || mode.StartsWith("hold-"))
        return await StreamFixture(mode, fixtureRest);
    if (mode == "orphan-parent")
    {
        using var self = Process.GetCurrentProcess();
        var childStart = new ProcessStartInfo("dotnet") { RedirectStandardOutput = true, UseShellExecute = false };
        childStart.ArgumentList.Add(typeof(FakeNative).Assembly.Location);
        childStart.ArgumentList.Add("parent-watch-fixture");
        childStart.ArgumentList.Add(self.Id.ToString());
        childStart.ArgumentList.Add(self.StartTime.ToUniversalTime().Ticks.ToString());
        using var child = Process.Start(childStart)!;
        if (await child.StandardOutput.ReadLineAsync() != "ready") return 1;
        Console.WriteLine(child.Id);
        await Task.Delay(Timeout.InfiniteTimeSpan);
    }
    if (mode.StartsWith("app-"))
        return IdentityWorker.Encode(new("connected", "expected_account_confirmed", null, mode[4] == '1', mode[6] == '1'));
    if (mode == "hang")
        await Task.Delay(Timeout.InfiniteTimeSpan);
    Console.Out.WriteLine("untrusted stdout");
    Console.Error.WriteLine("untrusted stderr");
    return mode == "noisy" ? IdentityWorker.Encode(new("connected", "expected_account_confirmed")) : 123;
}

if (args is ["--abi", var fixtureLibrary])
{
    nint library = NativeLibrary.Load(Path.GetFullPath(fixtureLibrary));
    try
    {
        var getUser = Marshal.GetDelegateForFunctionPointer<AbiUser>(
            NativeLibrary.GetExport(library, "GetFixtureUser"));
        Require(WindowsSteamClient.ReadSteamId(getUser()) == 0x011000010000002aUL, "MSVC x64 class return");
    }
    finally
    {
        NativeLibrary.Free(library);
    }
}

var fixture = Directory.CreateTempSubdirectory("steam-probe-checks-");
try
{
    Require(Discovery.ClassifyIdentity(null) == "no_registry_hint", "absent user");
    Require(Discovery.ClassifyIdentity(0) == "no_registry_hint", "zero user");
    Require(Discovery.ClassifyIdentity(-1) == "unverified_registry_hint", "unsigned registry DWORD");
    Require(Discovery.ClassifyIdentity("1") == "unknown", "wrong registry value type");

    var empty = Discovery.Inspect([fixture.FullName], "no_registry_hint");
    Require(empty.Installation.Status == "not_detected" && empty.Error is null, "absent Steam");
    Require(Discovery.Inspect([], "unknown", true).Error == "discovery_incomplete", "unreadable registry");
    Require(Discovery.Inspect([@"\\not-a-server\share"], "unknown").Error == "discovery_incomplete",
        "UNC rejected without accessing network");

    var clientPath = Path.Combine(fixture.FullName, "steam.exe");
    File.WriteAllBytes(clientPath, [0x4d, 0x5a]);
    var malformed = Discovery.Inspect([fixture.FullName], "unknown");
    Require(malformed.Error == "discovery_incomplete" && malformed.Installation.Client?.Status == "invalid_pe",
        "truncated client is not detected");

    File.Copy(typeof(Discovery).Assembly.Location, clientPath, overwrite: true);
    File.WriteAllBytes(Path.Combine(fixture.FullName, "steamclient.dll"), [0x4d, 0x5a]);
    var detected = Discovery.Inspect(["invalid", fixture.FullName], "unverified_registry_hint");
    Require(detected.Installation is
    {
        Status: "detected", Client: { Status: "readable", Architecture: not null, Version: not null },
        Runtime32.Status: "invalid_pe", Runtime64.Status: "missing",
    } && detected.Error is null, "readable client with independently classified runtimes");

    foreach (var arguments in new[] { Array.Empty<string>(), ["unexpected-secret"], ["probe", "extra"],
        ["identity", "76561197960265728"], ["identity", "123"], ["--identity-worker", "123"],
        ["--identity-worker", "76561197960265770"], ["--apps-worker", "76561197960265770"],
        ["--hold-worker", "76561197960265770", "10"], ["apps"], ["apps", "123"], ["apps", "76561197960265770", "10"],
        ["hold"], ["hold", "76561197960265770"], ["hold", "76561197960265770", "0"], ["hold", "123", "10"],
        ["hold", "76561197960265770", "10", "extra"] })
    {
        var (exitCode, response) = await RunProbe(arguments);
        using (response)
        {
            Require(exitCode == 2, "bad command exit");
            Require(response.RootElement.GetProperty("protocolVersion").GetInt32() == 2, "protocol version");
            Require(response.RootElement.GetProperty("error").GetString() == "invalid_command", "bad command error");
            Require(response.RootElement.EnumerateObject().Count() == 2, "does not echo input");
        }
    }

    const ulong expected = 0x011000010000002aUL;
    Require(ClientIdentity.TryParse("76561197960265770", out ulong id) && id == expected, "valid SteamID64");
    foreach (var invalid in new[] { "76561197960265728", "18446744073709551615", " 76561197960265770",
        (expected ^ (1UL << 56)).ToString(), (expected ^ (1UL << 52)).ToString(),
        (expected ^ (1UL << 32)).ToString() })
        Require(!ClientIdentity.TryParse(invalid, out _), "invalid SteamID universe, type, instance or account");

    foreach (var path in new[] { @"\\server\share", @"\\?\C:\Steam", @"C:Steam", @"C:\Steam:stream", "Steam" })
        Require(!TrustedClient.IsFixedDrivePath(path), "unsafe path");
    CheckSignatureTrust(fixture.FullName);
    foreach (var workerMode in new[] { "--identity-worker", "--apps-worker", "--hold-worker" })
    {
        using var self = Process.GetCurrentProcess();
        string[] workerArgs = workerMode == "--hold-worker"
            ? [workerMode, "76561197960265770", "10", self.Id.ToString(), (self.StartTime.ToUniversalTime().Ticks + 1).ToString()]
            : [workerMode, "76561197960265770", self.Id.ToString(), (self.StartTime.ToUniversalTime().Ticks + 1).ToString()];
        var (rawExit, rawOut) = await RunRaw(workerArgs);
        Require(rawExit == 1 && rawOut.Length == 0, $"{workerMode} watchdog rejects changed parent generation before native work");
    }
    var broken = new WindowsSteamClient(0x1000, 0x2000);
    broken.Dispose();
    broken.Dispose();
    Require(broken.ReleaseFailed, "failed library release is recorded, not thrown from Dispose");

    CheckIdentity(new(), "expected_account_confirmed", null,
        "pipe,user,interface,online,id,online,id,release_user,release_pipe");
    CheckIdentity(new(), "unverified", "active_account_changed", "", () => false);
    CheckIdentity(new() { Pipe = 0 }, "unverified", "pipe_unavailable", "pipe");
    CheckIdentity(new() { User = 0 }, "unverified", "global_user_unavailable", "pipe,user,release_pipe");
    CheckIdentity(new() { HasInterface = false }, "unverified", "user_interface_unsupported",
        "pipe,user,interface,release_user,release_pipe");
    CheckIdentity(new() { Online = false }, "unverified", "client_offline",
        "pipe,user,interface,online,release_user,release_pipe");
    CheckIdentity(new() { Id = expected + 1 }, "unverified", "account_mismatch",
        "pipe,user,interface,online,id,release_user,release_pipe");
    CheckIdentity(new() { SecondId = expected + 1 }, "unverified", "active_account_changed",
        "pipe,user,interface,online,id,online,id,release_user,release_pipe");
    CheckIdentity(new() { PipeReleased = false }, "unverified", "pipe_release_failed",
        "pipe,user,interface,online,id,online,id,release_user,release_pipe");
    foreach (string failingOperation in new[] { "interface", "release_user" })
    {
        var failing = new FakeNative { FailingOperation = failingOperation };
        try
        {
            ClientIdentity.Inspect(failing, expected, () => true);
            throw new Exception("Expected fixture exception.");
        }
        catch (InvalidOperationException)
        {
            Require(failing.Calls.TakeLast(2).SequenceEqual(["release_user", "release_pipe"]),
                "both handles cleaned up after exception");
        }
    }

    var (guardExit, guardResponse) = await RunProbe(["identity", "76561197960265770"], "480");
    using (guardResponse)
    {
        Require(guardExit == 4 && guardResponse.RootElement.GetProperty("error").GetString() == "inherited_game_context",
            "public command and worker refuse inherited game context before Steam discovery");
        Require(!guardResponse.RootElement.ToString().Contains("76561197960265770"), "identity stays redacted");
    }

    // These public calls stop at the inherited-context guard, before native loading.
    var (appGuardExit, appGuardResponse) = await RunProbe(["app", expected.ToString(), "10"], "480");
    using (appGuardResponse)
    {
        Require(appGuardExit == 4 && appGuardResponse.RootElement.GetProperty("error").GetString() == "inherited_game_context",
            "app context guard");
        Require(!appGuardResponse.RootElement.TryGetProperty("appId", out _), "no app flags on failure");
    }
    foreach (bool subscribed in new[] { false, true })
    foreach (bool installed in new[] { false, true })
    {
        var appNative = new FakeNative { Subscribed = subscribed, Installed = installed };
        var appResult = ClientIdentity.Inspect(appNative, expected, () => true, 10);
        Require(appResult.Subscribed == subscribed && appResult.Installed == installed && appResult.Error is null,
            "independent app flags");
        Require(string.Join(',', appNative.Calls) ==
            "pipe,user,interface,online,id,apps,subscribed,installed,online,id,release_user,release_pipe",
            "identity brackets app query");
        var workerResult = await IdentityWorker.Run(FixtureWorker($"app-{(subscribed ? 1 : 0)}-{(installed ? 1 : 0)}"),
            TimeSpan.FromSeconds(5));
        Require(workerResult == appResult, "app flags worker transport");
    }
    var changedApp = ClientIdentity.Inspect(new FakeNative { SecondId = expected + 1 }, expected, () => true, 10);
    Require(changedApp.Error == "active_account_changed" && changedApp.Subscribed is null, "discard changed-account flags");
    var failedCleanup = ClientIdentity.Inspect(new FakeNative { PipeReleased = false }, expected, () => true, 10);
    Require(failedCleanup.Subscribed is null && failedCleanup.Error == "pipe_release_failed", "discard cleanup-failed flags");
    CheckAppAbi();
    using (var self = Process.GetCurrentProcess())
    {
        Require(IdentityWorker.WatchParent(self.Id, self.StartTime.ToUniversalTime().Ticks + 1) is null,
            "reject changed parent generation before native work");
    }
    var orphanStart = FixtureWorker("orphan-parent");
    orphanStart.RedirectStandardOutput = true;
    orphanStart.UseShellExecute = false;
    using (var fixtureParent = Process.Start(orphanStart)!)
    {
        using var orphanDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        string? childId = await fixtureParent.StandardOutput.ReadLineAsync(orphanDeadline.Token);
        using var guardedChild = Process.GetProcessById(int.Parse(childId!));
        _ = guardedChild.SafeHandle;
        fixtureParent.Kill();
        await fixtureParent.WaitForExitAsync(orphanDeadline.Token);
        await guardedChild.WaitForExitAsync(orphanDeadline.Token);
        Require(guardedChild.HasExited, "guarded worker exits after killed parent");
    }

    var noisy = await IdentityWorker.Run(FixtureWorker("noisy"), TimeSpan.FromSeconds(5));
    Require(noisy.Identity == "expected_account_confirmed" && noisy.Error is null, "noisy worker output discarded");
    var failed = await IdentityWorker.Run(FixtureWorker("fail"), TimeSpan.FromSeconds(5));
    Require(failed.Error == "worker_failed", "abnormal worker exit redacted");
    await CheckStoppedWorker(TimeSpan.FromMilliseconds(300), CancellationToken.None, "worker_timeout");
    using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
    await CheckStoppedWorker(TimeSpan.FromSeconds(5), cancellation.Token, "worker_cancelled");

    foreach (bool throws in new[] { true, false })
    {
        var cleanupFailed = await IdentityWorker.Run(FixtureWorker("hang"), TimeSpan.FromMilliseconds(300),
            terminate: child =>
            {
                Require(IdentityWorker.Terminate(child), "synthetic failure fixture reaped");
                if (throws)
                    throw new System.ComponentModel.Win32Exception(5);
                return false;
            });
        Require(cleanupFailed.Error == "worker_cleanup_failed", "cleanup failure has redacted result");
    }

    CheckGameContextGuard();
    CheckAppIdInput();
    CheckAppsOutputValidation();
    CheckAppsWorker();
    await CheckAppsParent(fixture.FullName);
    await CheckAppsCommand();
    await CheckHoldWorker();
    await CheckHoldParent(fixture.FullName);
    await CheckHoldCommand();
}
finally
{
    // This is the uniquely named directory created above; files are the two known fixtures.
    File.Delete(Path.Combine(fixture.FullName, "steam.exe"));
    File.Delete(Path.Combine(fixture.FullName, "steamclient.dll"));
    fixture.Delete(true);
}
Console.WriteLine("Steam probe offline checks passed.");
return 0;

static void CheckIdentity(FakeNative native, string identity, string? error, string calls, Func<bool>? stillActive = null)
{
    var result = ClientIdentity.Inspect(native, 0x011000010000002aUL, stillActive ?? (() => true));
    Require(result.Identity == identity && result.Error == error, error ?? "successful identity match");
    Require(string.Join(',', native.Calls) == calls, $"native calls and cleanup for {error ?? "success"}");
}

static string[] Lines(StringWriter writer) =>
    writer.ToString().ReplaceLineEndings("\n").Split('\n', StringSplitOptions.RemoveEmptyEntries);

static string AppLine(uint id, bool subscribed, bool installed) =>
    $$"""{"protocolVersion":2,"appId":{{id}},"subscribed":{{(subscribed ? "true" : "false")}},"installed":{{(installed ? "true" : "false")}}}""";

static string Failed(string code) => $$"""{"protocolVersion":2,"status":"failed","error":"{{code}}"}""";

static string Complete(int count) => $$"""{"protocolVersion":2,"status":"complete","count":{{count}}}""";

const string HoldingTen = """{"protocolVersion":2,"status":"holding","appId":10}""";
const string Released = """{"protocolVersion":2,"status":"released"}""";

static void CheckGameContextGuard()
{
    static Func<string, string?> Env(params (string Name, string Value)[] pairs) =>
        name => pairs.Where(pair => pair.Name == name).Select(pair => pair.Value).FirstOrDefault();
    Require(!ClientIdentity.InheritedGameContext(null, Env()), "clean environment passes the guard");
    foreach (var name in new[] { "SteamAppId", "SteamGameId", "SteamOverlayGameId" })
        Require(ClientIdentity.InheritedGameContext(null, Env((name, "10"))), $"inherited {name} refused");
    Require(!ClientIdentity.InheritedGameContext(10, Env(("SteamAppId", "10"))), "hold worker accepts its own AppID");
    Require(ClientIdentity.InheritedGameContext(10, Env()), "hold worker requires its AppID");
    Require(ClientIdentity.InheritedGameContext(10, Env(("SteamAppId", "11"))), "other AppID refused");
    Require(ClientIdentity.InheritedGameContext(10, Env(("SteamAppId", "010"))), "AppID must match exactly");
    Require(ClientIdentity.InheritedGameContext(10, Env(("SteamAppId", "10"), ("SteamGameId", "10"))), "SteamGameId still refused for hold");
    Require(ClientIdentity.InheritedGameContext(10, Env(("SteamAppId", "10"), ("SteamOverlayGameId", "10"))),
        "SteamOverlayGameId still refused for hold");
}

static void CheckAppIdInput()
{
    static string? Parse(string text, List<uint> ids) => StreamProtocol.ReadAppIds(new StringReader(text), ids);
    var ids = new List<uint>();
    Require(Parse("10\n20\r\n4294967295", ids) is null && ids.SequenceEqual([10u, 20u, 4294967295u]), "decimal ids, LF, CRLF, no final newline");
    ids.Clear();
    Require(Parse("", ids) is null && ids.Count == 0, "empty list is valid");
    foreach (var bad in new[] { "abc\n", "0\n", "-1\n", "+5\n", " 5\n", "5 \n", "1e3\n", "10\n\n20\n", "4294967296\n",
        new string('1', 200) + "\n" })
        Require(Parse(bad, []) == "invalid_app_list", "malformed id rejected");
    Require(Parse("10\n20\n10\n", []) == "duplicate_app_id", "duplicate rejected");
    Require(Parse(string.Join('\n', Enumerable.Range(1, 10000)) + "\n", []) is null, "10000 ids accepted");
    Require(Parse(string.Join('\n', Enumerable.Range(1, 10001)) + "\n", []) == "too_many_apps", "10001 ids rejected");
}

static void CheckAppsOutputValidation()
{
    string a10 = AppLine(10, true, false), a11 = AppLine(11, false, false), done = Complete(2);
    static string? Validate(string text, List<string> lines) =>
        StreamProtocol.ReadAppsOutput(new StringReader(text), [10, 11], lines);
    var lines = new List<string>();
    Require(Validate($"{a10}\n{a11}\n{done}\n", lines) is null && lines.SequenceEqual([a10, a11]), "valid stream accepted");
    var violations = new[]
    {
        $"{a11}\n{a10}\n{done}\n",
        $"{AppLine(12, true, false)}\n{a11}\n{done}\n",
        $"{a10.Replace("\"protocolVersion\":2", "\"protocolVersion\":1")}\n{a11}\n{done}\n",
        $"{a10[..^1]},\"x\":1}}\n{a11}\n{done}\n",
        $"{a10.Replace(",\"installed\":false", "")}\n{a11}\n{done}\n",
        $"{a10.Replace("true", "\"true\"")}\n{a11}\n{done}\n",
        $"{a10[..^1]},\"installed\":false}}\n{a11}\n{done}\n",
        $"untrusted stdout\n{a10}\n{a11}\n{done}\n",
        $"[1]\n{a11}\n{done}\n",
        $"{a10}\n{a11}\n{Complete(3)}\n",
        $"{a10}\n{a11}\n{done}\nextra\n",
        $"{a10}\n{Failed("Bad Code!")}\n",
        $"{Failed("x")[..^1]},\"y\":1}}\n",
        new string('x', 5000) + "\n",
    };
    foreach (var text in violations)
        Require(Validate(text, []) == "worker_protocol_violation", "stream violation rejected");
    Require(Validate($"{a10}\n", []) == "worker_failed", "truncated stream");
    Require(Validate($"{a10}\n{a11}\n", []) == "worker_failed", "missing completion");
    Require(Validate($"{a10}\n{Failed("account_mismatch")}\n", []) == "account_mismatch", "worker failure code passes through");
}

static void CheckAppsWorker()
{
    const ulong expected = 0x011000010000002aUL;
    static FakeNative Native(ulong? secondId = null, ulong? id = null) =>
        new() { Subscribed = true, Installed = true, Known = [10, 11], SecondId = secondId, Id = id ?? expected };
    static int Run(FakeNative native, string input, StringWriter output) =>
        StreamWorkers.RunApps(new StringReader(input), output,
            ids => ClientIdentity.InspectApps(native, expected, () => true, ids));

    var native = Native();
    var output = new StringWriter();
    Require(Run(native, "10\n11\n", output) == 0, "apps worker success exit");
    Require(string.Join(',', native.Calls) ==
        "pipe,user,interface,online,id,apps,subscribed,installed,subscribed,installed,online,id,release_user,release_pipe",
        "one connection and one identity check for all apps");
    Require(Lines(output).SequenceEqual([AppLine(10, true, true), AppLine(11, true, true), Complete(2)]), "apps worker lines");

    foreach (var (failing, code) in new[] { (Native(id: expected + 1), "account_mismatch"),
        (Native(secondId: expected + 1), "active_account_changed") })
    {
        output = new StringWriter();
        Require(Run(failing, "10\n11\n", output) == 4, "apps worker failure exit");
        Require(Lines(output).SequenceEqual([Failed(code)]), "only the failed line after an account failure");
        Require(failing.Calls.TakeLast(2).SequenceEqual(["release_user", "release_pipe"]), "released after account failure");
    }
    var released = new FakeNative { Subscribed = true, Installed = true, Known = [10], PipeReleased = false };
    output = new StringWriter();
    Require(Run(released, "10\n", output) == 4 && Lines(output).SequenceEqual([Failed("pipe_release_failed")]),
        "release failure discards app flags");

    var untouched = Native();
    output = new StringWriter();
    Require(Run(untouched, "abc\n", output) == 2 && Lines(output).SequenceEqual([Failed("invalid_app_list")]) &&
        untouched.Calls.Count == 0, "invalid input never reaches the client");
}

static async Task RequireGone(string pidFile)
{
    int pid = int.Parse(await File.ReadAllTextAsync(pidFile));
    for (int attempt = 0; attempt < 30; attempt++)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            if (process.HasExited)
                return;
        }
        catch (ArgumentException)
        {
            return;
        }
        await Task.Delay(100);
    }
    throw new InvalidOperationException("Failed: worker still running after timeout");
}

static async Task CheckAppsParent(string scratch)
{
    uint[] ids = [10, 11, 12];
    static async Task<(int Exit, string[] Lines)> Run(string mode, uint[] ids, TimeSpan timeout, params string[] extra)
    {
        var output = new StringWriter();
        int exit = await StreamCommands.RunApps(FixtureWorker(mode, extra), ids, output, timeout);
        return (exit, Lines(output));
    }

    var (exit, lines) = await Run("apps-ok", ids, TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines.SequenceEqual([AppLine(10, true, false), AppLine(11, false, false),
        AppLine(12, true, true), Complete(3)]), "validated lines forwarded in input order");
    foreach (var (mode, code) in new[] { ("apps-wrong-order", "worker_protocol_violation"),
        ("apps-extra", "worker_protocol_violation"), ("apps-noise", "worker_protocol_violation"),
        ("apps-failed", "account_mismatch"), ("apps-truncated", "worker_failed"), ("apps-badexit", "worker_failed") })
    {
        (exit, lines) = await Run(mode, ids, TimeSpan.FromSeconds(20));
        Require(exit == 4 && lines.SequenceEqual([Failed(code)]), $"{mode} yields only the failed line");
    }
    string pidFile = Path.Combine(scratch, "apps-hang.pid");
    (exit, lines) = await Run("apps-hang", ids, TimeSpan.FromSeconds(3), pidFile);
    Require(exit == 4 && lines.SequenceEqual([Failed("worker_timeout")]), "apps total timeout");
    await RequireGone(pidFile);

    var empty = new StringWriter();
    Require(await StreamCommands.RunApps(new ProcessStartInfo("no-such-worker.exe"), [], empty, TimeSpan.FromSeconds(1)) == 0 &&
        Lines(empty).SequenceEqual([Complete(0)]), "empty list completes without a worker");
}

static async Task CheckAppsCommand()
{
    const string id = "76561197960265770";
    var (exit, response) = await RunProbe(["apps", id], stdin: "");
    using (response)
        Require(exit == 0 && response.RootElement.ToString() == Complete(0), "apps command empty list");
    foreach (var (input, code) in new[] { ("abc\n", "invalid_app_list"), ("10\n10\n", "duplicate_app_id"), ("0\n", "invalid_app_list") })
    {
        (exit, response) = await RunProbe(["apps", id], stdin: input);
        using (response)
            Require(exit == 2 && response.RootElement.GetProperty("error").GetString() == code, $"apps command rejects {code}");
    }
    (exit, response) = await RunProbe(["apps", id], "480", "10\n");
    using (response)
        Require(exit == 4 && response.RootElement.GetProperty("error").GetString() == "inherited_game_context" &&
            response.RootElement.EnumerateObject().Count() == 3, "apps worker refuses inherited game context");
}

static int RunFakeHold(FakeNative native, TextReader input, RecordingWriter output, CancellationToken parentGone = default) =>
    StreamWorkers.RunHold(10, input, output, parentGone,
        holding => ClientIdentity.Hold(native, 0x011000010000002aUL, () => true, 10, holding));

static async Task CheckHoldWorker()
{
    const ulong expected = 0x011000010000002aUL;
    const string held = "pipe,user,interface,online,id,apps,subscribed,online,id,print:holding,release_user,release_pipe";
    foreach (var input in new[] { "stop\n", "", "noise\nstop\n", "noise\n" })
    {
        var native = new FakeNative { Subscribed = true };
        var output = new RecordingWriter(native.Calls);
        Require(RunFakeHold(native, new StringReader(input), output) == 0, "hold worker exit");
        Require(string.Join(',', native.Calls) == held + ",print:released", "hold order of calls and releases");
        Require(output.Lines.SequenceEqual([HoldingTen, Released]), "hold lines");
    }

    foreach (var (native, code, calls) in new[]
    {
        (new FakeNative { Subscribed = true, Id = expected + 1 }, "account_mismatch",
            "pipe,user,interface,online,id,release_user,release_pipe,print:failed"),
        (new FakeNative { Subscribed = false }, "app_not_subscribed",
            "pipe,user,interface,online,id,apps,subscribed,release_user,release_pipe,print:failed"),
        (new FakeNative { Subscribed = true, SecondId = expected + 1 }, "active_account_changed",
            "pipe,user,interface,online,id,apps,subscribed,online,id,release_user,release_pipe,print:failed"),
    })
    {
        var output = new RecordingWriter(native.Calls);
        Require(RunFakeHold(native, new StringReader("stop\n"), output) == 4, "hold failure exit");
        Require(output.Lines.SequenceEqual([Failed(code)]) && string.Join(',', native.Calls) == calls, $"hold {code}");
    }

    var leaking = new FakeNative { Subscribed = true, PipeReleased = false };
    var leakOutput = new RecordingWriter(leaking.Calls);
    Require(RunFakeHold(leaking, new StringReader("stop\n"), leakOutput) == 4 &&
        leakOutput.Lines.SequenceEqual([HoldingTen, Failed("pipe_release_failed")]), "hold release failure reported");

    var early = new FakeNative { Subscribed = true };
    var earlyOutput = new RecordingWriter(early.Calls);
    using (var gone = new CancellationTokenSource())
    {
        gone.Cancel();
        Require(RunFakeHold(early, new StringReader("stop\n"), earlyOutput, gone.Token) == 1 && earlyOutput.Lines.Count == 0 &&
            string.Join(',', early.Calls) == "pipe,user,interface,online,id,apps,subscribed,online,id,release_user,release_pipe",
            "parent gone before holding releases without announcing");
    }

    var dying = new FakeNative { Subscribed = true };
    var dyingOutput = new RecordingWriter(dying.Calls);
    using var blocked = new BlockingReader();
    using var parentDeath = new CancellationTokenSource();
    var running = Task.Run(() => RunFakeHold(dying, blocked, dyingOutput, parentDeath.Token));
    Require(dyingOutput.HoldingPrinted.Wait(5000), "hold reached holding");
    Require(!running.IsCompleted, "hold keeps handles while the parent lives");
    parentDeath.Cancel();
    Require(await running.WaitAsync(TimeSpan.FromSeconds(5)) == 1, "parent death exit");
    Require(string.Join(',', dying.Calls) == held, "parent death releases user and pipe without a released line");
}

static async Task CheckHoldParent(string scratch)
{
    static async Task<(int Exit, string[] Lines)> Run(string mode, TextReader input, TimeSpan start, params string[] extra)
    {
        var output = new StringWriter();
        int exit = await StreamCommands.RunHold(FixtureWorker(mode, extra), 10, input, output, start, TimeSpan.FromSeconds(10));
        return (exit, Lines(output));
    }

    foreach (var text in new[] { "stop\n", "" })
    {
        var (exit, lines) = await Run("hold-ok", new StringReader(text), TimeSpan.FromSeconds(20));
        Require(exit == 0 && lines.SequenceEqual([HoldingTen, Released]),
            "hold parent: worker sees SteamAppId, stop or EOF releases");
    }
    using (var blocking = new BlockingReader())
    {
        var (exit, lines) = await Run("hold-died", blocking, TimeSpan.FromSeconds(20));
        Require(exit == 4 && lines.SequenceEqual([HoldingTen, Failed("worker_failed")]), "worker death while holding");
    }
    foreach (var (mode, code) in new[] { ("hold-failed", "app_not_subscribed"), ("hold-wrongapp", "worker_protocol_violation"),
        ("hold-noise", "worker_protocol_violation") })
    {
        var (exit, lines) = await Run(mode, new StringReader(""), TimeSpan.FromSeconds(20));
        Require(exit == 4 && lines.SequenceEqual([Failed(code)]), $"{mode} yields only the failed line");
    }
    string pidFile = Path.Combine(scratch, "hold-slow.pid");
    var started = Stopwatch.StartNew();
    var (slowExit, slowLines) = await Run("hold-slow", new StringReader(""), TimeSpan.FromSeconds(3), pidFile);
    Require(slowExit == 4 && slowLines.SequenceEqual([Failed("worker_timeout")]) && started.Elapsed < TimeSpan.FromSeconds(8),
        "limit to reach holding");
    await RequireGone(pidFile);
}

static async Task CheckHoldCommand()
{
    foreach (var inherited in new[] { "480", "10" })
    {
        var (exit, response) = await RunProbe(["hold", "76561197960265770", "10"], inherited);
        using (response)
            Require(exit == 4 && response.RootElement.GetProperty("error").GetString() == "inherited_game_context",
                "hold parent keeps the inherited game context guard");
    }
    Require(!IdentityWorker.WorkerStart("--apps-worker", 0x011000010000002aUL).Environment.TryGetValue("SteamAppId", out var leaked) ||
        leaked == Environment.GetEnvironmentVariable("SteamAppId"), "only hold sets SteamAppId");
}

static X509Certificate2 Cert(string subject)
{
    using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    return new CertificateRequest(subject, key, HashAlgorithmName.SHA256)
        .CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
}

static void CheckSignatureTrust(string scratch)
{
    using var anyFile = File.OpenHandle(typeof(Discovery).Assembly.Location);
    using var valve = Cert("CN=Valve Corp., O=Valve Corp., L=Bellevue, S=Washington, C=US");
    using var other = Cert("CN=Other Corp., O=Other Corp.");
    using var half = Cert("CN=Valve Corp., O=Evil Corp.");
    using var lookalike = Cert("CN=Valve Corp. Fake, O=Valve Corp. Fake");
    Require(SignaturePolicy.Check(new FakeSignature(new(true, valve)), anyFile) is null, "Valve signer trusted");
    foreach (var wrongSigner in new[] { other, half, lookalike })
        Require(SignaturePolicy.Check(new FakeSignature(new(true, wrongSigner)), anyFile) == "client_signer_untrusted",
            "valid signature from another signer has its own code");
    foreach (var broken in new FileSignature[] { new(false, null), new(false, valve), new(true, null) })
        Require(SignaturePolicy.Check(new FakeSignature(broken), anyFile) == "client_build_unverified",
            "unsigned or tampered file rejected");
    Require(SignaturePolicy.Check(new FakeSignature(null), anyFile) == "client_build_unverified",
        "throwing verifier is never verified");

    // Real API: .NET runtime assemblies carry an embedded Microsoft signature.
    var real = new WinTrustReader();
    string signed = typeof(object).Assembly.Location;
    using (var file = File.OpenHandle(signed, FileMode.Open, FileAccess.Read, FileShare.Read))
    {
        var signature = real.Read(file);
        Require(signature.Valid && signature.Leaf is not null, "embedded Microsoft signature is valid");
        Require(SignaturePolicy.Check(real, file) == "client_signer_untrusted", "Microsoft signer is not Valve");
    }
    string fresh = Path.Combine(scratch, "fresh.dll");
    File.WriteAllBytes(fresh, [0x4d, 0x5a, 0x90, 0x00]);
    using (var file = File.OpenHandle(fresh))
        Require(SignaturePolicy.Check(real, file) == "client_build_unverified", "freshly written file untrusted");
    string tampered = Path.Combine(scratch, "tampered.dll");
    File.Copy(signed, tampered, overwrite: true);
    using (var write = File.OpenHandle(tampered, FileMode.Open, FileAccess.Write))
    {
        byte[] flip = [0xff];
        RandomAccess.Write(write, flip, new FileInfo(tampered).Length / 2);
    }
    using (var file = File.OpenHandle(tampered))
        Require(SignaturePolicy.Check(real, file) == "client_build_unverified", "tampered signed file rejected");
}

static async Task<(int ExitCode, string Output)> RunRaw(string[] arguments)
{
    var start = new ProcessStartInfo("dotnet")
    {
        UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true,
    };
    start.ArgumentList.Add(typeof(Discovery).Assembly.Location);
    foreach (var argument in arguments)
        start.ArgumentList.Add(argument);
    using var process = Process.Start(start) ?? throw new InvalidOperationException("Probe process did not start.");
    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
    var stdout = process.StandardOutput.ReadToEndAsync(deadline.Token);
    var stderr = process.StandardError.ReadToEndAsync(deadline.Token);
    await process.WaitForExitAsync(deadline.Token);
    await stderr;
    return (process.ExitCode, await stdout);
}

static ProcessStartInfo FixtureWorker(string mode, params string[] extra)
{
    var start = new ProcessStartInfo("dotnet");
    start.ArgumentList.Add(typeof(FakeNative).Assembly.Location);
    start.ArgumentList.Add("worker-fixture");
    start.ArgumentList.Add(mode);
    foreach (var argument in extra)
        start.ArgumentList.Add(argument);
    return start;
}

static async Task<int> StreamFixture(string mode, string[] rest)
{
    if (rest.Length > 0)
        await File.WriteAllTextAsync(rest[0], Environment.ProcessId.ToString());
    if (mode.StartsWith("hold-"))
    {
        uint held = uint.Parse(Environment.GetEnvironmentVariable("SteamAppId") ?? "0");
        if (mode == "hold-slow")
            await Task.Delay(Timeout.InfiniteTimeSpan);
        if (mode == "hold-failed")
        {
            Console.WriteLine(StreamProtocol.FailedLine("app_not_subscribed"));
            return 4;
        }
        if (mode == "hold-noise")
            Console.WriteLine("untrusted stdout");
        Console.WriteLine(StreamProtocol.HoldingLine(mode == "hold-wrongapp" ? held + 1 : held));
        if (mode == "hold-died")
            return 5;
        while (Console.In.ReadLine() is { } line && line != "stop") { }
        Console.WriteLine(StreamProtocol.ReleasedLine);
        return 0;
    }
    var ids = new List<uint>();
    if (StreamProtocol.ReadAppIds(Console.In, ids) is not null)
        return 2;
    if (mode == "apps-hang")
        await Task.Delay(Timeout.InfiniteTimeSpan);
    if (mode == "apps-failed")
    {
        Console.WriteLine(StreamProtocol.FailedLine("account_mismatch"));
        return 4;
    }
    if (mode == "apps-noise")
        Console.WriteLine("untrusted stdout");
    var flags = ids.Select(id => new AppFlags(id, id % 2 == 0, id % 3 == 0)).ToList();
    if (mode == "apps-wrong-order")
        (flags[0], flags[1]) = (flags[1], flags[0]);
    foreach (var flag in mode == "apps-truncated" ? flags.Take(1) : flags)
        Console.WriteLine(StreamProtocol.AppLine(flag));
    if (mode != "apps-truncated")
        Console.WriteLine(StreamProtocol.CompleteLine(flags.Count));
    if (mode == "apps-extra")
        Console.WriteLine("stray");
    return mode == "apps-badexit" ? 3 : 0;
}

static async Task CheckStoppedWorker(TimeSpan timeout, CancellationToken cancellationToken, string expectedError)
{
    Process? observed = null;
    try
    {
        var result = await IdentityWorker.Run(FixtureWorker("hang"), timeout, cancellationToken, child =>
        {
            observed = Process.GetProcessById(child.Id);
            _ = observed.SafeHandle;
            return IdentityWorker.Terminate(child);
        });
        Require(result.Error == expectedError && observed?.HasExited == true,
            $"worker exited after {expectedError}");
    }
    finally
    {
        observed?.Dispose();
    }
}

static void CheckAppAbi()
{
    nint table = Marshal.AllocHGlobal(20 * IntPtr.Size);
    nint instance = Marshal.AllocHGlobal(IntPtr.Size);
    WindowsSteamClient.AppFlagMethod subscribed = (self, appId) => self == instance && appId == 10;
    WindowsSteamClient.AppFlagMethod installed = (self, appId) => false;
    try
    {
        for (int i = 0; i < 20; i++) Marshal.WriteIntPtr(table, i * IntPtr.Size, 0);
        Marshal.WriteIntPtr(table, 6 * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(subscribed));
        Marshal.WriteIntPtr(table, 19 * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(installed));
        Marshal.WriteIntPtr(instance, table);
        Require(WindowsSteamClient.ReadAppFlag(instance, 6, 10), "app argument and subscription ABI slot");
        Require(!WindowsSteamClient.ReadAppFlag(instance, 19, 10), "installed ABI slot and one-byte false");
    }
    finally
    {
        GC.KeepAlive(subscribed);
        GC.KeepAlive(installed);
        Marshal.FreeHGlobal(instance);
        Marshal.FreeHGlobal(table);
    }
}

static void Require(bool condition, string scenario)
{
    if (!condition)
        throw new InvalidOperationException($"Failed: {scenario}");
}

static async Task<(int ExitCode, JsonDocument Response)> RunProbe(string[] arguments, string? appId = null,
    string? stdin = null)
{
    var start = new ProcessStartInfo("dotnet")
    {
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        RedirectStandardInput = true,
        CreateNoWindow = true,
    };
    if (appId is not null)
        start.Environment["SteamAppId"] = appId;
    start.ArgumentList.Add(typeof(Discovery).Assembly.Location);
    foreach (var argument in arguments)
        start.ArgumentList.Add(argument);
    using var process = Process.Start(start) ?? throw new InvalidOperationException("Probe process did not start.");
    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
    if (stdin is not null)
    {
        await process.StandardInput.WriteAsync(stdin);
        process.StandardInput.Close();
    }
    // Otherwise keep stdin open until exit to detect any accidental dependency on input or EOF.
    var stdout = process.StandardOutput.ReadToEndAsync(deadline.Token);
    var stderr = process.StandardError.ReadToEndAsync(deadline.Token);
    try
    {
        await process.WaitForExitAsync(deadline.Token);
        var lines = (await stdout).ReplaceLineEndings("\n").Split('\n');
        Require(lines is [_, ""], "one terminated JSON line");
        Require(string.IsNullOrEmpty(await stderr), "no unstructured stderr output");
        return (process.ExitCode, JsonDocument.Parse(lines[0]));
    }
    catch (OperationCanceledException) when (deadline.IsCancellationRequested)
    {
        if (!process.HasExited)
            process.Kill();
        throw;
    }
}

[UnmanagedFunctionPointer(CallingConvention.Cdecl)]
internal delegate nint AbiUser();

internal sealed class FakeSignature(FileSignature? result) : ISignatureReader
{
    public FileSignature Read(SafeFileHandle file) => result ?? throw new InvalidOperationException("Synthetic verifier failure.");
}

internal sealed class BlockingReader : TextReader
{
    private readonly ManualResetEventSlim _gate = new();
    public override int Read()
    {
        _gate.Wait();
        return -1;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _gate.Set();
        base.Dispose(disposing);
    }
}

internal sealed class RecordingWriter(List<string> calls) : TextWriter
{
    internal List<string> Lines { get; } = [];
    internal ManualResetEventSlim HoldingPrinted { get; } = new();
    public override System.Text.Encoding Encoding => System.Text.Encoding.UTF8;

    public override void WriteLine(string? value)
    {
        Lines.Add(value ?? "");
        using var document = JsonDocument.Parse(value!);
        string tag = document.RootElement.TryGetProperty("status", out var status) ? status.GetString()! : "app";
        calls.Add("print:" + tag);
        if (tag == "holding")
            HoldingPrinted.Set();
    }
}

internal sealed class FakeNative : IClientIdentityNative, IClientAppsNative
{
    internal bool Subscribed { get; init; }
    internal bool Installed { get; init; }
    internal uint[] Known { get; init; } = [10];
    public bool HasAppsInterface(int user, int pipe) => Record("apps", user == User && pipe == Pipe);
    public bool IsSubscribed(uint appId) => Record("subscribed", Known.Contains(appId) && Subscribed);
    public bool IsInstalled(uint appId) => Record("installed", Known.Contains(appId) && Installed);
    private int _idReads;
    internal List<string> Calls { get; } = [];
    internal int Pipe { get; init; } = 11;
    internal int User { get; init; } = 22;
    internal bool HasInterface { get; init; } = true;
    internal bool Online { get; init; } = true;
    internal bool PipeReleased { get; init; } = true;
    internal ulong Id { get; init; } = 0x011000010000002aUL;
    internal ulong? SecondId { get; init; }
    internal string? FailingOperation { get; init; }

    public int CreatePipe() => Record("pipe", Pipe);
    public int ConnectUser(int pipe) => Record("user", pipe == Pipe ? User : 0);
    public bool HasUserInterface(int user, int pipe) => Record("interface", HasInterface && user == User && pipe == Pipe);
    public bool IsLoggedOn() => Record("online", Online);
    public ulong ReadSteamId() => Record("id", _idReads++ == 0 ? Id : SecondId ?? Id);
    public void ReleaseUser(int pipe, int user)
    {
        if (pipe != Pipe || user != User)
            throw new ArgumentException("Unexpected handles.");
        Record("release_user", true);
    }

    public bool ReleasePipe(int pipe) => Record("release_pipe", PipeReleased && pipe == Pipe);

    private T Record<T>(string operation, T value)
    {
        Calls.Add(operation);
        if (operation == FailingOperation)
            throw new InvalidOperationException("Synthetic native failure.");
        return value;
    }
}
