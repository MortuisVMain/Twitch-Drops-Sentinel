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
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        private const int SW_RESTORE = 9;
        private const int SW_MAXIMIZE = 3;

        private readonly WebView2 _webView;
        private NotifyIcon? _trayIcon;
        private Process? _pythonBackendProcess;
        private System.Windows.Forms.Timer? _backendWatchdogTimer;
        private volatile bool _isShuttingDown = false;
        private volatile bool _isForceClosing = false;
        private FormWindowState _lastNonMinimizedState = FormWindowState.Normal;
        private readonly List<BlackoutOverlayForm> _activeBlackoutForms = new();

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
            _startMinimized = startMinimized;
            Text = "Twitch Drops Sentinel";
            MinimumSize = new Size(1180, 750);
            BackColor = Color.FromArgb(23, 29, 28);

            // Load and restore previous window size & position
            LoadWindowState();

            // Load app icon safely
            LoadAppIcon();

            // System tray icon initialization
            InitializeTrayIcon();

            // Ensure background Python service is active
            EnsurePythonBackendRunning();

            // Start continuous background watchdog to resurrect backend if it ever crashes/stops
            StartBackendWatchdog();

            KeyPreview = true;
            KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.F5)
                {
                    _webView.CoreWebView2?.Reload();
                }
            };

            ResizeEnd += (s, e) => SaveWindowState();
            Move += (s, e) => { if (WindowState == FormWindowState.Normal) SaveWindowState(); };

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(23, 29, 28)
            };

            Controls.Add(_webView);

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
                        Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true });
                    }
                    catch { }
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
                        using var reader = new StreamReader(stream);
                        string html = await reader.ReadToEndAsync();
                        _webView.CoreWebView2.NavigateToString(html);
                    }
                    else
                    {
                        _webView.CoreWebView2.NavigateToString("<html style=\"background:#0b0d13;color:#fff;font-family:sans-serif;padding:40px;\"><h2>Twitch Drops Sentinel v3</h2><p>dist/index.html not found. Please run npm run build.</p></html>");
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"WebView2 initialization failed:\n{ex.Message}", "Twitch Drops Sentinel", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                        if (_trayIcon != null) { _trayIcon.Visible = false; _trayIcon.Dispose(); _trayIcon = null; }
                        Application.Restart();
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
                        SetHardwareBrightness(monId, level);
                        NotifyWebviewDimmerState();
                    }
                    else if (action == "SET_BLACKOUT")
                    {
                        bool enabled = root.TryGetProperty("enabled", out var enProp) && enProp.GetBoolean();
                        int? solo = root.TryGetProperty("soloIndex", out var sProp) && sProp.ValueKind == JsonValueKind.Number ? sProp.GetInt32() : (int?)null;
                        SetBlackout(enabled, solo);
                        NotifyWebviewDimmerState();
                    }
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
                var exitItem = new ToolStripMenuItem("Выход из Sentinel", null, (s, e) =>
                {
                    SaveWindowState();
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
                    Application.Exit();
                });

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

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);

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
                    _trayIcon.ShowBalloonTip(1500, "Twitch Drops Sentinel", "Приложение свернуто в системный трей. Фарм продолжается в фоне.", ToolTipIcon.Info);
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
                if (WindowState != FormWindowState.Minimized)
                {
                    _lastNonMinimizedState = WindowState;
                }
                Hide();
                if (_trayIcon != null)
                {
                    _trayIcon.Visible = true;
                    _trayIcon.ShowBalloonTip(1500, "Twitch Drops Sentinel", "Работа продолжается в трее. Для полного закрытия: правый клик по иконке -> Выход.", ToolTipIcon.Info);
                }
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

        protected override void WndProc(ref Message m)
        {
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
                    _trayIcon.ShowBalloonTip(1500, "Twitch Drops Sentinel", "Приложение свернуто в системный трей. Фарм продолжается в фоне.", ToolTipIcon.Info);
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
                            catch { }
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
        private readonly Dictionary<string, int> _monitorBrightnessMap = new();

        public class NativeMonitorInfo
        {
            public string Id { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string DeviceName { get; set; } = string.Empty;
            public bool IsPrimary { get; set; }
            public bool IsLaptopInternal { get; set; }
            public int CurrentBrightness { get; set; } = 75;
            public uint MinBrightness { get; set; } = 0;
            public uint MaxBrightness { get; set; } = 100;
            public bool SupportsControl { get; set; } = true;
        }

        private List<NativeMonitorInfo> GetHardwareMonitors()
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

                for (int i = 0; i < ddcList.Count; i++)
                {
                    var mon = ddcList[i];
                    string desc = (mon.szPhysicalMonitorDescription ?? "").Trim();
                    if (string.IsNullOrEmpty(desc)) desc = $"Display {i + 1}";
                    string id = $"DDC_{i}_{desc}";
                    int currentBri = _masterBrightness;
                    uint min = 0, max = 100;
                    if (GetMonitorBrightness(mon.hPhysicalMonitor, out min, out uint cur, out max))
                    {
                        currentBri = (int)cur;
                    }

                    if (!_monitorBrightnessMap.ContainsKey(id))
                        _monitorBrightnessMap[id] = currentBri;
                    else
                        currentBri = _monitorBrightnessMap[id];

                    list.Add(new NativeMonitorInfo
                    {
                        Id = id,
                        Name = $"Внешний монитор ({desc})",
                        DeviceName = (i < screens.Length) ? screens[i].DeviceName : $@"\\.\DISPLAY{i + 1}",
                        IsPrimary = (i < screens.Length) && screens[i].Primary,
                        IsLaptopInternal = false,
                        CurrentBrightness = currentBri,
                        MinBrightness = min,
                        MaxBrightness = max,
                        SupportsControl = true
                    });
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
                        int bri = _masterBrightness;
                        if (obj["CurrentBrightness"] != null)
                        {
                            bri = Convert.ToInt32(obj["CurrentBrightness"]);
                        }
                        string id = $"WMI_{name}";
                        if (!_monitorBrightnessMap.ContainsKey(id))
                            _monitorBrightnessMap[id] = bri;
                        else
                            bri = _monitorBrightnessMap[id];

                        list.Add(new NativeMonitorInfo
                        {
                            Id = id,
                            Name = "Встроенный дисплей ноутбука",
                            DeviceName = "Laptop_Internal",
                            IsPrimary = false,
                            IsLaptopInternal = true,
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
                    int bri = _masterBrightness;
                    if (!_monitorBrightnessMap.ContainsKey(id))
                        _monitorBrightnessMap[id] = bri;
                    else
                        bri = _monitorBrightnessMap[id];

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

        private void SetHardwareBrightness(string monitorId, int level)
        {
            int clamped = Math.Clamp(level, 0, 100);
            if (monitorId == "master")
            {
                _masterBrightness = clamped;
                var mons = GetHardwareMonitors();
                foreach (var m in mons)
                {
                    SetHardwareBrightness(m.Id, clamped);
                }
                return;
            }

            _monitorBrightnessMap[monitorId] = clamped;

            // Run in background task to avoid blocking WebView2 UI thread
            Task.Run(() =>
            {
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

                            for (int i = 0; i < ddcList.Count; i++)
                            {
                                var mon = ddcList[i];
                                string desc = (mon.szPhysicalMonitorDescription ?? "").Trim();
                                if (string.IsNullOrEmpty(desc)) desc = $"Display {i + 1}";
                                string checkId = $"DDC_{i}_{desc}";
                                if (checkId == monitorId)
                                {
                                    SetMonitorBrightness(mon.hPhysicalMonitor, (uint)clamped);
                                }
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
            });
        }

        private void NotifyWebviewDimmerState()
        {
            try
            {
                var monitors = GetHardwareMonitors();
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
                            min_brightness = m.MinBrightness,
                            max_brightness = m.MaxBrightness,
                            supports_control = m.SupportsControl
                        }).ToList(),
                        master_brightness = _masterBrightness,
                        is_dimmed = _masterBrightness < 50,
                        is_blackout = _isBlackout,
                        solo_screen_index = _soloBlackoutIndex,
                        sleep_timer_minutes = 0,
                        away_mode_active = _isBlackout,
                        mute_audio_on_blackout = false
                    }
                };

                string json = JsonSerializer.Serialize(stateObj);
                this.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        _webView?.CoreWebView2?.PostWebMessageAsJson(json);
                    }
                    catch { }
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

                MouseDown += (s, e) => _onDismiss?.Invoke();
                KeyDown += (s, e) => _onDismiss?.Invoke();
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




