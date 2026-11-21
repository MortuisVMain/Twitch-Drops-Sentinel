# Steam IDLE — план реализации

**Дата:** 2026-11-10  
**Статус:** проектное предложение после статического исследования; код не менялся, Steam-клиент и аккаунт не запускались.  
**Назначение:** самостоятельная вкладка Steam IDLE в Sentinel для фарма карточек и автоматизированных очередей достижений. Это план, не подтверждение технической осуществимости или безопасности операций на Steam.

## 1. Резюме решения

Рекомендуемый путь — поэтапная разработка с воротами go/no-go: сначала read-only инвентарь и проверка возможностей локального Steam-клиента, затем ограниченный фарм карточек, и только после доказанной семантики подтверждения — очередь достижений.

Не считать интерфейсы Steamworks для игр разработчика универсальным API для любого AppID пользователя. Документация Valve для издательского Web API `SetUserStatsForGame` требует publisher key владельца AppID и серверного хранения ключа; этот API не подходит клиентской утилите Sentinel ([Valve: ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats#SetUserStatsForGame)). `StoreStats` — другой, локальный Steamworks-контракт, для которого требуется подтвердить пригодность и доступность в контексте произвольных установленных игр; наличие callback в документации ещё не подтверждает поведение конкретной реализации ([Valve: ISteamUserStats interface](https://partner.steamgames.com/doc/api/ISteamUserStats)).

Предлагаемый внешний вид — новая верхнеуровневая вкладка «Steam IDLE» с отдельными разделами «Карточки», «Достижения», «Задачи», «Настройки». Пользователь может выбрать одну игру, отмеченные игры или всю подходящую библиотеку; запуск действий всегда явный. Планируемые режимы должны сообщать отдельно «поддерживается», «не проверено», «Steam отказал», «результат неизвестен» и «не подходит», а не маскировать неизвестную способность как обычную ошибку.

## 2. Проверенные границы текущего Sentinel

Эти сведения статически инспектированы в checkout на дату плана:

- Sentinel — React/TypeScript/Vite, локальный Python `aiohttp`-сервис и C# WinForms/WebView2 host. Основная точка интеграции backend и маршрутов — `core/sentinel_service.py`; frontend опрашивает сервис через `src/hooks/useSentinelState.ts`; shell вкладок и их рендер — `src/App.tsx`; тип `NavTab` — `src/types.ts:216`.
- Навигация, кнопки и условный рендер вкладок в `src/App.tsx` присутствуют вокруг 1100–1175 и 1630–1802. Новый экран затрагивает тип вкладки, навигацию, state/API слой и локализацию, это интеграционная задача.
- `core/game_scanner.py:362-500` обнаруживает локальные библиотеки Steam и manifest-файлы установленных игр; при построении результата в области 485–494 присутствует AppID. Это данные об установленных играх, а не полный список лицензий аккаунта.
- `core/sentinel_service.py` регистрирует существующие REST-маршруты в `_setup_routes`; текущие v1-разделы giveaways и dimmer добавляются явно. Новый контракт логичнее оформить как `/api/v1/steam-idle/...`, не перегружая общий `/api/state` высокочастотным Steam-опросом.
- `core/sentinel_service.py` читает общие настройки из `config.json` и хранит runtime-состояние сервиса в `SentinelSupervisor`. Не добавлять cookie, refresh token или долгосрочную задачу в общий config без отдельного решения по месту хранения и резервному копированию.
- `core/giveaways_controller.py:43-60` определяет Steam browser/session слот для раздач. Обзор не доказывает, что он выдаёт пригодные Community cookies другому модулю, или что их допустимо хранить и повторно использовать. Не связывать IDLE с этим механизмом без отдельной проверки владения сессией, срока действия и logout.
- `desktop/MainForm.cs:4499-4607` содержит Win32 Job Object/ChildProcessTracker, настроенный на завершение дочерних процессов при закрытии job. Это полезный существующий lifecycle-паттерн, но он сам по себе не является Steam bridge, не обнаруживает конфликт игры и не гарантирует корректное освобождение Steam-сессии.
- `desktop/MainForm.cs` запускает и проверяет локальный backend; добавление процесса helper требует отдельного управляемого запуска, логирования, остановки/ожидания и диагностики. Проверить существующее распределение ответственности между MainForm и Python прежде, чем выбирать окончательный владелец процесса.
- В Sentinel Steam IDLE-модуль не найден. В полном дереве пинованного SGI подтверждён внешний исходный ориентир: корневой libs/SteamUtility. Перед любым заимствованием нужен отдельный обзор лицензии и происхождения зависимостей.
- Существующий документ [Steam IDLE Research and Scope 2026-11-10.md](Steam%20IDLE%20Research%20and%20Scope%202026-11-10.md) задаёт утверждённое продуктовое направление и pinned commit SGI `2731d3dc72a7dd47c321a9bff6ea0c374c609e3f`. Здесь исследования расширены новыми проверками источников; ни исходник, ни его архитектура/тексты не являются разрешением на копирование.

Перед реализацией повторно снять номера строк и проверить актуальность каждого пути в текущей ветке. Этот раздел — инспекция кода, не запуск приложения и не верификация рабочего Steam.

## 3. Исследованные варианты интеграции

### 3.1 Локальный helper через Steam-клиент

Предпочтительный первый технический эксперимент — локальный адаптер/helper, который соединяется с уже запущенным официальным Steam-клиентом, отделён от UI и умеет отвечать на конкретно сформулированные запросы. У SGI найденный maintainer описывает два разных backend-режима: Steamworks.NET к локальному клиенту и SteamKit2 к Steam-серверам; в локальном варианте `BIsSubscribedApp` может дать владение DLC, а `BIsDlcInstalled` не подходит как его замена, так как DLC может быть куплен, но не установлен ([разбор SGI achievement sets](https://dev.to/zevnda/steam-achievement-sets-broke-our-bulk-unlocks-what-changed-in-the-schema-and-how-we-fixed-it-4h8e)).

Это не доказывает, что local Steamworks helper способен получать полный список библиотеки, читать прогресс и менять достижения для каждого случайного AppID. До реализации нужно ответить прототипом: как перечислить установленные/owned приложения, получить stats schema и пользователя, обработать Steam callback, определить DLC ownership и корректно завершить/отменить каждую операцию. Отдельно проверить семантику Steam IDLE процесса: активные AppID могут влиять на «сейчас в игре», на чужие игры и на поведение официального клиента. Не запускать автоматический idle поверх реальной сессии пользователя без ясной видимой блокировки.

### 3.2 Прямое подключение SteamKit2

SteamKit2 — .NET библиотека взаимодействия с Steam network; репозиторий публикует QR authentication sample ([SteamRE/SteamKit](https://github.com/SteamRE/SteamKit), [sample](https://github.com/SteamRE/SteamKit/blob/master/Samples/001_AuthenticationWithQrCode/Program.cs)). Это вариант для прототипа инвентаря/сессии, но не функциональный эквивалент локального Steamworks. Придётся отдельно реализовать безопасное привязывание SteamID, auth challenge/QR, обновление сессии, повторный вход, отзыв, rate limit, session conflict, лицензии/PICS и отдельные Community cookies.

На момент написания не доказано, что выбранная версия SteamKit2 даёт надёжно проверенный путь для всех желаемых операций карточек и достижений по всем играм. Включить этот вариант только после capability-прототипа и проверки API/лицензии текущей версии; не закладывать встроенный QR login как уже принятый продуктовый контракт. Не хранить credentials в логе, config или обычном JSON.

### 3.3 Community HTTP scraper и cookies

Карточные остатки в SGI исследованном snapshot получались с Community badge pages. Scraper проверял отозванную сессию, Family View, HTML ошибки при HTTP 200, и полноту pagination; ошибка одной страницы делала полный результат невалидным. В реализации Sentinel нужен такой же принцип доказательства полноты, но не копирование кода/структуры.

Автоматическое получение Community cookies через браузер профиля или WebView — отдельная область авторизации с чувствительными данными. SGI-поведение (agent mode использует существующую сессию, local/CLI mode требует отдельный скрытый WebView) — наблюдение по указанным файлам snapshot, не гарантия безопасности или совместимости. В Sentinel предусмотреть только отдельный login flow с явным выбором метода и очисткой сессии; никаких cookies в диагностический отчёт, URL, exception text, UI console или обычное журналирование. Logout/отзыв должен немедленно деавторизовать будущие запросы и убрать секреты из хранилища/памяти.

### 3.4 Альтернативы и непереносимые свойства

ArchiSteamFarm документирует simple/complex farming и предупреждает против ускорения любой ценой; алгоритм зависит в том числе от ограничения карточных drop и порога часов ([ASF Performance](https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Performance)). Это ориентир для выбора последовательности и поведения, а не свидетельство универсальной политики Valve. Idle Master Extended документирует ручное копирование cookie с сайта Community и замечает, что Store cookies не подходят ([login methods](https://github.com/jonas-med-ett-s/idle_master_extended/wiki/Login-methods/e22d587c5478b40fed5b96c76a904ebe6b9e0215)). Это показывает, что термин «Steam login» не означает единый cookie/token для всех Steam веб-сервисов.

Коммерческие/публичные FAQ и issues полезны как сигналы регрессий, но не контракт. Не утверждать «Steam API разрешает всё», «карточки безопасны при любой параллельности», «cookie из giveaway уже подходит» либо «Steamworks.NET поддерживает произвольную игру» без отдельного подтверждения на конкретном capability-test.

### 3.5 Steam achievement sets — новый обязательный риск

Valve добавляет серверную проверку состава achievements/stats и публикует отдельные требования для `SetUserStatsForGame`, которому требуется publisher key владельца AppID и серверная конфиденциальность. Это endpoint исключён как desktop-write путь Sentinel.

В статье SGI maintainer от 2026-10-30 описаны новые Achievement Sets: schema может включать `groups`, `groupid`, DLC AppID и archived state. Согласно статье, batch `StoreStats` с одним достижением из непроданного DLC может получить `EResult.InvalidParam` для всего batch; archived achievements также отклоняются при unlock. Данные статьи относятся к состоянию Steam Client Beta/наблюдению автора и должны быть перепроверены по текущей официальной документации и на синтетической schema fixture. Первоисточник/наблюдение: [maintainer writeup](https://dev.to/zevnda/steam-achievement-sets-broke-our-bulk-unlocks-what-changed-in-the-schema-and-how-we-fixed-it-4h8e), связанное обсуждение SAM: [issue 560](https://github.com/gibbed/SteamAchievementManager/issues/560).

Вывод для плана: схема достижений должна сохранять группы и DLC, выдавать ownership со статусами known owned / known unowned / unknown, показывать archived/hidden/locked/already achieved, не отправлять известные несовместимые элементы в массовую запись. При unknown ownership безопасный default — не делать рискованный bulk unlock; запросить ещё один источник либо исключить элементы из очереди. Поведение должно быть прозрачным, не скрытым fail-open. Успешный HTTP/RPC send — не подтверждённая запись: только распознанный callback/ответ Steam и последующее обновление состояния могут пометить элемент завершённым. Таймаут означает uncertain; запрещён слепой повтор, пока состояние не перечитано. Разбить batch на группы не гарантирует отсутствие скрытых побочных эффектов, поэтому размер batches и fallback — решение прототипа.

## 4. Поддерживаемая область продукта

### Карточки

- Инвентарь всех игр, доступных выбранному аккаунту в пределах фактически поддержанного upstream, включая неустановленные игры, с явным статусом eligibility и времени обновления. Полная библиотека может содержать игры без карточек, private/ineligible игры и DLC/tools; не обещать, что любой AppID фармится.
- Виртуализируемый список карточек с поиском/фильтром: готовы, набирают необходимое время, ожидают проверки, приватны/не поддерживаются, ошибка/устарели.
- Запуск для одной выбранной игры, выделенных игр и всех подходящих. Всегда показывать число затрагиваемых игр, исключения, аккаунт и примерно известную длительность до подтверждения старта.
- Whitelist/blacklist, ручной порядок/приоритет, порог часов для warm-up, последовательная обработка как default. Одновременный warm-up — настраиваемый лимит. Одновременный card farming — отдельный experimental toggle только после прототипа.
- Действия: старт, pause/resume, stop, пропуск игры, исключение игры, повтор проверки. Restart приложения восстанавливает очередь как paused; автоматического старта после рестарта/смены аккаунта нет.
- Автопауза при обнаруженном игровом процессе — требуемое направление, однако текущий gaming detector не проверяет чужую игру как доказанный конфликт Steam аккаунта. До интеграционного теста использовать статус «конфликт возможен/ручная пауза», а не автоматически считать сенсоры эквивалентом Steam presence.

### Достижения

- Список схемы и прогресса по одной игре с метаданными групп, SteamID, статусом ownership, freshness, hidden/protected/archive и пониманием «unknown».
- Выбор очереди на одну игру, выбранные игры либо всю поддерживаемую библиотеку; можно исключать игры и отдельные achievements; ручная сортировка. До любого write явное подтверждение и предварительный обзор «будут изменены / уже в целевом состоянии / пропущены / неизвестны / риск».
- Очереди unlock запускаются только вручную; пауза, resume, stop, per-item результат; интервал/задержка — настройки очереди с минимальным безопасным floor, без обещания, что randomized delay делает работу безопасной.
- Не менять автоматически текущие stats, не сбрасывать достижения и не делать relock всех игр без отдельного scope review. Import timing другого игрока остаётся отложенным продуктовым решением.

### Явно вне текущего объёма

- Маркетплейс, автоматическая продажа/обмен карточек, покупки или refund window automation.
- Автоматическая очистка/сброс статистики или массовый relock.
- Несколько Steam accounts одновременно; cloud/remote runner.
- «Обход» ограничения/политики Steam или скрытие активности от клиента.
- Утверждение юридической или аккаунт-безопасности автоматизации по одному только наличию open source проекта.

### Правила выполнения очереди

Карточки выполняются по одному AppID. Внутри выбранного порядка сначала идут игры с подтверждённым ready. Если ready нет, warm-up использует настроенный порог часов и лимит активных AppID, по умолчанию один. Следующая проверка карточек назначается после заданного интервала. Таймер использует монотонные часы, ожидание учитывает Retry-After и backoff. Пауза останавливает presence и сохраняет позицию, resume заново проверяет аккаунт, конфликт и данные. Игра завершена по полному свежему снимку с нулём оставшихся карточек либо получает явный terminal skip.

Для достижений отдельный интервал между элементами начинается после подтверждения либо reconciliation предыдущего. Первый рабочий срез использует ручной запуск; расписание и последовательные задачи остаются в плане этапа G5. Контракт расписания хранит часовой пояс, решает DST по одному стабильному идентификатору слота и пропускает пропущенные триггеры без пачки запусков после сна, outage или рестарта. При включении расписания пользователь явно задаёт, разрешён ли автоматический старт после запуска Sentinel; по умолчанию выключено.

## 5. Архитектурное предложение

Сохранить простую границу: React экран → typed API client → Python supervisor/service → SteamIdleCoordinator → адаптер(ы) Steam → изолированный процесс helper, только если capability прототип подтвердил необходимость/пользу. В начале может оказаться, что read-only scanner и локальный helper достаточно; не вводить заранее три адаптера или plugin abstraction.

| Модуль | Сейчас | Предложение |
|---|---|---|
| Навигация/экран | `src/App.tsx`, `src/types.ts` | добавить NavTab, navigation label/icon, lazy/in-place SteamIdleView routing |
| Компоненты экрана | общей Steam IDLE view нет | `src/components/SteamIdleView.tsx` (предлагаемое имя), дочерние списки/очередь только после фиксации UX |
| API client/hook | существующий `src/hooks/useSentinelState.ts` обслуживает общую state data | новый typed hook/client для Steam IDLE с умеренным polling и cancellation; не тащить каждую страницу в общий SentinelState |
| Сервис API | роуты в `core/sentinel_service.py` | маршруты `/api/v1/steam-idle/*`, обёртки над coordinator; handler не выполняет длинный scan/write inline |
| Координатор | отсутствует | `core/steam_idle/coordinator.py`: единственный владелец очередей, account binding, lock, event version, cancellation |
| Card provider | отсутствует | `core/steam_idle/cards.py`: scraper/provider interface по фактическому выбранному источнику; validate page completeness |
| Achievement provider | отсутствует | `core/steam_idle/achievements.py`: schema/progress parser и writer capability guard |
| Persistence | общие settings в `config.json`, другие state files надо повторно проверить | SQLite в отдельном каталоге профиля; секреты туда не писать |
| Steam bridge | существующий scanner только local installed games; C# lifecycle есть | прототипируемый C# helper или SteamKit2 client; выбор после измерений и API evidence |
| Native lifecycle | `desktop/MainForm.cs`, `ChildProcessTracker` | централизовать старт/handshake/stop/kill+wait; child nonzero и protocol break отображать как backend fault |
| локализация | каталоги `src/i18n`, `core/lang` | добавить RU/EN для всех видимых состояний; сохранить placeholders и единый смысл |

Имена новых файлов — проектные предложения, пути и модульные границы подтвердить при implementation planning. Сохранять существующий launch/service lifecycle и не дублировать Steam state как второй общий source of truth.

## 6. API-контракт (предложение)

Маршруты добавлять по стилю существующего aiohttp (core/sentinel_service.py около 539). Loopback bind около 1832 и действующий CORS около 609 сами по себе не авторизуют запись. Для мутаций требуются проверенный разрешённый Origin, секрет локальной сессии в заголовке, проверка Content-Type и account epoch. Тесты отклоняют чужой Origin, отсутствующий токен, запрос со старым epoch и неподдерживаемый content type. Все записи принимают `request_id` (UUID), `expected_version` или аналог для защиты от устаревшего UI, account binding и bounded body. После проверки локальной сессии и account binding проверяем сохранённый request_id до expected_version. Точное повторение возвращает прежний результат, тот же UUID с другим payload получает конфликт. Idempotency и durable intent пишутся транзакционно до отправки.

- `GET /api/v1/steam-idle/state`: schema version, coordinator state, active account SteamID/label (без credentials), connected capability flags, account epoch, queue summary, freshness, pause/conflict reason, last safe error code.
- `GET /api/v1/steam-idle/library?cursor=…&limit=…`: серверный upstream snapshot с cursor и total/unknown; UI paging не означает, что Steam endpoint имеет native pagination. Не класть все 9,264 игр в каждый poll.
- `POST /api/v1/steam-idle/library/refresh`: создаёт scan job и возвращает job_id. Состояние читается через GET /jobs/{id}, отмена через POST /jobs/{id}/cancel.
- `GET /api/v1/steam-idle/games/{appid}/cards`, `GET .../achievements`: данные и freshness/status. Никакой полноты от пустого списка без `complete=true`.
- `POST /api/v1/steam-idle/queue`: создать очередь с режимом, явным набором или selection token + snapshot version, исключениями, порядком и параметрами. Ответ содержит review summary, ещё не запуск. All eligible фиксирует AppID, исключения, snapshot revision и account epoch. Новые игры не входят в уже подтверждённую очередь. Перед отправкой проверяем актуальность eligibility.
- `POST /api/v1/steam-idle/queue/{id}/start`: обязательное явное подтверждение summary/version/account_epoch. Повторный start после неопределённого результата не должен повторить Steam write.
- `POST .../{id}/pause`, `resume`, `stop`, `skip`: cancel-safe; операция stop идемпотентна, resume отклоняется при смене аккаунта/конфликте/неизвестном предыдущем write.
- `POST /api/v1/steam-idle/auth/{method}/begin`, `GET .../status`, `POST .../logout`: только после выбора auth способа. Начало отдаёт user-action URL/QR либо browser action без секрета; callback содержит outcome, never cookies/token.
- В v1 используем polling с монотонной версией снимка, отменой запроса при смене вкладки или аккаунта и замедлением опроса вне активной вкладки.

Состояния подключения, полнота и свежесть снимка, lifecycle очереди и результаты элементов передаются отдельными полями. Коды ошибок стабильны (`session_revoked`, `family_view_blocked`, `page_incomplete`, `unsupported_capability`, `steam_rejected`, `ack_timeout`, `account_changed`, `process_conflict`) и человекочитаемые RU/EN сообщения формируются frontend i18n. Тексты exception/raw HTML/cookie никогда не прокидывать в UI.

## 7. Состояния, конкуренция и uncertain writes

Очереди должны быть сериализуемы, восстанавливаемы и account-scoped:

1. `draft` — selection + snapshot/version; до запуска можно редактировать.
2. `reviewed` — конкретный immutable manifest с include/exclude и способностью адаптера.
3. `queued` — пользователь подтвердил; ожидание единственного Steam writer lock для account.
4. `running` — один account lease, текущая игра/item, heartbeat и step.
5. `pause_requested` / `stop_requested` — сигнал отмены; не выдавать статус paused/stopped, пока worker реально не прекратил запись.
6. `paused` / `stopped` — checkpoint устойчиво записан.
7. `uncertain` — Steam запрос мог быть обработан, подтверждение потеряно; чтением сверить целевое состояние перед любым повтором.
8. `failed` — ошибка с retryable/nonretryable, но без скрытого retry на write.
9. `completed` означает завершение всех элементов. `completed_with_errors` означает завершение обхода с явно отклонёнными/неуспешными элементами. `skipped` — терминальный результат элемента с причиной. Очередь с неопределённой записью остаётся `uncertain`. `stopped` означает остановку по команде пользователя после завершения локальной очистки и записи checkpoint. После отправки stop не отменяет уже принятый Steam unlock.
10. После restart worker не resume автоматически; очередь становится `paused` или `uncertain` в зависимости от последнего persisted operation intent.

Один общий lease на изменения локального Steam-клиента, привязанный к SteamID, включая время остановки helper. Card warm-up, card presence и achievement write могут иметь разные leases только если прототип докажет отсутствие перекрытия/конфликта. Account switch увеличивает epoch; все старые команды и события отклоняются по epoch, текущие workers cancel, а очередь сохраняется paused либо uncertain под старым SteamID без разрешения выполнять её от нового аккаунта.

Каждая внешняя запись получает durable operation row до send: operation UUID, account fingerprint (SteamID, не секрет), AppID, item IDs, desired state, request timestamp и `pending`. Ответ/callback переводит в `acknowledged` или `rejected`. Потеря ответа либо невозможность подтвердить целевое состояние чтением оставляет `uncertain`. После реконнекта выполнить только read/reconcile и сравнить фактический state с желаемым. Никогда не выдавать `success` по факту отправки, HTTP 2xx, завершения процесса или локального optimistic update.

Фильтр achievement перед batch: не включать уже unlocked, archived, явно unowned DLC, protected или ownership unknown до решения источника. Разделить batch по совместимой группе/known entitlement; при первом rejection остановить batch и сохранить точный список уже подтверждённых item. Размер batch ограничить prototype evidence. Hidden управляет раскрытием описания и иконки, а возможность записи определяется отдельно. Скрытый элемент может участвовать при явном выборе и подтверждённой eligibility. Callback `UserStatsStored_t` описан Valve. В проверенном локальном пути SGI ожидание этого callback отсутствует.

## 8. Persistence, приватность и data-dir

- Очередь и checkpoint — только mutable пользовательские данные, отдельные от app binaries, release payload и общего диагностического экспорта.
- Предлагаемый SQLite путь — `<profile>/userdata/steam_idle/state.sqlite3`. Для текущего dev/portable прототипа `<profile> = PROJECT_DIR`; для установленного режима использовать корень пользовательского профиля после утверждения resolver. `PROJECT_DIR` и чтение config находятся в core/sentinel_service.py около 44 и 244. Дерево core рекурсивно попадает в clean payload (tools/create_clean_release.py около 69), поэтому профиль держим снаружи и проверяем отсутствие `userdata/steam_idle` и sidecar-файлов SQLite в payload. Исторически Sentinel использует `config.json` рядом с проектом в dev; это не универсальный путь installed profile.
- Хранить библиотеку/cache отдельно от секретов; account identity хранить SteamID и локальную выбранную auth method без cookie. Секреты — Windows Credential Manager/DPAPI через обособленный сервис, если выбранный token тип требует хранения. DPAPI CurrentUser привязан к Windows-пользователю и среде защиты. При переносе portable-профиля требуется повторная авторизация. Не экспортировать их в backup; если секрет можно использовать только transiently — держать в памяти и очищать при logout/exit.
- Для браузерной авторизации использовать отдельный профиль WebView2. У окна авторизации отключён привилегированный bridge, перед операциями host проверяет фактический Source, cookie читаются через GetCookiesAsync только для разрешённого HTTPS-хоста Community. Минимальный набор передаётся из host в локальный адаптер по защищённому каналу, исключая JavaScript, логи и общую giveaway-сессию. Для Community scraper явно обозначить отдельную session capability; Steam Store cookie не считать Community cookie.
- Logs: request IDs, AppID, operation ID, stable error code и redacted host/path. Never log cookie values, auth headers, QR tokens, refresh tokens, full request/response bodies, user path/credentials. Диагностические отчёты исключают SQLite/json cache и auth state по умолчанию.
- Миграция state schema additive, versioned, backup before migrate; downgrade читает только известную безопасную схему. Для повреждённого cache — quarantine/rebuild read-only, не удалять queue/secret молча.
- Release payload начинается с чистой сборки (`tools/create_clean_release.py` или текущего официального процесса); Steam helper binaries должны быть явной зависимостью с лицензиями и не содержать реальных аккаунтных профилей/данных.

## 9. Incremental inventory, performance и cache

Не предполагать, что GetOwnedGames автоматически отдает 9,264 игры несколькими страницами: upstream может вернуть весь список одним ответом, а у метода есть visibility, API key и include_free_games caveats. Получить полный результат, если доступен, затем locally page/chunk UI/rendering и schema refresh по bounded batch. Если выбранный источник не позволяет приватную библиотеку без Web API key — это product/auth limitation, его нельзя скрывать за «пустой библиотекой».

- Раздельные таблицы/cache: accounts (SteamID); owned app snapshots; app metadata; cards snapshots; achievement schemas; progress snapshots; queue; queue items; operations/outcomes. Индексы по SteamID+AppID+updatedAt/status.
- Cache key включает account epoch/SteamID, AppID, upstream, schema revision и locale где релевантно. Не смешивать чужие данные после account switch.
- Library refresh — явно запускаемая background job с cursor/cancellation token, throttled request scheduler, backoff на 429/5xx и retry только idempotent GET. UI показывает progress/total known, pause/cancel, current stage, last refresh; повторное открытие вкладки не сканирует всё с нуля.
- Schema cache долгоживущий с ETag/hash/revision; invalidate при parser version/source update и explicit refresh. Achievement progress refresh только выбранным/запланированным играм или staleness window, а не всей библиотеке каждые 3s.
- Для all-library фиксируется список AppID, а достижения раскрываются по одной обрабатываемой игре. Предварительный обзор сообщает число игр и отдельно число уже проверенных достижений; неизвестное количество не подменяется нулём. Завершённый Steam set и отсутствие недостающих достижений — разные признаки: Steam сохраняет завершение набора после добавления новых достижений.
- Community pages: выполнять последовательную discovery pagination либо ограниченный concurrency; установить max pages / response bytes / wall-clock на игру, parse content type/body, HTML error, revoked-login, Family View, duplicate page/cursor, missing last page. Успех только если все страницы подтверждены; partial response отдельный `incomplete` outcome и никогда не «0 cards remaining».
- Базовые performance gates для планирования (proposal, пометить как измеряемые): 9,264-item synthetic fixture отображается без блокировки UI; фоновый scan отменяется в течение 2s; до двух одновременных read-only запросов на provider в прототипе, один последовательный обход Community pagination и один активный AppID для write/presence; менять лимиты только по измерениям; повторное открытие вкладки делает 0 full refresh без explicit request; состояние очереди ≤1 секунды на foreground snapshot. Не считать эти значения уже измеренным SLA.

## 10. UI и взаимодействие

Вкладка Steam IDLE следует существующей навигации Sentinel, визуальным токенам и i18n; не придумывать отдельный глобальный shell. Первый экран без авторизации объясняет, что доступно для read-only и что требует входа; рядом видны выбранный account ID/alias, reconnect/logout и capability status.

Экран карточек: сводка «готовы / warm-up / не подходят / проверка устарела», поиск, фильтр, список/таблица с artwork, AppID, remaining drops, estimated hours только если источник это подтверждает, last checked, eligibility reason. Верхний action bar даёт «обновить», «создать очередь» и после review явный Start/Pause/Resume/Stop. Массовый выбор показывает точное число включённых и исключённых игр.

Экран достижений: выбор игры, completeness/freshness schema, прогресс, группы, archived/unowned/unknown labels; массовый выбор превращается в review summary. Для всех библиотечных игр сначала можно подготовить read-only очередь, но write разбивается на обозримые этапы и не стартует без общего preview. Заменить «разблокировать всё» на конкретную цель, количество и понятные последствия; undo не обещать.

Задачи/история показывают per-item timeline: запрошено, отправлено, подтверждено, reconciled, rejected/uncertain, пропущено с причиной. Ошибка авторизации содержит действие «войти снова», rate limit — countdown и retryable flag, неизвестное состояние — блокирует повтор и предлагает сверить. Все тексты RU/EN, экран с keyboard navigation/focus/contrast, доступные hit-targets.

## 11. Прототипные ворота и порядок работ

### G0 — разрешимость интерфейса и provenance (до кода продукта)

- Проверить лицензию и notices корневого libs/SteamUtility и поставляемых DLL, состав транзитивных зависимостей и воспроизводимость чистой сборки. Исходники SGI используются как свидетельство поведения.
- Зафиксировать версии Steamworks.NET/SteamKit2 и документацию официальных API; представить capability table с независимыми тест-кейсами: owned games, installed games, schema, progress, card pages/cookies, game presence, DLC ownership, achievement write/ack, cancellation, process exit.
- Gate: если Steamworks local path не подтверждает целевые arbitrary AppID capabilities, изменить scope до любого user-facing write. Если SteamKit2 auth/owned/PICS не получается безопасно, отложить аккаунтные действия.
- Все экспериментальные Steam actions — explicit test account/game, отдельный прототип, с логами redacted. Живые операции требуют отдельного явного разрешения.

### G1 — read-only инвентарь и contract fixtures

- Реализовать типы/парсер/SQLite cache только после согласования API/data dir, затем synthetic fixtures: 9k apps, duplicate IDs, missing data, private/ineligible, all pagination cases, schema with/without groups.
- UI показывает partial/stale/unknown раздельно, cancellation и account switch не меняют результаты другой учётки.
- Gate: полный inventory snapshot отделяется от UI pagination; никакая ошибка upstream не превращается в пустую библиотеку/0 remaining.

### G2 — card farming, один selected AppID

- Верифицировать Community auth на тестовом профиле/выбранном аккаунте с явным действием. Проверить реальный page completeness на известных public/private/no-card/error pages и synthetic truncated, error HTML with HTTP 200, revoked session, Family View.
- Подключить один игровой AppID через chosen local bridge; start/pause/stop, закрытие Sentinel, restart и чужая активная игра. До подтверждения состояния не переходить к all-library.
- Gate: helper завершает сессию/процесс, на stop Steam activity очищается, exception не включает cookies, invalid/partial scrape не отмечает очередь завершённой.

### G3 — achievement read-only, затем один необратимый unlock

- Парсить base game/no-group и achievement sets; fixture для DLC owned/unowned/unknown, archived achievement/set, hidden/protected, AlreadyUnlocked, localized display, повреждённый schema и неизвестные fields.
- Чтение Steam callback schema; определить подтверждение `StoreStats` на выбранной связке backend/helper. Не подменять callback HTTP/IPC «успехом».
- Первый write — один выбранный достижимый элемент в тестовом/offline fixture, затем только после отдельного explicit approval на низкорисковой выбранной игре. Проверить callback success, server rejection, disconnect before/after send, ack timeout, reread reconcile, duplicate request id.
- Gate: если невозможно доказать, что write подтверждён и безопасно reconcile, оставить продукт read-only; автоматические achievement queues не выпускать.

### G4 — selected/all queues, durability и выпуск

- Включить ручное создание очереди, explicit review/start, exclusions и sequential default; затем выбранные игры и только последним этапом all eligible.
- Проверить паузу на user-game/session conflict, restart recovery, account switch, stop during callback, queue schema migration, stale UI version, partial batch, Steam outage, rate limit и duplicate idempotent requests.
- Проверить виртуализированный список, ленивую загрузку схем по игре и bounded scheduler на synthetic 9,264 apps и длинной очереди; измерить суммарный RAM/CPU всех процессов Steam IDLE, включая helper, и network. Студийный ориентир для фоновой добавки — RAM <50 MB и idle CPU около 0%; при превышении зафиксировать измерения и решение перед выпуском.
- Включить packaging notices/cleanup/auth data exclusion, чистый install/portable и rollback; release notes явно укажут экспериментальные ограничения.

## 12. Матрица испытаний (все пункты — будущие)

### G5 — расписание и последовательные задачи после стабильной очереди

- Добавить фиксированные/случайные интервалы, календарные окна и запуск следующей явно выбранной очереди после успешного завершения предыдущей. Случайный интервал выбирается один раз для шага и сохраняется; перезапуск не пересчитывает его ради ускорения.
- Ручная пауза имеет приоритет над календарём. Ошибка/uncertain не запускает следующую задачу; исключённые игры сохраняют причины пропуска. Таймеры после сна сверяются с реальным временем, пропущенные календарные старты не накапливаются.
- Приёмка: тесты смены часового пояса, DST, сна, рестарта, ручной паузы, незавершённой записи и двух совпавших триггеров. На аккаунте по-прежнему один диспетчер действий.

Матрица ниже применяется ко всем этапам G0–G5.

Проверки репозитория после изменений включают npm run build, npx tsc --noEmit, node --test tools/engine_tests/*.test.mjs, node tools/check_i18n.mjs и dotnet build desktop/TwitchDropsSentinel.csproj при изменении native host. Скрипт npm test отсутствует.

| Область | Синтетические/офлайн случаи | Затем controlled Steam check | Требуемый исход |
|---|---|---|---|
| Инвентарь | 0/1/9264 apps, duplicates, missing name, error/timeout, hidden profile | read-only выбранного аккаунта | ошибка/приватность не становятся пустым успешным snapshot |
| Cards | 0 drops, 1 remaining, not eligible, error HTTP 200, malformed HTML, page loop, missing final page | public/private/no-card chosen apps | partial scan stays incomplete; valid 0 is distinguished |
| Auth | revoked, expiry, wrong cookie scope, network reconnect, logout race | login method selected by user | secret redacted and logout invalidates future request |
| Queue | duplicate start/request_id, stale version, stop/restart/account change | single selected game | stale command refused, queue never crosses account |
| Presence | helper missing, handshake timeout, other game active, process crash, shutdown | controlled local client | conflict pauses/blocks; child exits and surfaces failure |
| Achievements | old schema, groups, archived, hidden, DLC owned/no/unknown, all already set | one approved item | never write archived/known unowned; unknown not silently marked success |
| Writes | callback success/reject, ack lost before/after send, disconnect, server InvalidParam | single explicit action | acknowledged/rejected/uncertain separate; retry only after reconcile |
| Scale | 9264 rows, slow storage, cancel at every phase, repeated tab-open | no full live scan per poll | UI responsive, bounded resource use, cancellation finishes |
| Release | empty profile, no credential, corrupted cache, upgrade rollback | packaged helper presence only | no credentials/cache shipped; notices/licenses present |

Офлайн тесты проверяют локальный контракт; они не подтверждают поведение Steam network, аккаунтную политику или безопасность метода.

## 13. Процесс, release и rollback

- Предложение для v1 — Python владеет запуском, командами и ожиданием helper, существующий Job Object WinForms служит аварийным containment. Проверить наследование job на реальном packaged launcher до G2. Lifecycle: старт с контролируемыми аргументами без секретов, line-oriented/JSON IPC с protocol version, bounded stdout/stderr, timeout/heartbeat, graceful stop, wait, затем bounded kill; диагностика полного контекста без credential/raw payload.
- При использовании существующего Job Object подтвердить, что child присоединён к job, host владеет его handle и App close гарантирует cleanup. Проверить, не конфликтует ли helper Steam client или второй процесс Steam.
- Не использовать cmd string interpolation для user data. Применять executable path из release manifest, validated arguments, working directory app resource (не writable profile), никакой загрузки helper из произвольного URL.
- Package содержит только нужные binaries/assets и license notices. Не паковать пользовательский `config.json` (чистый шаблон/defaults допустим), браузерные профили, cookies, auth state, queue/account cache и логи. Сохранить установленные данные на rollback; миграция cache вперед/назад тестируется отдельно.
- Feature kill switch выключает новый writer, но оставляет read-only диагностику, auth logout и сохранение очередей в безопасном состоянии. Rollback release не должен автоматически удалять cache/queue/credentials; миграцию выполнять additive/transactional.
- Перед выпуском проверить чистую сборку, версию всех dependencies, подписи/provenance helper и release artifact listing. Конкретные setup-файлы и acceptance matrix уточнить относительно актуального installer/portable ZIP плана, не предполагать, что helper автоматически корректно упакуется.

## 14. Решения по умолчанию и открытые вопросы

Рекомендуемые defaults для движения без повторного опроса:

1. Первая версия — локальный Windows user, один Steam аккаунт и один активный worker.
2. Cards: read-only inventory → selected-game queue → selected games → all eligible. Sequential card processing по умолчанию, auto-pause on conflict если это подтверждено, иначе явный блок/предупреждение.
3. Achievements: read-only сначала. Automatic queues для одной/выбранных/всех игр остаются целью, но включаются только после G3 доказанного callback + reconcile. Только unlock; никаких stats/reset/relock.
4. Auth: отдельная Steam Community session capability и local client session не считаются одной авторизацией. Способ логина выбирается после feasibility прототипа.
5. Cache/persistence: отдельная SQLite database, секреты вне SQLite. Это предложение для 9k игр и durable queue; проверить текущую зависимость SQLite и portable paths перед выбором.
6. Unknown state консервативно блокирует массовое изменение. User may refresh/skip; нет silent best effort.
7. Не заявлять Steam policy compliance/account safety без первичного источника; явно представить неизвестные platform impacts и user-controlled operation.

Открытые решения по возможностям Steam

- Нужна ли непрерывная работа при закрытом окне или только пока открыт Sentinel? Default: закрытие останавливает helper gracefully, durable очередь остаётся paused.
- Можно ли использовать SteamKit2 direct auth или продукт должен использовать уже авторизованный официальный клиент? Default: не выбирать до G0 capability/security review.
- Можно ли писать достижения автоматически после отдельного подтверждения пользователя? Последний scope говорит да для очередей; это не значит, что каждая новая сессия auto-start.
- Импорт времени другого игрока остаётся вне первого релиза до отдельного решения.
- Каковы accepted warm-up threshold и параллельность? Default: последовательная карточная добыча, bounded configurable warm-up; значения определить по прототипным наблюдениям и показать.
- Разрешать ли browsing/login через общий Giveaways браузер? Default: нет, пока владелец cookie и срок сессии не описаны отдельным контрактом.

## 15. Источники и пределы проверки

### Первичные платформенные/проектные источники

- [Valve ISteamUserStats Web API — SetUserStatsForGame](https://partner.steamgames.com/doc/webapi/ISteamUserStats#SetUserStatsForGame) — publisher key/app owner requirement; не подходит для общего desktop client.
- [Valve ISteamUserStats interface](https://partner.steamgames.com/doc/api/ISteamUserStats) — local interface и callback `UserStatsStored_t`; надо подтвердить связку helper/игра.
- [Valve Steam Support — private games and trading cards](https://help.steampowered.com/en/faqs/view/1150-C06F-4D62-4966) — ограничение приватных игр для карточек.
- [SteamKit2 repository](https://github.com/SteamRE/SteamKit) и [QR auth example](https://github.com/SteamRE/SteamKit/blob/master/Samples/001_AuthenticationWithQrCode/Program.cs) — возможности библиотеки и sample, не гарантия полной Steam API coverage.
- [ArchiSteamFarm performance guidance](https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Performance) — алгоритм/порог как поведенческое сравнение, не Valve guarantee.
- [Idle Master Extended login guide](https://github.com/jonas-med-ett-s/idle_master_extended/wiki/Login-methods/e22d587c5478b40fed5b96c76a904ebe6b9e0215) — различение Community cookies и Steam Store cookies.

### SGI — ограниченная исходная проверка, behavioral evidence only

Пинованный snapshot `zevnda/steam-game-idler` commit `2731d3dc72a7dd47c321a9bff6ea0c374c609e3f`, 6.5.1, в исходном исследовании охватил только восемь файлов:

- [card scraper](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/scraper.rs#L108-L253): pagination, revoked/Family View/error HTML, all-pages validation.
- [card manager scheduling](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/manager.rs#L374-L407): ready vs warm-up, bounded active work, ordering.
- [manager session behavior](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/manager.rs#L634-L867): account-keyed memory session, cooperative stop/exclusions, pause on another client, retry behavior; not durable queue persistence.
- [batch achievement commands](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/achievements/commands.rs#L164-L231): outcomes per batch/item and described StoreStats call; actual helper callback handling was not in reviewed files.
- [achievement library coordinator](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/achievements/library_run.rs#L1-L43): writer conflict lease/drop guard for cancel.
- Полное дерево pinned commit подтверждает корневой libs/SteamUtility. Ниже отдельно описаны проверенные пути, а лицензии и происхождение вложенных DLL остаются воротами G0.
- The source review did not test Steam, API policy, live callback success, cancellation timing, account risk, or feature correctness. Do not represent it as a full source audit.

Статья SGI maintainer о новых sets опубликована 30 октября, до pinned commit от 10 ноября и описывает наблюдения на beta; она является источником реализации/диагностики, не заменой документации Valve. Библиотека SteamKit2 тоже движется; версии зафиксировать в G0. У документа есть ссылки на официальные проекты и операционные альтернативы, но список не является доказательством runtime-поведения Sentinel.

### Проверенный helper в pinned SGI

- Локальная сессия связывает процесс с AppID, задаёт SteamAppId и вызывает Init. Чтение ждёт callback RequestUserStats с опросом 100 мс и пределом 10 секунд. Dispose вызывает Shutdown. [SteamworksSession.cs:12–74](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/libs/SteamUtility/Backends/SteamworksSession.cs#L12-L74)
- Локальный одиночный и массовый write проверяет bool SetAchievement и StoreStats и сразу возвращает исход. В проверенном пути отсутствует ожидание UserStatsStored_t. Это статический риск ложного успеха. [SteamworksLocalBackend.cs:150–257](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/libs/SteamUtility/Backends/SteamworksLocalBackend.cs#L150-L257)
- Удалённый batch сохраняет существующие значения и биты stats, ждёт ответ StoreStats, проверяет EResult.OK и StatsFailedValidation, отклоняет GameCoordinator titles. Подтверждение уровня ответа всё равно дополняется чтением целевого состояния. [AchievementHandler.cs:437–520](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/libs/SteamUtility/Daemon/Bot/AchievementHandler.cs#L437-L520)
- OwnershipManager читает authenticated licenses/PICS, учитывает DLC и неполные ответы, ждёт первичные лицензии и отдельно обогащает playtime через Player.GetOwnedGames. [OwnershipManager.cs](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/libs/SteamUtility/Daemon/Bot/OwnershipManager.cs)
- Проект helper использует .NET 8, SteamKit2 3.4.0 и поставляемые Steamworks.NET.dll/steam_api64.dll. Комментарии о прежнем несовпадении entrypoint делают чистую сборку и тест загружаемых DLL отдельным условием G0. [SteamUtility.csproj](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/libs/SteamUtility/SteamUtility.csproj)
- Valve отдельно описывает achievement sets и ограничения archived/developer-only. Эти флаги, DLC entitlement и hidden нужны как самостоятельные поля модели. [Valve Achievement Guide](https://partner.steamgames.com/doc/features/achievements/ach_guide)


### Матрица возможностей для выбора адаптера

| Возможность | Локальный Steam | Прямой SteamKit2 | Условие Sentinel |
|---|---|---|---|
| Installed games | Manifest scanner Sentinel | Не источник локальной установки | Различать installed и owned |
| Owned games / DLC | SGI проверяет IsSubscribedApp по списку кандидатов, заданному GameWhitelistProvider. Подключение идёт к steamclient64 через Initialize(0). Исключение отдельной проверки пропускает кандидата. | SGI читает лицензии и PICS с проверкой полноты | Проверить известный удалённый из магазина и неустановленный AppID. Список кандидатов помечать partial, ошибку проверки помечать unknown. |
| Карточки | Presence под контролем helper | Отдельный эксперимент | Полный Community снимок и отдельная session capability |
| Schema/progress | Изолированный процесс на AppID | Отдельный authenticated read | Загружать лениво и проверить scope аккаунта, groups, ownership |
| Unlock | SGI local StoreStats bool без ожидания callback | SGI ждёт protocol reply и проверяет результат | Подтверждение upstream и readback, затем верификация stop/reconcile |

Локальная проверка подписки не перечисляет всю библиотеку. [SteamworksLocalBackend.cs:324–390](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/libs/SteamUtility/Backends/SteamworksLocalBackend.cs#L324-L390)

SGI распространяется под Elastic License 2.0 с copyright zevnda. В Sentinel проектируем собственный helper без исходников и бинарников SGI. Отдельно выбираем собственный client interop либо обёртку с подтверждённым правом распространения каждой DLL. У локальной связки SGI есть Steamworks.NET и steam_api64, поэтому отсутствие Valve DLL зависит от реализации. Notices независимых зависимостей сохраняются. [Лицензия SGI](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/LICENSE)
## 16. Текущий статус

- **Инспектировано:** существующая исследовательская заметка, tab/type/route/scanner/lifecycle anchors; выборочные файлы pinned SGI как описано в предыдущей заметке.
- **Проверено через первичные страницы:** Valve Web API ограничения; SteamKit2 QR sample; ASF performance docs; maintainer SGI статья и ссылка на issue SAM; Steam client card eligibility FAQ.
- **Не проверено:** запуск Sentinel/Steam, live auth, получение cookies, лицензии и происхождение зависимостей helper, local arbitrary-AppID helper capabilities, SteamKit2 production flows, achievement callback через SGI helper, любые операции аккаунта.
- **Изменено:** этот план и добавочное уточнение пути helper в предыдущей исследовательской заметке. Код приложения не изменялся.

Проверки реализации по этапам: Python-тесты нового модуля на синтетических страницах и подменённом IPC; контрактные проверки новых маршрутов с разрешённым/чужим Origin, токеном, account epoch и повтором request_id; C#-тесты lifecycle/callback; затем `npx tsc --noEmit`, `npm run build`, `node tools/check_i18n.mjs`, `dotnet build desktop/TwitchDropsSentinel.csproj`. В текущем package.json нет `npm test`; существующие Node regression tests расположены в `tools/engine_tests/*.test.mjs`. Новые тестовые файлы и команды фиксируются при первом этапе реализации, без обращения к аккаунту. В этой исследовательской работе эти проверки приложения не запускались.

Дополнительные источники авторизации: [Microsoft WebView2 security](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security), [GetCookiesAsync](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2cookiemanager.getcookiesasync), [Windows DPAPI](https://learn.microsoft.com/en-us/windows/win32/SecCrypto/example-c-program-using-cryptprotectdata). Историческая регрессия формата статистики: [обсуждение SGI №1498](https://github.com/zevnda/steam-game-idler/discussions/1498). Для неё нужны fixtures старой/новой/неизвестной схемы и обновление собственного кэша; автоматически удалять файлы Steam не требуется.

Инструментальная граница: Orbit использован для поиска вариантов Web API, но найденный publisher-write метод отклонён после сверки с Valve. Установленный Postman CLI не поддержал `postman status` (exit 1: unknown command); Postman workspace/коллекции не создавались, API-прогоны не выполнялись. Документ опирается на исходники и первичную документацию.

