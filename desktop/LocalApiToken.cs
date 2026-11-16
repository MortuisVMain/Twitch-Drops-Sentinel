using System.Security.Cryptography;
using System.Text.Json;

namespace TwitchDropsSentinel;

/// <summary>
/// The per-launch secret of the local service. The host makes it, hands it to the service through its environment only
/// and to the page through a script that runs on the app's own origin only. It is never written to disk, a log or a command line.
/// </summary>
public static class LocalApiToken
{
    public const string EnvName = "SENTINEL_API_TOKEN";
    public const string HeaderName = "X-Sentinel-Token";

    /// <summary>One secret for the whole run of the host.</summary>
    public static readonly string Current = Create();

    /// <summary>32 random bytes as URL-safe base64 without padding: 43 characters.</summary>
    public static string Create() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>Defines window.__SENTINEL_TOKEN on the app's origin only. The value is JSON-encoded, so it stays inside the string.</summary>
    public static string PageScript(string token) =>
        "if (location.origin === 'https://app.sentinel') { Object.defineProperty(window, '__SENTINEL_TOKEN', { value: "
        + JsonSerializer.Serialize(token)
        + ", writable: false, configurable: false, enumerable: false }); }";
}
