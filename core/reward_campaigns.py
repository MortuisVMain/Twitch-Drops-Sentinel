"""Reward campaigns (quests and brand offers on the Twitch Drops page): the opt-in setting, the request variable and a
defensive parser. Shown only, never farmed.

The response shape is not verified against a live answer: every field is optional and nothing here raises on odd data.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("TwitchDrops.RewardCampaigns")

SETTING_KEY = "reward_campaigns_enabled"
RESPONSE_KEY = "rewardCampaignsAvailableToUser"
CAMPAIGN_LIMIT = 50
REWARDS_PER_CAMPAIGN_LIMIT = 20
NAME_LIMIT = 200
TEXT_LIMIT = 1000

_missing_key_noted = False


def _reset_missing_key_note() -> None:
    """Test hook: the "no reward campaigns in the response" note is logged once per process, this forgets it."""
    global _missing_key_noted
    _missing_key_noted = False


def dashboard_query(base: Any, enabled: bool) -> Any:
    """The dashboard request with `fetchRewardCampaigns` set for this call. `base` (a GQLPersistedQuery) is not changed."""
    return base.with_variables({"fetchRewardCampaigns": bool(enabled)})


def drop_invalid_setting(data: dict) -> None:
    """Removes a non-bool `reward_campaigns_enabled` from incoming settings (the stored value stays as it was)."""
    if SETTING_KEY in data and not isinstance(data[SETTING_KEY], bool):
        logger.warning("%s ignored: expected true or false, got %r", SETTING_KEY, data[SETTING_KEY])
        del data[SETTING_KEY]


def apply_setting(bridge: Any, settings: dict) -> None:
    """Makes the shared state follow the setting; turning it off clears the list at once."""
    enabled = settings.get(SETTING_KEY) is True
    bridge.reward_campaigns_enabled = enabled
    if not enabled:
        bridge.reward_campaigns = []


def state_list(bridge: Any, settings: dict) -> list[dict]:
    """What /api/state carries as `reward_campaigns`: empty while the setting is off."""
    if settings.get(SETTING_KEY) is not True:
        return []
    return list(bridge.reward_campaigns)[:CAMPAIGN_LIMIT]


def publish(bridge: Any, dashboard_json: Any, now: Optional[datetime] = None) -> None:
    """Parses a dashboard answer into the shared state, unless the setting was turned off while the request ran."""
    if not bridge.reward_campaigns_enabled:
        return
    bridge.reward_campaigns = parse_reward_campaigns(dashboard_json, now=now)
    logger.info("Reward campaigns: %d to show", len(bridge.reward_campaigns))


def _text(value: Any, limit: int = TEXT_LIMIT) -> Optional[str]:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:limit] if value else None


def _https(value: Any) -> Optional[str]:
    text = _text(value, 2000)
    return text if text and text.lower().startswith("https://") and len(text) > len("https://") else None


def _image(node: Any) -> Optional[str]:
    return _https(node.get("image1xURL")) if isinstance(node, dict) else None


def _goal(value: Any) -> Optional[int]:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _moment(value: Any) -> Optional[datetime]:
    text = _text(value, 64)
    if text is None:
        return None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _date_text(value: Any) -> Optional[str]:
    """The original text of a date we can read, otherwise None."""
    return _text(value, 64) if _moment(value) is not None else None


def _reward(raw: Any) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    name = _text(raw.get("name"), NAME_LIMIT)
    if name is None:
        return None
    return {
        "name": name,
        "image": _image(raw.get("thumbnailImage")) or _image(raw.get("bannerImage")),
        "earnableUntil": _date_text(raw.get("earnableUntil")),
    }


def _campaign(raw: Any, now: datetime) -> Optional[dict]:
    if not isinstance(raw, dict):
        logger.debug("reward campaign skipped: not an object (%s)", type(raw).__name__)
        return None
    campaign_id, name = _text(raw.get("id"), NAME_LIMIT), _text(raw.get("name"), NAME_LIMIT)
    if campaign_id is None or name is None:
        logger.debug("reward campaign skipped: no id or no name (id=%r, name=%r)", raw.get("id"), raw.get("name"))
        return None
    ends = _moment(raw.get("endsAt"))
    if ends is not None and ends <= now:
        logger.debug("reward campaign %s skipped: ended at %s", campaign_id, raw.get("endsAt"))
        return None
    game = raw.get("game")
    # Twitch puts the goals and rewards in rewardGroups[].unlockRequirements/rewards; the top-level fields are kept as a fallback
    groups = [g for g in raw.get("rewardGroups") or [] if isinstance(g, dict)] if isinstance(raw.get("rewardGroups"), list) else []
    unlocks = [u for u in [raw.get("unlockRequirement"), raw.get("unlockRequirements")] + [g.get("unlockRequirements") for g in groups] if isinstance(u, dict)]
    minutes = next((m for m in (_goal(u.get("minuteWatchedGoal")) for u in unlocks) if m), None)
    subs = next((s for s in (_goal(u.get("subsGoal")) for u in unlocks) if s), None)
    rewards = [r for g in groups if isinstance(g.get("rewards"), list) for r in g["rewards"]]
    if isinstance(raw.get("rewards"), list):
        seen = {r.get("id") for r in rewards if isinstance(r, dict)}
        rewards += [r for r in raw["rewards"] if not (isinstance(r, dict) and r.get("id") in seen and r.get("id"))]
    parsed_rewards = [r for r in map(_reward, rewards) if r]
    return {
        "id": campaign_id,
        "name": name,
        "brand": _text(raw.get("brand"), NAME_LIMIT),
        "startsAt": _date_text(raw.get("startsAt")),
        "endsAt": _date_text(raw.get("endsAt")),
        "summary": _text(raw.get("summary")),
        "instructions": _text(raw.get("instructions")),
        "url": _https(raw.get("externalURL")) or _https(raw.get("aboutURL")),
        "game": _text(game.get("displayName"), NAME_LIMIT) if isinstance(game, dict) else None,
        "image": _image(raw.get("image")),
        "rewards": parsed_rewards[:REWARDS_PER_CAMPAIGN_LIMIT],
        "minutesGoal": minutes,
        "subsGoal": subs,
    }


def parse_reward_campaigns(dashboard_json: Any, now: Optional[datetime] = None) -> list[dict]:
    """Reward campaigns of a ViewerDropsDashboard answer, trimmed to what the page shows; never raises."""
    global _missing_key_noted
    now = now or datetime.now(timezone.utc)
    data = dashboard_json.get("data") if isinstance(dashboard_json, dict) else None
    raw_list = data.get(RESPONSE_KEY) if isinstance(data, dict) else None
    if raw_list is None:
        if not _missing_key_noted:
            _missing_key_noted = True
            logger.info("The dashboard response carried no %s: no reward campaigns to show (if reward campaigns "
                        "are expected, the key name may differ)", RESPONSE_KEY)
        return []
    if not isinstance(raw_list, list):
        logger.debug("%s is not a list (%s): ignored", RESPONSE_KEY, type(raw_list).__name__)
        return []
    result = []
    for raw in raw_list:
        campaign = _campaign(raw, now)
        if campaign is not None:
            result.append(campaign)
        if len(result) >= CAMPAIGN_LIMIT:
            break
    return result
