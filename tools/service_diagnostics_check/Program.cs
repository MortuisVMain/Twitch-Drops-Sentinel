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

Console.WriteLine(failures == 0 ? "ALL SERVICE DIAGNOSTICS CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
return failures == 0 ? 0 : 1;
