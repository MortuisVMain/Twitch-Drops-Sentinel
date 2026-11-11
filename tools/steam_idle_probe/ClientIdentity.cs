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
