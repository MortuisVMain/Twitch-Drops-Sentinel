# Решение 051: Подготовка релиза v3.3.5 и генеральная очистка рабочей области

## Контекст и цели
После внедрения обхода возрастных ограничений 18+ для Epic Games, адаптации под новый флоу покупки Epic 2025+, фикса залипания скролла консолей и удаления избыточной панели телеметрии потребовалось:
1. Синхронизировать версию проекта до `3.3.5`.
2. Собрать все продакшен-артефакты (Giveaways Engine, Frontend Bundle, C# Desktop App).
3. Создать чистые дистрибутивы для пользователей и GitHub Auto-Updater.
4. Провести глубокую очистку репозитория от временных файлов, старых сборок и дампов, чтобы освободить контекст для Claude Code и предотвратить конфликты, сохранив при этом пользовательские бэкапы.

## Выполненные действия
1. **Синхронизация версии v3.3.5**:
   - `core/version.py`: `__version__ = "3.3.5"`
   - `package.json`: `"version": "3.3.5"`
   - `desktop/TwitchDropsSentinel.csproj`: `<Version>3.3.5</Version>`
   - `src/App.tsx`: `v{sentinelState.version || '3.3.5'}`
   - `test_sentinel_suite.py`: обновлены тестовые ассерты версии и семантического парсинга.
2. **Сборка продакшен-артефактов**:
   - Giveaways Engine: `npm run build` ➔ пересобраны `dist/*.mjs`.
   - Frontend Bundle: `npm run build` ➔ собран чистый бандл `dist/index.html` (594 KB).
   - Desktop App: `dotnet publish -c Release -o publish` ➔ собран `TwitchDropsSentinel.exe` (113 MB).
3. **Генерация релизных архивов**:
   - `Twitch_Drops_Sentinel_v3.3.5_Public_Release.zip` (60.89 MB) — полный автономный дистрибутив.
   - `Twitch_Drops_Sentinel_Patch_v3.3.5.zip` (46.81 MB) — дельта-патч для авто-апдейтера.
4. **Хирургическая очистка рабочей области**:
   - Удалено >230 МБ устаревших сборок (`.old`, zip-архивы v3.3.4, `ui_redesign_bundle.zip`).
   - Удалены временные дампы и прототипы Figma (`figma_*.svg`, `figma_*.js`, превью-html).
   - Удалены промежуточные папки: `Design Concept/`, `preview/`, `ui_redesign_bundle/`, `dist_package/`, `dist_release/`, `publish/`.
   - Удалены устаревшие CSS-дампы из `tools/`.
   - Удалены 10 временных юнит-тестов отладки (вся логика покрыта единым `test_sentinel_suite.py`).
   - **Строго сохранены**: папка `backups/`, `.backup_state/`, пользовательские конфиги (`config.json`, `cookies.jar`, `Trophies.md`).
5. **Финальная верификация**:
   - `python -X utf8 test_sentinel_suite.py` ➔ **36 из 36 гейтов пройдены с Exit Code 0**.
