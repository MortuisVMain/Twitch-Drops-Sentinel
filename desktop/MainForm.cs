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

        private readonly WebView2 _webView;
        private NotifyIcon? _trayIcon;
        private Process? _pythonBackendProcess;
        private System.Windows.Forms.Timer? _backendWatchdogTimer;
        private volatile bool _isShuttingDown = false;
        private volatile bool _isForceClosing = false;

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
                        ShowInTaskbar = false;
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

                        _pythonBackendProcess.OutputDataReceived += (s, e) =>
                        {
                            if (e.Data != null)
                            {
                                try { File.AppendAllText(stdoutLog, e.Data + Environment.NewLine, Encoding.UTF8); } catch { }
                            }
                        };
                        _pythonBackendProcess.ErrorDataReceived += (s, e) =>
                        {
                            if (e.Data != null)
                            {
                                try { File.AppendAllText(stderrLog, e.Data + Environment.NewLine, Encoding.UTF8); } catch { }
                            }
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
                            string responseJson = $"{{\"type\":\"FOLDER_SELECTED\",\"path\":\"{safePath}\"}}";
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
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Tray icon init failed: {ex.Message}");
            }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (WindowState == FormWindowState.Minimized)
            {
                Hide();
                ShowInTaskbar = false;
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
                Hide();
                ShowInTaskbar = false;
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

        protected override void WndProc(ref Message m)
        {
            if (Program.WM_SENTINEL_SHOW != 0 && m.Msg == (int)Program.WM_SENTINEL_SHOW)
            {
                RestoreFromTray();
                return;
            }
            base.WndProc(ref m);
        }

        private void RestoreFromTray()
        {
            Show();
            WindowState = FormWindowState.Normal;
            ShowInTaskbar = true;
            BringToFront();
            Activate();
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




