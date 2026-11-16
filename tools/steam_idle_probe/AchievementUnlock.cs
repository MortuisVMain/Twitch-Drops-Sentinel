namespace SteamIdleProbe;

internal enum StoreOutcome { Success, Failed, Timeout }

/// <summary>
/// The WRITE side of ISteamUserStats, kept apart from the read-only IClientStatsNative. Exactly these methods may exist:
/// GetAchievement (the anchor), SetAchievement and StoreStats. Nothing that clears or resets state may ever be added.
/// </summary>
internal interface IClientAchievementWriteNative
{
    /// <summary>GetAchievement. False when the client does not know the name or did not write the one-byte flag.</summary>
    bool GetAchievementFlag(string apiName, out bool achieved);

    /// <summary>Binds SetAchievement and StoreStats and finds the callback pump. Throws ProbeException before any write.</summary>
    void PrepareWrite();

    bool SetAchievement(string apiName);
    bool StoreStats();

    /// <summary>Pumps callbacks until UserStatsStored_t for this game arrives or the limit passes.</summary>
    StoreOutcome WaitForStore(uint appId, TimeSpan timeout, CancellationToken stop);
}

internal sealed record UnlockReport(IReadOnlyList<string> Results, string Stored);

internal sealed record UnlockResult(IdentityResult Status, UnlockReport? Report);

internal sealed record SelfCheckResult(IdentityResult Status, int Count, int AnchorChecked);

/// <summary>
/// The one place that changes an account: unlock named achievements, after proving the vtable slots with reads.
/// An instance can only come from <see cref="Anchor"/>, so a write without a passed anchor check cannot be expressed.
/// </summary>
internal sealed class AchievementWriter
{
    internal const int AnchorCount = 5;
    internal static readonly TimeSpan StoreTimeout = TimeSpan.FromSeconds(10);
    /// <summary>Gap between the two reads that must agree before the first write.</summary>
    internal static readonly TimeSpan StabilityGap = TimeSpan.FromMilliseconds(200);
    private const string Implausible = "stats_implausible";

    private readonly IClientAchievementWriteNative _write;
    private readonly IReadOnlyList<AchievementInfo> _items;

    private AchievementWriter(IClientAchievementWriteNative write, IReadOnlyList<AchievementInfo> items) =>
        (_write, _items) = (write, items);

    /// <summary>The anchor check; the writer is returned (and the error is null) only when it passed.</summary>
    internal static string? Anchor(IClientAchievementWriteNative write, IReadOnlyList<AchievementInfo> items, out AchievementWriter? writer)
    {
        string? error = AnchorCheck(write, items, out _);
        writer = error is null ? new AchievementWriter(write, items) : null;
        return error;
    }

    /// <summary>
    /// Before the first write, every achievement is read once more after <see cref="StabilityGap"/>; the flags must equal the
    /// first read. Skipped when nothing will be written. Returns null or "stats_unavailable" / "worker_cancelled".
    /// </summary>
    internal string? StabilityCheck(IClientStatsNative stats, IReadOnlyList<string> names, CancellationToken stop)
    {
        var locked = _items.Where(item => !item.Achieved).Select(item => item.ApiName).ToHashSet(StringComparer.Ordinal);
        if (!names.Any(locked.Contains))
            return null;
        if (stop.WaitHandle.WaitOne(StabilityGap))
            return "worker_cancelled";
        foreach (var item in _items)
            if (!stats.GetAchievementState(item.ApiName, out bool now, out _) || now != item.Achieved)
                return "stats_unavailable";
        return null;
    }

    /// <summary>
    /// Brackets the SetAchievement slot between two proven neighbours: for the first five achievements GetAchievement must
    /// answer true and write a flag equal to the one GetAchievementAndUnlockTime reported. Returns null or an error code.
    /// </summary>
    internal static string? AnchorCheck(IClientAchievementWriteNative write, IReadOnlyList<AchievementInfo> items, out int anchored)
    {
        anchored = 0;
        foreach (var item in items.Take(AnchorCount))
        {
            if (!write.GetAchievementFlag(item.ApiName, out bool flag) || flag != item.Achieved)
                return Implausible;
            anchored++;
        }
        return null;
    }

    /// <summary>
    /// Sets every requested name that exists and is still locked, in input order, then stores once and re-reads what was set.
    /// <paramref name="markWriting"/> runs once, after the preflight and before the first SetAchievement. Once <paramref name="stop"/>
    /// is cancelled nothing further is set (the skipped names report "rejected"), but what was already set is still stored and
    /// re-read, so the local state is never left half-written.
    /// </summary>
    internal UnlockReport Unlock(IClientStatsNative stats, uint appId, IReadOnlyList<string> names, Action markWriting,
        TimeSpan storeTimeout, CancellationToken stop)
    {
        var write = _write;
        var known = _items.ToDictionary(item => item.ApiName, StringComparer.Ordinal);
        var results = new string[names.Count];
        var pending = new List<int>();
        bool announced = false;
        for (int index = 0; index < names.Count; index++)
        {
            if (!known.TryGetValue(names[index], out var item))
            {
                results[index] = "unknown";
                continue;
            }
            if (item.Achieved)
            {
                results[index] = "already";
                continue;
            }
            if (stop.IsCancellationRequested)
            {
                results[index] = "rejected";
                continue;
            }
            if (!announced)
            {
                write.PrepareWrite();
                markWriting();
                announced = true;
            }
            if (write.SetAchievement(names[index]))
                pending.Add(index);
            else
                results[index] = "rejected";
        }
        if (pending.Count == 0)
            return new(results, "not_needed");
        if (!write.StoreStats())
        {
            foreach (int index in pending)
                results[index] = "store_failed";
            return new(results, "no");
        }
        var outcome = write.WaitForStore(appId, storeTimeout, stop);
        if (outcome == StoreOutcome.Failed)
        {
            foreach (int index in pending)
                results[index] = "store_failed";
            return new(results, "no");
        }
        foreach (int index in pending)
        {
            bool achieved = stats.GetAchievementState(names[index], out bool now, out _) && now;
            results[index] = !achieved ? "unconfirmed" : outcome == StoreOutcome.Success ? "unlocked" : "pending";
        }
        return new(results, outcome == StoreOutcome.Success ? "yes" : "timeout");
    }
}
