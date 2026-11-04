namespace TwitchDropsSentinel;

/// <summary>
/// Smooths brightness writes per monitor: a newer value for the same monitor replaces the waiting one,
/// values for different monitors never cancel each other. The key "master" (as in SET_BRIGHTNESS) replaces every waiting write.
/// A value posted after a master is applied after it. Hardware access and time are injected.
/// </summary>
public sealed class BrightnessDebouncer
{
    public const string MasterKey = "master";

    private readonly Func<CancellationToken, Task> _wait;
    private readonly Action<string, int> _apply;
    private readonly Action<Exception> _onError;
    private readonly object _gate = new();
    private readonly Dictionary<string, CancellationTokenSource> _pending = new();

    public BrightnessDebouncer(Func<CancellationToken, Task> wait, Action<string, int> apply, Action<Exception> onError)
    {
        _wait = wait;
        _apply = apply;
        _onError = onError;
    }

    public void Post(string monitorId, int level)
    {
        var cts = new CancellationTokenSource();
        lock (_gate)
        {
            if (monitorId == MasterKey)
                CancelAllLocked();
            else if (_pending.TryGetValue(monitorId, out var old))
                old.Cancel();
            _pending[monitorId] = cts;
        }
        _ = RunAsync(monitorId, level, cts);
    }

    /// <summary>True while a write for this monitor (or a master write) waits for its window or is being applied.</summary>
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
        foreach (var cts in _pending.Values)
            cts.Cancel();
        _pending.Clear();
    }

    // Each run owns its source and disposes it when it ends; others only Cancel() it.
    private async Task RunAsync(string monitorId, int level, CancellationTokenSource cts)
    {
        try
        {
            try
            {
                await _wait(cts.Token).ConfigureAwait(false);
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
            if (cts.IsCancellationRequested) return;
            try
            {
                _apply(monitorId, level);
            }
            catch (Exception ex)
            {
                ReportError(ex);
            }
        }
        finally
        {
            lock (_gate)
            {
                if (_pending.TryGetValue(monitorId, out var current) && ReferenceEquals(current, cts))
                    _pending.Remove(monitorId);
            }
            cts.Dispose();
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
    private bool _inBlackout;
    private bool _wasMuted;

    /// <summary>A failed read throws and leaves the memory untouched: that is not an entry into a blackout.</summary>
    public void Enter(Func<bool> isMuted, Action mute)
    {
        if (_inBlackout) return;
        bool muted = isMuted();
        _wasMuted = muted;
        _inBlackout = true;
        mute();
    }

    /// <summary>Returns the sound only when the blackout muted it, i.e. it was not muted before.</summary>
    public void Exit(Action unmute)
    {
        if (!_inBlackout) return;
        _inBlackout = false;
        if (!_wasMuted) unmute();
    }
}

public static class BrightnessReading
{
    /// <summary>
    /// The brightness to show for a monitor and the cache entry to keep.
    /// A normal read keeps the cache (the optimistic value of the last command);
    /// an explicit poll takes the hardware value unless a write is pending; a failed read (null) never replaces a known value.
    /// </summary>
    public static int Resolve(Dictionary<string, int> cache, string id, int? hardware, int fallback, bool explicitRefresh, bool writePending)
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
