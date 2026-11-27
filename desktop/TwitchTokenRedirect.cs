using System.Text.RegularExpressions;

namespace TwitchDropsSentinel
{
    public enum TwitchRedirectKind { NotRedirect, Token, Error }

    /// <summary>What a navigation of the sign-in window means. Token is set only for Kind.Token, Error only for Kind.Error.</summary>
    public readonly record struct TwitchRedirect(TwitchRedirectKind Kind, string? Token = null, string? Error = null);

    /// <summary>
    /// The sign-in window opens twitch.tv's login for the Android app client (implicit grant) and waits for the redirect
    /// https://www.twitch.tv/#access_token=... Same URL and redirect as upstream DevilXD/TwitchDropsMiner c3be032.
    /// Pure: no WebView2, so tools/twitch_token_redirect_check can run it.
    /// </summary>
    public static class TwitchTokenRedirect
    {
        // The ANDROID_APP client id of core/constants.py ClientType. A token only works with the client id it was issued for.
        private const string ClientId = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";

        public const string LoginUrl =
            "https://www.twitch.tv/login?client_id=" + ClientId +
            "&redirect_params=client_id%3D" + ClientId +
            "%26redirect_uri%3Dhttps%253A%252F%252Fwww.twitch.tv%252F%26response_type%3Dtoken";

        private static readonly Regex TokenShape = new("^[A-Za-z0-9]{20,100}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
        private static readonly Regex ErrorShape = new("^[A-Za-z0-9_]{1,64}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

        public static TwitchRedirect Parse(string? url)
        {
            var none = new TwitchRedirect(TwitchRedirectKind.NotRedirect);
            if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri)) return none;
            if (uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort || uri.UserInfo.Length > 0) return none;
            if (!uri.Host.Equals("www.twitch.tv", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath != "/") return none;

            var fragment = Pairs(uri.Fragment.TrimStart('#'));
            var query = Pairs(uri.Query.TrimStart('?'));
            // an error beats a token next to it; the value is shown to nobody unchecked
            if (fragment.TryGetValue("error", out var error) || query.TryGetValue("error", out error))
                return new TwitchRedirect(TwitchRedirectKind.Error, Error: ErrorShape.IsMatch(error) ? error : "unknown");
            if (!fragment.TryGetValue("access_token", out var token)) return none;
            return TokenShape.IsMatch(token)
                ? new TwitchRedirect(TwitchRedirectKind.Token, Token: token)
                : new TwitchRedirect(TwitchRedirectKind.Error, Error: "malformed_token");
        }

        /// <summary>Key=value pairs of a fragment or query; the first occurrence of a key wins.</summary>
        private static Dictionary<string, string> Pairs(string text)
        {
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var part in text.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                int eq = part.IndexOf('=');
                string key = Decode(eq < 0 ? part : part[..eq]);
                string value = eq < 0 ? "" : Decode(part[(eq + 1)..]);
                result.TryAdd(key, value);
            }
            return result;
        }

        private static string Decode(string text)
        {
            try { return Uri.UnescapeDataString(text.Replace('+', ' ')); }
            catch (UriFormatException) { return ""; }
        }
    }
}
