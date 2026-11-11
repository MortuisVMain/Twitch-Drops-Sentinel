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
            installation.LockApprovedFiles(image);
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

    /// <summary>
    /// Verifies the running client image first (released again at once), then locks and verifies each approved library.
    /// Locks are added to <paramref name="locks"/> as they are taken so the caller can release them on failure.
    /// </summary>
    internal static void VerifyInstallation(string image, ISignatureReader reader, List<IDisposable> locks)
    {
        string home = Path.GetDirectoryName(image)!;
        // Lock each path component against deletion and reject reparse points, including mount points.
        var directories = new Stack<string>();
        for (var dir = new DirectoryInfo(home); dir.Parent is not null; dir = dir.Parent)
            directories.Push(dir.FullName);
        foreach (var directory in directories)
        {
            const uint ReadAttributes = 0x80, ShareReadWrite = 1 | 2, OpenExisting = 3;
            const uint OpenDirectory = 0x02000000, OpenReparsePoint = 0x00200000;
            var handle = CreateFile(directory, ReadAttributes, ShareReadWrite, 0, OpenExisting,
                OpenDirectory | OpenReparsePoint, 0);
            locks.Add(handle);
            if (handle.IsInvalid || (File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
                throw new ProbeException("client_path_untrusted");
        }
        // Same signer policy as the libraries; the image is only held for the duration of the check.
        using (var running = OpenApprovedFile(image))
            Verify(reader, running);
        foreach (var name in ApprovedLibraries)
        {
            var file = OpenApprovedFile(Path.Combine(home, name));
            locks.Add(file);
            Verify(reader, file);
        }
    }

    // Verify the open handle itself, so the file cannot be swapped between the check and the load.
    private static void Verify(ISignatureReader reader, FileStream file)
    {
        string? rejection = SignaturePolicy.Check(reader, file.SafeFileHandle);
        if (rejection is not null)
            throw new ProbeException(rejection);
    }

    /// <summary>
    /// Opens a file for reading with read sharing and proves the open handle is the expected canonical file:
    /// not a reparse point, and its final path equals the requested path. Fails closed with client_path_untrusted.
    /// </summary>
    internal static FileStream OpenApprovedFile(string path)
    {
        const uint GenericRead = 0x80000000, ShareRead = 1, OpenExisting = 3, OpenReparsePoint = 0x00200000;
        const uint ReparseAttribute = 0x400;
        var handle = CreateFile(path, GenericRead, ShareRead, 0, OpenExisting, OpenReparsePoint, 0);
        try
        {
            if (handle.IsInvalid || !GetFileInformationByHandle(handle, out var info) ||
                (info.Attributes & ReparseAttribute) != 0 ||
                !string.Equals(FinalPath(handle), Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase))
                throw new ProbeException("client_path_untrusted");
            return new FileStream(handle, FileAccess.Read);
        }
        catch
        {
            handle.Dispose();
            throw;
        }
    }

    private static string? FinalPath(SafeFileHandle handle)
    {
        var buffer = new char[512];
        while (true)
        {
            uint length = GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Length, 0);
            if (length == 0)
                return null;
            if (length < buffer.Length)
            {
                var text = new string(buffer, 0, (int)length);
                return text.StartsWith(@"\\?\", StringComparison.Ordinal) && !text.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)
                    ? text[4..] : text;
            }
            buffer = new char[length + 1];
        }
    }

    private void LockApprovedFiles(string image) => VerifyInstallation(image, _reader, _locks);

    public void Dispose()
    {
        for (int index = _locks.Count - 1; index >= 0; index--)
            _locks[index].Dispose();
        _client.Dispose();
    }

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern SafeFileHandle CreateFile(string file, uint access, uint share, nint security,
        uint creation, uint flags, nint template);

    // BY_HANDLE_FILE_INFORMATION: attributes first, the remaining 12 DWORDs are unused here.
    [StructLayout(LayoutKind.Sequential)]
    private struct HandleInfo
    {
        public uint Attributes;
        public uint Created0, Created1, Accessed0, Accessed1, Written0, Written1;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }

    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle file, out HandleInfo info);

    [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle file, [Out] char[] path, uint length, uint flags);
}
