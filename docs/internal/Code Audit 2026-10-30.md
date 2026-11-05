# Code Audit — Twitch Drops Sentinel v3.3.4 (2026-10-30)

Аудит только на чтение. Шесть профильных агентов (security-sentinel, backend-platform-engineer ×2, windows-desktop-toolsmith, design-craftsman, tdd-guardian) + ruff/tsc/vite/dotnet. Находки с пометкой ✔ перепроверены вручную по коду.

## Базовая линия

| Проверка | Результат |
|---|---|
| `tsc --noEmit` / `vite build` | exit 0 |
| `dotnet build desktop` | 0 ошибок, 1 предупреждение (MSB3277 WindowsBase) |
| `python -m compileall core` | OK |
| `ruff` (F, B, ASYNC, BLE) | 163 замечания; реальные баги — 2× F821 (см. P1) |
| `pytest test_sentinel_suite.py` | **32 passed / 4 failed** — бейдж «24/24» устарел; в CI тесты не запускаются |

## P0 — Безопасность (Critical)

1. ✔ **Локальный API без аутентификации + `Access-Control-Allow-Origin: *`** — `core/sentinel_service.py:525-554`. Любой сайт в браузере пользователя может вызывать `/api/shutdown`, `/api/settings`, `/api/auth/logout`, `/api/updates/apply`, читать `/api/state` (настройки, логи, `oauth_code`). `request.json()` не проверяет Content-Type → `text/plain` POST идёт без preflight. **Фикс:** per-session токен (C# генерирует → env → UI шлёт `X-Sentinel-Token`), allowlist `Origin`/`Host` для HTTP и `/ws`, убрать `*`.
2. ✔ **RCE через апдейтер** — `sentinel_service.py:788-797`, `updater.py:283-333`. `download_url` из тела запроса, любой `http*`, без хеша/подписи → перезапись `core/*.py`/exe. **Фикс:** URL только из собственного ответа GitHub API, https + allowlist хостов, проверка SHA-256/подписи.
3. ✔ **Утечка GitHub-токена** — `updater.py:329-330`: `elif token:` шлёт `Bearer` (в т.ч. из `git credential fill`) на любой хост. **Фикс:** токен только на `api.github.com`, лучше убрать `git credential fill` из пользовательской сборки.
4. ✔ **PowerShell-инъекция в тостах** — `core/gui_headless.py:58-70`: экранируется только ASCII `'`; U+2018/2019 закрывают строку в PS. Имя награды/игры приходит от автора кампании Twitch. **Фикс:** передавать текст через env/base64, не интерполировать.
5. ✔ **`NewWindowRequested` → ShellExecute любой схемы** — `desktop/MainForm.cs:599-607` (`file:`, `search-ms:`, `ms-msdt:` из скрапленных URL раздач). **Фикс:** только `http/https`.
6. **WebView2-мост не проверяет `e.Source`, нет `NavigationStarting`, DevTools включены в релизе** — `MainForm.cs:596, 662-760` (`POWER_ACTION shutdown`). 
7. **UNC-пути в game directories** → утечка NTLM-хеша — `sentinel_service.py:1057-1064`.
8. **`npm install` по caret-диапазонам с lifecycle-скриптами на ПК пользователя** — `giveaways_controller.py:330-347`. **Фикс:** поставлять бандл / `npm ci --ignore-scripts`.
9. **CI supply chain** — `.github/workflows/release.yml`: actions по тегам, `contents: write` на весь workflow, `requirements.txt` без хешей, embed-zip Python без SHA-256.
10. Low: `/api/clipboard/copy` (paste-jacking через CSRF), `shell=True` у `clip.exe`; `cookies.jar` (pickle) и пароли магазинов в `data/config.env` открытым текстом; fallback на `python` из PATH (`MainForm.cs:384`); `_is_updating` вне lock (`updater.py:287`).

## P0 — Риск реальных денег (giveaways_engine)

11. ✔ **Unity: проверка «итог = 0» пропускает платные суммы** — `giveaways_engine/unity.js:227`. Проверено: `Total $0.99`, `Total 20,00 €`, `Итого 1 490 ₽` → `true`. Затем отмечаются все чекбоксы и жмётся оплата. **Фикс:** парсить число из элемента итога, требовать `=== 0`, иначе abort.
12. ✔ **Epic: DLC «requires base game»** — `epic-games.js:248-257`: base game и DLC снова в очередь → бесконечный цикл; платная base game идёт в ветку `Place Order` без проверки цены. Аналогично `fab.js` (все `/listings/` со страницы). **Фикс:** не повторять DLC, пропускать платную base, проверять итог = 0 перед `Place Order`.

> Пока нет строгой проверки суммы — рекомендую временно отключить оформление заказа в Unity/Fab и ветку base game в Epic.

## P1 — Сломанные функции (однострочные фиксы)

13. ✔ `core/inventory.py:264` — `NameError: camp` → **Trophies.md никогда не пополняется** после claim (ошибка глушится). Фикс: `camp = self.campaign.name.replace("|", "/")`.
14. ✔ `core/sentinel_service.py:337` — нет `import shutil` → `config.default.json` не копируется при первом запуске.
15. ✔ `sentinel_service.py:876-877` — `twitch_client._auth` не существует (надо `_auth_state`) → **logout не работает**, токен пишется обратно в cookies.jar.
16. ✔ `core/twitch.py:1611` — `self.is_logged_in` не существует → опрос сундуков channel points никогда не работает.
17. ✔ `sentinel_service.py:455, 464` — mojibake `"Р”Р°С‚Р°"` / `"Р—Р°Р±СЂР°РЅ"` → заголовок таблицы считается трофеем, статус не нормализуется.
18. ✔ `sentinel_service.py:1331-1345` — **Luna countdown не отменяется**: выключение ПК произойдёт, даже если пользователь отключил настройку или появились новые дропы; дефолт `auto_shutdown_on_complete=True` (:314).
19. `sentinel_service.py:678-688` — `handle_claim` при заданном `drop_id` может забрать другой дроп; при неудаче всё равно ставит `is_claimed=True`.
20. `core/giveaways_controller.py:193-197, 225` — любой статус (`failed`, `not_free`, отсутствие статуса) показывается как «claimed».
21. ✔ `giveaways_engine/steam.js:175` — ожидание `#account_pulldown` (есть всегда) + `.catch` → ложное «claimed».
22. `giveaways_engine/itch.js` — regex зависит от порядка атрибутов, на живой странице находит 0 раздач.
23. `giveaways_engine/runner.js` — `resolve(code || 0)` и всегда `process.exit(0)` → ошибки теряются.

## P1 — Надёжность / ресурсы

24. `sentinel_service.py:1366-1390` + `twitch.py:627-641` — при исключении в `_run` старый `Twitch` не закрывается → **N параллельных движков** после N сбоев (дубли watch/GQL).
25. `giveaways_controller.py:367-373` — 30-мин таймаут срабатывает только после EOF stdout → зависший node держит «running» вечно (409 на все запуски); исключение в мониторе обнуляет `_proc` при живом процессе.
26. `MainForm.cs:267-332, 437-443` — watchdog убивает Python, если `/api/state` не ответил за 400 мс, без grace-периода и backoff → каскад рестартов; гонка `_pythonBackendProcess` между UI-потоком и ThreadPool (`Exited`).
27. `websocket.py:125-138` — reconnect без задержки при штатном закрытии → плотный цикл.
28. `sentinel_service.py:409-410` — неатомарная запись `config.json` (+ гонка `_box_art_cache` в `campaigns_fetcher.py`).
29. `sentinel_service.py:722-724` — `sys.exit(0)` внутри задачи → cleanup не выполняется, node/Chromium остаются сиротами.
30. `MainForm.cs:732` — `Application.Restart()` наследует `--minimized` → после «Перезапустить» окно не появляется; гонка мьютекса при рестарте.
31. `MainForm.cs:743-748, 1211-1218` — DDC/CI и WMI синхронно в UI-потоке на каждое движение слайдера яркости; `MainForm.cs:247` — запись `window_state.json` на каждое событие `Move`.
32. `giveaways_controller.py:420-422` — replay SSE по живому deque → `deque mutated during iteration`.
33. `ExitRequest` наследуется от `Exception` и глушится; fire-and-forget `create_task` без сильных ссылок.

## P2 — Frontend (React)

34. ✔ `src/hooks/useSentinelState.ts:5-78, 125-127` — `INITIAL_STATE` с демо-данными (`Mortuis_V`, 8659 дропов, `connected: true`), `connected` никогда не становится `false` → при упавшем движке UI показывает фейковую статистику.
35. `useSentinelState.ts:113-121` — опрос перезаписывает `settings` поверх оптимистичных апдейтов; ошибки POST `/api/settings` глушатся.
36. ✔ `useSentinelState.ts:287-312` — `handleClaimNow` без `return` при `progress < 100` → фейковый трофей + двойной chime.
37. ✔ `src/components/GiveawaysView.tsx:169` — stale closure `logs.length === 0` → каждые 5 с SSE-логи затираются.
38. `LiveDashboard.tsx:120-139` — `boxArtSources` новый массив на каждый рендер → обложки мерцают/перезагружаются каждую секунду.
39. `LiveDashboard.tsx:295-297, 435-442` — неиспользуемый `uptimeSeconds` перерисовывает 2078-строчный компонент каждую секунду; мемоизация `campaigns` не работает.
40. Прочее: гонки поиска (`LiveDashboard.tsx:368-412`, `GameSearchAutocomplete.tsx`), двойной обработчик `FOLDER_SELECTED` (App + SettingsStudio), таймер toast, `LiquidCanvas` 60 fps под `backdrop-blur`, a11y модалок, неон `#3AD29F`/индиго вне палитры Luna 2.0.

## P2 — Тесты

- 4 падения: `test_artifacts` (нет exe/cookies), 2 трофейных теста зависят от порядка, `test_giveaways_hub_integration` требует реальных раздач.
- **Деструктивность:** `ensure_test_service` подключается к любому процессу на :28492 — при запущенном приложении сьют очищает `Trophies.md`, список игр, включает auto-shutdown, blackout, forced_game.
- ~20 из 36 тестов — grep по исходникам, есть тавтологии (L429-436, L314, L62-70, L650).
- Не покрыто: `TimedDrop.claim`, `should_switch`, `apply_update_from_url`, persistence настроек, `start_claim/abort_claim`; JS/TS тестов нет.
- Топ-5 тестов к добавлению: updater (protected paths + zip-slip), claim idempotency, switch priority matrix, settings round-trip + corrupt JSON, giveaways concurrent/abort.
