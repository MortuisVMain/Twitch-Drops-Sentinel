# 🌙 Решение 038: Аппаратная память яркости мониторов, устранение фантомных DDC-экранов и полноразмерный Bento-лейаут

## 📌 Проблема и контекст
При тестировании вкладки «Диммер» на ноутбуках с гибридной графикой (дискретная GPU NVIDIA RTX 5070 Ti + процессорная графика) и внешним монитором выявились 3 проблемы:
1. **Фантомный 3-й монитор (Duplicate/Ghost Display):**
   При наличии 2 физических мониторов (внешний по HDMI/DP + встроенный экран ноутбука) система отображала 3 монитора. Причина: `EnumDisplayMonitors` возвращал физический дескриптор для матрицы ноутбука, для которой вызов `GetMonitorBrightness` возвращал `false`. В C#-хосте `MainForm.cs` монитор все равно добавлялся в список как «Внешний монитор (Generic PnP)», а затем еще раз добавлялся через WMI как «Встроенный дисплей ноутбука».
2. **Пустое мертвое пространство снизу:**
   Элементы вкладки «Диммер» занимали всего ~420px по высоте, оставляя до половины экрана пустым при развернутом окне (1080p/1440p).
3. **Отсутствие памяти базовой яркости и хоткея возврата:**
   Пользователь настраивал индивидуальные уровни (например, Внешний: 80%, Ноутбук: 70%), но не мог зафиксировать эту комбинацию в качестве базовой и быстро вернуться к ней из полноэкранных игр или приложений.

---

## 🛠️ Архитектурное решение

### 1. Фильтрация фантомных DDC-мониторов в C# Host (`MainForm.cs`)
В методе `GetHardwareMonitors()` и `SetHardwareBrightness()` добавлен строгий гейт:
```csharp
uint min = 0, max = 100;
if (!GetMonitorBrightness(mon.hPhysicalMonitor, out min, out uint cur, out max))
{
    // Внутренняя панель ноутбука или виртуальный экран не поддерживают DDC/CI VCP 0x10.
    // Пропускаем из DDC-списка; матрица ноутбука будет обнаружена через WMI ACPI!
    continue;
}
```
Результат: строго 2 физических монитора (1 Внешний DDC/CI + 1 Ноутбук WMI), без дублирования.

### 2. Подсистема аппаратной памяти базовой яркости (`_baselineBrightnessMap`)
* В C# добавлен словарь `_baselineBrightnessMap` и методы `SaveBaselineBrightness()` и `RestoreBaselineBrightness()`.
* В `dimmer_controller.py` и `sentinel_service.py` добавлены эндпоинты `POST /api/v1/dimmer/save-baseline` и `POST /api/v1/dimmer/restore-baseline`.
* Зарегистрирован глобальный Win32 хоткей **`Alt + Shift + Backspace`** (`HOTKEY_ID_RESTORE = 9002`, `MOD_ALT | MOD_SHIFT`, `VK_BACK`), перехватываемый через `WM_HOTKEY` в `WndProc`. Хоткей мгновенно выводит экраны из Blackout и восстанавливает сохраненные уровни подсветки для каждого монитора.

### 3. Ликвидация пустого пространства & Bento-лейаут (`ScreenDimmerView.tsx`)
* Внедрен блок **«ПАМЯТЬ ОБОРУДОВАНИЯ & ПРОФИЛИ»** с кнопками:
  * `💾 Запомнить текущую яркость`
  * `☀️ Восстановить базовую яркость (Alt + Shift + Backspace)`
  * `🔄 Опрос физических дисплеев (DDC/CI & WMI)`
  * Сценарии в 1 клик: `☀️ День (85%/75%)`, `🌆 Вечер (45%/40%)`, `🌑 Ночь (15%/10%)`.
* Добавлен **«ЖУРНАЛ АППАРАТНОЙ ШИНЫ (DDC/CI & WMI TELEMETRY)»** с `flex: 1` (`minHeight: 130px`) для отображения транзакций шины I2C в реальном времени, что полностью заполняет нижнюю половину экрана в стиле тактического Field-Deck.
* Обновлен справочник хоткеев в футере и `HelpModal.tsx`.

---

## 🧪 Результаты верификации

```text
✓ test_screendimmer_full_operational.py: 10/10 тестов пройдено (Exit Code 0)
  [DIMMER PASS 01] Physical Monitors Dynamic Stage contract verified.
  [DIMMER PASS 02] Mechanical Rotary Jog-Dial & 5 Presets verified.
  [DIMMER PASS 03] Per-Monitor Hardware Precision Sliders verified.
  [DIMMER PASS 04] Sleep Timer (120m) & Audio Protection verified.
  [DIMMER PASS 05] Ultra-Dark Mode (WS_EX_TRANSPARENT) verified.
  [DIMMER PASS 06] Hardware Baseline Memory & Alt+Shift+Backspace Hotkey verified.
  [DIMMER PASS 07] Hardware Bus Telemetry Journal & Zero Empty Space verified.
  [DIMMER PASS 08] All 7 Dimmer Backend REST APIs verified with exit code 0.
  [DIMMER PASS 09] Native C# Win32 DDC/CI, AwayMode, Audio & SessionRecovery verified.
  [DIMMER PASS 10] Apple Luna 2.0 Zero-Neon contract strictly verified.

✓ dotnet build desktop/TwitchDropsSentinel.csproj: 0 ошибок
✓ npm run build: dist/index.html 577.38 kB (0 ошибок, 2.08s)
✓ test_auxiliary_systems.py: 7/7 тестов пройдено (Exit Code 0)
✓ test_giveaways_full_operational.py: 7/7 тестов пройдено (Exit Code 0)
✓ test_dashboard_full_operational.py: 8/8 тестов пройдено (Exit Code 0)
✓ test_gameshelf_full_operational.py: 8/8 тестов пройдено (Exit Code 0)
✓ test_settings_full_operational.py: 8/8 тестов пройдено (Exit Code 0)
```
