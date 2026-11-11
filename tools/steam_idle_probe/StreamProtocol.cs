using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SteamIdleProbe;

/// <summary>Fixed-shape JSON lines exchanged with the apps and hold workers. Nothing else may cross the pipe.</summary>
internal static class StreamProtocol
{
    internal const int Version = 2;
    internal const int MaxApps = 10000;
    private const int MaxLine = 256;
    private const string Violation = "worker_protocol_violation";
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    private static readonly Regex ErrorCode = new("^[a-z][a-z0-9_]{0,63}$", RegexOptions.CultureInvariant);

    internal static readonly string ReleasedLine = Serialize(new { protocolVersion = Version, status = "released" });

    internal static string AppLine(AppFlags flags) => Serialize(new
    {
        protocolVersion = Version, appId = flags.AppId, subscribed = flags.Subscribed, installed = flags.Installed,
    });

    internal static string CompleteLine(int count) => Serialize(new { protocolVersion = Version, status = "complete", count });
    internal static string FailedLine(string error) => Serialize(new { protocolVersion = Version, status = "failed", error });
    internal static string HoldingLine(uint appId) => Serialize(new { protocolVersion = Version, status = "holding", appId });

    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    /// <summary>Reads one line without letting an untrusted peer grow it past <paramref name="max"/> characters.</summary>
    internal static string? ReadBoundedLine(TextReader reader, int max = MaxLine)
    {
        var line = new StringBuilder();
        int next;
        while ((next = reader.Read()) >= 0)
        {
            if (next == '\n')
            {
                if (line.Length > 0 && line[^1] == '\r')
                    line.Length--;
                return line.ToString();
            }
            line.Append((char)next);
            if (line.Length > max)
                throw new InvalidDataException("line_too_long");
        }
        return line.Length == 0 ? null : line.ToString();
    }

    /// <summary>Reads decimal AppIDs, one per line, until EOF. Returns null or an error code.</summary>
    internal static string? ReadAppIds(TextReader input, List<uint> ids)
    {
        var seen = new HashSet<uint>();
        try
        {
            while (ReadBoundedLine(input, 10) is { } line)
            {
                if (!Program.TryAppId(line, out uint id))
                    return "invalid_app_list";
                if (ids.Count == MaxApps)
                    return "too_many_apps";
                if (!seen.Add(id))
                    return "duplicate_app_id";
                ids.Add(id);
            }
        }
        catch (InvalidDataException)
        {
            return "invalid_app_list";
        }
        return null;
    }

    /// <summary>
    /// Validates the worker's whole answer: one line per AppID in input order, then completion, then EOF.
    /// Returns null when valid (canonical lines are added to <paramref name="lines"/>) or the error code to report.
    /// </summary>
    internal static string? ReadAppsOutput(TextReader output, IReadOnlyList<uint> ids, List<string> lines)
    {
        try
        {
            foreach (uint id in ids)
            {
                if (ReadBoundedLine(output) is not { } line)
                    return "worker_failed";
                using var document = JsonDocument.Parse(line);
                if (FailedCode(document.RootElement) is { } failure)
                    return failure;
                if (!TryAppFlags(document.RootElement, id, out var flags))
                    return Violation;
                lines.Add(AppLine(flags));
            }
            if (ReadBoundedLine(output) is not { } last)
                return "worker_failed";
            using var end = JsonDocument.Parse(last);
            if (FailedCode(end.RootElement) is { } error)
                return error;
            if (!HasShape(end.RootElement, "protocolVersion", "status", "count") || !IsStatus(end.RootElement, "complete") ||
                end.RootElement.GetProperty("count") is not { ValueKind: JsonValueKind.Number } countValue ||
                !countValue.TryGetInt32(out int count) || count != ids.Count)
                return Violation;
            return ReadBoundedLine(output) is null ? null : Violation;
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException)
        {
            return Violation;
        }
    }

    /// <summary>Expects exactly one status line ("holding" with the AppID, or "released"). Returns null or an error code.</summary>
    internal static string? ReadStatusLine(TextReader output, string status, uint? appId)
    {
        try
        {
            if (ReadBoundedLine(output) is not { } line)
                return "worker_failed";
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (FailedCode(root) is { } failure)
                return failure;
            bool valid = appId is uint id
                ? HasShape(root, "protocolVersion", "status", "appId") && root.GetProperty("appId") is { ValueKind: JsonValueKind.Number } appValue &&
                  appValue.TryGetUInt32(out uint seen) && seen == id
                : HasShape(root, "protocolVersion", "status");
            return valid && IsStatus(root, status) ? null : Violation;
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException)
        {
            return Violation;
        }
    }

    /// <summary>Blocks until a "stop" line or EOF. Unreadable control input also releases the hold, which is the safe outcome.</summary>
    internal static void WaitForStop(TextReader input)
    {
        try
        {
            while (ReadBoundedLine(input, 64) is { } line && line != "stop") { }
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            // Fall through to release.
        }
    }

    // Null when the line is not a failed-status line; otherwise the (validated) error code.
    private static string? FailedCode(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !IsStatus(root, "failed"))
            return null;
        return HasShape(root, "protocolVersion", "status", "error") && root.GetProperty("error").ValueKind == JsonValueKind.String &&
            root.GetProperty("error").GetString() is { } code && ErrorCode.IsMatch(code) ? code : Violation;
    }

    private static bool IsStatus(JsonElement root, string status) =>
        root.TryGetProperty("status", out var value) && value.ValueKind == JsonValueKind.String && value.GetString() == status;

    private static bool HasShape(JsonElement root, params string[] names) =>
        root.ValueKind == JsonValueKind.Object && root.EnumerateObject().Count() == names.Length &&
        names.All(name => root.TryGetProperty(name, out _)) &&
        root.GetProperty("protocolVersion") is { ValueKind: JsonValueKind.Number } version &&
        version.TryGetInt32(out int number) && number == Version;

    private static bool TryAppFlags(JsonElement root, uint expectedId, out AppFlags flags)
    {
        flags = new(expectedId, false, false);
        if (!HasShape(root, "protocolVersion", "appId", "subscribed", "installed") ||
            root.GetProperty("appId") is not { ValueKind: JsonValueKind.Number } appValue ||
            !appValue.TryGetUInt32(out uint id) || id != expectedId)
            return false;
        var subscribed = root.GetProperty("subscribed").ValueKind;
        var installed = root.GetProperty("installed").ValueKind;
        if (subscribed is not (JsonValueKind.True or JsonValueKind.False) ||
            installed is not (JsonValueKind.True or JsonValueKind.False))
            return false;
        flags = new(id, subscribed == JsonValueKind.True, installed == JsonValueKind.True);
        return true;
    }
}
