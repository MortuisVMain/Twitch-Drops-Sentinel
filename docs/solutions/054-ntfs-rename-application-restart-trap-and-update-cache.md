# Решение 054: Ловушка Application.Restart() при NTFS-ротации и оптимизация кэша авто-апдейтера

## Контекст и симптомы
После релиза `v3.3.5 «Field-Deck»` на GitHub возникла проблема: у пользователей после обновления приложение продолжало запускаться со старым интерфейсом `v3.3.4` (вертикальный сайдбар Bento вместо новой панели Field-Deck).

## Анализ первопричин (Root-Cause Analysis)
1. **NTFS File Renaming Trap & `Application.Restart()`**:
   - При установке патча запущенный исполняемый файл `TwitchDropsSentinel.exe` переименовывается в `TwitchDropsSentinel.exe.old`, а на его место встаёт распакованный `TwitchDropsSentinel.update` -> `TwitchDropsSentinel.exe`.
   - При клике «Перезапустить» в `desktop/MainForm.cs` вызывался метод `Application.Restart()`.
   - В .NET WinForms метод `Application.Restart()` запрашивает путь через `Application.ExecutablePath` (`GetModuleFileName`). Так как процесс был переименован прямо во время выполнения, ядро Windows вернуло путь с суффиксом `.old`.
   - В результате `Application.Restart()` повторно запускал устаревший бинарник `TwitchDropsSentinel.exe.old`.
2. **Глобальный Mutex одиночного экземпляра**:
   - В `desktop/Program.cs` зарегистрирован глобальный Mutex `@Global\TwitchDropsSentinel_v3_Mutex`.
   - Если пользователь скачал новый архив `v3.3.5`, распаковал его в отдельную папку и попытался запустить, пока старый Sentinel v3.3.4 ещё работал в фоне (в трее), второй процесс немедленно завершался и просто разворачивал старое окно v3.3.4.
3. **Длительный 6-часовой кэш проверки обновлений**:
   - В `core/updater.py` результат проверки GitHub API кэшировался на 6 часов (`21600 сек`). Если пользователь запустил Sentinel до публикации релиза, уведомление об обновлении не появлялось автоматически до ручного нажатия «Проверить обновления» в Настройках.

## Выполненные исправления
1. **Хирургический фикс перезапуска в `desktop/MainForm.cs`**:
   - Вместо `Application.Restart()` реализован явный запуск целевого `TwitchDropsSentinel.exe` в директории приложения:
     ```csharp
     string targetExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "TwitchDropsSentinel.exe");
     Process.Start(new ProcessStartInfo
     {
         FileName = File.Exists(targetExe) ? targetExe : Application.ExecutablePath,
         UseShellExecute = true,
         WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
     });
     Environment.Exit(0);
     ```
   - Это гарантирует, что даже после переименования запущенного процесса в `.old`, на перезапуске всегда стартует свежий обновлённый бинарник `TwitchDropsSentinel.exe`.
2. **Снижение времени жизни кэша проверки в `core/updater.py`**:
   - Таймаут кэширования снижен с 6 часов (21600 с) до 15 минут (900 с).
3. **Пересборка артефактов и релизных архивов**:
   - `dotnet publish -c Release -o publish` ➔ собран свежий бинарник `TwitchDropsSentinel.exe` (113 MB).
   - `tools/create_clean_release.py` ➔ сгенерированы обновленные архивы `Twitch_Drops_Sentinel_v3.3.5_Public_Release.zip` (60.91 MB) и `Twitch_Drops_Sentinel_Patch_v3.3.5.zip` (46.83 MB).
4. **Верификация**:
   - Полный тестовый комплекс `test_sentinel_suite.py` успешно пройден: **36 из 36 гейтов [Exit Code 0]**.
