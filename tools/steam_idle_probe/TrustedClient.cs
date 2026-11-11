using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace SteamIdleProbe;

internal sealed class TrustedClient : IDisposable
{
    private const string ActiveProcessKey = @"Software\Valve\Steam\ActiveProcess";
    // Libraries loaded by absolute path; each must carry a valid Authenticode signature by Valve.
    private static readonly string[] ApprovedLibraries = ["tier0_s64.dll", "vstdlib_s64.dll", "steamclient64.dll"];
    private static readonly ISignatureReader DefaultReader = new WinTrustReader();

    private readonly Process _client;
    private readonly List<IDisposable> _locks = [];
    private readonly string _directory;

    private readonly ISignatureReader _reader;

    private TrustedClient(Process client, string directory, ISignatureReader reader)
    {
        _client = client;
        _directory = directory;
        _reader = reader;
    }

    internal static TrustedClient Open(ulong expected, ISignatureReader? reader = null)
    {
        if (!TryReadActiveUser(expected, out int pid))
            throw new ProbeException("active_account_unverified");
        using var current = Process.GetCurrentProcess();
        var client = Process.GetProcessById(pid);
        TrustedClient? installation = null;
        try
        {
            // Retain the process handle to make subsequent HasExited checks refer to this process.
            _ = client.SafeHandle;
            string? image = client.MainModule?.FileName;
            if (client.HasExited || client.SessionId != current.SessionId || image is null ||
                !string.Equals(Path.GetFileName(image), "steam.exe", StringComparison.OrdinalIgnoreCase))
                throw new ProbeException("client_process_unverified");
            string directory = Path.GetDirectoryName(image)!;
            if (!IsFixedDrivePath(directory) ||
                !string.Equals(Path.GetFullPath(image), image, StringComparison.OrdinalIgnoreCase))
                throw new ProbeException("client_path_untrusted");

            installation = new TrustedClient(client, directory, reader ?? DefaultReader);
            installation.LockApprovedFiles();
            return installation;
        }
        catch
        {
            if (installation is null)
                client.Dispose();
            else
                installation.Dispose();
            throw;
        }
    }

    internal static bool IsFixedDrivePath(string path) =>
        path.Length >= 3 && char.IsAsciiLetter(path[0]) && path[1] == ':' && path[2] == '\\' &&
        path.IndexOf(':', 2) == -1 && new DriveInfo(path[..3]).DriveType == DriveType.Fixed;

    private static bool TryReadActiveUser(ulong expected, out int pid)
    {
        using var active = Registry.CurrentUser.OpenSubKey(ActiveProcessKey);
        if (active?.GetValue("ActiveUser") is int user && unchecked((uint)user) == (uint)expected &&
            active.GetValue("pid") is int { } activePid && activePid > 0)
        {
            pid = activePid;
            return true;
        }
        pid = 0;
        return false;
    }

    internal bool MatchesActiveUser(ulong expected) =>
        !_client.HasExited && TryReadActiveUser(expected, out int pid) && pid == _client.Id;

    internal string LibraryPath(string name) => Path.Combine(_directory, name);

    private void LockApprovedFiles()
    {
        // Lock each path component against deletion and reject reparse points, including mount points.
        var directories = new Stack<string>();
        for (var dir = new DirectoryInfo(_directory); dir.Parent is not null; dir = dir.Parent)
            directories.Push(dir.FullName);
        foreach (var directory in directories)
        {
            const uint ReadAttributes = 0x80, ShareReadWrite = 1 | 2, OpenExisting = 3;
            const uint OpenDirectory = 0x02000000, OpenReparsePoint = 0x00200000;
            var handle = CreateFile(directory, ReadAttributes, ShareReadWrite, 0, OpenExisting,
                OpenDirectory | OpenReparsePoint, 0);
            _locks.Add(handle);
            if (handle.IsInvalid || (File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
                throw new ProbeException("client_path_untrusted");
        }
        foreach (var name in ApprovedLibraries)
        {
            string path = LibraryPath(name);
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new ProbeException("client_path_untrusted");
            var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            _locks.Add(file);
            // Verify the same locked handle, so the file cannot be swapped between the check and the load.
            string? rejection = SignaturePolicy.Check(_reader, file.SafeFileHandle);
            if (rejection is not null)
                throw new ProbeException(rejection);
        }
    }

    public void Dispose()
    {
        for (int index = _locks.Count - 1; index >= 0; index--)
            _locks[index].Dispose();
        _client.Dispose();
    }

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern SafeFileHandle CreateFile(string file, uint access, uint share, nint security,
        uint creation, uint flags, nint template);
}
