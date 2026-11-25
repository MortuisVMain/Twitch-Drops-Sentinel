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

Console.WriteLine(failures == 0 ? "ALL SERVICE DIAGNOSTICS CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
return failures == 0 ? 0 : 1;
