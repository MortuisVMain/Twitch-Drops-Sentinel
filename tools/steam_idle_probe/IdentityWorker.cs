using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;

namespace SteamIdleProbe;

internal static class IdentityWorker
{
    private static readonly IdentityResult[] Results =
    [
        new("connected", "expected_account_confirmed"),
        new("connected", "unverified", "user_interface_unsupported"),
        new("connected", "unverified", "client_offline"),
        new("connected", "unverified", "account_mismatch"),
        new("connected", "unverified", "active_account_changed"),
        new("unknown", "unverified", "pipe_release_failed"),
        new("not_connected", "unverified", "unsupported_platform"),
        new("not_connected", "unverified", "inherited_game_context"),
        new("not_connected", "unverified", "active_account_unverified"),
        new("not_connected", "unverified", "client_process_unverified"),
        new("not_connected", "unverified", "client_path_untrusted"),
        new("not_connected", "unverified", "client_build_unverified"),
        new("not_connected", "unverified", "active_account_changed"),
        new("not_connected", "unverified", "client_preflight_failed"),
        new("not_connected", "unverified", "client_export_unsupported"),
        new("not_connected", "unverified", "client_interface_unsupported"),
        new("not_connected", "unverified", "client_library_load_failed"),
        new("not_connected", "unverified", "client_method_unsupported"),
        new("not_connected", "unverified", "invalid_user_identity"),
        new("not_connected", "unverified", "pipe_unavailable"),
        new("not_connected", "unverified", "global_user_unavailable"),
        new("unknown", "unverified", "client_library_release_failed"),
        new("connected", "unverified", "apps_interface_unsupported"),
        new("connected", "expected_account_confirmed", null, false, false),
        new("connected", "expected_account_confirmed", null, false, true),
        new("connected", "expected_account_confirmed", null, true, false),
        new("connected", "expected_account_confirmed", null, true, true),
        new("not_connected", "unverified", "client_signer_untrusted"),
    ];
    private const int FirstResult = 64;
    internal static readonly TimeSpan ExitGrace = TimeSpan.FromSeconds(3);
    /// <summary>The unlock worker may be inside one bounded store wait when the parent dies; the forced exit waits for it.</summary>
    internal static readonly TimeSpan UnlockExitGrace = ExitGrace + AchievementWriter.StoreTimeout;

    internal static int Encode(IdentityResult result)
    {
        int index = Array.IndexOf(Results, result);
        return index < 0 ? 1 : index + FirstResult;
    }

    internal static ProcessStartInfo StartInfo(ulong steamId, uint? appId = null) =>
        WorkerStart(appId is null ? "--identity-worker" : "--app-worker", steamId, appId);

    /// <summary>Command line for a worker mode; every worker gets the parent identity for its death watchdog.</summary>
    internal static ProcessStartInfo WorkerStart(string mode, ulong steamId, uint? appId = null)
    {
        var start = new ProcessStartInfo(Environment.ProcessPath!);
        if (Path.GetFileNameWithoutExtension(start.FileName).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
            start.ArgumentList.Add(typeof(IdentityWorker).Assembly.Location);
        start.ArgumentList.Add(mode);
        start.ArgumentList.Add(steamId.ToString(CultureInfo.InvariantCulture));
        if (appId is uint candidate)
            start.ArgumentList.Add(candidate.ToString(CultureInfo.InvariantCulture));
        using var parent = Process.GetCurrentProcess();
        start.ArgumentList.Add(parent.Id.ToString(CultureInfo.InvariantCulture));
        start.ArgumentList.Add(parent.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture));
        return start;
    }

    /// <summary>
    /// Exits this process when the parent dies. With <paramref name="graceful"/> the token is cancelled first so the
    /// worker can release its Steam handles, and the exit is forced after a short grace period.
    /// </summary>
    internal static Process? WatchParent(int parentId, long parentStarted, CancellationTokenSource? graceful = null,
        TimeSpan? exitGrace = null)
    {
        Process? parent = null;
        try
        {
            parent = Process.GetProcessById(parentId);
            // Retain the opened process handle, protecting the monitor from PID reuse.
            _ = parent.SafeHandle;
            if (parent.HasExited || parent.StartTime.ToUniversalTime().Ticks != parentStarted)
            {
                parent.Dispose();
                return null;
            }
            _ = parent.WaitForExitAsync().ContinueWith(_ =>
                {
                    if (graceful is not null)
                    {
                        graceful.Cancel();
                        Thread.Sleep(exitGrace ?? ExitGrace);
                    }
                    Environment.Exit(1);
                },
                CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously | TaskContinuationOptions.OnlyOnRanToCompletion, TaskScheduler.Default);
            return parent;
        }
        catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or ArgumentException)
        {
            parent?.Dispose();
            return null;
        }
    }

    internal static async Task<IdentityResult> Run(ProcessStartInfo start, TimeSpan timeout,
        CancellationToken cancellationToken = default, Func<Process, bool>? terminate = null)
    {
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(timeout);
        Process? child = null;
        IdentityResult result;
        bool stopped = true;
        try
        {
            deadline.Token.ThrowIfCancellationRequested();
            child = Process.Start(start);
            if (child is null)
                return Unknown("worker_start_failed");
            var stdout = child.StandardOutput.BaseStream.CopyToAsync(Stream.Null, deadline.Token);
            var stderr = child.StandardError.BaseStream.CopyToAsync(Stream.Null, deadline.Token);
            await Task.WhenAll(stdout, stderr, child.WaitForExitAsync(deadline.Token)).WaitAsync(deadline.Token);
            int index = child.ExitCode - FirstResult;
            result = (uint)index < Results.Length ? Results[index] : Unknown("worker_failed");
        }
        catch (OperationCanceledException) when (deadline.IsCancellationRequested)
        {
            result = Unknown(cancellationToken.IsCancellationRequested ? "worker_cancelled" : "worker_timeout");
        }
        catch (Win32Exception) when (child is null)
        {
            result = Unknown("worker_start_failed");
        }
        catch (Exception ex) when (ex is IOException or Win32Exception or InvalidOperationException)
        {
            result = Unknown("worker_failed");
        }
        finally
        {
            if (child is not null)
            {
                using (child)
                {
                    try
                    {
                        stopped = child.HasExited || (terminate ?? Terminate)(child);
                    }
                    catch (Exception ex) when (ex is Win32Exception or InvalidOperationException)
                    {
                        stopped = false;
                    }
                }
            }
        }
        return stopped ? result : Unknown("worker_cleanup_failed");
    }

    internal static bool Terminate(Process child)
    {
        try
        {
            child.Kill();
        }
        catch (Exception ex) when ((ex is Win32Exception or InvalidOperationException) && child.HasExited)
        {
            // The child exited between HasExited and Kill.
            return true;
        }
        return child.WaitForExit(1000);
    }

    /// <summary>Kills the worker and everything it started.</summary>
    internal static bool TerminateTree(Process child)
    {
        try
        {
            child.Kill(entireProcessTree: true);
        }
        catch (Exception ex) when ((ex is Win32Exception or InvalidOperationException or AggregateException) && child.HasExited)
        {
            // The child exited between HasExited and Kill.
            return true;
        }
        return child.WaitForExit(1000);
    }

    private static IdentityResult Unknown(string error) => new("unknown", "unverified", error);
}
