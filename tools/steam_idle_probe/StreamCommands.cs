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

    /// <summary>READ-ONLY achievements: one worker with SteamAppId set, every line validated, nothing printed unless all of it is valid.</summary>
    internal static async Task<int> RunAchievements(ProcessStartInfo start, uint appId, TextWriter output, TimeSpan timeout)
    {
        Redirect(start);
        // A game context is created on purpose, for the worker only; the parent has already refused an inherited one.
        start.Environment["SteamAppId"] = appId.ToString(CultureInfo.InvariantCulture);
        start.Environment.Remove("SteamGameId");
        start.Environment.Remove("SteamOverlayGameId");
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
                worker.StandardInput.Close();
                error = await Task.Run(() => StreamProtocol.ReadAchievementsOutput(worker.StandardOutput, appId, lines)).WaitAsync(deadline.Token);
                if (error is null)
                {
                    await worker.WaitForExitAsync(deadline.Token);
                    if (worker.ExitCode != 0)
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
        output.WriteLine(StreamProtocol.AchievementsCompleteLine(appId, lines.Count));
        return 0;
    }

    /// <summary>
    /// WRITE `unlock`: one worker with SteamAppId set, the validated names on its stdin, every line validated, nothing printed
    /// until all of it is valid. A failure is reported with wrote:true unless the account is known to be untouched (see
    /// <see cref="WriteProgress.Wrote"/>). <paramref name="readOverride"/> and <paramref name="terminate"/> are test hooks.
    /// </summary>
    internal static async Task<int> RunUnlock(ProcessStartInfo start, uint appId, IReadOnlyList<string> names, TextWriter output,
        TimeSpan timeout, Func<TextReader, string?>? readOverride = null, Func<Process, bool>? terminate = null)
    {
        var progress = new WriteProgress();
        var lines = new List<string>();
        string? error = await RunBuffered(start, appId, names, timeout,
            readOverride ?? (reader => StreamProtocol.ReadUnlockOutput(reader, appId, names, progress, lines)), progress, terminate);
        if (error is not null)
            return FailLine(output, StreamProtocol.UnlockFailedLine(error, progress.Wrote));
        foreach (var line in lines)
            output.WriteLine(line);
        return 0;
    }

    /// <summary>READ-ONLY `achievements-selfcheck`; the write gate is never handed to its worker.</summary>
    internal static async Task<int> RunSelfCheck(ProcessStartInfo start, uint appId, TextWriter output, TimeSpan timeout)
    {
        start.Environment.Remove(StreamProtocol.WriteGate);
        var lines = new List<string>();
        string? error = await RunBuffered(start, appId, null, timeout, reader => StreamProtocol.ReadSelfCheckOutput(reader, appId, lines));
        if (error is not null)
            return Fail(output, error);
        foreach (var line in lines)
            output.WriteLine(line);
        return 0;
    }

    // Shared skeleton of the two commands above: start, feed the names, read through a validator, wait for a clean exit,
    // then kill what is left. The reader task is awaited again after the kill so that a "writing" marker that was still
    // in the pipe is not missed (wrote must never be under-reported).
    private static async Task<string?> RunBuffered(ProcessStartInfo start, uint appId, IReadOnlyList<string>? names, TimeSpan timeout,
        Func<TextReader, string?> read, WriteProgress? progress = null, Func<Process, bool>? terminate = null)
    {
        Redirect(start);
        start.Environment["SteamAppId"] = appId.ToString(CultureInfo.InvariantCulture);
        start.Environment.Remove("SteamGameId");
        start.Environment.Remove("SteamOverlayGameId");
        using var deadline = new CancellationTokenSource(timeout);
        Process? child = null;
        Task<string?>? reading = null;
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
                if (progress is not null && names is not null)
                    progress.Handed = true;
                _ = worker.StandardError.BaseStream.CopyToAsync(Stream.Null);
                var write = Task.Run(() => WriteNames(worker.StandardInput, names));
                reading = Task.Run(() => read(worker.StandardOutput));
                error = await reading.WaitAsync(deadline.Token);
                if (error is not null && progress is { PreWriteFailure: true })
                    progress.ExitCode = await ExitedByItself(worker, deadline.Token);
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
        catch (Exception)
        {
            // Any other exception, from the reader included: the single result line must still be printed, and whatever
            // the reader had not reached yet counts as possibly written.
            if (progress is not null)
                progress.StoppedEarly = true;
            error = "worker_failed";
        }
        finally
        {
            if (child is not null)
            {
                using (child)
                {
                    stopped = TryStop(child, deadline.IsCancellationRequested ? TimeSpan.Zero : ExitGrace, terminate);
                    if (reading is not null)
                        await Settle(reading); // before Dispose: that would close the pipe under the reader
                }
            }
        }
        if (!stopped && progress is not null)
            progress.CleanupFailed = true;
        return stopped ? error : "worker_cleanup_failed";
    }

    // The exit code of a worker that ends on its own within the grace period; null when it has to be killed.
    private static async Task<int?> ExitedByItself(Process worker, CancellationToken deadline)
    {
        using var grace = CancellationTokenSource.CreateLinkedTokenSource(deadline);
        grace.CancelAfter(ExitGrace);
        try
        {
            await worker.WaitForExitAsync(grace.Token);
            return worker.ExitCode;
        }
        catch (OperationCanceledException) when (!deadline.IsCancellationRequested)
        {
            return null;
        }
    }

    // After the worker is gone its pipe ends, so the reader finishes; whatever it still reports has already been recorded.
    private static async Task Settle(Task<string?> reading)
    {
        try
        {
            await reading.WaitAsync(ExitGrace);
        }
        catch (Exception)
        {
            // The outcome was decided before the kill; only the progress flag mattered here. Whatever the reader threw
            // (it is untrusted-input code) must not replace the single result line.
        }
    }

    private static bool WriteNames(StreamWriter stdin, IReadOnlyList<string>? names)
    {
        try
        {
            foreach (string name in names ?? [])
                stdin.Write(name + "\n");
            stdin.Close();
            return true;
        }
        catch (IOException)
        {
            // The worker closed its input early; the missing answer is reported by the output reader.
            return false;
        }
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
            return TryStop(child, grace);
    }

    private static bool TryStop(Process child, TimeSpan grace, Func<Process, bool>? terminate = null)
    {
        try
        {
            return child.HasExited || (grace > TimeSpan.Zero && child.WaitForExit(grace)) || (terminate ?? IdentityWorker.TerminateTree)(child);
        }
        catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or AggregateException)
        {
            return false;
        }
    }

    private static int Fail(TextWriter output, string error) => FailLine(output, StreamProtocol.FailedLine(error));

    private static int FailLine(TextWriter output, string failedLine)
    {
        output.WriteLine(failedLine);
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

    /// <summary>READ-ONLY achievements worker: prints the lines only after the client session is fully released. Exit 1 when the parent died.</summary>
    internal static int RunAchievements(uint appId, TextWriter output, CancellationToken parentGone, Func<AchievementsResult> read)
    {
        var result = read();
        if (parentGone.IsCancellationRequested)
            return 1;
        if (result.Status is not { Error: null, Identity: "expected_account_confirmed" })
        {
            output.WriteLine(StreamProtocol.FailedLine(result.Status.Error ?? "worker_failed"));
            return 4;
        }
        foreach (var item in result.Items)
            output.WriteLine(StreamProtocol.AchievementLine(item));
        output.WriteLine(StreamProtocol.AchievementsCompleteLine(appId, result.Items.Count));
        return 0;
    }

    /// <summary>
    /// WRITE worker of `unlock`. The "writing" marker goes out right before the first SetAchievement, so the parent knows a
    /// failure after it leaves the account uncertain. Exit 2 on input errors (before any native call), 1 when the parent died.
    /// </summary>
    internal static int RunUnlock(uint appId, bool writeAllowed, Stream input, TextWriter output, CancellationToken parentGone,
        Func<IReadOnlyList<string>, Action, UnlockResult> unlock)
    {
        if (!writeAllowed)
        {
            output.WriteLine(StreamProtocol.FailedLine("write_not_allowed"));
            return 4;
        }
        var names = new List<string>();
        if (StreamProtocol.ReadNames(input, names) is { } inputError)
        {
            output.WriteLine(StreamProtocol.FailedLine(inputError));
            return 2;
        }
        bool wrote = false;
        var result = unlock(names, () =>
        {
            wrote = true;
            output.WriteLine(StreamProtocol.WritingLine);
        });
        if (parentGone.IsCancellationRequested)
            return 1;
        if (result.Status is not { Error: null, Identity: "expected_account_confirmed" } || result.Report is not { } report ||
            report.Results.Count != names.Count)
        {
            output.WriteLine(StreamProtocol.UnlockFailedLine(result.Status.Error ?? "worker_failed", wrote));
            return 4;
        }
        for (int index = 0; index < names.Count; index++)
            output.WriteLine(StreamProtocol.UnlockLine(names[index], report.Results[index]));
        output.WriteLine(StreamProtocol.UnlockCompleteLine(appId, names.Count, report.Results.Count(r => r == "unlocked"), report.Stored));
        return 0;
    }

    /// <summary>READ-ONLY selfcheck worker: the read and the anchor check of `unlock`, nothing written.</summary>
    internal static int RunSelfCheck(uint appId, TextWriter output, CancellationToken parentGone, Func<SelfCheckResult> check)
    {
        var result = check();
        if (parentGone.IsCancellationRequested)
            return 1;
        if (result.Status is not { Error: null, Identity: "expected_account_confirmed" })
        {
            output.WriteLine(StreamProtocol.FailedLine(result.Status.Error ?? "worker_failed"));
            return 4;
        }
        output.WriteLine(StreamProtocol.SelfCheckCompleteLine(appId, result.Count, result.AnchorChecked));
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
