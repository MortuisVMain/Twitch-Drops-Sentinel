// Checks the dimmer logic without a monitor, a sound card or real time: waits are completed by hand.
using System.Text.Json;
using TwitchDropsSentinel;

int failures = 0;
void Check(bool ok, string what)
{
    if (!ok) { failures++; Console.WriteLine("FAIL: " + what); }
    else Console.WriteLine("ok:   " + what);
}
string Fmt(List<(string, int)> w) => string.Join(",", w.Select(x => $"{x.Item1}={x.Item2}"));

// A debounce window that ends only when Tick() is called; cancelling the token cancels the wait like Task.Delay does.
var waiters = new List<(TaskCompletionSource<bool> Tcs, CancellationToken Token, TimeSpan Span)>();
Task ManualWait(TimeSpan span, CancellationToken token)
{
    var tcs = new TaskCompletionSource<bool>();
    token.Register(() => tcs.TrySetCanceled(token));
    waiters.Add((tcs, token, span));
    return tcs.Task;
}
// Ends the waiting windows (and settle times unless settle is false) now; reverse = in the opposite order to how they started
void Tick(bool reverse = false, bool settle = true)
{
    do
    {
        var now = waiters.Where(w => settle || w.Span == BrightnessDebouncer.DebounceWindow).ToList();
        foreach (var w in now) waiters.Remove(w);
        if (reverse) now.Reverse();
        foreach (var w in now) w.Tcs.TrySetResult(true);
    } while (settle && waiters.Count > 0); // a finished write starts its settle time: end that too
}

(BrightnessDebouncer D, List<(string, int)> Writes, List<Exception> Errors) NewDebouncer(Func<string, int, bool>? failOn = null, Func<string, int, Task>? slow = null)
{
    waiters.Clear();
    var writes = new List<(string, int)>();
    var errors = new List<Exception>();
    var d = new BrightnessDebouncer(ManualWait, (id, lvl) =>
    {
        if (failOn != null && failOn(id, lvl)) throw new InvalidOperationException("bus error");
        writes.Add((id, lvl));
        return slow != null ? slow(id, lvl) : Task.CompletedTask;
    }, errors.Add);
    return (d, writes, errors);
}

// C11: separate monitors, one window
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 80); d.Post("B", 70); Tick();
    Check(Fmt(w) == "A=80,B=70", $"A->80 and B->70 inside one window give two writes ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 60); d.Post("A", 65); d.Post("A", 70); Tick();
    Check(Fmt(w) == "A=70", $"A->60->65->70 gives one write of 70 ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("master", 50); d.Post("A", 60); Tick();
    Check(Fmt(w) == "master=50,A=60", $"a single value after master is kept and comes after it ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 60); d.Post("master", 50); Tick();
    Check(Fmt(w) == "master=50", $"master cancels the pending single value ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("master", 40); d.Post("master", 45); Tick();
    Check(Fmt(w) == "master=45", $"two masters give the last one ({Fmt(w)})");
}
{
    var (d, w, _) = NewDebouncer();
    Check(!d.IsPending("A"), "nothing is pending at the start");
    d.Post("master", 50);
    Check(d.IsPending("A") && d.IsPending("B"), "a pending master makes every monitor pending");
    Tick();
    Check(!d.IsPending("A") && !d.IsPending("master"), "nothing is pending once written");
    d.Post("A", 10);
    Check(d.IsPending("A") && !d.IsPending("B"), "a single value is pending only for its monitor");
    Tick();
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 10); d.Post("master", 20); d.CancelAll(); Tick();
    Check(w.Count == 0 && !d.IsPending("A"), "CancelAll on close drops every waiting write");
}
{
    var (d, w, e) = NewDebouncer((id, lvl) => id == "A");
    d.Post("A", 10); d.Post("B", 20); Tick();
    Check(e.Count == 1 && Fmt(w) == "B=20", $"a failed write goes to onError and does not stop the next ({Fmt(w)}, errors {e.Count})");
}
{
    waiters.Clear();
    var (d, w, _) = NewDebouncer();
    d.Post("A", 10);
    var token = waiters[0].Token;
    Tick();
    bool disposed;
    try { _ = token.WaitHandle; disposed = false; } catch (ObjectDisposedException) { disposed = true; }
    Check(disposed, "the token source of a finished write is disposed");
}

{
    // master first, then a single value; their timers end in the opposite order: the single value must still come second
    var (d, w, _) = NewDebouncer();
    d.Post("master", 50); d.Post("A", 60);
    Tick(reverse: true, settle: false);
    Check(Fmt(w) == "master=50,A=60", $"the timers end in reverse order: the single value is still applied after master ({Fmt(w)})");
    Tick();
}
{
    // pending lasts until the write has finished, then for the settle time
    var gate = new TaskCompletionSource();
    var (d, w, _) = NewDebouncer(slow: (id, lvl) => gate.Task);
    d.Post("A", 10);
    Tick(settle: false);
    Check(w.Count == 1 && d.IsPending("A"), "still pending while the write itself runs");
    gate.SetResult();
    Check(d.IsPending("A"), "still pending during the settle time after the write");
    Tick();
    Check(!d.IsPending("A"), "not pending once the settle time is over");
}
{
    var (d, w, _) = NewDebouncer();
    d.Post("A", 10);
    Tick(settle: false);
    d.CancelAll(); Tick();
    Check(!d.IsPending("A"), "CancelAll also ends a settling monitor");
}
{
    var ids = new List<string> { "DDC_0_Dell", "DDC_1_LG" };
    Check(MonitorIds.Resolve("0", ids) == "DDC_0_Dell" && MonitorIds.Resolve("disp-primary", ids) == "DDC_0_Dell", "0 and disp-primary are the first monitor");
    Check(MonitorIds.Resolve("1", ids) == "DDC_1_LG" && MonitorIds.Resolve("disp-secondary", ids) == "DDC_1_LG", "1 and disp-secondary are the second monitor");
    Check(MonitorIds.Resolve("master", ids) == "master" && MonitorIds.Resolve("DDC_1_LG", ids) == "DDC_1_LG", "master and real ids stay");
    Check(MonitorIds.Resolve("5", ids) == "5" && MonitorIds.Resolve("disp-secondary", new List<string> { "x" }) == "disp-secondary", "out of range stays as it is");
}

// C12: sound before and after a blackout
{
    bool muted = false; int muteCalls = 0, unmuteCalls = 0;
    var mem = new BlackoutMuteMemory();
    void Enter() => mem.Enter(() => muted, () => { muted = true; muteCalls++; });
    void Exit() => mem.Exit(() => { muted = false; unmuteCalls++; });
    Enter(); Enter();
    Check(muted && muteCalls == 1, "a repeated blackout does nothing the second time");
    Exit();
    Check(!muted && unmuteCalls == 1, "unmuted -> blackout -> blackout again -> exit returns the sound");
    Exit();
    Check(unmuteCalls == 1, "a second exit does nothing");
}
{
    bool muted = true; int unmuteCalls = 0;
    var mem = new BlackoutMuteMemory();
    mem.Enter(() => muted, () => muted = true);
    mem.Enter(() => muted, () => muted = true);
    mem.Exit(() => { muted = false; unmuteCalls++; });
    Check(muted && unmuteCalls == 0, "a sound that was muted before stays muted");
}
{
    bool muted = false; int muteCalls = 0, unmuteCalls = 0;
    var mem = new BlackoutMuteMemory();
    mem.Exit(() => unmuteCalls++);
    Check(unmuteCalls == 0, "an exit without an entry does not touch the sound");
    bool threw = false;
    try { mem.Enter(() => throw new InvalidOperationException("no audio device"), () => muteCalls++); } catch (InvalidOperationException) { threw = true; }
    Check(threw && muteCalls == 0, "a failed read is reported and nothing is muted");
    mem.Enter(() => muted, () => { muted = true; muteCalls++; });
    Check(muted && muteCalls == 1, "after a failed read the next blackout still counts as the entry");
    mem.Exit(() => { muted = false; unmuteCalls++; });
    Check(!muted && unmuteCalls == 1, "and returns the sound");
}

// C10: what a poll shows
{
    var cache = new Dictionary<string, int> { ["m"] = 80 };
    Check(BrightnessReading.Resolve(cache, "m", 60, 75, explicitRefresh: false, writePending: false) == 80 && cache["m"] == 80,
          "cache 80, hardware 60: a normal read keeps 80");
    Check(BrightnessReading.Resolve(cache, "m", 60, 75, explicitRefresh: true, writePending: false) == 60 && cache["m"] == 60,
          "cache 80, hardware 60: an explicit poll shows 60 and stores it");
}
{
    var cache = new Dictionary<string, int> { ["m"] = 80 };
    Check(BrightnessReading.Resolve(cache, "m", 60, 75, explicitRefresh: true, writePending: true) == 80 && cache["m"] == 80,
          "a pending write is not rolled back by a poll");
    Check(BrightnessReading.Resolve(cache, "m", null, 75, explicitRefresh: true, writePending: false) == 80,
          "a failed read does not replace the known value");
}
{
    var cache = new Dictionary<string, int>();
    Check(BrightnessReading.Resolve(cache, "a", 33, 75, false, false) == 33 && cache["a"] == 33, "first read takes the hardware value");
    Check(BrightnessReading.Resolve(cache, "b", null, 75, false, false) == 75 && cache["b"] == 75, "first read without hardware takes the fallback");
}

// External links: only absolute http(s) may reach ShellExecute
{
    string Open(string? raw) => ExternalLinkPolicy.TryGetOpenable(raw, out var uri) ? uri : "<refused>";
    Check(Open("http://example.com/a?b=1") == "http://example.com/a?b=1", "http is opened");
    Check(Open("https://www.twitch.tv/directory") == "https://www.twitch.tv/directory", "https is opened");
    Check(Open("HTTPS://Example.com/x") == "https://example.com/x", "upper-case scheme is opened, normalized");
    Check(Open("HTTP://example.com") == "http://example.com/", "upper-case HTTP is opened");
    Check(Open("file:///C:/Windows/System32/calc.exe") == "<refused>", "file: is refused");
    Check(Open("ms-msdt:/id PCWDiagnostic /skip force /param \"IT_BrowseForFile=x\"") == "<refused>", "ms-msdt: is refused");
    Check(Open("search-ms:query=x&crumb=location:\\\\host\\share") == "<refused>", "search-ms: is refused");
    Check(Open("javascript:alert(1)") == "<refused>", "javascript: is refused");
    Check(Open("steam://run/1") == "<refused>", "a custom protocol is refused");
    Check(Open("/relative/path") == "<refused>", "a relative path is refused");
    Check(Open("relative.html") == "<refused>", "a bare name is refused");
    Check(Open("") == "<refused>", "an empty string is refused");
    Check(Open(null) == "<refused>", "null is refused");
    Check(Open("   ") == "<refused>", "blanks are refused");
    Check(Open("\\\\server\\share\\file.exe") == "<refused>", "a UNC path is refused");
    Check(Open("//server/share/file.exe") == "<refused>", "a scheme-relative UNC form is refused");
    Check(Open("C:\\Windows\\System32\\calc.exe") == "<refused>", "a drive path is refused");
    Check(Open("https://") == "<refused>", "https:// with no host is refused");
    Check(Open("http:///x") == "<refused>", "http:/// with no host is refused");
    Check(Open(" https://example.com") == "<refused>", "a leading space is refused");
    Check(Open("https://example.com ") == "<refused>", "a trailing space is refused");
    Check(Open("https://example.com/\n") == "<refused>", "a control character is refused");
    Check(Open("https:example.com") == "<refused>", "https: without // is refused");
}

// App origin: the window may stay on https://app.sentinel only; a foreign page must not navigate there or post messages
{
    bool App(string? raw) => AppOriginPolicy.IsAppUri(raw);
    Check(App("https://app.sentinel/index.html?v=123"), "the app page is the app origin");
    Check(App("https://app.sentinel/"), "the app root is the app origin");
    Check(App("https://app.sentinel/index.html#/settings"), "a hash route is the app origin");
    Check(App("https://APP.SENTINEL/index.html"), "upper-case host is the app origin");
    Check(App("HTTPS://app.sentinel/index.html"), "upper-case scheme is the app origin");
    Check(App("https://app.sentinel:443/index.html"), "the default https port is the app origin");
    Check(!App("https://app.sentinel.evil.com/index.html"), "app.sentinel.evil.com is foreign");
    Check(!App("https://evil.com/#app.sentinel"), "app.sentinel in the fragment is foreign");
    Check(!App("https://evil.com/?u=https://app.sentinel/"), "app.sentinel in the query is foreign");
    Check(!App("https://app.sentinel@evil.com/"), "app.sentinel as user info is foreign");
    Check(!App("https://app.sentinel:pw@evil.com/"), "app.sentinel as user name with password is foreign");
    Check(!App("https://evil.com\\@app.sentinel/"), "a backslash before @app.sentinel is foreign");
    Check(!App("https://app.sentinel@app.sentinel/"), "user info on the app host is refused");
    Check(!App("http://app.sentinel/index.html"), "http scheme is foreign");
    Check(!App("https://app.sentinel:8443/index.html"), "another port is foreign");
    Check(!App("https://app.sentinel./index.html"), "a trailing dot host is foreign");
    Check(!App("https://xapp.sentinel/index.html"), "a prefixed host is foreign");
    Check(!App("https://evil.com/"), "evil.com is foreign");
    Check(!App("file:///C:/x/index.html"), "file: is foreign");
    Check(!App("javascript:alert(1)"), "javascript: is foreign");
    Check(!App("data:text/html,<h1>x</h1>"), "data: is foreign");
    Check(!App("about:blank"), "about:blank is foreign");
    Check(!App("edge://settings"), "edge: is foreign");
    Check(!App("/index.html"), "a relative path is foreign");
    Check(!App(" https://app.sentinel/"), "a leading space is foreign");
    Check(!App("https://app.sentinel/\n"), "a control character is foreign");
    Check(!App(""), "an empty source is foreign");
    Check(!App(null), "a null source is foreign");
}

// The per-launch secret of the local API: 32 random bytes as base64url, never the same twice, safe inside a script
{
    string a = LocalApiToken.Create(), b = LocalApiToken.Create();
    Check(a.Length == 43 && a.All(c => char.IsAsciiLetterOrDigit(c) || c == '-' || c == '_'), "token: 43 chars of base64url, no padding");
    Check(a != b, "token: differs between two calls");
    Check(LocalApiToken.HeaderName == "X-Sentinel-Token" && LocalApiToken.EnvName == "SENTINEL_API_TOKEN", "token: names match the service");
    string script = LocalApiToken.PageScript(a);
    Check(script.Contains("location.origin === 'https://app.sentinel'") && script.Contains("__SENTINEL_TOKEN") && script.Contains("\"" + a + "\""), "token: script guards the origin and carries the JSON-encoded value");
    Check(script.Contains("writable: false") && script.Contains("configurable: false"), "token: the page cannot change it");
    string hostile = LocalApiToken.PageScript("x\"});alert(1);//</script>");
    Check(!hostile.Contains("x\"}") && !hostile.Contains("</script>") && !hostile.Contains("\"});"), "token: a hostile value stays inside the string");
}

// The dimmer module switch: the hotkeys follow the setting, the persisted flag keeps them off at the next start
{
    var dir = Path.Combine(Path.GetTempPath(), "dimmer_module_" + Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(dir);
    string flag = Path.Combine(dir, "dimmer_module.json");
    void ResetFlag()
    {
        if (File.Exists(flag)) File.Delete(flag);
        if (Directory.Exists(flag + ".tmp")) Directory.Delete(flag + ".tmp");
    }
    void FlagOff() => File.WriteAllText(flag, "{\"enabled\":false}");
    try
    {
    (DimmerModule M, FakeHotkeys H, List<string> Log, int[] Lifted) Make(params int[] refuse)
    {
        var h = new FakeHotkeys(refuse);
        var log = new List<string>();
        var lifted = new int[1];
        return (new DimmerModule(h, () => lifted[0]++, flag, (msg, ex) => log.Add(msg + (ex == null ? "" : " | " + ex.Message))), h, log, lifted);
    }

    {
        ResetFlag();
        var (m, h, _, lifted) = Make();
        m.Start();
        Check(m.Enabled && string.Join(",", h.Calls) == "+9001,+9002", $"module: no flag file = on, both hotkeys registered ({string.Join(",", h.Calls)})");
        Check(h.Keys[9001] == (DimmerModule.ModAlt, DimmerModule.VkBack) && h.Keys[9002] == (DimmerModule.ModAlt | DimmerModule.ModShift, DimmerModule.VkBack), "module: Alt+Backspace and Alt+Shift+Backspace");
        m.Apply(true); m.Apply(true);
        Check(h.Calls.Count == 2, "module: applying 'on' again registers nothing twice");
        m.Apply(false);
        Check(h.Active.Count == 0 && string.Join(",", h.Calls.Skip(2)) == "-9001,-9002", $"module: off unregisters both ({string.Join(",", h.Calls.Skip(2))})");
        Check(lifted[0] == 1 && !m.Enabled, "module: off lifts the overlays once");
        m.Apply(false);
        Check(lifted[0] == 1 && h.Calls.Count == 4, "module: applying 'off' again does nothing more");
        Check(File.Exists(flag), "module: the flag is persisted");
    }
    {
        ResetFlag(); FlagOff();
        var (m, h, _, lifted) = Make();
        m.Start();
        Check(!m.Enabled && h.Calls.Count == 0 && lifted[0] == 0, "module: the next start with the flag off registers no hotkey and lifts nothing");
        m.Apply(true);
        Check(m.Enabled && h.Active.SetEquals(new[] { 9001, 9002 }) && lifted[0] == 0, "module: on registers them again");
        var (m2, h2, _, _) = Make();
        m2.Start();
        Check(m2.Enabled && h2.Active.Count == 2, "module: the flag is on again after turning on");
    }
    {
        ResetFlag();
        var (m, h, log, _) = Make(9001);
        m.Start();
        Check(h.Active.SetEquals(new[] { 9002 }) && m.FailedHotkeys.SequenceEqual(new[] { 9001 }), "module: a refused hotkey is reported, the other one still works");
        Check(log.Count == 1 && log[0].Contains("Alt+Backspace"), $"module: the refusal is logged with the key ({string.Join(";", log)})");
        Check(log[0].Contains("could not register Alt+Backspace (error 1409)"), $"module: the log carries the Win32 error code of the failed call ({log[0]})");
        m.Apply(false);
        Check(!h.Calls.Contains("-9001") && h.Calls.Contains("-9002"), "module: off releases only what was taken");
        h.Refuse.Clear();
        m.Apply(true);
        Check(h.Active.SetEquals(new[] { 9001, 9002 }) && m.FailedHotkeys.Count == 0, "module: turning on again takes the hotkey that was refused before");
    }
    {
        ResetFlag();
        var h = new FakeHotkeys();
        var log = new List<string>();
        var m = new DimmerModule(h, () => throw new InvalidOperationException("overlay stuck"), flag, (msg, ex) => log.Add(msg));
        m.Start();
        m.Apply(false);
        Check(h.Active.Count == 0 && log.Any(l => l.Contains("overlay")), "module: a failing overlay lift is logged and the hotkeys are released anyway");
    }
    {
        File.WriteAllText(flag, "{ not json");
        var (m, h, log, _) = Make();
        m.Start();
        Check(m.Enabled && h.Active.Count == 2 && log.Count == 1, "module: a broken flag file counts as on and is logged");
        m.Shutdown();
        Check(h.Active.Count == 0, "module: shutdown releases the hotkeys");
        File.WriteAllText(flag, "{\"enabled\":false}");
        var (m3, h3, _, _) = Make();
        m3.Start(); m3.Shutdown();
        Check(!m3.Enabled && File.ReadAllText(flag).Contains("false"), "module: shutdown keeps the flag");
    }
    {
        // 5: a lift that failed (or was cut short) is repeated by the next 'off' while the screens are still dark
        ResetFlag();
        var h = new FakeHotkeys(); var log = new List<string>(); int lifts = 0; bool dark = true;
        var m = new DimmerModule(h, () => { lifts++; if (lifts == 1) throw new InvalidOperationException("monitor bus"); dark = false; }, flag, (msg, ex) => log.Add(msg), () => dark);
        m.Start(); m.Apply(false);
        Check(lifts == 1 && dark && log.Count == 1, "module: the first lift failed and the screen is still dark");
        m.Apply(false);
        Check(lifts == 2 && !dark, "module: 'off' again lifts again while something is still dark");
        m.Apply(false);
        Check(lifts == 2, "module: 'off' again does nothing once the screens are clear");
        var plain = new DimmerModule(new FakeHotkeys(), () => lifts++, flag, (msg, ex) => { });
        int before = lifts; plain.Start(); plain.Apply(false);
        Check(lifts == before, "module: without a dark check an already-off module lifts nothing");

        var order = new List<string>(); var stepLog = new List<string>();
        DimmerModule.RunSteps((msg, ex) => stepLog.Add(msg + "|" + ex?.Message),
            ("sleep timer", () => { order.Add("timer"); throw new InvalidOperationException("timer stuck"); }),
            ("ultra-dark", () => order.Add("ultra")),
            ("baseline", () => order.Add("baseline")));
        Check(string.Join(",", order) == "timer,ultra,baseline" && stepLog.Count == 1 && stepLog[0].Contains("sleep timer") && stepLog[0].Contains("timer stuck"),
              $"lift steps: one failing step is logged and the others still run ({string.Join(",", order)}; {string.Join(";", stepLog)})");
    }
    {
        // 6: one module for the life of the window; a recreated handle re-registers from the in-memory state
        ResetFlag();
        var (m, h, _, _) = Make();
        m.Start(); m.Shutdown();
        Check(h.Active.Count == 0, "module: shutdown released both hotkeys");
        m.Apply(true);
        Check(h.Active.Count == 0 && h.Calls.Count == 4, $"module: 'on' after shutdown does nothing ({string.Join(",", h.Calls)})");
        m.Rebind();
        Check(h.Active.SetEquals(new[] { 9001, 9002 }) && h.Calls.Count == 6, $"module: rebinding to a new window registers what is on ({string.Join(",", h.Calls)})");
        m.Apply(false);
        FlagOff(); File.WriteAllText(flag, "{\"enabled\":true}");
        m.Shutdown(); m.Rebind();
        Check(!m.Enabled && h.Active.Count == 0, "module: a rebind keeps the in-memory value and does not read the file again");
        m.Apply(true);
        Check(m.Enabled && h.Active.Count == 2, "module: 'on' works again after a rebind");
    }
    {
        // 7: the flag is written to a temp file and moved over, so a failed write leaves the old value
        ResetFlag();
        var (m, h, log, _) = Make();
        m.Start(); m.Apply(false);
        Check(File.ReadAllText(flag).Contains("false") && !File.Exists(flag + ".tmp"), "module: the flag is written and no temp file stays");
        Directory.CreateDirectory(flag + ".tmp"); // the temp path is blocked: the write must fail without touching the flag
        m.Apply(true);
        Check(File.ReadAllText(flag).Contains("false") && log.Any(l => l.Contains("saving the module flag failed")),
              "module: a failed write is logged and the saved flag keeps its old content");
        Directory.Delete(flag + ".tmp");
        m.Apply(false); m.Apply(true);
        Check(File.ReadAllText(flag).Contains("true"), "module: the next write works");
    }
    }
    finally { Directory.Delete(dir, true); }
}

// The DIMMER_MODULE message and the DIMMER_COMMANDs allowed while the module is off
{
    bool Enabled(string json, out bool value) { using var doc = JsonDocument.Parse(json); return DimmerModulePayload.TryReadEnabled(doc.RootElement, out value); }
    Check(Enabled("{\"enabled\":true}", out var on) && on, "payload: true is read");
    Check(Enabled("{\"enabled\":false}", out var off) && !off, "payload: false is read");
    Check(!Enabled("{}", out _) && !Enabled("{\"enabled\":null}", out _) && !Enabled("{\"enabled\":\"true\"}", out _) && !Enabled("{\"enabled\":1}", out _),
          "payload: a missing, null, string or number value is refused");
    Check(DimmerCommandPolicy.IsLifting("SET_BLACKOUT", false, 0) && !DimmerCommandPolicy.IsLifting("SET_BLACKOUT", true, 0), "off: blackout off is allowed, blackout on is not");
    Check(DimmerCommandPolicy.IsLifting("SET_ULTRA_DARK", false, 0) && !DimmerCommandPolicy.IsLifting("SET_ULTRA_DARK", true, 0), "off: ultra-dark off is allowed, on is not");
    Check(DimmerCommandPolicy.IsLifting("SET_TIMER", false, 0) && !DimmerCommandPolicy.IsLifting("SET_TIMER", false, 5), "off: timer 0 is allowed, a timer is not");
    Check(DimmerCommandPolicy.IsLifting("RESTORE_BASELINE", false, 0), "off: restoring the baseline is allowed");
    Check(!DimmerCommandPolicy.IsLifting("SET_BRIGHTNESS", false, 0) && !DimmerCommandPolicy.IsLifting("SAVE_BASELINE", false, 0) && !DimmerCommandPolicy.IsLifting("GET_STATE", false, 0)
          && !DimmerCommandPolicy.IsLifting("SET_MUTE_ON_BLACKOUT", false, 0) && !DimmerCommandPolicy.IsLifting("SCAN_MONITORS", false, 0) && !DimmerCommandPolicy.IsLifting("", false, 0),
          "off: the other commands and unknown ones are refused");
}

Console.WriteLine(failures == 0 ? "ALL DIMMER CHECKS PASSED" : $"{failures} DIMMER CHECK(S) FAILED");
return failures == 0 ? 0 : 1;

sealed class FakeHotkeys : IHotkeyRegistrar
{
    public readonly List<string> Calls = new();
    public readonly HashSet<int> Active = new();
    public readonly HashSet<int> Refuse;
    public readonly Dictionary<int, (uint, uint)> Keys = new();
    public int LastError { get; private set; }
    public FakeHotkeys(params int[] refuse) { Refuse = new HashSet<int>(refuse); }
    public bool Register(int id, uint modifiers, uint key)
    {
        Calls.Add("+" + id);
        if (Refuse.Contains(id)) { LastError = 1409; return false; }
        Active.Add(id); Keys[id] = (modifiers, key);
        return true;
    }
    public bool Unregister(int id) { Calls.Add("-" + id); return Active.Remove(id); }
}
