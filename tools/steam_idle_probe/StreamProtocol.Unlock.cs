using System.Text;
using System.Text.Json;

namespace SteamIdleProbe;

/// <summary>
/// What the parent knows about a possible write. <see cref="Started"/> is set by the reader of a worker's output as soon as a
/// line says a write may have started; the other fields keep <see cref="Wrote"/> on the safe side when the reader stops early.
/// </summary>
internal sealed class WriteProgress
{
    /// <summary>The exit code a worker uses after a failure that happened before any write.</summary>
    internal const int PreWriteExit = 4;

    internal volatile bool Started;
    /// <summary>The names were handed (or are being handed) to a running worker.</summary>
    internal volatile bool Handed;
    /// <summary>The reader stopped on a violation, a failed line or an exception: whatever followed was never read.</summary>
    internal volatile bool StoppedEarly;
    /// <summary>The reader stopped on a well-formed failed line that came before any marker and claims no write.</summary>
    internal volatile bool PreWriteFailure;
    /// <summary>The worker could not be stopped, so it may still be running.</summary>
    internal volatile bool CleanupFailed;
    /// <summary>Set only when the worker ended by itself (not by a kill) after a failed line.</summary>
    internal int? ExitCode;

    /// <summary>True unless the account is known to be untouched; under-reporting is the one thing that must never happen.</summary>
    internal bool Wrote => Started || (CleanupFailed && Handed) ||
        (StoppedEarly && !(PreWriteFailure && ExitCode == PreWriteExit));
}

// Lines of the WRITE command `unlock` and the read-only `achievements-selfcheck`. Static fields here must not depend on
// the other part of this class (initialisation order across partial files is unspecified), so lines are built on demand.
internal static partial class StreamProtocol
{
    /// <summary>The second gate: the parent environment must hold exactly "1" for `unlock` to do anything.</summary>
    internal const string WriteGate = "SENTINEL_STEAM_IDLE_ALLOW_WRITE";

    internal const int MaxNames = 200;
    private const int MaxUnlockLine = 4000;
    private const string InvalidNames = "invalid_name_list";
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly string[] NoWriteResults = ["already", "unknown"];
    private static readonly string[] StoreResults = ["unlocked", "store_failed", "pending", "unconfirmed"];
    private static readonly string[] AllResults = ["unlocked", "already", "unknown", "rejected", "store_failed", "pending", "unconfirmed"];

    internal static bool WriteAllowed(Func<string, string?>? environment = null) =>
        (environment ?? Environment.GetEnvironmentVariable)(WriteGate) == "1";

    /// <summary>Worker to parent only: the next thing the worker does may change the account. Never forwarded.</summary>
    internal static string WritingLine => Serialize(new { protocolVersion = Version, status = "writing" });

    internal static string UnlockLine(string apiName, string result) => Serialize(new { protocolVersion = Version, apiName, result });

    internal static string UnlockCompleteLine(uint appId, int requested, int unlocked, string stored) =>
        Serialize(new { protocolVersion = Version, status = "complete", appId, requested, unlocked, stored });

    /// <summary>A failure line; <paramref name="wrote"/> adds wrote:true, meaning the account state is now uncertain.</summary>
    internal static string UnlockFailedLine(string error, bool wrote) =>
        wrote ? Serialize(new { protocolVersion = Version, status = "failed", error, wrote = true }) : FailedLine(error);

    internal static string SelfCheckCompleteLine(uint appId, int count, int anchorChecked) =>
        Serialize(new { protocolVersion = Version, status = "complete", appId, count, anchorChecked });

    /// <summary>
    /// Reads API names (UTF-8 bytes, one per line, 1 to 200) until EOF. The text decoder of the console is not used: the
    /// bytes are decoded strictly here. Returns null or invalid_name_list / duplicate_name.
    /// </summary>
    internal static string? ReadNames(Stream input, List<string> names)
    {
        var all = new MemoryStream();
        var chunk = new byte[4096];
        int read;
        while ((read = input.Read(chunk, 0, chunk.Length)) > 0)
        {
            // 200 names of 256 bytes, each with CRLF, is the most a valid list can be.
            if (all.Length + read > MaxNames * (AchievementReader.MaxApiNameBytes + 2))
                return InvalidNames;
            all.Write(chunk, 0, read);
        }
        var bytes = all.ToArray();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (int start = 0; start < bytes.Length;)
        {
            int end = Array.IndexOf(bytes, (byte)'\n', start);
            int stop = end < 0 ? bytes.Length : end;
            var line = bytes.AsSpan(start, stop - start);
            start = stop + 1;
            if (line.Length > 0 && line[^1] == '\r')
                line = line[..^1];
            string text;
            try
            {
                text = StrictUtf8.GetString(line);
            }
            catch (DecoderFallbackException)
            {
                return InvalidNames;
            }
            if (!AchievementReader.IsApiName(text) || names.Count == MaxNames)
                return InvalidNames;
            if (!seen.Add(text))
                return "duplicate_name";
            names.Add(text);
        }
        return names.Count == 0 ? InvalidNames : null;
    }

    /// <summary>
    /// Validates the whole answer of an unlock worker: an optional "writing" marker, one result line per name in input order,
    /// one complete line, EOF. Canonical result lines and the canonical complete line are added to <paramref name="lines"/>.
    /// <paramref name="progress"/> is marked as soon as the marker (or a wrote:true failure) is read, so it stays correct
    /// when the stream later breaks. Returns null or the error code to report.
    /// </summary>
    internal static string? ReadUnlockOutput(TextReader output, uint appId, IReadOnlyList<string> names, WriteProgress progress,
        List<string> lines)
    {
        string? error = ReadUnlockLines(output, appId, names, progress, lines, out bool endOfStream);
        // Every early stop except a plain end of stream leaves lines unread, and a marker may be among them.
        if (error is not null && !endOfStream)
            progress.StoppedEarly = true;
        return error;
    }

    private static string? ReadUnlockLines(TextReader output, uint appId, IReadOnlyList<string> names, WriteProgress progress,
        List<string> lines, out bool endOfStream)
    {
        endOfStream = false;
        try
        {
            bool marker = false;
            var results = new List<string>();
            while (true)
            {
                if (ReadBoundedLine(output, MaxUnlockLine) is not { } line)
                {
                    endOfStream = true;
                    return "worker_failed";
                }
                using var document = JsonDocument.Parse(line);
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                    return Violation;
                if (IsStatus(root, "failed"))
                    return UnlockFailure(root, progress, !marker && results.Count == 0);
                if (IsStatus(root, "writing"))
                {
                    if (marker || results.Count > 0 || !HasShape(root, "protocolVersion", "status"))
                        return Violation;
                    marker = progress.Started = true;
                    continue;
                }
                if (IsStatus(root, "complete"))
                {
                    if (!TryUnlockEnd(root, appId, names.Count, results, marker, out string complete) || ReadBoundedLine(output) is not null)
                        return Violation;
                    lines.Add(complete);
                    return null;
                }
                if (results.Count == names.Count || !TryUnlockResult(root, names[results.Count], out string result))
                    return Violation;
                lines.Add(UnlockLine(names[results.Count], result));
                results.Add(result);
            }
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException or InvalidOperationException)
        {
            return Violation;
        }
    }

    // A failed line is "failed" + error, optionally + wrote:true. wrote:false is not a thing, so it is a violation.
    private static string UnlockFailure(JsonElement root, WriteProgress progress, bool first)
    {
        bool withWrote = root.TryGetProperty("wrote", out var flag);
        if (withWrote && flag.ValueKind == JsonValueKind.True)
            progress.Started = true; // the claim counts even if the rest of the line turns out to be malformed
        if (withWrote && flag.ValueKind != JsonValueKind.True)
            return Violation;
        string[] shape = withWrote ? ["protocolVersion", "status", "error", "wrote"] : ["protocolVersion", "status", "error"];
        if (!HasShape(root, shape) || root.GetProperty("error") is not { ValueKind: JsonValueKind.String } error ||
            SafeString(error) is not { } code || !ErrorCode.IsMatch(code))
            return Violation;
        progress.PreWriteFailure = first && !withWrote;
        return code;
    }

    private static bool TryUnlockResult(JsonElement root, string expectedName, out string result)
    {
        result = "";
        if (!HasShape(root, "protocolVersion", "apiName", "result") ||
            root.GetProperty("apiName") is not { ValueKind: JsonValueKind.String } api || api.GetString() != expectedName ||
            root.GetProperty("result") is not { ValueKind: JsonValueKind.String } value || value.GetString() is not { } text ||
            !AllResults.Contains(text))
            return false;
        result = text;
        return true;
    }

    private static bool TryUnlockEnd(JsonElement root, uint appId, int requested, List<string> results, bool marker, out string complete)
    {
        complete = "";
        int unlocked = results.Count(result => result == "unlocked");
        if (!HasShape(root, "protocolVersion", "status", "appId", "requested", "unlocked", "stored") || results.Count != requested ||
            root.GetProperty("appId") is not { ValueKind: JsonValueKind.Number } appValue || !appValue.TryGetUInt32(out uint app) || app != appId ||
            root.GetProperty("requested") is not { ValueKind: JsonValueKind.Number } requestedValue ||
            !requestedValue.TryGetInt32(out int count) || count != requested ||
            root.GetProperty("unlocked") is not { ValueKind: JsonValueKind.Number } unlockedValue ||
            !unlockedValue.TryGetInt32(out int claimed) || claimed != unlocked ||
            root.GetProperty("stored") is not { ValueKind: JsonValueKind.String } storedValue || storedValue.GetString() is not { } stored ||
            !UnlockConsistent(results, stored, marker))
            return false;
        complete = UnlockCompleteLine(appId, requested, unlocked, stored);
        return true;
    }

    /// <summary>
    /// The marker is there exactly when some name was handed to SetAchievement (any result but already/unknown), and the
    /// store state must fit the results: yes after a confirmed store, timeout without a callback, no after a refused store
    /// or an error callback, not_needed when nothing went through StoreStats.
    /// </summary>
    private static bool UnlockConsistent(List<string> results, string stored, bool marker)
    {
        string[]? allowed = stored switch
        {
            "not_needed" => ["already", "unknown", "rejected"],
            "yes" => ["already", "unknown", "rejected", "unlocked", "unconfirmed"],
            "timeout" => ["already", "unknown", "rejected", "pending", "unconfirmed"],
            "no" => ["already", "unknown", "rejected", "store_failed", "pending", "unconfirmed"],
            _ => null,
        };
        return allowed is not null && results.All(allowed.Contains) &&
            marker == results.Any(result => !NoWriteResults.Contains(result)) &&
            results.Any(StoreResults.Contains) == (stored != "not_needed") &&
            !(results.Contains("store_failed") && (results.Contains("pending") || results.Contains("unconfirmed")));
    }

    /// <summary>Validates the one line of a selfcheck worker. Returns null (canonical line added) or the error code.</summary>
    internal static string? ReadSelfCheckOutput(TextReader output, uint appId, List<string> lines)
    {
        try
        {
            if (ReadBoundedLine(output) is not { } line)
                return "worker_failed";
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (FailedCode(root) is { } failure)
                return failure;
            if (!HasShape(root, "protocolVersion", "status", "appId", "count", "anchorChecked") || !IsStatus(root, "complete") ||
                root.GetProperty("appId") is not { ValueKind: JsonValueKind.Number } appValue || !appValue.TryGetUInt32(out uint app) || app != appId ||
                root.GetProperty("count") is not { ValueKind: JsonValueKind.Number } countValue || !countValue.TryGetInt32(out int count) ||
                count is < 0 or > AchievementReader.MaxAchievements ||
                root.GetProperty("anchorChecked") is not { ValueKind: JsonValueKind.Number } anchorValue ||
                !anchorValue.TryGetInt32(out int anchored) || anchored != Math.Min(count, AchievementWriter.AnchorCount) ||
                ReadBoundedLine(output) is not null)
                return Violation;
            lines.Add(SelfCheckCompleteLine(appId, count, anchored));
            return null;
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException or InvalidOperationException)
        {
            return Violation;
        }
    }
}
