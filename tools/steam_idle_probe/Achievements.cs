using System.Text;

namespace SteamIdleProbe;

internal sealed record AchievementInfo(string ApiName, string Name, string Description, bool Hidden, bool Achieved, uint UnlockTime);

internal sealed record AchievementsResult(IdentityResult Status, IReadOnlyList<AchievementInfo> Items);

/// <summary>READ-ONLY view of ISteamUserStats. Nothing that changes stats or achievements may ever be added here.</summary>
internal interface IClientStatsNative
{
    bool HasStatsInterface(int user, int pipe);
    bool WaitForStats(uint appId, ulong steamId, TimeSpan timeout, CancellationToken stop);
    uint GetNumAchievements();
    string? GetAchievementName(uint index);
    string? GetDisplayAttribute(string apiName, string key);
    bool GetAchievementState(string apiName, out bool achieved, out uint unlockTime);
}

/// <summary>Reads every achievement of one app, distrusting the native layer: a wrong vtable slot must never go unnoticed.</summary>
internal static class AchievementReader
{
    internal const int MaxAchievements = 10000;
    internal const int MaxName = 512;
    internal const int MaxDescription = 2048;
    private const string Implausible = "stats_implausible";

    internal const int MaxApiNameBytes = 256;
    private static readonly UTF8Encoding Strict = new(false, true);

    /// <summary>
    /// 1 to 256 bytes of valid UTF-8 with no control character (U+0000-U+001F, U+007F). U+FFFD is refused too: it is what
    /// undecodable native bytes turn into, so it marks a name that was not valid UTF-8; a lone surrogate cannot be encoded.
    /// </summary>
    internal static bool IsApiName(string text)
    {
        if (text.Length is 0 or > MaxApiNameBytes || text.Any(c => c < ' ' || c is '\u007f' or '�'))
            return false;
        try
        {
            return Strict.GetByteCount(text) <= MaxApiNameBytes;
        }
        catch (EncoderFallbackException)
        {
            return false;
        }
    }

    /// <summary>Returns null on success (items filled) or an error code; the caller discards the items on any error.</summary>
    internal static string? Collect(IClientIdentityNative native, int user, int pipe, uint appId, ulong steamId,
        TimeSpan statsTimeout, CancellationToken stop, List<AchievementInfo> items)
    {
        if (native is not IClientAppsNative apps || !apps.HasAppsInterface(user, pipe))
            return "apps_interface_unsupported";
        if (!apps.IsSubscribed(appId))
            return "app_not_subscribed";
        if (native is not IClientStatsNative stats || !stats.HasStatsInterface(user, pipe))
            return "stats_interface_unsupported";
        if (!stats.WaitForStats(appId, steamId, statsTimeout, stop))
            return "stats_unavailable";

        // Self-check before trusting the slots: a plausible count, then every name must pass IsApiName.
        uint count = stats.GetNumAchievements();
        if (count > MaxAchievements)
            return Implausible;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (uint index = 0; index < count; index++)
        {
            if (stats.GetAchievementName(index) is not { } apiName || !IsApiName(apiName))
                return Implausible;
            if (stats.GetDisplayAttribute(apiName, "name") is not { } name)
                return Implausible;
            if (stats.GetDisplayAttribute(apiName, "desc") is not { } description)
                return Implausible;
            string? hidden = stats.GetDisplayAttribute(apiName, "hidden");
            if (hidden is not ("0" or "1"))
                return Implausible;
            if (!stats.GetAchievementState(apiName, out bool achieved, out uint unlockTime) || !seen.Add(apiName))
                return Implausible;
            items.Add(new(apiName, Truncate(name, MaxName), Truncate(description, MaxDescription), hidden == "1",
                achieved, achieved ? unlockTime : 0));
        }
        return null;
    }

    /// <summary>Caps the length in UTF-16 units without splitting a surrogate pair.</summary>
    internal static string Truncate(string text, int max)
    {
        if (text.Length <= max)
            return text;
        return char.IsHighSurrogate(text[max - 1]) ? text[..(max - 1)] : text[..max];
    }
}
