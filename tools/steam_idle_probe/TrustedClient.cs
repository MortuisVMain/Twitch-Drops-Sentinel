using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace SteamIdleProbe;

internal sealed class TrustedClient : IDisposable
{
    private const string ActiveProcessKey = @"Software\Valve\Steam\ActiveProcess";
    // SHA-256 of the Valve Authenticode-verified files inspected for this experiment.
    private static readonly (string Name, string Hash)[] ApprovedFiles =
    [
        ("steam.exe", "F8A4CA44008C516EEBECAFAA4BC26772B2A6EB0FEF8034BCE56A3311E21AB705"),
        ("tier0_s64.dll", "8559E6BD32EB3FDDD95079633272866DEB292211EC4F7E69AEB0EC48FDAFEF72"),
        ("vstdlib_s64.dll", "F63F348BB18460B3046DB5293A0646AF593FC9A21E6A2B1743E7E5074722B564"),
        ("steamclient64.dll", "253E0A11A4415B38C78A42F7BDD6ECC426455F06C1BA6453A48090DF3142DBBC"),
    ];

    private readonly Process _client;
    private readonly List<IDisposable> _locks = [];
    private readonly string _directory;

    private TrustedClient(Process client, string directory)
    {
        _client = client;
        _directory = directory;
    }

    internal static TrustedClient Open(ulong expected)
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

            installation = new TrustedClient(client, directory);
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
        foreach (var (name, hash) in ApprovedFiles)
        {
            string path = LibraryPath(name);
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new ProbeException("client_path_untrusted");
            var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            _locks.Add(file);
            if (!HasExpectedHash(file, hash))
                throw new ProbeException("client_build_unverified");
        }
    }

    internal static bool HasExpectedHash(Stream file, string hash) =>
        Convert.ToHexString(SHA256.HashData(file)).Equals(hash, StringComparison.Ordinal);

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
