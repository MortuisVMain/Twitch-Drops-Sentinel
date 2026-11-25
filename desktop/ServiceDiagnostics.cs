using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace TwitchDropsSentinel
{
    /// <summary>One line of the check. Status is "ok", "warn" or "fail"; Action is a button the page may show; Area groups the lines in the panel ("service" for what the host sees).</summary>
    public sealed record DiagnosticCheck(string Id, string Status, string Title, string Detail, string Advice, string? Action = null, int? Pid = null, string Area = "service");

    public sealed record DiagnosticsResult(IReadOnlyList<DiagnosticCheck> Checks, string Report);

    /// <summary>Where the host finds the service script, the install root and the python that runs it.</summary>
    public sealed record BackendLocation(string? ScriptPath, string ProjectRoot, string PythonExe, bool PythonFound);

    public sealed record DiagnosticsInput(int Port, string BaseDir, string CurrentDir, Process? Tracked, IReadOnlyList<DateTime> Starts,
        string? Token, string AppVersion, bool Russian);

    /// <summary>Thread-safe list of the moments the host started the service process.</summary>
    public sealed class BackendStartLog
    {
        private readonly object _gate = new();
        private readonly List<DateTime> _starts = new();

        public void Record() => Record(DateTime.UtcNow);

        public void Record(DateTime utc)
        {
            lock (_gate)
            {
                _starts.Add(utc);
                if (_starts.Count > 50) _starts.RemoveRange(0, _starts.Count - 50);
            }
        }

        public IReadOnlyList<DateTime> Snapshot()
        {
            lock (_gate) return _starts.ToArray();
        }
    }

    /// <summary>
    /// What the host can tell when the local service does not answer: process, port, API, restart loop, folder, python, reserved ports.
    /// No WinForms here: the same code runs in the app and in tools/service_diagnostics_check.
    /// </summary>
    public static class ServiceDiagnostics
    {
        public const int SlowApiMs = 1500;
        public const int ApiTimeoutMs = 5000;
        public const int RestartWindowMinutes = 5;
        public const int RestartLoopCount = 3;
        public const int LogTailLines = 15;
        public const int HealthTimeoutMs = 12000;
        public const int HealthMaxBytes = 1024 * 1024;
        private static readonly Regex SafeIdPattern = new("^[a-z0-9_]{1,40}$", RegexOptions.Compiled);
        private static readonly string[] HealthAreas = { "twitch", "steam", "giveaways", "network", "updates", "settings", "system" };

        private static string L(bool ru, string r, string e) => ru ? r : e;

        /// <summary>Check ids are plain names: anything else (markup, capitals, over 40 characters) becomes "service_check".</summary>
        public static string SafeId(string id) => SafeIdPattern.IsMatch(id) ? id : "service_check";

        // ---- backend location (shared with MainForm.EnsurePythonBackendRunning) ----

        /// <summary>The same search the host always used: portable python next to the exe, in portable_runtime, then installed system pythons, then PATH.</summary>
        public static BackendLocation ResolveBackend(string baseDir, string currentDir)
        {
            string scriptPath = Path.Combine(baseDir, "core", "sentinel_service.py");
            if (!File.Exists(scriptPath)) scriptPath = Path.Combine(baseDir, "..", "core", "sentinel_service.py");
            if (!File.Exists(scriptPath)) scriptPath = Path.Combine(baseDir, "..", "..", "..", "..", "core", "sentinel_service.py");
            if (!File.Exists(scriptPath)) scriptPath = Path.Combine(currentDir, "core", "sentinel_service.py");

            bool scriptFound = File.Exists(scriptPath);
            string coreDir = scriptFound ? Path.GetDirectoryName(scriptPath) ?? "" : Path.Combine(baseDir, "core");
            string projectRoot = Directory.GetParent(coreDir)?.FullName ?? coreDir;

            string python = Path.Combine(baseDir, "python", "python.exe");
            if (!File.Exists(python)) python = Path.Combine(baseDir, "portable_runtime", "python", "python.exe");
            if (!File.Exists(python)) python = Path.Combine(baseDir, "..", "..", "..", "..", "portable_runtime", "python", "python.exe");
            if (!File.Exists(python))
            {
                string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string[] system =
                {
                    @"C:\Program Files\Python314\python.exe",
                    @"C:\Program Files\Python313\python.exe",
                    @"C:\Program Files\Python312\python.exe",
                    @"C:\Program Files\Python311\python.exe",
                    @"C:\Program Files\Python310\python.exe",
                    Path.Combine(local, @"Programs\Python\Python312\python.exe"),
                    Path.Combine(local, @"Programs\Python\Python311\python.exe"),
                };
                foreach (string candidate in system)
                {
                    if (File.Exists(candidate)) { python = candidate; break; }
                }
            }
            bool found = File.Exists(python);
            return new BackendLocation(scriptFound ? scriptPath : null, projectRoot, found ? python : "python", found);
        }

        // ---- pure parsers (checked without a machine) ----

        /// <summary>Numeric rows of "netsh int ipv4 show excludedportrange"; the headers may be in any language.</summary>
        public static IReadOnlyList<(int Start, int End)> ParseExcludedRanges(string output)
        {
            var list = new List<(int, int)>();
            foreach (string line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var m = Regex.Match(line, @"^\s*(\d{1,5})\s+(\d{1,5})\s*\*?\s*$");
                if (m.Success) list.Add((int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)));
            }
            return list;
        }

        public static (int Start, int End)? RangeContaining(IReadOnlyList<(int Start, int End)> ranges, int port)
        {
            foreach (var r in ranges)
            {
                if (port >= r.Start && port <= r.End) return r;
            }
            return null;
        }

        /// <summary>PIDs listening on the TCP port, from "netstat -ano -p tcp" (the state word is localized on some systems, so a zero foreign port is the test).</summary>
        public static IReadOnlyList<int> ParseListeningPids(string netstat, int port)
        {
            var pids = new List<int>();
            foreach (string line in netstat.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Trim().Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5 || !parts[0].Equals("TCP", StringComparison.OrdinalIgnoreCase)) continue;
                if (!parts[1].EndsWith(":" + port) || !parts[2].EndsWith(":0")) continue;
                if (int.TryParse(parts[^1], out int pid) && pid > 0 && !pids.Contains(pid)) pids.Add(pid);
            }
            return pids;
        }

        public static string TailLines(string text, int count)
        {
            var lines = text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            return string.Join(Environment.NewLine, lines.Skip(Math.Max(0, lines.Length - count)));
        }

        /// <summary>Profile path to %USERPROFILE%, Steam IDs masked, the token removed.</summary>
        public static string Sanitize(string text, string? token = null)
        {
            if (string.IsNullOrEmpty(text)) return text;
            string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(profile))
                text = Regex.Replace(text, Regex.Escape(profile), "%USERPROFILE%", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, @"\b7656\d{13}\b", m => m.Value[..4] + new string('*', 13));
            if (!string.IsNullOrEmpty(token) && token.Length >= 8) text = text.Replace(token, "***");
            return text;
        }

        public static string BuildReport(IReadOnlyList<DiagnosticCheck> checks, string appVersion, string? token = null)
        {
            var sb = new StringBuilder();
            sb.AppendLine("Hell Harvest service diagnostics");
            sb.AppendLine("App version: " + (string.IsNullOrEmpty(appVersion) ? "unknown" : appVersion));
            sb.AppendLine("Windows: " + RuntimeInformation.OSDescription + " (" + Environment.OSVersion.Version + ")");
            sb.AppendLine("Time (UTC): " + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"));
            sb.AppendLine();
            foreach (var c in checks)
            {
                string tag = c.Status == "ok" ? "[OK]  " : c.Status == "warn" ? "[WARN]" : "[FAIL]";
                sb.AppendLine(c.Area == "service" ? $"{tag} {c.Title}" : $"{tag} ({c.Area}) {c.Title}");
                if (c.Detail.Length > 0) sb.AppendLine("       " + c.Detail.Replace("\n", "\n       "));
                if (c.Advice.Length > 0) sb.AppendLine("       -> " + c.Advice.Replace("\n", "\n          "));
            }
            return Sanitize(sb.ToString(), token);
        }

        public static string ToJson(DiagnosticsResult result, string? token = null)
        {
            var checks = result.Checks.Select(c => new
            {
                id = SafeId(c.Id), ok = c.Status == "ok", status = c.Status,
                title = Sanitize(c.Title, token), detail = Sanitize(c.Detail, token), advice = Sanitize(c.Advice, token),
                action = c.Action, pid = c.Pid, area = c.Area,
            });
            return JsonSerializer.Serialize(new { type = "DIAGNOSTICS_RESULT", checks, report = result.Report });
        }

        // ---- the service's own checks (GET /api/v1/health) ----

        private static DiagnosticCheck HealthFallback(bool ru, string reason) =>
            new("health", "warn", L(ru, "Проверки службы недоступны", "Service checks unavailable"), reason,
                L(ru, "Нажмите «Проверить снова» или перезапустите сервис. Проверки выше выполнены без помощи службы.", "Press Check again or restart the service. The checks above did not need the service."));

        /// <summary>The health answer as check rows; anything unusable gives the one warning row instead. Pure, so it is checked without a service.</summary>
        public static IReadOnlyList<DiagnosticCheck> ParseHealthResponse(string? json, bool ru)
        {
            if (string.IsNullOrWhiteSpace(json)) return new[] { HealthFallback(ru, L(ru, "Служба вернула пустой ответ.", "The service returned an empty answer.")) };
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Object || !doc.RootElement.TryGetProperty("checks", out var list) || list.ValueKind != JsonValueKind.Array)
                    return new[] { HealthFallback(ru, L(ru, "Неожиданный ответ службы.", "Unexpected answer of the service.")) };
                var rows = new List<DiagnosticCheck>();
                foreach (var el in list.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object || Text(el, "id") is not { Length: > 0 } id) continue;
                    string status = Text(el, "status");
                    string area = Text(el, "area");
                    rows.Add(new DiagnosticCheck(SafeId(id), status is "ok" or "warn" or "fail" ? status : "warn", Text(el, "title"), Text(el, "detail"), Text(el, "advice"),
                        Area: Array.IndexOf(HealthAreas, area) >= 0 ? area : "service"));
                }
                return rows.Count > 0 ? rows : new[] { HealthFallback(ru, L(ru, "Служба не вернула ни одной проверки.", "The service returned no checks.")) };
            }
            catch (JsonException ex)
            {
                return new[] { HealthFallback(ru, L(ru, "Ответ службы не разобран: ", "The service answer could not be read: ") + ex.Message) };
            }
        }

        private static string Text(JsonElement el, string name) =>
            el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";

        /// <summary>Asks the running service for its checks (token header, 12 s). A service that cannot answer gives the one warning row.</summary>
        public static IReadOnlyList<DiagnosticCheck> FetchHealth(int port, string? token, bool ru)
        {
            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(HealthTimeoutMs), MaxResponseContentBufferSize = HealthMaxBytes };
                if (!string.IsNullOrEmpty(token)) client.DefaultRequestHeaders.Add(LocalApiToken.HeaderName, token);
                using var res = client.GetAsync($"http://127.0.0.1:{port}/api/v1/health?lang={(ru ? "ru" : "en")}").GetAwaiter().GetResult();
                if (!res.IsSuccessStatusCode)
                    return new[] { HealthFallback(ru, L(ru, $"Служба ответила HTTP {(int)res.StatusCode}.", $"The service answered HTTP {(int)res.StatusCode}.")) };
                return ParseHealthResponse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult(), ru);
            }
            catch (TaskCanceledException)
            {
                return new[] { HealthFallback(ru, L(ru, $"Служба не ответила за {HealthTimeoutMs / 1000} с.", $"The service did not answer within {HealthTimeoutMs / 1000} s.")) };
            }
            catch (HttpRequestException ex)
            {
                return new[] { HealthFallback(ru, L(ru, "Не удалось связаться со службой: ", "Could not reach the service: ") + ex.Message) };
            }
            catch (Exception ex) when (ex is not OutOfMemoryException)
            {
                // whatever else goes wrong here (a bad header value, a reset stream) must not lose the host checks already collected
                Debug.WriteLine("ServiceDiagnostics: health fetch failed: " + ex);
                return new[] { HealthFallback(ru, L(ru, "Проверки службы не выполнены: ", "The service checks failed: ") + ex.Message) };
            }
        }

        // ---- the run ----

        public static DiagnosticsResult Run(DiagnosticsInput input)
        {
            bool ru = input.Russian;
            var backend = ResolveBackend(input.BaseDir, input.CurrentDir);
            var checks = new List<DiagnosticCheck>
            {
                CheckProcess(input, backend),
                CheckPort(input, backend),
                CheckApi(input),
                CheckRestarts(input),
                CheckFolder(backend, ru),
                CheckPython(backend, ru),
                CheckExcludedPorts(input.Port, ru),
            };
            // the service's own read-only checks, only when it answers at all (a slow answer still counts)
            if (checks.First(c => c.Id == "api").Status != "fail") checks.AddRange(FetchHealth(input.Port, input.Token, ru));
            return new DiagnosticsResult(checks, BuildReport(checks, input.AppVersion, input.Token));
        }

        private static DiagnosticCheck CheckProcess(DiagnosticsInput input, BackendLocation backend)
        {
            bool ru = input.Russian;
            string title = L(ru, "Процесс службы", "Service process");
            var p = input.Tracked;
            bool? exited = null;
            int exitCode = 0;
            int pid = 0;
            try
            {
                if (p != null)
                {
                    pid = p.Id;
                    exited = p.HasExited;
                    if (exited == true) exitCode = p.ExitCode;
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
            {
                Debug.WriteLine("ServiceDiagnostics: tracked process unreadable: " + ex.Message);
                exited = null;
                p = null;
            }
            if (p != null && exited == false)
                return new("process", "ok", title, L(ru, $"Процесс службы запущен (PID {pid}).", $"The service process is running (PID {pid})."), "");

            string tail = ReadLogTail(Path.Combine(backend.ProjectRoot, "sentinel_stderr.log"));
            string logPart = tail.Length > 0 ? "\n" + L(ru, "Последние строки sentinel_stderr.log:", "Last lines of sentinel_stderr.log:") + "\n" + tail : "";
            if (p != null)
                return new("process", "fail", title,
                    L(ru, $"Процесс службы завершился (код выхода {exitCode}).", $"The service process exited (exit code {exitCode}).") + logPart,
                    L(ru, "Нажмите «Перезапустить сервис». Если это повторяется, отправьте отчёт разработчику.", "Press Restart service. If it keeps happening, send the report to the developer."));
            return new("process", "warn", title,
                L(ru, "В этом запуске приложение ещё не запускало службу.", "The app has not started the service in this run.") + logPart,
                L(ru, "Подождите несколько секунд или нажмите «Перезапустить сервис».", "Wait a few seconds or press Restart service."));
        }

        private static DiagnosticCheck CheckPort(DiagnosticsInput input, BackendLocation backend)
        {
            bool ru = input.Russian;
            string title = L(ru, $"Порт {input.Port}", $"Port {input.Port}");
            bool listening;
            try
            {
                listening = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(ep => ep.Port == input.Port);
            }
            catch (NetworkInformationException ex)
            {
                Debug.WriteLine("ServiceDiagnostics: listeners unreadable: " + ex.Message);
                return new("port", "warn", title, L(ru, "Не удалось узнать, кто слушает порт: ", "Could not read who listens on the port: ") + ex.Message, "");
            }
            if (!listening)
                return new("port", "warn", title, L(ru, "Порт свободен: никто его не слушает.", "The port is free: nobody listens on it."),
                    L(ru, "Служба не запущена. Нажмите «Перезапустить сервис».", "The service is not running. Press Restart service."));

            var pids = FindListeners(input.Port);
            if (pids.Count == 0)
                return new("port", "warn", title, L(ru, "Порт занят, но владельца определить не удалось.", "The port is taken but the owner could not be found."),
                    L(ru, "Перезагрузите компьютер или завершите программу, занявшую порт.", "Restart the PC or close the program that holds the port."));

            int pid = pids[0];
            int? trackedId = null;
            try { if (input.Tracked is { HasExited: false } t) trackedId = t.Id; }
            catch (InvalidOperationException ex) { Debug.WriteLine("ServiceDiagnostics: tracked pid unreadable: " + ex.Message); }

            string name = "?";
            string? path = null;
            try
            {
                using var proc = Process.GetProcessById(pid);
                name = proc.ProcessName;
                try { path = proc.MainModule?.FileName; }
                catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
                { Debug.WriteLine($"ServiceDiagnostics: path of pid {pid} unreadable: {ex.Message}"); }
            }
            catch (ArgumentException ex) { Debug.WriteLine($"ServiceDiagnostics: pid {pid} is gone: {ex.Message}"); }

            if (name == "?")
                return new("port", "warn", title, L(ru, $"Порт слушает процесс PID {pid}, но он уже недоступен (мог только что завершиться).", $"The port is held by PID {pid}, which is no longer readable (it may have just exited)."),
                    L(ru, "Проверьте ещё раз через несколько секунд.", "Check again in a few seconds."));

            string who = $"{name}.exe, PID {pid}" + (path != null ? $", {path}" : "");
            if (trackedId == pid)
                return new("port", "ok", title, L(ru, $"Порт слушает служба этой копии ({who}).", $"The port is held by this copy's service ({who})."), "");

            if (name.StartsWith("python", StringComparison.OrdinalIgnoreCase))
            {
                bool inOurFolder = path != null && path.StartsWith(backend.ProjectRoot, StringComparison.OrdinalIgnoreCase);
                if (!inOurFolder)
                    return new("port", "fail", title,
                        L(ru, $"Порт занят службой другой копии: {who}.", $"The port is held by another copy's service: {who}."),
                        L(ru, "Закройте старую копию, затем нажмите «Перезапустить сервис».", "Close the old copy, then press Restart service."),
                        "close_other", pid);
                return new("port", "warn", title,
                    L(ru, $"Порт слушает python из этой папки, но не тот процесс, который запустило приложение: {who}.", $"The port is held by a python from this folder that this app did not start: {who}."),
                    L(ru, "Нажмите «Перезапустить сервис».", "Press Restart service."), "close_other", pid);
            }
            return new("port", "fail", title,
                L(ru, $"Порт занят чужой программой: {who}.", $"The port is held by a foreign program: {who}."),
                L(ru, $"Закройте программу «{name}» и нажмите «Перезапустить сервис».", $"Close \"{name}\" and press Restart service."));
        }

        private static DiagnosticCheck CheckApi(DiagnosticsInput input)
        {
            bool ru = input.Russian;
            string title = L(ru, "Ответ службы (/api/state)", "Service answer (/api/state)");
            var sw = Stopwatch.StartNew();
            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(ApiTimeoutMs) };
                if (!string.IsNullOrEmpty(input.Token)) client.DefaultRequestHeaders.Add(LocalApiToken.HeaderName, input.Token);
                using var res = client.GetAsync($"http://127.0.0.1:{input.Port}/api/state").GetAwaiter().GetResult();
                long ms = sw.ElapsedMilliseconds;
                int code = (int)res.StatusCode;
                if (code == 401 || code == 403)
                    return new("api", "fail", title,
                        L(ru, $"На порту отвечает служба с другим ключом доступа (HTTP {code}, {ms} мс). Скорее всего это другая копия приложения.", $"A service with a different access key answers on the port (HTTP {code}, {ms} ms). Most likely another copy of the app."),
                        L(ru, "Закройте другую копию Hell Harvest (в том числе из трея) и перезапустите сервис.", "Close the other copy of Hell Harvest (also from the tray) and restart the service."));
                if (!res.IsSuccessStatusCode)
                    return new("api", "fail", title, L(ru, $"Служба ответила ошибкой HTTP {code} за {ms} мс.", $"The service answered with HTTP {code} in {ms} ms."),
                        L(ru, "Нажмите «Перезапустить сервис».", "Press Restart service."));
                if (ms > SlowApiMs)
                    return new("api", "warn", title, L(ru, $"Служба отвечает медленно: {ms} мс.", $"The service is slow: {ms} ms."),
                        L(ru, "Подождите: на медленном ПК первый запуск идёт дольше. Если не проходит, перезапустите сервис.", "Wait: the first start is slower on a slow PC. If it persists, restart the service."));
                return new("api", "ok", title, L(ru, $"Служба отвечает за {ms} мс.", $"The service answers in {ms} ms."), "");
            }
            catch (TaskCanceledException)
            {
                return new("api", "fail", title, L(ru, $"Служба не ответила за {ApiTimeoutMs / 1000} с (таймаут).", $"The service did not answer within {ApiTimeoutMs / 1000} s (timeout)."),
                    L(ru, "Служба зависла или перегружена. Нажмите «Перезапустить сервис».", "The service is stuck or overloaded. Press Restart service."));
            }
            catch (HttpRequestException ex)
            {
                bool refused = ex.InnerException is SocketException { SocketErrorCode: SocketError.ConnectionRefused };
                return new("api", "fail", title,
                    refused ? L(ru, "Соединение отклонено: на порту никто не отвечает.", "Connection refused: nobody answers on the port.")
                            : L(ru, "Не удалось подключиться: ", "Could not connect: ") + ex.Message,
                    L(ru, "Нажмите «Перезапустить сервис».", "Press Restart service."));
            }
        }

        private static DiagnosticCheck CheckRestarts(DiagnosticsInput input)
        {
            bool ru = input.Russian;
            string title = L(ru, "Перезапуски службы", "Service restarts");
            var cutoff = DateTime.UtcNow.AddMinutes(-RestartWindowMinutes);
            int n = input.Starts.Count(t => t >= cutoff);
            if (n >= RestartLoopCount)
                return new("restarts", "fail", title,
                    L(ru, $"Служба запускалась {n} раз за последние {RestartWindowMinutes} минут: она перезапускается по кругу.", $"The service started {n} times in the last {RestartWindowMinutes} minutes: it restarts in a loop."),
                    L(ru, "Посмотрите последние строки журнала ошибок выше и откройте папку логов.", "See the last error-log lines above and open the logs folder."));
            return new("restarts", "ok", title, L(ru, $"Запусков за {RestartWindowMinutes} минут: {n}.", $"Starts in {RestartWindowMinutes} minutes: {n}."), "");
        }

        private static DiagnosticCheck CheckFolder(BackendLocation backend, bool ru)
        {
            string title = L(ru, "Папка установки", "Install folder");
            string probe = Path.Combine(backend.ProjectRoot, ".hh_write_test_" + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                File.WriteAllText(probe, "x");
                File.Delete(probe);
                return new("folder", "ok", title, L(ru, $"В папку можно писать: {backend.ProjectRoot}", $"The folder is writable: {backend.ProjectRoot}"), "");
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                Debug.WriteLine("ServiceDiagnostics: install folder not writable: " + ex.Message);
                return new("folder", "fail", title,
                    L(ru, $"В папку нельзя писать: {backend.ProjectRoot} ({ex.Message})", $"The folder is not writable: {backend.ProjectRoot} ({ex.Message})"),
                    L(ru, @"Переустановите приложение в папку по умолчанию (%LOCALAPPDATA%\Programs\Hell Harvest) и не ставьте его в Program Files.", @"Reinstall into the default folder (%LOCALAPPDATA%\Programs\Hell Harvest) and do not install into Program Files."));
            }
        }

        private static DiagnosticCheck CheckPython(BackendLocation backend, bool ru)
        {
            string title = L(ru, "Python службы", "Service python");
            if (backend.ScriptPath == null)
                return new("python", "fail", title, L(ru, "Не найден файл core\\sentinel_service.py.", "core\\sentinel_service.py was not found."),
                    L(ru, "Файлы приложения повреждены или удалены антивирусом: добавьте папку в исключения и переустановите.", "App files are damaged or removed by an antivirus: add the folder to exclusions and reinstall."));
            if (backend.PythonFound)
                return new("python", "ok", title, backend.PythonExe, "");
            string? onPath = FindOnPath("python.exe");
            if (onPath != null)
                return new("python", "warn", title, L(ru, $"Встроенного python нет, будет использован python из PATH: {onPath}", $"No bundled python; python from PATH will be used: {onPath}"),
                    L(ru, "Лучше переустановить приложение: встроенный python надёжнее.", "Better reinstall the app: the bundled python is more reliable."));
            return new("python", "fail", title, L(ru, "python.exe не найден.", "python.exe was not found."),
                L(ru, "Возможно, его удалил антивирус: добавьте папку приложения в исключения антивируса и переустановите.", "An antivirus may have removed it: add the app folder to the antivirus exclusions and reinstall."));
        }

        private static DiagnosticCheck CheckExcludedPorts(int port, bool ru)
        {
            string title = L(ru, "Зарезервированные порты Windows", "Windows reserved ports");
            string output = RunTool("netsh", "int ipv4 show excludedportrange protocol=tcp", out string? error);
            if (error != null)
                return new("excluded", "warn", title, L(ru, "Не удалось прочитать список: ", "Could not read the list: ") + error, "");
            var hit = RangeContaining(ParseExcludedRanges(output), port);
            if (hit == null)
                return new("excluded", "ok", title, L(ru, $"Порт {port} не зарезервирован.", $"Port {port} is not reserved."), "");
            return new("excluded", "fail", title,
                L(ru, $"Порт {port} попал в зарезервированный Windows диапазон {hit.Value.Start}-{hit.Value.End}, служба не может его занять.", $"Port {port} is inside the Windows reserved range {hit.Value.Start}-{hit.Value.End}; the service cannot bind it."),
                L(ru, "Откройте командную строку от имени администратора и выполните по очереди: net stop winnat, затем net start winnat. После этого перезапустите сервис.", "Open a command prompt as administrator and run: net stop winnat, then net start winnat. Then restart the service."));
        }

        // ---- process helpers ----

        public static IReadOnlyList<int> FindListeners(int port)
        {
            string output = RunTool("netstat", "-ano -p tcp", out string? error);
            if (error != null) { Debug.WriteLine("ServiceDiagnostics: netstat failed: " + error); return Array.Empty<int>(); }
            return ParseListeningPids(output, port);
        }

        /// <summary>Kills a foreign python that holds the port. Refuses anything else, and never the tracked process of this copy.</summary>
        public static bool TryCloseOther(int port, int pid, int? trackedPid, out string error)
        {
            error = "";
            if (trackedPid == pid) { error = "that is this copy's own service"; return false; }
            if (!FindListeners(port).Contains(pid)) { error = "that process does not listen on the port"; return false; }
            try
            {
                using var proc = Process.GetProcessById(pid);
                if (!proc.ProcessName.StartsWith("python", StringComparison.OrdinalIgnoreCase)) { error = "that process is not python"; return false; }
                proc.Kill(entireProcessTree: true);
                proc.WaitForExit(2000);
                return true;
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
            {
                Debug.WriteLine($"ServiceDiagnostics: close pid {pid} failed: {ex.Message}");
                error = ex.Message;
                return false;
            }
        }

        private static string ReadLogTail(string file)
        {
            try
            {
                if (!File.Exists(file)) return "";
                using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                long take = Math.Min(fs.Length, 16 * 1024);
                fs.Seek(-take, SeekOrigin.End);
                var buf = new byte[take];
                int read = fs.Read(buf, 0, buf.Length);
                return Sanitize(TailLines(Encoding.UTF8.GetString(buf, 0, read), LogTailLines));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                Debug.WriteLine("ServiceDiagnostics: log unreadable: " + ex.Message);
                return "";
            }
        }

        private static string? FindOnPath(string exe)
        {
            foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    string candidate = Path.Combine(dir.Trim().Trim('"'), exe);
                    if (File.Exists(candidate)) return candidate;
                }
                catch (ArgumentException ex) { Debug.WriteLine("ServiceDiagnostics: bad PATH entry: " + ex.Message); }
            }
            return null;
        }

        private static string RunTool(string file, string args, out string? error)
        {
            error = null;
            try
            {
                var psi = new ProcessStartInfo { FileName = file, Arguments = args, CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true };
                using var proc = Process.Start(psi);
                if (proc == null) { error = file + " did not start"; return ""; }
                // Read asynchronously: a blocking ReadToEnd would outlive the timeout if the tool hangs
                var output = proc.StandardOutput.ReadToEndAsync();
                if (!output.Wait(5000) || !proc.WaitForExit(5000))
                {
                    try { proc.Kill(); } catch (InvalidOperationException ex) { Debug.WriteLine($"ServiceDiagnostics: {file} already exited: {ex.Message}"); }
                    error = file + " timed out";
                    return "";
                }
                return output.Result;
            }
            catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
            {
                Debug.WriteLine($"ServiceDiagnostics: {file} failed: {ex.Message}");
                error = ex.Message;
                return "";
            }
        }
    }
}
