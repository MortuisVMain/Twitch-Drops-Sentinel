# Решение 027: Устойчивый многоуровневый GameScanner и IPC-мост папок WebView2

## Проблема
На чистых Windows-системах (включая ПК других пользователей) автоопределение игр не находило установленные игры:
1. Запрос `POST /api/scan-games` возвращал **HTTP 500 Internal Server Error** из-за отсутствия метода `CampaignsFetcher.refresh_installed_games()` и обращения `[g.name for g in installed]` к словарям.
2. В интерфейсе React клик по кнопке «+ Выбрать папку на диске» открывал нативный `FolderBrowserDialog`, но выбранный путь бесследно пропадал, так как в React не было слушателя сообщений `FOLDER_SELECTED` от `window.chrome.webview`.
3. Сканер пользовательских папок искал `.exe` только на нулевой глубине подпапки (`os.scandir(sub_path)`). Игры с исполняемыми файлами в `bin/x64/`, `Binaries/Win64/`, `Retail/` (Witcher 3, Cyberpunk 2077, Hitman, UE5/Unity) отбрасывались.
4. В реестре 64-битной Windows Steam ключ называется `InstallPath`, а не `SteamPath`, из-за чего сканирование Steam падало, если Steam не был запущен в сессии текущего пользователя.

## Решение (Архитектура Argon & Karpathy)
1. **Двухконтурный контракт `InstalledGame(dict)`:**
   Класс наследуется от `dict` с `self.__dict__ = self`. Это гарантирует 100% совместимость как со старым кодом, использующим `g['name']`, так и с кодом, обращающимся к `g.name`, `g.executable_names`, `g.to_dict()`, и обеспечивает нативную сериализацию в JSON.
2. **Метод `CampaignsFetcher.refresh_installed_games()`:**
   Перечитывает актуальный `installed_games.json`, пересобирает кэш каталога `_build_catalog()` и обновляет сопоставление со стримами и дропами. Добавлен алиас `fetch_active_campaigns_and_cache`.
3. **Многоуровневый сканер игр (Tier 1..3):**
   - **Tier 1A (Steam):** чтение ключей `InstallPath`, `SteamPath`, `SteamExe` в 32/64-битных ветках `HKLM` и `HKCU`, поддержка нового (`"path"`) и старого (`"1"`) форматов `libraryfolders.vdf`, сканирование всех букв дисков `A-Z:\SteamLibrary`.
   - **Tier 1B (Epic Games):** сканирование манифестов `.item`, поддержка `ModSdkMetadataDir` в реестре и альтернативных дисков.
   - **Tier 1C (GOG Galaxy):** 32/64-битные ветки реестра `HKLM` и `HKCU`.
   - **Tier 2 (Windows Uninstall Registry):** универсальный перебор установленных приложений Windows (Battle.net, Riot, EA, Ubisoft, Standalone) с умной фильтрацией офисного ПО и драйверов.
   - **Tier 3 (Пользовательские папки):** поддержка как прямого указания папки с игрой (`D:\Games\Rust`), так и библиотеки (`D:\Games`) с поиском исполняемых файлов до глубины 3 (приоритет `bin/x64`, `Binaries/Win64`, `Retail`).
4. **Сквозной IPC-мост в `SettingsStudio.tsx`:**
   Добавлен хук `React.useEffect` со слушателем `window.chrome.webview.addEventListener('message', ...)`, который перехватывает `FOLDER_SELECTED`, валидирует `data.path`, отправляет `POST /api/game-directories/add`, обновляет стейт и инициирует автоматический пересчет библиотек.

## Верификация
- Полный прогон `test_sentinel_suite.py` подтвердил прохождение всех 24 гейтов (Exit Code 0).
- Сканер обнаружил 180 установленных игр на системе с определением исполняемых файлов.
- Эндпоинт `POST /api/scan-games` возвращает `status: "rescanned"` без ошибок 500.
