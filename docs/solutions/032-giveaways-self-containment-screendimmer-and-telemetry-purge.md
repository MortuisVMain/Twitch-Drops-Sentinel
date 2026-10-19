# 032 — Giveaways Self-Containment, ScreenDimmer & Telemetry Purge

## Проблема
1. **Зависимость от внешних путей разработчика:** Giveaways Hub зависел от внешнего каталога `C:\AI Local Projects\Scripts\Free Games Claimer`, из-за чего на компьютерах друзей и чистых установках клейм раздач завершался ошибкой 404. Кроме того, при необработанных исключениях в aiohttp заголовки CORS терялись, вызывая ошибку в браузере `TypeError: Failed to fetch`.
2. **Путающая телеметрия (Zero Noise):** На Дашборде и в Topbar отображались технические метрики («0.8 GB сэкономлено», «CPU 12%», «0% GPU», «Spade Stealth», «0% нагрузки на GPU»), вызывавшие вопросы у пользователей.
3. **Дублирование элементов управления:** В Настройках модуль автовыключения дублировался нижними карточками («Luna Auto-Shutdown Engine», «Hardware Guard»).
4. **Интеграция ScreenDimmer:** Требовалось встроить функционал утилиты затемнения мониторов ScreenDimmer на отдельную вкладку в стиле Apple Luna 2.0 с поддержкой Win32 оверлеев и REST API.

## Архитектурное решение
1. **Self-Contained Giveaways Engine:**
   - Модуль `giveaways_engine/` (~550 КБ) упакован непосредственно в корень проекта Sentinel.
   - Метод `resolve_fgc_root()` в `core/giveaways_controller.py` динамически проверяет локальную папку `giveaways_engine` перед внешними путями.
   - В `core/sentinel_service.py` промежуточный обработчик CORS обернут в `try...except web.HTTPException`, гарантируя доставку заголовков `Access-Control-Allow-*` даже при ответах с кодами 4xx/5xx.
2. **Очистка от телеметрического шума:**
   - В `src/components/LiveDashboard.tsx` удален контейнер `metric-pills` и нижний баннер о GPU. На карточке стрима оставлен минималистичный живой статус `● Фарм активен`.
   - В `src/App.tsx` удален `telemetry-pill` из верхнего Topbar.
3. **Унификация Студии Настроек:**
   - Выбор режима питания (`shutdown | sleep | lock`) и кнопка проверки таймера встроены прямо в карточку переключателя модуля Luna Auto-Shutdown.
   - Нижние дублирующие карточки удалены.
   - Кнопка Mute в Topbar синхронизирована с `ui_sound_enabled` на сервере.
4. **ScreenDimmer (Apple Luna 2.0):**
   - Добавлена вкладка `dimmer` (`Затемнение`) в `App.tsx` и `ScreenDimmerView.tsx`.
   - Поддерживается управление мастер-яркостью, тактильные пресеты (100%, 75%, 50%, 25%, 10%, 🌑 Blackout), аппаратные оверлеи Win32 (`BlackoutOverlayForm`) в `desktop/MainForm.cs` и таймеры сна экрана.

## Верификация
- Полный прогон всех 35 верификационных гейтов в `test_sentinel_suite.py` завершился с кодом 0.
- Релиз `v3.3.0` скомпилирован, протестирован на утечки конфиденциальных данных и опубликован на GitHub Releases.
