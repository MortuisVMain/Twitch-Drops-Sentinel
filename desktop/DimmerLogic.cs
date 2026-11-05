namespace TwitchDropsSentinel;

/// <summary>
/// Smooths brightness writes per monitor: a newer value for the same monitor replaces the waiting one,
/// values for different monitors never cancel each other. The key "master" (as in SET_BRIGHTNESS) replaces every waiting write.
/// A value posted while a master is waiting is applied strictly after it, whatever order the timers fire in.
/// A monitor stays pending until its write has finished plus a settle time (DDC reports the old value for a while).
/// Hardware access and time are injected.
/// </summary>
public sealed class BrightnessDebouncer
{
    public const string MasterKey = "master";
    public static readonly TimeSpan DebounceWindow = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan SettleTime = TimeSpan.FromMilliseconds(500);

    private sealed class Entry
    {
        public readonly CancellationTokenSource Cts = new();
        public readonly TaskCompletionSource Applied = new(); // done when the write ran, was cancelled or failed
    }

    private readonly Func<TimeSpan, CancellationToken, Task> _wait;
    private readonly Func<string, int, Task> _apply;
    private readonly Action<Exception> _onError;
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _pending = new();

    public BrightnessDebouncer(Func<TimeSpan, CancellationToken, Task> wait, Func<string, int, Task> apply, Action<Exception> onError)
    {
        _wait = wait;
        _apply = apply;
        _onError = onError;
    }

    public void Post(string monitorId, int level)
    {
        var entry = new Entry();
        Entry? master = null;
        lock (_gate)
        {
            if (monitorId == MasterKey)
                CancelAllLocked();
            else
            {
                if (_pending.TryGetValue(monitorId, out var old))
                    old.Cts.Cancel();
                _pending.TryGetValue(MasterKey, out master);
            }
            _pending[monitorId] = entry;
        }
        _ = RunAsync(monitorId, level, entry, master);
    }

    /// <summary>True while a write for this monitor (or a master write) waits for its window, is being applied or settles.</summary>
    public bool IsPending(string monitorId)
    {
        lock (_gate)
            return _pending.ContainsKey(monitorId) || _pending.ContainsKey(MasterKey);
    }

    public void CancelAll()
    {
        lock (_gate)
            CancelAllLocked();
    }

    private void CancelAllLocked()
    {
        foreach (var entry in _pending.Values)
            entry.Cts.Cancel();
        _pending.Clear();
    }

    // Each run owns its source and disposes it when it ends; others only Cancel() it.
    private async Task RunAsync(string monitorId, int level, Entry entry, Entry? master)
    {
        var token = entry.Cts.Token;
        try
        {
            try
            {
                await _wait(DebounceWindow, token).ConfigureAwait(false);
                if (master != null)
                    await master.Applied.Task.ConfigureAwait(false); // never before the master that was posted earlier
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                ReportError(ex);
                return;
            }
            if (token.IsCancellationRequested) return;
            try
            {
                await _apply(monitorId, level).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                ReportError(ex);
            }
            finally
            {
                entry.Applied.TrySetResult();
            }
            try
            {
                await _wait(SettleTime, token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
            }
            catch (Exception ex)
            {
                ReportError(ex);
            }
        }
        finally
        {
            entry.Applied.TrySetResult();
            lock (_gate)
            {
                if (_pending.TryGetValue(monitorId, out var current) && ReferenceEquals(current, entry))
                    _pending.Remove(monitorId);
            }
            entry.Cts.Dispose();
        }
    }

    private void ReportError(Exception ex)
    {
        try { _onError(ex); } catch { /* the error sink must never stop the next write */ }
    }
}

/// <summary>Remembers the sound state only on the way into a blackout, so a repeated blackout cannot overwrite it.</summary>
public sealed class BlackoutMuteMemory
{
    private readonly object _gate = new();
    private bool _inBlackout;
    private bool _wasMuted;

    /// <summary>A failed read throws and leaves the memory untouched: that is not an entry into a blackout.</summary>
    public void Enter(Func<bool> isMuted, Action mute)
    {
        lock (_gate)
        {
            if (_inBlackout) return;
            bool muted = isMuted();
            _wasMuted = muted;
            _inBlackout = true;
            mute();
        }
    }

    /// <summary>Returns the sound only when the blackout muted it, i.e. it was not muted before.</summary>
    public void Exit(Action unmute)
    {
        lock (_gate)
        {
            if (!_inBlackout) return;
            _inBlackout = false;
            if (!_wasMuted) unmute();
        }
    }
}

public static class BrightnessReading
{
    /// <summary>
    /// The brightness to show for a monitor and the cache entry to keep.
    /// A normal read keeps the cache (the optimistic value of the last command);
    /// an explicit poll takes the hardware value unless a write is pending; a failed read (null) never replaces a known value.
    /// </summary>
    public static int Resolve(IDictionary<string, int> cache, string id, int? hardware, int fallback, bool explicitRefresh, bool writePending)
    {
        if (!cache.TryGetValue(id, out int known))
        {
            int first = hardware ?? fallback;
            cache[id] = first;
            return first;
        }
        if (explicitRefresh && hardware.HasValue && !writePending)
        {
            cache[id] = hardware.Value;
            return hardware.Value;
        }
        return known;
    }
}

public static class MonitorIds
{
    /// <summary>
    /// The real id for what the page sends: "master" stays, "disp-primary"/"0" and "disp-secondary"/"1" or any in-range index
    /// become the id at that position, anything else is taken as it is. One monitor must have one key.
    /// </summary>
    public static string Resolve(string raw, IReadOnlyList<string> realIds)
    {
        if (raw == BrightnessDebouncer.MasterKey) return raw;
        if (raw == "disp-primary") return realIds.Count > 0 ? realIds[0] : raw;
        if (raw == "disp-secondary") return realIds.Count > 1 ? realIds[1] : raw;
        if (int.TryParse(raw, out int index) && index >= 0 && index < realIds.Count) return realIds[index];
        return raw;
    }
}

/// <summary>
/// Decides which address from the page may be handed to the shell. Links come from campaign data and
/// third-party pages, and ShellExecute runs any scheme (file:, ms-msdt:, search-ms:, ...), so only absolute
/// http and https with a host pass. Text with surrounding blanks or control characters is refused, not trimmed.
/// </summary>
public static class ExternalLinkPolicy
{
    public static bool TryGetOpenable(string? raw, out string uri)
    {
        uri = "";
        if (string.IsNullOrEmpty(raw) || raw.Any(c => char.IsWhiteSpace(c) || char.IsControl(c))) return false;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed)) return false;
        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps) return false;
        if (string.IsNullOrEmpty(parsed.Host)) return false;
        uri = parsed.AbsoluteUri;
        return true;
    }
}

/// <summary>The only origin the window may show and accept messages from: the virtual host that serves the UI files.</summary>
public static class AppOriginPolicy
{
    public const string Host = "app.sentinel";

    /// <summary>True for an https address on exactly app.sentinel (default port, no user info). Everything else, lookalikes included, is foreign.</summary>
    public static bool IsAppUri(string? raw)
    {
        if (string.IsNullOrEmpty(raw) || raw.Any(c => char.IsWhiteSpace(c) || char.IsControl(c))) return false;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed)) return false;
        return parsed.Scheme == Uri.UriSchemeHttps
            && parsed.Host == Host
            && parsed.IsDefaultPort
            && string.IsNullOrEmpty(parsed.UserInfo);
    }
}
