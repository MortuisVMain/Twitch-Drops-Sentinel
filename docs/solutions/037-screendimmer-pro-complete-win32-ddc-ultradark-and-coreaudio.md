# 🌙 Решение 037: Полная интеграция ScreenDimmer Pro (Win32 DDC/CI, WMI, Ultra-Dark, CoreAudio Mute и Session Recovery)

## 📌 Проблема и контекст
При аудите вкладки «Диммер» в сравнении с автономным эталоном `C:\AI Local Projects\Ideas\ScreenDimmer` (версия v2.1 Pro) были вскрыты критические блокеры уровня P0:
1. **Split-Brain IDs:** Python и React оперировали фейковыми мок-идентификаторами `disp-primary` и `disp-secondary`, в то время как C# хост `MainForm.cs` ожидал системные строки `DDC_0_...` или `WMI_...`. В результате команды регулировки физической яркости игнорировались.
2. **Мертвый таймер сна:** Таймер сна тикал изолированно в корутине Python `asyncio.sleep()`, не имея связи с C# окнами. По истечении таймера экраны не гасли.
3. **Хоткей `Alt + Backspace` в трее:** Был повешен на `window.addEventListener('keydown')` внутри браузерного WebView2. При сворачивании в системный трей или запуске полноэкранной игры хоткей не работал.
4. **Застревание в Blackout при ребуте Windows:** При перезапуске ОС (например, ночные обновления Windows Update) формы Blackout не освобождались, так как отсутствовал перехват `WM_QUERYENDSESSION`.
5. **Бутафорский Mute и Спектр:** Чекбокс отключения звука не вызывал CoreAudio API, а кнопки температуры 6500K/4200K/3000K накладывали декоративный CSS `sepia()` вместо аппаратной гаммы.

---

## 🛠️ Архитектурное решение

### 1. Системный мост и разрешение ID в `desktop/MainForm.cs`
В метод `SetHardwareBrightness` внедрено динамическое сопоставление общих ID (`disp-primary`, `0`, `disp-secondary`, `1`, `master`) с физическими дескрипторами `GetHardwareMonitors()`. Команды из любого источника гарантированно попадают на физическую шину I2C/VCP 0x10 или WMI.

### 2. Защита шины I2C (DDC/CI Debouncing)
Для предотвращения сбоев драйвера видеокарты (TDR) при быстром скролле ползунков внедрен `SetHardwareBrightnessDebounced` с тайм-аутом 60 мс через `CancellationTokenSource`.

### 3. Защита от зависаний при ребуте (`WM_QUERYENDSESSION`)
В `WndProc` добавлен перехват сообщений `WM_QUERYENDSESSION` (0x0011) и `WM_ENDSESSION` (0x0016), гарантирующий мгновенное закрытие всех оверлеев и возврат нормальной яркости (75%) перед выключением ПК.

### 4. Глобальный аппаратный хоткей `Alt + Backspace`
Хоткей зарегистрирован на системном уровне через Win32 `RegisterHotKey(Handle, 9001, MOD_ALT, VK_BACK)`. Обработка вынесена в `WndProc` (`WM_HOTKEY`), благодаря чему Blackout переключается из трея и любых окон.

### 5. Честный ночной Mute (CoreAudio API)
Создан `desktop/AudioEndpointController.cs` с нативной COM-реализацией `IAudioEndpointVolume`. При входе в Blackout звук безопасно приглушается (`SetMute(true)`), а при пробуждении возвращается в исходное состояние.

### 6. Режим «Сверхтемноты» (Ultra-Dark Mode)
Создан класс `UltraDarkOverlayForm` с расширенными стилями Win32:
```csharp
cp.ExStyle |= WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE;
```
Сквозной кликабельный фильтр (`WS_EX_TRANSPARENT = 0x20`) позволяет работать ночью за экраном, затемненным на 10%–95% ниже нуля аппаратной яркости без паразитной засветки матрицы.

### 7. Модернизация UI (`ScreenDimmerView.tsx`)
- Динамическая сетка мониторов (`monitors.map(...)`) под 1, 2, 3+ экранов.
- Канонические пресеты: `0% (Blackout)`, `25%`, `50%`, `75%`, `100%`.
- Таймеры сна: `Выкл`, `15м`, `30м`, `45м`, `60м`, `120м`.
- Ползунок глубины тонирования UltraDark (10%–95%).
- Удалена бутафория (CSS sepia и фальшивые бейджи «240Hz G-SYNC»).

---

## 🧪 Верификация
1. `dotnet build desktop/TwitchDropsSentinel.csproj` ➔ 0 ошибок.
2. `npm run build` ➔ 0 ошибок TypeScript (567 kB bundle).
3. `test_screendimmer_full_operational.py` ➔ 8/8 тестов OK.
4. `test_giveaways_full_operational.py` ➔ 7/7 тестов OK.
5. `test_auxiliary_systems.py` ➔ 7/7 тестов OK.
6. `smoke_test_exe.py` ➔ PID запущен, 0 сбоев.
