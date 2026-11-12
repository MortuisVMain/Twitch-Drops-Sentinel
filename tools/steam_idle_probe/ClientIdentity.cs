using System.Globalization;
using System.Runtime.InteropServices;
using System.Security;

namespace SteamIdleProbe;

internal sealed record IdentityResult(string Connection, string Identity, string? Error = null, bool? Subscribed = null, bool? Installed = null);

internal sealed record AppFlags(uint AppId, bool Subscribed, bool Installed);

internal sealed record AppsResult(IdentityResult Status, IReadOnlyList<AppFlags> Apps);

internal interface IClientIdentityNative
{
    int CreatePipe();
    int ConnectUser(int pipe);
    bool HasUserInterface(int user, int pipe);
    bool IsLoggedOn();
    ulong ReadSteamId();
    void ReleaseUser(int pipe, int user);
    bool ReleasePipe(int pipe);
}

internal static class ClientIdentity
{
    private const ulong PublicIndividualDesktop = 0x0110000100000000UL;

    internal static bool TryParse(string input, out ulong steamId) =>
        ulong.TryParse(input, NumberStyles.None, CultureInfo.InvariantCulture, out steamId) &&
        (steamId & 0xffffffff00000000UL) == PublicIndividualDesktop && (uint)steamId != 0;

    /// <summary>True when a game context could leak into the client connection; only the hold worker may set its own AppID.</summary>
    internal static bool InheritedGameContext(uint? allowedAppId = null, Func<string, string?>? environment = null)
    {
        environment ??= Environment.GetEnvironmentVariable;
        if (environment("SteamAppId") != allowedAppId?.ToString(CultureInfo.InvariantCulture) ||
            environment("SteamGameId") is not null || environment("SteamOverlayGameId") is not null)
            return true;
        return File.Exists(Path.Combine(Environment.CurrentDirectory, "steam_appid.txt")) ||
            File.Exists(Path.Combine(AppContext.BaseDirectory, "steam_appid.txt"));
    }

    internal static IdentityResult InspectWindows(ulong expected, uint? appId = null) =>
        WithWindowsClient(expected, null, (native, active) => Inspect(native, expected, active, appId));

    internal static AppsResult InspectWindowsApps(ulong expected, IReadOnlyList<uint> appIds)
    {
        AppsResult? captured = null;
        var status = WithWindowsClient(expected, null,
            (native, active) => (captured = InspectApps(native, expected, active, appIds)).Status);
        return new(status, status.Error is null && captured is not null ? captured.Apps : []);
    }

    /// <summary>How long a freshly registered process waits for the user's stats of its app before giving up.</summary>
    internal static readonly TimeSpan StatsTimeout = TimeSpan.FromSeconds(10);

    internal static AchievementsResult InspectWindowsAchievements(ulong expected, uint appId, CancellationToken stop)
    {
        AchievementsResult? captured = null;
        var status = WithWindowsClient(expected, appId,
            (native, active) => (captured = ReadAchievements(native, expected, active, appId, StatsTimeout, stop)).Status);
        return new(status, status.Error is null && captured is not null ? captured.Items : []);
    }

    /// <summary>READ-ONLY: everything `unlock` does up to and including the anchor check, binding only read slots and GetAchievement.</summary>
    internal static SelfCheckResult InspectWindowsSelfCheck(ulong expected, uint appId, CancellationToken stop)
    {
        SelfCheckResult? captured = null;
        var status = WithWindowsClient(expected, appId,
            (native, active) => (captured = SelfCheckAchievements(native, expected, active, appId, StatsTimeout, stop)).Status);
        return status.Error is null && captured is not null ? new(status, captured.Count, captured.AnchorChecked) : new(status, 0, 0);
    }

    /// <summary>WRITES to the account. <paramref name="markWriting"/> runs once, right before the first SetAchievement.</summary>
    internal static UnlockResult InspectWindowsUnlock(ulong expected, uint appId, IReadOnlyList<string> names, Action markWriting,
        CancellationToken stop)
    {
        UnlockResult? captured = null;
        var status = WithWindowsClient(expected, appId,
            (native, active) => (captured = UnlockAchievements(native, expected, active, appId, names, StatsTimeout,
                AchievementWriter.StoreTimeout, markWriting, stop)).Status);
        return new(status, status.Error is null ? captured?.Report : null);
    }

    internal static IdentityResult HoldWindows(ulong expected, uint appId, Func<IdentityResult> holding) =>
        WithWindowsClient(expected, appId, (native, active) => Hold(native, expected, active, appId, holding));

    internal static IdentityResult WithWindowsClient(ulong expected, uint? holdAppId,
        Func<IClientIdentityNative, Func<bool>, IdentityResult> body)
    {
        if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
            return Unavailable("unsupported_platform");
        if (InheritedGameContext(holdAppId))
            return Unavailable("inherited_game_context");
        try
        {
            using var installation = TrustedClient.Open(expected);
            if (!installation.MatchesActiveUser(expected))
                return Unavailable("active_account_changed");
            var native = WindowsSteamClient.Load(installation);
            IdentityResult result;
            try
            {
                result = installation.MatchesActiveUser(expected)
                    ? body(native, () => installation.MatchesActiveUser(expected))
                    : Unavailable("active_account_changed");
            }
            finally
            {
                native.Dispose();
            }
            return native.ReleaseFailed ? new("unknown", "unverified", "client_library_release_failed") : result;
        }
        catch (ProbeException ex)
        {
            return Unavailable(ex.Code);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or
            SecurityException or System.ComponentModel.Win32Exception or InvalidOperationException or ArgumentException)
        {
            return Unavailable("client_preflight_failed");
        }
    }

    private static IdentityResult Unavailable(string error) => new("not_connected", "unverified", error);

    internal static IdentityResult Inspect(IClientIdentityNative native, ulong expected, Func<bool> stillActive, uint? appId = null)
    {
        bool? subscribed = null, installed = null;
        return Session(native, expected, stillActive,
            (user, pipe) =>
            {
                if (appId is not uint candidate)
                    return null;
                if (native is not IClientAppsNative apps || !apps.HasAppsInterface(user, pipe))
                    return "apps_interface_unsupported";
                subscribed = apps.IsSubscribed(candidate);
                installed = apps.IsInstalled(candidate);
                return null;
            },
            () => new("connected", "expected_account_confirmed", null, subscribed, installed));
    }

    /// <summary>One connection, one identity check, then flags for every AppID; flags are discarded on any failure.</summary>
    internal static AppsResult InspectApps(IClientIdentityNative native, ulong expected, Func<bool> stillActive,
        IReadOnlyList<uint> appIds)
    {
        var flags = new List<AppFlags>(appIds.Count);
        var status = Session(native, expected, stillActive,
            (user, pipe) =>
            {
                if (native is not IClientAppsNative apps || !apps.HasAppsInterface(user, pipe))
                    return "apps_interface_unsupported";
                foreach (uint id in appIds)
                    flags.Add(new(id, apps.IsSubscribed(id), apps.IsInstalled(id)));
                return null;
            },
            () => new("connected", "expected_account_confirmed"));
        return new(status, status.Error is null ? flags : []);
    }

    /// <summary>READ-ONLY: one connection, identity and subscription check, then every achievement; items are discarded on any failure.</summary>
    internal static AchievementsResult ReadAchievements(IClientIdentityNative native, ulong expected, Func<bool> stillActive,
        uint appId, TimeSpan statsTimeout, CancellationToken stop)
    {
        var items = new List<AchievementInfo>();
        var status = Session(native, expected, stillActive,
            (user, pipe) => AchievementReader.Collect(native, user, pipe, appId, expected, statsTimeout, stop, items),
            () => new("connected", "expected_account_confirmed"));
        return new(status, status.Error is null ? items : []);
    }

    /// <summary>
    /// Reads like ReadAchievements, proves the vtable with the anchor check, then writes. Items are discarded; the report is
    /// kept only when the whole session (including the final identity check and the release) succeeded.
    /// </summary>
    internal static UnlockResult UnlockAchievements(IClientIdentityNative native, ulong expected, Func<bool> stillActive, uint appId,
        IReadOnlyList<string> names, TimeSpan statsTimeout, TimeSpan storeTimeout, Action markWriting, CancellationToken stop)
    {
        var items = new List<AchievementInfo>();
        UnlockReport? report = null;
        var status = Session(native, expected, stillActive,
            (user, pipe) =>
            {
                if (AchievementReader.Collect(native, user, pipe, appId, expected, statsTimeout, stop, items) is { } error)
                    return error;
                if (native is not IClientStatsNative stats || native is not IClientAchievementWriteNative write)
                    return "client_method_unsupported";
                if (AchievementWriter.AnchorCheck(write, items, out _) is { } anchor)
                    return anchor;
                if (stop.IsCancellationRequested)
                    return "worker_cancelled";
                report = AchievementWriter.Unlock(stats, write, appId, items, names, markWriting, storeTimeout, stop);
                return null;
            },
            () => new("connected", "expected_account_confirmed"));
        return new(status, status.Error is null ? report : null);
    }

    /// <summary>READ-ONLY: one connection, the full read and the anchor check, no write slot bound.</summary>
    internal static SelfCheckResult SelfCheckAchievements(IClientIdentityNative native, ulong expected, Func<bool> stillActive,
        uint appId, TimeSpan statsTimeout, CancellationToken stop)
    {
        var items = new List<AchievementInfo>();
        int anchored = 0;
        var status = Session(native, expected, stillActive,
            (user, pipe) =>
            {
                if (AchievementReader.Collect(native, user, pipe, appId, expected, statsTimeout, stop, items) is { } error)
                    return error;
                return native is IClientAchievementWriteNative write ? AchievementWriter.AnchorCheck(write, items, out anchored)
                    : "client_method_unsupported";
            },
            () => new("connected", "expected_account_confirmed"));
        return status.Error is null ? new(status, items.Count, anchored) : new(status, 0, 0);
    }

    /// <summary>Confirms identity and subscription, then runs <paramref name="holding"/> with pipe and user still open.</summary>
    internal static IdentityResult Hold(IClientIdentityNative native, ulong expected, Func<bool> stillActive,
        uint appId, Func<IdentityResult> holding) =>
        Session(native, expected, stillActive,
            (user, pipe) =>
            {
                if (native is not IClientAppsNative apps || !apps.HasAppsInterface(user, pipe))
                    return "apps_interface_unsupported";
                return apps.IsSubscribed(appId) ? null : "app_not_subscribed";
            },
            holding);

    private static IdentityResult Session(IClientIdentityNative native, ulong expected, Func<bool> stillActive,
        Func<int, int, string?> query, Func<IdentityResult> confirmed)
    {
        if (!stillActive())
            return Unavailable("active_account_changed");
        int pipe = native.CreatePipe();
        if (pipe <= 0)
            return Unavailable("pipe_unavailable");

        int user = 0;
        bool released = false;
        IdentityResult result;
        try
        {
            user = native.ConnectUser(pipe);
            result = user > 0
                ? ReadIdentity(native, expected, user, pipe, stillActive, query, confirmed)
                : Unavailable("global_user_unavailable");
        }
        finally
        {
            try
            {
                if (user > 0)
                    native.ReleaseUser(pipe, user);
            }
            finally
            {
                released = native.ReleasePipe(pipe);
            }
        }
        return released ? result : new("unknown", "unverified", "pipe_release_failed");
    }

    private static IdentityResult ReadIdentity(IClientIdentityNative native, ulong expected, int user, int pipe,
        Func<bool> stillActive, Func<int, int, string?> query, Func<IdentityResult> confirmed)
    {
        if (!native.HasUserInterface(user, pipe))
            return new("connected", "unverified", "user_interface_unsupported");
        if (!native.IsLoggedOn())
            return new("connected", "unverified", "client_offline");
        if (native.ReadSteamId() != expected)
            return new("connected", "unverified", "account_mismatch");
        if (query(user, pipe) is string queryError)
            return new("connected", "unverified", queryError);
        if (!native.IsLoggedOn() || native.ReadSteamId() != expected || !stillActive())
            return new("connected", "unverified", "active_account_changed");
        return confirmed();
    }
}

internal sealed class ProbeException(string code) : Exception(code)
{
    internal string Code => Message;
}
