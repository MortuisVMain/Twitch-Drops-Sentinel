using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace TwitchDropsSentinel
{
    /// <summary>The sign-in page of Twitch the panel may open. The address comes from the service's memory, so only https on twitch.tv passes; anything else becomes the usual page.</summary>
    public static class TwitchActivatePolicy
    {
        public const string DefaultUri = "https://www.twitch.tv/activate";

        public static string Resolve(string? raw)
        {
            if (string.IsNullOrEmpty(raw) || raw.Any(c => char.IsWhiteSpace(c) || char.IsControl(c))) return DefaultUri;
            if (!raw.Contains("://")) raw = "https://" + raw;
            if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri)) return DefaultUri;
            bool onTwitch = uri.Host == "twitch.tv" || uri.Host.EndsWith(".twitch.tv", StringComparison.Ordinal);
            return uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo) && onTwitch ? uri.AbsoluteUri : DefaultUri;
        }
    }

    /// <summary>
    /// "Reset window data": the page cannot delete the WebView2 folder while the window uses it, so it asks for a marker file and the folder is deleted at the next
    /// start, before WebView2 opens. Only %LOCALAPPDATA%\TwitchDropsSentinel\WebView2Data itself can ever be deleted. The window shows only the app's own page
    /// (everything else opens in the browser), so the folder holds the page cache and the page's own saved view settings, never a Twitch or Steam sign-in.
    /// </summary>
    public static class WebViewDataReset
    {
        public const string FolderName = "WebView2Data";
        public const string MarkerName = "WebView2Data.reset";

        private static string RootUnder(string localAppData) => Path.Combine(localAppData, "TwitchDropsSentinel");

        public static string FolderUnder(string localAppData) => Path.Combine(RootUnder(localAppData), FolderName);

        /// <summary>Next to the folder, not inside it: the folder is what gets deleted.</summary>
        public static string MarkerUnder(string localAppData) => Path.Combine(RootUnder(localAppData), MarkerName);

        /// <summary>True only for exactly the window data folder: rooted, no "." or ".." parts, no control characters, the same path as FolderUnder (case ignored, a trailing separator allowed).</summary>
        public static bool IsAllowedFolder(string? path, string localAppData)
        {
            if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(localAppData)) return false;
            if (path.Any(char.IsControl) || !Path.IsPathRooted(path) || !Path.IsPathRooted(localAppData)) return false;
            if (path.Split('\\', '/').Any(part => part is "." or "..")) return false;
            try
            {
                char[] separators = { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar };
                string full = Path.GetFullPath(path).TrimEnd(separators);
                string expected = Path.GetFullPath(FolderUnder(localAppData)).TrimEnd(separators);
                return string.Equals(full, expected, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(Path.GetFileName(full), FolderName, StringComparison.OrdinalIgnoreCase);
            }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
            {
                return false;
            }
        }

        public static bool Schedule(string localAppData, out string error)
        {
            error = "";
            try
            {
                Directory.CreateDirectory(RootUnder(localAppData));
                File.WriteAllText(MarkerUnder(localAppData), DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture), Encoding.UTF8);
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                error = ex.Message;
                return false;
            }
        }

        private const string DoneState = "done";

        /// <summary>A marker that asks for a reset. A marker holding "done" is what is left when the real one could not be deleted: it asks for nothing.</summary>
        private static bool IsPending(string marker)
        {
            try
            {
                return File.Exists(marker) && !File.ReadAllText(marker).StartsWith(DoneState, StringComparison.Ordinal);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                return true;  // unreadable: treated as a request, the folder check and the retry loop decide
            }
        }

        private static bool TryDelete(Action delete, int attempts, int delayMs, out string error)
        {
            error = "";
            for (int attempt = 1; ; attempt++)
            {
                try
                {
                    delete();
                    return true;
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    error = ex.Message;
                    if (attempt >= attempts) return false;
                    Thread.Sleep(delayMs);
                }
            }
        }

        /// <summary>The marker is deleted (same retries as the folder). If that fails it is overwritten with "done", or renamed, so the next start does not wipe the new data again.</summary>
        private static void RetireMarker(string marker, int attempts, int delayMs)
        {
            if (TryDelete(() => File.Delete(marker), attempts, delayMs, out _)) return;
            if (TryDelete(() => File.WriteAllText(marker, DoneState), 1, 0, out _)) return;
            TryDelete(() => File.Move(marker, marker + ".done", true), 1, 0, out _);
        }

        /// <summary>
        /// At the start, before WebView2 opens: with the marker present the folder is deleted and the marker removed. Returns true when the reset happened; false when there
        /// is nothing to do or it did not happen, and note says why (empty when there was no marker). A locked file keeps the marker for the next start; a folder that is
        /// a link is refused and the marker dropped, since it would never succeed. Never throws: whatever else goes wrong comes back as false with a note.
        /// </summary>
        public static bool ApplyPending(string localAppData, out string note, int attempts = 5, int delayMs = 400)
        {
            note = "";
            try
            {
                string marker = MarkerUnder(localAppData);
                if (!File.Exists(marker)) return false;
                if (!IsPending(marker))
                {
                    TryDelete(() => File.Delete(marker), attempts, delayMs, out _);  // the leftover of an earlier start that could not delete it
                    return false;
                }
                string folder = FolderUnder(localAppData);
                if (!IsAllowedFolder(folder, localAppData))
                {
                    note = "refused: not the window data folder";
                    return false;
                }
                if (Directory.Exists(folder))
                {
                    if (new DirectoryInfo(folder).Attributes.HasFlag(FileAttributes.ReparsePoint))
                    {
                        RetireMarker(marker, attempts, delayMs);
                        note = "refused: the window data folder is a link";
                        return false;
                    }
                    if (!TryDelete(() => Directory.Delete(folder, true), attempts, delayMs, out string error))
                    {
                        note = "the window data folder is in use: " + error;
                        return false;
                    }
                }
                RetireMarker(marker, attempts, delayMs);
                return true;
            }
            catch (Exception ex) when (ex is not OutOfMemoryException)
            {
                Debug.WriteLine("WebViewDataReset: reset failed: " + ex);
                note = ex.GetType().Name + ": " + ex.Message;
                return false;
            }
        }

        private static long FolderBytes(string folder)
        {
            long total = 0;
            var options = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
            foreach (var file in new DirectoryInfo(folder).EnumerateFiles("*", options))
            {
                try { total += file.Length; }
                catch (IOException) { /* a file that vanished while counting adds nothing */ }
            }
            return total;
        }

        private static string Size(long bytes) =>
            bytes < 1024 * 1024 ? (bytes / 1024.0).ToString("0.#", CultureInfo.InvariantCulture) + " КБ" : (bytes / 1024.0 / 1024.0).ToString("0.#", CultureInfo.InvariantCulture) + " МБ";

        private static string SizeEn(long bytes) => Size(bytes).Replace("КБ", "KB").Replace("МБ", "MB");

        /// <summary>The "Данные окна" row: always ok, with the reset unless one is already scheduled.</summary>
        public static DiagnosticCheck BuildRow(string localAppData, bool ru)
        {
            string L(string r, string e) => ru ? r : e;
            string title = L("Данные окна", "Window data");
            if (IsPending(MarkerUnder(localAppData)))
                return new DiagnosticCheck("webview_data", "ok", title, L("Сброс запланирован: перезапустите приложение, и данные окна удалятся при старте.", "A reset is scheduled: restart the app and the window data is deleted at the start."), "");
            string folder = FolderUnder(localAppData);
            string detail;
            try
            {
                detail = Directory.Exists(folder)
                    ? L($"Размер: {Size(FolderBytes(folder))}.", $"Size: {SizeEn(FolderBytes(folder))}.")
                    : L("Папки данных окна ещё нет.", "The window data folder does not exist yet.");
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                detail = L("Размер не удалось узнать: ", "Could not read the size: ") + ex.Message;
            }
            var fix = new DiagnosticFix("webview_reset", L("Сбросить данные окна", "Reset window data"),
                L("Сбросятся данные окна приложения: кэш страниц и настройки вида, которые хранит само окно (тема, язык интерфейса, фильтры). Входы в Twitch и Steam и настройки службы не пострадают: они хранятся вне окна.",
                  "The app window's data is reset: the page cache and the view settings the window itself stores (theme, interface language, filters). The Twitch and Steam sign-ins and the service settings are not affected: they are stored outside the window."));
            return new DiagnosticCheck("webview_data", "ok", title, detail, L("Если окно показывает пустую страницу или странности после обновления, сбросьте данные окна.", "If the window shows a blank page or oddities after an update, reset the window data."), Fix: fix);
        }
    }
}
