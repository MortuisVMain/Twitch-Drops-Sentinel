namespace TwitchDropsSentinel
{
    /// <summary>
    /// A restart starts the new exe while the old one still holds the single-instance mutex (Environment.Exit skips the release).
    /// The child carries a marker and waits for that mutex instead of mistaking the dying window for a running copy.
    /// </summary>
    public static class RestartHandoff
    {
        public const string RestartedArg = "--restarted";
        public const int MutexWaitMs = 12_000;

        public static bool IsRestarted(string[]? args) =>
            args != null && args.Any(a => a.Equals(RestartedArg, StringComparison.OrdinalIgnoreCase));

        public static bool ShouldWaitForMutex(bool isNewInstance, string[]? args) => !isNewInstance && IsRestarted(args);

        public static string RestartArguments() => RestartedArg;

        /// <summary>True when the mutex is ours: free, or abandoned by a parent that exited without releasing. False on timeout.</summary>
        public static bool TryAcquire(Mutex mutex, int timeoutMs)
        {
            try { return mutex.WaitOne(timeoutMs); }
            catch (AbandonedMutexException) { return true; }
        }
    }

    /// <summary>How long the host waits for the service to exit before killing it.</summary>
    public static class BackendShutdownWait
    {
        // core/steam_idle/controller.py SHUTDOWN_BUDGET_SECONDS is 19 s; the margin covers process teardown.
        public static readonly TimeSpan Graceful = TimeSpan.FromSeconds(21);
        public static readonly TimeSpan Short = TimeSpan.FromMilliseconds(2500);

        /// <summary>The service accepted /api/shutdown and is closing itself in order: give it the full budget. Otherwise it may be hung: short wait.</summary>
        public static TimeSpan For(bool shutdownAccepted) => shutdownAccepted ? Graceful : Short;
    }
}
