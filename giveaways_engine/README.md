# Twitch Drops Sentinel — Giveaways Subsystem

Встроенный подмодуль автоматического сбора бесплатных игр и раздач для **Twitch Drops Sentinel v3.3.1**.
Разработано: **Mortuis_V_Studio**.

## Поддерживаемые магазины:
- **Epic Games** (Еженедельные раздачи игр)
- **GOG** (Периодические бесплатные раздачи на главной странице)
- **Steam** (Игры со 100% скидкой "Free to Keep")
- **Fab / Unreal Engine** (Бесплатные ассеты месяца и ограниченные по времени паки)
- **Unity Asset Store** (Бесплатные промо-пакеты ассетов)
- **Itch.io** (100% скидочные раздачи)
- **Prime Gaming** (Amazon Prime раздачи)

## Архитектура
- Модуль скомпилирован в автономные бандлы `dist/*.mjs` через `esbuild`.
- Единая точка входа: `runner.js` (с обратной совместимостью через `ClaimGames.cmd`).
- Прямая интеграция с Python REST API Sentinel (`core/giveaways_controller.py`).
