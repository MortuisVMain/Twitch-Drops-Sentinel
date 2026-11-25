using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace TwitchDropsSentinel
{
    /// <summary>One file that may go into the logs ZIP: the name inside the archive and where it lives.</summary>
    public sealed record LogSource(string EntryName, string Path);

    /// <summary>
    /// What the "For developer" section of the health center writes: the report as a file, the sanitized logs ZIP and the link to a new GitHub issue.
    /// The page only asks; names, folders and the address are all decided here.
    /// </summary>
    public static class HealthExport
    {
        public const string IssueBase = "https://github.com/MortuisVMain/Twitch-Drops-Sentinel/issues/new";
        public const long LogCapBytes = 5L * 1024 * 1024;
        private const int MaxVersionChars = 32;

        public static string ReportFileName(DateTime now) => $"Hell Harvest report {now:yyyy-MM-dd HHmm}.txt";

        public static string LogsZipName(DateTime now) => $"Hell Harvest logs {now:yyyy-MM-dd HHmm}.zip";

        /// <summary>
        /// The folder for the files the user asks for: the system Desktop when it is a real absolute path, else %USERPROFILE%\Desktop, else the app data folder.
        /// The result is never relative (an empty answer of GetFolderPath would otherwise put the files in the working folder).
        /// </summary>
        public static string DesktopFolder(string? system, string? profile, string appData)
        {
            if (!string.IsNullOrWhiteSpace(system) && Path.IsPathRooted(system)) return system;
            if (!string.IsNullOrWhiteSpace(profile) && Path.IsPathRooted(profile)) return Path.Combine(profile, "Desktop");
            return Path.GetFullPath(appData);
        }

        /// <summary>
        /// Creates a new file in dir under fileName, or " (2)", " (3)"... when the name is taken (also by a file another click just made or something holds open).
        /// Never overwrites and never opens an existing file.
        /// </summary>
        private static FileStream OpenNew(string dir, string fileName, out string path)
        {
            Directory.CreateDirectory(dir);
            string stem = Path.GetFileNameWithoutExtension(fileName), ext = Path.GetExtension(fileName);
            path = "";
            for (int n = 1; n <= 500; n++)
            {
                path = n == 1 ? Path.Combine(dir, fileName) : Path.Combine(dir, $"{stem} ({n}){ext}");
                try { return new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None); }
                catch (IOException) when (File.Exists(path)) { }
            }
            throw new IOException("No free file name for " + fileName + " in " + dir);
        }

        /// <summary>Runs the reveal (Explorer); a failure is logged and answered with false, never thrown: the file is already written.</summary>
        public static bool TryReveal(Action<string> reveal, string path, Action<Exception> log)
        {
            try { reveal(path); return true; }
            catch (Exception ex) { log(ex); return false; }
        }

        private static void DeletePartial(string path)
        {
            try { File.Delete(path); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { System.Diagnostics.Debug.WriteLine("HealthExport: partial file not deleted: " + ex.Message); }
        }

        private static readonly Regex AuthLine = new(@"\b(Authorization|Set-Cookie|Cookie)\s*:\s*[^\r\n]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex Bearer = new(@"\bBearer\s+[A-Za-z0-9._~+/=\-]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex Secret = new(@"(?<key>""?\b(?:(?:[A-Za-z0-9]+_)*token|client_secret|password|oauth|steamLoginSecure|sessionid)\b""?)(?<sep>\s*[:=]\s*)(?<q>""?)[^\s"",}&;]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex UserId = new(@"(?<key>""?\buser[ _]?id""?\s*[:=]\s*""?)[^\s"",}&;]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex LoginName = new(@"(?<key>""?\b(?:login|username)\b""?\s*[:=]\s*""?)(?<name>[^\s"",}&;]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex Email = new(@"\b(?<local>[A-Za-z0-9._%+\-]+)@(?<domain>[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,})\b", RegexOptions.Compiled);
        private static readonly Regex ChannelUrl = new(@"(?<key>\btwitch\.tv/)(?!(?:directory|activate|drops|settings|videos|popout|embed|downloads|jobs|p)\b)(?<name>[A-Za-z0-9_]{2,})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        /// <summary>
        /// For a log or a report that leaves the machine; the same coverage as the service's health.sanitize plus the Twitch names: the profile path in its three
        /// spellings (plain, JSON-doubled, forward slashes), Steam IDs, the token, auth headers, Bearer values, any *_token / password / steamLoginSecure /
        /// sessionid value, user ids, user names and logins (first letter and ***), channel names in twitch.tv/ links and e-mails (a***@domain).
        /// </summary>
        public static string SanitizeLog(string text, string? token = null)
        {
            if (string.IsNullOrEmpty(text)) return text;
            string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(profile))
                foreach (string spelling in new[] { profile.Replace("\\", "\\\\"), profile.Replace('\\', '/'), profile })
                    text = Regex.Replace(text, Regex.Escape(spelling), "%USERPROFILE%", RegexOptions.IgnoreCase);
            text = ServiceDiagnostics.Sanitize(text, token);
            text = AuthLine.Replace(text, "$1: [REDACTED]");
            text = Bearer.Replace(text, "Bearer [REDACTED]");
            text = Secret.Replace(text, m => m.Groups["key"].Value + m.Groups["sep"].Value + m.Groups["q"].Value + "[REDACTED]");
            text = UserId.Replace(text, m => m.Groups["key"].Value + "***");
            text = LoginName.Replace(text, m => m.Groups["key"].Value + m.Groups["name"].Value[..1] + "***");
            text = Email.Replace(text, m => m.Groups["local"].Value[..1] + "***@" + m.Groups["domain"].Value);
            text = ChannelUrl.Replace(text, m => m.Groups["key"].Value + m.Groups["name"].Value[..1] + "***");
            return text;
        }

        /// <summary>The only files the logs ZIP may hold besides the report and the README, with where they live.</summary>
        public static IReadOnlyList<LogSource> StandardSources(string projectRoot, string appDir) => new[]
        {
            new LogSource("sentinel_stdout.log", Path.Combine(projectRoot, "sentinel_stdout.log")),
            new LogSource("sentinel_stderr.log", Path.Combine(projectRoot, "sentinel_stderr.log")),
            new LogSource("core/sentinel_service.log", Path.Combine(projectRoot, "core", "sentinel_service.log")),
            new LogSource("core/sentinel_service.log.1", Path.Combine(projectRoot, "core", "sentinel_service.log.1")),
            new LogSource("desktop_errors.log", Path.Combine(appDir, "desktop_errors.log")),
            new LogSource("crash.log", Path.Combine(appDir, "crash.log")),
        };

        /// <summary>The last capBytes of a file, from a whole line, read so that a service that holds the file open for writing does not matter. Null when the file is missing.</summary>
        private static string? ReadTail(string path, long capBytes, out bool cut)
        {
            cut = false;
            if (!File.Exists(path)) return null;
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            long take = Math.Min(fs.Length, capBytes);
            fs.Seek(-take, SeekOrigin.End);
            var buf = new byte[take];
            int read = 0;
            while (read < buf.Length)
            {
                int n = fs.Read(buf, read, buf.Length - read);
                if (n == 0) break;
                read += n;
            }
            string text = Encoding.UTF8.GetString(buf, 0, read);
            if (fs.Length > capBytes)
            {
                cut = true;
                int nl = text.IndexOf('\n');
                text = nl >= 0 ? text[(nl + 1)..] : "";
            }
            return text;
        }

        /// <summary>Fills an already created (exclusive) zip file. Any failure deletes the partial file and is rethrown.</summary>
        private static IReadOnlyList<string> WriteZip(FileStream fs, string zipPath, string report, IReadOnlyList<LogSource> sources, string? token, DateTime now, string appVersion, long capBytes)
        {
            var included = new List<string>();
            var notes = new List<string>();
            try
            {
                using (fs)
                using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
                {
                    void Add(string name, string content)
                    {
                        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
                        writer.Write(content);
                    }
                    foreach (var source in sources)
                    {
                        try
                        {
                            string? text = ReadTail(source.Path, capBytes, out bool cut);
                            if (text == null) { notes.Add(source.EntryName + ": not found"); continue; }
                            Add(source.EntryName, SanitizeLog(text, token));
                            included.Add(source.EntryName);
                            if (cut) notes.Add(source.EntryName + ": only the last 5 MB is included");
                        }
                        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                        {
                            notes.Add(source.EntryName + ": could not be read (" + ex.Message + ")");
                        }
                    }
                    Add("report.txt", SanitizeLog(report, token));
                    included.Add("report.txt");
                    var readme = new StringBuilder();
                    readme.AppendLine("Hell Harvest logs");
                    readme.AppendLine("App version: " + (string.IsNullOrEmpty(appVersion) ? "unknown" : appVersion));
                    readme.AppendLine("Created: " + now.ToString("yyyy-MM-dd HH:mm"));
                    readme.AppendLine();
                    readme.AppendLine("Copies of the files below were cleaned before they were put here: the profile path, Steam IDs, tokens, cookies, passwords, e-mails and Twitch names are hidden.");
                    readme.AppendLine();
                    readme.AppendLine("Included:");
                    foreach (var name in included) readme.AppendLine("  " + name);
                    if (notes.Count > 0)
                    {
                        readme.AppendLine();
                        readme.AppendLine("Notes:");
                        foreach (var note in notes) readme.AppendLine("  " + note);
                    }
                    Add("README.txt", readme.ToString());
                }
            }
            catch (Exception)
            {
                DeletePartial(zipPath);
                throw;
            }
            return included;
        }

        /// <summary>
        /// Writes a ZIP at zipPath (which must not exist yet) with sanitized copies of the sources that exist (each cut to its last 5 MB), the sanitized report and a
        /// README that lists what is in it. A missing or unreadable source is skipped and named in the README; any other failure leaves no partial file.
        /// Returns the entry names that were included.
        /// </summary>
        public static IReadOnlyList<string> BuildLogZip(string zipPath, string report, IReadOnlyList<LogSource> sources, string? token, DateTime now, string appVersion, long capBytes = LogCapBytes)
        {
            string? folder = Path.GetDirectoryName(zipPath);
            if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
            var fs = new FileStream(zipPath, FileMode.CreateNew, FileAccess.Write, FileShare.None); // a taken name throws here and nothing is deleted
            return WriteZip(fs, zipPath, report, sources, token, now, appVersion, capBytes);
        }

        /// <summary>The same in dir under fileName, or the next free " (n)" name; returns the path that was written.</summary>
        public static (string Path, IReadOnlyList<string> Included) BuildLogZipUnique(string dir, string fileName, string report, IReadOnlyList<LogSource> sources, string? token, DateTime now, string appVersion, long capBytes = LogCapBytes)
        {
            var fs = OpenNew(dir, fileName, out string path);
            return (path, WriteZip(fs, path, report, sources, token, now, appVersion, capBytes));
        }

        /// <summary>Writes the sanitized report as the dated file in dir (created when missing, next free name when taken) and returns its path.</summary>
        public static string SaveReport(string dir, string report, DateTime now, string? token = null)
        {
            var fs = OpenNew(dir, ReportFileName(now), out string path);
            try
            {
                using (fs)
                using (var writer = new StreamWriter(fs, new UTF8Encoding(false)))
                    writer.Write(SanitizeLog(report, token));
            }
            catch (Exception)
            {
                DeletePartial(path);
                throw;
            }
            return path;
        }

        /// <summary>One run per action at a time: a second click while the first still works is refused instead of racing it.</summary>
        public sealed class ExportGuard
        {
            private readonly HashSet<string> _running = new();

            public IDisposable? TryEnter(string kind)
            {
                lock (_running) { if (!_running.Add(kind)) return null; }
                return new Lease(this, kind);
            }

            private sealed class Lease : IDisposable
            {
                private readonly ExportGuard _owner;
                private readonly string _kind;
                private int _done;
                public Lease(ExportGuard owner, string kind) { _owner = owner; _kind = kind; }
                public void Dispose()
                {
                    if (Interlocked.Exchange(ref _done, 1) == 0) lock (_owner._running) _owner._running.Remove(_kind);
                }
            }
        }

        /// <summary>The "report a problem" address: a new issue with a title and a short template. The report itself goes through the clipboard, never the address.</summary>
        public static string IssueUrl(string appVersion, string windows)
        {
            string version = string.IsNullOrWhiteSpace(appVersion) ? "unknown" : appVersion.Trim();
            if (version.Length > MaxVersionChars) version = version[..MaxVersionChars];
            string title = "Проблема в Hell Harvest v" + version;
            string body = "Версия: " + version + "\nWindows: " + windows + "\n\nОпишите, что пошло не так.\n\nВставьте отчёт из буфера обмена ниже:\n";
            return IssueBase + "?title=" + Uri.EscapeDataString(title) + "&body=" + Uri.EscapeDataString(body);
        }

        /// <summary>Only the project's new-issue page with exactly a title and a body: https, github.com, default port, no credentials, no fragment.</summary>
        public static bool IsAllowedIssueUrl(string? url)
        {
            if (string.IsNullOrEmpty(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttps || uri.Host != "github.com" || !uri.IsDefaultPort || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Fragment)) return false;
            if (uri.AbsolutePath != "/MortuisVMain/Twitch-Drops-Sentinel/issues/new") return false;
            var keys = System.Web.HttpUtility.ParseQueryString(uri.Query).AllKeys;
            return keys.Length == 2 && keys.Contains("title") && keys.Contains("body");
        }
    }

    /// <summary>Where the registry scheme lives; a fake stands in for it in checks, so a check never touches the real registry.</summary>
    public interface IProtocolStore
    {
        string? Get(string subKey, string? name);
        void Set(string subKey, string? name, string value);
    }

    /// <summary>HKCU\Software\Classes: per-user, no admin rights, the same place the app's other per-user settings live (autostart is HKCU too).</summary>
    public sealed class CurrentUserProtocolStore : IProtocolStore
    {
        private const string Root = @"Software\Classes\";

        public string? Get(string subKey, string? name)
        {
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Root + subKey);
            return key?.GetValue(name) as string;
        }

        public void Set(string subKey, string? name, string value)
        {
            using var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(Root + subKey);
            key.SetValue(name, value);
        }
    }

    /// <summary>
    /// A click on the service's toast opens the health center. The toast carries hellharvest://health; the app registers that scheme for the current user
    /// when it starts, so Windows starts this exe with the address (or, with the app already running, the second start hands it over and exits).
    /// </summary>
    public static class HealthLaunch
    {
        public const string Scheme = "hellharvest";
        public const string Uri = "hellharvest://health";

        public static bool IsHealthUri(string? arg)
        {
            if (string.IsNullOrEmpty(arg) || !System.Uri.TryCreate(arg, UriKind.Absolute, out var uri)) return false;
            return uri.Scheme == Scheme && uri.Host == "health" && (uri.AbsolutePath == "/" || uri.AbsolutePath == "") && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment);
        }

        public static string? FindHealthArg(string[]? args) => args?.FirstOrDefault(IsHealthUri);

        /// <summary>Registers (or repoints) the scheme to exePath; false when it was already right or the path is not absolute. Only keys under the scheme itself are written.</summary>
        public static bool EnsureRegistered(IProtocolStore store, string exePath)
        {
            if (string.IsNullOrWhiteSpace(exePath) || !Path.IsPathRooted(exePath) || exePath.Contains('"')) return false;
            string command = "\"" + exePath + "\" \"%1\"";
            string commandKey = Scheme + @"\shell\open\command";
            if (store.Get(commandKey, null) == command && store.Get(Scheme, "URL Protocol") != null) return false;
            store.Set(Scheme, null, "URL:Hell Harvest");
            store.Set(Scheme, "URL Protocol", "");
            store.Set(commandKey, null, command);
            return true;
        }
    }
}
