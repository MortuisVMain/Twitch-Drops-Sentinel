# 053. Кампания видна в каталоге, но не фармится (Albion Online)

**Симптом.** Герой дашборда: «Кампании есть (Albion Online), ждём стримеров», а движок пишет «Ни одна игра из очереди не имеет доступных кампаний». В `/api/state` у Albion нет `total_drops`, `claimed_drops`, `progress_percent`.

**Причина.** Кампания Albion «Dragonfire 9 - #7/7» не попадала в инвентарь движка. При обогащении инвентаря (`fetch_inventory` и `discover_campaigns_for_game` в `core/twitch.py`) кампания пропускалась как «уже завершена в Trophies.md»: проверка искала в журнале строку с игрой и названием дропа, не глядя на кампанию. Названия дропов повторяются из шага в шаг («Dragonfire Chest», «Noble Community Chest» были и в #6/7), поэтому награды шага #6/7 «закрывали» шаг #7/7. Лог: `Campaign 'Dragonfire 9 - #7/7' ... is already completed in Trophies.md. Skipping.`

**Исправление.** `core/utils.trophies_show_completed` требует, чтобы на той же строке журнала была и кампания; обе проверки используют её. Гейт: `test_new_campaign_step_is_not_hidden_by_the_previous_steps_trophies`.

**Два источника правды.** Каталог (публичный API) и инвентарь движка расходились, а интерфейс верил каталогу. Теперь `/api/state` отдаёт у каждой игры вердикт движка: `farmable` и `not_farmable_reason` (`core/utils.campaign_farmability` — тот же `can_earn_within`, что решает `wanted_games`; для игры из каталога без кампании в инвентаре: «кампании нет в инвентаре Twitch»). `getCampaignState` считает такую кампанию `none`, а герой пишет «<игра>: дропы недоступны — <причина>». «Кампании есть» остаётся только когда вердикта нет или он положительный. Гейт: `test_listed_but_unfarmable_campaign_never_reads_as_available`.

**Урок.** Любое сравнение «получено» по журналу должно включать идентификатор кампании, а не только имя награды; интерфейс не должен выводить доступность сам, если движок её знает.
