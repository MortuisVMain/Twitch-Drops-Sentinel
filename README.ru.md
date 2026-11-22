<div align="center">

<img src="assets/app_icon.png" width="96" height="96" alt="Иконка Hell Harvest">

# Hell Harvest

**Собирает награды Twitch Drops в фоне на Windows, не включая видео.**

Ранее — Twitch Drops Sentinel.

[English](README.md) · **Русский**

[**Инструкция**](docs/%D0%98%D0%9D%D0%A1%D0%A2%D0%A0%D0%A3%D0%9A%D0%A6%D0%98%D0%AF.md) · [User guide in English](docs/GUIDE.md)

[![Последний релиз](https://img.shields.io/github/v/release/MortuisVMain/Twitch-Drops-Sentinel?color=3AD29F&label=release)](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases/latest)
[![Скачивания](https://img.shields.io/github/downloads/MortuisVMain/Twitch-Drops-Sentinel/total?color=3AD29F)](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases)
[![CI](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/actions/workflows/ci.yml)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0D1016)
[![Лицензия](https://img.shields.io/badge/license-MIT%20%2B%20AGPL%20module-0D1016)](#лицензия)

[**Скачать для Windows**](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases/latest)

</div>

![Дашборд Hell Harvest](docs/screenshots/ru/dashboard.webp)

Hell Harvest — программа для Windows, которая собирает Twitch Drops за вас. Вы выбираете игры, а он находит каналы с включёнными дропсами, копит время просмотра и забирает награды. Без вкладки браузера и без видеопотока: Twitch получает те же сигналы «минута просмотра», что и от обычного плеера, поэтому видеокарта свободна для игр, а трафика уходит мало.

## Возможности

- **Дропсы без видео.** Hell Harvest не скачивает и не декодирует стрим. Он отправляет сигналы просмотра и проверяет плейлист трансляции, и этого достаточно для прогресса наград.
- **Очередь приоритета.** Расставьте игры в нужном порядке. Три режима: только ваш список; сначала ваш список, потом любые другие кампании; сначала редкие и скоро заканчивающиеся дропсы.
- **Автосбор наград.** Награды забираются сразу, как только готовы, и попадают в журнал трофеев. Попутно собираются сундучки баллов канала.
- **Полка игр.** Все активные кампании с обложками, наградами, сроками и прогрессом. Установленные игры из Steam, Epic Games и GOG Galaxy (и из ваших папок) находятся автоматически.
- **Не мешает.** Фарм встаёт на паузу, пока вы играете в тяжёлую игру или работаете от батареи, и продолжается после. Когда всё собрано, Hell Harvest может усыпить или выключить компьютер.
- **Кампании наград (по желанию).** Переключатель в настройках, по умолчанию выключен, показывает кампании наград Twitch (квесты и предложения брендов) свёрнутой группой на дашборде: срок, цель и ссылка на Twitch. Только показ: Hell Harvest пока их не фармит.
- **Бесплатные игры.** Встроенный сборщик по расписанию забирает раздачи в Epic Games, GOG, Steam, Fab, Unity Asset Store, itch.io и Prime Gaming.
- **Диммер экрана.** Затемняет один или все мониторы ниже аппаратного минимума, есть режим полного затемнения для ночного фарма.
- **Внешний вид на ваш вкус.** 11 тем, 29 фонов (из них 17 фотореалистичных, которые перекрашиваются под тему), русский и английский интерфейс, размер текста от 70 до 130 %.
- **Обновляется сам.** Новые версии ставятся из GitHub Releases в один клик, вход, настройки и журнал трофеев сохраняются.

## Скриншоты

| Внешний вид: темы и фоны | Полка игр |
|---|---|
| ![Панель внешнего вида](docs/screenshots/ru/appearance.webp) | ![Полка игр](docs/screenshots/ru/shelf.webp) |
| **Бесплатные игры** | **Темы: Copper, Sakura Night, Paper, Graphite OLED** |
| ![Бесплатные игры](docs/screenshots/ru/giveaways.webp) | ![Темы](docs/screenshots/ru/themes.webp) |

## Установка

**Рекомендуется:** скачайте `Hell_Harvest_Setup_v….exe` из [последнего релиза](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases/latest) и запустите. Он ставится только для вашей учётной записи (права администратора не нужны), добавляет пункт в меню «Пуск», а при удалении спрашивает, оставить ли настройки и вход в аккаунты. При переустановке и обновлении они сохраняются.

**Без установки:** скачайте `Hell_Harvest_v…_Public_Release.zip` и работайте из папки:

1. Распакуйте в любую папку, куда можно записывать, например `C:\Games\Hell Harvest`.
2. Запустите `TwitchDropsSentinel.exe`.

Дальше для обоих вариантов:

3. Войдите: Hell Harvest откроет [twitch.tv/activate](https://www.twitch.tv/activate) с одноразовым кодом. Подтвердите его в браузере, пароль через программу не проходит.

**Требования:** Windows 10 или 11 (64-бит) и Microsoft Edge WebView2 Runtime, который в Windows 11 уже есть (если его нет, Hell Harvest предложит скачать). Python встроен. Вкладке «Раздачи» дополнительно нужен [Node.js](https://nodejs.org/) 20 или новее: он не входит в поставку, остальному приложению он не нужен. Браузерный движок для вкладки установится сам при первом запуске.

Подробная инструкция на русском: [docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md).

> [!TIP]
> Чтобы получать дропсы игры, аккаунт Twitch обычно нужно связать с аккаунтом игры. Такие кампании Hell Harvest помечает «привяжите аккаунт».

## Частые вопросы

<details>
<summary><b>Windows SmartScreen пишет, что приложение не распознано</b></summary>

Исполняемый файл не подписан сертификатом, поэтому SmartScreen предупреждает при первом запуске. Нажмите **Подробнее → Выполнить в любом случае**. Можно также посмотреть исходники и собрать программу самостоятельно (см. ниже).
</details>

<details>
<summary><b>Нужно держать открытым стрим или браузер?</b></summary>

Нет. Hell Harvest работает сам, его можно свернуть в трей. При закрытии окна он спросит, продолжать фарм в трее или выйти.
</details>

<details>
<summary><b>Где хранятся мои данные?</b></summary>

Только на вашем компьютере, рядом с программой: сессия (`cookies.jar`), настройки (`config.json`) и журнал трофеев (`Trophies.md`). Никуда, кроме самого Twitch (и магазинов, если пользуетесь сборщиком бесплатных игр), ничего не отправляется. Из диагностических отчётов токены вырезаются перед копированием.
</details>

<details>
<summary><b>Twitch это разрешает?</b></summary>

Автоматический просмотр — серая зона правил Twitch. Hell Harvest входит через официальный вход Twitch по коду и ведёт себя как обычный зритель, но используйте его на свой риск.
</details>

<details>
<summary><b>Как работают обновления?</b></summary>

Hell Harvest проверяет GitHub Releases и предлагает небольшой архив-патч. Он заменяет файлы на месте и перезапускается, сессия, настройки и трофеи остаются. Полный архив всегда можно скачать из Releases.
</details>

## Сборка из исходников

```powershell
git clone https://github.com/MortuisVMain/Twitch-Drops-Sentinel.git
cd Twitch-Drops-Sentinel
npm ci
npm run build                      # интерфейс -> dist/
pip install -r requirements.txt    # сервис на Python
dotnet run --project desktop/TwitchDropsSentinel.csproj
```

Тесты: `python test_sentinel_suite.py`. CI прогоняет их на каждый push.

## Как устроено

```mermaid
flowchart LR
    UI["Интерфейс<br/>React + TypeScript"] <-->|"локальный REST + WebSocket"| Core["Сервис<br/>Python 3.12 asyncio"]
    Host["Оболочка<br/>C# .NET + WebView2"] --- UI
    Host -->|"запускает и следит"| Core
    Core -->|"GraphQL, сигналы просмотра"| Twitch[(Twitch)]
    Core -->|"по желанию"| Stores[("Магазины игр<br/>сборщик раздач")]
```

## Благодарности

Ядро фарма Twitch основано на [TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner) от DevilXD (MIT). Модуль бесплатных игр основан на [free-games-claimer](https://github.com/vogler/free-games-claimer) от Ralf Vogler (AGPL-3.0). Подробности в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Лицензия

MIT, см. [LICENSE](LICENSE). Папка `giveaways_engine/` распространяется по AGPL-3.0, см. [giveaways_engine/LICENSE](giveaways_engine/LICENSE).

Hell Harvest не связан с Twitch, Amazon или магазинами игр и не одобрен ими. Все товарные знаки принадлежат их владельцам.
