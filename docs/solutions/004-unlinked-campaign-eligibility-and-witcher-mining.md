# Решение 004: Устранение Блокировки Непривязанных Кампаний (Ведьмак 3) и Вечного Режима Ожидания

## Контекст и Проблема
Пользователь добавил *The Witcher 3: Wild Hunt* в ТОП-приоритет фарма. Несмотря на наличие трансляций на Twitch, Sentinel оставался в вечном «Режиме ожидания: поиск стримов для приоритетных игр» (`IDLE`), а в очереди отображалось ожидание.

## Диагностика и Первопричина
1. **Специфика кампаний Ведьмака 3 на Twitch:**
   - Из 20 стримеров в онлайне 19 транслируют платную кампанию подписок (`Wolf Medallion` за сабку).
   - Ровно 1 стример (`ken0bi_xd`) транслирует кампанию бесплатных дропсов за просмотр (*Remastered Release*: седельные сумки, шоры, седло).
2. **Блокировка `eligible` в ядре DevilXD (`core/inventory.py`):**
   ```python
   @property
   def eligible(self) -> bool:
       if self.has_badge_or_emote:
           return self._twitch.settings.enable_badges_emotes
       return self.linked
   ```
   Если внешний аккаунт разработчика игры (CDPR/GOG) ещё не привязан к профилю Twitch (`data["self"]["isAccountConnected"] == False`), свойство `eligible` возвращало `False`.
   Из-за этого `can_earn()` возвращал `False`, кампания не попадала в `wanted_games`, стример `ken0bi_xd` отбрасывался, а при `priority_mode=0` (PRIORITY_ONLY) движок сваливался в `State.IDLE`.
3. **Реальный контракт Twitch Drops:**
   Twitch позволяет любому авторизованному пользователю накапливать прогресс и клеймить предметы в инвентарь Twitch вне зависимости от текущего статуса привязки внешнего аккаунта игры (аккаунт можно привязать в любой момент позже для доставки предметов в клиент).

## Хирургическое Решение
1. **`core/inventory.py`**:
   - Обновлено свойство `DropsCampaign.eligible`: всегда возвращает `True`, разрешая накопление наград в инвентарь Twitch.
2. **`core/sentinel_service.py`**:
   - В `save_settings()` и `handle_post_settings()` настроен вызов `self.twitch_client.change_state(State.GAMES_UPDATE)` вместо `CHANNEL_SWITCH`, гарантируя моментальный пересчёт очереди `wanted_games` при изменении приоритетов.
   - Синхронизирован `priority_mode` в рантайме клиента Twitch.
3. **Фронтенд и Desktop:**
   - Пересобран `dist/` и опубликован самодостаточный бинарник `publish/TwitchDropsSentinel.exe`, скопирован в корень.

## Верификация
1. Движок автоматически определил стримера `ken0bi_xd` (Channel ID: 77411958).
2. В `/api/state` зафиксирован живой стримлесс-фарм:
   - `watching_channel: "ken0bi_xd"`
   - `active_drop.name: "Fire Horse saddlebags"` (*The Witcher 3: Wild Hunt*)
   - `progress_percent: 7%` (2 / 30 мин)
   - `status_text: "Watching: ken0bi_xd"`
   - Нагрузка на GPU: 0%.
