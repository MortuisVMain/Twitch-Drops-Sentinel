using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SteamIdleProbe;

// WRITE side of ISteamUserStats. Only GetAchievement (read-only anchor), SetAchievement and StoreStats are ever bound, and
// only through BindWrite below; there is deliberately no delegate for ClearAchievement, ResetAllStats, SetStat,
// UpdateAvgRateStat or IndicateAchievementProgress. The unlock command is the only caller of PrepareWrite.
internal sealed partial class WindowsSteamClient : IClientAchievementWriteNative
{
    // Slots from the same public isteamuserstats.h declaration order as StatsLayouts (see WindowsSteamClient.Stats.cs):
    //   VERSION012: 6 GetAchievement, 7 SetAchievement, 8 ClearAchievement, 9 GetAchievementAndUnlockTime, 10 StoreStats.
    //   VERSION013 (no RequestCurrentStats, everything one lower): 5, 6, 7, 8, 9.
    // On the installed client (VERSION013) slot 8 is proven by live output, and the anchor check proves slot 5 at run time,
    // so SetAchievement (6) is bracketed by two proven neighbours with only ClearAchievement (7) between it and slot 8.
    internal static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>> AchievementWriteSlots =
        new Dictionary<string, IReadOnlyDictionary<string, int>>
        {
            ["STEAMUSERSTATS_INTERFACE_VERSION013"] = new Dictionary<string, int>
            {
                ["GetAchievement"] = 5, ["SetAchievement"] = 6, ["StoreStats"] = 9,
            },
            ["STEAMUSERSTATS_INTERFACE_VERSION012"] = new Dictionary<string, int>
            {
                ["GetAchievement"] = 6, ["SetAchievement"] = 7, ["StoreStats"] = 10,
            },
        };

    // isteamuserstats.h (public Steamworks SDK): k_iSteamUserStatsCallbacks = 1100 and
    //   struct UserStatsStored_t { enum { k_iCallback = k_iSteamUserStatsCallbacks + 2 }; uint64 m_nGameID; EResult m_eResult; };
    // Callback structs are packed to 8 bytes: m_nGameID at offset 0, m_eResult (int32) at offset 8, so at least 12 bytes.
    // The game id of a normal app is the AppID itself. k_EResultOK = 1. The envelope is CallbackMsg_t, as in WaitForStats.
    private const int UserStatsStoredCallback = 1102;
    private const int UserStatsStoredMinSize = 12;
    private SetAchievementMethod? _setAchievement;
    private StoreStatsMethod? _storeStats;
    private NextCallbackMethod? _nextCallback;
    private FreeCallbackMethod? _freeCallback;

    private T BindWrite<T>(string slotName) where T : Delegate
    {
        if (_stats == 0 || _statsLayout is null || !AchievementWriteSlots.TryGetValue(_statsLayout.Version, out var table) ||
            !table.TryGetValue(slotName, out int slot))
            throw new ProbeException("client_method_unsupported");
        BoundStatsSlots.Add(slotName);
        return Bind<T>(_stats, slot);
    }

    public bool GetAchievementFlag(string apiName, out bool achieved)
    {
        // Eight bytes of 0xFF; GetAchievement may change only the first. A neighbouring method that returns true without
        // writing it, or that writes a wider value, leaves a byte pattern that is not exactly 0 or 1 followed by 0xFF.
        ulong buffer = ulong.MaxValue;
        bool known = BindWrite<AchievementFlagMethod>("GetAchievement")(_stats, apiName, ref buffer);
        achieved = (byte)buffer == 1;
        return known && ((byte)buffer is 0 or 1) && buffer >> 8 == 0x00FFFFFFFFFFFFFFUL;
    }

    public void PrepareWrite()
    {
        _setAchievement ??= BindWrite<SetAchievementMethod>("SetAchievement");
        _storeStats ??= BindWrite<StoreStatsMethod>("StoreStats");
        if (_nextCallback is not null && _freeCallback is not null)
            return;
        if (!NativeLibrary.TryGetExport(_steamClientModule, "Steam_BGetCallback", out nint getExport) ||
            !NativeLibrary.TryGetExport(_steamClientModule, "Steam_FreeLastCallback", out nint freeExport))
            throw new ProbeException("client_export_unsupported");
        _nextCallback = Marshal.GetDelegateForFunctionPointer<NextCallbackMethod>(getExport);
        _freeCallback = Marshal.GetDelegateForFunctionPointer<FreeCallbackMethod>(freeExport);
    }

    internal void AttachCallbacks(NextCallbackMethod next, FreeCallbackMethod free) => (_nextCallback, _freeCallback) = (next, free);

    public bool SetAchievement(string apiName) =>
        (_setAchievement ?? throw new InvalidOperationException("PrepareWrite first."))(_stats, apiName);

    public bool StoreStats() => (_storeStats ?? throw new InvalidOperationException("PrepareWrite first."))(_stats);

    public StoreOutcome WaitForStore(uint appId, TimeSpan timeout, CancellationToken stop)
    {
        if (_nextCallback is not { } next || _freeCallback is not { } free)
            throw new InvalidOperationException("PrepareWrite first.");
        var clock = Stopwatch.StartNew();
        while (true)
        {
            while (next(_statsPipe, out CallbackMsg message))
            {
                bool stored = message.Callback == UserStatsStoredCallback && message.ParamSize >= UserStatsStoredMinSize;
                bool mine = stored && (ulong)Marshal.ReadInt64(message.Param, 0) == appId;
                int result = stored ? Marshal.ReadInt32(message.Param, 8) : 0;
                free(_statsPipe); // every callback is freed once read, whoever it was for
                if (mine)
                    return result == 1 ? StoreOutcome.Success : StoreOutcome.Failed; // k_EResultOK
            }
            if (clock.Elapsed >= timeout || stop.WaitHandle.WaitOne(50))
                return StoreOutcome.Timeout;
        }
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    internal delegate bool AchievementFlagMethod(nint self, [MarshalAs(UnmanagedType.LPUTF8Str)] string apiName, ref ulong achieved);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    internal delegate bool SetAchievementMethod(nint self, [MarshalAs(UnmanagedType.LPUTF8Str)] string apiName);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    internal delegate bool StoreStatsMethod(nint self);
}
