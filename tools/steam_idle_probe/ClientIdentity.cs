using System.Globalization;
using System.Runtime.InteropServices;
using System.Security;

namespace SteamIdleProbe;

internal sealed record IdentityResult(string Connection, string Identity, string? Error = null, bool? Subscribed = null, bool? Installed = null);

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

    internal static IdentityResult InspectWindows(ulong expected, uint? appId = null)
    {
        if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
            return Unavailable("unsupported_platform");
        if (new[] { "SteamAppId", "SteamGameId", "SteamOverlayGameId" }
            .Any(name => Environment.GetEnvironmentVariable(name) is not null))
            return Unavailable("inherited_game_context");
        try
        {
            if (File.Exists(Path.Combine(Environment.CurrentDirectory, "steam_appid.txt")) ||
                File.Exists(Path.Combine(AppContext.BaseDirectory, "steam_appid.txt")))
                return Unavailable("inherited_game_context");
            using var installation = TrustedClient.Open(expected);
            if (!installation.MatchesActiveUser(expected))
                return Unavailable("active_account_changed");
            using var native = WindowsSteamClient.Load(installation);
            if (!installation.MatchesActiveUser(expected))
                return Unavailable("active_account_changed");
            return Inspect(native, expected, () => installation.MatchesActiveUser(expected), appId);
        }
        catch (ProbeException ex)
        {
            return ex.Code == "client_library_release_failed"
                ? new("unknown", "unverified", ex.Code)
                : Unavailable(ex.Code);
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
                ? ReadIdentity(native, expected, user, pipe, stillActive, appId)
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

    private static IdentityResult ReadIdentity(IClientIdentityNative native, ulong expected,
        int user, int pipe, Func<bool> stillActive, uint? appId = null)
    {
        if (!native.HasUserInterface(user, pipe))
            return new("connected", "unverified", "user_interface_unsupported");
        if (!native.IsLoggedOn())
            return new("connected", "unverified", "client_offline");
        if (native.ReadSteamId() != expected)
            return new("connected", "unverified", "account_mismatch");
        bool? subscribed = null, installed = null;
        if (appId is uint candidate)
        {
            if (native is not IClientAppsNative apps || !apps.HasAppsInterface(user, pipe))
                return new("connected", "unverified", "apps_interface_unsupported");
            subscribed = apps.IsSubscribed(candidate);
            installed = apps.IsInstalled(candidate);
        }
        if (!native.IsLoggedOn() || native.ReadSteamId() != expected || !stillActive())
            return new("connected", "unverified", "active_account_changed");
        return new("connected", "expected_account_confirmed", null, subscribed, installed);
    }
}

internal sealed class ProbeException(string code) : Exception(code)
{
    internal string Code => Message;
}
