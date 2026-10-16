using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace TwitchDropsSentinel
{
    public static class Program
    {
        [DllImport("shell32.dll", SetLastError = true)]
        private static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        [STAThread]
        public static void Main(string[]? args)
        {
            try
            {
                SetCurrentProcessExplicitAppUserModelID("Mortuis_V_Studio.TwitchDropsSentinel.Luna.v3_1");
            }
            catch { }

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
                ApplicationConfiguration.Initialize();
                Application.Run(new MainForm());
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
        }
    }
}
