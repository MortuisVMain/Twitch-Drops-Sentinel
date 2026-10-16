# 🌙 Задание для Ночных Работяг (Night Worker Agents @ Ollama)
### Модели: **Qwen 2.5 Coder 32B / 14B** via **Hermes Agent**
### Профиль: `coder32` (Coder 32B Overnight) & `coder` (Coder 14B)
### Проект: **Twitch Drops Sentinel v3.0 [Apple Liquid Glass Edition]**
### Автор и студия: **Mortuis_V / Mortuis_V_Studio**

---

## 🎯 Миссия Ночного Работяги
Ты — автономный ночной агент-разработчик (**Hermes Agent** с локальной моделью **Qwen 2.5 Coder** на Ollama). Твоя задача — автономно развивать, тестировать, полировать и совершенствовать кодовую базу комплекса **Twitch Drops Sentinel v3.0**, соблюдая строгие стандарты качества Mortuis_V_Studio.

---

## 📁 Структура Проекта и Рабочее Окружение

* **Корень проекта:** `C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3\`
* **Фронтенд:** `src/` (React 19 + Tailwind CSS v4 + Lucide React + Apple Liquid Glass UI)
  * `src/components/Header.tsx` — статус-бар HUD (гейминг, батарея, трафик, баллы)
  * `src/components/LiveDashboard.tsx` — Bento Grid с круговым прогресс-баром и Luna Auto-Shutdown
  * `src/components/GameShelf.tsx` — интерактивный каталог 138 игр ПК + дропы
  * `src/components/TrophyVault.tsx` — 3D карточки арсенала забранного лута
  * `src/components/SettingsStudio.tsx` — панель Luna Auto-Shutdown и Hardware Guard
  * `src/data/gamesCatalog.ts` — база данных игр (Steam: 76, E:\Games: 12, E:\Games Cracked: 50)
* **Сборка бандла:** `dist/index.html` (генерируется командой `npm run build`)
* **Бэкенд сервис:** `core/` (Python 3.14 + `aiohttp.web` на `127.0.0.1:28492` + `psutil`)
  * `core/sentinel_service.py` — REST & WebSocket API, Hardware Guard (сенсор 138 игр), Luna loop
  * `core/gui_headless.py` — headless адаптер, исключающий Tkinter и транслирующий GQL/WS в React
  * `core/cookies.jar` — сохраненная активная авторизация пользователя `Mortuis_V`
* **Нативный хост:** `desktop/` (.NET 10 WinForms WebView2)
  * `desktop/MainForm.cs` — DWM тёмный заголовок Windows 11, системный трей, WebView2 хостинг
  * `desktop/TwitchDropsSentinel.csproj` — проект сборки монолитного `.exe`
* **Итоговый бинарник:** `TwitchDropsSentinel.exe` (118 МБ) в корне проекта и в `desktop/publish/`

---

## 🛠️ Задачи в бэклоге для Ночного Работяги (Выбирай и реализуй):

### Задача 1: Аудио-эффекты и Web Audio Chimes
- Реализовать мягкий приятный звуковой сигнал (Apple-style chime) при успешном сборе наград (Claim Drop) без внешних тяжелых mp3 файлов (синтезировать чистый звук через Web Audio API Oscillator в `App.tsx`).

### Задача 2: Живое WebSocket авто-обновление таймера
- Убедиться, что при активном фарме дропа таймер оставшегося времени в Bento Grid (`LiveDashboard.tsx`) плавно уменьшается каждую секунду локально, даже если бэкенд шлет опрос раз в 3 секунды.

### Задача 3: Автоматический до-сканер новых игр
- В `core/sentinel_service.py` добавить периодический тихий скан папок `E:\Games` и `E:\Games Cracked` раз в 30 минут: если пользователь установил новую игру, Sentinel мгновенно добавляет ее `.exe` в базу Hardware Guard для автопаузы.

### Задача 4: Улучшение адаптивности интерфейса
- Проверить верстку Bento Grid и карточек на различных разрешениях (от 1024x768 до 4K), исключить появление горизонтального скроллбара.

---

## ⚡ Правила и Команды для Ночного Работяги:
1. **Проверка типов TypeScript:** Всегда запускай `npx tsc --noEmit` и убеждайся в отсутствии ошибок (Exit Code 0).
2. **Пересборка фронтенда:** После правок в `src/` выполняй `npm run build`.
3. **Пересборка монолитного EXE:**
   ```powershell
   dotnet publish desktop\TwitchDropsSentinel.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o desktop\publish
   Copy-Item desktop\publish\TwitchDropsSentinel.exe -Destination TwitchDropsSentinel.exe -Force
   ```
4. **Тест верификации:** Запускай `python test_sentinel_suite.py` — все 7 тестов должны выдавать `[OK]`.
