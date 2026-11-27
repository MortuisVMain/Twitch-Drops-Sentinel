using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TwitchDropsSentinel
{
    /// <summary>How the sign-in window ended: a token, an error code from Twitch, or neither (the user closed it).</summary>
    public readonly record struct TwitchLoginResult(string? Token, string? Error);

    /// <summary>
    /// A window with its own WebView2 (a user-data folder apart from the app's, so the main profile is untouched) that shows
    /// twitch.tv's login for the Android app client and reads the token off the redirect. The token leaves this class only
    /// through the returned value; it is never logged. The folder (with Twitch's own web cookies) is deleted after each login.
    /// </summary>
    internal sealed class TwitchLoginWindow : Form
    {
        private static TwitchLoginWindow? _active;
        private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
        private readonly TaskCompletionSource<TwitchLoginResult> _done = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly Action<string, Exception> _log;
        private readonly string _userDataFolder;

        private TwitchLoginWindow(Icon? icon, Action<string, Exception> log)
        {
            _log = log;
            _userDataFolder = Path.Combine(RootFolder(), Guid.NewGuid().ToString("N"));
            Text = "Вход в Twitch — Hell Harvest";
            Icon = icon;
            ClientSize = new Size(520, 760);
            MinimumSize = new Size(420, 560);
            StartPosition = FormStartPosition.CenterParent;
            Controls.Add(_web);
        }

        private static string RootFolder() => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TwitchDropsSentinel", "WebView2Login");

        /// <summary>Brings an already open sign-in window to the front on repeat clicks.</summary>
        public static bool TryFocusExisting()
        {
            var window = _active;
            if (window is null || window.IsDisposed) return false;
            if (window.WindowState == FormWindowState.Minimized) window.WindowState = FormWindowState.Normal;
            window.Activate();
            window.BringToFront();
            return true;
        }

        /// <summary>Shows the window and waits until it ends. Call on the UI thread.</summary>
        public static async Task<TwitchLoginResult> ShowAsync(Form owner, Action<string, Exception> log)
        {
            CleanupLeftovers(log); // leftovers of a previous or crashed run; active sessions use their own GUID folder
            var window = new TwitchLoginWindow(owner.Icon, log);
            _active = window;
            try
            {
                window.Show(owner);
                var result = await window._done.Task;
                // Close (not only Dispose) so OnFormClosed runs: it disposes WebView2 and deletes the data folder.
                // A window the user closed is already disposed.
                if (!window.IsDisposed) window.Close();
                window.Dispose();
                return result;
            }
            finally
            {
                if (ReferenceEquals(_active, window)) _active = null;
            }
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            try
            {
                Directory.CreateDirectory(_userDataFolder);
                var env = await CoreWebView2Environment.CreateAsync(null, _userDataFolder);
                if (IsDisposed || _web.IsDisposed || _done.Task.IsCompleted) return;
                await _web.EnsureCoreWebView2Async(env);
                if (IsDisposed || _web.IsDisposed || _done.Task.IsCompleted) return;
                var core = _web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.NavigationStarting += (s, args) =>
                {
                    if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
                    {
                        args.Cancel = true; // only https pages belong in a sign-in window
                        return;
                    }
                    if (Finish(args.Uri)) args.Cancel = true; // the redirect itself is not loaded
                };
                core.SourceChanged += (s, args) => Finish(core.Source);
                core.NewWindowRequested += (s, args) =>
                {
                    args.Handled = true; // a pop-up of the login page opens here instead of in a new window
                    if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps) core.Navigate(args.Uri);
                };
                core.Navigate(TwitchTokenRedirect.LoginUrl);
            }
            catch (Exception ex)
            {
                if (IsDisposed) return;
                _log("twitch login window", ex);
                _done.TrySetResult(new TwitchLoginResult(null, "window_failed"));
                if (!IsDisposed) Close();
            }
        }

        /// <summary>True when the address was the end of the sign-in (token or error); the window then closes.</summary>
        private bool Finish(string? url)
        {
            var redirect = TwitchTokenRedirect.Parse(url);
            if (redirect.Kind == TwitchRedirectKind.NotRedirect) return false;
            _done.TrySetResult(new TwitchLoginResult(redirect.Token, redirect.Error)); // ShowAsync closes the window
            return true;
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            if (ReferenceEquals(_active, this)) _active = null;
            _done.TrySetResult(new TwitchLoginResult(null, null)); // closed by the user before the end
            try { _web.Dispose(); }
            catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException) { _log("twitch login window dispose", ex); }
            _ = DeleteFolderLaterAsync(_userDataFolder, _log); // WebView2's browser process lets go of the folder a moment later
            base.OnFormClosed(e);
        }

        private static void CleanupLeftovers(Action<string, Exception> log)
        {
            var root = RootFolder();
            if (!Directory.Exists(root)) return;
            try
            {
                foreach (var dir in Directory.GetDirectories(root)) DeleteFolder(dir, null);
                foreach (var file in Directory.GetFiles(root))
                {
                    try { File.Delete(file); }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { log("twitch login leftover file", ex); }
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { log("twitch login leftover root", ex); }
        }

        private static async Task DeleteFolderLaterAsync(string folder, Action<string, Exception> log)
        {
            for (int attempt = 0; attempt < 4; attempt++)
            {
                await Task.Delay(1500);
                if (DeleteFolder(folder, attempt == 3 ? log : null)) return; // only the last failure is reported
            }
        }

        private static bool DeleteFolder(string folder, Action<string, Exception>? log)
        {
            try
            {
                if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                log?.Invoke("twitch login data folder", ex);
                return false;
            }
        }
    }
}
