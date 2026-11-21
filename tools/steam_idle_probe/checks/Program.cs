using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using SteamIdleProbe;

if (args is ["parent-watch-fixture", var watchedId, var watchedStart])
{
    using var watched = IdentityWorker.WatchParent(int.Parse(watchedId), long.Parse(watchedStart));
    if (watched is null) return 1;
    Console.WriteLine("ready");
    await Task.Delay(Timeout.InfiniteTimeSpan);
}

if (args is ["worker-fixture", var mode])
{
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
        ["identity", "76561197960265728"], ["identity", "123"], ["--identity-worker", "123"] })
    {
        var (exitCode, response) = await RunProbe(arguments);
        using (response)
        {
            Require(exitCode == 2, "bad command exit");
            Require(response.RootElement.GetProperty("protocolVersion").GetInt32() == 1, "protocol version");
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
    using (var contents = new MemoryStream([0x61]))
        Require(TrustedClient.HasExpectedHash(contents, "CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB"),
            "hash matches pinned contents");
    using (var contents = new MemoryStream([0x62]))
        Require(!TrustedClient.HasExpectedHash(contents, "CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB"),
            "changed bytes rejected");

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
}
finally
{
    // This is the uniquely named directory created above; files are the two known fixtures.
    File.Delete(Path.Combine(fixture.FullName, "steam.exe"));
    File.Delete(Path.Combine(fixture.FullName, "steamclient.dll"));
    fixture.Delete();
}
Console.WriteLine("Steam probe offline checks passed.");
return 0;

static void CheckIdentity(FakeNative native, string identity, string? error, string calls, Func<bool>? stillActive = null)
{
    var result = ClientIdentity.Inspect(native, 0x011000010000002aUL, stillActive ?? (() => true));
    Require(result.Identity == identity && result.Error == error, error ?? "successful identity match");
    Require(string.Join(',', native.Calls) == calls, $"native calls and cleanup for {error ?? "success"}");
}

static ProcessStartInfo FixtureWorker(string mode)
{
    var start = new ProcessStartInfo("dotnet");
    start.ArgumentList.Add(typeof(FakeNative).Assembly.Location);
    start.ArgumentList.Add("worker-fixture");
    start.ArgumentList.Add(mode);
    return start;
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

static async Task<(int ExitCode, JsonDocument Response)> RunProbe(string[] arguments, string? appId = null)
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
    // Keep stdin open until exit to detect any accidental dependency on input or EOF.
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

internal sealed class FakeNative : IClientIdentityNative, IClientAppsNative
{
    internal bool Subscribed { get; init; }
    internal bool Installed { get; init; }
    public bool HasAppsInterface(int user, int pipe) => Record("apps", user == User && pipe == Pipe);
    public bool IsSubscribed(uint appId) => Record("subscribed", appId == 10 && Subscribed);
    public bool IsInstalled(uint appId) => Record("installed", appId == 10 && Installed);
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
