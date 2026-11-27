// Checks the pure parser behind the twitch.tv sign-in window: which redirect carries a token, which an error, and which is neither.
using TwitchDropsSentinel;

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); }
    else Console.WriteLine("ok:   " + what);
}

const string Android = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
const string Token = "abcdefghij0123456789abcdefghij"; // 30 characters like a real token

// the window opens the same URL upstream (DevilXD/TwitchDropsMiner c3be032) does
Check(TwitchTokenRedirect.LoginUrl ==
      $"https://www.twitch.tv/login?client_id={Android}&redirect_params=client_id%3D{Android}%26redirect_uri%3Dhttps%253A%252F%252Fwww.twitch.tv%252F%26response_type%3Dtoken",
      "the login URL is the android client's implicit grant");

// a token
var ok = TwitchTokenRedirect.Parse($"https://www.twitch.tv/#access_token={Token}&scope=&token_type=bearer");
Check(ok.Kind == TwitchRedirectKind.Token && ok.Token == Token && ok.Error == null, "a token with extra parameters is read");
ok = TwitchTokenRedirect.Parse($"https://www.twitch.tv/#access_token={Token}");
Check(ok.Kind == TwitchRedirectKind.Token && ok.Token == Token, "a token alone is read");
ok = TwitchTokenRedirect.Parse($"https://www.twitch.tv/#scope=&token_type=bearer&access_token={Token}");
Check(ok.Kind == TwitchRedirectKind.Token && ok.Token == Token, "the order of the parameters does not matter");
ok = TwitchTokenRedirect.Parse($"HTTPS://WWW.TWITCH.TV/#access_token={Token}");
Check(ok.Kind == TwitchRedirectKind.Token, "scheme and host are case-insensitive");
ok = TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=" + Uri.EscapeDataString(Token));
Check(ok.Kind == TwitchRedirectKind.Token && ok.Token == Token, "a URL-encoded value is decoded");
ok = TwitchTokenRedirect.Parse($"https://www.twitch.tv/#access_token={Token}&access_token=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
Check(ok.Kind == TwitchRedirectKind.Token && ok.Token == Token, "the first access_token wins");

// missing or malformed token
Check(TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=").Kind == TwitchRedirectKind.Error, "an empty token is an error");
Check(TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=short").Kind == TwitchRedirectKind.Error, "a short token is an error");
Check(TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=abc%20def0123456789abcdefghij").Kind == TwitchRedirectKind.Error, "a token with a space is an error");
Check(TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=" + new string('a', 300)).Kind == TwitchRedirectKind.Error, "an oversized token is an error");
Check(TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=short").Token == null, "a bad token is never returned");

// the user said no
var denied = TwitchTokenRedirect.Parse("https://www.twitch.tv/#error=access_denied&error_description=The+user+denied+you+access&state=");
Check(denied.Kind == TwitchRedirectKind.Error && denied.Error == "access_denied" && denied.Token == null, "error=access_denied in the fragment");
denied = TwitchTokenRedirect.Parse("https://www.twitch.tv/?error=access_denied&error_description=x");
Check(denied.Kind == TwitchRedirectKind.Error && denied.Error == "access_denied", "error=access_denied in the query");
denied = TwitchTokenRedirect.Parse($"https://www.twitch.tv/#error=access_denied&access_token={Token}");
Check(denied.Kind == TwitchRedirectKind.Error && denied.Token == null, "an error wins over a token next to it");
denied = TwitchTokenRedirect.Parse("https://www.twitch.tv/#error=<script>alert(1)</script>");
Check(denied.Kind == TwitchRedirectKind.Error && denied.Error == "unknown", "an odd error value is replaced, never passed on");

// not the redirect at all: the window keeps going
foreach (var url in new[]
{
    null, "", "   ", "not a url", "about:blank",
    "https://www.twitch.tv/", "https://www.twitch.tv/login?client_id=" + Android, "https://www.twitch.tv/#", "https://www.twitch.tv/#foo=bar",
    $"https://www.twitch.tv/directory#access_token={Token}",       // another page
    $"http://www.twitch.tv/#access_token={Token}",                  // not https
    $"https://evil.example/#access_token={Token}",                  // another host
    $"https://www.twitch.tv.evil.example/#access_token={Token}",    // look-alike host
    $"https://www.twitch.tv@evil.example/#access_token={Token}",    // credentials trick
    $"https://www.twitch.tv:8443/#access_token={Token}",            // another port
    $"https://id.twitch.tv/#access_token={Token}",                  // another twitch host
})
{
    var r = TwitchTokenRedirect.Parse(url);
    Check(r.Kind == TwitchRedirectKind.NotRedirect && r.Token == null, $"not a redirect: {url ?? "null"}");
}

// malformed percent-encoding must never throw out of WebView2 event callbacks
ok = TwitchTokenRedirect.Parse($"https://www.twitch.tv/#foo=%ZZ&access_token={Token}");
Check(ok.Kind == TwitchRedirectKind.Token && ok.Token == Token, "malformed percent-encoding in another parameter is ignored");
Check(TwitchTokenRedirect.Parse("https://www.twitch.tv/#access_token=%ZZ").Kind == TwitchRedirectKind.Error, "malformed percent-encoding in access_token is an error");
denied = TwitchTokenRedirect.Parse("https://www.twitch.tv/?x=%2#error=access_denied");
Check(denied.Kind == TwitchRedirectKind.Error && denied.Error == "access_denied", "malformed percent-encoding in query does not hide fragment error");

Console.WriteLine(failures == 0 ? "ALL PASSED" : $"{failures} FAILED");
return failures == 0 ? 0 : 1;
