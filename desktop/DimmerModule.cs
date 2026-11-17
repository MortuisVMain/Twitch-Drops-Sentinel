using System.Text.Json;

namespace TwitchDropsSentinel;

/// <summary>Registers and releases one global hotkey; the real one wraps the Win32 calls, the check uses a fake.</summary>
public interface IHotkeyRegistrar
{
    bool Register(int id, uint modifiers, uint key);
    bool Unregister(int id);
}

/// <summary>
/// The dimmer tab switch on the host side. While the module is on, the two global hotkeys are registered; turning it off
/// releases them and lifts whatever the dimmer put on the screen. The last value is kept in a small file, so the hotkeys
/// stay off at the next start before the page has loaded. Idempotent both ways. Win32 and the overlays are injected.
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
    private readonly HashSet<int> _held = new();
    private readonly List<int> _failed = new();

    public DimmerModule(IHotkeyRegistrar hotkeys, Action liftActive, string flagPath, Action<string, Exception?> log)
    {
        _hotkeys = hotkeys;
        _liftActive = liftActive;
        _flagPath = flagPath;
        _log = log;
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
            bool changed = !Enabled;
            Enabled = true;
            if (changed) WriteFlag();
            Register();
            return;
        }
        if (!Enabled) return;
        Enabled = false;
        WriteFlag();
        Unregister();
        try { _liftActive(); }
        catch (Exception ex) { _log("dimmer: lifting the overlays after turning the module off failed", ex); }
    }

    /// <summary>Releases the hotkeys at exit; the saved flag stays as it is.</summary>
    public void Shutdown() => Unregister();

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
                _log($"dimmer: {name} is taken by another program, this hotkey will not work", null);
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
            File.WriteAllText(_flagPath, JsonSerializer.Serialize(new Dictionary<string, bool> { ["enabled"] = Enabled }));
        }
        catch (Exception ex) { _log("dimmer: saving the module flag failed", ex); }
    }
}
