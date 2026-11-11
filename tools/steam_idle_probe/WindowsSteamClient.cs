using System.Runtime.InteropServices;

namespace SteamIdleProbe;

internal interface IClientAppsNative
{
    bool HasAppsInterface(int user, int pipe);
    bool IsSubscribed(uint appId);
    bool IsInstalled(uint appId);
}

internal sealed class WindowsSteamClient : IClientIdentityNative, IClientAppsNative, IDisposable
{
    private const string ClientVersion = "SteamClient020";
    private const string UserVersion = "SteamUser023";
    private const uint SearchSystem32 = 0x00000800;
    private readonly List<nint> _modules = [];
    private nint _client;
    private nint _user;
    private nint _apps;

    private WindowsSteamClient() { }

    internal static WindowsSteamClient Load(TrustedClient installation)
    {
        var native = new WindowsSteamClient();
        try
        {
            // Preload the two verified imports by absolute path. Resolve their other imports in System32.
            native.LoadModule(installation.LibraryPath("tier0_s64.dll"));
            native.LoadModule(installation.LibraryPath("vstdlib_s64.dll"));
            nint steam = native.LoadModule(installation.LibraryPath("steamclient64.dll"));
            if (!NativeLibrary.TryGetExport(steam, "CreateInterface", out nint export))
                throw new ProbeException("client_export_unsupported");
            var create = Marshal.GetDelegateForFunctionPointer<CreateInterface>(export);
            native._client = create(ClientVersion, 0);
            if (native._client == 0)
                throw new ProbeException("client_interface_unsupported");
            return native;
        }
        catch
        {
            native.Dispose();
            throw;
        }
    }

    private nint LoadModule(string path)
    {
        nint module = LoadLibraryEx(path, 0, SearchSystem32);
        if (module == 0)
            throw new ProbeException("client_library_load_failed");
        _modules.Add(module);
        return module;
    }

    // Slot order is from Valve's SteamClient020 and SteamUser023 C++ interfaces.
    // https://github.com/ValveSoftware/source-sdk-2013/tree/e1f1fd42271805072f052051c26c21caa2c87b04/src/public/steam
    public int CreatePipe() => Bind<CreatePipeMethod>(_client, 0)(_client);
    public bool ReleasePipe(int pipe) => Bind<ReleasePipeMethod>(_client, 1)(_client, pipe);
    public int ConnectUser(int pipe) => Bind<ConnectUserMethod>(_client, 2)(_client, pipe);
    public void ReleaseUser(int pipe, int user) => Bind<ReleaseUserMethod>(_client, 4)(_client, pipe, user);

    public bool HasUserInterface(int user, int pipe)
    {
        _user = Bind<GetUserMethod>(_client, 5)(_client, user, pipe, UserVersion);
        return _user != 0;
    }

    public bool HasAppsInterface(int user, int pipe)
    {
        _apps = Bind<GetUserMethod>(_client, 15)(_client, user, pipe, "STEAMAPPS_INTERFACE_VERSION008");
        return _apps != 0;
    }

    public bool IsSubscribed(uint appId) => ReadAppFlag(_apps, 6, appId);
    public bool IsInstalled(uint appId) => ReadAppFlag(_apps, 19, appId);
    internal static bool ReadAppFlag(nint apps, int slot, uint appId) =>
        Bind<AppFlagMethod>(apps, slot)(apps, appId);

    public bool IsLoggedOn() => Bind<LoggedOnMethod>(_user, 1)(_user);
    public ulong ReadSteamId() => ReadSteamId(_user);

    internal static ulong ReadSteamId(nint user)
    {
        // MSVC x64 returns this nontrivial C++ class through a hidden buffer after 'this'.
        var read = Bind<GetIdMethod>(user, 2);
        if (read(user, out ulong id) == 0)
            throw new ProbeException("invalid_user_identity");
        return id;
    }

    private static T Bind<T>(nint instance, int slot) where T : Delegate
    {
        nint table = Marshal.ReadIntPtr(instance);
        nint method = table == 0 ? 0 : Marshal.ReadIntPtr(table, slot * IntPtr.Size);
        if (method == 0)
            throw new ProbeException("client_method_unsupported");
        return Marshal.GetDelegateForFunctionPointer<T>(method);
    }

    public void Dispose()
    {
        bool released = true;
        for (int index = _modules.Count - 1; index >= 0; index--)
            released &= FreeLibrary(_modules[index]);
        _modules.Clear();
        if (!released)
            throw new ProbeException("client_library_release_failed");
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate nint CreateInterface([MarshalAs(UnmanagedType.LPStr)] string version, nint returnCode);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int CreatePipeMethod(nint self);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private delegate bool ReleasePipeMethod(nint self, int pipe);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int ConnectUserMethod(nint self, int pipe);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate void ReleaseUserMethod(nint self, int pipe, int user);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate nint GetUserMethod(nint self, int user, int pipe, [MarshalAs(UnmanagedType.LPStr)] string version);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private delegate bool LoggedOnMethod(nint self);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate nint GetIdMethod(nint self, out ulong id);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    internal delegate bool AppFlagMethod(nint self, uint appId);

    [DllImport("kernel32.dll", EntryPoint = "LoadLibraryExW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern nint LoadLibraryEx(string path, nint file, uint flags);
    [DllImport("kernel32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FreeLibrary(nint module);
}
