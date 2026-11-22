using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace TwitchDropsSentinel
{
    public static class Program
    {
        [DllImport("shell32.dll", SetLastError = true)]
        private static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern uint RegisterWindowMessage(string lpString);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        private const uint WM_CLOSE = 0x0010;
        private static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);
        public static uint WM_SENTINEL_SHOW;
        private static Mutex? _singleInstanceMutex;

        private static void LogCrash(string tag, Exception ex)
        {
            try
            {
                string log = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log");
                File.AppendAllText(log, $"[{DateTime.UtcNow:O}] [{tag}] {ex}\n");
            }
            catch { }
        }

        private static void LogStartConflict(string message)
        {
            try { File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log"), $"[{DateTime.UtcNow:O}] [StartConflict] {message}\n"); }
            catch { }
        }

        /// <summary>
        /// The mutex is taken. When the owner is an older copy from another folder and the user agrees, close it (politely, then its
        /// whole process tree) and take the mutex over; true means this copy goes on starting. Any failure keeps the old behaviour.
        /// </summary>
        private static bool TryReplaceOlderCopy()
        {
            var handles = new Dictionary<int, Process>();
            try
            {
                string ownDir = AppContext.BaseDirectory.TrimEnd('\\', '/');
                string ownVersion = StartConflict.ReadVersion(ownDir) ?? typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "0";
                var running = new List<RunningCopy>();
                foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(StartConflict.ExeName)))
                {
                    try
                    {
                        string? exe = process.MainModule?.FileName;
                        if (exe != null)
                        {
                            running.Add(new RunningCopy(process.Id, exe, process.StartTime));
                            handles[process.Id] = process; // kept: the close re-checks this very process, not a pid
                            continue;
                        }
                    }
                    catch (Exception ex) when (ex is Win32Exception || ex is InvalidOperationException) { } // another user's process
                    process.Dispose();
                }
                bool russian = StartConflict.IsRussian(ownDir, CultureInfo.CurrentUICulture.TwoLetterISOLanguageName);
                return StartConflict.Resolve(ownDir, ownVersion, Environment.ProcessId, running, StartConflict.ReadVersion,
                    copies => AskReplace(StartConflict.DialogText(copies, russian)),
                    copy => StartConflict.CloseVerified(copy, new ProcessHandle(handles[copy.Pid]), StartConflict.CloseGrace, LogStartConflict),
                    () => _singleInstanceMutex != null && StartConflict.AcquireAfter(_singleInstanceMutex, StartConflict.MutexWait))
                    == StartConflictOutcome.StartThisCopy;
            }
            catch (Exception ex)
            {
                LogCrash("StartConflict", ex);
                return false;
            }
            finally
            {
                foreach (var process in handles.Values) process.Dispose();
            }
        }

        /// <summary>Yes/No in front of everything, with No as the default: Enter or a stray key must not close a running copy.</summary>
        private static bool AskReplace(string text)
        {
            using var owner = new Form
            {
                TopMost = true, ShowInTaskbar = false, FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.Manual,
                Location = new System.Drawing.Point(-32000, -32000), Size = new System.Drawing.Size(1, 1)
            };
            owner.Show();
            owner.Activate();
            return MessageBox.Show(owner, text, "Hell Harvest", MessageBoxButtons.YesNo, MessageBoxIcon.Question,
                MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }

        /// <summary>
        /// The old copy as the close logic sees it. The polite close is WM_CLOSE to every top-level window of the process, hidden ones
        /// included (CloseMainWindow only reaches a visible main window, and a copy in the tray has none).
        /// </summary>
        private sealed class ProcessHandle : IProcessHandle
        {
            private readonly Process _process;
            public ProcessHandle(Process process) { _process = process; }
            public bool HasExited => _process.HasExited;
            public DateTime StartTime => _process.StartTime;
            public string? ExePath => _process.MainModule?.FileName;
            public bool WaitForExit(TimeSpan timeout) => _process.WaitForExit((int)timeout.TotalMilliseconds);
            public void KillTree() => _process.Kill(entireProcessTree: true);

            public bool RequestClose()
            {
                uint pid = (uint)_process.Id;
                bool posted = false;
                EnumWindows((hwnd, _) =>
                {
                    GetWindowThreadProcessId(hwnd, out uint owner);
                    if (owner == pid) posted |= PostMessage(hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    return true;
                }, IntPtr.Zero);
                return posted;
            }
        }

        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                SetCurrentProcessExplicitAppUserModelID("Mortuis_V_Studio.TwitchDropsSentinel.Luna.v3_1");
            }
            catch { }

            WM_SENTINEL_SHOW = RegisterWindowMessage("WM_SENTINEL_SHOW_V3_0");

            bool isNewInstance = false;
            try
            {
                _singleInstanceMutex = new Mutex(true, @"Global\TwitchDropsSentinel_v3_Mutex", out isNewInstance);
            }
            catch
            {
                isNewInstance = true;
            }

            try
            {
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                ApplicationConfiguration.Initialize(); // before the first window: the question below is one
            }
            catch (Exception ex)
            {
                LogCrash("Initialize", ex);
                return;
            }

            if (!isNewInstance && !TryReplaceOlderCopy())
            {
                // App already running! Wake existing instance from tray and exit immediately
                PostMessage(HWND_BROADCAST, WM_SENTINEL_SHOW, IntPtr.Zero, IntPtr.Zero);
                return;
            }

            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                try
                {
                    string log = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log");
                    File.AppendAllText(log, $"[{DateTime.UtcNow:O}] [UnhandledException] {e.ExceptionObject}\n");
                }
                catch { }
            };

            Application.ThreadException += (s, e) =>
            {
                try
                {
                    string log = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log");
                    File.AppendAllText(log, $"[{DateTime.UtcNow:O}] [ThreadException] {e.Exception}\n");
                }
                catch { }
            };

            try
            {
                bool startMinimized = args != null && args.Any(a => a.Equals("--minimized", StringComparison.OrdinalIgnoreCase));
                Application.Run(new MainForm(startMinimized));
            }
            catch (Exception ex)
            {
                try
                {
                    string log = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log");
                    File.AppendAllText(log, $"[{DateTime.UtcNow:O}] [MainException] {ex}\n");
                }
                catch { }
            }
            finally
            {
                if (_singleInstanceMutex != null)
                {
                    try { _singleInstanceMutex.ReleaseMutex(); } catch { }
                    _singleInstanceMutex.Dispose();
                }
            }
        }
    }
}
