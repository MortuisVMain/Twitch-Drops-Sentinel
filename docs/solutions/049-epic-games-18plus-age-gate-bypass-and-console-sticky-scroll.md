# Решение №049: Epic Games 18+ Age Gate Bypass и Sticky-Scroll консоли раздач

## Симптомы проблемы
1. **Зависание на 18+ раздачах в Epic Games (60-секундный таймаут):**
   - При сборе раздач модуль Epic Games падал с ошибкой:
     ```
     page.click: Timeout 60000ms exceeded.
     waiting for locator('button:has-text("Continue")')
     - locator resolved to <button disabled ...>...</button>
     - element is not enabled
     ```
   - На бесплатных играх с возрастным ограничением (например, *Sorry, We're Closed*) Epic Games выводит диалог подтверждения возраста. Кнопка `Continue` отключена (`disabled`) до тех пор, пока не выбрана дата рождения.
   - Скрипт искал устаревшие селекторы (`[data-testid="AgeSelect"]`, `#month_toggle`) и вызывал `page.click('button:has-text("Continue")')`, который ждал 60 секунд разблокировки кнопки, вызывая фатальный `TimeoutError`.
   - В куках браузера отсутствовал современный ключ `egs_age_gate_dob=1990-01-01` и региональные рейтинги `HasAcceptedAgeGates`.

2. **Сброс позиции скролла при чтении консоли раздач:**
   - В `GiveawaysView.tsx` хук `useEffect([logs])` на каждое новое сообщение или SSE-событие принудительно делал `terminalRef.current.scrollTop = terminalRef.current.scrollHeight`.
   - Любая попытка пользователя проскроллить консоль вверх для чтения предыдущих строк немедленно срывалась вниз при поступлении очередной строки.

---

## Архитектурное решение

### 1. Автоматический обход 18+ Age Gate в Epic Games (`giveaways_engine/epic-games.js`)
- **Внедрение комплексных кук возраста (`ensureAgeCookies`):**
  - `egs_age_gate_dob: '1990-01-01'` на домены `.epicgames.com` и `store.epicgames.com`.
  - `HasAcceptedAgeGates: 'USK:9007199254740991,general:18,EPIC SUGGESTED RATING:18,PEGI:18,ESRB:18,GRAC:18,Generic:18,USK:18'` на оба домена.
  - Инициализационный скрипт `context.addInitScript` предустанавливает куки и флаг `localStorage.setItem('has_accepted_age_gate', 'true')` до первой загрузки страницы.
  - Куки обновляются перед каждым переходом по URL раздачи.
- **Интеллектуальная обработка экрана 18+ (Auto-Bypassing):**
  - Поддержка селекторов современных и классических селектов/чекбоксов возраста без падений.
  - Проверка доступности кнопки: `await btn.isDisabled()`. Если кнопка активна — кликаем с быстрым таймаутом (3.5 сек вместо 60 сек).
  - Если кнопка отключена или окно не скрылось — в страницу инжектируются куки через `document.cookie` и выполняется мгновенный `page.goto(url, { waitUntil: 'domcontentloaded' })`. При повторной загрузке с валидными куками экран 18+ не отображается, и страница открывается сразу с кнопкой «Получить».
- Пересобран бандл через `npm run build` (`dist/epic-games.mjs`).

### 2. Защита скролла консолей (Sticky-Scroll)
- В `GiveawaysView.tsx` (и `LiveDashboard.tsx`) добавлен трекинг положения скролла `isAtBottomRef`.
- `onScroll` проверяет расстояние до нижней границы:
  ```typescript
  isAtBottomRef.current = scrollHeight - scrollTop - clientHeight <= 50;
  ```
- В `useEffect([logs])` автопрокрутка вниз выполняется **только** если пользователь уже находится у нижней границы. Если пользователь прокрутил вверх для чтения, позиция скролла надёжно сохраняется.
- При нажатии на кнопку запуска сбора раздач флаг `isAtBottomRef.current` сбрасывается в `true`, обеспечивая плавный автоматический скролл свежего лога.

---

## Верификация
1. `npm run build` в `giveaways_engine` собрал `dist/epic-games.mjs` (240.7 КБ) без ошибок.
2. `npm run build` в корне собрал `dist/index.html` (597.99 КБ).
3. `python -X utf8 test_sentinel_suite.py` — все 36 верификационных гейтов пройдены с кодом 0 (`ALL PASS [OK]`).
