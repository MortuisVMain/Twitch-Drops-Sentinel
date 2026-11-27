namespace TwitchDropsSentinel;

/// <summary>Collapses a burst of Move events into one window-state save: due once the last Move is older than the delay.</summary>
public sealed class WindowSaveDebounce
{
    private readonly TimeSpan _delay;
    private DateTime _lastTouchUtc;

    public WindowSaveDebounce(TimeSpan delay) => _delay = delay;

    public bool Pending { get; private set; }

    public void Touch(DateTime nowUtc)
    {
        _lastTouchUtc = nowUtc;
        Pending = true;
    }

    /// <summary>True once (and clears the pending flag) when the burst has been quiet for the delay.</summary>
    public bool IsDue(DateTime nowUtc)
    {
        if (!Pending || nowUtc - _lastTouchUtc < _delay) return false;
        Pending = false;
        return true;
    }

    /// <summary>For close paths: true when a save was pending and must happen now.</summary>
    public bool Flush()
    {
        bool was = Pending;
        Pending = false;
        return was;
    }
}
