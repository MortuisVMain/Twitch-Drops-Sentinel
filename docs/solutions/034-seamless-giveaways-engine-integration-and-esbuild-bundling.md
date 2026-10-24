# 034 — Бесшовная Интеграция Модуля Раздач (Giveaways) и Автономный Бандлинг через esbuild

**Дата:** 2026-10-24  
**Автор:** Mortuis_V_Studio  
**Статус:** Выполнено & Верифицировано (Exit Code 0, 36/36 тестов, GitHub remote: `origin/main` commit `5aff483`)

---

## 1. Проблема и Контекст
1. **Разрозненность архитектуры:** Подсистема сбора бесплатных игр (`giveaways_engine`) существовала в виде форка стороннего репозитория (`Free Games Claimer`), вызывавшегося из Python через громоздкий Windows-батник `ClaimGames.cmd`.
2. **Сбои рантайма Node.js (`ERR_MODULE_NOT_FOUND`):** При отсутствии `node_modules` (или при упаковке релиза, где тяжелые зависимости исключаются) скрипты падали с ошибками отсутствия пакетов `otplib`, `chalk`, `lowdb`, `enquirer`.
3. **Ощущение чужеродного приложения:** Наличие посторонней документации, файлов `docker`, лицензий, устаревших скриптов (`test-browser.js`, `unrealengine.js`, `steam-games.js`) нарушало монолитность и качество кодовой базы Sentinel.

---

## 2. Архитектурное Решение
1. **Нативный Node.js Раннер (`giveaways_engine/runner.js`):**
   - Разработан компактный (140 строк) Vanilla Node.js диспетчер.
   - Поддерживает флаги `--headless` / `--show`, селективный запуск платформ через `--claim <stores...>`, последовательное выполнение, изоляцию процессов каждого магазина и мгновенный перехват ошибок без падения всей сессии.
2. **Автономные бандлы через esbuild (`dist/*.mjs`):**
   - Скрипты 7 поддерживаемых магазинов (`epic-games`, `gog`, `steam`, `fab`, `unity`, `itch`, `prime-gaming`) скомпилированы в `giveaways_engine/dist/` с флагами `--platform=node --format=esm --external:patchright`.
   - Добавлен ESM banner `import { createRequire } from 'module'; const require = createRequire(import.meta.url);` для совместимости с CommonJS-зависимостями.
   - Пакеты `otplib`, `chalk`, `lowdb`, `dotenv`, `fingerprint-generator`, `fingerprint-injector` запечены прямо в код каждого магазина. Ошибки `ERR_MODULE_NOT_FOUND` исключены навсегда.
3. **Обновление Python Модуля (`core/giveaways_controller.py`):**
   - Метод `start_claim()` определяет наличие `runner.js` и вызывает напрямую `node runner.js` (минуя `cmd.exe /c ClaimGames.cmd`).
   - Автоматический самовосстанавливающийся сторож проверяет только `node_modules/patchright` (браузерный движок), экономя трафик и время при первой установке.
4. **Обратная совместимость и Гейт 35:**
   - Батник `ClaimGames.cmd` сокращен до 8 строк прозрачного проксирования в `runner.js %*`.
   - Тестовый гейт 35 и гейт 19 в `test_sentinel_suite.py` проходят без необходимости изменений.
5. **Чистка чужеродного мусора:**
   - Удалены `test-browser.js`, `unrealengine.js`, `steam-games.js`, избыточный `LICENSE`.
   - `package.json` перебрендирован в `sentinel-giveaways-engine v3.3.1` (Mortuis_V_Studio).
   - `README.md` приведен к формату документации студии.

---

## 3. Верификация
1. **Юнит & Интеграционные тесты:** `python test_sentinel_suite.py` — **36/36 PASS, Exit Code 0**.
2. **Сборщик релизов:** `python tools/create_clean_release.py` успешно сформировал чистые дистрибутивы `Twitch_Drops_Sentinel_v3.3.1_Public_Release.zip` (330 МБ) и `Twitch_Drops_Sentinel_Patch_v3.3.1.zip` (315 МБ) с нулевыми утечками конфигов и токенов.
3. **Вердикт Коллегии Критиков (`critic_council`):** `🟢 [GO / APPROVED]` без P0/P1 блокеров.
4. **Git Remote Sync:** Коммит `5aff483` запушен в `origin/main`.
