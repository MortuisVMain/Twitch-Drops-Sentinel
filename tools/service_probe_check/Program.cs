using System.Net;
using System.Net.Sockets;
using TwitchDropsSentinel;

// The host's startup check blocks the UI thread on ServiceProbe.ProbeAsync (.GetAwaiter().GetResult()).
// v4.4.0 froze there forever: the awaits inside resumed on the blocked UI context, so the service was never started.
// These checks run the probe the same way on a thread whose SynchronizationContext never pumps, like a blocked UI thread.

int failures = 0;
void Check(string name, bool ok)
{
    Console.WriteLine($"{(ok ? "ok" : "FAIL")}: {name}");
    if (!ok) failures++;
}

static int FreePort()
{
    var l = new TcpListener(IPAddress.Loopback, 0);
    l.Start();
    int port = ((IPEndPoint)l.LocalEndpoint).Port;
    l.Stop();
    return port;
}

// Runs the probe as the host's startup check does; null when it did not return within 5 s (deadlock).
static string? BlockingProbe(string baseUrl)
{
    string? outcome = null;
    var t = new Thread(() =>
    {
        SynchronizationContext.SetSynchronizationContext(new NeverPumpingContext());
        using var http = new HttpClient();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try
        {
            using var res = ServiceProbe.ProbeAsync(http, baseUrl, cts.Token).GetAwaiter().GetResult();
            outcome = ((int)res.StatusCode).ToString();
        }
        catch (Exception ex) { outcome = ex.GetType().Name; }
    }) { IsBackground = true };
    t.Start();
    return t.Join(TimeSpan.FromSeconds(5)) ? outcome : null;
}

// a service that answers: /api/ping -> 200
int port = FreePort();
var listener = new HttpListener();
listener.Prefixes.Add($"http://127.0.0.1:{port}/");
listener.Start();
_ = Task.Run(async () =>
{
    while (listener.IsListening)
    {
        HttpListenerContext ctx;
        try { ctx = await listener.GetContextAsync(); } catch (Exception) { return; }
        ctx.Response.StatusCode = ctx.Request.Url!.AbsolutePath == "/api/ping" ? 200 : 404;
        ctx.Response.Close();
    }
});

string? up = BlockingProbe($"http://127.0.0.1:{port}");
Check("a blocked UI thread gets the answer of a running service (no deadlock)", up == "200");
listener.Stop();

string? down = BlockingProbe($"http://127.0.0.1:{FreePort()}");
Check("a blocked UI thread gets an error when nothing listens (no deadlock)", down != null && down != "200");

Console.WriteLine(failures == 0 ? "ALL PASSED" : $"{failures} FAILED");
return failures == 0 ? 0 : 1;

/// <summary>Like a UI thread that is blocked: posted continuations are never run.</summary>
sealed class NeverPumpingContext : SynchronizationContext
{
    public override void Post(SendOrPostCallback d, object? state) { }
    public override void Send(SendOrPostCallback d, object? state) => d(state);
}
