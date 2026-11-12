using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
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
    if (mode.StartsWith("apps-") || mode.StartsWith("hold-") || mode.StartsWith("ach-") || mode.StartsWith("unl-") ||
        mode.StartsWith("slf-"))
        return await StreamFixture(mode, fixtureRest);
    if (mode == "orphan-parent")
    {
        using var self = Process.GetCurrentProcess();
        var childStart = new ProcessStartInfo("dotnet")
            { RedirectStandardOutput = true, StandardOutputEncoding = new UTF8Encoding(false), UseShellExecute = false };
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
        ["hold", "76561197960265770", "10", "extra"], ["achievements"], ["achievements", "76561197960265770"],
        ["achievements", "76561197960265770", "0"], ["achievements", "123", "10"], ["achievements", "76561197960265770", "10", "extra"],
        ["--achievements-worker", "76561197960265770"], ["--achievements-worker", "76561197960265770", "10"],
        ["unlock"], ["unlock", "76561197960265770"], ["unlock", "76561197960265770", "0"], ["unlock", "123", "10"],
        ["unlock", "76561197960265770", "10", "extra"], ["achievements-selfcheck"], ["achievements-selfcheck", "76561197960265770"],
        ["achievements-selfcheck", "76561197960265770", "0"], ["achievements-selfcheck", "123", "10"],
        ["achievements-selfcheck", "76561197960265770", "10", "extra"],
        ["--unlock-worker", "76561197960265770"], ["--unlock-worker", "76561197960265770", "10"],
        ["--selfcheck-worker", "76561197960265770"], ["--selfcheck-worker", "76561197960265770", "10"] })
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
    foreach (var workerMode in new[] { "--identity-worker", "--apps-worker", "--hold-worker", "--achievements-worker",
        "--unlock-worker", "--selfcheck-worker" })
    {
        using var self = Process.GetCurrentProcess();
        string[] workerArgs = workerMode is "--hold-worker" or "--achievements-worker" or "--unlock-worker" or "--selfcheck-worker"
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
    orphanStart.StandardOutputEncoding = Encodings.Utf8NoBom;
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
    await CheckAppsLargeList();
    await CheckAppsCommand();
    await CheckHoldWorker();
    await CheckHoldParent(fixture.FullName);
    Require(Environment.GetEnvironmentVariable("SteamAppId") is null, "hold parent flow leaves no SteamAppId in the parent environment");
    await CheckHoldReleaseTimeout(fixture.FullName);
    await CheckHoldCommand();
    CheckAchievementsLogic();
    CheckAchievementsWorker();
    CheckAchievementsOutputValidation();
    await CheckAchievementsParent(fixture.FullName);
    await CheckAchievementsCommand();
    CheckApiNameRule();
    CheckUnlockLogic();
    CheckSelfCheckLogic();
    CheckUnlockWorkers();
    CheckUnlockNames();
    CheckUnlockOutputValidation();
    await CheckUnlockParent(fixture.FullName);
    await CheckUnlockCommands();
    CheckStatsSlotTables();
    CheckWriteSlotTables();
    CheckStatsAbi();
    CheckWriteAbi();
    CheckTrustedFiles(fixture.FullName);
}
finally
{
    // This is the uniquely named directory created above; files are the two known fixtures.
    File.Delete(Path.Combine(fixture.FullName, "steam.exe"));
    File.Delete(Path.Combine(fixture.FullName, "steamclient.dll"));
    fixture.Delete(true);
}
const string HoldingTen = """{"protocolVersion":2,"status":"holding","appId":10}""";
const string Released = """{"protocolVersion":2,"status":"released"}""";
const ulong UnlockExpected = 0x011000010000002aUL;
const string UnlockHead = "pipe,user,interface,online,id,apps,subscribed,stats,wait_stats,num";
const string UnlockTail = "online,id,release_user,release_pipe";
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
    var wrongTypes = new[]
    {
        $"{a10.Replace("\"appId\":10", "\"appId\":\"10\"")}\n{a11}\n{done}\n",
        $"{a10.Replace("\"appId\":10", "\"appId\":10.5")}\n{a11}\n{done}\n",
        $"{a10.Replace("\"appId\":10", "\"appId\":-10")}\n{a11}\n{done}\n",
        $"{a10.Replace("\"appId\":10", "\"appId\":null")}\n{a11}\n{done}\n",
        $"{a10.Replace("\"subscribed\":true", "\"subscribed\":1")}\n{a11}\n{done}\n",
        $"{a10.Replace("\"installed\":false", "\"installed\":0")}\n{a11}\n{done}\n",
        $"{a10}\n{a11}\n{done.Replace("\"count\":2", "\"count\":\"2\"")}\n",
        $"{a10}\n{a11}\n{done.Replace("\"count\":2", "\"count\":2.5")}\n",
        $"{a10}\n{a11}\n{done.Replace("\"count\":2", "\"count\":-2")}\n",
        $"{a10}\n{a11}\n{done.Replace("\"count\":2", "\"count\":true")}\n",
        $"{a10}\n{a11}\n{done.Replace("\"count\":2", "\"count\":null")}\n",
    };
    foreach (var text in wrongTypes)
        Require(Validate(text, []) == "worker_protocol_violation", "wrongly typed number or flag is a protocol violation");
    foreach (var wrongApp in new[] { "\"10\"", "10.5", "-10", "true", "false", "null", "1" })
    {
        string status = HoldingTen.Replace("\"appId\":10", $"\"appId\":{wrongApp}");
        string? result = StreamProtocol.ReadStatusLine(new StringReader(status + "\n"), "holding", 10);
        Require(result == "worker_protocol_violation", $"holding line with appId {wrongApp} is a protocol violation");
    }
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

static string AchLine(string api = "ACH_ONE", string name = "One", string desc = "First", bool hidden = false,
    bool achieved = true, uint unlock = 1700000000) =>
    StreamProtocol.AchievementLine(new(api, name, desc, hidden, achieved, achieved ? unlock : 0));

static string AchComplete(uint app, int count) =>
    $$"""{"protocolVersion":2,"status":"complete","appId":{{app}},"count":{{count}}}""";

static void CheckAchievementsLogic()
{
    const ulong expected = 0x011000010000002aUL;
    const string head = "pipe,user,interface,online,id,apps,subscribed,stats,wait_stats,num";
    const string tail = "online,id,release_user,release_pipe";
    const string item = "ach_name,attr,attr,attr,state";
    static AchievementsResult Read(FakeNative native, Func<bool>? active = null, TimeSpan? timeout = null) =>
        ClientIdentity.ReadAchievements(native, expected, active ?? (() => true), 10, timeout ?? TimeSpan.FromSeconds(10),
            CancellationToken.None);
    static FakeNative Native(params FakeAchievement[] items) => new() { Subscribed = true, Achievements = items };
    static string Calls(FakeNative native) => string.Join(',', native.Calls);
    static void Failure(FakeNative native, string code, string calls, string scenario)
    {
        var result = Read(native);
        Require(result.Status.Error == code && result.Items.Count == 0, $"{scenario}: error {code}, no items");
        Require(Calls(native) == calls, $"{scenario}: calls {Calls(native)}");
    }

    var happy = Native(new FakeAchievement("ACH_ONE", "One", "First", "0", true, 1700000000),
        new FakeAchievement("ACH_TWO", "Two", "Second", "1", false, 0));
    var result = Read(happy);
    Require(result.Status is { Error: null, Identity: "expected_account_confirmed" } && result.Items.SequenceEqual(
        [new AchievementInfo("ACH_ONE", "One", "First", false, true, 1700000000),
         new AchievementInfo("ACH_TWO", "Two", "Second", true, false, 0)]), "achievements read in API order");
    Require(Calls(happy) == $"{head},{item},{item},{tail}", $"achievements call order and release: {Calls(happy)}");
    Require(happy.WaitedFor == TimeSpan.FromSeconds(10), "stats wait uses the injected limit");
    Require(AchLine() == """{"protocolVersion":2,"apiName":"ACH_ONE","name":"One","description":"First","hidden":false,"achieved":true,"unlockTime":1700000000}""",
        "achievement line contract");

    var locked = Read(Native(new FakeAchievement("LOCKED", Achieved: false, UnlockTime: 5)));
    Require(locked.Items is [{ Achieved: false, UnlockTime: 0 }], "a locked achievement reports unlock time 0");

    var zero = Native();
    Require(Read(zero) is { Status.Error: null, Items.Count: 0 } && Calls(zero) == $"{head},{tail}", "zero achievements is complete");

    foreach (uint count in new[] { 10001u, uint.MaxValue })
        Failure(new FakeNative { Subscribed = true, NumOverride = count }, "stats_implausible",
            $"{head},release_user,release_pipe", $"count {count}");
    var cap = Read(new FakeNative { Subscribed = true, Achievements = Enumerable.Range(0, 10000).Select(i => new FakeAchievement($"A{i}")).ToList() });
    Require(cap.Status.Error is null && cap.Items.Count == 10000, "10000 achievements accepted");

    foreach (var bad in new string?[] { null, "", "A\tB", "A\u007fB", "A\0B", new string('A', 257), "�", "A\uD800" })
        Failure(Native(new FakeAchievement(bad)), "stats_implausible", $"{head},ach_name,release_user,release_pipe",
            $"first api name {bad?.Length.ToString() ?? "null"} is implausible");
    Require(Read(Native(new FakeAchievement(new string('A', 256)), new FakeAchievement("A B"), new FakeAchievement("Café ☃"),
        new FakeAchievement(string.Concat(Enumerable.Repeat("日", 85))))).Items.Count == 4,
        "256 bytes, spaces and non-ASCII UTF-8 names are valid");
    Failure(Native(new FakeAchievement("OK"), new FakeAchievement("A\u007f")), "stats_implausible",
        $"{head},{item},ach_name,release_user,release_pipe", "later control-character api name discards the earlier items");
    Failure(Native(new FakeAchievement("OK"), new FakeAchievement("OK")), "stats_implausible",
        $"{head},{item},{item},release_user,release_pipe", "duplicate api name");
    foreach (var hidden in new string?[] { "x", "", "2", null })
        Failure(Native(new FakeAchievement("OK", Hidden: hidden)), "stats_implausible",
            $"{head},ach_name,attr,attr,attr,release_user,release_pipe", $"hidden attribute {hidden ?? "null"}");
    Failure(Native(new FakeAchievement("OK", Name: null)), "stats_implausible", $"{head},ach_name,attr,release_user,release_pipe", "null name");
    Failure(Native(new FakeAchievement("OK", Description: null)), "stats_implausible",
        $"{head},ach_name,attr,attr,release_user,release_pipe", "null description");

    var longText = Read(Native(new FakeAchievement("OK", new string('n', 600), new string('d', 3000))));
    Require(longText.Items is [{ Name.Length: 512, Description.Length: 2048 }], "over-long strings truncated to 512 / 2048");
    var split = Read(Native(new FakeAchievement("OK", new string('a', 511) + "\U0001F600tail")));
    Require(split.Items is [{ Name: var kept }] && kept == new string('a', 511), "truncation never splits a surrogate pair");

    var offline = new FakeNative { Subscribed = true, StatsAvailable = false };
    var started = Stopwatch.StartNew();
    var timedOut = Read(offline, timeout: TimeSpan.FromMilliseconds(200));
    Require(timedOut.Status.Error == "stats_unavailable" && timedOut.Items.Count == 0 && started.Elapsed < TimeSpan.FromSeconds(5) &&
        offline.WaitedFor == TimeSpan.FromMilliseconds(200) &&
        Calls(offline) == "pipe,user,interface,online,id,apps,subscribed,stats,wait_stats,release_user,release_pipe",
        "stats never available -> stats_unavailable, nothing else called");
    Failure(new FakeNative { Subscribed = true, StatsInterface = false }, "stats_interface_unsupported",
        "pipe,user,interface,online,id,apps,subscribed,stats,release_user,release_pipe", "no stats interface");
    Failure(new FakeNative { Subscribed = true, Id = expected + 1 }, "account_mismatch",
        "pipe,user,interface,online,id,release_user,release_pipe", "identity mismatch");
    Failure(new FakeNative { Subscribed = false }, "app_not_subscribed",
        "pipe,user,interface,online,id,apps,subscribed,release_user,release_pipe", "not subscribed");
    Failure(new FakeNative { Subscribed = true, SecondId = expected + 1, Achievements = [new("OK")] }, "active_account_changed",
        $"{head},{item},{tail}", "account changed after reading");
    Failure(new FakeNative { Subscribed = true, PipeReleased = false, Achievements = [new("OK")] }, "pipe_release_failed",
        $"{head},{item},{tail}", "release failure");
    var inactive = new FakeNative { Subscribed = true };
    Require(Read(inactive, () => false).Status.Error == "active_account_changed" && inactive.Calls.Count == 0, "inactive account never reaches the client");
}

static void CheckAchievementsWorker()
{
    const ulong expected = 0x011000010000002aUL;
    static int Run(FakeNative native, StringWriter output, CancellationToken gone = default) =>
        StreamWorkers.RunAchievements(10, output, gone, () => ClientIdentity.ReadAchievements(native, expected, () => true, 10,
            TimeSpan.FromMilliseconds(100), gone));
    var native = new FakeNative { Subscribed = true, Achievements = [new("ACH_ONE", "One", "First", "0", true, 1700000000),
        new("ACH_TWO", "Two", "Second", "1")] };
    var output = new StringWriter();
    Require(Run(native, output) == 0 && Lines(output).SequenceEqual([AchLine(), AchLine("ACH_TWO", "Two", "Second", true, false), AchComplete(10, 2)]),
        "achievements worker lines");
    output = new StringWriter();
    Require(Run(new FakeNative { Subscribed = true }, output) == 0 && Lines(output).SequenceEqual([AchComplete(10, 0)]), "worker empty list");
    foreach (var (failing, code) in new[] { (new FakeNative { Subscribed = true, Id = expected + 1 }, "account_mismatch"),
        (new FakeNative { Subscribed = true, StatsAvailable = false }, "stats_unavailable"),
        (new FakeNative { Subscribed = true, NumOverride = 10001 }, "stats_implausible") })
    {
        output = new StringWriter();
        Require(Run(failing, output) == 4 && Lines(output).SequenceEqual([Failed(code)]), $"worker {code}: only the failed line");
        Require(failing.Calls.TakeLast(2).SequenceEqual(["release_user", "release_pipe"]), $"worker {code}: released");
    }
    using var gone = new CancellationTokenSource();
    gone.Cancel();
    var early = new FakeNative { Subscribed = true, Achievements = [new("OK")] };
    output = new StringWriter();
    Require(Run(early, output, gone.Token) == 1 && Lines(output).Length == 0 && early.Calls.TakeLast(2).SequenceEqual(["release_user", "release_pipe"]),
        "parent gone: released, nothing printed");
}

static void CheckAchievementsOutputValidation()
{
    string a = AchLine(), b = AchLine("ACH_TWO", "Two", "Second", true, false), done = AchComplete(10, 2);
    static string? Validate(string text, List<string> lines) =>
        StreamProtocol.ReadAchievementsOutput(new StringReader(text), 10, lines);
    var lines = new List<string>();
    Require(Validate($"{a}\n{b}\n{done}\n", lines) is null && lines.SequenceEqual([a, b]), "valid achievements stream accepted");
    lines.Clear();
    Require(Validate($"{a.Replace(",", ", ")}\n{AchComplete(10, 1)}\n", lines) is null && lines.SequenceEqual([a]), "lines are re-serialised canonically");
    Require(Validate($"{AchComplete(10, 0)}\n", []) is null, "empty stream accepted");
    var unicode = new List<string>();
    Require(Validate($"{a.Replace("ACH_ONE", "Caf\\u00e9\\u65e5\\ud83d\\ude00")}\n{AchComplete(10, 1)}\n", unicode) is null &&
        unicode[0].All(c => c < 0x80) && unicode[0].Contains("Caf\\u00E9\\u65E5\\uD83D\\uDE00"), "non-ASCII api names accepted and re-escaped as ASCII");
    Require(Validate(string.Join('\n', Enumerable.Range(0, 10000).Select(i => AchLine($"A{i}"))) + $"\n{AchComplete(10, 10000)}\n", []) is null,
        "10000 lines accepted");
    Require(Validate(a.Replace("One", new string('x', 512)) + $"\n{AchComplete(10, 1)}\n", []) is null &&
        Validate(a.Replace("First", new string('x', 2048)) + $"\n{AchComplete(10, 1)}\n", []) is null, "strings at the limit accepted");

    string one = AchComplete(10, 1);
    var violations = new[]
    {
        $"{a.Replace("\"protocolVersion\":2", "\"protocolVersion\":1")}\n{one}\n",
        $"{a[..^1]},\"x\":1}}\n{one}\n",
        $"{a.Replace(",\"hidden\":false", "")}\n{one}\n",
        $"{a.Replace("\"apiName\":\"ACH_ONE\"", "\"apiName\":1")}\n{one}\n",
        $"{a.Replace("\"name\":\"One\"", "\"name\":null")}\n{one}\n",
        $"{a.Replace("\"description\":\"First\"", "\"description\":5")}\n{one}\n",
        $"{a.Replace("\"hidden\":false", "\"hidden\":\"false\"")}\n{one}\n",
        $"{a.Replace("\"hidden\":false", "\"hidden\":0")}\n{one}\n",
        $"{a.Replace("\"achieved\":true", "\"achieved\":1")}\n{one}\n",
        $"{a.Replace("\"achieved\":true", "\"achieved\":null")}\n{one}\n",
        $"{a.Replace("\"unlockTime\":1700000000", "\"unlockTime\":\"1\"")}\n{one}\n",
        $"{a.Replace("\"unlockTime\":1700000000", "\"unlockTime\":-1")}\n{one}\n",
        $"{a.Replace("\"unlockTime\":1700000000", "\"unlockTime\":1.5")}\n{one}\n",
        $"{a.Replace("\"unlockTime\":1700000000", "\"unlockTime\":4294967296")}\n{one}\n",
        $"{a.Replace("\"unlockTime\":1700000000", "\"unlockTime\":null")}\n{one}\n",
        $"{a.Replace("\"unlockTime\":1700000000", "\"unlockTime\":true")}\n{one}\n",
        $"{a.Replace("\"achieved\":true", "\"achieved\":false")}\n{one}\n",
        $"{a.Replace("ACH_ONE", "")}\n{one}\n",
        $"{a.Replace("ACH_ONE", new string('A', 257))}\n{one}\n",
        $"{a.Replace("ACH_ONE", string.Concat(Enumerable.Repeat("\\u65e5", 86)))}\n{one}\n",
        $"{a.Replace("ACH_ONE", "A\\tB")}\n{one}\n",
        $"{a.Replace("ACH_ONE", "A\\u007fB")}\n{one}\n",
        $"{a.Replace("ACH_ONE", "A\\u0000B")}\n{one}\n",
        $"{a.Replace("ACH_ONE", "A\\ufffd")}\n{one}\n",
        $"{a.Replace("ACH_ONE", "A\\ud800")}\n{one}\n",
        $"{a.Replace("One", new string('x', 513))}\n{one}\n",
        $"{a.Replace("First", new string('x', 2049))}\n{one}\n",
        $"{a}\n{a}\n{AchComplete(10, 2)}\n",
        $"{a}\n{b}\n{AchComplete(10, 3)}\n",
        $"{a}\n{b}\n{AchComplete(10, 1)}\n",
        $"{a}\n{b}\n{AchComplete(11, 2)}\n",
        $"{a}\n{b}\n{done[..^1]},\"x\":1}}\n",
        $"{a}\n{b}\n{done.Replace(",\"appId\":10", "")}\n",
        $"{a}\n{b}\n{done.Replace("\"count\":2", "\"count\":\"2\"")}\n",
        $"{a}\n{b}\n{done.Replace("\"count\":2", "\"count\":2.5")}\n",
        $"{a}\n{b}\n{done.Replace("\"count\":2", "\"count\":-2")}\n",
        $"{a}\n{b}\n{done.Replace("\"count\":2", "\"count\":null")}\n",
        $"{a}\n{b}\n{done.Replace("\"appId\":10", "\"appId\":\"10\"")}\n",
        $"{a}\n{b}\n{done}\nextra\n",
        $"{a}\n{b}\n{done}\n{a}\n",
        $"{AchComplete(10, 0)}\n{a}\n",
        $"untrusted stdout\n{a}\n{one}\n",
        $"[1]\n{one}\n",
        $"{a}\n{Failed("Bad Code!")}\n",
        $"{Failed("x")[..^1]},\"y\":1}}\n",
        new string('x', 30000) + "\n",
        string.Join('\n', Enumerable.Range(0, 10001).Select(i => AchLine($"A{i}"))) + $"\n{AchComplete(10, 10001)}\n",
    };
    foreach (var text in violations)
        Require(Validate(text, []) == "worker_protocol_violation", $"achievements violation rejected: {text[..Math.Min(text.Length, 90)]}");
    Require(Validate($"{a}\n", []) == "worker_failed" && Validate("", []) == "worker_failed", "truncated achievements stream");
    Require(Validate($"{a}\n{Failed("stats_unavailable")}\n", []) == "stats_unavailable", "worker failure code passes through");
}

static async Task CheckAchievementsParent(string scratch)
{
    static async Task<(int Exit, string[] Lines)> Run(string mode, TimeSpan timeout, params string[] extra)
    {
        var output = new StringWriter();
        int exit = await StreamCommands.RunAchievements(FixtureWorker(mode, extra), 10, output, timeout);
        return (exit, Lines(output));
    }

    var (exit, lines) = await Run("ach-ok", TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines.SequenceEqual([AchLine(), AchLine("ACH_TWO", "Two", "Second", true, false), AchComplete(10, 2)]),
        "validated achievements forwarded");
    (exit, lines) = await Run("ach-empty", TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines.SequenceEqual([AchComplete(10, 0)]), "empty achievements completes");
    (exit, lines) = await Run("ach-env", TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines[0].Contains("\"APP_10\""), "the worker (and only the worker) sees SteamAppId");
    Require(Environment.GetEnvironmentVariable("SteamAppId") is null, "achievements parent leaves no SteamAppId behind");
    foreach (var (mode, code) in new[] { ("ach-extra", "worker_protocol_violation"), ("ach-noise", "worker_protocol_violation"),
        ("ach-wrongapp", "worker_protocol_violation"), ("ach-badcount", "worker_protocol_violation"),
        ("ach-failed", "stats_unavailable"), ("ach-truncated", "worker_failed"), ("ach-badexit", "worker_failed") })
    {
        (exit, lines) = await Run(mode, TimeSpan.FromSeconds(20));
        Require(exit == 4 && lines.SequenceEqual([Failed(code)]), $"{mode} yields only the failed line");
    }
    string pidFile = Path.Combine(scratch, "ach-hang.pid");
    var started = Stopwatch.StartNew();
    (exit, lines) = await Run("ach-hang", TimeSpan.FromSeconds(3), pidFile);
    Require(exit == 4 && lines.SequenceEqual([Failed("worker_timeout")]) && started.Elapsed < TimeSpan.FromSeconds(10), "achievements total timeout");
    await RequireGone(pidFile);
}

static async Task CheckAchievementsCommand()
{
    foreach (var inherited in new[] { "480", "10" })
    {
        var (exit, response) = await RunProbe(["achievements", "76561197960265770", "10"], inherited);
        using (response)
            Require(exit == 4 && response.RootElement.GetProperty("error").GetString() == "inherited_game_context" &&
                response.RootElement.EnumerateObject().Count() == 3, "achievements parent keeps the inherited game context guard");
    }
}

static void CheckApiNameRule()
{
    foreach (var valid in new[] { "A", "A B", "Café", "日本語", "😀", new string('A', 256), string.Concat(Enumerable.Repeat("日", 85)),
        string.Concat(Enumerable.Repeat("😀", 64)) })
        Require(AchievementReader.IsApiName(valid), $"valid api name {valid.Length}");
    foreach (var invalid in new[] { "", "A\0", "A\u0001", "A\tB", "A\nB", "A\rB", "A\u001fB", "A\u007f", "\uFFFD", "A\uD800", "\uDC00A",
        new string('A', 257), string.Concat(Enumerable.Repeat("日", 86)), string.Concat(Enumerable.Repeat("😀", 65))})
        Require(!AchievementReader.IsApiName(invalid), $"invalid api name {invalid.Length}");
    Require(StreamProtocol.UnlockLine("Café日😀", "unlocked").All(c => c < 0x80), "unlock line stays ASCII-escaped");
    Require(AchievementReader.IsApiName("\u0080\u009f"), "C1 characters are not in the control set of the contract");
}

static string UnlockReads(int count) => string.Join(',', Enumerable.Repeat("ach_name,attr,attr,attr,state", count));
static string UnlockAnchors(int count) => string.Join(',', Enumerable.Repeat("get_ach", Math.Min(count, 5)));
// A flow that writes (it starts with "prepare") re-reads every achievement once before the first write (the stability check).
static string UnlockFlow(int count, string rest) =>
    string.Join(',', new[] { UnlockHead, UnlockReads(count), UnlockAnchors(count),
        rest.StartsWith("prepare") ? string.Join(',', Enumerable.Repeat("state", count)) : "", rest, UnlockTail }.Where(part => part.Length > 0));
static FakeAchievement[] FourAchievements() =>
    [new("DONE", Achieved: true, UnlockTime: 1700000000), new("L1"), new("L2"), new("L3")];

static (UnlockResult Result, int Marks) RunUnlock(FakeNative native, string[] names, CancellationToken stop = default,
    TimeSpan? statsTimeout = null)
{
    int marks = 0;
    var result = ClientIdentity.UnlockAchievements(native, UnlockExpected, () => true, 10, names,
        statsTimeout ?? TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(7), () => { marks++; native.Calls.Add("mark"); }, stop);
    return (result, marks);
}

static void CheckUnlockLogic()
{
    static void Expect(FakeNative native, string[] names, string[] results, string stored, string calls, string scenario)
    {
        var (result, _) = RunUnlock(native, names);
        Require(result.Status is { Error: null, Identity: "expected_account_confirmed" } && result.Report is { } report &&
            report.Results.SequenceEqual(results) && report.Stored == stored,
            $"{scenario}: results {string.Join('/', result.Report?.Results ?? [])} stored {result.Report?.Stored} error {result.Status.Error}");
        Require(string.Join(',', native.Calls) == calls, $"{scenario}: calls {string.Join(',', native.Calls)}");
    }

    static void NoWrite(FakeNative native, string[] names, string code, string scenario, TimeSpan? statsTimeout = null)
    {
        var (result, marks) = RunUnlock(native, names, statsTimeout: statsTimeout);
        Require(result.Status.Error == code && result.Report is null && marks == 0, $"{scenario}: {code}, no report, no marker");
        Require(!native.Calls.Any(call => call is "prepare" or "mark" or "set" or "store" or "wait_store"),
            $"{scenario}: nothing written ({string.Join(',', native.Calls)})");
        Require(native.Calls.TakeLast(2).SequenceEqual(["release_user", "release_pipe"]), $"{scenario}: released");
    }

    string[] input = ["L2", "NOPE", "DONE", "L1"];
    var happy = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    Expect(happy, input, ["unlocked", "unknown", "already", "unlocked"], "yes",
        UnlockFlow(4, "prepare,mark,set,set,store,wait_store,state,state"), "happy path call order");
    Require(happy.SetNames.SequenceEqual(["L2", "L1"]), "SetAchievement in input order, only for locked known names");
    Require(happy.Calls.Count(call => call == "store") == 1, "StoreStats exactly once");
    Require(happy.StoreWaitedFor == TimeSpan.FromSeconds(7), "store wait uses the injected limit");

    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), RejectSet = ["L1"] }, ["L1", "L2"],
        ["rejected", "unlocked"], "yes", UnlockFlow(4, "prepare,mark,set,set,store,wait_store,state"), "one name rejected");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), StoreReturns = false }, ["L1", "L2"],
        ["store_failed", "store_failed"], "no", UnlockFlow(4, "prepare,mark,set,set,store"), "StoreStats returns false: no wait, no re-read");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), Outcome = StoreOutcome.Timeout }, ["L1", "L2"],
        ["pending", "pending"], "timeout", UnlockFlow(4, "prepare,mark,set,set,store,wait_store,state,state"), "callback never arrives");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), Outcome = StoreOutcome.Failed }, ["L1"],
        ["store_failed"], "no", UnlockFlow(4, "prepare,mark,set,store,wait_store"), "callback with an error result: store_failed, no re-read");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), SetTakesEffect = false }, ["L1", "L2"],
        ["unconfirmed", "unconfirmed"], "yes", UnlockFlow(4, "prepare,mark,set,set,store,wait_store,state,state"), "stored but not achieved");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), SetTakesEffect = false, Outcome = StoreOutcome.Timeout },
        ["L3"], ["unconfirmed"], "timeout", UnlockFlow(4, "prepare,mark,set,store,wait_store,state"), "no callback and not achieved");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements(), RejectSet = ["L1"] }, ["L1"],
        ["rejected"], "not_needed", UnlockFlow(4, "prepare,mark,set"), "everything rejected: StoreStats is never called");
    Expect(new FakeNative { Subscribed = true, Achievements = FourAchievements() }, ["DONE", "NOPE"], ["already", "unknown"],
        "not_needed", UnlockFlow(4, ""), "nothing to write: no prepare, no marker, no set, no store");
    Expect(new FakeNative { Subscribed = true }, ["X"], ["unknown"], "not_needed", UnlockFlow(0, ""), "a game without achievements");

    foreach (int lie in new[] { 0, 2, 3 })
        NoWrite(new FakeNative { Subscribed = true, Achievements = FourAchievements(), AnchorLiesAt = lie }, input, "stats_implausible",
            $"anchor disagrees at {lie}");
    NoWrite(new FakeNative { Subscribed = true, Achievements = FourAchievements(), AnchorUnknown = true }, input, "stats_implausible",
        "GetAchievement does not answer");
    NoWrite(new FakeNative { Subscribed = true, Achievements = FourAchievements(), Id = UnlockExpected + 1 }, input, "account_mismatch", "identity mismatch");
    NoWrite(new FakeNative { Subscribed = false, Achievements = FourAchievements() }, input, "app_not_subscribed", "not subscribed");
    NoWrite(new FakeNative { Subscribed = true, StatsAvailable = false, Achievements = FourAchievements() }, input, "stats_unavailable",
        "stats unavailable", TimeSpan.FromMilliseconds(100));
    NoWrite(new FakeNative { Subscribed = true, StatsInterface = false, Achievements = FourAchievements() }, input,
        "stats_interface_unsupported", "no stats interface");
    NoWrite(new FakeNative { Subscribed = true, NumOverride = 10001 }, input, "stats_implausible", "implausible count");
    NoWrite(new FakeNative { Subscribed = true, Achievements = [new("OK"), new("A\u007f")] }, ["OK"], "stats_implausible", "implausible name");

    var prepare = new FakeNative { Subscribed = true, Achievements = FourAchievements(), PrepareFails = true };
    try
    {
        RunUnlock(prepare, ["L1"]);
        throw new Exception("Expected ProbeException.");
    }
    catch (ProbeException ex)
    {
        Require(ex.Code == "client_export_unsupported" && prepare.Calls.TakeLast(3).SequenceEqual(["prepare", "release_user", "release_pipe"]) &&
            !prepare.Calls.Contains("mark") && !prepare.Calls.Contains("set"), "failed preflight: no marker, no write, still released");
    }

    var changed = new FakeNative { Subscribed = true, Achievements = FourAchievements(), SecondId = UnlockExpected + 1 };
    var (changedResult, changedMarks) = RunUnlock(changed, ["L1"]);
    Require(changedResult.Status.Error == "active_account_changed" && changedResult.Report is null && changedMarks == 1 && changed.SetNames.Count == 1,
        "account changed after the write: failure, but the marker was already announced");
    var unreleased = new FakeNative { Subscribed = true, Achievements = FourAchievements(), PipeReleased = false };
    var (unreleasedResult, unreleasedMarks) = RunUnlock(unreleased, ["L1"]);
    Require(unreleasedResult.Status.Error == "pipe_release_failed" && unreleasedResult.Report is null && unreleasedMarks == 1, "release failure after the write");

    using var gone = new CancellationTokenSource();
    gone.Cancel();
    var late = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    var (lateResult, lateMarks) = RunUnlock(late, ["L1"], gone.Token);
    Require(lateResult.Status.Error == "worker_cancelled" && lateMarks == 0 && !late.Calls.Contains("set") && !late.Calls.Contains("prepare"),
        "a parent that is already gone never gets a write");

    var inactive = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    var inactiveResult = ClientIdentity.UnlockAchievements(inactive, UnlockExpected, () => false, 10, ["L1"], TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(1), () => throw new InvalidOperationException("must not write"), CancellationToken.None);
    Require(inactiveResult.Status.Error == "active_account_changed" && inactive.Calls.Count == 0, "inactive account never reaches the client");

    // Stop requested between two SetAchievement calls: the second is never made, the first is still stored once and re-read.
    using var between = new CancellationTokenSource();
    var midway = new FakeNative { Subscribed = true, Achievements = FourAchievements(), AfterSet = _ => between.Cancel() };
    var (midwayResult, midwayMarks) = RunUnlock(midway, ["L1", "L2", "L3"], between.Token);
    Require(midwayResult.Report is { Stored: "yes" } midwayReport && midwayReport.Results.SequenceEqual(["unlocked", "rejected", "rejected"]) &&
        midway.SetNames.SequenceEqual(["L1"]) && midway.Calls.Count(call => call == "store") == 1 && midwayMarks == 1 &&
        string.Join(',', midway.Calls) == UnlockFlow(4, "prepare,mark,set,store,wait_store,state"),
        $"cancelled between two sets: one set, one store, results reported ({string.Join(',', midway.Calls)})");

    // The first set is also refused when the stop arrives after the stability check but before the first set.
    using var beforeSet = new CancellationTokenSource();
    var early = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    var earlyAnchor = AchievementWriter.Anchor(early, early.Achievements.Select(a => new AchievementInfo(a.ApiName!, "", "", false, a.Achieved, 0)).ToList(),
        out var anchoredWriter);
    Require(earlyAnchor is null && anchoredWriter is not null, "anchor passes on the fake");
    beforeSet.Cancel();
    int earlyMarks = 0;
    var earlyReport = anchoredWriter!.Unlock(early, 10, ["L1", "L2"], () => earlyMarks++, TimeSpan.FromSeconds(1), beforeSet.Token);
    Require(earlyReport.Results.SequenceEqual(["rejected", "rejected"]) && earlyReport.Stored == "not_needed" && earlyMarks == 0 &&
        early.SetNames.Count == 0 && !early.Calls.Contains("prepare") && !early.Calls.Contains("store"), "a stopped writer sets nothing and stores nothing");

    // The stability check: two reads 200 ms apart must agree before the first write.
    NoWrite(new FakeNative { Subscribed = true, Achievements = FourAchievements(), UnstableAt = 2 }, input, "stats_unavailable",
        "flags differ between the two reads");
    var stability = Stopwatch.StartNew();
    Require(RunUnlock(new FakeNative { Subscribed = true, Achievements = FourAchievements() }, ["L1"]).Result.Report is not null &&
        stability.Elapsed >= AchievementWriter.StabilityGap, "the stability check waits its gap before the first write");
    Require(AchievementWriter.StabilityGap >= TimeSpan.FromMilliseconds(200), "stability gap is at least 200 ms");

    // Only the anchor check can produce a writer.
    var constructors = typeof(AchievementWriter).GetConstructors(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public |
        System.Reflection.BindingFlags.NonPublic);
    Require(constructors.Length > 0 && constructors.All(constructor => constructor.IsPrivate), "AchievementWriter has no constructor but a private one");
    Require(typeof(AchievementWriter).GetMethods(System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public |
        System.Reflection.BindingFlags.NonPublic).Where(method => method.ReturnType == typeof(AchievementWriter)).Count() == 0 &&
        typeof(AchievementWriter).GetMethod("Unlock", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public |
            System.Reflection.BindingFlags.NonPublic) is null, "no static way to a writer or to Unlock exists");
    var lying = new FakeNative { Subscribed = true, Achievements = FourAchievements(), AnchorLiesAt = 1 };
    var lyingItems = lying.Achievements.Select(a => new AchievementInfo(a.ApiName!, "", "", false, a.Achieved, 0)).ToList();
    Require(AchievementWriter.Anchor(lying, lyingItems, out var noWriter) == "stats_implausible" && noWriter is null, "a failed anchor yields no writer");

    Require(IdentityWorker.UnlockExitGrace >= IdentityWorker.ExitGrace + AchievementWriter.StoreTimeout, "the unlock watchdog outlasts one store wait");
}

static void CheckSelfCheckLogic()
{
    static SelfCheckResult Run(FakeNative native) =>
        ClientIdentity.SelfCheckAchievements(native, UnlockExpected, () => true, 10, TimeSpan.FromSeconds(10), CancellationToken.None);

    var happy = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    var result = Run(happy);
    Require(result is { Status.Error: null, Count: 4, AnchorChecked: 4 } && string.Join(',', happy.Calls) == UnlockFlow(4, ""),
        $"selfcheck reads, anchors, releases: {string.Join(',', happy.Calls)}");
    Require(!happy.Calls.Any(call => call is "prepare" or "mark" or "set" or "store" or "wait_store"), "selfcheck never prepares or writes");

    var many = new FakeNative { Subscribed = true, Achievements = Enumerable.Range(0, 7).Select(i => new FakeAchievement($"A{i}")).ToList() };
    Require(Run(many) is { Status.Error: null, Count: 7, AnchorChecked: 5 } && many.Calls.Count(call => call == "get_ach") == 5, "anchor covers the first five");
    Require(Run(new FakeNative { Subscribed = true }) is { Status.Error: null, Count: 0, AnchorChecked: 0 }, "no achievements, nothing to anchor");
    Require(Run(new FakeNative { Subscribed = true, Achievements = FourAchievements(), AnchorLiesAt = 1 }) is
        { Status.Error: "stats_implausible", Count: 0, AnchorChecked: 0 }, "anchor disagreement");
    Require(Run(new FakeNative { Subscribed = false }).Status.Error == "app_not_subscribed", "selfcheck needs the subscription");
}

static void CheckUnlockWorkers()
{
    static MemoryStream Input(string text) => new(new UTF8Encoding(false).GetBytes(text));
    static Func<IReadOnlyList<string>, Action, UnlockResult> Unlock(FakeNative native) =>
        (names, mark) => ClientIdentity.UnlockAchievements(native, UnlockExpected, () => true, 10, names, TimeSpan.FromMilliseconds(100),
            TimeSpan.FromSeconds(7), mark, CancellationToken.None);
    string writing = StreamProtocol.WritingLine;

    var native = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    var output = new StringWriter();
    Require(StreamWorkers.RunUnlock(10, true, Input("L2\nNOPE\nDONE\nL1\n"), output, CancellationToken.None, Unlock(native)) == 0 &&
        Lines(output).SequenceEqual([writing, UResult("L2", "unlocked"), UResult("NOPE", "unknown"), UResult("DONE", "already"),
            UResult("L1", "unlocked"), UEnd(10, 4, 2, "yes")]), $"unlock worker lines: {string.Join('|', Lines(output))}");

    native = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    output = new StringWriter();
    Require(StreamWorkers.RunUnlock(10, true, Input("DONE\n"), output, CancellationToken.None, Unlock(native)) == 0 &&
        Lines(output).SequenceEqual([UResult("DONE", "already"), UEnd(10, 1, 0, "not_needed")]), "no marker when nothing is written");

    native = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    output = new StringWriter();
    Require(StreamWorkers.RunUnlock(10, false, Input("L1\n"), output, CancellationToken.None, Unlock(native)) == 4 &&
        Lines(output).SequenceEqual([Failed("write_not_allowed")]) && native.Calls.Count == 0, "write gate closed: nothing runs");

    foreach (var text in new[] { "", "\n", "A\nA\n", "A\n\nB\n", "A\u0001\n" })
    {
        native = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
        output = new StringWriter();
        string code = text == "A\nA\n" ? "duplicate_name" : "invalid_name_list";
        Require(StreamWorkers.RunUnlock(10, true, Input(text), output, CancellationToken.None, Unlock(native)) == 2 &&
            Lines(output).SequenceEqual([Failed(code)]) && native.Calls.Count == 0, $"bad input exits 2 before any native call: {code}");
    }

    native = new FakeNative { Subscribed = true, Achievements = FourAchievements(), AnchorLiesAt = 1 };
    output = new StringWriter();
    Require(StreamWorkers.RunUnlock(10, true, Input("L1\n"), output, CancellationToken.None, Unlock(native)) == 4 &&
        Lines(output).SequenceEqual([Failed("stats_implausible")]), "failure before the first write: plain failed line");

    native = new FakeNative { Subscribed = true, Achievements = FourAchievements(), SecondId = UnlockExpected + 1 };
    output = new StringWriter();
    Require(StreamWorkers.RunUnlock(10, true, Input("L1\n"), output, CancellationToken.None, Unlock(native)) == 4 &&
        Lines(output).SequenceEqual([writing, StreamProtocol.UnlockFailedLine("active_account_changed", true)]),
        $"failure after the first write: marker then wrote:true ({string.Join('|', Lines(output))})");
    Require(StreamProtocol.UnlockFailedLine("x", true) == """{"protocolVersion":2,"status":"failed","error":"x","wrote":true}""" &&
        StreamProtocol.UnlockFailedLine("x", false) == Failed("x"), "failed line shapes");

    using var gone = new CancellationTokenSource();
    gone.Cancel();
    native = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    output = new StringWriter();
    Require(StreamWorkers.RunUnlock(10, true, Input("L1\n"), output, gone.Token,
        (names, mark) => ClientIdentity.UnlockAchievements(native, UnlockExpected, () => true, 10, names, TimeSpan.FromSeconds(1),
            TimeSpan.FromSeconds(1), mark, gone.Token)) == 1 && Lines(output).Length == 0 && !native.Calls.Contains("set"),
        "parent gone: nothing written, nothing printed");

    // An exception from SetAchievement or StoreStats after the marker escapes the worker: the marker is already out, so the
    // parent (see CheckUnlockParent: unl-throw) reports wrote:true.
    foreach (string failing in new[] { "set", "store" })
    {
        native = new FakeNative { Subscribed = true, Achievements = FourAchievements(), FailingOperation = failing };
        output = new StringWriter();
        bool escaped = false;
        try
        {
            StreamWorkers.RunUnlock(10, true, Input("L1\n"), output, CancellationToken.None, Unlock(native));
        }
        catch (InvalidOperationException)
        {
            escaped = true;
        }
        Require(escaped && Lines(output).SequenceEqual([writing]) && native.Calls.TakeLast(2).SequenceEqual(["release_user", "release_pipe"]),
            $"exception in {failing} after the marker: marker printed, still released ({string.Join('|', Lines(output))})");
    }

    static string SelfLine(int count, int anchored) => StreamProtocol.SelfCheckCompleteLine(10, count, anchored);
    native = new FakeNative { Subscribed = true, Achievements = FourAchievements() };
    output = new StringWriter();
    Require(StreamWorkers.RunSelfCheck(10, output, CancellationToken.None, () => ClientIdentity.SelfCheckAchievements(native, UnlockExpected,
        () => true, 10, TimeSpan.FromSeconds(1), CancellationToken.None)) == 0 && Lines(output).SequenceEqual([SelfLine(4, 4)]), "selfcheck worker line");
    Require(SelfLine(4, 4) == """{"protocolVersion":2,"status":"complete","appId":10,"count":4,"anchorChecked":4}""", "selfcheck line contract");
    native = new FakeNative { Subscribed = true, Achievements = FourAchievements(), AnchorLiesAt = 0 };
    output = new StringWriter();
    Require(StreamWorkers.RunSelfCheck(10, output, CancellationToken.None, () => ClientIdentity.SelfCheckAchievements(native, UnlockExpected,
        () => true, 10, TimeSpan.FromSeconds(1), CancellationToken.None)) == 4 && Lines(output).SequenceEqual([Failed("stats_implausible")]),
        "selfcheck worker failure");
}

static string UResult(string name, string result) => StreamProtocol.UnlockLine(name, result);
static string UEnd(uint app, int requested, int unlocked, string stored) => StreamProtocol.UnlockCompleteLine(app, requested, unlocked, stored);

static void CheckUnlockNames()
{
    static string? Read(byte[] bytes, List<string> names) => StreamProtocol.ReadNames(new MemoryStream(bytes), names);
    static byte[] Utf8(string text) => new UTF8Encoding(false).GetBytes(text);

    var names = new List<string>();
    Require(Read(Utf8("A\nB C\nCafé\n日本\n"), names) is null && names.SequenceEqual(["A", "B C", "Café", "日本"]), "names read as UTF-8 lines");
    names.Clear();
    Require(Read(Utf8("A\r\nB"), names) is null && names.SequenceEqual(["A", "B"]), "CRLF and a missing final newline are accepted");
    names.Clear();
    Require(Read(Utf8(string.Join('\n', Enumerable.Range(0, 200).Select(i => $"A{i}")) + "\n"), names) is null && names.Count == 200, "200 names accepted");
    names.Clear();
    Require(Read(Utf8(string.Join("\r\n", Enumerable.Range(0, 200).Select(i => i.ToString("D3") + new string('x', 253))) + "\r\n"), names) is null &&
        names.Count == 200, "200 names of 256 bytes with CRLF accepted");
    foreach (var (bytes, code, scenario) in new (byte[], string, string)[]
    {
        (Utf8(""), "invalid_name_list", "0 names"),
        (Utf8("\n"), "invalid_name_list", "one empty line"),
        (Utf8(string.Join('\n', Enumerable.Range(0, 201).Select(i => $"A{i}")) + "\n"), "invalid_name_list", "201 names"),
        (Utf8("A\nB\nA\n"), "duplicate_name", "duplicate"),
        (Utf8("A\n\nB\n"), "invalid_name_list", "empty line in the middle"),
        (Utf8("A\n\n"), "invalid_name_list", "empty last line"),
        (Utf8("A\u0001B\n"), "invalid_name_list", "control character"),
        (Utf8("A\tB\n"), "invalid_name_list", "tab"),
        (Utf8("A\u007f\n"), "invalid_name_list", "DEL"),
        (Utf8("A\0B\n"), "invalid_name_list", "NUL"),
        (Utf8("A\rB\n"), "invalid_name_list", "carriage return inside a line"),
        (new byte[] { 0x41, 0xC3, 0x28, 0x0A }, "invalid_name_list", "invalid UTF-8 (bad continuation)"),
        (new byte[] { 0xFF, 0x0A }, "invalid_name_list", "invalid UTF-8 (0xFF)"),
        (new byte[] { 0xED, 0xA0, 0x80, 0x0A }, "invalid_name_list", "encoded surrogate"),
        (new byte[] { 0xC0, 0x80, 0x0A }, "invalid_name_list", "overlong NUL"),
        (new byte[] { 0xEF, 0xBF, 0xBD, 0x0A }, "invalid_name_list", "U+FFFD"),
        (Utf8(new string('A', 257) + "\n"), "invalid_name_list", "257 bytes"),
        (Utf8(string.Concat(Enumerable.Repeat("日", 86)) + "\n"), "invalid_name_list", "258 bytes of CJK"),
        (new byte[60000], "invalid_name_list", "far too much input"),
    })
    {
        names.Clear();
        Require(Read(bytes, names) == code, $"names rejected: {scenario}");
    }
    names.Clear();
    Require(Read(Utf8(new string('A', 256) + "\n" + string.Concat(Enumerable.Repeat("日", 85)) + "\n"), names) is null && names.Count == 2, "256 bytes accepted");
}

static void CheckUnlockOutputValidation()
{
    string[] names = ["A", "B"];
    string writing = StreamProtocol.WritingLine, a = UResult("A", "unlocked"), b = UResult("B", "already");
    string done = UEnd(10, 2, 1, "yes");
    static string? Validate(string text, string[] names, WriteProgress progress, List<string> lines) =>
        StreamProtocol.ReadUnlockOutput(new StringReader(text), 10, names, progress, lines);

    var progress = new WriteProgress();
    var lines = new List<string>();
    Require(Validate($"{writing}\n{a}\n{b}\n{done}\n", names, progress, lines) is null && lines.SequenceEqual([a, b, done]) && progress.Started,
        "valid unlock stream: canonical lines, marker recorded");
    progress = new WriteProgress();
    lines = [];
    Require(Validate($"{UResult("A", "already")}\n{UResult("B", "unknown")}\n{UEnd(10, 2, 0, "not_needed")}\n", names, progress, lines) is null &&
        !progress.Started && lines.Count == 3, "valid stream without writes: no marker");
    lines = [];
    Require(Validate($"{a.Replace(",", ", ")}\n{b}\n{done}\n".Insert(0, writing + "\n"), names, new WriteProgress(), lines) is null && lines[0] == a,
        "lines are re-serialised canonically");
    foreach (var (results, stored) in new (string[], string)[]
    {
        (["rejected", "already"], "not_needed"), (["unlocked", "unconfirmed"], "yes"), (["pending", "pending"], "timeout"),
        (["store_failed", "store_failed"], "no"), (["pending", "unconfirmed"], "no"), (["pending", "unconfirmed"], "timeout"),
        (["rejected", "unlocked"], "yes"),
    })
    {
        var text = $"{writing}\n{UResult("A", results[0])}\n{UResult("B", results[1])}\n{UEnd(10, 2, results.Count(r => r == "unlocked"), stored)}\n";
        Require(Validate(text, names, new WriteProgress(), []) is null, $"consistent outcome accepted: {string.Join('/', results)} {stored}");
    }

    // Failures: the code passes through, and wrote:true (or an earlier marker) is recorded.
    progress = new WriteProgress();
    Require(Validate($"{Failed("stats_unavailable")}\n", names, progress, []) == "stats_unavailable" && !progress.Started, "plain failure: nothing written");
    progress = new WriteProgress();
    Require(Validate($"{StreamProtocol.UnlockFailedLine("worker_failed", true)}\n", names, progress, []) == "worker_failed" && progress.Started,
        "failure with wrote:true is recorded");
    progress = new WriteProgress();
    Require(Validate($"{writing}\n{Failed("worker_failed")}\n", names, progress, []) == "worker_failed" && progress.Started, "marker then failure is a write");
    progress = new WriteProgress();
    Require(Validate($"{writing}\n{a}\n", names, progress, []) == "worker_failed" && progress.Started, "truncated stream after the marker");

    string wrongKey = a.Replace("\"result\"", "\"outcome\"");
    string[] violations =
    [
        $"{writing}\n{a}\n{UResult("A", "unlocked")}\n{done}\n",
        $"{writing}\n{b}\n{a}\n{done}\n",
        $"{writing}\n{UResult("C", "unlocked")}\n{b}\n{done}\n",
        $"{writing}\n{a.Replace("unlocked", "done")}\n{b}\n{done}\n",
        $"{writing}\n{a.Replace("\"unlocked\"", "1")}\n{b}\n{done}\n",
        $"{writing}\n{a[..^1]},\"x\":1}}\n{b}\n{done}\n",
        $"{writing}\n{wrongKey}\n{b}\n{done}\n",
        $"{writing}\n{a.Replace("\"protocolVersion\":2", "\"protocolVersion\":1")}\n{b}\n{done}\n",
        $"{writing}\n{a.Replace("\"A\"", "5")}\n{b}\n{done}\n",
        $"{writing}\n{a.Replace("\"A\"", "\"\\ud800\"")}\n{b}\n{done}\n",
        $"{a}\n{b}\n{done}\n",
        $"{writing}\n{UResult("A", "already")}\n{UResult("B", "unknown")}\n{UEnd(10, 2, 0, "not_needed")}\n",
        $"{writing}\n{writing}\n{a}\n{b}\n{done}\n",
        $"{a}\n{writing}\n{b}\n{done}\n",
        $"{writing}\n{a}\n{b}\n{UEnd(10, 3, 1, "yes")}\n",
        $"{writing}\n{a}\n{b}\n{UEnd(10, 2, 2, "yes")}\n",
        $"{writing}\n{a}\n{b}\n{UEnd(10, 2, 0, "yes")}\n",
        $"{writing}\n{a}\n{b}\n{UEnd(11, 2, 1, "yes")}\n",
        $"{writing}\n{a}\n{b}\n{done.Replace("\"yes\"", "\"maybe\"")}\n",
        $"{writing}\n{a}\n{b}\n{done.Replace("\"yes\"", "1")}\n",
        $"{writing}\n{a}\n{b}\n{done[..^1]},\"x\":1}}\n",
        $"{writing}\n{a}\n{b}\n{done.Replace(",\"stored\":\"yes\"", "")}\n",
        $"{writing}\n{a}\n{b}\n{done.Replace("\"requested\":2", "\"requested\":\"2\"")}\n",
        $"{writing}\n{a}\n{b}\n{done.Replace("\"unlocked\":1", "\"unlocked\":1.5")}\n",
        $"{writing}\n{a}\n{b}\n{UEnd(10, 2, 1, "not_needed")}\n",
        $"{writing}\n{a}\n{b}\n{UEnd(10, 2, 1, "timeout")}\n",
        $"{writing}\n{UResult("A", "pending")}\n{b}\n{UEnd(10, 2, 0, "yes")}\n",
        $"{writing}\n{UResult("A", "store_failed")}\n{UResult("B", "pending")}\n{UEnd(10, 2, 0, "no")}\n",
        $"{writing}\n{UResult("A", "rejected")}\n{UResult("B", "rejected")}\n{UEnd(10, 2, 0, "yes")}\n",
        $"{writing}\n{a}\n{b}\n{done}\nextra\n",
        $"{writing}\n{a}\n{b}\n{done}\n{a}\n",
        $"{writing}\n{a}\n{b}\n{UResult("A", "unlocked")}\n{done}\n",
        $"{writing}\n{done}\n",
        $"{Failed("Bad Code!")}\n",
        $"{Failed("x")[..^1]},\"y\":1}}\n",
        $"{StreamProtocol.UnlockFailedLine("x", true).Replace("true", "false")}\n",
        $"{StreamProtocol.UnlockFailedLine("x", true).Replace("true", "\"true\"")}\n",
        $"{StreamProtocol.UnlockFailedLine("x", true)[..^1]},\"y\":1}}\n",
        "untrusted stdout\n",
        $"[1]\n{done}\n",
        new string('x', 5000) + "\n",
    ];
    foreach (var text in violations)
        Require(Validate(text, names, new WriteProgress(), []) == "worker_protocol_violation", $"unlock violation rejected: {text[..Math.Min(text.Length, 100)].ReplaceLineEndings("|")}");
    Require(Validate("", names, new WriteProgress(), []) == "worker_failed", "empty stream");
    progress = new WriteProgress();
    Require(Validate($"{writing}\ngarbage\n", names, progress, []) == "worker_protocol_violation" && progress.Started, "garbage after the marker still counts as a write");

    // What the parent concludes about a write from how the reader stopped (WriteProgress.Wrote).
    static WriteProgress Read(string text)
    {
        var progress = new WriteProgress();
        StreamProtocol.ReadUnlockOutput(new StringReader(text), 10, ["A", "B"], progress, []);
        return progress;
    }

    var cleanFailure = Read($"{Failed("stats_unavailable")}\n");
    Require(cleanFailure is { Started: false, StoppedEarly: true, PreWriteFailure: true, Wrote: true },
        "a clean pre-write failure alone is not enough: the exit must be seen");
    cleanFailure.ExitCode = WriteProgress.PreWriteExit;
    Require(!cleanFailure.Wrote, "clean pre-write failure and the pre-write exit code: nothing written");
    cleanFailure.ExitCode = 0;
    Require(cleanFailure.Wrote, "a worker that exits with another code after a failed line may have written");
    Require(!Read("").Wrote && !Read("").StoppedEarly, "end of stream with nothing read leaves nothing unread");
    foreach (var text in new[] { "untrusted stdout\n", $"{a}\n{writing}\n", $"{writing}\n{writing}\n", $"{a.Replace("unlocked", "done")}\n",
        $"{Failed("Bad Code!")}\n", $"{StreamProtocol.UnlockFailedLine("x", false).Replace("\"x\"", "\"x\",\"y\":1")}\n", new string('x', 5000) + "\n", "[1]\n" })
    {
        var early = Read(text);
        Require(early is { StoppedEarly: true, PreWriteFailure: false, Wrote: true }, $"early stop on a violation counts as a write: {text[..Math.Min(text.Length, 40)].Trim()}");
    }
    Require(Read($"{writing}\n{a}\n{b}\n{done}\n") is { StoppedEarly: false, Started: true, Wrote: true }, "a complete stream with a marker is a write");
    Require(Read($"{UResult("A", "already")}\n{UResult("B", "unknown")}\n{UEnd(10, 2, 0, "not_needed")}\n") is { Wrote: false }, "a complete stream without a marker is not");
    Require(Read($"{writing}\n{Failed("worker_failed")}\n") is { Started: true, PreWriteFailure: false, Wrote: true }, "a failure after the marker is never pre-write");
    Require(Read($"{UResult("A", "already")}\n{Failed("worker_failed")}\n") is { PreWriteFailure: false, Wrote: true }, "a failure after result lines is not a clean pre-write failure");
    // A line that claims wrote:true counts even when the rest of that line is malformed.
    foreach (var text in new[] { StreamProtocol.UnlockFailedLine("x", true)[..^1] + ",\"y\":1}", StreamProtocol.UnlockFailedLine("Bad Code!", true),
        StreamProtocol.UnlockFailedLine("x", true).Replace("\"protocolVersion\":2", "\"protocolVersion\":1"),
        StreamProtocol.UnlockFailedLine("x", true).Replace("\"error\":\"x\"", "\"error\":5") })
    {
        var claimed = new WriteProgress();
        Require(StreamProtocol.ReadUnlockOutput(new StringReader(text + "\n"), 10, names, claimed, []) == "worker_protocol_violation" && claimed.Started,
            $"wrote:true claim recorded before validation: {text}");
    }

    // A lone surrogate in a status or an error code is a protocol violation, never an exception.
    string loneStatus = """{"protocolVersion":2,"status":"\ud800"}""", loneError = """{"protocolVersion":2,"status":"failed","error":"\ud800"}""";
    foreach (var text in new[] { loneStatus, loneError, """{"protocolVersion":2,"status":"failed","error":"x\udc00"}""" })
    {
        Require(Validate($"{text}\n", names, new WriteProgress(), []) == "worker_protocol_violation", $"unlock: lone surrogate is a violation: {text}");
        Require(Validate($"{writing}\n{text}\n", names, new WriteProgress(), []) == "worker_protocol_violation", $"unlock after marker: {text}");
        Require(StreamProtocol.ReadAppsOutput(new StringReader($"{text}\n"), [10], []) == "worker_protocol_violation", $"apps first line: {text}");
        Require(StreamProtocol.ReadAppsOutput(new StringReader($"{StreamProtocol.AppLine(new(10, true, true))}\n{text}\n"), [10], []) == "worker_protocol_violation",
            $"apps end line: {text}");
        Require(StreamProtocol.ReadAchievementsOutput(new StringReader($"{text}\n"), 10, []) == "worker_protocol_violation", $"achievements: {text}");
        Require(StreamProtocol.ReadStatusLine(new StringReader($"{text}\n"), "holding", 10) == "worker_protocol_violation", $"status line: {text}");
        Require(StreamProtocol.ReadSelfCheckOutput(new StringReader($"{text}\n"), 10, []) == "worker_protocol_violation", $"selfcheck: {text}");
    }
    var lone = new WriteProgress();
    Require(Validate($"{writing}\n{loneError}\n", names, lone, []) == "worker_protocol_violation" && lone is { Started: true, Wrote: true }, "lone surrogate after the marker still counts as a write");

    // selfcheck stream
    string self = StreamProtocol.SelfCheckCompleteLine(10, 7, 5);
    var selfLines = new List<string>();
    Require(StreamProtocol.ReadSelfCheckOutput(new StringReader($"{self}\n"), 10, selfLines) is null && selfLines.SequenceEqual([self]), "valid selfcheck line");
    Require(StreamProtocol.ReadSelfCheckOutput(new StringReader($"{Failed("stats_unavailable")}\n"), 10, []) == "stats_unavailable", "selfcheck failure code");
    foreach (var text in new[]
    {
        $"{StreamProtocol.SelfCheckCompleteLine(11, 7, 5)}\n", $"{StreamProtocol.SelfCheckCompleteLine(10, 7, 4)}\n",
        $"{StreamProtocol.SelfCheckCompleteLine(10, 3, 5)}\n", $"{StreamProtocol.SelfCheckCompleteLine(10, 10001, 5)}\n",
        $"{self}\n{self}\n", $"{self[..^1]},\"x\":1}}\n", $"{self.Replace(",\"anchorChecked\":5", "")}\n", "garbage\n",
        $"{self.Replace("\"count\":7", "\"count\":\"7\"")}\n", $"{self.Replace("\"complete\"", "\"done\"")}\n",
    })
        Require(StreamProtocol.ReadSelfCheckOutput(new StringReader(text), 10, []) == "worker_protocol_violation", $"selfcheck violation: {text.Trim()}");
    Require(StreamProtocol.ReadSelfCheckOutput(new StringReader(""), 10, []) == "worker_failed", "selfcheck empty stream");
}

static async Task CheckUnlockParent(string scratch)
{
    string[] names = ["L1", "L2", "日本", "Café"];
    static async Task<(int Exit, string[] Lines)> Run(string mode, string[] names, TimeSpan timeout, params string[] extra)
    {
        var output = new StringWriter();
        int exit = await StreamCommands.RunUnlock(FixtureWorker(mode, extra), 10, names, output, timeout);
        return (exit, Lines(output));
    }

    // Kills the fixture for real (nothing is left running) but reports the kill as failed.
    static async Task<(int Exit, string[] Lines)> RunUnkillable(string mode, string[] names, TimeSpan timeout, params string[] extra)
    {
        var output = new StringWriter();
        int exit = await StreamCommands.RunUnlock(FixtureWorker(mode, extra), 10, names, output, timeout, terminate: child =>
        {
            Require(IdentityWorker.TerminateTree(child), "fixture reaped before the synthetic kill failure");
            return false;
        });
        return (exit, Lines(output));
    }

    var (exit, lines) = await Run("unl-ok", names, TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines.SequenceEqual([UResult("L1", "unlocked"), UResult("L2", "already"), UResult("日本", "unlocked"),
        UResult("Café", "already"), UEnd(10, 4, 2, "yes")]) && lines.All(line => line.All(c => c < 0x80)),
        $"validated unlock forwarded without the marker, ASCII-escaped: {string.Join('|', lines)}");
    (exit, lines) = await Run("unl-none", names, TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines.Length == 5 && lines[^1] == UEnd(10, 4, 0, "not_needed"), "no write needed completes");
    (exit, lines) = await Run("unl-env", names, TimeSpan.FromSeconds(20));
    Require(exit == 4 && lines.SequenceEqual([Failed("app_10")]), "the worker (and only the worker) sees SteamAppId");
    Require(Environment.GetEnvironmentVariable("SteamAppId") is null, "unlock parent leaves no SteamAppId behind");

    string wrote = StreamProtocol.UnlockFailedLine("worker_failed", true), plain = Failed("worker_failed");
    foreach (var (mode, expected) in new[]
    {
        ("unl-failed", Failed("stats_unavailable")),
        ("unl-failed-wrote", StreamProtocol.UnlockFailedLine("active_account_changed", true)),
        ("unl-crash-early", plain),
        ("unl-crash", wrote),
        ("unl-garbage-marker", StreamProtocol.UnlockFailedLine("worker_protocol_violation", true)),
        ("unl-noise", StreamProtocol.UnlockFailedLine("worker_protocol_violation", true)), // unread lines may hold a marker
        ("unl-throw", wrote),
        ("unl-garbage-late-marker", StreamProtocol.UnlockFailedLine("worker_protocol_violation", true)),
        ("unl-failed-exit0", StreamProtocol.UnlockFailedLine("stats_unavailable", true)),
        ("unl-wrongname", StreamProtocol.UnlockFailedLine("worker_protocol_violation", true)),
        ("unl-badstored", StreamProtocol.UnlockFailedLine("worker_protocol_violation", true)),
        ("unl-extra", StreamProtocol.UnlockFailedLine("worker_protocol_violation", true)),
        ("unl-badexit", wrote),
    })
    {
        (exit, lines) = await Run(mode, names, TimeSpan.FromSeconds(20));
        Require(exit == 4 && lines.SequenceEqual([expected]), $"{mode} yields only {expected} (got {string.Join('|', lines)})");
    }

    foreach (var (mode, expected) in new[] { ("unl-hang", Failed("worker_timeout")),
        ("unl-hang-marker", StreamProtocol.UnlockFailedLine("worker_timeout", true)) })
    {
        string pidFile = Path.Combine(scratch, mode + ".pid");
        var started = Stopwatch.StartNew();
        (exit, lines) = await Run(mode, names, TimeSpan.FromSeconds(3), pidFile);
        Require(exit == 4 && lines.SequenceEqual([expected]) && started.Elapsed < TimeSpan.FromSeconds(12), $"{mode}: total timeout, wrote only after the marker");
        await RequireGone(pidFile);
    }

    // A failed line, then a worker that does not leave by itself: it may have gone on to write, so wrote:true.
    string failedHangPid = Path.Combine(scratch, "unl-failed-hang.pid");
    (exit, lines) = await Run("unl-failed-hang", names, TimeSpan.FromSeconds(20), failedHangPid);
    Require(exit == 4 && lines.SequenceEqual([StreamProtocol.UnlockFailedLine("stats_unavailable", true)]),
        $"unl-failed-hang: a failed line without a clean exit is a possible write ({string.Join('|', lines)})");
    await RequireGone(failedHangPid);

    // A worker that cannot be killed: wrote:true as soon as the names were handed over, marker or not.
    foreach (var mode in new[] { "unl-hang", "unl-hang-marker" })
    {
        string pidFile = Path.Combine(scratch, mode + "-unkillable.pid");
        (exit, lines) = await RunUnkillable(mode, names, TimeSpan.FromSeconds(3), pidFile);
        Require(exit == 4 && lines.SequenceEqual([StreamProtocol.UnlockFailedLine("worker_cleanup_failed", true)]),
            $"{mode}: failed kill reports wrote:true ({string.Join('|', lines)})");
        await RequireGone(pidFile);
    }
    (exit, lines) = await RunUnkillable("unl-failed", names, TimeSpan.FromSeconds(20));
    Require(exit == 4 && lines.SequenceEqual([Failed("stats_unavailable")]), "a worker that left by itself needs no kill: the clean failure stays plain");

    // Any exception from the reader still ends in the single result line, with wrote:true (the rest was never read).
    var thrownOutput = new StringWriter();
    exit = await StreamCommands.RunUnlock(FixtureWorker("unl-ok"), 10, names, thrownOutput, TimeSpan.FromSeconds(20),
        _ => throw new NullReferenceException("synthetic reader failure"));
    Require(exit == 4 && Lines(thrownOutput).SequenceEqual([StreamProtocol.UnlockFailedLine("worker_failed", true)]),
        $"reader exception: one failed line with wrote:true ({string.Join('|', Lines(thrownOutput))})");

    // selfcheck parent
    static async Task<(int Exit, string[] Lines)> RunSelf(string mode, TimeSpan timeout, params string[] extra)
    {
        var output = new StringWriter();
        var start = FixtureWorker(mode, extra);
        start.Environment[StreamProtocol.WriteGate] = "1";
        int code = await StreamCommands.RunSelfCheck(start, 10, output, timeout);
        return (code, Lines(output));
    }

    (exit, lines) = await RunSelf("slf-ok", TimeSpan.FromSeconds(20));
    Require(exit == 0 && lines.SequenceEqual([StreamProtocol.SelfCheckCompleteLine(10, 2, 2)]), "selfcheck forwarded");
    (exit, lines) = await RunSelf("slf-env", TimeSpan.FromSeconds(20));
    Require(exit == 4 && lines.SequenceEqual([Failed("app_10_gate_none")]), "selfcheck worker sees SteamAppId but never the write gate");
    foreach (var (mode, code) in new[] { ("slf-failed", "stats_unavailable"), ("slf-badcount", "worker_protocol_violation"),
        ("slf-noise", "worker_protocol_violation"), ("slf-extra", "worker_protocol_violation"), ("slf-badexit", "worker_failed") })
    {
        (exit, lines) = await RunSelf(mode, TimeSpan.FromSeconds(20));
        Require(exit == 4 && lines.SequenceEqual([Failed(code)]), $"{mode} yields only the failed line");
    }
    string selfPid = Path.Combine(scratch, "slf-hang.pid");
    (exit, lines) = await RunSelf("slf-hang", TimeSpan.FromSeconds(3), selfPid);
    Require(exit == 4 && lines.SequenceEqual([Failed("worker_timeout")]), "selfcheck total timeout");
    await RequireGone(selfPid);
}

static async Task CheckUnlockCommands()
{
    const string id = "76561197960265770";
    foreach (var gate in new string?[] { null, "0", "true", " 1", "1 ", "", "01", "yes" })
    {
        var (exit, response) = await RunProbe(["unlock", id, "10"], stdin: "L1\n", writeGate: gate);
        using (response)
            Require(exit == 4 && response.RootElement.GetProperty("error").GetString() == "write_not_allowed" &&
                response.RootElement.EnumerateObject().Count() == 3, $"write gate {gate ?? "unset"} is refused before any worker");
    }
    foreach (var inherited in new[] { "480", "10" })
    {
        var (exit, response) = await RunProbe(["unlock", id, "10"], inherited, "L1\n", "1");
        using (response)
            Require(exit == 4 && response.RootElement.GetProperty("error").GetString() == "inherited_game_context", "unlock keeps the inherited game context guard");
        (exit, response) = await RunProbe(["achievements-selfcheck", id, "10"], inherited);
        using (response)
            Require(exit == 4 && response.RootElement.GetProperty("error").GetString() == "inherited_game_context", "selfcheck keeps the inherited game context guard");
    }
    foreach (var (stdin, code) in new[] { ("", "invalid_name_list"), ("A\nA\n", "duplicate_name"), ("A\u0001\n", "invalid_name_list"),
        ("A\n\nB\n", "invalid_name_list"), ("\uFFFD\n", "invalid_name_list"), (new string('A', 257) + "\n", "invalid_name_list"),
        (string.Join('\n', Enumerable.Range(0, 201).Select(i => $"A{i}")) + "\n", "invalid_name_list") })
    {
        var (exit, response) = await RunProbe(["unlock", id, "10"], stdin: stdin, writeGate: "1");
        using (response)
            Require(exit == 2 && response.RootElement.GetProperty("error").GetString() == code && response.RootElement.EnumerateObject().Count() == 3,
                $"input error {code} exits 2 before any worker");
    }
}

static void CheckWriteSlotTables()
{
    string[] allowed = ["GetAchievement", "SetAchievement", "StoreStats"];
    var tables = WindowsSteamClient.AchievementWriteSlots;
    Require(tables.Keys.OrderBy(key => key).SequenceEqual(["STEAMUSERSTATS_INTERFACE_VERSION012", "STEAMUSERSTATS_INTERFACE_VERSION013"]),
        "a write table for exactly the versions that have a read table");
    foreach (var layout in WindowsSteamClient.StatsLayouts)
    {
        var table = tables[layout.Version];
        Require(table.Keys.OrderBy(key => key).SequenceEqual(allowed), $"{layout.Version}: only GetAchievement, SetAchievement and StoreStats");
        Require(table["SetAchievement"] == table["GetAchievement"] + 1, $"{layout.Version}: SetAchievement directly after GetAchievement");
        Require(layout.Slots["GetAchievementAndUnlockTime"] == table["SetAchievement"] + 2, $"{layout.Version}: ClearAchievement sits between SetAchievement and GetAchievementAndUnlockTime");
        Require(table["StoreStats"] == layout.Slots["GetAchievementAndUnlockTime"] + 1, $"{layout.Version}: StoreStats directly after GetAchievementAndUnlockTime");
        Require(table.Values.Concat(layout.Slots.Values).Distinct().Count() == table.Count + layout.Slots.Count, $"{layout.Version}: no slot shared with a read slot");
    }
    var tableFor = WindowsSteamClient.AchievementWriteSlots;
    Require(tableFor["STEAMUSERSTATS_INTERFACE_VERSION013"]["GetAchievement"] == 5 && tableFor["STEAMUSERSTATS_INTERFACE_VERSION013"]["SetAchievement"] == 6 &&
        tableFor["STEAMUSERSTATS_INTERFACE_VERSION013"]["StoreStats"] == 9, "VERSION013 write slots");
    Require(tableFor["STEAMUSERSTATS_INTERFACE_VERSION012"]["GetAchievement"] == 6 && tableFor["STEAMUSERSTATS_INTERFACE_VERSION012"]["SetAchievement"] == 7 &&
        tableFor["STEAMUSERSTATS_INTERFACE_VERSION012"]["StoreStats"] == 10, "VERSION012 write slots");
}

static void CheckWriteAbi()
{
    const uint App = 10;
    foreach (var layout in WindowsSteamClient.StatsLayouts)
    {
        var slots = WindowsSteamClient.AchievementWriteSlots[layout.Version];
        nint table = Marshal.AllocHGlobal(32 * IntPtr.Size);
        nint instance = Marshal.AllocHGlobal(IntPtr.Size);
        var log = new List<string>();
        var achievedNow = new HashSet<string> { "ACH_ONE" };
        string flagMode = "normal";
        bool trapped = false;
        var inbox = new Queue<(int Callback, ulong Game, int Result, int Size)>();
        bool replyOnStore = false, flood = false;
        var live = new List<nint>();
        int freed = 0;

        WindowsSteamClient.AchievementFlagMethod getAchievement = (nint self, string api, ref ulong buffer) =>
        {
            log.Add("flag:" + api);
            switch (flagMode)
            {
                case "silent":
                    break;
                case "wide":
                    buffer = 1; // an int-sized writer clobbers more than the one byte it was given
                    break;
                default:
                    buffer = (buffer & ~0xFFUL) | (achievedNow.Contains(api) ? 1UL : 0UL);
                    break;
            }
            return api != "ACH_NONE";
        };
        WindowsSteamClient.SetAchievementMethod setAchievement = (nint self, string api) =>
        {
            log.Add("set:" + api);
            if (api == "ACH_BAD")
                return false;
            achievedNow.Add(api);
            return true;
        };
        WindowsSteamClient.StoreStatsMethod storeStats = (nint self) =>
        {
            log.Add("store");
            if (replyOnStore)
                inbox.Enqueue((1102, App, 1, 12));
            return true;
        };
        WindowsSteamClient.UnlockTimeMethod state = (nint self, string api, ref byte achieved, ref uint unlock) =>
        {
            achieved = achievedNow.Contains(api) ? (byte)1 : (byte)0;
            unlock = achieved == 1 ? 1700000000u : 0;
            return true;
        };
        TrapMethod trap = (nint self) =>
        {
            trapped = true;
            return false;
        };
        WindowsSteamClient.NextCallbackMethod next = (int pipe, out WindowsSteamClient.CallbackMsg message) =>
        {
            message = default;
            if (flood)
                inbox.Enqueue((1101, App, 1, 24));
            if (!inbox.TryDequeue(out var entry))
                return false;
            nint param = Marshal.AllocHGlobal(32);
            live.Add(param);
            Marshal.WriteInt64(param, 0, (long)entry.Game);
            Marshal.WriteInt32(param, 8, entry.Result);
            message = new() { User = 1, Callback = entry.Callback, Param = param, ParamSize = entry.Size };
            return true;
        };
        WindowsSteamClient.FreeCallbackMethod free = (int pipe) =>
        {
            freed++;
            return true;
        };
        try
        {
            for (int i = 0; i < 32; i++)
                Marshal.WriteIntPtr(table, i * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(trap));
            Marshal.WriteIntPtr(table, slots["GetAchievement"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(getAchievement));
            Marshal.WriteIntPtr(table, slots["SetAchievement"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(setAchievement));
            Marshal.WriteIntPtr(table, slots["StoreStats"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(storeStats));
            Marshal.WriteIntPtr(table, layout.Slots["GetAchievementAndUnlockTime"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(state));
            Marshal.WriteIntPtr(instance, table);
            var client = new WindowsSteamClient();
            client.AttachStats(instance, layout);
            client.AttachCallbacks(next, free);

            Require(client.GetAchievementFlag("ACH_ONE", out bool one) && one && client.GetAchievementFlag("ACH_TWO", out bool two) && !two,
                $"{layout.Version}: GetAchievement slot, one-byte flag");
            Require(client.BoundStatsSlots.SetEquals(["GetAchievement"]), $"{layout.Version}: only GetAchievement is bound for the anchor");
            flagMode = "silent";
            Require(!client.GetAchievementFlag("ACH_ONE", out _), $"{layout.Version}: true without writing the flag is not trusted");
            flagMode = "wide";
            Require(!client.GetAchievementFlag("ACH_ONE", out _), $"{layout.Version}: a wider write than one byte is not trusted");
            flagMode = "normal";
            Require(!client.GetAchievementFlag("ACH_NONE", out _), $"{layout.Version}: unknown name");
            Require(!client.BoundStatsSlots.Contains("SetAchievement") && !client.BoundStatsSlots.Contains("StoreStats"), $"{layout.Version}: no write slot before PrepareWrite");

            client.PrepareWrite();
            Require(client.BoundStatsSlots.SetEquals(["GetAchievement", "SetAchievement", "StoreStats"]), $"{layout.Version}: PrepareWrite binds exactly the two write slots");

            // The callback pump, case by case.
            void Post(int callback, ulong game, int result, int size = 12) => inbox.Enqueue((callback, game, result, size));
            Post(1102, 11, 1);
            Post(1101, App, 1, 24);
            Post(1102, (1UL << 56) | App, 1);
            Post(1102, App, 1, 8);
            Post(1102, App, 1);
            Require(client.WaitForStore(App, TimeSpan.FromSeconds(5), CancellationToken.None) == StoreOutcome.Success && freed == 5 && inbox.Count == 0,
                $"{layout.Version}: other ids, other callbacks and short ones are skipped; each one freed ({freed})");
            freed = 0;
            Post(1102, App, 2);
            Require(client.WaitForStore(App, TimeSpan.FromSeconds(5), CancellationToken.None) == StoreOutcome.Failed && freed == 1, "an error result is a failed store");
            freed = 0;
            var watch = Stopwatch.StartNew();
            Post(1102, 11, 1);
            Require(client.WaitForStore(App, TimeSpan.FromMilliseconds(300), CancellationToken.None) == StoreOutcome.Timeout &&
                watch.Elapsed >= TimeSpan.FromMilliseconds(250) && watch.Elapsed < TimeSpan.FromSeconds(5) && freed == 1, "no callback for this game: timeout");
            using var stopped = new CancellationTokenSource();
            stopped.Cancel();
            watch.Restart();
            Require(client.WaitForStore(App, TimeSpan.FromSeconds(10), stopped.Token) == StoreOutcome.Timeout && watch.Elapsed < TimeSpan.FromSeconds(3), "a gone parent ends the wait");

            // A stale store callback for the same game that is queued before StoreStats must not be taken for its answer.
            log.Clear();
            freed = 0;
            Post(1102, App, 1);
            Post(1101, App, 1, 24);
            Require(client.StoreStats() && log.SequenceEqual(["store"]) && inbox.Count == 0 && freed == 2,
                $"{layout.Version}: StoreStats discards what is queued first ({freed} freed)");
            Require(client.WaitForStore(App, TimeSpan.FromMilliseconds(300), CancellationToken.None) == StoreOutcome.Timeout,
                $"{layout.Version}: the stale callback is not the answer of the new store");
            replyOnStore = true;
            Post(1102, App, 2);
            Require(client.StoreStats() && client.WaitForStore(App, TimeSpan.FromSeconds(5), CancellationToken.None) == StoreOutcome.Success,
                $"{layout.Version}: only the callback that follows the store counts");
            replyOnStore = false;

            // A flood of unrelated callbacks cannot stretch the wait past its limit.
            flood = true;
            watch.Restart();
            Require(client.WaitForStore(App, TimeSpan.FromMilliseconds(300), CancellationToken.None) == StoreOutcome.Timeout &&
                watch.Elapsed < TimeSpan.FromSeconds(3), $"{layout.Version}: flood ends at the limit ({watch.Elapsed})");
            flood = false;
            inbox.Clear();

            // The whole write procedure against the real vtable code.
            log.Clear();
            achievedNow.Remove("ACH_TWO");
            freed = 0;
            replyOnStore = true;
            AchievementInfo[] items = [new("ACH_ONE", "One", "d", false, true, 1700000000), new("ACH_TWO", "Two", "d", false, false, 0),
                new("ACH_BAD", "Bad", "d", false, false, 0)];
            Require(AchievementWriter.AnchorCheck(client, items, out int anchored) is null && anchored == 3, $"{layout.Version}: anchor passes on the vtable");
            int marks = 0;
            log.Clear(); // the anchor reads above were only for the count; the order below starts with the writer's own anchor
            Require(AchievementWriter.Anchor(client, items, out var writer) is null && writer is not null, $"{layout.Version}: writer comes from the anchor");
            var report = writer!.Unlock(client, App, ["ACH_TWO", "ACH_BAD", "ACH_ONE", "NOPE"], () => marks++, TimeSpan.FromSeconds(5),
                CancellationToken.None);
            Require(report.Results.SequenceEqual(["unlocked", "rejected", "already", "unknown"]) && report.Stored == "yes" && marks == 1 && freed == 1,
                $"{layout.Version}: results {string.Join('/', report.Results)} stored {report.Stored}");
            Require(log.SequenceEqual(["flag:ACH_ONE", "flag:ACH_TWO", "flag:ACH_BAD", "set:ACH_TWO", "set:ACH_BAD", "store"]),
                $"{layout.Version}: native call order {string.Join(',', log)}");
            Require(client.BoundStatsSlots.SetEquals(["GetAchievement", "SetAchievement", "StoreStats", "GetAchievementAndUnlockTime"]),
                $"{layout.Version}: bound slots are exactly the allowed set ({string.Join(',', client.BoundStatsSlots)})");
            Require(!trapped, $"{layout.Version}: no neighbouring slot was ever called");
            client.Dispose();
        }
        finally
        {
            GC.KeepAlive(getAchievement);
            GC.KeepAlive(setAchievement);
            GC.KeepAlive(storeStats);
            GC.KeepAlive(state);
            GC.KeepAlive(trap);
            GC.KeepAlive(next);
            GC.KeepAlive(free);
            foreach (var param in live)
                Marshal.FreeHGlobal(param);
            Marshal.FreeHGlobal(instance);
            Marshal.FreeHGlobal(table);
        }
    }
}

static void CheckStatsSlotTables()
{
    string[] readOnly = ["RequestCurrentStats", "GetAchievementAndUnlockTime", "GetAchievementDisplayAttribute", "GetNumAchievements",
        "GetAchievementName"];
    string[] mutating = ["SetAchievement", "ClearAchievement", "SetStat", "StoreStats", "ResetAllStats", "IndicateAchievementProgress",
        "UpdateAvgRateStat"];
    var layouts = WindowsSteamClient.StatsLayouts;
    Require(layouts.Select(layout => layout.Version).SequenceEqual(
        ["STEAMUSERSTATS_INTERFACE_VERSION013", "STEAMUSERSTATS_INTERFACE_VERSION012"]), "newest interface version is asked first");
    foreach (var layout in layouts)
    {
        Require(layout.Slots.Keys.All(readOnly.Contains) && !layout.Slots.Keys.Any(mutating.Contains), $"{layout.Version} slot table is read-only");
        Require(layout.Slots.Values.Distinct().Count() == layout.Slots.Count && layout.Slots.Values.All(slot => slot >= 0), $"{layout.Version} slots distinct");
    }
    Require(!layouts[0].Slots.ContainsKey("RequestCurrentStats") && layouts[1].Slots["RequestCurrentStats"] == 0,
        "only the older table has RequestCurrentStats");
    Require(layouts[1].Slots["GetAchievementAndUnlockTime"] == 9 && layouts[1].Slots["GetAchievementDisplayAttribute"] == 12 &&
        layouts[1].Slots["GetNumAchievements"] == 14 && layouts[1].Slots["GetAchievementName"] == 15, "VERSION012 slots");
    Require(layouts[0].Slots["GetAchievementAndUnlockTime"] == 8 && layouts[0].Slots["GetAchievementDisplayAttribute"] == 11 &&
        layouts[0].Slots["GetNumAchievements"] == 13 && layouts[0].Slots["GetAchievementName"] == 14, "VERSION013 slots");
}

static void CheckStatsAbi()
{
    string[] mutating = ["SetAchievement", "ClearAchievement", "SetStat", "StoreStats", "ResetAllStats", "IndicateAchievementProgress",
        "UpdateAvgRateStat", "RequestCurrentStats"];
    foreach (var layout in WindowsSteamClient.StatsLayouts)
    {
        nint table = Marshal.AllocHGlobal(32 * IntPtr.Size);
        nint instance = Marshal.AllocHGlobal(IntPtr.Size);
        nint apiName = Marshal.StringToCoTaskMemUTF8("ACH_ONE");
        nint text = Marshal.StringToCoTaskMemUTF8("Café ☃");
        nint hidden = Marshal.StringToCoTaskMemUTF8("1");
        uint reported = 2;
        bool stateReady = true;
        WindowsSteamClient.NumAchievementsMethod num = self => self == instance ? reported : 99u;
        WindowsSteamClient.AchievementNameMethod name = (self, index) => index == 0 ? apiName : 0;
        WindowsSteamClient.DisplayAttributeMethod attribute = (self, api, key) =>
            api != "ACH_ONE" ? 0 : key switch { "name" or "desc" => text, "hidden" => hidden, _ => 0 };
        bool writesOutputs = true;
        WindowsSteamClient.UnlockTimeMethod state = (nint self, string api, ref byte achieved, ref uint unlock) =>
        {
            if (writesOutputs)
            {
                achieved = 1;
                unlock = 1700000000;
            }
            return api == "ACH_ONE" && stateReady;
        };
        try
        {
            for (int i = 0; i < 32; i++) Marshal.WriteIntPtr(table, i * IntPtr.Size, 0);
            Marshal.WriteIntPtr(table, layout.Slots["GetNumAchievements"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(num));
            Marshal.WriteIntPtr(table, layout.Slots["GetAchievementName"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(name));
            Marshal.WriteIntPtr(table, layout.Slots["GetAchievementDisplayAttribute"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(attribute));
            Marshal.WriteIntPtr(table, layout.Slots["GetAchievementAndUnlockTime"] * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(state));
            Marshal.WriteIntPtr(instance, table);
            var client = new WindowsSteamClient();
            client.AttachStats(instance, layout);
            Require(client.GetNumAchievements() == 2, $"{layout.Version}: count slot and unsigned return");
            Require(client.GetAchievementName(0) == "ACH_ONE" && client.GetAchievementName(1) is null, $"{layout.Version}: name slot, null pointer");
            Require(client.GetDisplayAttribute("ACH_ONE", "desc") == "Café ☃", $"{layout.Version}: UTF-8 text copied");
            Require(client.GetDisplayAttribute("ACH_ONE", "hidden") == "1" && client.GetDisplayAttribute("OTHER", "name") is null,
                $"{layout.Version}: attribute slot");
            Require(client.GetAchievementState("ACH_ONE", out bool achieved, out uint unlock) && achieved && unlock == 1700000000,
                $"{layout.Version}: unlock-time slot and one-byte flag");
            writesOutputs = false;
            Require(!client.GetAchievementState("ACH_ONE", out bool untouched, out _) && !untouched,
                $"{layout.Version}: a function that returns true without writing the flag is not trusted");
            writesOutputs = true;
            Require(client.BoundStatsSlots.All(slot => !mutating.Contains(slot)) && client.BoundStatsSlots.Count == 4,
                $"{layout.Version}: only read slots were bound ({string.Join(',', client.BoundStatsSlots)})");
            if (!layout.Slots.ContainsKey("RequestCurrentStats"))
            {
                // No callback exists on this table: loaded means a readable schema and state.
                var watch = Stopwatch.StartNew();
                Require(client.WaitForStats(10, 1, TimeSpan.FromSeconds(5), CancellationToken.None) && watch.Elapsed < TimeSpan.FromSeconds(1),
                    $"{layout.Version}: loaded stats are detected at once");
                stateReady = false;
                watch.Restart();
                Require(!client.WaitForStats(10, 1, TimeSpan.FromMilliseconds(300), CancellationToken.None) &&
                    watch.Elapsed < TimeSpan.FromSeconds(3), $"{layout.Version}: unreadable state is stats_unavailable after the limit");
                (stateReady, reported) = (true, 0);
                watch.Restart();
                Require(client.WaitForStats(10, 1, TimeSpan.FromMilliseconds(500), CancellationToken.None) &&
                    watch.Elapsed >= TimeSpan.FromMilliseconds(50), $"{layout.Version}: an empty schema settles before it counts as loaded");
                reported = 99999;
                Require(client.WaitForStats(10, 1, TimeSpan.FromMilliseconds(500), CancellationToken.None),
                    $"{layout.Version}: an implausible count is passed on to the reader, not waited for");
            }
            client.Dispose();
        }
        finally
        {
            GC.KeepAlive(num);
            GC.KeepAlive(name);
            GC.KeepAlive(attribute);
            GC.KeepAlive(state);
            Marshal.FreeCoTaskMem(apiName);
            Marshal.FreeCoTaskMem(text);
            Marshal.FreeCoTaskMem(hidden);
            Marshal.FreeHGlobal(instance);
            Marshal.FreeHGlobal(table);
        }
    }
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

static async Task CheckAppsLargeList()
{
    // 10000 ids both ways through the real pipes: the parent must read while it writes.
    uint[] ids = Enumerable.Range(1, StreamProtocol.MaxApps).Select(number => (uint)number).ToArray();
    var output = new StringWriter();
    var started = Stopwatch.StartNew();
    int exit = await StreamCommands.RunApps(FixtureWorker("apps-ok"), ids, output, TimeSpan.FromSeconds(90));
    var lines = Lines(output);
    Require(exit == 0 && lines.Length == ids.Length + 1, $"10000 ids complete without deadlock ({started.Elapsed})");
    Require(lines[^1] == Complete(ids.Length), "10000 ids reported with the right count");
    for (int index = 0; index < ids.Length; index++)
        if (lines[index] != AppLine(ids[index], ids[index] % 2 == 0, ids[index] % 3 == 0))
            throw new InvalidOperationException($"Failed: order preserved for 10000 ids (line {index})");
}

static async Task CheckHoldReleaseTimeout(string scratch)
{
    string pidFile = Path.Combine(scratch, "hold-nostop.pid");
    var output = new StringWriter();
    var started = Stopwatch.StartNew();
    int exit = await StreamCommands.RunHold(FixtureWorker("hold-nostop", pidFile), 10, new StringReader("stop\n"), output,
        TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(2));
    Require(exit == 4 && Lines(output).SequenceEqual([HoldingTen, Failed("worker_timeout")]) &&
        started.Elapsed < TimeSpan.FromSeconds(15), "worker that hangs after stop is killed and reported");
    await RequireGone(pidFile);
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

static void RequireRejected(Action action, string code, string scenario)
{
    try
    {
        action();
    }
    catch (ProbeException ex)
    {
        Require(ex.Message == code, $"{scenario}: expected {code}, got {ex.Message}");
        return;
    }
    throw new InvalidOperationException($"Failed: {scenario}");
}

static void CheckTrustedFiles(string scratch)
{
    string root = Directory.CreateDirectory(Path.Combine(scratch, "trusted")).FullName;
    string real = Directory.CreateDirectory(Path.Combine(root, "real")).FullName;
    string other = Directory.CreateDirectory(Path.Combine(root, "other")).FullName;
    foreach (var name in new[] { "steam.exe", "tier0_s64.dll", "vstdlib_s64.dll", "steamclient64.dll" })
    {
        File.WriteAllBytes(Path.Combine(real, name), [0x4d, 0x5a]);
        File.WriteAllBytes(Path.Combine(other, name), [0x4d, 0x5a]);
    }
    string client = Path.Combine(real, "steam.exe");

    using (TrustedClient.OpenApprovedFile(client)) { }
    using (TrustedClient.OpenApprovedFile(client.ToUpperInvariant())) { }
    RequireRejected(() => TrustedClient.OpenApprovedFile(Path.Combine(real, "missing.dll")).Dispose(),
        "client_path_untrusted", "missing file rejected");

    string junction = Path.Combine(root, "junction");
    var mklink = new ProcessStartInfo("cmd")
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, StandardOutputEncoding = Encodings.Utf8NoBom };
    foreach (var argument in new[] { "/c", "mklink", "/J", junction, other })
        mklink.ArgumentList.Add(argument);
    using (var made = Process.Start(mklink)!)
    {
        made.StandardOutput.ReadToEnd();
        made.WaitForExit();
        Require(made.ExitCode == 0 && Directory.Exists(junction), "junction fixture created");
    }
    try
    {
        RequireRejected(() => TrustedClient.OpenApprovedFile(Path.Combine(junction, "steam.exe")).Dispose(),
            "client_path_untrusted", "file reached through a junction rejected");
    }
    finally
    {
        Directory.Delete(junction);
    }

    string symlink = Path.Combine(real, "link.dll");
    try
    {
        File.CreateSymbolicLink(symlink, Path.Combine(other, "steam.exe"));
        RequireRejected(() => TrustedClient.OpenApprovedFile(symlink).Dispose(),
            "client_path_untrusted", "file symlink pointing elsewhere rejected");
    }
    catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
    {
        Console.WriteLine($"SKIPPED file-symlink sub-case: cannot create a symlink without privilege ({ex.Message}).");
    }

    SignaturePolicyFixture(client);

    static FileSignature ValveSignature() => new(true, Cert("CN=Valve Corp., O=Valve Corp."));
    static FileSignature OtherSignature() => new(true, Cert("CN=Other Corp., O=Other Corp."));
    static void SignaturePolicyFixture(string image)
    {
        string directory = Path.GetDirectoryName(image)!;
        var locks = new List<IDisposable>();
        try
        {
            var trusted = new FactorySignature(ValveSignature);
            TrustedClient.VerifyInstallation(image, trusted, locks);
            Require(trusted.Calls == 4, "client image and the three libraries are all verified");
            Require(locks.Count > 0, "approved files stay locked");
        }
        finally
        {
            foreach (var held in locks)
                held.Dispose();
        }

        // Only steam.exe exists here: the DLLs must not even be opened once the client image is rejected.
        string lonely = Directory.CreateDirectory(Path.Combine(directory, "..", "lonely")).FullName;
        string lonelyClient = Path.Combine(lonely, "steam.exe");
        File.WriteAllBytes(lonelyClient, [0x4d, 0x5a]);
        foreach (var (factory, code) in new (Func<FileSignature>, string)[] { (OtherSignature, "client_signer_untrusted"),
            (() => new(false, null), "client_build_unverified"), (() => throw new InvalidOperationException("synthetic"), "client_build_unverified") })
        {
            var reader = new FactorySignature(factory);
            locks = [];
            try
            {
                RequireRejected(() => TrustedClient.VerifyInstallation(lonelyClient, reader, locks), code,
                    $"untrusted steam.exe rejected with {code}");
                Require(reader.Calls == 1, "no library is checked after the client image is rejected");
            }
            finally
            {
                foreach (var held in locks)
                    held.Dispose();
            }
        }
        using (File.OpenHandle(lonelyClient, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            // Reaching here means the failed check did not leave steam.exe locked.
        }

        // A trusted client image does not excuse an untrusted library.
        int mixedCalls = 0;
        var mixed = new FactorySignature(() => ++mixedCalls == 1 ? ValveSignature() : OtherSignature());
        locks = [];
        try
        {
            RequireRejected(() => TrustedClient.VerifyInstallation(image, mixed, locks), "client_signer_untrusted",
                "untrusted library rejected after a trusted client image");
        }
        finally
        {
            foreach (var held in locks)
                held.Dispose();
        }
        using (File.OpenHandle(image, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
    }
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
    // The policy takes ownership of the leaf and disposes it, so every call gets a fresh certificate.
    const string ValveSubject = "CN=Valve Corp., O=Valve Corp., L=Bellevue, S=Washington, C=US";
    var leafCheck = Cert(ValveSubject);
    Require(SignaturePolicy.Check(new FakeSignature(new(true, leafCheck)), anyFile) is null, "Valve signer trusted");
    Require(leafCheck.Handle == IntPtr.Zero, "leaf certificate disposed after the check");
    foreach (var wrongSubject in new[] { "CN=Other Corp., O=Other Corp.", "CN=Valve Corp., O=Evil Corp.",
        "CN=Valve Corp. Fake, O=Valve Corp. Fake", "CN=Valve Corp., CN=Valve Corp., O=Valve Corp.",
        "CN=Valve Corp., O=Valve Corp., O=Valve Corp.", "CN=Valve Corp., CN=Evil Corp., O=Valve Corp.",
        "CN=Valve Corp., O=Valve Corp., O=Evil Corp.", "CN=Valve Corp.", "O=Valve Corp." })
    {
        var wrongSigner = Cert(wrongSubject);
        Require(SignaturePolicy.Check(new FakeSignature(new(true, wrongSigner)), anyFile) == "client_signer_untrusted",
            $"valid signature from another signer has its own code: {wrongSubject}");
        Require(wrongSigner.Handle == IntPtr.Zero, "rejected leaf certificate disposed");
    }
    foreach (var broken in new FileSignature[] { new(false, null), new(false, Cert(ValveSubject)), new(true, null) })
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
    {
        var unsigned = real.Read(file);
        Require(!unsigned.Valid && unsigned.Leaf is null, "freshly written file has no signature");
        Require(SignaturePolicy.Check(real, file) == "client_build_unverified", "freshly written file untrusted");
    }
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
        StandardOutputEncoding = Encodings.Utf8NoBom, StandardErrorEncoding = Encodings.Utf8NoBom,
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
        if (mode == "hold-nostop")
            await Task.Delay(Timeout.InfiniteTimeSpan);
        Console.WriteLine(StreamProtocol.ReleasedLine);
        return 0;
    }
    if (mode.StartsWith("unl-"))
        return await UnlockFixture(mode);
    if (mode.StartsWith("slf-"))
    {
        uint selfApp = uint.Parse(Environment.GetEnvironmentVariable("SteamAppId") ?? "0");
        if (mode == "slf-hang")
            await Task.Delay(Timeout.InfiniteTimeSpan);
        if (mode == "slf-failed")
        {
            Console.WriteLine(StreamProtocol.FailedLine("stats_unavailable"));
            return 4;
        }
        if (mode == "slf-env")
        {
            Console.WriteLine(StreamProtocol.FailedLine($"app_{selfApp}_gate_{(Environment.GetEnvironmentVariable(StreamProtocol.WriteGate) is null ? "none" : "set")}"));
            return 4;
        }
        string complete = mode == "slf-badcount" ? StreamProtocol.SelfCheckCompleteLine(selfApp, 2, 5) : StreamProtocol.SelfCheckCompleteLine(selfApp, 2, 2);
        Console.WriteLine(mode == "slf-noise" ? "untrusted stdout" : complete);
        if (mode == "slf-noise" || mode == "slf-extra")
            Console.WriteLine(complete);
        return mode == "slf-badexit" ? 3 : 0;
    }
    if (mode.StartsWith("ach-"))
    {
        uint app = uint.Parse(Environment.GetEnvironmentVariable("SteamAppId") ?? "0");
        if (mode == "ach-hang")
            await Task.Delay(Timeout.InfiniteTimeSpan);
        if (mode == "ach-failed")
        {
            Console.WriteLine(StreamProtocol.FailedLine("stats_unavailable"));
            return 4;
        }
        AchievementInfo[] items = mode switch
        {
            "ach-empty" => [],
            "ach-env" => [new($"APP_{app}", "Env", "Env", false, false, 0)],
            _ => [new("ACH_ONE", "One", "First", false, true, 1700000000), new("ACH_TWO", "Two", "Second", true, false, 0)],
        };
        if (mode == "ach-noise")
            Console.WriteLine("untrusted stdout");
        foreach (var item in mode == "ach-truncated" ? items.Take(1) : items)
            Console.WriteLine(StreamProtocol.AchievementLine(item));
        if (mode != "ach-truncated")
            Console.WriteLine(StreamProtocol.AchievementsCompleteLine(mode == "ach-wrongapp" ? app + 1 : app,
                items.Length + (mode == "ach-badcount" ? 1 : 0)));
        if (mode == "ach-extra")
            Console.WriteLine(StreamProtocol.AchievementLine(items[0] with { ApiName = "ACH_LATE" }));
        return mode == "ach-badexit" ? 3 : 0;
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

// Stands in for the unlock worker: reads the names the parent sends, then misbehaves (or not) as the mode says.
static async Task<int> UnlockFixture(string mode)
{
    uint app = uint.Parse(Environment.GetEnvironmentVariable("SteamAppId") ?? "0");
    var names = new List<string>();
    if (StreamProtocol.ReadNames(Console.OpenStandardInput(), names) is not null)
        return 2;
    string[] results = names.Select((_, index) => mode == "unl-none" ? "already" : index % 2 == 0 ? "unlocked" : "already").ToArray();
    int unlocked = results.Count(result => result == "unlocked");
    switch (mode)
    {
        case "unl-hang":
            await Task.Delay(Timeout.InfiniteTimeSpan);
            break;
        case "unl-hang-marker":
            Console.WriteLine(StreamProtocol.WritingLine);
            await Task.Delay(Timeout.InfiniteTimeSpan);
            break;
        case "unl-crash-early":
            return 5;
        case "unl-crash":
            Console.WriteLine(StreamProtocol.WritingLine);
            return 5;
        case "unl-failed":
            Console.WriteLine(StreamProtocol.FailedLine("stats_unavailable"));
            return 4;
        case "unl-failed-wrote":
            Console.WriteLine(StreamProtocol.WritingLine);
            Console.WriteLine(StreamProtocol.UnlockFailedLine("active_account_changed", true));
            return 4;
        case "unl-env":
            Console.WriteLine(StreamProtocol.FailedLine($"app_{app}"));
            return 4;
        case "unl-garbage-marker":
            Console.WriteLine(StreamProtocol.WritingLine);
            Console.WriteLine("garbage");
            return 0;
        case "unl-throw": // an exception from SetAchievement or StoreStats after the marker: the process dies without a failed line
            Console.WriteLine(StreamProtocol.WritingLine);
            return unchecked((int)0xE0434352); // the exit code of an unhandled .NET exception, without a crash dump
        case "unl-garbage-late-marker": // the parent's reader has stopped long before the marker arrives
            Console.WriteLine("garbage");
            await Task.Delay(1500);
            Console.WriteLine(StreamProtocol.WritingLine);
            return 0;
        case "unl-failed-exit0":
            Console.WriteLine(StreamProtocol.FailedLine("stats_unavailable"));
            return 0;
        case "unl-failed-hang":
            Console.WriteLine(StreamProtocol.FailedLine("stats_unavailable"));
            await Task.Delay(Timeout.InfiniteTimeSpan);
            break;
    }
    if (mode == "unl-noise")
        Console.WriteLine("untrusted stdout");
    if (mode != "unl-none")
        Console.WriteLine(StreamProtocol.WritingLine);
    for (int index = 0; index < names.Count; index++)
        Console.WriteLine(StreamProtocol.UnlockLine(mode == "unl-wrongname" && index == 0 ? names[0] + "X" : names[index], results[index]));
    Console.WriteLine(mode == "unl-badstored"
        ? StreamProtocol.UnlockCompleteLine(app, names.Count, unlocked, "not_needed")
        : StreamProtocol.UnlockCompleteLine(app, names.Count, unlocked, mode == "unl-none" ? "not_needed" : "yes"));
    if (mode == "unl-extra")
        Console.WriteLine("stray");
    return mode == "unl-badexit" ? 3 : 0;
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
    string? stdin = null, string? writeGate = null)
{
    var start = new ProcessStartInfo("dotnet")
    {
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        RedirectStandardInput = true,
        CreateNoWindow = true,
        // Never the console code page: the checks must pass the same on a Russian console as under chcp 65001.
        StandardInputEncoding = Encodings.Utf8NoBom,
        StandardOutputEncoding = Encodings.Utf8NoBom,
        StandardErrorEncoding = Encodings.Utf8NoBom,
    };
    if (appId is not null)
        start.Environment["SteamAppId"] = appId;
    start.Environment.Remove(StreamProtocol.WriteGate);
    if (writeGate is not null)
        start.Environment[StreamProtocol.WriteGate] = writeGate;
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

internal static class Encodings
{
    internal static readonly UTF8Encoding Utf8NoBom = new(false);
}

[UnmanagedFunctionPointer(CallingConvention.Cdecl)]
internal delegate nint AbiUser();

/// <summary>Fills every vtable slot that a test does not expect to be called; any call is recorded as a failure.</summary>
[UnmanagedFunctionPointer(CallingConvention.Cdecl)]
internal delegate bool TrapMethod(nint self);

internal sealed class FakeSignature(FileSignature? result) : ISignatureReader
{
    public FileSignature Read(SafeFileHandle file) => result ?? throw new InvalidOperationException("Synthetic verifier failure.");
}

internal sealed class FactorySignature(Func<FileSignature> next) : ISignatureReader
{
    internal int Calls { get; private set; }

    public FileSignature Read(SafeFileHandle file)
    {
        Calls++;
        return next();
    }
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

/// <summary>Raw native answers for one achievement; strings are what the client would return (null = null pointer).</summary>
internal sealed record FakeAchievement(string? ApiName, string? Name = "Name", string? Description = "Description",
    string? Hidden = "0", bool Achieved = false, uint UnlockTime = 0);

internal sealed class FakeNative : IClientIdentityNative, IClientAppsNative, IClientStatsNative, IClientAchievementWriteNative
{
    internal HashSet<string> RejectSet { get; init; } = [];
    internal bool StoreReturns { get; init; } = true;
    internal StoreOutcome Outcome { get; init; } = StoreOutcome.Success;
    internal bool SetTakesEffect { get; init; } = true;
    internal int? AnchorLiesAt { get; init; }
    internal bool AnchorUnknown { get; init; }
    internal bool PrepareFails { get; init; }
    internal int? UnstableAt { get; init; }
    internal Action<string>? AfterSet { get; init; }
    internal List<string> SetNames { get; } = [];
    internal TimeSpan? StoreWaitedFor { get; private set; }
    private readonly HashSet<string> _set = [];
    private bool _anchored;

    public bool GetAchievementFlag(string apiName, out bool achieved)
    {
        Record("get_ach", true);
        _anchored = true;
        int index = Achievements.ToList().FindIndex(item => item.ApiName == apiName);
        achieved = index >= 0 && Achievements[index].Achieved ^ (AnchorLiesAt == index);
        return !AnchorUnknown && index >= 0;
    }

    public void PrepareWrite()
    {
        Record("prepare", true);
        if (PrepareFails)
            throw new ProbeException("client_export_unsupported");
    }

    public bool SetAchievement(string apiName)
    {
        Record("set", true);
        SetNames.Add(apiName);
        if (RejectSet.Contains(apiName))
            return false;
        if (SetTakesEffect)
            _set.Add(apiName);
        AfterSet?.Invoke(apiName);
        return true;
    }

    public bool StoreStats() => Record("store", StoreReturns);

    public StoreOutcome WaitForStore(uint appId, TimeSpan timeout, CancellationToken stop)
    {
        Record("wait_store", true);
        StoreWaitedFor = timeout;
        return Outcome;
    }

    internal IReadOnlyList<FakeAchievement> Achievements { get; init; } = [];
    internal uint? NumOverride { get; init; }
    internal bool StatsInterface { get; init; } = true;
    internal bool StatsAvailable { get; init; } = true;
    internal TimeSpan? WaitedFor { get; private set; }
    public bool HasStatsInterface(int user, int pipe) => Record("stats", StatsInterface && user == User && pipe == Pipe);

    public bool WaitForStats(uint appId, ulong steamId, TimeSpan timeout, CancellationToken stop)
    {
        Record("wait_stats", true);
        WaitedFor = timeout;
        if (!StatsAvailable)
            stop.WaitHandle.WaitOne(timeout);
        return StatsAvailable;
    }

    public uint GetNumAchievements() => Record("num", NumOverride ?? (uint)Achievements.Count);
    private FakeAchievement? _current;

    public string? GetAchievementName(uint index)
    {
        _current = index < Achievements.Count ? Achievements[(int)index] : null;
        return Record("ach_name", _current?.ApiName);
    }

    private FakeAchievement Current(string apiName) =>
        _current is { } item && item.ApiName == apiName ? item : throw new ArgumentException("Unexpected achievement " + apiName);

    public string? GetDisplayAttribute(string apiName, string key)
    {
        Record("attr", true);
        var item = Current(apiName);
        return key switch { "name" => item.Name, "desc" => item.Description, "hidden" => item.Hidden, _ => throw new ArgumentException(key) };
    }

    public bool GetAchievementState(string apiName, out bool achieved, out uint unlockTime)
    {
        Record("state", true);
        // After the anchor check names are looked up directly: the stability re-read and the re-read after StoreStats do not walk the list.
        var item = SetNames.Contains(apiName) || _anchored ? Achievements.First(candidate => candidate.ApiName == apiName) : Current(apiName);
        achieved = item.Achieved || _set.Contains(apiName);
        if (_anchored && SetNames.Count == 0 && UnstableAt is { } at && Achievements.ToList().IndexOf(item) == at)
            achieved = !achieved; // the client changed its answer between the two reads
        unlockTime = achieved && item.UnlockTime == 0 ? 1700000001u : item.UnlockTime;
        return true;
    }

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
