// Runs the service diagnostics against a port and prints every check, then checks the pure parsers.
// Usage: dotnet run --project tools/service_diagnostics_check -- [port] [--no-token]   (default port 28599; read-only, kills nothing)
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

Console.WriteLine(failures == 0 ? "ALL SERVICE DIAGNOSTICS CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
return failures == 0 ? 0 : 1;
