using System.Diagnostics;
using System.Reflection.PortableExecutable;
using System.Security;
using Microsoft.Win32;

namespace SteamIdleProbe;

internal sealed record BinaryInfo(string Status, string? Architecture = null, string? Version = null);
internal sealed record Installation(string Status, BinaryInfo? Client = null,
    BinaryInfo? Runtime32 = null, BinaryInfo? Runtime64 = null);
internal sealed record ProbeResult(Installation Installation, string Identity, string? Error = null);

internal static class Discovery
{
    internal static ProbeResult InspectWindows()
    {
        if (!OperatingSystem.IsWindows())
            return new(new("unknown"), "unknown", "unsupported_os");

        var candidates = new List<string>();
        bool discoveryIncomplete = false;
        string identity = "unknown";
        try
        {
            using var steam = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
            AddCandidate(steam, "SteamPath", candidates);
            using var activeProcess = steam?.OpenSubKey("ActiveProcess");
            identity = ClassifyIdentity(activeProcess?.GetValue("ActiveUser"));
        }
        catch (Exception ex) when (IsDiscoveryFailure(ex))
        {
            discoveryIncomplete = true;
        }

        foreach (var view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
        {
            if (view == RegistryView.Registry64 && !Environment.Is64BitOperatingSystem)
                continue;
            try
            {
                using var hive = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                using var steam = hive.OpenSubKey(@"SOFTWARE\Valve\Steam");
                AddCandidate(steam, "InstallPath", candidates);
            }
            catch (Exception ex) when (IsDiscoveryFailure(ex))
            {
                discoveryIncomplete = true;
            }
        }
        return Inspect(candidates, identity, discoveryIncomplete);
    }

    private static void AddCandidate(RegistryKey? key, string name, List<string> candidates)
    {
        if (key?.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) is { } value)
            candidates.Add(value as string ?? "");
    }

    internal static string ClassifyIdentity(object? registryValue) => registryValue switch
    {
        null or 0 => "no_registry_hint",
        int => "unverified_registry_hint",
        _ => "unknown",
    };

    internal static ProbeResult Inspect(IEnumerable<string> candidates, string identity,
        bool discoveryIncomplete = false)
    {
        BinaryInfo? invalidClient = null;
        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                // Registry data is a hint; reject UNC, device, relative and non-fixed roots.
                if (candidate.Length < 3 || !char.IsAsciiLetter(candidate[0]) ||
                    candidate[1] != ':' || candidate[2] is not ('/' or '\\'))
                {
                    discoveryIncomplete = true;
                    continue;
                }
                var root = Path.GetFullPath(candidate);
                if (new DriveInfo(Path.GetPathRoot(root)!).DriveType != DriveType.Fixed)
                {
                    discoveryIncomplete = true;
                    continue;
                }

                var client = InspectBinary(Path.Combine(root, "steam.exe"));
                if (client.Status == "readable")
                    return new(new("detected", client,
                        InspectBinary(Path.Combine(root, "steamclient.dll")),
                        InspectBinary(Path.Combine(root, "steamclient64.dll"))), identity);
                if (client.Status != "missing")
                    invalidClient ??= client;
            }
            catch (Exception ex) when (IsDiscoveryFailure(ex))
            {
                discoveryIncomplete = true;
            }
        }
        if (invalidClient is not null || discoveryIncomplete)
            return new(new("unknown", invalidClient), identity, "discovery_incomplete");
        return new(new("not_detected"), identity);
    }

    private static BinaryInfo InspectBinary(string path)
    {
        try
        {
            // Read metadata only; the PE image is never loaded or executed.
            using var file = new FileStream(path, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete);
            using var reader = new PEReader(file);
            var headers = reader.PEHeaders;
            if (headers.PEHeader is null)
                return new("invalid_pe");
            string machine = headers.CoffHeader.Machine switch
            {
                Machine.I386 => "x86",
                Machine.Amd64 => "x64",
                Machine.Arm64 => "arm64",
                _ => "unknown",
            };
            var version = FileVersionInfo.GetVersionInfo(path);
            return new("readable", machine,
                FormattableString.Invariant($"{version.FileMajorPart}.{version.FileMinorPart}.{version.FileBuildPart}.{version.FilePrivatePart}"));
        }
        catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException)
        {
            return new("missing");
        }
        catch (Exception ex) when (ex is BadImageFormatException or EndOfStreamException)
        {
            return new("invalid_pe");
        }
        catch (Exception ex) when (IsDiscoveryFailure(ex))
        {
            return new("unreadable");
        }
    }

    private static bool IsDiscoveryFailure(Exception ex) =>
        ex is IOException or UnauthorizedAccessException or SecurityException or ArgumentException or NotSupportedException;
}
