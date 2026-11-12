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

/// <summary>The one place that changes an account: unlock named achievements, after proving the vtable slots with reads.</summary>
internal static class AchievementWriter
{
    internal const int AnchorCount = 5;
    internal static readonly TimeSpan StoreTimeout = TimeSpan.FromSeconds(10);
    private const string Implausible = "stats_implausible";

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
    /// <paramref name="markWriting"/> runs once, after the preflight and before the first SetAchievement.
    /// </summary>
    internal static UnlockReport Unlock(IClientStatsNative stats, IClientAchievementWriteNative write, uint appId,
        IReadOnlyList<AchievementInfo> items, IReadOnlyList<string> names, Action markWriting, TimeSpan storeTimeout,
        CancellationToken stop)
    {
        var known = items.ToDictionary(item => item.ApiName, StringComparer.Ordinal);
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
        foreach (int index in pending)
        {
            bool achieved = stats.GetAchievementState(names[index], out bool now, out _) && now;
            results[index] = !achieved ? "unconfirmed" : outcome == StoreOutcome.Success ? "unlocked" : "pending";
        }
        return new(results, outcome switch { StoreOutcome.Success => "yes", StoreOutcome.Failed => "no", _ => "timeout" });
    }
}
