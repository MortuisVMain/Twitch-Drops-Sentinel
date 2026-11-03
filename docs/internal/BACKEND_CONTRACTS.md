# 🔌 Twitch Drops Sentinel v3 — Backend API Contracts & Integration Guide

> **Техническое досье для внешнего UI/UX-разработчика и дизайнеров интерфейсов.**  
> Документ изолирует контракт взаимодействия пользовательского интерфейса (Frontend UI) с фоновым микросервисом (Python Daemon & C# Native Host).  
> **Версия спецификации:** 3.3.4 (Apple Luna 2.0 / Stealth Luxury Edition)

---

## 🏛️ 1. Архитектурная топология (System Architecture)

Комплекс Twitch Drops Sentinel v3 построен по гибридной десктопной модели (**Native Desktop Host + Local Async Microservice + Embedded Web UI**):

```
┌────────────────────────────────────────────────────────────────────────┐
│  Windows Native Desktop Shell (C# .NET 10 WinForms + Microsoft WebView2)│
│  - Безрамочное окно с DWM Immersive Dark Mode (#08090B)                │
│  - Системный трей, аппаратный DDC/CI контроль яркости, Sleep Guard     │
│  - Локальный хостинг SPA: https://app.sentinel/index.html              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Внутренний HTTP/REST & WebSocket
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Twitch Drops Sentinel Backend Daemon (Python 3.12+ / aiohttp.web)     │
│  Локальный порт: http://127.0.0.1:28492                                │
│                                                                        │
│  ├─ DevilXD Headless Engine (Twitch GQL, Zero-Video, Claim, Points)    │
│  ├─ Free Games Claimer Engine (Node.js + Patchright, 7 Game Stores)   │
│  ├─ Universal Game Scanner (Steam, Epic, GOG, Custom Dir Discovery)   │
│  ├─ Hardware Guard (psutil: CPU, GPU, Battery, Gaming Auto-Pause)     │
│  ├─ ScreenDimmer Pro (Win32 DXVA2 / DDC/CI Multi-Monitor Brightness)   │
│  └─ GitHub Auto-Updater (Chunked Stream, Live Progress, Hot-Patch)     │
└────────────────────────────────────────────────────────────────────────┘
```

### ⚡ Ключевые протоколы связи:
1. **REST API (`http://127.0.0.1:28492/api/...`)**:
   - `CORS`: полностью разрешен (`Access-Control-Allow-Origin: *`).
   - Формат обмена: `application/json` (UTF-8).
2. **WebSocket (`ws://127.0.0.1:28492/ws`)**:
   - Потоковая трансляция событий изменения состояния (стрим переключился, дроп обновился, лог добавлен).
3. **SSE (`http://127.0.0.1:28492/api/v1/giveaways/stream`)**:
   - Server-Sent Events для живого терминального лога раздач игр в реальном времени.

---

## 📋 2. Полный реестр REST API эндпоинтов

### 2.1. Главное состояние системы (`/api/state`)

#### `GET /api/state`
Главный агрегирующий эндпоинт. Вызывается фронтендом раз в 3 секунды (или мгновенно при переключении табов).

**Пример ответа (Response 200 OK):**
```json
{
  "version": "3.3.4",
  "connected": true,
  "user_id": "492817291",
  "username": "Mortuis_V",
  "status_text": "Фарм дропа: Oct 24 (1 Hour) на канале shroud",
  "watching_channel": "shroud",
  "available_channels": ["shroud", "summit1g", "tarik", "lirik"],
  "active_drop": {
    "id": "drop_rust_01",
    "name": "Mortuis Tactical AK-47 & Metal Face Mask",
    "game": "Rust",
    "game_box_art": "https://static-cdn.jtvnw.net/ttv-boxart/Rust-285x380.jpg",
    "current_minutes": 45,
    "required_minutes": 60,
    "progress_percent": 75,
    "remaining_seconds": 900,
    "channel_name": "shroud",
    "channel_id": "37402112",
    "is_claimed": false,
    "can_claim": false,
    "preview_url": "https://twitch.tv/shroud"
  },
  "forced_game": null,
  "watchdog_status": "Активен (144 fps, 0 пропусков)",
  "oauth_code": null,
  "oauth_uri": null,
  "hardware": {
    "is_gaming": false,
    "detected_game": null,
    "on_battery": false,
    "is_paused": false,
    "ping_ms": 18,
    "cpu_percent": 14.2,
    "gpu_percent": 8.0
  },
  "stats": {
    "traffic_saved_mb": 28400,
    "total_drops_claimed": 42,
    "channel_points_earned": 42500,
    "total_farm_hours": 30.6
  },
  "settings": {
    "auto_shutdown_on_complete": false,
    "auto_shutdown_mode": "sleep",
    "pause_on_gaming": true,
    "pause_on_battery": false,
    "native_toasts": true,
    "ui_sound_enabled": true,
    "claim_channel_points": true,
    "auto_claim_drops": true,
    "giveaways_enabled": true,
    "streamer_watchdog_enabled": true,
    "priority_mode": 1,
    "priority_games": ["Rust", "Path of Exile 2", "The Witcher 3: Wild Hunt"],
    "excluded_games": ["VALORANT", "League of Legends"],
    "game_directories": ["D:\\SteamLibrary", "E:\\Epic Games"]
  },
  "trophies": [
    {
      "id": "tr-001",
      "date": "2026-10-24 16:30",
      "game": "Rust",
      "drop_name": "Tactical Thompson",
      "campaign": "Twitch Rivals Rust 2026",
      "status": "Claimed"
    }
  ],
  "installed_games": [
    {
      "id": "game_rust",
      "name": "Rust",
      "is_installed": true,
      "install_path": "D:\\SteamLibrary\\steamapps\\common\\Rust",
      "has_drops": true,
      "box_art": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252490/header.jpg",
      "category": "Steam",
      "is_account_connected": true,
      "account_link_url": "https://twitch.facepunch.com/",
      "is_finished": false,
      "claimed_drops": 2,
      "total_drops": 3,
      "progress_percent": 66.7,
      "allowed_channels": ["shroud", "rustafied"]
    }
  ],
  "all_catalog_games": [],
  "ignored_games": [],
  "recent_logs": [
    {
      "time": "16:45:12",
      "level": "INFO",
      "message": "Прогресс дропа Rust увеличен: 45 / 60 мин (75%)"
    }
  ]
}
```

---

### 2.2. Управление настройками (`/api/settings`)

#### `POST /api/settings`
Сохраняет пользовательские параметры в `config.json` и DevilXD `settings.json`, немедленно перестраивая приоритеты в работающем клиенте.

**Request Body (JSON):**
```json
{
  "priority_games": ["Rust", "Path of Exile 2"],
  "excluded_games": ["VALORANT"],
  "priority_mode": 1,
  "pause_on_gaming": true,
  "pause_on_battery": false,
  "auto_shutdown_on_complete": false,
  "auto_shutdown_mode": "sleep",
  "claim_channel_points": true,
  "auto_claim_drops": true,
  "native_toasts": true,
  "ui_sound_enabled": true,
  "giveaways_enabled": true,
  "streamer_watchdog_enabled": true
}
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "saved": true
}
```

---

### 2.3. Операции с дропами и фармом

#### `POST /api/claim`
Ручной забор (Claim) готового дропа, если авто-забор отключен или сработал ручной клик по плашке.
- **Request Body:** `{"drop_id": "drop_rust_01"}`
- **Response:** `{"status": "ok", "message": "Дроп успешно забран!"}`

#### `POST /api/switch-streamer`
Ручное переключение на другого стримера из списка доступных онлайн-каналов.
- **Request Body:** `{"channel_name": "tarik"}`
- **Response:** `{"status": "ok", "watching": "tarik"}`

#### `POST /api/farm/force`
Режим «Принудительный фарм игры» (Game Override). Игнорирует установленные игры и очереди, фокусируя весь фарм исключительно на выбранной игре.
- **Request Body:** `{"game_name": "Black Desert"}`
- **Response:** `{"status": "ok", "forced_game": "Black Desert"}`

#### `POST /api/farm/cancel-force`
Сброс принудительного режима и возврат к автоматическому выбору по списку приоритетов.
- **Request Body:** `{}`
- **Response:** `{"status": "ok", "forced_game": null}`

#### `POST /api/campaigns/sync`
Принудительный запрос к Twitch GQL для обновления списка активных кампаний и статусов привязки учетных записей.
- **Response:** `{"status": "ok", "campaigns_count": 28}`

---

### 2.4. Полка игр и сканирование накопителей

#### `POST /api/scan-games` или `POST /api/rescan`
Запускает асинхронный поиск установленных игр через реестр Windows, каталоги Steam (`libraryfolders.vdf`), Epic Games Manifests, GOG Registry и кастомные пользовательские папки.
- **Response:** `{"status": "ok", "found_installed": 74, "total_catalog": 103}`

#### `POST /api/installed-games/remove`
Скрытие игры с «Полки установленных» (перенос во вкладку «Скрытые / Игнорируемые»).
- **Request Body:** `{"game_name": "Cyberpunk 2077"}`
- **Response:** `{"status": "ok", "ignored_games": ["Cyberpunk 2077"]}`

#### `POST /api/installed-games/restore`
Восстановление скрытой игры обратно на главную полку.
- **Request Body:** `{"game_name": "Cyberpunk 2077"}`
- **Response:** `{"status": "ok", "ignored_games": []}`

#### `GET /api/game-directories`
Список пользовательских каталогов для сканирования.
- **Response:** `{"directories": ["D:\\Games", "E:\\SteamLibrary"]}`

#### `POST /api/game-directories/add`
Добавление новой папки для сканирования игр.
- **Request Body:** `{"directory": "F:\\MyGames"}`
- **Response:** `{"status": "ok", "directories": [...]}`

#### `POST /api/game-directories/remove`
Удаление папки сканирования.
- **Request Body:** `{"directory": "F:\\MyGames"}`
- **Response:** `{"status": "ok", "directories": [...]}`

---

### 2.5. Журнал трофеев (Trophy Vault)

#### `POST /api/open-vault`
Открывает локальный файл журнала `Trophies.md` в стандартном текстовом редакторе Windows (Notepad, VS Code).
- **Response:** `{"status": "ok"}`

#### `POST /api/trophies/clear`
Очищает записи в файле `Trophies.md`, сохраняя шапку таблицы.
- **Response:** `{"status": "ok"}`

---

### 2.6. Хаб бесплатных раздач игр (`/api/v1/giveaways/...`)

Интегрированная подсистема авто-клейма подарков (Free Games Claimer) из 7 магазинов: Epic Games, GOG, Steam, Amazon Prime Gaming, Fab, Unity Asset Store, Itch.io.

#### `GET /api/v1/giveaways/state`
- **Query:** `?force_refresh=1` (опционально, для принудительного опроса БД)
- **Response Structure:**
```json
{
  "runner": {
    "state": "idle",
    "activeStores": [],
    "pid": null,
    "startedAt": null,
    "headless": true
  },
  "scheduler": {
    "taskName": "FreeGamesClaimerStudio",
    "exists": true,
    "state": "Ready",
    "lastRunTime": "2026-10-24T12:00:00Z",
    "nextRunTime": "2026-10-25T12:00:00Z",
    "lastTaskResult": 0
  },
  "stores": {
    "epic": {
      "store": "epic",
      "displayName": "Epic Games",
      "claimedCount": 18,
      "existedCount": 4,
      "lastClaimedAt": "2026-10-23T18:20:00Z",
      "dbFileExists": true,
      "account": "Mortuis"
    },
    "gog": {
      "store": "gog",
      "displayName": "GOG.com",
      "claimedCount": 6,
      "existedCount": 1,
      "lastClaimedAt": "2026-10-20T10:00:00Z",
      "dbFileExists": true,
      "account": "Mortuis_V"
    }
  },
  "inventory": [
    {
      "id": "epic_the_outer_worlds",
      "store": "epic",
      "account": "Mortuis",
      "slug": "the-outer-worlds",
      "title": "The Outer Worlds: Spacer's Choice Edition",
      "claimedAt": "2026-10-23 18:20",
      "timestampMs": 1729707600000,
      "url": "https://store.epicgames.com/...",
      "status": "claimed"
    }
  ],
  "recentLogs": [
    {"line": "[Epic] Забрано 2 бесплатных игры за неделю", "ts": "18:20:04"}
  ],
  "fgcInstalled": true,
  "totalClaimed": 24
}
```

#### `POST /api/v1/giveaways/claim`
Запуск процесса проверки и сбора раздач.
- **Request Body:** `{"stores": ["epic", "gog", "steam"], "headless": true}`
- **Response:** `{"status": "started", "activeStores": ["epic", "gog", "steam"]}`

#### `POST /api/v1/giveaways/abort`
Экстренная остановка активного процесса раздач.
- **Response:** `{"status": "aborted"}`

#### `POST /api/v1/giveaways/toggle-scheduler`
Включение/выключение задачи в Планировщике задач Windows (`Task Scheduler`).
- **Request Body:** `{"enable": true}` (или пустой для toggle)
- **Response:** возвращает обновленный объект `scheduler`.

---

### 2.7. Авто-обновления с GitHub (`/api/updates/...`)

#### `GET /api/updates/check`
Проверяет наличие новых релизов в репозитории GitHub (`MortuisVMain/Twitch-Drops-Sentinel`).
- **Response:**
```json
{
  "update_available": true,
  "local_version": "3.3.3",
  "remote_version": "3.3.4",
  "release_name": "Twitch Drops Sentinel v3.3.4 — Auto-Updater Live Progress",
  "release_notes": "## 🛡️ Что нового в v3.3.4:\n- Чанковый загрузчик...",
  "published_at": "2026-10-24T12:36:02Z",
  "download_url": "https://github.com/.../Twitch_Drops_Sentinel_Patch_v3.3.4.zip",
  "html_url": "https://github.com/.../releases/tag/v3.3.4"
}
```
- **Сбой проверки:** ответ всё равно 200, в нём появляется поле `error` с причиной, а остальные поля содержат последний известный результат. Без `force=1` после сбоя GitHub не опрашивается 15 минут, а при лимите API (403/429) ещё и до `Retry-After`/`X-RateLimit-Reset`.

#### `POST /api/updates/apply`
Инициирует фоновую потоковую загрузку хот-патча и его автоматическую распаковку.
- **Response:** `{"status": "downloading"}`

#### `GET /api/updates/status`
Телеметрия загрузки в реальном времени (опрос фронтендом каждые 400 мс во время апдейта):
```json
{
  "is_updating": true,
  "stage": "downloading",
  "percent": 54,
  "downloaded_bytes": 25283740,
  "total_bytes": 46810000,
  "downloaded_mb": 24.11,
  "total_mb": 44.64,
  "speed_mbps": 3.82,
  "error_message": ""
}
```
*Стадии (`stage`):* `"idle"` ➔ `"downloading"` ➔ `"extracting"` ➔ `"done"` (или `"error"`).

---

### 2.8. Авторизация и сессии (`/api/auth/logout`)

#### `POST /api/auth/logout`
- Инвалидирует токены в DevilXD клиенте.
- Удаляет файл сессии `cookies.jar` на диске.
- Сбрасывает состояние `STATE_BRIDGE` (`username = ""`, `user_id = ""`).
- Переводит бэкенд в режим запроса нового OAuth кода авторизации.
- **Response:** `{"success": true, "message": "Успешный выход из аккаунта Twitch"}`

---

## 🔒 3. Критические точки интеграции (Hard Infrastructure Constraints)

### 3.1. Управление авторизацией и cookies
1. **Никаких форм ввода паролей!** Twitch Drops Sentinel использует официальный протокол **Twitch Device OAuth Flow**:
   - При отсутствии `cookies.jar` бэкенд запрашивает у Twitch код устройства и передает его в `/api/state` (`oauth_code`, например: `ABCD-1234`) и ссылку `oauth_uri` (`https://www.twitch.tv/activate`).
   - UI обязан отрисовать компактную плашку с этим кодом, кнопкой «Скопировать» и ссылкой для подтверждения в браузере.
   - После подтверждения в браузере DevilXD автоматически генерирует `cookies.jar`, и интерфейс мгновенно получает `username` и `user_id`.

### 3.2. Интеграция с Windows Task Scheduler
- Задача планировщика называется **`FreeGamesClaimerStudio`**.
- Управление задачей осуществляется через контроллер `core/giveaways_controller.py`, вызывающий нативные командлеты PowerShell (`Get-ScheduledTask`, `Enable-ScheduledTask`, `Disable-ScheduledTask`).
- UI не должен пытаться напрямую модифицировать системный реестр или планировщик — все операции должны идти строго через `POST /api/v1/giveaways/toggle-scheduler`.

### 3.3. Фоновые потоки и защита GUI от фризов
- **Zero-Block Contract:** Все сетевые запросы фронтенда выполняются асинхронно через браузерный `fetch()`.
- **Optimistic UI:** При переключении приоритета игры или тумблера настроек UI обязан моментально обновить визуальное состояние локально, а сетевой запрос в бэкенд отправить в фоне.
- **Таймеры отсчета:** Время до завершения дропа (`remaining_seconds`) уменьшается локальным клиентом каждую 1 секунду (`setInterval(..., 1000)`), а синхронизация с бэкендом происходит раз в 3 секунды. Это обеспечивает идеальную плавность анимации прогресс-баров без лагов сети.

---

## 🎨 4. Цветовые константы и дизайн-система (Apple Luna 2.0)

Интерфейс обязан строго соблюдать спецификацию `DESIGN.md` (Zero-Neon Policy — запрет кислотно-фиолетовых `#9146ff` и неоновых цветов):

| Слой / Элемент | Токен CSS | Значение Hex / OKLCH | Описание |
| :--- | :--- | :--- | :--- |
| **Базовое шасси** | `--bg-chassis` | `#08090B` | Глубокий обсидиановый бархат |
| **Углубленные пазы** | `--bg-recessed` | `#050608` | Пазы прогресс-баров и логов |
| **Карточки Bento L1**| `--bg-surface-1` | `#0E1014` | Матовая поверхность с верхней фаской |
| **Возвышенные блоки L2**| `--bg-surface-2` | `#15181E` | Интерактивные селекторы и кнопки |
| **Главный акцент** | `--mint-core` | `#3AD29F` | Благородная мята (онлайн, прогресс) |
| **Спекулярная мята** | `--mint-specular`| `#7CE8C2` | Свечение активных светодиодов |
| **Шлейф прогресса** | `--mint-muted` | `#217C5E` | Фоновая заливка полосы фарма |
| **Успех / Claimed** | `--status-success`| `#41C485` | Шалфейный изумруд |
| **Предупреждение** | `--status-warning`| `#E5A93C` | Янтарное теплое золото |
| **Ошибка / Danger** | `--status-danger` | `#DF5353` | Оксидированный кармин |
| **Текст основной** | `--text-primary` | `#EDEFF2` | Титановый светлый антиблик |
| **Текст приглушенный**| `--text-muted` | `#616875` | Гравировка спецификаций |

---

*Документ подготовлен Senior Python Architect & Systems Integrator студии Mortuis_V_Studio.*
