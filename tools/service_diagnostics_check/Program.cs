// Runs the service diagnostics against a port and prints every check, then checks the pure parsers.
// Usage: dotnet run --project tools/service_diagnostics_check -- [port] [--no-token]   (default port 28599; read-only, kills nothing)
using System.Text;
using TwitchDropsSentinel;

int port = args.Select(a => int.TryParse(a, out int p) ? p : 0).FirstOrDefault(p => p > 0);
if (port == 0) port = 28599;
bool noToken = args.Contains("--no-token") || port == 28492;

string root = AppContext.BaseDirectory;
for (var dir = new DirectoryInfo(root); dir != null; dir = dir.Parent)
{
    if (File.Exists(Path.Combine(dir.FullName, "core", "sentinel_service.py"))) { root = dir.FullName + Path.DirectorySeparatorChar; break; }
}

var result = ServiceDiagnostics.Run(new DiagnosticsInput(port, root, root, null, Array.Empty<DateTime>(),
    noToken ? null : LocalApiToken.Create(), StartConflict.ReadVersion(root) ?? "unknown", Russian: false));
Console.WriteLine($"--- diagnostics for port {port} ---");
foreach (var c in result.Checks)
    Console.WriteLine($"{c.Status.ToUpperInvariant(),-5} {c.Id,-9} {c.Title} | {c.Detail.Replace("\r", "").Replace("\n", " / ")}" + (c.Action != null ? $" [action {c.Action} pid {c.Pid}]" : ""));

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); } else Console.WriteLine("ok:   " + what);
}

var ranges = ServiceDiagnostics.ParseExcludedRanges("""

    Протокол tcp Диапазон исключения портов

    Начальный порт    Конечный порт
    ---------------    -------------
              1913             2012
             28490            28499     *

    * - Исключения административной установки.
    """);
Check(ranges.Count == 2 && ranges[1] == (28490, 28499), "excluded ranges: numeric rows only, localized headers ignored");
Check(ServiceDiagnostics.RangeContaining(ranges, 28492) is { Start: 28490 }, "a port inside a range is found");
Check(ServiceDiagnostics.RangeContaining(ranges, 28599) == null, "a port outside every range is not");

string netstat = "  TCP    127.0.0.1:28599        0.0.0.0:0              LISTENING       4242\r\n  TCP    127.0.0.1:285990       0.0.0.0:0              LISTENING       1\r\n  TCP    127.0.0.1:28599        127.0.0.1:50000        ESTABLISHED     4242\r\n  TCP    [::]:28599             [::]:0                 LISTENING       4242\r\n";
var pids = ServiceDiagnostics.ParseListeningPids(netstat, 28599);
Check(pids.Count == 1 && pids[0] == 4242, "netstat: only the listening row of exactly this port, once");

string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
string clean = ServiceDiagnostics.Sanitize(profile + @"\x steam 76561198012345678 token SECRET-TOKEN-123456", "SECRET-TOKEN-123456");
Check(clean.Contains(@"%USERPROFILE%\x") && !clean.Contains(profile, StringComparison.OrdinalIgnoreCase), "the profile path is replaced");
Check(!clean.Contains("76561198012345678") && clean.Contains("7656*************"), "Steam ID masked");
Check(!clean.Contains("SECRET-TOKEN"), "token removed");
Check(ServiceDiagnostics.TailLines(string.Join("\n", Enumerable.Range(1, 40)), 15).Split(Environment.NewLine).Length == 15, "log tail keeps 15 lines");

var log = new BackendStartLog();
Check(log.Snapshot().Count == 0, "start log empty");
log.Record(); log.Record();
Check(log.Snapshot().Count == 2, "start log records");

var loop = ServiceDiagnostics.Run(new DiagnosticsInput(28599, root, root, null, new[] { DateTime.UtcNow, DateTime.UtcNow, DateTime.UtcNow }, null, "t", false));
Check(loop.Checks.First(c => c.Id == "restarts").Status == "fail", "3 starts in 5 minutes is a restart loop");
var calm = ServiceDiagnostics.Run(new DiagnosticsInput(28599, root, root, null, new[] { DateTime.UtcNow.AddMinutes(-30) }, null, "t", false));
Check(calm.Checks.First(c => c.Id == "restarts").Status == "ok", "an old start is not a loop");
Check(!ServiceDiagnostics.ToJson(loop, "secret-token-value").Contains("\"token\""), "json carries no token field");

// the service's own checks (GET /api/v1/health) are merged into the same list
Check(new DiagnosticCheck("x", "ok", "t", "d", "a").Area == "service", "a host check belongs to the service area");
var healthRows = ServiceDiagnostics.ParseHealthResponse("""
    {"checks":[
      {"id":"twitch_login","area":"twitch","status":"ok","title":"Вход","detail":"d","advice":""},
      {"id":"net_steam","area":"network","status":"fail","title":"Сеть","detail":"x","advice":"VPN"},
      {"id":"odd","area":"mars","status":"weird","title":"Odd"},
      {"area":"twitch","status":"ok","title":"no id"},
      7, null,
      {"id":"pid","area":"system","status":"warn","title":"P","action":"close_other","pid":5}
    ],"version":"4.0.1"}
    """, true);
Check(healthRows.Count == 4, "health rows: rows without an id and non-objects are dropped");
Check(healthRows[0].Area == "twitch" && healthRows[0].Status == "ok" && healthRows[1].Area == "network" && healthRows[1].Advice == "VPN", "health rows keep area, status and texts");
Check(healthRows[2].Status == "warn" && healthRows[2].Area == "service", "an unknown status is a warning, an unknown area is the service area");
Check(healthRows[3].Action == null && healthRows[3].Pid == null, "the service cannot ask the page for an action or a pid");
foreach (var bad in new string?[] { null, "", "not json", "{}", "{\"checks\":5}", "[1]" })
{
    var fallback = ServiceDiagnostics.ParseHealthResponse(bad, true);
    Check(fallback.Count == 1 && fallback[0].Status == "warn" && fallback[0].Id == "health" && fallback[0].Title == "Проверки службы недоступны", $"unusable health answer ({bad ?? "null"}) is one warning row");
}
Check(ServiceDiagnostics.ParseHealthResponse(null, false)[0].Title == "Service checks unavailable", "the fallback row follows the language");
Check(ServiceDiagnostics.ToJson(new DiagnosticsResult(healthRows, ""), null).Contains("\"area\":\"twitch\""), "json carries the area");
Check(ServiceDiagnostics.BuildReport(healthRows, "t").Contains("[WARN]"), "the report lists service rows");
var unreachable = ServiceDiagnostics.FetchHealth(1, null, true);
Check(unreachable.Count == 1 && unreachable[0].Id == "health" && unreachable[0].Status == "warn", "a service that cannot be reached gives the one warning row");

// hardening of the health fetch: ids are plain, the body is capped, and no other exception loses the host checks
var odd = ServiceDiagnostics.ParseHealthResponse(
    "{\"checks\":[{\"id\":\"net_steam\",\"title\":\"a\"},{\"id\":\"<b>x</b>\",\"title\":\"b\"},{\"id\":\"UPPER\",\"title\":\"c\"},"
    + "{\"id\":\"" + new string('a', 40) + "\",\"title\":\"d\"},{\"id\":\"" + new string('a', 41) + "\",\"title\":\"e\"}]}", false);
Check(odd.Count == 5 && odd[0].Id == "net_steam" && odd[3].Id.Length == 40, "a plain id of up to 40 characters is kept");
Check(odd[1].Id == "service_check" && odd[2].Id == "service_check" && odd[4].Id == "service_check", "an id with markup, capitals or more than 40 characters becomes service_check");
string evilJson = ServiceDiagnostics.ToJson(new DiagnosticsResult(new[] { new DiagnosticCheck("evil\"id<>", "warn", "t", "d", "a") }, ""), null);
Check(evilJson.Contains("\"id\":\"service_check\"") && !evilJson.Contains("evil"), "ToJson sanitizes the id too");

var badToken = ServiceDiagnostics.FetchHealth(1, "bad\nvalue", true);
Check(badToken.Count == 1 && badToken[0].Id == "health" && badToken[0].Status == "warn", "an unexpected exception still gives the one warning row");

IReadOnlyList<DiagnosticCheck> FetchFromFake(byte[] body)
{
    var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
    listener.Start();
    int fakePort = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
    var server = Task.Run(() =>
    {
        try
        {
            using var peer = listener.AcceptTcpClient();
            using var stream = peer.GetStream();
            stream.Read(new byte[4096], 0, 4096);
            stream.Write(System.Text.Encoding.ASCII.GetBytes($"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n"));
            stream.Write(body);
        }
        catch (Exception ex) when (ex is IOException or System.Net.Sockets.SocketException or ObjectDisposedException)
        {
            Console.WriteLine("fake service: client left early: " + ex.Message);
        }
    });
    try { return ServiceDiagnostics.FetchHealth(fakePort, null, false); }
    finally { listener.Stop(); server.Wait(2000); }
}

var small = FetchFromFake(System.Text.Encoding.UTF8.GetBytes("{\"checks\":[{\"id\":\"net_steam\",\"status\":\"ok\",\"area\":\"network\",\"title\":\"t\"}]}"));
Check(small.Count == 1 && small[0].Id == "net_steam" && small[0].Area == "network", "a normal answer of a (fake) service is parsed");
var huge = FetchFromFake(System.Text.Encoding.UTF8.GetBytes("{\"checks\":[{\"id\":\"big\",\"status\":\"ok\",\"title\":\"" + new string('x', 2 * 1024 * 1024) + "\"}]}"));
Check(huge.Count == 1 && huge[0].Id == "health" && huge[0].Status == "warn", "an answer over 1 MB is refused with the warning row");

// ---- stage 2: one-click fixes ----
var fixRows = ServiceDiagnostics.ParseHealthResponse("""
    {"checks":[
      {"id":"twitch_code_loop","area":"twitch","status":"fail","title":"Code","fix":{"id":"twitch_relogin","label":"Войти заново","confirm":"Вход в Twitch будет сброшен"}},
      {"id":"twitch_code","area":"twitch","status":"warn","title":"Wait","fix":{"id":"twitch_open_code","label":"Открыть","client":true,"uri":"https://www.twitch.tv/activate","code":"ABCD-EFGH"}},
      {"id":"evil_uri","area":"twitch","status":"warn","title":"E","fix":{"id":"twitch_open_code","label":"Открыть","client":true,"uri":"https://evil.example/activate","code":"<script>"}},
      {"id":"bad_fix_id","area":"system","status":"warn","title":"B","fix":{"id":"rm -rf /","label":"x"}},
      {"id":"no_label","area":"system","status":"warn","title":"N","fix":{"id":"cache_clear"}},
      {"id":"not_object","area":"system","status":"warn","title":"O","fix":"cache_clear"},
      {"id":"plain","area":"system","status":"ok","title":"P"}
    ]}
    """, true);
Check(fixRows.Count == 7, "fix rows: all rows are kept");
Check(fixRows[0].Fix is { Id: "twitch_relogin", Label: "Войти заново", Confirm: "Вход в Twitch будет сброшен", Client: false, Uri: null }, "a fix keeps id, label and confirm");
Check(fixRows[1].Fix is { Id: "twitch_open_code", Client: true, Uri: "https://www.twitch.tv/activate", Code: "ABCD-EFGH" }, "a page-side fix keeps the Twitch address and the code");
Check(fixRows[2].Fix is { Uri: "https://www.twitch.tv/activate", Code: null }, "a foreign address becomes the Twitch one and a markup code is dropped");
Check(fixRows[3].Fix == null, "a fix id with markup or spaces is dropped");
Check(fixRows[4].Fix == null, "a fix without a label is dropped");
Check(fixRows[5].Fix == null && fixRows[6].Fix == null, "a fix that is not an object, or absent, is no fix");
string fixJson = ServiceDiagnostics.ToJson(new DiagnosticsResult(fixRows, ""), "secret-token-value");
Check(fixJson.Contains("\"fix\":{\"id\":\"twitch_relogin\",\"label\":\"") && fixJson.Contains("\"confirm\":\"") , "json carries the fix");
Check(ServiceDiagnostics.ToJson(new DiagnosticsResult(new[] { new DiagnosticCheck("x", "warn", "t", "d", "a", Fix: new DiagnosticFix("cache_clear", "Clean secret-token-value")) }, ""), "secret-token-value").Contains("***"), "the fix label is sanitized too");

var fixOk = ServiceDiagnostics.ParseFixResponse("twitch_relogin", 200, "{\"ok\":true,\"message\":\"Вход сброшен\",\"restart\":false,\"checks\":[]}", true);
Check(fixOk is { Id: "twitch_relogin", Ok: true, Message: "Вход сброшен", Restart: false }, "a good fix answer is ok");
var fixRestart = ServiceDiagnostics.ParseFixResponse("settings_restore", 200, "{\"ok\":true,\"message\":\"m\",\"restart\":true}", true);
Check(fixRestart.Ok && fixRestart.Restart, "the restart flag is passed on");
var fixRefused = ServiceDiagnostics.ParseFixResponse("steam_login", 409, "{\"ok\":false,\"message\":\"Сессия Steam в порядке\"}", true);
Check(!fixRefused.Ok && fixRefused.Message == "Сессия Steam в порядке", "a 409 answer is not ok and keeps the service's text");
Check(!ServiceDiagnostics.ParseFixResponse("x", 200, "{\"ok\":false,\"message\":\"no\"}", true).Ok, "ok:false in a 200 body is not ok");
Check(!ServiceDiagnostics.ParseFixResponse("x", 500, "{\"ok\":true,\"message\":\"odd\"}", true).Ok, "a failing status wins over an ok flag");
foreach (var bad in new string?[] { null, "", "not json", "[1]", "{}", "{\"ok\":\"yes\"}" })
{
    var r = ServiceDiagnostics.ParseFixResponse("cache_clear", 200, bad, false);
    Check(!r.Ok && r.Message.Length > 0 && r.Id == "cache_clear", $"an unusable fix answer ({bad ?? "null"}) is a failure with a message");
}
Check(ServiceDiagnostics.ParseFixResponse("x", 200, "{\"ok\":true,\"message\":\"" + new string('m', 5000) + "\"}", true).Message.Length <= 600, "a long service message is cut");
string fixResultJson = ServiceDiagnostics.FixResultJson(new FixResult("cache_clear", true, "done secret-token-value", true), "secret-token-value");
Check(fixResultJson.Contains("\"type\":\"FIX_RESULT\"") && fixResultJson.Contains("\"id\":\"cache_clear\"") && fixResultJson.Contains("\"ok\":true") && fixResultJson.Contains("\"restart\":true") && !fixResultJson.Contains("secret-token-value"), "FIX_RESULT carries id, ok, message, restart and no token");
Check(ServiceDiagnostics.FixResultJson(new FixResult("evil\"id<>", false, "m"), null).Contains("\"id\":\"service_check\""), "FIX_RESULT sanitizes the id");

var unreachableFix = ServiceDiagnostics.PostFix(1, null, "cache_clear", false);
Check(!unreachableFix.Ok && unreachableFix.Id == "cache_clear" && unreachableFix.Message.Length > 0, "a service that cannot be reached is a failed fix, not an exception");
Check(!ServiceDiagnostics.PostFix(1, null, "../../x", false).Ok, "an id that is not a plain name is not relayed");
Check(!ServiceDiagnostics.PostFix(1, "bad\nvalue", "cache_clear", true).Ok, "an unexpected exception is a failed fix too");

string[] fixSeen = Array.Empty<string>();
(int Port, Task Server) FakeFixService(int status, string body)
{
    var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
    listener.Start();
    int fakePort = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
    var server = Task.Run(() =>
    {
        try
        {
            using var peer = listener.AcceptTcpClient();
            using var stream = peer.GetStream();
            var received = new MemoryStream();
            var buf = new byte[4096];
            while (true)
            {
                int n = stream.Read(buf, 0, buf.Length);
                if (n <= 0) break;
                received.Write(buf, 0, n);
                string so = System.Text.Encoding.UTF8.GetString(received.ToArray());
                int headEnd = so.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                if (headEnd < 0) continue;
                var lengthMatch = System.Text.RegularExpressions.Regex.Match(so, @"Content-Length:\s*(\d+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                int need = lengthMatch.Success ? int.Parse(lengthMatch.Groups[1].Value) : 0;
                if (System.Text.Encoding.UTF8.GetByteCount(so[(headEnd + 4)..]) >= need) break;
            }
            fixSeen = System.Text.Encoding.UTF8.GetString(received.ToArray()).Split("\r\n");
            byte[] payload = System.Text.Encoding.UTF8.GetBytes(body);
            stream.Write(System.Text.Encoding.ASCII.GetBytes($"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {payload.Length}\r\nConnection: close\r\n\r\n"));
            stream.Write(payload);
        }
        catch (Exception ex) when (ex is IOException or System.Net.Sockets.SocketException or ObjectDisposedException)
        {
            Console.WriteLine("fake fix service: client left early: " + ex.Message);
        }
        finally { listener.Stop(); }
    });
    return (fakePort, server);
}
var (fixPort, fixServer) = FakeFixService(200, "{\"ok\":true,\"message\":\"Готово\",\"restart\":false,\"checks\":[]}");
var relayed = ServiceDiagnostics.PostFix(fixPort, "tok-123456789", "cache_clear", true);
fixServer.Wait(3000);
Check(relayed is { Ok: true, Message: "Готово" }, "a fix is relayed to the service and its answer parsed");
Check(fixSeen.Length > 0 && fixSeen[0].StartsWith("POST /api/v1/health/fix?lang=ru ") && fixSeen.Any(l => l.StartsWith("X-Sentinel-Token: tok-123456789", StringComparison.OrdinalIgnoreCase)), "the relay is a POST to /api/v1/health/fix with the token header");
Check(fixSeen.Any(l => l.Contains("{\"id\":\"cache_clear\"}")), "the body carries only the id");
var (conflictPort, conflictServer) = FakeFixService(409, "{\"ok\":false,\"message\":\"Нечего удалять\",\"checks\":[]}");
var conflict = ServiceDiagnostics.PostFix(conflictPort, null, "logs_trim", true);
conflictServer.Wait(3000);
Check(conflict is { Ok: false, Message: "Нечего удалять" }, "a 409 from the service reaches the page as a failure with its text");

// the sign-in page: only twitch.tv over https, anything else becomes the usual address
foreach (var good in new[] { "https://www.twitch.tv/activate", "https://twitch.tv/activate", "https://id.twitch.tv/activate?device-code=XYZ" })
    Check(TwitchActivatePolicy.Resolve(good) == good || TwitchActivatePolicy.Resolve(good) == new Uri(good).AbsoluteUri, $"twitch address kept: {good}");
foreach (var evil in new string?[] { null, "", "https://evil.example/activate", "http://www.twitch.tv/activate", "https://twitch.tv.evil.com/a", "https://eviltwitch.tv/a", "javascript:alert(1)",
                                      "file:///c:/windows/system32/calc.exe", "https://user@www.twitch.tv/activate", "https://www.twitch.tv:8443/a", " https://www.twitch.tv/activate", "https://www.twitch.tv/a\nb", "ms-msdt:x" })
    Check(TwitchActivatePolicy.Resolve(evil) == "https://www.twitch.tv/activate", $"foreign address replaced: {evil ?? "null"}");

// the window data folder: only this exact path is ever deleted
string localApp = Path.Combine(Path.GetTempPath(), "hh_webview_check_" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(localApp);
try
{
    string wvFolder = WebViewDataReset.FolderUnder(localApp);
    Check(wvFolder == Path.Combine(localApp, "TwitchDropsSentinel", "WebView2Data"), "the window data folder is %LOCALAPPDATA%\\TwitchDropsSentinel\\WebView2Data");
    Check(WebViewDataReset.IsAllowedFolder(wvFolder, localApp), "the exact folder is allowed");
    Check(WebViewDataReset.IsAllowedFolder(wvFolder + Path.DirectorySeparatorChar, localApp), "a trailing separator is the same folder");
    Check(WebViewDataReset.IsAllowedFolder(wvFolder.ToUpperInvariant(), localApp), "the comparison ignores case like Windows does");
    foreach (var wrong in new string?[]
    {
        null, "", "   ", "WebView2Data", @"TwitchDropsSentinel\WebView2Data", localApp, Path.Combine(localApp, "TwitchDropsSentinel"), wvFolder + "2", wvFolder + "_old",
        Path.Combine(wvFolder, "EBWebView"), Path.Combine(localApp, "TwitchDropsSentinel", "WebView2Data", "..", "WebView2Data"), Path.Combine(localApp, "TwitchDropsSentinel", "x", "..", "WebView2Data"),
        Path.Combine(localApp, "Other", "WebView2Data"), Path.Combine(Path.GetTempPath(), "WebView2Data"), Path.GetPathRoot(localApp), Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        Environment.GetFolderPath(Environment.SpecialFolder.Desktop), wvFolder + "\0",
    })
        Check(!WebViewDataReset.IsAllowedFolder(wrong, localApp), $"refused: {wrong ?? "null"}");

    Check(!WebViewDataReset.ApplyPending(localApp, out _), "nothing pending: nothing happens");
    Directory.CreateDirectory(wvFolder);
    File.WriteAllBytes(Path.Combine(wvFolder, "cache.bin"), new byte[3000]);
    Directory.CreateDirectory(Path.Combine(wvFolder, "EBWebView", "Default"));
    File.WriteAllText(Path.Combine(wvFolder, "EBWebView", "Default", "Cookies"), "c");
    string neighbour = Path.Combine(localApp, "TwitchDropsSentinel", "keep.txt");
    File.WriteAllText(neighbour, "keep");

    var rowBefore = WebViewDataReset.BuildRow(localApp, true);
    Check(rowBefore.Id == "webview_data" && rowBefore.Status == "ok" && rowBefore.Area == "service" && rowBefore.Title == "Данные окна", "the window data row is ok and in the service area");
    Check(rowBefore.Detail.Contains("КБ") || rowBefore.Detail.Contains("МБ"), "the row names the size of the folder");
    Check(rowBefore.Fix is { Id: "webview_reset", Client: false } && rowBefore.Fix.Confirm != null && rowBefore.Fix.Confirm.Contains("язык интерфейса") && rowBefore.Fix.Confirm.Contains("Входы в Twitch и Steam и настройки службы не пострадают"), "the row carries the reset with a confirm that names what is lost");
    Check(WebViewDataReset.BuildRow(localApp, false).Fix!.Confirm!.Contains("interface language"), "the confirm follows the language");

    Check(WebViewDataReset.Schedule(localApp, out string scheduleError) && scheduleError == "", "the reset is scheduled by a marker file");
    Check(File.Exists(WebViewDataReset.MarkerUnder(localApp)) && Directory.Exists(wvFolder), "scheduling deletes nothing yet");
    Check(WebViewDataReset.Schedule(localApp, out _), "scheduling twice is fine");
    var rowPending = WebViewDataReset.BuildRow(localApp, true);
    Check(rowPending.Fix == null && rowPending.Detail.Contains("перезапуст"), "a scheduled reset shows no second button and says to restart");

    Check(WebViewDataReset.ApplyPending(localApp, out string applyNote) && applyNote == "", "at the start the folder is deleted");
    Check(!Directory.Exists(wvFolder) && !File.Exists(WebViewDataReset.MarkerUnder(localApp)), "the folder and the marker are gone");
    Check(File.Exists(neighbour) && File.ReadAllText(neighbour) == "keep", "what lies next to the folder is untouched");
    Check(!WebViewDataReset.ApplyPending(localApp, out _), "a second start does nothing");

    // a marker without a folder is just cleared
    WebViewDataReset.Schedule(localApp, out _);
    Check(WebViewDataReset.ApplyPending(localApp, out _) && !File.Exists(WebViewDataReset.MarkerUnder(localApp)), "a marker with no folder is removed");

    // a locked file: the folder stays, the marker stays for the next start, the note says why
    Directory.CreateDirectory(wvFolder);
    string lockedFile = Path.Combine(wvFolder, "locked.bin");
    WebViewDataReset.Schedule(localApp, out _);
    using (var held = new FileStream(lockedFile, FileMode.Create, FileAccess.ReadWrite, FileShare.None))
    {
        Check(!WebViewDataReset.ApplyPending(localApp, out string lockedNote, attempts: 2, delayMs: 10) && lockedNote.Length > 0, "a locked file makes the reset fail with a note");
        Check(File.Exists(WebViewDataReset.MarkerUnder(localApp)) && File.Exists(lockedFile), "after a failed reset the marker stays for the next start");
    }
    Check(WebViewDataReset.ApplyPending(localApp, out _) && !Directory.Exists(wvFolder), "the next start finishes the job");

    // never through a link
    string target = Path.Combine(localApp, "precious");
    Directory.CreateDirectory(target);
    File.WriteAllText(Path.Combine(target, "keep.txt"), "keep");
    try
    {
        Directory.CreateSymbolicLink(wvFolder, target);
        WebViewDataReset.Schedule(localApp, out _);
        Check(!WebViewDataReset.ApplyPending(localApp, out string linkNote) && linkNote.Length > 0, "a folder that is a link is refused");
        Check(File.Exists(Path.Combine(target, "keep.txt")), "nothing behind the link was deleted");
        Check(!File.Exists(WebViewDataReset.MarkerUnder(localApp)), "a refused link does not leave a marker that would retry forever");
        Directory.Delete(wvFolder);
    }
    catch (UnauthorizedAccessException ex)
    {
        Console.WriteLine("skipped (no privilege for symbolic links here): " + ex.Message);
    }
}
finally
{
    try { Directory.Delete(localApp, true); } catch (Exception ex) { Console.WriteLine("cleanup: " + ex.Message); }
}

// ---- review round: ids are whole-string plain names, the reset survives a marker that cannot be deleted ----
Check(ServiceDiagnostics.SafeId("abc\n") == "service_check" && ServiceDiagnostics.SafeId("abc") == "abc" && ServiceDiagnostics.SafeId("ab\r\n") == "service_check", "an id with a trailing newline is not a plain name");
var newlineFix = ServiceDiagnostics.ParseHealthResponse("{\"checks\":[{\"id\":\"x\",\"status\":\"ok\",\"title\":\"t\",\"fix\":{\"id\":\"logs_trim\\n\",\"label\":\"l\"}},{\"id\":\"y\\n\",\"status\":\"ok\",\"title\":\"t\"}]}", false);
Check(newlineFix[0].Fix == null && newlineFix[1].Id == "service_check", "a fix id or a row id with a trailing newline is dropped or replaced");
var newlineRelay = ServiceDiagnostics.PostFix(1, null, "logs_trim\n", false);
Check(!newlineRelay.Ok && newlineRelay.Message.Contains("Unknown fix") && newlineRelay.Id == "service_check", "an id with a trailing newline is never relayed");
Check(ServiceDiagnostics.ParseHealthResponse("{\"checks\":[{\"id\":\"x\",\"status\":\"ok\",\"title\":\"t\",\"fix\":{\"id\":\"twitch_open_code\",\"label\":\"l\",\"client\":true,\"uri\":\"https://www.twitch.tv/activate\",\"code\":\"AB-CD\\n\"}}]}", false)[0].Fix!.Code == null, "a code with a trailing newline is dropped");

string localApp2 = Path.Combine(Path.GetTempPath(), "hh_webview_check2_" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(localApp2);
try
{
    string wv2 = WebViewDataReset.FolderUnder(localApp2);
    string marker2 = WebViewDataReset.MarkerUnder(localApp2);
    Directory.CreateDirectory(wv2);
    File.WriteAllText(Path.Combine(wv2, "cache.bin"), "c");
    WebViewDataReset.Schedule(localApp2, out _);
    // the folder goes, the marker cannot be deleted (held open by a reader that allows writing but not deleting)
    using (var held = new FileStream(marker2, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
    {
        Check(WebViewDataReset.ApplyPending(localApp2, out string heldNote, attempts: 2, delayMs: 10) && heldNote == "", "the folder is deleted even when the marker cannot be deleted");
        Check(!Directory.Exists(wv2), "the folder is gone");
        Check(File.Exists(marker2) && File.ReadAllText(marker2).StartsWith("done"), "a marker that cannot be deleted is turned into a done state");
    }
    Directory.CreateDirectory(wv2);
    File.WriteAllText(Path.Combine(wv2, "fresh.bin"), "new data");
    Check(WebViewDataReset.BuildRow(localApp2, true).Fix != null, "a done marker does not count as a scheduled reset");
    Check(!WebViewDataReset.ApplyPending(localApp2, out _) && File.Exists(Path.Combine(wv2, "fresh.bin")), "the next start does not wipe again after a done marker");
    Check(!File.Exists(marker2), "and the done marker is cleared once it can be");
    WebViewDataReset.Schedule(localApp2, out _);
    Check(WebViewDataReset.ApplyPending(localApp2, out _) && !Directory.Exists(wv2), "a new request after a done state works as usual");

    Check(!WebViewDataReset.ApplyPending(null!, out string nullNote) && nullNote.Length > 0, "an unexpected failure is a false with a note, not an exception");
    Check(!WebViewDataReset.ApplyPending("a\0b", out _) , "a path with a null character is a false too");
}
finally
{
    try { Directory.Delete(localApp2, true); } catch (Exception ex) { Console.WriteLine("cleanup: " + ex.Message); }
}


// ---- health center: file names, log ZIP, issue link, toast launch ----
var stamp = new DateTime(2026, 11, 25, 14, 5, 33);
Check(HealthExport.ReportFileName(stamp) == "Hell Harvest report 2026-11-25 1405.txt", "report file name carries the date and minutes");
Check(HealthExport.LogsZipName(stamp) == "Hell Harvest logs 2026-11-25 1405.zip", "logs zip name carries the date and minutes");

string homeDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
string dirty = HealthExport.SanitizeLog(
    "path " + homeDir + @"\x steam 76561198012345678 token SECRET-TOKEN-123456" + Environment.NewLine +
    "Authorization: Bearer abc.def-123" + Environment.NewLine + "Cookie: auth-token=zzz; unique_id=1" + Environment.NewLine +
    "Login successful, user ID: 4242, login: mortuis_v" + Environment.NewLine + "{\"access_token\": \"AAAA1111BBBB\", \"login\":\"mortuis_v\"}" + Environment.NewLine +
    "password=hunter2 bearer XYZ.123", "SECRET-TOKEN-123456");
Check(!dirty.Contains(homeDir, StringComparison.OrdinalIgnoreCase) && dirty.Contains("%USERPROFILE%"), "log: profile path replaced");
Check(!dirty.Contains("76561198012345678") && !dirty.Contains("SECRET-TOKEN"), "log: Steam ID and token removed");
Check(!dirty.Contains("abc.def-123") && !dirty.Contains("auth-token=zzz") && !dirty.Contains("AAAA1111BBBB") && !dirty.Contains("hunter2") && !dirty.Contains("XYZ.123"), "log: Bearer, cookie, access_token and password patterns removed");
Check(!dirty.Contains("mortuis_v") && !dirty.Contains("4242") && dirty.Contains("m***"), "log: the Twitch user name and id are masked");

string logRoot = Path.Combine(Path.GetTempPath(), "hh_logs_" + Guid.NewGuid().ToString("N"));
string logCore = Path.Combine(logRoot, "core");
string logBase = Path.Combine(logRoot, "app");
Directory.CreateDirectory(logCore);
Directory.CreateDirectory(logBase);
try
{
    File.WriteAllText(Path.Combine(logRoot, "sentinel_stdout.log"), "out line " + homeDir + "\n");
    // sentinel_stderr.log is missing on purpose
    File.WriteAllText(Path.Combine(logCore, "sentinel_service.log"), "svc login: someone token SECRET-TOKEN-123456\n");
    File.WriteAllText(Path.Combine(logCore, "sentinel_service.log.1"), "old svc\n");
    File.WriteAllText(Path.Combine(logBase, "desktop_errors.log"), "desk\n");
    File.WriteAllText(Path.Combine(logBase, "crash.log"), "crash\n");
    File.WriteAllText(Path.Combine(logRoot, "config.json"), "{\"secret\":\"must never be zipped\"}");
    File.WriteAllText(Path.Combine(logCore, "other.log"), "must never be zipped");
    var sources = HealthExport.StandardSources(logRoot, logBase);
    Check(sources.Select(s => s.EntryName).OrderBy(n => n, StringComparer.Ordinal).SequenceEqual(new[] { "core/sentinel_service.log", "core/sentinel_service.log.1", "crash.log", "desktop_errors.log", "sentinel_stderr.log", "sentinel_stdout.log" }), "the sources are exactly the six named files");
    string zip = Path.Combine(logRoot, "out.zip");
    var included = HealthExport.BuildLogZip(zip, "REPORT BODY " + homeDir, sources, "SECRET-TOKEN-123456", stamp, "9.9.9");
    using (var archive = System.IO.Compression.ZipFile.OpenRead(zip))
    {
        var names = archive.Entries.Select(e => e.FullName).OrderBy(n => n, StringComparer.Ordinal).ToList();
        Check(names.SequenceEqual(new[] { "README.txt", "core/sentinel_service.log", "core/sentinel_service.log.1", "crash.log", "desktop_errors.log", "report.txt", "sentinel_stdout.log" }), "zip: present files + report + README, nothing else (no config, no other log)");
        string Read(string n) { using var r = new StreamReader(archive.GetEntry(n)!.Open()); return r.ReadToEnd(); }
        Check(!Read("sentinel_stdout.log").Contains(homeDir, StringComparison.OrdinalIgnoreCase), "zip: copies are sanitized (profile path)");
        Check(!Read("core/sentinel_service.log").Contains("SECRET-TOKEN") && !Read("core/sentinel_service.log").Contains("someone"), "zip: token and user name are gone from the service log");
        Check(Read("report.txt").StartsWith("REPORT BODY") && !Read("report.txt").Contains(homeDir, StringComparison.OrdinalIgnoreCase), "zip: the report is included and sanitized");
        string readme = Read("README.txt");
        Check(readme.Contains("sentinel_stdout.log") && readme.Contains("core/sentinel_service.log.1") && readme.Contains("report.txt"), "README lists what was included");
        Check(readme.Contains("sentinel_stderr.log") && readme.Contains("not found", StringComparison.OrdinalIgnoreCase), "README says which file was missing");
        Check(readme.Contains("9.9.9"), "README carries the app version");
    }
    Check(included.Contains("sentinel_stdout.log") && !included.Contains("sentinel_stderr.log"), "the builder returns what it included");

    // a 6 MB log is cut to its last 5 MB, from a whole line, read while another writer holds it open
    string big = Path.Combine(logRoot, "big.log");
    using (var writer = new FileStream(big, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
    {
        var sb = new StringBuilder();
        for (int i = 0; i < 120000; i++) sb.Append("line ").Append(i.ToString("D6")).Append(' ').Append('x', 40).Append('\n');
        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        writer.Write(bytes, 0, bytes.Length);
        writer.Flush();
        Check(bytes.Length > 5 * 1024 * 1024, "test data is bigger than the cap");
        string zipBig = Path.Combine(logRoot, "big.zip");
        HealthExport.BuildLogZip(zipBig, "r", new[] { new LogSource("sentinel_stdout.log", big) }, null, stamp, "1");
        using var archive = System.IO.Compression.ZipFile.OpenRead(zipBig);
        using var reader = new StreamReader(archive.GetEntry("sentinel_stdout.log")!.Open());
        string text = reader.ReadToEnd();
        Check(Encoding.UTF8.GetByteCount(text) <= 5 * 1024 * 1024, "the entry is at most 5 MB");
        Check(text.TrimEnd().EndsWith("line 119999 " + new string('x', 40)), "the entry ends with the last line");
        Check(!text.Contains("line 000000") && text.StartsWith("line "), "the entry starts at a whole line, the head is cut off");
        using var rd = new StreamReader(archive.GetEntry("README.txt")!.Open());
        Check(rd.ReadToEnd().Contains("last 5 MB"), "README says the file was cut");
    }

    // the report file
    string desktop = Path.Combine(logRoot, "Desktop");
    string saved = HealthExport.SaveReport(desktop, "REPORT " + homeDir, stamp);
    Check(Path.GetFileName(saved) == "Hell Harvest report 2026-11-25 1405.txt" && Path.GetDirectoryName(saved) == desktop, "the report is saved in the given folder under the dated name");
    Check(!File.ReadAllText(saved).Contains(homeDir, StringComparison.OrdinalIgnoreCase) && File.ReadAllText(saved).StartsWith("REPORT"), "the saved report is sanitized again");
    string saved2 = HealthExport.SaveReport(desktop, "second", stamp);
    Check(saved2 != saved && File.ReadAllText(saved).StartsWith("REPORT") && Path.GetFileName(saved2).Contains("(2)"), "the same minute never overwrites an earlier file");
}
finally
{
    try { Directory.Delete(logRoot, true); } catch (Exception ex) { Console.WriteLine("cleanup: " + ex.Message); }
}

string issue = HealthExport.IssueUrl("4.2.0", "Microsoft Windows 10.0.26300");
Check(HealthExport.IsAllowedIssueUrl(issue), "the issue link passes its own check");
Check(issue.StartsWith("https://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title="), "the issue link points at issues/new of the project");
var issueQuery = System.Web.HttpUtility.ParseQueryString(new Uri(issue).Query);
Check(issueQuery["title"] == "Проблема в Hell Harvest v4.2.0", "the title is the urlencoded Russian text with the version");
Check(issueQuery["body"]!.Contains("4.2.0") && issueQuery["body"]!.Contains("Windows 10.0.26300") && issueQuery["body"]!.Contains("Вставьте отчёт из буфера обмена"), "the body is the short template");
Check(issue.Length < 1500 && issueQuery.AllKeys.Length == 2, "the link is short: no report inside, only title and body");
foreach (var bad in new[]
{
    "http://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b",
    "https://github.com.evil.example/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b",
    "https://evil.example/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b",
    "https://github.com/Other/Repo/issues/new?title=a&body=b",
    "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new/choose?title=a&body=b",
    "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b&assignees=x",
    "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b#frag",
    "https://user:pw@github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b",
    "https://github.com:444/MortuisVMain/Twitch-Drops-Sentinel/issues/new?title=a&body=b",
    "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues?title=a&body=b",
    "javascript:alert(1)", "file:///C:/Windows/System32/calc.exe", "", null,
})
    Check(!HealthExport.IsAllowedIssueUrl(bad), "issue link refused: " + (bad ?? "null"));

Check(HealthLaunch.IsHealthUri("hellharvest://health") && HealthLaunch.IsHealthUri("hellharvest://health/") && HealthLaunch.IsHealthUri("HELLHARVEST://HEALTH"), "the toast address is recognized");
Check(!HealthLaunch.IsHealthUri("hellharvest://other") && !HealthLaunch.IsHealthUri("hellharvest://health/../x") && !HealthLaunch.IsHealthUri("https://health") && !HealthLaunch.IsHealthUri("--minimized") && !HealthLaunch.IsHealthUri(null), "any other argument is not the toast address");
Check(HealthLaunch.FindHealthArg(new[] { "--minimized", "hellharvest://health" }) == "hellharvest://health" && HealthLaunch.FindHealthArg(new[] { "--minimized" }) == null, "the toast address is found among the arguments");
var fake = new FakeProtocolStore();
Check(HealthLaunch.EnsureRegistered(fake, @"C:\Apps\Hell Harvest\TwitchDropsSentinel.exe"), "the first call registers the scheme");
Check(fake.Writes.All(w => w.Key == "hellharvest" || w.Key.StartsWith(@"hellharvest\")), "only keys under the app's own scheme are written");
Check(fake.Values[(@"hellharvest\shell\open\command", null)] == "\"C:\\Apps\\Hell Harvest\\TwitchDropsSentinel.exe\" \"%1\"" && fake.Values.ContainsKey(("hellharvest", "URL Protocol")), "the command opens this exe with the address; URL Protocol is set");
int writesBefore = fake.Writes.Count;
Check(!HealthLaunch.EnsureRegistered(fake, @"C:\Apps\Hell Harvest\TwitchDropsSentinel.exe") && fake.Writes.Count == writesBefore, "the second call changes nothing");
Check(HealthLaunch.EnsureRegistered(fake, @"D:\Moved\TwitchDropsSentinel.exe") && fake.Values[(@"hellharvest\shell\open\command", null)].Contains(@"D:\Moved"), "a moved copy takes the scheme over");
Check(!HealthLaunch.EnsureRegistered(fake, "relative.exe") && !HealthLaunch.EnsureRegistered(fake, ""), "a path that is not absolute is never registered");


// ---- review fixes: desktop fallback, partial zip, collisions, guard, reveal, sanitize parity, version cap ----
Check(HealthExport.DesktopFolder(@"C:\Users\x\Desktop", @"C:\Users\x", @"C:\App") == @"C:\Users\x\Desktop", "desktop: the system folder is used when it is a real path");
Check(HealthExport.DesktopFolder("", @"C:\Users\x", @"C:\App") == @"C:\Users\x\Desktop", "desktop: an empty system path falls back to the profile Desktop");
Check(HealthExport.DesktopFolder(null, @"C:\Users\x", @"C:\App") == @"C:\Users\x\Desktop", "desktop: a null system path falls back to the profile Desktop");
Check(HealthExport.DesktopFolder("relative\\dir", "", @"C:\App") == @"C:\App", "desktop: a relative path and no profile fall back to the app data folder");
Check(Path.IsPathRooted(HealthExport.DesktopFolder("", "", @"C:\App")) && Path.IsPathRooted(HealthExport.DesktopFolder("x", "y", @"C:\App")), "desktop: the result is never relative");

string rfRoot = Path.Combine(Path.GetTempPath(), "hh_rf_" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(rfRoot);
try
{
    string src1 = Path.Combine(rfRoot, "a.log");
    File.WriteAllText(src1, "x\n");
    string partial = Path.Combine(rfRoot, "partial.zip");
    bool threw = false;
    try { HealthExport.BuildLogZip(partial, "r", new[] { new LogSource("a.log", src1) }, null, stamp, "1", capBytes: -1); }
    catch (Exception) { threw = true; }
    Check(threw && !File.Exists(partial), "a failed build rethrows and leaves no partial zip");
    string foreign = Path.Combine(rfRoot, "foreign.zip");
    File.WriteAllText(foreign, "not mine");
    try { HealthExport.BuildLogZip(foreign, "r", new[] { new LogSource("a.log", src1) }, null, stamp, "1"); } catch (IOException) { }
    Check(File.ReadAllText(foreign) == "not mine", "a name that is already taken is never deleted by the cleanup");

    string zipName = HealthExport.LogsZipName(stamp);
    File.WriteAllText(Path.Combine(rfRoot, zipName), "keep me");
    var one = HealthExport.BuildLogZipUnique(rfRoot, zipName, "r", new[] { new LogSource("a.log", src1) }, null, stamp, "1");
    Check(Path.GetFileName(one.Path).Contains("(2)") && File.ReadAllText(Path.Combine(rfRoot, zipName)) == "keep me", "a taken zip name moves on to (2) and the old file is untouched");
    using (var lockedFile = new FileStream(Path.Combine(rfRoot, "Hell Harvest logs 2026-11-25 1405 (3).zip"), FileMode.Create, FileAccess.Write, FileShare.None))
    {
        var two = HealthExport.BuildLogZipUnique(rfRoot, zipName, "r", new[] { new LogSource("a.log", src1) }, null, stamp, "1");
        Check(Path.GetFileName(two.Path).Contains("(4)"), "a locked file with the next name is skipped, not an error");
    }
    string rep1 = HealthExport.SaveReport(rfRoot, "one", stamp);
    string rep2 = HealthExport.SaveReport(rfRoot, "two", stamp);
    Check(rep1 != rep2 && File.ReadAllText(rep1) == "one" && File.ReadAllText(rep2) == "two", "two saved reports in the same minute are two files");
}
finally
{
    try { Directory.Delete(rfRoot, true); } catch (Exception ex) { Console.WriteLine("cleanup: " + ex.Message); }
}

var guard = new HealthExport.ExportGuard();
var lease = guard.TryEnter("logs");
Check(lease != null && guard.TryEnter("logs") == null, "a second click on the same action is refused while it runs");
Check(guard.TryEnter("report") is { } other && other != null, "another action is not blocked");
lease!.Dispose();
Check(guard.TryEnter("logs") != null, "the action is available again after it finished");

bool revealThrew = false;
var logged = new List<string>();
bool revealed = HealthExport.TryReveal(_ => throw new InvalidOperationException("no explorer"), @"C:\x\y.zip", ex => logged.Add(ex.Message));
Check(!revealed && logged.Count == 1 && !revealThrew, "a reveal failure is logged and reported as false, never thrown");
Check(HealthExport.TryReveal(_ => { }, @"C:\x\y.zip", _ => { }), "a working reveal is true");

string longIssue = HealthExport.IssueUrl(new string('9', 200), "Windows");
var longQuery = System.Web.HttpUtility.ParseQueryString(new Uri(longIssue).Query);
Check(longQuery["title"] == "Проблема в Hell Harvest v" + new string('9', 32) && HealthExport.IsAllowedIssueUrl(longIssue), "the version in the issue link is cut to 32 characters");

string hHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
string hFwd = hHome.Replace('\\', '/');
string hJson = hHome.Replace("\\", "\\\\");
string fixture = string.Join("\n", new[]
{
    "2026-11-25 10:00:00 INFO Loading config from " + hHome + @"\AppData\x",
    "2026-11-25 10:00:01 DEBUG {\"path\": \"" + hJson + "\\\\AppData\"}",
    "2026-11-25 10:00:02 DEBUG cwd " + hFwd + "/AppData",
    "2026-11-25 10:00:03 INFO Notify user jane.doe@mail.example about a drop",
    "2026-11-25 10:00:04 INFO twitch auth_token=abcDEF123456 ok",
    "2026-11-25 10:00:05 DEBUG {\"refresh_token\": \"RRRR9999\", \"device_token\": \"DDDD7777\"}",
    "2026-11-25 10:00:06 INFO session user_id=987654321 userId: 246810",
    "2026-11-25 10:00:07 INFO {\"userId\": \"55512345\"}",
    "2026-11-25 10:00:08 INFO watching https://www.twitch.tv/streamer_name now",
    "2026-11-25 10:00:09 INFO opened https://www.twitch.tv/directory/game/Rust ok",
    "2026-11-25 10:00:10 DEBUG {\"username\": \"some_user\", \"x\": 1}",
    "2026-11-25 10:00:11 DEBUG steamLoginSecure=76561198012345678%7C%7CAAAABBBB; sessionid=0123456789abcdef",
    "2026-11-25 10:00:12 INFO login: mortuis_v oauth:abcd1234efgh",
});
string cleaned = HealthExport.SanitizeLog(fixture, null);
foreach (var secret in new[] { hHome, hFwd, hJson, "jane.doe", "abcDEF123456", "RRRR9999", "DDDD7777", "987654321", "246810", "55512345", "streamer_name", "some_user", "AAAABBBB", "0123456789abcdef", "abcd1234efgh", "mortuis_v", "76561198012345678" })
    Check(cleaned.IndexOf(secret, StringComparison.OrdinalIgnoreCase) < 0, "sentinel log fixture: '" + secret + "' is gone");
Check(cleaned.Contains("j***@mail.example") && cleaned.Contains("twitch.tv/s***") && cleaned.Contains("%USERPROFILE%"), "sentinel log fixture: email, channel name and profile are masked in place");
Check(cleaned.Contains("twitch.tv/directory/game/Rust") && cleaned.Contains("Loading config from") && cleaned.Contains("INFO watching"), "sentinel log fixture: ordinary text and non-user twitch pages stay");

// ---- BackendRestartPolicy: replays of the restart storm (pure, no process, no clock) ----
{
    var t0 = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
    DateTime At(double s) => t0.AddSeconds(s);

    // the storm: A starts slow, A crashes, B starts, 2 s later B is still starting and a failing check arrives
    var storm = new BackendRestartPolicy();
    Check(storm.OnHealthCheck(false, At(0)).Action == RestartAction.Start, "policy: nothing tracked and nothing answers starts once");
    Check(storm.OnHealthCheck(false, At(0.1)).Action == RestartAction.None, "policy: a second start while the first is in flight is refused");
    storm.OnStarted(100, At(0.2));
    Check(storm.OnHealthCheck(false, At(10)).Action == RestartAction.None, "policy: A is slow inside the grace period: nothing happens");
    Check(storm.OnExited(100, At(20), killedByUs: false).Action == RestartAction.Start, "policy: a genuine exit of the current process starts a new one");
    Check(storm.OnExited(100, At(20.1), killedByUs: false).Action == RestartAction.None, "policy: the same exit reported twice starts nothing more");
    storm.OnStarted(101, At(20.2));
    foreach (double s in new[] { 22, 24, 26, 28, 30 })
        Check(storm.OnHealthCheck(false, At(s)).Action == RestartAction.None, $"policy: B is still starting at +{s - 20} s: it is NOT killed");

    // exits of processes we killed or that are not the tracked one are ignored
    var ign = new BackendRestartPolicy();
    ign.OnHealthCheck(false, At(0)); ign.OnStarted(200, At(0));
    Check(ign.OnExited(999, At(5), killedByUs: false).Action == RestartAction.None && ign.TrackedPid == 200, "policy: the exit of an unknown process is ignored");
    Check(ign.OnExited(200, At(5), killedByUs: true).Action == RestartAction.None, "policy: the exit of a process we killed is ignored");

    // watchdog rule: grace 60 s, then 4 failed checks in a row = exactly one Kill+Start
    var wd = new BackendRestartPolicy();
    wd.OnHealthCheck(false, At(0)); wd.OnStarted(300, At(0));
    Check(Enumerable.Range(1, 10).All(i => wd.OnHealthCheck(false, At(i * 5)).Action == RestartAction.None), "policy: failed checks inside the 60 s grace never restart");
    var kinds = new List<RestartAction>();
    for (int i = 0; i < 4; i++) kinds.Add(wd.OnHealthCheck(false, At(61 + i * 4)).Action);
    Check(kinds.SequenceEqual(new[] { RestartAction.None, RestartAction.None, RestartAction.None, RestartAction.KillAndStart }), "policy: three failures wait, the fourth is one Kill+Start");
    Check(wd.OnHealthCheck(false, At(78)).Action == RestartAction.None, "policy: while that start is in flight nothing else starts");
    wd.OnStarted(301, At(78));
    Check(wd.OnExited(300, At(78.5), killedByUs: true).Action == RestartAction.None && wd.TrackedPid == 301, "policy: the exit of the killed process does not touch the new one");
    var okReset = new BackendRestartPolicy();
    okReset.OnHealthCheck(false, At(0)); okReset.OnStarted(400, At(0));
    for (int i = 0; i < 3; i++) okReset.OnHealthCheck(false, At(61 + i * 4));
    okReset.OnHealthCheck(true, At(75));
    Check(okReset.OnHealthCheck(false, At(79)).Action == RestartAction.None && okReset.OnHealthCheck(false, At(83)).Action == RestartAction.None && okReset.OnHealthCheck(false, At(87)).Action == RestartAction.None, "policy: one answer resets the failure count");

    // crash backoff: 3 quick crashes in a row = pause 60 s, then one retry; a long run resets the counter
    var crash = new BackendRestartPolicy();
    crash.OnHealthCheck(false, At(0));
    double now = 0;
    var results = new List<RestartDecision>();
    for (int pid = 1; pid <= 3; pid++)
    {
        crash.OnStarted(pid, At(now));
        now += 5;
        results.Add(crash.OnExited(pid, At(now), killedByUs: false));
    }
    Check(results[0].Action == RestartAction.Start && results[1].Action == RestartAction.Start, "policy: the first two quick crashes restart at once");
    Check(results[2].Action == RestartAction.Backoff && results[2].Until == At(75), "policy: the third quick crash backs off for 60 s");
    Check(crash.BackoffUntil == At(75), "policy: the backoff is visible for the diagnostics");
    Check(crash.OnHealthCheck(false, At(40)).Action == RestartAction.Backoff, "policy: during the pause a failed check starts nothing");
    var retry = crash.OnHealthCheck(false, At(76));
    Check(retry.Action == RestartAction.Start && retry.CleanStalePort, "policy: after the pause one retry starts (and may clear a stale python)");
    Check(crash.OnHealthCheck(false, At(76.5)).Action == RestartAction.None, "policy: the retry is single-flight too");
    crash.OnStarted(4, At(76.5));
    Check(crash.OnExited(4, At(80), killedByUs: false).Action == RestartAction.Backoff, "policy: a quick crash of the retry backs off again");

    var longRun = new BackendRestartPolicy();
    longRun.OnHealthCheck(false, At(0));
    longRun.OnStarted(1, At(0)); longRun.OnExited(1, At(5), false);
    longRun.OnStarted(2, At(5)); longRun.OnExited(2, At(10), false);
    longRun.OnStarted(3, At(10));
    Check(longRun.OnExited(3, At(100), false).Action == RestartAction.Start, "policy: a run that lived over 30 s restarts at once");
    longRun.OnStarted(4, At(100)); longRun.OnExited(4, At(105), false);
    longRun.OnStarted(5, At(105));
    Check(longRun.OnExited(5, At(110), false).Action == RestartAction.Start && longRun.BackoffUntil == null, "policy: a long run reset the counter, two quick crashes after it do not back off");

    var fail = new BackendRestartPolicy();
    fail.OnHealthCheck(false, At(0));
    fail.OnStartFailed(At(0)); fail.OnHealthCheck(false, At(4)); fail.OnStartFailed(At(4)); fail.OnHealthCheck(false, At(8));
    Check(fail.OnStartFailed(At(8)).Action == RestartAction.Backoff, "policy: a start that cannot even spawn backs off like a crash");

    var cold = new BackendRestartPolicy();
    Check(cold.OnHealthCheck(false, At(0)).CleanStalePort, "policy: the very first start may clear a stale python on the port");
    cold.OnStarted(1, At(0));
    Check(!cold.OnExited(1, At(100), false).CleanStalePort, "policy: a restart right after our own process never touches the port");
    Check(cold.OnHealthCheck(true, At(1)).Action == RestartAction.None, "policy: an answering service needs nothing");

    var diag = ServiceDiagnostics.Run(new DiagnosticsInput(28599, root, root, null, Array.Empty<DateTime>(), null, "t", false, DateTime.UtcNow.AddSeconds(30)));
    var diagRow = diag.Checks.First(c => c.Id == "restarts");
    Check(diagRow.Status == "fail" && diagRow.Detail.Contains("crashes at start"), "diagnostics: a crash backoff is a failing restarts row");
    var diagRu = ServiceDiagnostics.Run(new DiagnosticsInput(28599, root, root, null, Array.Empty<DateTime>(), null, "t", true, DateTime.UtcNow.AddSeconds(30)));
    Check(diagRu.Checks.First(c => c.Id == "restarts").Detail.Contains("Служба падает при запуске"), "diagnostics: the backoff row is also in Russian");
}

{
    // WebView2 158 renderer crashes (STATUS_ACCESS_VIOLATION): the page reloads itself, but a page that keeps crashing is not reloaded forever
    var t0 = new DateTime(2026, 11, 26, 8, 0, 0, DateTimeKind.Utc);
    var gate = new PageCrashGate();
    Check(gate.ShouldReload(t0), "page crash: the first crash reloads the page");
    Check(gate.ShouldReload(t0.AddMinutes(1)), "page crash: the second crash reloads the page");
    Check(gate.ShouldReload(t0.AddMinutes(2)), "page crash: the third crash reloads the page");
    Check(!gate.ShouldReload(t0.AddMinutes(3)), "page crash: a fourth crash within 5 minutes is not reloaded");
    Check(gate.ShouldReload(t0.AddMinutes(6.5)), "page crash: once older crashes leave the 5-minute window, reloads resume");
}

Console.WriteLine(failures == 0 ? "ALL SERVICE DIAGNOSTICS CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
return failures == 0 ? 0 : 1;

sealed class FakeProtocolStore : IProtocolStore
{
    public Dictionary<(string Key, string? Name), string> Values { get; } = new();
    public List<(string Key, string? Name)> Writes { get; } = new();
    public string? Get(string subKey, string? name) => Values.TryGetValue((subKey, name), out var v) ? v : null;
    public void Set(string subKey, string? name, string value) { Values[(subKey, name)] = value; Writes.Add((subKey, name)); }
}
