namespace TwitchDropsSentinel
{
    /// <summary>
    /// Decides whether a crashed window page is reloaded. A crash is reloaded at once (the user saw a browser error page and had to press "Refresh"),
    /// but at most MaxReloads times per Window, so a page that crashes on load is not reloaded forever. Pure: every call carries its time.
    /// </summary>
    public sealed class PageCrashGate
    {
        public const int MaxReloads = 3;
        public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

        private readonly Queue<DateTime> _reloads = new();

        public bool ShouldReload(DateTime at)
        {
            while (_reloads.Count > 0 && at - _reloads.Peek() >= Window) _reloads.Dequeue();
            if (_reloads.Count >= MaxReloads) return false;
            _reloads.Enqueue(at);
            return true;
        }
    }
}
