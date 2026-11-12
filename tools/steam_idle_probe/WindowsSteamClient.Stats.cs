using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SteamIdleProbe;

/// <summary>Vtable slot of each READ-ONLY ISteamUserStats method for one interface version.</summary>
internal sealed record StatsLayout(string Version, IReadOnlyDictionary<string, int> Slots);

// READ-ONLY. Only the slots named in the tables below are ever bound; no delegate exists for any method that changes
// stats or achievements, and none may be added without a separate, reviewed change.
internal sealed partial class WindowsSteamClient : IClientStatsNative
{
    // ISteamUserStats vtable slots, from Valve's public isteamuserstats.h (Steamworks SDK). Declaration order of the
    // header, 64-bit MSVC; the overloaded GetStat/SetStat pairs take two slots each whichever way MSVC orders them, so
    // they do not move any slot used here.
    //
    //   STEAMUSERSTATS_INTERFACE_VERSION012 (SDK 1.5x): 0 RequestCurrentStats, 1-2 GetStat, 3-4 SetStat,
    //     5 UpdateAvgRateStat, 6 GetAchievement, 7 SetAchievement, 8 ClearAchievement, 9 GetAchievementAndUnlockTime,
    //     10 StoreStats, 11 GetAchievementIcon, 12 GetAchievementDisplayAttribute, 13 IndicateAchievementProgress,
    //     14 GetNumAchievements, 15 GetAchievementName.   Confidence: high.
    //   STEAMUSERSTATS_INTERFACE_VERSION013 (newer SDK): the same list without RequestCurrentStats, so every slot moves
    //     down by one: 8 GetAchievementAndUnlockTime, 11 GetAchievementDisplayAttribute, 13 GetNumAchievements,
    //     14 GetAchievementName.   Confidence: medium, from memory of the SDK change; the runtime self-check in
    //     AchievementReader.Collect is what protects against a wrong slot.
    internal static readonly StatsLayout[] StatsLayouts =
    [
        new("STEAMUSERSTATS_INTERFACE_VERSION013", new Dictionary<string, int>
        {
            ["GetAchievementAndUnlockTime"] = 8, ["GetAchievementDisplayAttribute"] = 11,
            ["GetNumAchievements"] = 13, ["GetAchievementName"] = 14,
        }),
        new("STEAMUSERSTATS_INTERFACE_VERSION012", new Dictionary<string, int>
        {
            ["RequestCurrentStats"] = 0, ["GetAchievementAndUnlockTime"] = 9, ["GetAchievementDisplayAttribute"] = 12,
            ["GetNumAchievements"] = 14, ["GetAchievementName"] = 15,
        }),
    ];

    private const int GetUserStatsSlot = 13; // ISteamClient (SteamClient020) GetISteamUserStats(user, pipe, version)
    private const int UserStatsReceivedCallback = 1101; // k_iSteamUserStatsCallbacks + 1
    private const int MaxNativeText = 16384;
    private nint _stats;
    private int _statsPipe;
    private StatsLayout? _statsLayout;

    /// <summary>Names of the ISteamUserStats slots that were bound so far; checks assert it holds no mutating method.</summary>
    internal HashSet<string> BoundStatsSlots { get; } = [];

    public bool HasStatsInterface(int user, int pipe)
    {
        foreach (var layout in StatsLayouts)
        {
            nint stats = Bind<GetUserMethod>(_client, GetUserStatsSlot)(_client, user, pipe, layout.Version);
            if (stats != 0)
            {
                AttachStats(stats, layout);
                _statsPipe = pipe;
                return true;
            }
        }
        return false;
    }

    internal void AttachStats(nint instance, StatsLayout layout) => (_stats, _statsLayout) = (instance, layout);

    private T BindStats<T>(string slotName) where T : Delegate
    {
        if (_stats == 0 || _statsLayout is null || !_statsLayout.Slots.TryGetValue(slotName, out int slot))
            throw new ProbeException("client_method_unsupported");
        BoundStatsSlots.Add(slotName);
        return Bind<T>(_stats, slot);
    }

    public uint GetNumAchievements() => BindStats<NumAchievementsMethod>("GetNumAchievements")(_stats);

    public string? GetAchievementName(uint index) =>
        ReadNativeText(BindStats<AchievementNameMethod>("GetAchievementName")(_stats, index));

    public string? GetDisplayAttribute(string apiName, string key) =>
        ReadNativeText(BindStats<DisplayAttributeMethod>("GetAchievementDisplayAttribute")(_stats, apiName, key));

    public bool GetAchievementState(string apiName, out bool achieved, out uint unlockTime)
    {
        // The flag starts as 0xFF: a neighbouring slot (ClearAchievement, SetAchievement...) would return true without ever
        // writing it, and that must not be mistaken for a locked achievement.
        byte flag = UntouchedFlag;
        unlockTime = 0;
        bool known = BindStats<UnlockTimeMethod>("GetAchievementAndUnlockTime")(_stats, apiName, ref flag, ref unlockTime);
        achieved = flag == 1;
        return known && flag is 0 or 1;
    }

    private const byte UntouchedFlag = 0xFF;

    /// <summary>Copies a client-owned UTF-8 string at once. Null for a null pointer or a string with no end within 16 KiB.</summary>
    internal static string? ReadNativeText(nint text)
    {
        if (text == 0)
            return null;
        int length = 0;
        while (length < MaxNativeText && Marshal.ReadByte(text, length) != 0)
            length++;
        return length == MaxNativeText ? null : Marshal.PtrToStringUTF8(text, length);
    }

    // Observed on the installed client (Steam 11.22.14.96, SteamClient020, accepts STEAMUSERSTATS_INTERFACE_VERSION013):
    // steamclient64.dll exports the callback pump Steam_BGetCallback / Steam_FreeLastCallback and Steam_GetAPICallResult,
    // but for a process registered with SteamAppId no UserStatsReceived_t ever arrives on a fresh pipe. The user's
    // stats are readable at once instead: GetNumAchievements and GetAchievementAndUnlockTime answer within ~2 ms.
    // So VERSION013 (no RequestCurrentStats) polls for "schema present and state readable"; VERSION012 requests the stats
    // and waits for the UserStatsReceived_t callback (callback 1101: GameID u64, EResult i32, SteamID u64) on our pipe.
    // The VERSION012 branch could not be exercised on this client.
    public bool WaitForStats(uint appId, ulong steamId, TimeSpan timeout, CancellationToken stop)
    {
        if (_statsLayout is null)
            throw new ProbeException("client_method_unsupported");
        if (!_statsLayout.Slots.ContainsKey("RequestCurrentStats"))
            return PollUntilLoaded(timeout, stop);
        if (!BindStats<RequestStatsMethod>("RequestCurrentStats")(_stats))
            return false;
        if (!NativeLibrary.TryGetExport(_steamClientModule, "Steam_BGetCallback", out nint getExport) ||
            !NativeLibrary.TryGetExport(_steamClientModule, "Steam_FreeLastCallback", out nint freeExport))
            throw new ProbeException("client_export_unsupported");
        var next = Marshal.GetDelegateForFunctionPointer<NextCallbackMethod>(getExport);
        var free = Marshal.GetDelegateForFunctionPointer<FreeCallbackMethod>(freeExport);
        var clock = Stopwatch.StartNew();
        while (true)
        {
            while (next(_statsPipe, out CallbackMsg message))
            {
                bool received = message.Callback == UserStatsReceivedCallback && message.ParamSize >= 24;
                bool mine = received && (ulong)Marshal.ReadInt64(message.Param, 0) == appId &&
                    (ulong)Marshal.ReadInt64(message.Param, 16) == steamId;
                int result = received ? Marshal.ReadInt32(message.Param, 8) : 0;
                free(_statsPipe);
                if (mine)
                    return result == 1; // k_EResultOK
            }
            if (clock.Elapsed >= timeout || stop.WaitHandle.WaitOne(50))
                return false;
        }
    }

    // A game with no achievements looks the same as stats that are not there yet, so an empty schema must stay empty for
    // a settle time (a fifth of the limit, at most two seconds) before it counts as loaded.
    private bool PollUntilLoaded(TimeSpan timeout, CancellationToken stop)
    {
        var settle = TimeSpan.FromTicks(Math.Min(TimeSpan.FromSeconds(2).Ticks, timeout.Ticks / 5));
        var clock = Stopwatch.StartNew();
        while (true)
        {
            uint count = GetNumAchievements();
            // An implausible answer is not "not loaded": let the reader reject it with its own code.
            bool loaded = count switch
            {
                0 => clock.Elapsed >= settle,
                > AchievementReader.MaxAchievements => true,
                _ => GetAchievementName(0) is not { } first || !AchievementReader.IsApiName(first) ||
                     GetAchievementState(first, out _, out _),
            };
            if (loaded)
                return true;
            if (clock.Elapsed >= timeout || stop.WaitHandle.WaitOne(50))
                return false;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CallbackMsg
    {
        public int User;
        public int Callback;
        public nint Param;
        public int ParamSize;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private delegate bool RequestStatsMethod(nint self);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private delegate bool NextCallbackMethod(int pipe, out CallbackMsg message);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private delegate bool FreeCallbackMethod(int pipe);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    internal delegate uint NumAchievementsMethod(nint self);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    internal delegate nint AchievementNameMethod(nint self, uint index);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    internal delegate nint DisplayAttributeMethod(nint self, [MarshalAs(UnmanagedType.LPUTF8Str)] string apiName,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string key);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    internal delegate bool UnlockTimeMethod(nint self, [MarshalAs(UnmanagedType.LPUTF8Str)] string apiName, ref byte achieved,
        ref uint unlockTime);
}
