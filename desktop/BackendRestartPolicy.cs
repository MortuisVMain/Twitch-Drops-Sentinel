namespace TwitchDropsSentinel
{
    public enum RestartAction { None, Start, KillAndStart, Backoff }

    /// <summary>What the host should do now. Until is the end of a pause (Backoff); CleanStalePort asks to clear a stale python from the port before the start.</summary>
    public sealed record RestartDecision(RestartAction Action, string Reason, DateTime? Until = null, bool CleanStalePort = false);

    /// <summary>
    /// The one owner of "should the service process be started or restarted". Pure: no WinForms, no Process, no clock (every event carries its time).
    /// The host feeds it events and only executes the decisions on the UI thread, so two code paths can never start two services.
    /// A genuine exit of the tracked process starts a new one; a failing health check never kills a running process before the grace period
    /// and several misses; three quick crashes in a row pause the restarts, because each start begins the Twitch sign-in over with a new code.
    /// </summary>
    public sealed class BackendRestartPolicy
    {
        public static readonly TimeSpan StartGrace = TimeSpan.FromSeconds(60);
        public const int FailuresBeforeRestart = 4;
        public static readonly TimeSpan QuickCrashWindow = TimeSpan.FromSeconds(30);
        public const int QuickCrashesBeforeBackoff = 3;
        public static readonly TimeSpan BackoffPause = TimeSpan.FromSeconds(60);

        private readonly object _gate = new();
        private int? _trackedPid;
        private DateTime _startedAt = DateTime.MinValue;
        private bool _startInFlight;
        private bool _everStarted;
        private int _failures;
        private int _quickCrashes;
        private DateTime? _backoffUntil;

        /// <summary>PID of the process the host started and still considers current.</summary>
        public int? TrackedPid { get { lock (_gate) return _trackedPid; } }

        /// <summary>End of the current crash pause, or null when the service is not crashing in a loop.</summary>
        public DateTime? BackoffUntil { get { lock (_gate) return _backoffUntil; } }

        private static RestartDecision Hold(string reason) => new(RestartAction.None, reason);

        /// <summary>The service answered (ok) or did not. A tracked process is restarted only after the grace period and several misses in a row.</summary>
        public RestartDecision OnHealthCheck(bool ok, DateTime at)
        {
            lock (_gate)
            {
                if (ok)
                {
                    _failures = 0;
                    if (_trackedPid != null && at - _startedAt >= QuickCrashWindow) _quickCrashes = 0; // it lived past the window: the crash streak is over
                    return Hold("the service answers");
                }
                if (_startInFlight) return Hold("a start is already in flight");
                if (_backoffUntil is { } until && at < until) return new RestartDecision(RestartAction.Backoff, "the service crashes at start; paused", until);
                if (_trackedPid == null)
                {
                    bool afterPause = _backoffUntil != null;
                    _backoffUntil = null;
                    return BeginStart(RestartAction.Start, afterPause ? "retry after the crash pause" : "nothing is tracked and nothing answers", cleanStale: !_everStarted || afterPause);
                }
                if (at - _startedAt < StartGrace) return Hold("the process is still inside its start grace period");
                if (++_failures < FailuresBeforeRestart) return Hold($"missed check {_failures} of {FailuresBeforeRestart}");
                _failures = 0;
                _trackedPid = null; // the old process is ours to kill: its exit is not a "current" exit any more
                return BeginStart(RestartAction.KillAndStart, $"{FailuresBeforeRestart} failed checks in a row after the grace period", cleanStale: false);
            }
        }

        /// <summary>The host started the process the last Start/KillAndStart decision asked for.</summary>
        public void OnStarted(int pid, DateTime at)
        {
            lock (_gate)
            {
                _trackedPid = pid;
                _startedAt = at;
                _startInFlight = false;
                _everStarted = true;
                _failures = 0;
            }
        }

        /// <summary>The process could not even be spawned: counted like a crash so that it cannot spin.</summary>
        public RestartDecision OnStartFailed(DateTime at)
        {
            lock (_gate)
            {
                _startInFlight = false;
                _trackedPid = null;
                return CountCrash(quick: true, at, "the service could not be started", restartNow: false);
            }
        }

        /// <summary>A process exited. Exits of processes we killed and of any process that is not the current one are ignored.</summary>
        public RestartDecision OnExited(int pid, DateTime at, bool killedByUs)
        {
            lock (_gate)
            {
                if (killedByUs) return Hold("the process was closed by the host");
                if (_trackedPid != pid) return Hold("not the current process");
                _trackedPid = null;
                bool quick = at - _startedAt < QuickCrashWindow;
                return CountCrash(quick, at, "the service process exited", restartNow: true);
            }
        }

        private RestartDecision CountCrash(bool quick, DateTime at, string what, bool restartNow)
        {
            _quickCrashes = quick ? _quickCrashes + 1 : 0;
            if (_quickCrashes >= QuickCrashesBeforeBackoff)
            {
                _backoffUntil = at + BackoffPause;
                return new RestartDecision(RestartAction.Backoff, $"{what} {_quickCrashes} times within {QuickCrashWindow.TotalSeconds:0} s of its start", _backoffUntil);
            }
            _backoffUntil = null;
            if (_startInFlight) return Hold("a start is already in flight");
            if (!restartNow) return Hold($"{what}; the next check retries");
            return BeginStart(RestartAction.Start, what, cleanStale: false);
        }

        private RestartDecision BeginStart(RestartAction action, string reason, bool cleanStale)
        {
            _startInFlight = true;
            return new RestartDecision(action, reason, CleanStalePort: cleanStale);
        }
    }
}
