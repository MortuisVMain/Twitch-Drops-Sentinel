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

        private static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);
        public static uint WM_SENTINEL_SHOW;
        private static Mutex? _singleInstanceMutex;

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

            if (!isNewInstance)
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

            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
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
                ApplicationConfiguration.Initialize();
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
