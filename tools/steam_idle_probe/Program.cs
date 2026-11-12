using System.Globalization;
using System.Text.Json;

namespace SteamIdleProbe;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static async Task<int> Main(string[] args)
    {
        if (args is ["--app-worker", var appExpected, var candidate, var parentIdText, var parentStartedText] &&
            ClientIdentity.TryParse(appExpected, out ulong appWorkerId) && TryAppId(candidate, out uint workerAppId) &&
            int.TryParse(parentIdText, out int parentId) && long.TryParse(parentStartedText, out long parentStarted))
        {
            using var parent = IdentityWorker.WatchParent(parentId, parentStarted);
            if (parent is null)
                return 1;
            return IdentityWorker.Encode(ClientIdentity.InspectWindows(appWorkerId, workerAppId));
        }

        if (args is ["--identity-worker", var workerExpected, var identityParentId, var identityParentStarted] &&
            ClientIdentity.TryParse(workerExpected, out ulong workerId) &&
            TryParent(identityParentId, identityParentStarted, out int workerParentId, out long workerParentStarted))
        {
            using var parent = IdentityWorker.WatchParent(workerParentId, workerParentStarted);
            return parent is null ? 1 : IdentityWorker.Encode(ClientIdentity.InspectWindows(workerId));
        }

        if (args is ["--apps-worker", var appsWorkerExpected, var appsParentId, var appsParentStarted] &&
            ClientIdentity.TryParse(appsWorkerExpected, out ulong appsWorkerId) &&
            TryParent(appsParentId, appsParentStarted, out int appsWorkerParentId, out long appsWorkerParentStarted))
        {
            using var parent = IdentityWorker.WatchParent(appsWorkerParentId, appsWorkerParentStarted);
            return parent is null ? 1 : StreamWorkers.RunApps(Console.In, Console.Out,
                ids => ClientIdentity.InspectWindowsApps(appsWorkerId, ids));
        }

        if (args is ["--hold-worker", var holdWorkerExpected, var holdWorkerApp, var holdParentId, var holdParentStarted] &&
            ClientIdentity.TryParse(holdWorkerExpected, out ulong holdWorkerId) && TryAppId(holdWorkerApp, out uint heldAppId) &&
            TryParent(holdParentId, holdParentStarted, out int holdWorkerParentId, out long holdWorkerParentStarted))
        {
            var parentGone = new CancellationTokenSource();
            using var parent = IdentityWorker.WatchParent(holdWorkerParentId, holdWorkerParentStarted, parentGone);
            return parent is null ? 1 : StreamWorkers.RunHold(heldAppId, Console.In, Console.Out, parentGone.Token,
                holding => ClientIdentity.HoldWindows(holdWorkerId, heldAppId, holding));
        }

        if (args is ["--achievements-worker", var achWorkerExpected, var achWorkerApp, var achParentId, var achParentStarted] &&
            ClientIdentity.TryParse(achWorkerExpected, out ulong achWorkerId) && TryAppId(achWorkerApp, out uint achAppId) &&
            TryParent(achParentId, achParentStarted, out int achWorkerParentId, out long achWorkerParentStarted))
        {
            var parentGone = new CancellationTokenSource();
            using var parent = IdentityWorker.WatchParent(achWorkerParentId, achWorkerParentStarted, parentGone);
            return parent is null ? 1 : StreamWorkers.RunAchievements(achAppId, Console.Out, parentGone.Token,
                () => ClientIdentity.InspectWindowsAchievements(achWorkerId, achAppId, parentGone.Token));
        }

        if (args is ["app", var expectedAppUser, var app] &&
            ClientIdentity.TryParse(expectedAppUser, out ulong appUser) && TryAppId(app, out uint appId))
        {
            var appResult = await IdentityWorker.Run(IdentityWorker.StartInfo(appUser, appId), TimeSpan.FromSeconds(8));
            if (appResult is { Error: null, Identity: "expected_account_confirmed", Subscribed: not null, Installed: not null })
                return Write(new
                {
                    protocolVersion = StreamProtocol.Version,
                    clientConnection = appResult.Connection,
                    identity = appResult.Identity,
                    steamOperations = "unsupported",
                    error = (string?)null,
                    appId,
                    subscribed = appResult.Subscribed.Value,
                    installed = appResult.Installed.Value
                }, 0);
            return Write(new
            {
                protocolVersion = StreamProtocol.Version,
                clientConnection = appResult.Connection,
                identity = "unverified",
                steamOperations = "unsupported",
                error = appResult.Error ?? "worker_failed"
            }, 4);
        }

        if (args is ["apps", var appsExpected] && ClientIdentity.TryParse(appsExpected, out ulong appsUser))
        {
            var ids = new List<uint>();
            if (StreamProtocol.ReadAppIds(Console.In, ids) is { } inputError)
            {
                Console.WriteLine(StreamProtocol.FailedLine(inputError));
                return 2;
            }
            return await StreamCommands.RunApps(IdentityWorker.WorkerStart("--apps-worker", appsUser), ids,
                Console.Out, TimeSpan.FromSeconds(60));
        }

        if (args is ["hold", var holdExpected, var holdApp] &&
            ClientIdentity.TryParse(holdExpected, out ulong holdUser) && TryAppId(holdApp, out uint holdAppId))
        {
            // Only the hold worker may carry a game context, so the parent still refuses an inherited one.
            if (ClientIdentity.InheritedGameContext())
            {
                Console.WriteLine(StreamProtocol.FailedLine("inherited_game_context"));
                return 4;
            }
            return await StreamCommands.RunHold(IdentityWorker.WorkerStart("--hold-worker", holdUser, holdAppId), holdAppId,
                Console.In, Console.Out, TimeSpan.FromSeconds(8), TimeSpan.FromSeconds(5));
        }

        if (args is ["achievements", var achExpected, var achApp] &&
            ClientIdentity.TryParse(achExpected, out ulong achUser) && TryAppId(achApp, out uint achievementsAppId))
        {
            // Read-only. Only the worker may carry a game context, so the parent still refuses an inherited one.
            if (ClientIdentity.InheritedGameContext())
            {
                Console.WriteLine(StreamProtocol.FailedLine("inherited_game_context"));
                return 4;
            }
            return await StreamCommands.RunAchievements(IdentityWorker.WorkerStart("--achievements-worker", achUser, achievementsAppId),
                achievementsAppId, Console.Out, TimeSpan.FromSeconds(30));
        }

        if (args is ["identity", var expected] && ClientIdentity.TryParse(expected, out ulong steamId))
        {
            var identityResult = await IdentityWorker.Run(IdentityWorker.StartInfo(steamId), TimeSpan.FromSeconds(8));
            return Write(new
            {
                protocolVersion = StreamProtocol.Version,
                clientConnection = identityResult.Connection,
                identity = identityResult.Identity,
                steamOperations = "unsupported",
                error = identityResult.Error,
            }, identityResult.Error is null ? 0 : 4);
        }

        if (args.Length != 1 || args[0] != "probe")
            return Write(new { protocolVersion = StreamProtocol.Version, error = "invalid_command" }, 2);

        var result = Discovery.InspectWindows();
        return Write(new
        {
            protocolVersion = StreamProtocol.Version,
            installation = result.Installation,
            identity = result.Identity,
            clientConnection = "not_attempted",
            steamOperations = "unsupported",
            error = result.Error,
        }, result.Error is null ? 0 : 3);
    }

    internal static bool TryAppId(string input, out uint appId) =>
        uint.TryParse(input, NumberStyles.None, CultureInfo.InvariantCulture, out appId) && appId != 0;

    private static bool TryParent(string idText, string startedText, out int id, out long started)
    {
        bool idValid = int.TryParse(idText, NumberStyles.None, CultureInfo.InvariantCulture, out id);
        bool startedValid = long.TryParse(startedText, NumberStyles.None, CultureInfo.InvariantCulture, out started);
        return idValid && startedValid;
    }

    private static int Write<T>(T response, int exitCode)
    {
        Console.WriteLine(JsonSerializer.Serialize(response, JsonOptions));
        return exitCode;
    }
}
