using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace SteamIdleProbe;

/// <summary>Parent side of the apps and hold commands: spawn one worker, validate every line it prints, forward only that.</summary>
internal static class StreamCommands
{
    private static readonly TimeSpan ExitGrace = TimeSpan.FromSeconds(2);

    internal static async Task<int> RunApps(ProcessStartInfo start, IReadOnlyList<uint> ids, TextWriter output, TimeSpan timeout)
    {
        if (ids.Count == 0)
        {
            // Offline contract smoke test only: no worker runs, so this does NOT confirm the client or the account.

            output.WriteLine(StreamProtocol.CompleteLine(0));
            return 0;
        }
        Redirect(start);
        using var deadline = new CancellationTokenSource(timeout);
        var lines = new List<string>();
        Process? child = null;
        string? error;
        bool stopped = true;
        try
        {
            child = Process.Start(start);
            if (child is null)
            {
                error = "worker_start_failed";
            }
            else
            {
                var worker = child;
                _ = worker.StandardError.BaseStream.CopyToAsync(Stream.Null);
                var write = Task.Run(() => WriteIds(worker.StandardInput, ids));
                error = await Task.Run(() => StreamProtocol.ReadAppsOutput(worker.StandardOutput, ids, lines)).WaitAsync(deadline.Token);
                if (error is null)
                {
                    await worker.WaitForExitAsync(deadline.Token);
                    if (worker.ExitCode != 0 || !await write.WaitAsync(deadline.Token))
                        error = "worker_failed";
                }
            }
        }
        catch (OperationCanceledException) when (deadline.IsCancellationRequested)
        {
            error = "worker_timeout";
        }
        catch (Win32Exception) when (child is null)
        {
            error = "worker_start_failed";
        }
        catch (Exception ex) when (ex is IOException or Win32Exception or InvalidOperationException)
        {
            error = "worker_failed";
        }
        finally
        {
            if (child is not null)
                stopped = StopWorker(child, deadline.IsCancellationRequested ? TimeSpan.Zero : ExitGrace);
        }
        if (!stopped)
            error = "worker_cleanup_failed";
        if (error is not null)
            return Fail(output, error);
        foreach (var line in lines)
            output.WriteLine(line);
        output.WriteLine(StreamProtocol.CompleteLine(ids.Count));
        return 0;
    }

    internal static async Task<int> RunHold(ProcessStartInfo start, uint appId, TextReader input, TextWriter output,
        TimeSpan startTimeout, TimeSpan releaseTimeout)
    {
        Redirect(start);
        // The only place a game context is created on purpose; the parent has already refused an inherited one.
        start.Environment["SteamAppId"] = appId.ToString(CultureInfo.InvariantCulture);
        start.Environment.Remove("SteamGameId");
        start.Environment.Remove("SteamOverlayGameId");
        Process? child = null;
        string? error;
        bool timedOut = false;
        try
        {
            child = Process.Start(start);
            if (child is null)
            {
                error = "worker_start_failed";
            }
            else
            {
                var worker = child;
                _ = worker.StandardError.BaseStream.CopyToAsync(Stream.Null);
                error = await Task.Run(() => StreamProtocol.ReadStatusLine(worker.StandardOutput, "holding", appId)).WaitAsync(startTimeout);
                if (error is null)
                {
                    output.WriteLine(StreamProtocol.HoldingLine(appId));
                    error = await HoldUntilStopped(worker, input, releaseTimeout);
                }
            }
        }
        catch (TimeoutException)
        {
            timedOut = true;
            error = "worker_timeout";
        }
        catch (Win32Exception) when (child is null)
        {
            error = "worker_start_failed";
        }
        catch (Exception ex) when (ex is IOException or Win32Exception or InvalidOperationException)
        {
            error = "worker_failed";
        }
        finally
        {
            if (child is not null && !StopWorker(child, timedOut ? TimeSpan.Zero : ExitGrace))
                error = "worker_cleanup_failed";
        }
        if (error is not null)
            return Fail(output, error);
        output.WriteLine(StreamProtocol.ReleasedLine);
        return 0;
    }

    // Keeps the worker (and so the Steam connection) alive until the controller says stop or goes away.
    private static async Task<string?> HoldUntilStopped(Process worker, TextReader input, TimeSpan releaseTimeout)
    {
        var stopRequested = Task.Run(() => StreamProtocol.WaitForStop(input));
        var exited = worker.WaitForExitAsync();
        if (await Task.WhenAny(stopRequested, exited) == exited)
            return "worker_failed";
        try
        {
            await worker.StandardInput.WriteLineAsync("stop");
            worker.StandardInput.Close();
        }
        catch (IOException)
        {
            // The worker is already gone; the read below reports it.
        }
        string? error = await Task.Run(() => StreamProtocol.ReadStatusLine(worker.StandardOutput, "released", null)).WaitAsync(releaseTimeout);
        if (error is not null)
            return error;
        await worker.WaitForExitAsync().WaitAsync(releaseTimeout);
        return worker.ExitCode == 0 ? null : "worker_failed";
    }

    private static void Redirect(ProcessStartInfo start)
    {
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardInput = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        start.StandardInputEncoding = new UTF8Encoding(false);
    }

    private static bool WriteIds(StreamWriter stdin, IReadOnlyList<uint> ids)
    {
        try
        {
            foreach (uint id in ids)
                stdin.Write(id.ToString(CultureInfo.InvariantCulture) + "\n");
            stdin.Close();
            return true;
        }
        catch (IOException)
        {
            // The worker closed its input early; the missing answer is reported by the output reader.
            return false;
        }
    }

    private static bool StopWorker(Process child, TimeSpan grace)
    {
        using (child)
        {
            try
            {
                return child.HasExited || (grace > TimeSpan.Zero && child.WaitForExit(grace)) || IdentityWorker.TerminateTree(child);
            }
            catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or AggregateException)
            {
                return false;
            }
        }
    }

    private static int Fail(TextWriter output, string error)
    {
        output.WriteLine(StreamProtocol.FailedLine(error));
        return 4;
    }
}

/// <summary>Worker side: the code that runs inside the isolated child process.</summary>
internal static class StreamWorkers
{
    internal static int RunApps(TextReader input, TextWriter output, Func<IReadOnlyList<uint>, AppsResult> inspect)
    {
        var ids = new List<uint>();
        if (StreamProtocol.ReadAppIds(input, ids) is { } inputError)
        {
            output.WriteLine(StreamProtocol.FailedLine(inputError));
            return 2;
        }
        var result = inspect(ids);
        if (result.Status is not { Error: null, Identity: "expected_account_confirmed" } || result.Apps.Count != ids.Count)
        {
            output.WriteLine(StreamProtocol.FailedLine(result.Status.Error ?? "worker_failed"));
            return 4;
        }
        foreach (var flags in result.Apps)
            output.WriteLine(StreamProtocol.AppLine(flags));
        output.WriteLine(StreamProtocol.CompleteLine(result.Apps.Count));
        return 0;
    }

    /// <summary>
    /// Holds the connection open after announcing it. Returns 0 after a clean release, 4 on failure and 1
    /// when the parent died (nothing is printed then: nobody is listening).
    /// </summary>
    internal static int RunHold(uint appId, TextReader input, TextWriter output, CancellationToken parentGone,
        Func<Func<IdentityResult>, IdentityResult> hold)
    {
        var result = hold(() =>
        {
            if (!parentGone.IsCancellationRequested)
            {
                output.WriteLine(StreamProtocol.HoldingLine(appId));
                try
                {
                    Task.Run(() => StreamProtocol.WaitForStop(input)).Wait(parentGone);
                }
                catch (OperationCanceledException)
                {
                    // Parent death: leave the hold and release below.
                }
            }
            return new("connected", "expected_account_confirmed");
        });
        if (parentGone.IsCancellationRequested)
            return 1;
        if (result is not { Error: null, Identity: "expected_account_confirmed" })
        {
            output.WriteLine(StreamProtocol.FailedLine(result.Error ?? "worker_failed"));
            return 4;
        }
        output.WriteLine(StreamProtocol.ReleasedLine);
        return 0;
    }
}
