using System.Text.Json;

namespace TwitchDropsSentinel;

/// <summary>Registers and releases one global hotkey; the real one wraps the Win32 calls, the check uses a fake.</summary>
public interface IHotkeyRegistrar
{
    bool Register(int id, uint modifiers, uint key);
    bool Unregister(int id);
    /// <summary>The system error code of the last failed Register call.</summary>
    int LastError { get; }
}

/// <summary>
/// The dimmer tab switch on the host side. While the module is on, the two global hotkeys are registered; turning it off
/// releases them, stops the sleep timer and, only if an overlay (blackout or ultra-dark) was active, lifts it and returns the
/// saved brightness. The last value is kept in a small file, so the hotkeys stay off at the next start before the page has
/// loaded. Idempotent both ways. Win32 and the overlays are injected. One instance lives as long as the window: a recreated
/// window handle is followed with Shutdown (old handle) and Rebind (new handle).
/// </summary>
public sealed class DimmerModule
{
    public const int BlackoutId = 9001, RestoreId = 9002;
    public const uint ModAlt = 0x0001, ModShift = 0x0004, VkBack = 0x08;

    private static readonly (int Id, uint Modifiers, string Name)[] Hotkeys =
    {
        (BlackoutId, ModAlt, "Alt+Backspace"),
        (RestoreId, ModAlt | ModShift, "Alt+Shift+Backspace"),
    };

    private readonly IHotkeyRegistrar _hotkeys;
    private readonly Action _liftActive;
    private readonly string _flagPath;
    private readonly Action<string, Exception?> _log;
    private readonly Func<bool>? _stillActive;
    private readonly HashSet<int> _held = new();
    private readonly List<int> _failed = new();
    private bool _shutDown;

    /// <param name="stillActive">True while a blackout or ultra-dark is still on; a repeated 'off' lifts again while it is.</param>
    public DimmerModule(IHotkeyRegistrar hotkeys, Action liftActive, string flagPath, Action<string, Exception?> log, Func<bool>? stillActive = null)
    {
        _hotkeys = hotkeys;
        _liftActive = liftActive;
        _flagPath = flagPath;
        _log = log;
        _stillActive = stillActive;
    }

    /// <summary>The module is on until the page or the saved flag says otherwise.</summary>
    public bool Enabled { get; private set; } = true;

    /// <summary>Hotkeys that another program owns (or that failed for another reason) at the last attempt.</summary>
    public IReadOnlyList<int> FailedHotkeys => _failed;

    /// <summary>Reads the saved flag and registers the hotkeys if it is on. Nothing is lifted.</summary>
    public void Start()
    {
        Enabled = ReadFlag();
        if (Enabled) Register();
    }

    /// <summary>Follows the setting of the page: on registers what is missing, off releases the hotkeys and lifts the dimmer.</summary>
    public void Apply(bool enabled)
    {
        if (enabled)
        {
            if (_shutDown) return; // the window is gone: nothing may be registered against it
            bool changed = !Enabled;
            Enabled = true;
            if (changed) WriteFlag();
            Register();
            return;
        }
        if (!Enabled)
        {
            if (_stillActive?.Invoke() == true) Lift(); // an earlier lift did not finish: do it again
            return;
        }
        Enabled = false;
        WriteFlag();
        Unregister();
        Lift();
    }

    /// <summary>Releases the hotkeys (the window handle is going away or the app exits); the saved flag stays as it is.</summary>
    public void Shutdown()
    {
        _shutDown = true;
        Unregister();
    }

    /// <summary>The window got a new handle: registers what the current in-memory state needs; the saved file is not read again.</summary>
    public void Rebind()
    {
        _shutDown = false;
        if (Enabled) Register();
    }

    /// <summary>Runs lift steps one by one; a failing step is logged and never skips the next ones.</summary>
    public static void RunSteps(Action<string, Exception?> log, params (string Name, Action Run)[] steps)
    {
        foreach (var (name, run) in steps)
        {
            try { run(); }
            catch (Exception ex) { log($"dimmer: lift step '{name}' failed", ex); }
        }
    }

    private void Lift()
    {
        try { _liftActive(); }
        catch (Exception ex) { _log("dimmer: lifting the overlays after turning the module off failed", ex); }
    }

    private void Register()
    {
        _failed.Clear();
        foreach (var (id, modifiers, name) in Hotkeys)
        {
            if (_held.Contains(id)) continue;
            bool ok;
            try { ok = _hotkeys.Register(id, modifiers, VkBack); }
            catch (Exception ex) { _log($"dimmer: registering {name} failed", ex); ok = false; _failed.Add(id); continue; }
            if (ok) _held.Add(id);
            else
            {
                _failed.Add(id);
                _log($"dimmer: could not register {name} (error {_hotkeys.LastError})", null);
            }
        }
    }

    private void Unregister()
    {
        foreach (int id in _held.ToList())
        {
            try { _hotkeys.Unregister(id); }
            catch (Exception ex) { _log($"dimmer: releasing hotkey {id} failed", ex); }
            _held.Remove(id);
        }
        _failed.Clear();
    }

    private bool ReadFlag()
    {
        try
        {
            if (!File.Exists(_flagPath)) return true;
            using var doc = JsonDocument.Parse(File.ReadAllText(_flagPath));
            return !(doc.RootElement.TryGetProperty("enabled", out var prop) && prop.ValueKind == JsonValueKind.False);
        }
        catch (Exception ex)
        {
            _log("dimmer: the saved module flag is unreadable, the module counts as on", ex);
            return true;
        }
    }

    private void WriteFlag()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_flagPath)!);
            string tmp = _flagPath + ".tmp"; // written whole, then moved over: a crash never leaves a half-written flag
            File.WriteAllText(tmp, JsonSerializer.Serialize(new Dictionary<string, bool> { ["enabled"] = Enabled }));
            File.Move(tmp, _flagPath, overwrite: true);
        }
        catch (Exception ex) { _log("dimmer: saving the module flag failed", ex); }
    }
}

/// <summary>Reads the page's DIMMER_MODULE message.</summary>
public static class DimmerModulePayload
{
    /// <summary>True only for a real JSON true/false in "enabled"; anything else is refused.</summary>
    public static bool TryReadEnabled(JsonElement root, out bool enabled)
    {
        enabled = false;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("enabled", out var prop)) return false;
        if (prop.ValueKind != JsonValueKind.True && prop.ValueKind != JsonValueKind.False) return false;
        enabled = prop.ValueKind == JsonValueKind.True;
        return true;
    }
}

/// <summary>While the module is off the page may still send commands that lift the dimmer, and only those.</summary>
public static class DimmerCommandPolicy
{
    /// <param name="enabled">The command's "enabled" (false when absent), <paramref name="minutes"/> its timer value (0 when absent).</param>
    public static bool IsLifting(string action, bool enabled, int minutes) => action switch
    {
        "SET_BLACKOUT" or "SET_ULTRA_DARK" => !enabled,
        "SET_TIMER" => minutes == 0,
        "RESTORE_BASELINE" => true,
        _ => false,
    };
}
