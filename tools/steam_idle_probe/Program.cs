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

        if (args is ["app", var expectedAppUser, var app] &&
            ClientIdentity.TryParse(expectedAppUser, out ulong appUser) && TryAppId(app, out uint appId))
        {
            var appResult = await IdentityWorker.Run(IdentityWorker.StartInfo(appUser, appId), TimeSpan.FromSeconds(8));
            if (appResult is { Error: null, Identity: "expected_account_confirmed", Subscribed: not null, Installed: not null })
                return Write(new
                {
                    protocolVersion = 1,
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
                protocolVersion = 1,
                clientConnection = appResult.Connection,
                identity = "unverified",
                steamOperations = "unsupported",
                error = appResult.Error ?? "worker_failed"
            }, 4);
        }

        if (args is ["--identity-worker", var workerExpected] &&
            ClientIdentity.TryParse(workerExpected, out ulong workerId))
            return IdentityWorker.Encode(ClientIdentity.InspectWindows(workerId));

        if (args is ["identity", var expected] && ClientIdentity.TryParse(expected, out ulong steamId))
        {
            var identityResult = await IdentityWorker.Run(IdentityWorker.StartInfo(steamId), TimeSpan.FromSeconds(8));
            return Write(new
            {
                protocolVersion = 1,
                clientConnection = identityResult.Connection,
                identity = identityResult.Identity,
                steamOperations = "unsupported",
                error = identityResult.Error,
            }, identityResult.Error is null ? 0 : 4);
        }

        if (args.Length != 1 || args[0] != "probe")
            return Write(new { protocolVersion = 1, error = "invalid_command" }, 2);

        var result = Discovery.InspectWindows();
        return Write(new
        {
            protocolVersion = 1,
            installation = result.Installation,
            identity = result.Identity,
            clientConnection = "not_attempted",
            steamOperations = "unsupported",
            error = result.Error,
        }, result.Error is null ? 0 : 3);
    }

    private static bool TryAppId(string input, out uint appId) =>
        uint.TryParse(input, System.Globalization.NumberStyles.None,
            System.Globalization.CultureInfo.InvariantCulture, out appId) && appId != 0;

    private static int Write<T>(T response, int exitCode)
    {
        Console.WriteLine(JsonSerializer.Serialize(response, JsonOptions));
        return exitCode;
    }
}
