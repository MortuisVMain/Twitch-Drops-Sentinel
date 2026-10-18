# 🛡️ Twitch Drops Sentinel v3.1

<div align="center">

![Twitch Drops Sentinel](assets/app.png)

**Автономный streamless-комбинат для фарма наград Twitch Drops с 0% нагрузки на GPU.**  
*Crafted with precision by Mortuis_V_Studio (2026).*

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?logo=windows)](https://microsoft.com/windows)
[![Architecture](https://img.shields.io/badge/Architecture-C%23%20WebView2%20%2B%20Python%203.12-368873)](https://github.com/MortuisVMain/Twitch-Drops-Sentinel)
[![Style](https://img.shields.io/badge/Design-Apple%20Luna%202.0-73bba5)](https://github.com/MortuisVMain/Twitch-Drops-Sentinel)
[![Status](https://img.shields.io/badge/Quality%20Gates-24%2F24%20PASS-success)](https://github.com/MortuisVMain/Twitch-Drops-Sentinel)

</div>

---

## ⚡ О проекте

**Twitch Drops Sentinel** — это автономное настольное приложение для Windows, созданное для тихого автоматического фарма наград (Drops) на Twitch без необходимости держать открытым тяжелый веб-браузер.

В отличие от браузерного просмотра, Sentinel взаимодействует напрямую с Twitch GraphQL & Spade API на протокольном уровне:
* **0% нагрузки на GPU:** Видеопоток не скачивается и не декодируется. Видеокарта полностью свободна для тяжелых игр или монтажа.
* **Экономия до 98% интернет-трафика:** Расход сети снижается с ~3.2 ГБ/час до скромных ~5 МБ/час.
* **GitHub Auto-Updater (1-клик обновления):** Встроенный модуль проверки релизов и безопасной установки патчей прямо из интерфейса с защитой сессионных файлов (`cookies.jar`, `Trophies.md`, `config.json`).
* **2-колоночный Bento Grid:** Просторный и чистый интерфейс Apple Luna 2.0 без бутафорских карточек — только 100% реальные измеренные метрики.
* **Hardware Guard (Автопауза при гейминге):** При запуске любой тяжелой игры (Steam, Epic, VK Play) Sentinel автоматически ставит опрос на паузу для 100% плавности фреймрейта и нулевого пинга, а после закрытия игры сам возобновляет сбор наград.
* **Luna Auto-Shutdown:** Автоматическое выключение, переход в сон или блокировка компьютера после завершения всех дроп-кампаний на сегодня (идеально для ночного фарма).
* **Полка Игр (180+ тайтлов):** Управление приоритетами фарма и списком исключений в один клик. Строгий алгоритм Sequel Guard исключает путаницу между номерными частями игр.

---

## 🎨 Дизайн и интерфейс (Apple Luna 2.0)

Интерфейс построен по каноническому дизайн-контракту **Apple Luna 2.0**:
* **Глубокая палитра Obsidian & Noble Mint:** `#171d1c` (фон), `#202725` (поверхность), `#303a35` (тонкие линии), `#73bba5` / `#368873` (мятный благородный акцент).
* **Bento Grid:** адаптивная сетка карточек с живой телеметрией процессора, видеокарты и сетевого пинга.
* **Тактильный Web Audio:** обратная связь при переключении разделов и сигнал Apple Chime при зачислении каждого нового предмета.
* **Запоминание геометрии окна:** умное восстановление размеров и положения на экране (`data/window_state.json`).

---

## 🏗️ Архитектура системы

Комплекс построен по гибридной двухконтурной архитектуре:

1. **Десктопный хост (`desktop/`):**
   * .NET 8 / C# WinForms с внедренным Microsoft WebView2 Runtime.
   * Управление системным треем, нативным окном Windows 11 DWM (темная монолитная рамка заголовка), сторожевой таймер фонового Python-процесса и авто-восстановление при сбоях.

2. **Streamless-ядро (`core/`):**
   * Асинхронный микросервис Python 3.12 (AioHTTP, Asyncio).
   * Реализация Twitch GraphQL API, обработка WebSocket соединений, периодическая отправка Spade telemetry beacons, фильтрация истекших кампаний и автоматический клейм наград.

3. **Интерфейс приложения (`src/`):**
   * React 19, TypeScript, Tailwind CSS, Vite singlefile bundle (`dist/index.html`).
   * 3 сфокусированных раздела: **Дашборд**, **Полка Игр**, **Настройки**.

---

## 🚀 Быстрый запуск

### Вариант 1: Запуск готового Portable-дистрибутива
1. Скачайте архив релиза (`TwitchDropsSentinel_v3.0_Friend_Edition.zip` или из Releases).
2. Распакуйте в любую папку.
3. Запустите `TwitchDropsSentinel.exe` или `Запустить_Twitch_Drops_Sentinel.bat`.
4. При первом старте подтвердите одноразовый код на странице `https://www.twitch.tv/activate`.

### Вариант 2: Запуск из исходного кода
```bash
# 1. Установка зависимостей интерфейса
npm install

# 2. Сборка фронтенда
npm run build

# 3. Установка Python зависимостей
pip install -r requirements.txt

# 4. Запуск Python сервиса
python core/sentinel_service.py

# 5. Сборка и запуск C# хоста
dotnet run --project desktop/TwitchDropsSentinel.csproj
```

---

## 🧪 Тестирование и качество

Проект сопровождается комплексным тестовым набором из 18 строгих шлюзов верификации:
```bash
python test_sentinel_suite.py
```

* Шлюзы охватывают: целостность бинарников, отсутствие Mojibake (CP1251), фильтрацию истекших кампаний, защиту от флаппинга стримеров, работу датчиков Hardware Guard и точность сопоставления Steam AppID.

---

## 📄 Лицензия

Proprietary © 2026 Mortuis_V_Studio. Все права защищены.
Разработано исключительно в исследовательских и образовательных целях.
