using System;

using System.Diagnostics;

using System.Drawing;

using System.IO;

using System.Reflection;

using System.Runtime.InteropServices;

using System.Text;

using System.Text.Json;

using System.Threading.Tasks;

using System.Windows.Forms;

using Microsoft.Web.WebView2.Core;

using Microsoft.Web.WebView2.WinForms;

using System.Collections.Generic;

using System.Linq;

using System.Management;



namespace TwitchDropsSentinel

{

    public class MainForm : Form

    {

        [DllImport("dwmapi.dll", PreserveSig = true)]

        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);



        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool LockWorkStation();



        [DllImport("powrprof.dll", SetLastError = true)]

        private static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);



        [DllImport("user32.dll", CharSet = CharSet.Auto)]

        private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);



        private const uint WM_SETICON = 0x0080;

        private static readonly IntPtr ICON_SMALL = IntPtr.Zero;

        private static readonly IntPtr ICON_BIG = new IntPtr(1);



        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

        private const int DWMWA_BORDER_COLOR = 34;

        private const int DWMWA_CAPTION_COLOR = 35;

        private const int DWMWA_TEXT_COLOR = 36;

        private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;

        private const int DWMWCP_ROUND = 2;



        [DllImport("user32.dll")]

        public static extern bool ReleaseCapture();



        [DllImport("dwmapi.dll")]

        private static extern int DwmExtendFrameIntoClientArea(IntPtr hWnd, ref MARGINS pMarInset);



        [StructLayout(LayoutKind.Sequential)]

        private struct MARGINS

        {

            public int cxLeftWidth;

            public int cxRightWidth;

            public int cyTopHeight;

            public int cyBottomHeight;

        }



        private const int WM_NCLBUTTONDOWN = 0xA1;

        private const int HTCAPTION = 0x2;

        private const int WM_NCHITTEST = 0x84;

        private const int HTCLIENT = 1;

        private const int HTLEFT = 10;

        private const int HTRIGHT = 11;

        private const int HTTOP = 12;

        private const int HTTOPLEFT = 13;

        private const int HTTOPRIGHT = 14;

        private const int HTBOTTOM = 15;

        private const int HTBOTTOMLEFT = 16;

        private const int HTBOTTOMRIGHT = 17;



        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]

        public struct PHYSICAL_MONITOR

        {

            public IntPtr hPhysicalMonitor;

            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]

            public string szPhysicalMonitorDescription;

        }



        public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);



        [StructLayout(LayoutKind.Sequential)]

        public struct RECT

        {

            public int Left;

            public int Top;

            public int Right;

            public int Bottom;

        }



        [StructLayout(LayoutKind.Sequential)]

        public struct POINT

        {

            public int x;

            public int y;

            public POINT(int x, int y) { this.x = x; this.y = y; }

        }



        [StructLayout(LayoutKind.Sequential)]

        public struct MINMAXINFO

        {

            public POINT ptReserved;

            public POINT ptMaxSize;

            public POINT ptMaxPosition;

            public POINT ptMinTrackSize;

            public POINT ptMaxTrackSize;

        }



        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]

        public struct MONITORINFO

        {

            public int cbSize;

            public RECT rcMonitor;

            public RECT rcWork;

            public uint dwFlags;

        }



        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);



        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);



        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);



        private const int WM_MOVE = 0x0003;

        private const int WM_SIZE = 0x0005;

        private const int WM_GETMINMAXINFO = 0x0024;

        private const int WM_WINDOWPOSCHANGED = 0x0047;

        private const int WM_DPICHANGED = 0x02E0;
        private const int WM_EXITSIZEMOVE = 0x0232;



        private const uint SWP_NOSIZE = 0x0001;

        private const uint SWP_NOMOVE = 0x0002;

        private const uint SWP_NOZORDER = 0x0004;

        private const uint SWP_NOACTIVATE = 0x0010;

        private const uint SWP_FRAMECHANGED = 0x0020;

        private const uint SWP_NOOWNERZORDER = 0x0200;

        private const int MONITOR_DEFAULTTONEAREST = 2;



        [DllImport("user32.dll")]

        private static extern int GetSystemMetrics(int nIndex);



        private const int SM_CXSIZEFRAME = 32;

        private const int SM_CYSIZEFRAME = 33;

        private const int SM_CXPADDEDBORDER = 92;



        [DllImport("user32.dll")]

        public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);



        [DllImport("kernel32.dll", SetLastError = true)]

        public static extern uint SetThreadExecutionState(uint esFlags);



        public const uint ES_CONTINUOUS = 0x80000000;

        public const uint ES_SYSTEM_REQUIRED = 0x00000001;

        public const uint ES_AWAYMODE_REQUIRED = 0x00000040;



        [DllImport("dxva2.dll", SetLastError = true)]

        [return: MarshalAs(UnmanagedType.Bool)]

        public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint pdwNumberOfPhysicalMonitors);



        [DllImport("dxva2.dll", SetLastError = true)]

        [return: MarshalAs(UnmanagedType.Bool)]

        public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);



        [DllImport("dxva2.dll", SetLastError = true)]

        [return: MarshalAs(UnmanagedType.Bool)]

        public static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint pdwMinimumBrightness, out uint pdwCurrentBrightness, out uint pdwMaximumBrightness);



        [DllImport("dxva2.dll", SetLastError = true)]

        [return: MarshalAs(UnmanagedType.Bool)]

        public static extern bool SetMonitorBrightness(IntPtr hMonitor, uint dwNewBrightness);



        [DllImport("dxva2.dll", SetLastError = true)]

        [return: MarshalAs(UnmanagedType.Bool)]

        public static extern bool DestroyPhysicalMonitors(uint dwPhysicalMonitorArraySize, [In] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        public const int HOTKEY_ID_BLACKOUT = 9001;
        public const int HOTKEY_ID_RESTORE = 9002;
        public const uint MOD_ALT = 0x0001;
        public const uint MOD_SHIFT = 0x0004;
        public const uint VK_BACK = 0x08;



        [DllImport("user32.dll", SetLastError = true)]

        private static extern bool SetForegroundWindow(IntPtr hWnd);



        private const int SW_RESTORE = 9;

        private const int SW_MAXIMIZE = 3;



        private readonly WebView2 _webView;

        private NotifyIcon? _trayIcon;

        private Process? _pythonBackendProcess;

        private System.Windows.Forms.Timer? _backendWatchdogTimer;

        private volatile bool _isShuttingDown = false;

        private volatile bool _isForceClosing = false;
        private string _closeAction = "ask"; // ask | tray | exit
        private bool _closeDialogOpen;

        private FormWindowState _lastNonMinimizedState = FormWindowState.Normal;

        private readonly List<BlackoutOverlayForm> _activeBlackoutForms = new();

        private Rectangle _savedBoundsBeforePip;

        private bool _isPipMode = false;



        private class WindowStateConfig

        {

            public int X { get; set; }

            public int Y { get; set; }

            public int Width { get; set; }

            public int Height { get; set; }

            public bool IsMaximized { get; set; }

        }



        private static string GetWindowStateFilePath()

        {

            string dataDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "data");

            if (!Directory.Exists(dataDir))

            {

                Directory.CreateDirectory(dataDir);

            }

            return Path.Combine(dataDir, "window_state.json");

        }



        private void LoadWindowState()

        {

            try

            {

                string stateFile = GetWindowStateFilePath();

                if (File.Exists(stateFile))

                {

                    string json = File.ReadAllText(stateFile);

                    var state = JsonSerializer.Deserialize<WindowStateConfig>(json);

                    if (state != null && state.Width >= 1000 && state.Height >= 650)

                    {

                        Rectangle savedBounds = new Rectangle(state.X, state.Y, state.Width, state.Height);

                        bool isVisibleOnAnyScreen = false;

                        foreach (var screen in Screen.AllScreens)

                        {

                            Rectangle intersection = Rectangle.Intersect(screen.WorkingArea, savedBounds);

                            if (intersection.Width >= 200 && intersection.Height >= 200)

                            {

                                isVisibleOnAnyScreen = true;

                                break;

                            }

                        }



                        if (isVisibleOnAnyScreen)

                        {

                            StartPosition = FormStartPosition.Manual;

                            Bounds = savedBounds;

                            if (state.IsMaximized)

                            {

                                WindowState = FormWindowState.Maximized;

                            }

                            return;

                        }

                    }

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Failed to load window state: {ex.Message}");

            }



            // Spacious and comfortable initial default size

            Rectangle workingArea = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1920, 1080);

            int defaultWidth = Math.Min(1580, (int)(workingArea.Width * 0.92));

            int defaultHeight = Math.Min(980, (int)(workingArea.Height * 0.90));

            ClientSize = new Size(defaultWidth, defaultHeight);

            StartPosition = FormStartPosition.CenterScreen;

        }



        private void SaveWindowState()

        {

            try

            {

                if (WindowState == FormWindowState.Minimized) return;



                bool isMaximized = (WindowState == FormWindowState.Maximized);

                Rectangle boundsToSave = isMaximized ? RestoreBounds : Bounds;



                if (boundsToSave.Width < 800 || boundsToSave.Height < 600) return;



                var state = new WindowStateConfig

                {

                    X = boundsToSave.X,

                    Y = boundsToSave.Y,

                    Width = boundsToSave.Width,

                    Height = boundsToSave.Height,

                    IsMaximized = isMaximized

                };



                string stateFile = GetWindowStateFilePath();

                string json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });

                File.WriteAllText(stateFile, json);

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Failed to save window state: {ex.Message}");

            }

        }



        private readonly bool _startMinimized;



        public MainForm(bool startMinimized = false)

        {

            _brightnessDebouncer = new BrightnessDebouncer(
                (span, ct) => Task.Delay(span, ct),
                (id, level) => { lock (_brightnessDebounceLock) { return SetHardwareBrightness(id, level); } },
                ex => LogDesktopError("запись яркости монитора", ex));

            _startMinimized = startMinimized;

            Text = "Twitch Drops Sentinel";

            MinimumSize = new Size(1180, 750);

            BackColor = Color.FromArgb(5, 6, 8);

            FormBorderStyle = FormBorderStyle.None; // Frameless Luxury Window

            Padding = new Padding(3);



            // Load and restore previous window size & position

            LoadWindowState();
            LoadShellSettings();



            // Load app icon safely

            LoadAppIcon();



            // System tray icon initialization

            InitializeTrayIcon();



            // Ensure background Python service is active

            EnsurePythonBackendRunning();



            // Start continuous background watchdog to resurrect backend if it ever crashes/stops

            StartBackendWatchdog();



            _webView = new WebView2

            {

                Dock = DockStyle.Fill,

                DefaultBackgroundColor = Color.FromArgb(5, 6, 8)

            };

            Controls.Add(_webView);



            KeyPreview = true;

            KeyDown += (s, e) =>

            {

                if (e.KeyCode == Keys.F5)

                {

                    _webView?.CoreWebView2?.Reload();

                }

            };



            ResizeEnd += (s, e) => SaveWindowState();

            Move += (s, e) => { if (WindowState == FormWindowState.Normal) SaveWindowState(); };



            Shown += async (s, e) =>

            {

                await InitializeWebViewAsync();

                if (_startMinimized)

                {

                    BeginInvoke(new Action(() =>

                    {

                        WindowState = FormWindowState.Minimized;

                        Hide();

                    }));

                }

            };

        }



        private void StartBackendWatchdog()

        {

            _backendWatchdogTimer = new System.Windows.Forms.Timer();

            _backendWatchdogTimer.Interval = 4000; // Check every 4 seconds

            _backendWatchdogTimer.Tick += async (s, e) =>

            {

                try

                {

                    if (_isShuttingDown || IsDisposed) return;

                    bool isAlive = await CheckBackendAliveAsync();

                    if (!isAlive && !_isShuttingDown && !IsDisposed)

                    {

                        Debug.WriteLine("Sentinel Watchdog: Backend unreachable. Auto-reviving Python service...");

                        EnsurePythonBackendRunning();

                    }

                }

                catch (Exception ex)

                {

                    Debug.WriteLine($"Sentinel Watchdog Tick error: {ex.Message}");

                }

            };

            _backendWatchdogTimer.Start();

        }



        private static async Task<bool> CheckBackendAliveAsync()

        {

            try

            {

                using var client = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMilliseconds(800) };

                var res = await client.GetAsync("http://127.0.0.1:28492/api/state");

                return res.IsSuccessStatusCode;

            }

            catch

            {

                return false;

            }

        }



        private void EnsurePythonBackendRunning()

        {

            if (_isShuttingDown || IsDisposed) return;

            try

            {

                using var client = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMilliseconds(400) };

                var res = client.GetAsync("http://127.0.0.1:28492/api/state").GetAwaiter().GetResult();

                if (res.IsSuccessStatusCode)

                {

                    return;

                }

            }

            catch

            {

                // Service not responding; launch it

            }



            try

            {

                if (_pythonBackendProcess != null)

                {

                    try

                    {

                        if (!_pythonBackendProcess.HasExited)

                        {

                            _pythonBackendProcess.Kill(true);

                        }

                        _pythonBackendProcess.Dispose();

                    }

                    catch { }

                    _pythonBackendProcess = null;

                }



                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string scriptPath = Path.Combine(baseDir, "core", "sentinel_service.py");

                if (!File.Exists(scriptPath))

                {

                    scriptPath = Path.Combine(baseDir, "..", "core", "sentinel_service.py");

                }

                if (!File.Exists(scriptPath))

                {

                    scriptPath = Path.Combine(baseDir, "..", "..", "..", "..", "core", "sentinel_service.py");

                }

                if (!File.Exists(scriptPath))

                {

                    scriptPath = Path.Combine(Directory.GetCurrentDirectory(), "core", "sentinel_service.py");

                }



                if (File.Exists(scriptPath))

                {

                    string coreDir = Path.GetDirectoryName(scriptPath) ?? "";

                    string projectRoot = Directory.GetParent(coreDir)?.FullName ?? coreDir;



                    // Check for embedded portable Python first

                    string embeddedPython = Path.Combine(baseDir, "python", "python.exe");

                    if (!File.Exists(embeddedPython))

                    {

                        embeddedPython = Path.Combine(baseDir, "portable_runtime", "python", "python.exe");

                    }

                    if (!File.Exists(embeddedPython))

                    {

                        embeddedPython = Path.Combine(baseDir, "..", "..", "..", "..", "portable_runtime", "python", "python.exe");

                    }

                    if (!File.Exists(embeddedPython))

                    {

                        string[] sysPythons = new[]

                        {

                            @"C:\Program Files\Python314\python.exe",

                            @"C:\Program Files\Python313\python.exe",

                            @"C:\Program Files\Python312\python.exe",

                            @"C:\Program Files\Python311\python.exe",

                            @"C:\Program Files\Python310\python.exe",

                            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Python\Python312\python.exe"),

                            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Python\Python311\python.exe")

                        };

                        foreach (var sysPy in sysPythons)

                        {

                            if (File.Exists(sysPy))

                            {

                                embeddedPython = sysPy;

                                break;

                            }

                        }

                    }

                    string pythonExe = File.Exists(embeddedPython) ? embeddedPython : "python";



                    var psi = new ProcessStartInfo

                    {

                        FileName = pythonExe,

                        Arguments = $"-X utf8 \"{scriptPath}\"",

                        WorkingDirectory = projectRoot,

                        CreateNoWindow = true,

                        UseShellExecute = false,

                        RedirectStandardOutput = true,

                        RedirectStandardError = true,

                        StandardOutputEncoding = Encoding.UTF8,

                        StandardErrorEncoding = Encoding.UTF8

                    };

                    psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";

                    psi.EnvironmentVariables["PYTHONUTF8"] = "1";

                    psi.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";



                    _pythonBackendProcess = Process.Start(psi);

                    if (_pythonBackendProcess != null)

                    {

                        ChildProcessTracker.AddProcess(_pythonBackendProcess);

                        _pythonBackendProcess.EnableRaisingEvents = true;

                        string stdoutLog = Path.Combine(projectRoot, "sentinel_stdout.log");

                        string stderrLog = Path.Combine(projectRoot, "sentinel_stderr.log");



                        Action<string, string> writeRotatedLog = (filePath, line) =>

                        {

                            try

                            {

                                var fi = new FileInfo(filePath);

                                if (fi.Exists && fi.Length > 5 * 1024 * 1024)

                                {

                                    string oldPath = filePath + ".old";

                                    if (File.Exists(oldPath)) File.Delete(oldPath);

                                    File.Move(filePath, oldPath);

                                }

                                File.AppendAllText(filePath, line + Environment.NewLine, Encoding.UTF8);

                            }

                            catch { }

                        };



                        _pythonBackendProcess.OutputDataReceived += (s, e) =>

                        {

                            if (e.Data != null) writeRotatedLog(stdoutLog, e.Data);

                        };

                        _pythonBackendProcess.ErrorDataReceived += (s, e) =>

                        {

                            if (e.Data != null) writeRotatedLog(stderrLog, e.Data);

                        };

                        _pythonBackendProcess.BeginOutputReadLine();

                        _pythonBackendProcess.BeginErrorReadLine();

                        _pythonBackendProcess.Exited += (s, ev) =>

                        {

                            if (!_isShuttingDown && !IsDisposed)

                            {

                                Task.Delay(2000).ContinueWith(_ => EnsurePythonBackendRunning());

                            }

                        };

                    }

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Failed to auto-spawn Python backend: {ex.Message}");

            }

        }



        private void ShutdownBackend()

        {

            _isShuttingDown = true;

            _brightnessDebouncer.CancelAll();
            _hardwareCts.Cancel();
            try { _blackoutMute.Exit(() => AudioEndpointController.SetMute(false)); } catch (Exception ex) { LogDesktopError("возврат звука при закрытии", ex); }

            try

            {

                SetBlackout(false);

            }

            catch { }

            try

            {

                _backendWatchdogTimer?.Stop();

                _backendWatchdogTimer?.Dispose();

                _backendWatchdogTimer = null;

            }

            catch { }



            try

            {

                using var client = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(2) };

                client.PostAsync("http://127.0.0.1:28492/api/shutdown", null).GetAwaiter().GetResult();

            }

            catch

            {

                // Ignored

            }



            try

            {

                if (_pythonBackendProcess != null && !_pythonBackendProcess.HasExited)

                {

                    _pythonBackendProcess.WaitForExit(2500);

                    if (!_pythonBackendProcess.HasExited)

                    {

                        _pythonBackendProcess.Kill(true);

                    }

                    _pythonBackendProcess.Dispose();

                    _pythonBackendProcess = null;

                }

            }

            catch

            {

                // Ignored

            }

        }



        private void LoadAppIcon()

        {

            Icon = SystemIcons.Application;

            try

            {

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string[] candidatePaths = new[]

                {

                    Path.Combine(baseDir, "app.ico"),

                    Path.Combine(baseDir, "icon.ico"),

                    Path.Combine(Directory.GetCurrentDirectory(), "app.ico"),

                    Path.Combine(Directory.GetCurrentDirectory(), "icon.ico"),

                    Path.Combine(baseDir, "..", "..", "..", "..", "app.ico"),

                    Path.Combine(baseDir, "..", "..", "..", "..", "icon.ico")

                };



                foreach (var path in candidatePaths)

                {

                    if (File.Exists(path))

                    {

                        Icon = new Icon(path);

                        return;

                    }

                }



                using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("TwitchDropsSentinel.app.ico");

                if (stream != null)

                {

                    Icon = new Icon(stream);

                }

            }

            catch

            {

                Icon = SystemIcons.Application;

            }

        }



        protected override void OnHandleCreated(EventArgs e)

        {

            base.OnHandleCreated(e);

            try { RegisterHotKey(this.Handle, HOTKEY_ID_BLACKOUT, MOD_ALT, VK_BACK); } catch { }
            try { RegisterHotKey(this.Handle, HOTKEY_ID_RESTORE, MOD_ALT | MOD_SHIFT, VK_BACK); } catch { }
            LoadBaselineBrightness();

            LoadAppIcon();

            EnableDarkTitleBar();

            if (Icon != null)

            {

                try

                {

                    SendMessage(Handle, WM_SETICON, ICON_SMALL, Icon.Handle);

                    SendMessage(Handle, WM_SETICON, ICON_BIG, Icon.Handle);

                }

                catch { }

            }

        }



        private void EnableDarkTitleBar()

        {

            try

            {

                int darkMode = 1;

                DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));



                // Windows 11 Build 22000+: Override title bar caption, text and border colors

                // Eliminates blue title bar when Windows accent color is active

                // COLORREF format is 0x00BBGGRR:

                // Caption color #171d1c -> R=0x17, G=0x1D, B=0x1C -> 0x001C1D17

                int captionColor = 0x001C1D17;

                DwmSetWindowAttribute(Handle, DWMWA_CAPTION_COLOR, ref captionColor, sizeof(int));



                // Text color #e9eeec -> R=0xE9, G=0xEE, B=0xEC -> 0x00ECEEE9

                int textColor = 0x00ECEEE9;

                DwmSetWindowAttribute(Handle, DWMWA_TEXT_COLOR, ref textColor, sizeof(int));



                // Border color #303a35 -> R=0x30, G=0x3A, B=0x35 -> 0x00353A30

                int borderColor = 0x00353A30;

                DwmSetWindowAttribute(Handle, DWMWA_BORDER_COLOR, ref borderColor, sizeof(int));



                // Hardware rounded corners for Windows 11 Build 22000+

                int cornerPref = DWMWCP_ROUND;

                DwmSetWindowAttribute(Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref cornerPref, sizeof(int));



                // Native DWM drop shadow for frameless window

                var margins = new MARGINS { cxLeftWidth = 1, cxRightWidth = 1, cyTopHeight = 1, cyBottomHeight = 1 };

                DwmExtendFrameIntoClientArea(Handle, ref margins);

            }

            catch

            {

                // Ignored on legacy systems

            }

        }



        private async Task InitializeWebViewAsync()

        {

            try

            {

                string userDataFolder = Path.Combine(

                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),

                    "TwitchDropsSentinel",

                    "WebView2Data"

                );

                Directory.CreateDirectory(userDataFolder);



                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);

                await _webView.EnsureCoreWebView2Async(env);



                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

                _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

                _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;



                _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

                _webView.CoreWebView2.NewWindowRequested += (s, args) =>

                {

                    args.Handled = true;

                    try

                    {

                        OpenExternalLink(args.Uri, "NewWindowRequested");

                    }

                    catch (Exception ex) { LogDesktopError("открытие внешней ссылки", ex); }

                };



                // Priority 1: dist/ folder next to .exe or in project root

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                string distFolder = Path.GetFullPath(Path.Combine(baseDir, "dist"));

                if (!Directory.Exists(distFolder))

                {

                    distFolder = Path.GetFullPath(Path.Combine(baseDir, "..", "dist"));

                }

                if (!Directory.Exists(distFolder))

                {

                    distFolder = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "dist"));

                }

                if (!Directory.Exists(distFolder))

                {

                    distFolder = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "dist"));

                }

                if (!Directory.Exists(distFolder))

                {

                    distFolder = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "dist"));

                }



                string indexPath = Path.Combine(distFolder, "index.html");



                if (File.Exists(indexPath))

                {

                    _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(

                        "app.sentinel",

                        distFolder,

                        CoreWebView2HostResourceAccessKind.Allow

                    );

                    _webView.CoreWebView2.Navigate($"https://app.sentinel/index.html?v={DateTime.UtcNow.Ticks}");

                }

                else

                {

                    // Fallback to embedded resource index.html

                    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("TwitchDropsSentinel.Resources.index.html");

                    if (stream != null)

                    {

                        // NavigateToString gives the page an opaque origin that the service refuses: serve it from the same virtual host
                        string fallbackFolder = Path.Combine(Path.GetTempPath(), "TwitchDropsSentinel_ui");
                        Directory.CreateDirectory(fallbackFolder);
                        using (var file = File.Create(Path.Combine(fallbackFolder, "index.html")))
                        {
                            await stream.CopyToAsync(file);
                        }
                        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping("app.sentinel", fallbackFolder, CoreWebView2HostResourceAccessKind.Allow);
                        _webView.CoreWebView2.Navigate($"https://app.sentinel/index.html?v={DateTime.UtcNow.Ticks}");

                    }

                    else

                    {

                        _webView.CoreWebView2.NavigateToString("<html style=\"background:#0b0d13;color:#fff;font-family:sans-serif;padding:40px;\"><h2>Twitch Drops Sentinel v3</h2><p>dist/index.html not found. Please run npm run build.</p></html>");

                    }

                }

            }

            catch (Exception ex)

            {

                // A PC without the WebView2 Runtime gets an explanation and the download page, not a bare English error
                if (ex is WebView2RuntimeNotFoundException)
                {
                    var answer = MessageBox.Show(
                        "Для работы окна Sentinel нужен Microsoft Edge WebView2 Runtime, он не найден на этом компьютере.\n\n" +
                        "Открыть страницу загрузки? Установите «Evergreen Bootstrapper» и запустите Sentinel снова.",
                        "Twitch Drops Sentinel", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                    if (answer == DialogResult.Yes)
                    {
                        Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/") { UseShellExecute = true });
                    }
                }
                else
                {
                    MessageBox.Show($"Не удалось запустить окно интерфейса (WebView2):\n{ex.Message}", "Twitch Drops Sentinel", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

            }

        }



        private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)

        {

            try

            {

                string json = e.WebMessageAsJson;

                using var doc = JsonDocument.Parse(json);

                var root = doc.RootElement;



                if (!root.TryGetProperty("type", out var typeProp)) return;

                string type = typeProp.GetString() ?? "";



                if (type == "POWER_ACTION" && root.TryGetProperty("mode", out var modeProp))

                {

                    string mode = modeProp.GetString() ?? "";

                    ExecutePowerAction(mode);

                }

                else if (type == "CANCEL_POWER")

                {

                    CancelPowerAction();

                }

                else if (type == "COPY_TO_CLIPBOARD" && root.TryGetProperty("text", out var textProp))

                {

                    string textToCopy = textProp.GetString() ?? "";

                    if (!string.IsNullOrEmpty(textToCopy))

                    {

                        this.BeginInvoke(new Action(() =>

                        {

                            try

                            {

                                Clipboard.SetDataObject(textToCopy, true, 5, 100);

                            }

                            catch

                            {

                                try { Clipboard.SetText(textToCopy); } catch { }

                            }

                        }));

                    }

                }

                else if (type == "GET_CLOSE_ACTION")
                {
                    PostCloseAction();
                }
                else if (type == "SET_CLOSE_ACTION" && root.TryGetProperty("value", out var closeProp))
                {
                    SetCloseAction(closeProp.GetString());
                }
                else if (type == "SELECT_FOLDER" || type == "BROWSE_FOLDER")

                {

                    this.BeginInvoke(new Action(() =>

                    {

                        using var dlg = new FolderBrowserDialog

                        {

                            Description = "Выберите папку с установленными играми для Sentinel",

                            UseDescriptionForTitle = true,

                            ShowNewFolderButton = false

                        };

                        if (dlg.ShowDialog(this) == DialogResult.OK && Directory.Exists(dlg.SelectedPath))

                        {

                            string safePath = dlg.SelectedPath.Replace("\\", "\\\\").Replace("\"", "\\\"");

                            string responseJson = $"{{\"type\":\"FOLDER_SELECTED\",\"cancelled\":false,\"path\":\"{safePath}\"}}";

                            _webView.CoreWebView2.PostWebMessageAsJson(responseJson);

                        }

                        else

                        {

                            string responseJson = "{\"type\":\"FOLDER_SELECTED\",\"cancelled\":true,\"path\":\"\"}";

                            _webView.CoreWebView2.PostWebMessageAsJson(responseJson);

                        }

                    }));

                }

                else if (type == "RESTART_APP" || type == "RESTART_SENTINEL")

                {

                    this.BeginInvoke(new Action(() =>

                    {

                        _isForceClosing = true;

                        _isShuttingDown = true;

                        ShutdownBackend();

                        try { _webView?.Dispose(); } catch { }

                        try { UnregisterHotKey(this.Handle, HOTKEY_ID_BLACKOUT); } catch { }
                        try { UnregisterHotKey(this.Handle, HOTKEY_ID_RESTORE); } catch { }

                if (_trayIcon != null) { _trayIcon.Visible = false; _trayIcon.Dispose(); _trayIcon = null; }

                        string targetExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "TwitchDropsSentinel.exe");
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = File.Exists(targetExe) ? targetExe : Application.ExecutablePath,
                            UseShellExecute = true,
                            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
                        });
                        Environment.Exit(0);

                    }));

                }

                else if (type == "DIMMER_COMMAND")

                {

                    string action = root.TryGetProperty("action", out var actProp) ? actProp.GetString() ?? "" : "";

                    if (action == "GET_STATE")

                    {

                        NotifyWebviewDimmerState();

                    }

                    else if (action == "SET_BRIGHTNESS")
                    {
                        string monId = root.TryGetProperty("monitorId", out var mProp) ? mProp.GetString() ?? "master" : "master";
                        int level = root.TryGetProperty("level", out var lProp) ? lProp.GetInt32() : 75;
                        int clamped = Math.Clamp(level, 0, 100);
                        var allMons = GetHardwareMonitors();
                        monId = MonitorIds.Resolve(monId, allMons.Select(m => m.Id).ToList());

                        if (monId == "master")
                        {
                            _masterBrightness = clamped;
                            foreach (var m in allMons)
                            {
                                _monitorBrightnessMap[m.Id] = clamped;
                            }
                        }
                        else
                        {
                            _monitorBrightnessMap[monId] = clamped;
                            if (allMons.Count > 0)
                            {
                                var vals = allMons.Select(m => _monitorBrightnessMap.TryGetValue(m.Id, out int known) ? known : m.CurrentBrightness);
                                _masterBrightness = (int)Math.Round(vals.Average());
                            }
                        }

                        SetHardwareBrightnessDebounced(monId, clamped);
                        NotifyWebviewDimmerState();
                    }

                    else if (action == "SET_BLACKOUT")

                    {

                        bool enabled = root.TryGetProperty("enabled", out var enProp) && enProp.GetBoolean();

                        int? solo = root.TryGetProperty("soloIndex", out var sProp) && sProp.ValueKind == JsonValueKind.Number ? sProp.GetInt32() : (int?)null;

                        SetBlackout(enabled, solo);

                        NotifyWebviewDimmerState();

                    }

                    else if (action == "SET_ULTRA_DARK")

                    {

                        bool enabled = root.TryGetProperty("enabled", out var uEn) && uEn.GetBoolean();

                        int? tint = root.TryGetProperty("tint", out var tProp) && tProp.ValueKind == JsonValueKind.Number ? tProp.GetInt32() : (int?)null;

                        SetUltraDark(enabled, tint);

                    }

                    else if (action == "SET_TIMER")

                    {

                        int minutes = root.TryGetProperty("minutes", out var minProp) && minProp.ValueKind == JsonValueKind.Number ? minProp.GetInt32() : 0;

                        SetSleepTimer(minutes);

                    }

                    else if (action == "SET_MUTE_ON_BLACKOUT")

                    {

                        bool mute = root.TryGetProperty("enabled", out var muProp) && muProp.GetBoolean();

                        _muteAudioOnBlackout = mute;

                        NotifyWebviewDimmerState();

                    }

                    else if (action == "SAVE_BASELINE")
                    {
                        SaveBaselineBrightness();
                        NotifyWebviewDimmerState();
                    }
                    else if (action == "RESTORE_BASELINE")
                    {
                        RestoreBaselineBrightness();
                    }
                    else if (action == "SCAN_MONITORS")
                    {
                        NotifyWebviewDimmerState(explicitRefresh: true);
                    }
                }

                else if (type == "DRAG_WINDOW")

                {

                    ReleaseCapture();

                    SendMessage(this.Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);

                }

                else if (type == "OPEN_VAULT" || type == "OPEN_TROPHIES")

                {

                    try

                    {

                        string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                        string vaultPath = Path.Combine(baseDir, "Trophies.md");

                        if (!File.Exists(vaultPath))

                        {

                            File.WriteAllText(vaultPath, "# 🏆 Журнал Трофеев Twitch Drops Sentinel\n\n| Дата и Время | Игра | Награда (Дроп) | Кампания | Статус |\n| :--- | :--- | :--- | :--- | :--- |\n");

                        }

                        Process.Start(new ProcessStartInfo(vaultPath) { UseShellExecute = true });

                    }

                    catch (Exception ex) { LogDesktopError("открытие журнала трофеев", ex); }

                }

                else if (type == "SET_PIP_MODE")

                {

                    bool enabled = root.TryGetProperty("enabled", out var enProp) && enProp.GetBoolean();

                    this.BeginInvoke(new Action(() =>

                    {

                        if (enabled)

                        {

                            _isPipMode = true;

                            this.Padding = Padding.Empty;

                            if (WindowState == FormWindowState.Maximized) WindowState = FormWindowState.Normal;

                            _savedBoundsBeforePip = this.Bounds;

                            this.FormBorderStyle = FormBorderStyle.None;

                            float dpiScale = this.DeviceDpi / 96f;

                            if (dpiScale < 1.0f) dpiScale = 1.0f;

                            this.MinimumSize = new Size((int)Math.Round(320 * dpiScale), (int)Math.Round(150 * dpiScale));

                            this.Size = new Size((int)Math.Round(560 * dpiScale), (int)Math.Round(210 * dpiScale));

                            this.TopMost = true;

                        }

                        else

                        {

                            _isPipMode = false;

                            this.Padding = new Padding(3);

                            this.FormBorderStyle = FormBorderStyle.None;

                            float dpiScale = this.DeviceDpi / 96f;

                            if (dpiScale < 1.0f) dpiScale = 1.0f;

                            this.MinimumSize = new Size((int)Math.Round(1000 * dpiScale), (int)Math.Round(650 * dpiScale));

                            this.TopMost = false;

                            if (_savedBoundsBeforePip.Width >= 1000)

                            {

                                this.Bounds = _savedBoundsBeforePip;

                            }

                            else

                            {

                                this.Size = new Size((int)Math.Round(1400 * dpiScale), (int)Math.Round(920 * dpiScale));

                                this.CenterToScreen();

                            }

                        }

                    }));

                }

                else if (type == "WINDOW_CONTROL")

                {

                    string action = root.TryGetProperty("action", out var actProp) ? actProp.GetString() ?? "" : "";

                    this.BeginInvoke(new Action(() =>

                    {

                        if (action == "minimize")

                        {

                            this.WindowState = FormWindowState.Minimized;

                        }

                        else if (action == "maximize")

                        {

                            this.WindowState = (this.WindowState == FormWindowState.Maximized) ? FormWindowState.Normal : FormWindowState.Maximized;

                        }

                        else if (action == "close")
{
    HandleCloseRequest();
}
}));

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Error handling web message: {ex.Message}");

            }

        }



        private void ExecutePowerAction(string mode)

        {

            try

            {

                switch (mode)

                {

                    case "shutdown":

                        Process.Start(new ProcessStartInfo("shutdown.exe", "/s /t 0") { CreateNoWindow = true, UseShellExecute = false });

                        break;

                    case "sleep":

                        SetSuspendState(false, true, false);

                        break;

                    case "lock":

                        LockWorkStation();

                        break;

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Power command execution failed: {ex.Message}");

            }

        }



        private void CancelPowerAction()

        {

            try

            {

                Process.Start(new ProcessStartInfo("shutdown.exe", "/a") { CreateNoWindow = true, UseShellExecute = false });

            }

            catch

            {

                // Ignored

            }

        }



        private void InitializeTrayIcon()

        {

            try

            {

                var trayMenu = new ContextMenuStrip();

                var showItem = new ToolStripMenuItem("Показать Sentinel", null, (s, e) => RestoreFromTray());

                showItem.Font = new Font(showItem.Font, FontStyle.Bold);

                var exitItem = new ToolStripMenuItem("Выход из Sentinel", null, (s, e) => ExitApplication());



                trayMenu.Items.Add(showItem);

                trayMenu.Items.Add(new ToolStripSeparator());

                trayMenu.Items.Add(exitItem);



                _trayIcon = new NotifyIcon

                {

                    Text = "Twitch Drops Sentinel",

                    Icon = this.Icon ?? SystemIcons.Application,

                    ContextMenuStrip = trayMenu,

                    Visible = true

                };



                _trayIcon.MouseClick += (s, e) =>

                {

                    if (e.Button == MouseButtons.Left)

                    {

                        RestoreFromTray();

                    }

                };

                _trayIcon.DoubleClick += (s, e) => RestoreFromTray();

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Tray icon init failed: {ex.Message}");

            }

        }



        private static readonly MethodInfo? _notifyParentPositionMethod = typeof(CoreWebView2Controller).GetMethod("NotifyParentWindowPositionChanged");

        private static readonly FieldInfo? _controllerField = typeof(WebView2).GetField("_coreWebView2Controller", BindingFlags.Instance | BindingFlags.NonPublic);



        private void NotifyWebViewPositionChanged()

        {

            try

            {

                if (_webView != null && _controllerField != null && _notifyParentPositionMethod != null)

                {

                    var controller = _controllerField.GetValue(_webView);

                    if (controller != null)

                    {

                        _notifyParentPositionMethod.Invoke(controller, null);

                    }

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"NotifyWebViewPositionChanged error: {ex.Message}");

            }

        }



        protected override void OnDpiChanged(DpiChangedEventArgs e)

        {

            base.OnDpiChanged(e);

            if (WindowState == FormWindowState.Maximized)

            {

                int borderX = GetSystemMetrics(SM_CXSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);

                int borderY = GetSystemMetrics(SM_CYSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);

                Padding = new Padding(borderX, borderY, borderX, borderY);

            }

            if (_webView != null)

            {

                _webView.Bounds = this.ClientRectangle;

            }

            NotifyWebViewPositionChanged();

        }



        protected override void OnResize(EventArgs e)

        {

            base.OnResize(e);

            if (WindowState == FormWindowState.Maximized)

            {

                int borderX = GetSystemMetrics(SM_CXSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);

                int borderY = GetSystemMetrics(SM_CYSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);

                Padding = new Padding(borderX, borderY, borderX, borderY);

            }

            else if (_isPipMode)

            {

                Padding = Padding.Empty;

            }

            else

            {

                Padding = new Padding(3);

            }



            if (_webView != null && _webView.CoreWebView2 != null)

            {

                bool isMax = (WindowState == FormWindowState.Maximized);

                _webView.CoreWebView2.PostWebMessageAsJson($"{{\"type\":\"WINDOW_STATE_CHANGED\",\"isMaximized\":{isMax.ToString().ToLower()}}}");

                NotifyWebViewPositionChanged();

            }



            if (WindowState != FormWindowState.Minimized)

            {

                _lastNonMinimizedState = WindowState;

            }



            if (WindowState == FormWindowState.Minimized)

            {

                Hide();

                if (_trayIcon != null)

                {

                    _trayIcon.Visible = true;

                    ShowTrayHint();

                }

            }

        }



        protected override void OnFormClosing(FormClosingEventArgs e)

        {

            SaveWindowState();

            if (_isForceClosing)

            {

                ShutdownBackend();

                try { _webView?.Dispose(); } catch { }

                if (_trayIcon != null) { _trayIcon.Visible = false; _trayIcon.Dispose(); _trayIcon = null; }

                base.OnFormClosing(e);

                return;

            }



            if (e.CloseReason == CloseReason.UserClosing)
{
    e.Cancel = true;
    HandleCloseRequest();
}
else

            {

                ShutdownBackend();

                try

                {

                    _webView?.Dispose();

                }

                catch { }

                if (_trayIcon != null)

                {

                    _trayIcon.Visible = false;

                    _trayIcon.Dispose();

                    _trayIcon = null;

                }

                base.OnFormClosing(e);

            }

        }



        private const int WM_SYSCOMMAND = 0x0112;

        private const int SC_MINIMIZE = 0xF020;



        protected override CreateParams CreateParams

        {

            get

            {

                CreateParams cp = base.CreateParams;

                cp.Style |= 0x20000; // WS_MINIMIZEBOX: allow minimize from taskbar

                cp.Style |= 0x10000; // WS_MAXIMIZEBOX: allow maximize

                cp.ClassStyle |= 0x20000; // CS_DROPSHADOW

                return cp;

            }

        }



        protected override void WndProc(ref Message m)

        {

            const int WM_QUERYENDSESSION = 0x0011;

            const int WM_ENDSESSION = 0x0016;

            const int WM_HOTKEY = 0x0312;

            if (m.Msg == WM_QUERYENDSESSION || m.Msg == WM_ENDSESSION)

            {

                SetBlackout(false);

                SetUltraDark(false);

                _ = SetHardwareBrightness("master", 75);

                m.Result = (IntPtr)1;

                return;

            }

            if (m.Msg == WM_HOTKEY)
            {
                int hotkeyId = (int)m.WParam;
                if (hotkeyId == HOTKEY_ID_BLACKOUT)
                {
                    SetBlackout(!_isBlackout);
                    NotifyWebviewDimmerState();
                    return;
                }
                else if (hotkeyId == HOTKEY_ID_RESTORE)
                {
                    RestoreBaselineBrightness();
                    return;
                }
            }

            if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal && !_isPipMode)

            {

                base.WndProc(ref m);

                Point cursor = this.PointToClient(Cursor.Position);

                int resizeBorder = 8;

                bool isLeft = cursor.X <= resizeBorder;

                bool isRight = cursor.X >= this.ClientSize.Width - resizeBorder;

                bool isTop = cursor.Y <= resizeBorder;

                bool isBottom = cursor.Y >= this.ClientSize.Height - resizeBorder;



                if (isTop && isLeft) { m.Result = (IntPtr)HTTOPLEFT; return; }

                if (isTop && isRight) { m.Result = (IntPtr)HTTOPRIGHT; return; }

                if (isBottom && isLeft) { m.Result = (IntPtr)HTBOTTOMLEFT; return; }

                if (isBottom && isRight) { m.Result = (IntPtr)HTBOTTOMRIGHT; return; }

                if (isLeft) { m.Result = (IntPtr)HTLEFT; return; }

                if (isRight) { m.Result = (IntPtr)HTRIGHT; return; }

                if (isTop) { m.Result = (IntPtr)HTTOP; return; }

                if (isBottom) { m.Result = (IntPtr)HTBOTTOM; return; }

                return;

            }

            if (m.Msg == WM_GETMINMAXINFO)

            {

                try

                {

                    MINMAXINFO mmi = Marshal.PtrToStructure<MINMAXINFO>(m.LParam);

                    IntPtr hMonitor = MonitorFromWindow(this.Handle, MONITOR_DEFAULTTONEAREST);

                    if (hMonitor != IntPtr.Zero)

                    {

                        MONITORINFO mi = new MONITORINFO();

                        mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));

                        if (GetMonitorInfo(hMonitor, ref mi))

                        {

                            RECT rcWork = mi.rcWork;

                            RECT rcMonitor = mi.rcMonitor;



                            mmi.ptMaxPosition.x = rcWork.Left;

                            mmi.ptMaxPosition.y = rcWork.Top;

                            mmi.ptMaxSize.x = rcWork.Right - rcWork.Left;

                            mmi.ptMaxSize.y = rcWork.Bottom - rcWork.Top;



                            float dpiScale = this.DeviceDpi / 96f;

                            if (dpiScale < 1.0f) dpiScale = 1.0f;

                            if (_isPipMode)

                            {

                                mmi.ptMinTrackSize.x = (int)Math.Round(320 * dpiScale);

                                mmi.ptMinTrackSize.y = (int)Math.Round(150 * dpiScale);

                            }

                            else

                            {

                                mmi.ptMinTrackSize.x = (int)Math.Round(1000 * dpiScale);

                                mmi.ptMinTrackSize.y = (int)Math.Round(650 * dpiScale);

                            }

                        }

                    }

                    Marshal.StructureToPtr(mmi, m.LParam, true);

                    m.Result = IntPtr.Zero;

                    return;

                }

                catch (Exception ex)

                {

                    Debug.WriteLine($"WM_GETMINMAXINFO error: {ex.Message}");

                }

            }



            if (m.Msg == WM_DPICHANGED)

            {

                int newDpiX = (int)(m.WParam.ToInt64() & 0xFFFF);

                float newDpiScale = Math.Max(1.0f, newDpiX / 96f);

                if (_isPipMode)

                {

                    this.MinimumSize = new Size((int)Math.Round(320 * newDpiScale), (int)Math.Round(150 * newDpiScale));

                    try

                    {

                        RECT rect = Marshal.PtrToStructure<RECT>(m.LParam);

                        int targetW = (int)Math.Round(560 * newDpiScale);

                        int targetH = (int)Math.Round(210 * newDpiScale);



                        SetWindowPos(

                            m.HWnd,

                            IntPtr.Zero,

                            rect.Left,

                            rect.Top,

                            targetW,

                            targetH,

                            SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED

                        );



                        if (_webView != null)

                        {

                            _webView.Bounds = this.ClientRectangle;

                        }

                        NotifyWebViewPositionChanged();

                    }

                    catch (Exception ex)

                    {

                        Debug.WriteLine($"WM_DPICHANGED PiP error: {ex.Message}");

                    }

                    m.Result = IntPtr.Zero;

                    return;

                }

                else

                {

                    this.MinimumSize = new Size((int)Math.Round(1000 * newDpiScale), (int)Math.Round(650 * newDpiScale));

                    base.WndProc(ref m);

                    try

                    {

                        RECT rect = Marshal.PtrToStructure<RECT>(m.LParam);

                        if (WindowState == FormWindowState.Normal)

                        {

                            int targetW = rect.Right - rect.Left;

                            int targetH = rect.Bottom - rect.Top;



                            SetWindowPos(

                                m.HWnd,

                                IntPtr.Zero,

                                rect.Left,

                                rect.Top,

                                targetW,

                                targetH,

                                SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED

                            );

                        }

                        if (_webView != null)

                        {

                            _webView.Bounds = this.ClientRectangle;

                        }

                        NotifyWebViewPositionChanged();

                    }

                    catch (Exception ex)

                    {

                        Debug.WriteLine($"WM_DPICHANGED error: {ex.Message}");

                    }

                    m.Result = IntPtr.Zero;

                    return;

                }

            }



            if (m.Msg == WM_EXITSIZEMOVE)

            {

                base.WndProc(ref m);

                if (_isPipMode)

                {

                    try

                    {

                        uint currentDpi = GetDpiForWindow(this.Handle);

                        if (currentDpi == 0) currentDpi = (uint)this.DeviceDpi;

                        float currentDpiScale = Math.Max(1.0f, currentDpi / 96f);

                        int expectedW = (int)Math.Round(560 * currentDpiScale);

                        int expectedH = (int)Math.Round(210 * currentDpiScale);



                        if (Math.Abs(this.Width - expectedW) > 2 || Math.Abs(this.Height - expectedH) > 2)

                        {

                            this.Size = new Size(expectedW, expectedH);

                        }

                        if (_webView != null)

                        {

                            _webView.Bounds = this.ClientRectangle;

                        }

                        NotifyWebViewPositionChanged();

                    }

                    catch (Exception ex)

                    {

                        Debug.WriteLine($"WM_EXITSIZEMOVE PiP error: {ex.Message}");

                    }

                }

                else

                {

                    NotifyWebViewPositionChanged();

                }

                m.Result = IntPtr.Zero;

                return;

            }



            if (m.Msg == WM_MOVE || m.Msg == WM_WINDOWPOSCHANGED)

            {

                base.WndProc(ref m);

                NotifyWebViewPositionChanged();

                return;

            }



            if (Program.WM_SENTINEL_SHOW != 0 && m.Msg == (int)Program.WM_SENTINEL_SHOW)

            {

                RestoreFromTray();

                return;

            }



            if (m.Msg == WM_SYSCOMMAND && (m.WParam.ToInt32() & 0xFFF0) == SC_MINIMIZE)

            {

                if (WindowState != FormWindowState.Minimized)

                {

                    _lastNonMinimizedState = WindowState;

                }

                Hide();

                if (_trayIcon != null)

                {

                    _trayIcon.Visible = true;

                    ShowTrayHint();

                }

                return;

            }



            base.WndProc(ref m);

        }



        private void EnsureValidWindowBounds()

        {

            try

            {

                if (WindowState == FormWindowState.Normal)

                {

                    if (Width < 1000 || Height < 650 || ClientSize.Width < 900 || ClientSize.Height < 600)

                    {

                        // 1. Try restoring from saved window_state.json if valid

                        string stateFile = GetWindowStateFilePath();

                        if (File.Exists(stateFile))

                        {

                            try

                            {

                                string json = File.ReadAllText(stateFile);

                                var state = JsonSerializer.Deserialize<WindowStateConfig>(json);

                                if (state != null && state.Width >= 1000 && state.Height >= 650)

                                {

                                    Rectangle savedBounds = new Rectangle(state.X, state.Y, state.Width, state.Height);

                                    foreach (var screen in Screen.AllScreens)

                                    {

                                        if (Rectangle.Intersect(screen.WorkingArea, savedBounds).Width >= 200)

                                        {

                                            Bounds = savedBounds;

                                            return;

                                        }

                                    }

                                }

                            }

                            catch (Exception ex) { LogDesktopError("восстановление положения окна", ex); }

                        }



                        // 2. Comfortable fallback

                        Rectangle workingArea = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1920, 1080);

                        int safeWidth = Math.Min(1580, (int)(workingArea.Width * 0.92));

                        int safeHeight = Math.Min(980, (int)(workingArea.Height * 0.90));

                        Size = new Size(safeWidth, safeHeight);

                        Location = new Point(

                            workingArea.X + Math.Max(0, (workingArea.Width - safeWidth) / 2),

                            workingArea.Y + Math.Max(0, (workingArea.Height - safeHeight) / 2)

                        );

                    }

                    else

                    {

                        bool isVisible = false;

                        foreach (var screen in Screen.AllScreens)

                        {

                            Rectangle intersection = Rectangle.Intersect(screen.WorkingArea, Bounds);

                            if (intersection.Width >= 200 && intersection.Height >= 200)

                            {

                                isVisible = true;

                                break;

                            }

                        }

                        if (!isVisible)

                        {

                            Rectangle primary = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1920, 1080);

                            Location = new Point(

                                primary.X + Math.Max(0, (primary.Width - Width) / 2),

                                primary.Y + Math.Max(0, (primary.Height - Height) / 2)

                            );

                        }

                    }

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"EnsureValidWindowBounds error: {ex.Message}");

            }

        }



        private static string GetShellSettingsFilePath()
        {
            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "data", "shell_settings.json");
        }

        private static string NormalizeCloseAction(string? value)
        {
            return value == "tray" || value == "exit" ? value : "ask";
        }

        private void LoadShellSettings()
        {
            try
            {
                string file = GetShellSettingsFilePath();
                if (!File.Exists(file)) return;
                using var doc = JsonDocument.Parse(File.ReadAllText(file));
                if (doc.RootElement.TryGetProperty("close_action", out var prop))
                {
                    _closeAction = NormalizeCloseAction(prop.GetString());
                }
            }
            catch (Exception ex)
            {
                LogDesktopError("LoadShellSettings", ex);
            }
        }

        private void SetCloseAction(string? value)
        {
            _closeAction = NormalizeCloseAction(value);
            try
            {
                string file = GetShellSettingsFilePath();
                Directory.CreateDirectory(Path.GetDirectoryName(file)!);
                File.WriteAllText(file, JsonSerializer.Serialize(new Dictionary<string, string> { ["close_action"] = _closeAction }, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch (Exception ex)
            {
                LogDesktopError("SaveShellSettings", ex);
            }
            PostCloseAction();
        }

        private void PostCloseAction()
        {
            try
            {
                _webView?.CoreWebView2?.PostWebMessageAsJson($"{{\"type\":\"CLOSE_ACTION\",\"value\":\"{_closeAction}\"}}");
            }
            catch (Exception ex)
            {
                LogDesktopError("PostCloseAction", ex);
            }
        }

        private void ShowTrayHint()
        {
            _trayIcon?.ShowBalloonTip(5000, "Twitch Drops Sentinel", "Окно скрыто, фарм продолжается в трее. Открыть: клик по значку. Выйти полностью: правый клик по значку → «Выход из Sentinel».", ToolTipIcon.Info);
        }

        private void HideToTray()
        {
            if (WindowState != FormWindowState.Minimized)
            {
                _lastNonMinimizedState = WindowState;
            }
            Hide();
            if (_trayIcon != null)
            {
                _trayIcon.Visible = true;
                ShowTrayHint();
            }
        }

        private void ExitApplication()
        {
            SaveWindowState();
            ShutdownBackend();
            try { _webView?.Dispose(); } catch (Exception ex) { LogDesktopError("ExitApplication.WebView", ex); }
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }
            Application.Exit();
        }

        /// <summary>The X button, Alt+F4 and the UI close button all land here: tray, exit, or ask once and remember.</summary>
        private void HandleCloseRequest()
        {
            if (_closeAction == "exit") { ExitApplication(); return; }
            if (_closeAction == "tray") { HideToTray(); return; }
            if (_closeDialogOpen) return;
            _closeDialogOpen = true;
            try
            {
                var trayButton = new TaskDialogButton("Свернуть в трей");
                var exitButton = new TaskDialogButton("Выйти полностью");
                var remember = new TaskDialogVerificationCheckBox("Запомнить мой выбор");
                var page = new TaskDialogPage
                {
                    Caption = "Twitch Drops Sentinel",
                    Heading = "Что сделать при закрытии окна?",
                    Text = "В трее фарм дропов продолжается, а окно можно открыть кликом по значку. При полном выходе фарм остановится. Выбор можно изменить в Настройках.",
                    Icon = TaskDialogIcon.Information,
                    AllowCancel = true,
                    Verification = remember,
                    Buttons = { trayButton, exitButton }
                };
                var result = TaskDialog.ShowDialog(this, page);
                if (result != trayButton && result != exitButton) return;
                if (remember.Checked) SetCloseAction(result == exitButton ? "exit" : "tray");
                if (result == exitButton) ExitApplication(); else HideToTray();
            }
            catch (Exception ex)
            {
                LogDesktopError("HandleCloseRequest", ex);
                HideToTray();
            }
            finally
            {
                _closeDialogOpen = false;
            }
        }

        private void RestoreFromTray()

        {

            try

            {

                FormWindowState targetState = (_lastNonMinimizedState == FormWindowState.Maximized)

                    ? FormWindowState.Maximized

                    : FormWindowState.Normal;



                WindowState = targetState;



                if (!Visible)

                {

                    Show();

                }



                ShowWindow(Handle, targetState == FormWindowState.Maximized ? SW_MAXIMIZE : SW_RESTORE);



                EnsureValidWindowBounds();



                SetForegroundWindow(Handle);

                BringToFront();

                Activate();

                Focus();



                _webView?.Invalidate();

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"RestoreFromTray error: {ex.Message}");

            }

        }



        private int _masterBrightness = 75;

        private bool _isBlackout = false;

        private int? _soloBlackoutIndex = null;

        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> _monitorBrightnessMap = new();
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> _baselineBrightnessMap = new();

        private bool _muteAudioOnBlackout = false;

        private readonly BlackoutMuteMemory _blackoutMute = new();

        private readonly List<UltraDarkOverlayForm> _activeUltraDarkForms = new();

        private bool _isUltraDark = false;

        private int _ultraDarkTintPercentage = 55;

        private System.Windows.Forms.Timer? _sleepTimer;

        private int _sleepTimerMinutes = 0;

        private int _sleepTimerRemainingSeconds = 0;

        private static readonly object _brightnessDebounceLock = new object();
        private static readonly System.Threading.SemaphoreSlim _i2cHardwareBusLock = new System.Threading.SemaphoreSlim(1, 1);

        private readonly BrightnessDebouncer _brightnessDebouncer;
        private readonly CancellationTokenSource _hardwareCts = new();



        public class NativeMonitorInfo

        {

            public string Id { get; set; } = string.Empty;

            public string Name { get; set; } = string.Empty;

            public string DeviceName { get; set; } = string.Empty;

            public bool IsPrimary { get; set; }

            public bool IsLaptopInternal { get; set; }

            public int CurrentBrightness { get; set; } = 75;
            public int BaselineBrightness { get; set; } = 75;

            public uint MinBrightness { get; set; } = 0;

            public uint MaxBrightness { get; set; } = 100;

            public bool SupportsControl { get; set; } = true;

        }



        private List<NativeMonitorInfo> GetHardwareMonitors(bool explicitRefresh = false)

        {

            var list = new List<NativeMonitorInfo>();

            var screens = Screen.AllScreens;



            // 1. DDC/CI Monitors (External)

            var ddcList = new List<PHYSICAL_MONITOR>();

            try

            {

                EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT rc, IntPtr data) =>

                {

                    if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out uint count) && count > 0)

                    {

                        var phys = new PHYSICAL_MONITOR[count];

                        if (GetPhysicalMonitorsFromHMONITOR(hMon, count, phys))

                        {

                            ddcList.AddRange(phys);

                        }

                    }

                    return true;

                }, IntPtr.Zero);



                int validDdcIndex = 0;
                for (int i = 0; i < ddcList.Count; i++)
                {
                    var mon = ddcList[i];
                    uint min = 0, max = 100;
                    if (!GetMonitorBrightness(mon.hPhysicalMonitor, out min, out uint cur, out max))
                    {
                        // Internal laptop screen or unsupported display, skip from DDC list (WMI will handle it)
                        continue;
                    }

                    string desc = (mon.szPhysicalMonitorDescription ?? "").Trim();
                    if (string.IsNullOrEmpty(desc)) desc = $"Display {validDdcIndex + 1}";
                    string id = $"DDC_{validDdcIndex}_{desc}";
                    int currentBri = BrightnessReading.Resolve(_monitorBrightnessMap, id, (int)cur, _masterBrightness, explicitRefresh, _brightnessDebouncer.IsPending(id));

                    int baselineBri = _baselineBrightnessMap.GetOrAdd(id, currentBri);

                    list.Add(new NativeMonitorInfo
                    {
                        Id = id,
                        Name = $"Внешний монитор ({desc})",
                        DeviceName = (validDdcIndex < screens.Length) ? screens[validDdcIndex].DeviceName : $@"\\.\DISPLAY{validDdcIndex + 1}",
                        IsPrimary = (validDdcIndex < screens.Length) && screens[validDdcIndex].Primary,
                        IsLaptopInternal = false,
                        CurrentBrightness = currentBri,
                        BaselineBrightness = baselineBri,
                        MinBrightness = min,
                        MaxBrightness = max,
                        SupportsControl = true
                    });
                    validDdcIndex++;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DDC/CI] Enumeration error: {ex.Message}");
            }
            finally
            {
                if (ddcList.Count > 0)
                {
                    try { DestroyPhysicalMonitors((uint)ddcList.Count, ddcList.ToArray()); } catch { }
                }
            }

            // 2. WMI Monitors (Internal Laptop Panel)

            try

            {

                using var searcher = new ManagementObjectSearcher(@"root\WMI", "SELECT InstanceName, CurrentBrightness FROM WmiMonitorBrightness WHERE Active = True");

                using var coll = searcher.Get();

                int idx = 0;

                foreach (ManagementObject obj in coll)

                {

                    try

                    {

                        string name = obj["InstanceName"]?.ToString() ?? $"InternalPanel_{idx}";

                        int? hardware = null;

                        if (obj["CurrentBrightness"] != null)

                        {

                            hardware = Convert.ToInt32(obj["CurrentBrightness"]);

                        }

                        string id = $"WMI_{name}";

                        int bri = BrightnessReading.Resolve(_monitorBrightnessMap, id, hardware, _masterBrightness, explicitRefresh, _brightnessDebouncer.IsPending(id));



                        list.Add(new NativeMonitorInfo

                        {

                            Id = id,

                            Name = "Встроенный дисплей ноутбука",

                            DeviceName = "Laptop_Internal",

                            IsPrimary = false,

                            IsLaptopInternal = true,
                            BaselineBrightness = _baselineBrightnessMap.TryGetValue(id, out int savedBaseline) ? savedBaseline : bri,

                            CurrentBrightness = bri,

                            MinBrightness = 0,

                            MaxBrightness = 100,

                            SupportsControl = true

                        });

                        idx++;

                    }

                    catch { }

                    finally { obj.Dispose(); }

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"[WMI] Brightness enumeration error: {ex.Message}");

            }



            // 3. Fallback if no DDC/CI or WMI found

            if (list.Count == 0)

            {

                for (int i = 0; i < screens.Length; i++)

                {

                    var s = screens[i];

                    string id = $"DISP_{i}_{s.DeviceName}";

                    int bri = BrightnessReading.Resolve(_monitorBrightnessMap, id, null, _masterBrightness, explicitRefresh, _brightnessDebouncer.IsPending(id));



                    list.Add(new NativeMonitorInfo

                    {

                        Id = id,

                        Name = s.Primary ? "Основной дисплей" : $"Дисплей {i + 1}",

                        DeviceName = s.DeviceName,

                        IsPrimary = s.Primary,

                        IsLaptopInternal = false,

                        CurrentBrightness = bri,

                        MinBrightness = 0,

                        MaxBrightness = 100,

                        SupportsControl = true

                    });

                }

            }



            return list;

        }



        private void SetHardwareBrightnessDebounced(string monitorId, int level)

        {

            _brightnessDebouncer.Post(monitorId, level);

        }



        public void SetUltraDark(bool enabled, int? tint = null)

        {

            if (tint.HasValue) _ultraDarkTintPercentage = Math.Clamp(tint.Value, 10, 95);

            _isUltraDark = enabled;

            this.BeginInvoke(new Action(() =>

            {

                foreach (var f in _activeUltraDarkForms)

                {

                    try { f.Close(); f.Dispose(); } catch { }

                }

                _activeUltraDarkForms.Clear();

                if (enabled)

                {

                    var screens = Screen.AllScreens;

                    foreach (var s in screens)

                    {

                        var ud = new UltraDarkOverlayForm(s.Bounds, _ultraDarkTintPercentage);

                        ud.Show();

                        _activeUltraDarkForms.Add(ud);

                    }

                }

                NotifyWebviewDimmerState();

            }));

        }



        public void SetSleepTimer(int minutes)

        {

            this.BeginInvoke(new Action(() =>

            {

                _sleepTimer?.Stop();

                _sleepTimer?.Dispose();

                _sleepTimer = null;

                _sleepTimerMinutes = Math.Max(0, minutes);

                _sleepTimerRemainingSeconds = _sleepTimerMinutes * 60;

                if (_sleepTimerMinutes > 0)

                {

                    _sleepTimer = new System.Windows.Forms.Timer();

                    _sleepTimer.Interval = 1000;

                    _sleepTimer.Tick += (s, e) =>

                    {

                        _sleepTimerRemainingSeconds--;

                        if (_sleepTimerRemainingSeconds <= 0)

                        {

                            _sleepTimer.Stop();

                            _sleepTimerMinutes = 0;

                            SetBlackout(true);

                            NotifyWebviewDimmerState();

                        }

                    };

                    _sleepTimer.Start();

                }

                NotifyWebviewDimmerState();

            }));

        }



        private void LoadBaselineBrightness()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string filePath = Path.Combine(baseDir, "data", "dimmer_baseline.json");
                if (File.Exists(filePath))
                {
                    string json = File.ReadAllText(filePath);
                    var dict = JsonSerializer.Deserialize<Dictionary<string, int>>(json);
                    if (dict != null)
                    {
                        foreach (var kvp in dict)
                        {
                            _baselineBrightnessMap[kvp.Key] = kvp.Value;
                        }
                    }
                }
            }
            catch (Exception ex) { LogDesktopError("загрузка baseline яркости", ex); }
        }

        /// <summary>Hands a link from the page to the default browser. Only absolute http(s) goes to the shell; anything else is logged and dropped.</summary>
        private static void OpenExternalLink(string? raw, string source)
        {
            if (!ExternalLinkPolicy.TryGetOpenable(raw, out var uri))
            {
                string shown = new string((raw ?? "").Where(c => !char.IsControl(c)).Take(200).ToArray());
                LogDesktopError("external link refused (" + source + ")", new InvalidOperationException("not an absolute http(s) address: " + shown));
                return;
            }
            try
            {
                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
            }
            catch (Exception ex) { LogDesktopError("open external link (" + source + ")", ex); }
        }

        private static void LogDesktopError(string context, Exception ex)
        {
            try
            {
                string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "desktop_errors.log");
                var fi = new FileInfo(path);
                if (fi.Exists && fi.Length > 1024 * 1024) File.Delete(path);
                File.AppendAllText(path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{context}] {ex.GetType().Name}: {ex.Message}{Environment.NewLine}", Encoding.UTF8);
            }
            catch (Exception logEx)
            {
                Debug.WriteLine($"LogDesktopError failed: {logEx.Message}");
            }
        }

        public void SaveBaselineBrightness()
        {
            var monitors = GetHardwareMonitors();
            foreach (var m in monitors)
            {
                _baselineBrightnessMap[m.Id] = m.CurrentBrightness;
            }
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string dataDir = Path.Combine(baseDir, "data");
                if (!Directory.Exists(dataDir)) Directory.CreateDirectory(dataDir);
                string json = JsonSerializer.Serialize(_baselineBrightnessMap, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(Path.Combine(dataDir, "dimmer_baseline.json"), json);
            }
            catch (Exception ex) { LogDesktopError("сохранение baseline яркости", ex); }
            NotifyWebviewDimmerState();
        }

        public void RestoreBaselineBrightness()
        {
            if (_isBlackout)
            {
                SetBlackout(false);
            }
            var monitors = GetHardwareMonitors();
            var targets = new List<int>();
            foreach (var m in monitors)
            {
                int targetBri = _baselineBrightnessMap.TryGetValue(m.Id, out int savedBaseline) ? savedBaseline : m.CurrentBrightness;
                _monitorBrightnessMap[m.Id] = targetBri;
                _ = SetHardwareBrightness(m.Id, targetBri);
                targets.Add(targetBri);
            }
            if (targets.Count > 0)
            {
                _masterBrightness = (int)Math.Round(targets.Average());
            }
            NotifyWebviewDimmerState();
        }

        private Task SetHardwareBrightness(string monitorId, int level)

        {

            int clamped = Math.Clamp(level, 0, 100);

            var allMons = GetHardwareMonitors();

            monitorId = MonitorIds.Resolve(monitorId, allMons.Select(m => m.Id).ToList());

            if (monitorId == "master")

            {

                _masterBrightness = clamped;

                var mons = GetHardwareMonitors();

                var writes = new List<Task>();
                foreach (var m in mons)
                {
                    writes.Add(SetHardwareBrightness(m.Id, clamped));
                }
                return Task.WhenAll(writes);

            }



            _monitorBrightnessMap[monitorId] = clamped;



            // Run in background task to avoid blocking WebView2 UI thread (serialized via SemaphoreSlim to protect I2C bus)

            return Task.Run(async () =>

            {

                // Wait for the bus as long as it takes (the last value must arrive); only closing the app stops the wait
                try { await _i2cHardwareBusLock.WaitAsync(_hardwareCts.Token); }
                catch (OperationCanceledException) { return; }

                try

                {

                    if (monitorId.StartsWith("DDC_"))

                    {

                        var ddcList = new List<PHYSICAL_MONITOR>();

                        try

                        {

                            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT rc, IntPtr data) =>

                            {

                                if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out uint count) && count > 0)

                                {

                                    var phys = new PHYSICAL_MONITOR[count];

                                    if (GetPhysicalMonitorsFromHMONITOR(hMon, count, phys))

                                    {

                                        ddcList.AddRange(phys);

                                    }

                                }

                                return true;

                            }, IntPtr.Zero);



                            int validDdcIndex = 0;
                            for (int i = 0; i < ddcList.Count; i++)
                            {
                                var mon = ddcList[i];
                                uint min = 0, max = 100;
                                if (!GetMonitorBrightness(mon.hPhysicalMonitor, out min, out uint cur, out max))
                                {
                                    continue;
                                }

                                string desc = (mon.szPhysicalMonitorDescription ?? "").Trim();
                                if (string.IsNullOrEmpty(desc)) desc = $"Display {validDdcIndex + 1}";
                                string checkId = $"DDC_{validDdcIndex}_{desc}";
                                if (checkId == monitorId)
                                {
                                    SetMonitorBrightness(mon.hPhysicalMonitor, (uint)clamped);
                                }
                                validDdcIndex++;
                            }
                        }
                        finally

                        {

                            if (ddcList.Count > 0)

                            {

                                try { DestroyPhysicalMonitors((uint)ddcList.Count, ddcList.ToArray()); } catch { }

                            }

                        }

                    }

                    else if (monitorId.StartsWith("WMI_"))

                    {

                        string targetInstance = monitorId.Substring(4);

                        using var searcher = new ManagementObjectSearcher(@"root\WMI", "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active = True");

                        using var coll = searcher.Get();

                        foreach (ManagementObject obj in coll)

                        {

                            try

                            {

                                string inst = obj["InstanceName"]?.ToString() ?? "";

                                if (string.IsNullOrEmpty(targetInstance) || inst == targetInstance)

                                {

                                    using var inParams = obj.GetMethodParameters("WmiSetBrightness");

                                    inParams["Timeout"] = (uint)1;

                                    inParams["Brightness"] = (byte)clamped;

                                    obj.InvokeMethod("WmiSetBrightness", inParams, null);

                                }

                            }

                            catch { }

                            finally { obj.Dispose(); }

                        }

                    }

                }

                catch (Exception ex)

                {

                    Debug.WriteLine($"[HardwareBrightness] Error: {ex.Message}");

                }

                finally
                {
                    _i2cHardwareBusLock.Release();
                }

            });

        }



        private void NotifyWebviewDimmerState(bool explicitRefresh = false)

        {

            try

            {

                var monitors = GetHardwareMonitors(explicitRefresh);

                if (explicitRefresh && !_isBlackout && monitors.Count > 0)
                {
                    // The poll shows what the hardware reports; the saved baseline is not touched
                    _masterBrightness = (int)Math.Round(monitors.Average(m => m.CurrentBrightness));
                }

                var stateObj = new

                {

                    type = "DIMMER_STATE_CHANGED",

                    state = new

                    {

                        monitors = monitors.Select(m => new

                        {

                            id = m.Id,

                            name = m.Name,

                            device_name = m.DeviceName,

                            is_primary = m.IsPrimary,

                            is_laptop_internal = m.IsLaptopInternal,

                            current_brightness = m.CurrentBrightness,
                            baseline_brightness = m.BaselineBrightness,

                            min_brightness = m.MinBrightness,

                            max_brightness = m.MaxBrightness,

                            supports_control = m.SupportsControl

                        }).ToList(),

                        master_brightness = _masterBrightness,

                        is_dimmed = _masterBrightness < 50,

                        is_blackout = _isBlackout,

                        solo_screen_index = _soloBlackoutIndex,

                        sleep_timer_minutes = _sleepTimerMinutes,

                        sleep_timer_remaining = _sleepTimerRemainingSeconds,

                        away_mode_active = _isBlackout,

                        mute_audio_on_blackout = _muteAudioOnBlackout,

                        ultra_dark_active = _isUltraDark,

                        ultra_dark_tint = _ultraDarkTintPercentage,
                        has_baseline_saved = _baselineBrightnessMap.Count > 0

                    }

                };



                string json = JsonSerializer.Serialize(stateObj);

                this.BeginInvoke(new Action(() =>

                {

                    try

                    {

                        _webView?.CoreWebView2?.PostWebMessageAsJson(json);

                    }

                    catch (Exception ex) { LogDesktopError("отправка сообщения в WebView", ex); }

                }));

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"NotifyWebviewDimmerState error: {ex.Message}");

            }

        }



        private void SetBlackout(bool enabled, int? soloIndex = null)

        {

            _isBlackout = enabled;

            _soloBlackoutIndex = soloIndex;



            this.BeginInvoke(new Action(() =>

            {

                try

                {

                    foreach (var form in _activeBlackoutForms)

                    {

                        try { form.Close(); form.Dispose(); } catch { }

                    }

                    _activeBlackoutForms.Clear();



                    if (enabled)

                    {

                        if (_muteAudioOnBlackout)

                        {

                            try { _blackoutMute.Enter(AudioEndpointController.GetIsMuted, () => AudioEndpointController.SetMute(true)); } catch (Exception ex) { LogDesktopError("выключение звука при блэкауте", ex); }

                        }

                        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED);

                        var screens = Screen.AllScreens;

                        for (int i = 0; i < screens.Length; i++)

                        {

                            if (soloIndex.HasValue && soloIndex.Value != i) continue;

                            var bf = new BlackoutOverlayForm(screens[i].Bounds, () =>

                            {

                                SetBlackout(false);

                                NotifyWebviewDimmerState();

                            });

                            bf.Show();

                            _activeBlackoutForms.Add(bf);

                        }

                    }

                    else

                    {

                        // Returns the sound only if this blackout muted it (the memory is empty otherwise)
                        {

                            try { _blackoutMute.Exit(() => AudioEndpointController.SetMute(false)); } catch (Exception ex) { LogDesktopError("возврат звука после блэкаута", ex); }

                        }

                        SetThreadExecutionState(ES_CONTINUOUS);

                    }

                }

                catch (Exception ex)

                {

                    Debug.WriteLine($"Error toggling blackout: {ex.Message}");

                }

            }));

        }



        internal class BlackoutOverlayForm : Form

        {

            private readonly Action _onDismiss;



            public BlackoutOverlayForm(Rectangle bounds, Action onDismiss)

            {

                _onDismiss = onDismiss;

                AutoScaleMode = AutoScaleMode.None;

                FormBorderStyle = FormBorderStyle.None;

                StartPosition = FormStartPosition.Manual;

                Bounds = bounds;

                BackColor = Color.Black;

                TopMost = true;

                DoubleBuffered = true;

                Cursor = Cursors.Default;



                                KeyDown += (s, e) =>

                {

                    if (e.KeyCode == Keys.Escape || (e.Alt && e.KeyCode == Keys.Back))

                    {

                        _onDismiss?.Invoke();

                    }

                };

                MouseDown += (s, e) => _onDismiss?.Invoke();
                MouseDoubleClick += (s, e) => _onDismiss?.Invoke();

            }



            protected override CreateParams CreateParams

            {

                get

                {

                    CreateParams cp = base.CreateParams;

                    cp.ExStyle |= 0x80 | 0x08; // WS_EX_TOOLWINDOW | WS_EX_TOPMOST

                    return cp;

                }

            }

        }



        internal class UltraDarkOverlayForm : Form

        {

            public UltraDarkOverlayForm(Rectangle bounds, int tintPercent)

            {

                AutoScaleMode = AutoScaleMode.None;

                FormBorderStyle = FormBorderStyle.None;

                StartPosition = FormStartPosition.Manual;

                Bounds = bounds;

                BackColor = Color.Black;

                TopMost = true;


                DoubleBuffered = true;

                Opacity = Math.Clamp(tintPercent, 10, 95) / 100.0;

            }



            protected override CreateParams CreateParams

            {

                get

                {

                    CreateParams cp = base.CreateParams;

                    cp.ExStyle |= 0x20 | 0x80 | 0x08 | 0x08000000;

                    return cp;

                }

            }



            protected override bool ShowWithoutActivation => true;

        }

    }



    public static class ChildProcessTracker

    {

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]

        static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string? lpName);



        [DllImport("kernel32.dll")]

        static extern bool SetInformationJobObject(IntPtr hJob, JobObjectInfoType infoType, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);



        [DllImport("kernel32.dll", SetLastError = true)]

        static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);



        private static readonly IntPtr _jobHandle;



        static ChildProcessTracker()

        {

            try

            {

                _jobHandle = CreateJobObject(IntPtr.Zero, null);

                if (_jobHandle != IntPtr.Zero)

                {

                    var info = new JOBOBJECT_BASIC_LIMIT_INFORMATION

                    {

                        LimitFlags = 0x2000 // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

                    };

                    var extendedInfo = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION

                    {

                        BasicLimitInformation = info

                    };

                    int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));

                    IntPtr extendedInfoPtr = Marshal.AllocHGlobal(length);

                    try

                    {

                        Marshal.StructureToPtr(extendedInfo, extendedInfoPtr, false);

                        SetInformationJobObject(_jobHandle, JobObjectInfoType.ExtendedLimitInformation, extendedInfoPtr, (uint)length);

                    }

                    finally

                    {

                        Marshal.FreeHGlobal(extendedInfoPtr);

                    }

                }

            }

            catch (Exception ex)

            {

                Debug.WriteLine($"Failed to initialize JobObject: {ex.Message}");

            }

        }



        public static void AddProcess(Process process)

        {

            if (_jobHandle != IntPtr.Zero && process != null)

            {

                try

                {

                    AssignProcessToJobObject(_jobHandle, process.Handle);

                }

                catch (Exception ex)

                {

                    Debug.WriteLine($"Failed to assign process to JobObject: {ex.Message}");

                }

            }

        }



        [StructLayout(LayoutKind.Sequential)]

        struct IO_COUNTERS

        {

            public ulong ReadOperationCount;

            public ulong WriteOperationCount;

            public ulong OtherOperationCount;

            public ulong ReadTransferCount;

            public ulong WriteTransferCount;

            public ulong OtherTransferCount;

        }



        [StructLayout(LayoutKind.Sequential)]

        struct JOBOBJECT_BASIC_LIMIT_INFORMATION

        {

            public long PerProcessUserTimeLimit;

            public long PerJobUserTimeLimit;

            public uint LimitFlags;

            public UIntPtr MinimumWorkingSetSize;

            public UIntPtr MaximumWorkingSetSize;

            public uint ActiveProcessLimit;

            public UIntPtr Affinity;

            public uint PriorityClass;

            public uint SchedulingClass;

        }



        [StructLayout(LayoutKind.Sequential)]

        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION

        {

            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;

            public IO_COUNTERS IoInfo;

            public UIntPtr ProcessMemoryLimit;

            public UIntPtr JobMemoryLimit;

            public UIntPtr PeakProcessMemoryLimit;

            public UIntPtr PeakJobMemoryLimit;

        }



        enum JobObjectInfoType

        {

            ExtendedLimitInformation = 9

        }

    }

}









