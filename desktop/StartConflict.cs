using System.ComponentModel;
using System.Text.RegularExpressions;

namespace TwitchDropsSentinel
{
    public sealed record RunningCopy(int Pid, string ExePath, DateTime StartTime);

    public enum StartConflictOutcome { WakeExisting, StartThisCopy }

    public enum CloseOutcome { AlreadyGone, ClosedGracefully, Killed, NotThatProcess }

    /// <summary>The few things the close logic needs from a process, so the decision is checked without a second copy of the app.</summary>
    public interface IProcessHandle
    {
        bool HasExited { get; }
        DateTime StartTime { get; }
        string? ExePath { get; }
        /// <summary>Asks the process to close; false when there was nobody to ask.</summary>
        bool RequestClose();
        bool WaitForExit(TimeSpan timeout);
        void KillTree();
    }

    /// <summary>
    /// The start was refused because the single-instance mutex is taken. If the owner is an older copy from another folder,
    /// the user may close it and start this one; anything else keeps the old behaviour (wake the running copy).
    /// No window or process API here: the callers pass them in, so the decision is checked without a second copy.
    /// </summary>
    public static class StartConflict
    {
        public const string ExeName = "TwitchDropsSentinel.exe";
        public static readonly TimeSpan CloseGrace = TimeSpan.FromSeconds(10);
        public static readonly TimeSpan MutexWait = TimeSpan.FromSeconds(10);

        private static readonly Regex VersionPattern = new(@"__version__\s*=\s*[""']([^""']+)[""']", RegexOptions.Compiled);
        private static readonly Regex KnownVersionPattern = new(@"^\s*\d+(\.\d+)*([-+][0-9A-Za-z.+-]*)?\s*$", RegexOptions.Compiled);

        public static string? ReadVersion(string dir)
        {
            try
            {
                string file = Path.Combine(dir, "core", "version.py");
                if (!File.Exists(file)) return null;
                var match = VersionPattern.Match(File.ReadAllText(file));
                return match.Success ? match.Groups[1].Value : null;
            }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }

        /// <summary>A dotted number such as 3.10.0, optionally with a suffix (-beta). Anything else ("latest", "") is not a version we can compare.</summary>
        public static bool IsKnownVersion(string? version) => version != null && KnownVersionPattern.IsMatch(version);

        /// <summary>Numeric comparison of dotted versions (3.7.0 &lt; 3.10.0); a suffix like -beta is ignored, a missing part is 0.</summary>
        public static int CompareVersions(string a, string b)
        {
            int[] pa = Parts(a), pb = Parts(b);
            for (int i = 0; i < Math.Max(pa.Length, pb.Length); i++)
            {
                int x = i < pa.Length ? pa[i] : 0, y = i < pb.Length ? pb[i] : 0;
                if (x != y) return x < y ? -1 : 1;
            }
            return 0;
        }

        private static int[] Parts(string version) =>
            Regex.Matches(version.Split('-', '+')[0], @"\d+").Select(m => int.TryParse(m.Value, out int n) ? n : 0).ToArray();

        /// <summary>The app's own language setting (core/settings.json) wins; without one the system language decides.</summary>
        public static bool IsRussian(string dir, string systemLanguage)
        {
            try
            {
                string file = Path.Combine(dir, "core", "settings.json");
                if (File.Exists(file))
                {
                    var match = Regex.Match(File.ReadAllText(file), @"""language""\s*:\s*""([^""]*)""");
                    if (match.Success && match.Groups[1].Value.Length > 0)
                        return match.Groups[1].Value.StartsWith("Рус", StringComparison.OrdinalIgnoreCase);
                }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            return systemLanguage.Equals("ru", StringComparison.OrdinalIgnoreCase);
        }

        public static string DialogText(string? version, string dir, bool russian) =>
            DialogText(new[] { (version, dir) }, russian);

        /// <summary>One line per older copy; the question is the same for one copy or several.</summary>
        public static string DialogText(IReadOnlyList<(string? Version, string Dir)> copies, bool russian)
        {
            var lines = copies.Select(c => russian
                ? (c.Version == null ? $"Запущена другая копия из {c.Dir}." : $"Запущена другая копия v{c.Version} из {c.Dir}.")
                : (c.Version == null ? $"Another copy is running from {c.Dir}." : $"Another copy, v{c.Version}, is running from {c.Dir}."));
            string question = copies.Count > 1
                ? (russian ? "Закрыть их и запустить эту?" : "Close them and start this one?")
                : (russian ? "Закрыть её и запустить эту?" : "Close it and start this one?");
            return string.Join("\n", lines) + "\n\n" + question;
        }

        /// <summary>
        /// Same folder, whatever the spelling: full path, case-insensitive, no trailing separator. Short 8.3 names and junctions
        /// are not resolved here (the Python side uses realpath), so a copy reached through one counts as another folder:
        /// the worst case is one extra question, never a copy closed by mistake.
        /// </summary>
        public static string Normalize(string path) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(path)).ToUpperInvariant();

        /// <summary>
        /// Decides what a refused start does. Only copies with a known version older than ours are offered for closing, and only when
        /// no other copy (newer, equal or of unknown version) runs: that one might own the mutex, so the closing would free nothing.
        /// askReplace(older copies) shows the question once; closeCopy(copy) closes one; waitForMutex() is true once this process owns the mutex.
        /// </summary>
        public static StartConflictOutcome Resolve(string ownDir, string ownVersion, int ownPid, IEnumerable<RunningCopy> running,
            Func<string, string?> readVersion, Func<IReadOnlyList<(string? Version, string Dir)>, bool> askReplace, Action<RunningCopy> closeCopy,
            Func<bool> waitForMutex)
        {
            if (!IsKnownVersion(ownVersion)) return StartConflictOutcome.WakeExisting;
            var older = new List<(RunningCopy Copy, string Version, string Dir)>();
            bool anyOther = false;
            foreach (var copy in running)
            {
                if (copy.Pid == ownPid || !Path.GetFileName(copy.ExePath).Equals(ExeName, StringComparison.OrdinalIgnoreCase)) continue;
                string? dir = Path.GetDirectoryName(copy.ExePath);
                if (dir == null || Normalize(dir) == Normalize(ownDir)) continue;
                string? version = readVersion(dir);
                if (IsKnownVersion(version) && CompareVersions(version!, ownVersion) < 0) older.Add((copy, version!, dir));
                else anyOther = true;
            }
            if (older.Count == 0 || anyOther) return StartConflictOutcome.WakeExisting;
            if (!askReplace(older.Select(o => ((string?)o.Version, o.Dir)).ToList())) return StartConflictOutcome.WakeExisting;
            foreach (var o in older) closeCopy(o.Copy);
            return waitForMutex() ? StartConflictOutcome.StartThisCopy : StartConflictOutcome.WakeExisting;
        }

        /// <summary>true: the same process we found; false: the pid went to another process; null: it has exited.</summary>
        private static bool? Verify(RunningCopy copy, IProcessHandle process)
        {
            try
            {
                if (process.HasExited) return null;
                if (process.StartTime != copy.StartTime) return false;
                string? exe = process.ExePath;
                return exe != null && Normalize(exe) == Normalize(copy.ExePath);
            }
            catch (InvalidOperationException) { return null; }
            catch (Win32Exception) { return false; }
        }

        /// <summary>
        /// Closes the copy we found, after checking that the process is still it (start time, exe path). A polite close first; when the
        /// copy is still there after the grace time, its whole process tree is killed, after checking once more. Every path is logged.
        /// </summary>
        public static CloseOutcome CloseVerified(RunningCopy copy, IProcessHandle process, TimeSpan grace, Action<string> log)
        {
            var state = Verify(copy, process);
            if (state == null) { log($"pid {copy.Pid} has already exited; nothing to close"); return CloseOutcome.AlreadyGone; }
            if (state == false) { log($"pid {copy.Pid} is no longer the copy at {copy.ExePath}; left alone"); return CloseOutcome.NotThatProcess; }
            log($"pid {copy.Pid}: asking the copy to close (WM_CLOSE to its windows)");
            process.RequestClose();
            if (process.WaitForExit(grace)) { log($"pid {copy.Pid}: the copy closed by itself"); return CloseOutcome.ClosedGracefully; }
            state = Verify(copy, process);
            if (state == null) { log($"pid {copy.Pid}: the copy exited"); return CloseOutcome.ClosedGracefully; }
            if (state == false) { log($"pid {copy.Pid} is no longer the copy at {copy.ExePath}; not killed"); return CloseOutcome.NotThatProcess; }
            log($"pid {copy.Pid}: still running after {grace.TotalSeconds:0} s; killing its process tree");
            process.KillTree();
            return CloseOutcome.Killed;
        }

        /// <summary>Waits for the mutex of a copy that is closing. A mutex abandoned by a killed owner counts as taken over.</summary>
        public static bool AcquireAfter(Mutex mutex, TimeSpan timeout)
        {
            try { return mutex.WaitOne(timeout); }
            catch (AbandonedMutexException) { return true; }
        }
    }
}
