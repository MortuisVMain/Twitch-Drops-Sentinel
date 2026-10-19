from __future__ import annotations

import re
import math
import logging
from enum import Enum
from itertools import chain
from typing import TYPE_CHECKING
from functools import cached_property
from datetime import datetime, timedelta, timezone
from pathlib import Path

from translate import _
from channel import Channel
from utils import timestamp, Game
from exceptions import GQLException
from constants import GQL_QUERIES, MAX_EXTRA_MINUTES, URLType, State

if TYPE_CHECKING:
    from collections import abc

    from twitch import Twitch
    from constants import JsonType


logger = logging.getLogger("TwitchDrops")
DIMS_PATTERN = re.compile(r'-\d+x\d+(?=\.(?:jpg|png|gif)$)', re.I)


def remove_dimensions(url: URLType) -> URLType:
    return URLType(DIMS_PATTERN.sub('', url))


class BenefitType(Enum):
    UNKNOWN = "UNKNOWN"
    BADGE = "BADGE"
    EMOTE = "EMOTE"
    DIRECT_ENTITLEMENT = "DIRECT_ENTITLEMENT"

    def is_badge_or_emote(self) -> bool:
        return self in (BenefitType.BADGE, BenefitType.EMOTE)


class Benefit:
    __slots__ = ("id", "name", "type", "image_url")

    def __init__(self, data: JsonType):
        benefit_data: JsonType = data.get("benefit", {}) if isinstance(data, dict) else {}
        self.id: str = benefit_data.get("id", "")
        self.name: str = benefit_data.get("name", "")
        dist_type = benefit_data.get("distributionType", "")
        self.type: BenefitType = (
            BenefitType(dist_type)
            if dist_type in BenefitType.__members__.keys()
            else BenefitType.UNKNOWN
        )
        self.image_url: URLType = benefit_data.get("imageAssetURL", "")


class TrophiesVault:
    _cached_mtime: float = 0.0
    _cached_lines: list[str] = []
    _path: Path | None = None

    @classmethod
    def get_lines(cls) -> list[str]:
        if cls._path is None or not cls._path.exists():
            p = Path(__file__).resolve().parent.parent / "Trophies.md"
            if not p.exists():
                p = Path(__file__).resolve().parent / "Trophies.md"
            cls._path = p

        if not cls._path.exists():
            return []

        try:
            mtime = cls._path.stat().st_mtime
            if mtime != cls._cached_mtime:
                cls._cached_mtime = mtime
                with open(cls._path, "r", encoding="utf-8") as f:
                    cls._cached_lines = [line.lower() for line in f if "забран" in line.lower()]
            return cls._cached_lines
        except Exception as err:
            logger.debug("TrophiesVault read error: %s", err)
            return cls._cached_lines

    @classmethod
    def is_trophy_claimed(cls, game_name: str, drop_name: str, rewards_text: str) -> bool:
        lines = cls.get_lines()
        if not lines:
            return False
        game_lower = game_name.lower()
        drop_lower = drop_name.lower()
        rew_lower = rewards_text.lower() if rewards_text else ""
        for line_lower in lines:
            if game_lower in line_lower:
                if drop_lower in line_lower or (rew_lower and rew_lower in line_lower):
                    return True
        return False


class BaseDrop:
    def __init__(
        self, campaign: DropsCampaign, data: JsonType, claimed_benefits: dict[str, datetime]
    ):
        self._twitch: Twitch = campaign._twitch
        self.id: str = data.get("id", "")
        self.name: str = data.get("name", "")
        self.campaign: DropsCampaign = campaign
        edges = data.get("benefitEdges") or []
        self.benefits: list[Benefit] = [Benefit(b) for b in edges if isinstance(b, dict)]
        self.starts_at: datetime = timestamp(data.get("startAt") or "1970-01-01T00:00:00Z")
        self.ends_at: datetime = timestamp(data.get("endAt") or "2099-01-01T00:00:00Z")
        self.claim_id: str | None = None
        self.is_claimed: bool = False
        self_edge = data.get("self")
        if isinstance(self_edge, dict):
            self.claim_id = self_edge.get("dropInstanceID")
            self.is_claimed = bool(self_edge.get("isClaimed", False))
        elif (
            # If there's no self edge available, we can use claimed_benefits to determine
            # (with pretty good certainty) if this drop has been claimed or not.
            # To do this, we check if the benefitEdges appear in claimed_benefits, and then
            # deref their "lastAwardedAt" timestamps into a list to check against.
            # If the benefits were claimed while the drop was active,
            # the drop has been claimed too.
            (
                dts := [
                    claimed_benefits[bid]
                    for benefit in self.benefits
                    if (bid := benefit.id) in claimed_benefits
                ]
            )
            and all(self.starts_at <= dt < self.ends_at for dt in dts)
        ):
            self.is_claimed = True
        preconditions = data.get("preconditionDrops") or []
        self.precondition_drops: list[str] = [
            d.get("id", "") for d in preconditions if isinstance(d, dict) and d.get("id")
        ]

    def __repr__(self) -> str:
        if self.is_claimed:
            additional = ", claimed=True"
        elif self.can_earn():
            additional = ", can_earn=True"
        else:
            additional = ''
        return f"Drop({self.rewards_text()}{additional})"

    @property
    def preconditions_met(self) -> bool:
        campaign = self.campaign
        return all(campaign.timed_drops[pid].is_claimed for pid in self.precondition_drops)

    def _on_state_changed(self) -> None:
        raise NotImplementedError

    def _base_earn_conditions(self) -> bool:
        # define when a drop can be earned or not
        return (
            self.preconditions_met  # preconditions are met
            and not self.is_claimed  # isn't already claimed
            # has at least one benefit, or participates in a preconditions chain
            and (bool(self.benefits) or self.id in self.campaign.preconditions_chain())
        )

    def _base_can_earn(self) -> bool:
        # cross-participates in can_earn and can_earn_within handling, where a timeframe is added
        return (
            self._base_earn_conditions()
            # is within the timeframe
            and self.starts_at <= datetime.now(timezone.utc) < self.ends_at
        )

    def _can_earn_within(self, stamp: datetime) -> bool:
        # NOTE: This does not check the campaign's eligibility or active status
        return (
            self._base_earn_conditions()
            and self.ends_at > datetime.now(timezone.utc)
            and self.starts_at < stamp
        )

    def can_earn(
        self, channel: Channel | None = None, ignore_channel_status: bool = False
    ) -> bool:
        return (
            self._base_can_earn() and self.campaign._base_can_earn(channel, ignore_channel_status)
        )

    @property
    def can_claim(self) -> bool:
        # https://help.twitch.tv/s/article/mission-based-drops?language=en_US#claiming
        # "If you are unable to claim the Drop in time, you will be able to claim it
        # from the Drops Inventory page until 24 hours after the Drops campaign has ended."
        return (
            not self.is_claimed
            and (
                self.claim_id is not None
                or getattr(self, "current_minutes", 0) >= getattr(self, "required_minutes", 1)
            )
            and datetime.now(timezone.utc) < self.campaign.ends_at + timedelta(hours=24)
        )

    def update_claim(self, claim_id: str):
        self.claim_id = claim_id

    async def generate_claim(self) -> None:
        # claim IDs now appear to be constructed from other IDs we have access to
        # Format: UserID#CampaignID#DropID
        # NOTE: This marks a drop as a ready-to-claim, so we may want to later ensure
        # its mining progress is finished first
        auth_state = await self.campaign._twitch.get_auth()
        self.claim_id = f"{auth_state.user_id}#{self.campaign.id}#{self.id}"

    def rewards_text(self, delim: str = ", ") -> str:
        return delim.join(benefit.name for benefit in self.benefits)

    async def claim(self) -> bool:
        result = await self._claim()
        if result:
            self.is_claimed = result
            claim_text = (
                f"{self.campaign.game.name}\n"
                f"{self.rewards_text()} "
                f"({self.campaign.claimed_drops}/{self.campaign.total_drops})"
            )
            # two different claim texts, becase a new line after the game name
            # looks ugly in the output window - replace it with a space
            self._twitch.print(
                _("status", "claimed_drop").format(drop=claim_text.replace('\n', ' '))
            )
            self._twitch.gui.tray.notify(claim_text, _("gui", "tray", "notification_title"))

            # Sentinel Trophy Vault & Toast Hook
            try:
                from gui import send_toast_msg
                send_toast_msg("Twitch Drops Sentinel 🏆", f"Забран трофей: {self.rewards_text()} ({self.campaign.game.name})")
            except Exception:
                pass
            try:
                from pathlib import Path
                trophies_path = Path(__file__).resolve().parent.parent / "Trophies.md"
                if not trophies_path.exists():
                    trophies_path = Path(__file__).resolve().parent / "Trophies.md"
                now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                reward = self.rewards_text().replace("|", "/")
                game = self.campaign.game.name.replace("|", "/")
                camp = self.campaign.name.replace("|", "/")
                row = f"| {now_str} | **{game}** | {reward} | {camp} | ✅ Забран |\n"
                with open(trophies_path, "a", encoding="utf-8") as tf:
                    tf.write(row)
                if hasattr(self._twitch, "gui") and hasattr(self._twitch.gui, "trophies"):
                    self._twitch.gui._root.after(0, self._twitch.gui.trophies.load_trophies)
            except Exception as e:
                logger.error(f"Error recording trophy: {e}")
        else:
            logger.error(f"Drop claim has potentially failed! Drop ID: {self.id}")
        return result

    async def _claim(self) -> bool:
        """
        Returns True if the claim succeeded, False otherwise.
        """
        if self.is_claimed:
            return True
        if self.claim_id is None:
            try:
                await self.generate_claim()
            except Exception as e:
                logger.debug(f"Could not auto-generate claim_id for {self.id}: {e}")
        if not self.can_claim or not self.claim_id:
            return False
        # Priority 1: Twitch Android App Client-ID bypasses web integrity check
        try:
            auth_state = await self._twitch.get_auth()
            token = getattr(auth_state, "access_token", getattr(auth_state, "oauth_token", None))
            android_headers = {
                "Client-ID": "kd1unb4b3q4t58fwlpcbzcbnm76a8fp",
                "Authorization": f"OAuth {token}",
                "User-Agent": (
                    "Dalvik/2.1.0 (Linux; U; Android 14; SM-X306B Build/UP1A.231005.007) "
                    "tv.twitch.android.app/25.3.0/2503006"
                ),
            }
            op = GQL_QUERIES["ClaimDrop"].with_variables(
                {"input": {"dropInstanceID": self.claim_id}}
            )
            async with self._twitch.request(
                "POST", "https://gql.twitch.tv/gql", json=op, headers=android_headers
            ) as resp:
                data = await resp.json()
                if isinstance(data, dict) and "data" in data and data["data"] and "claimDropRewards" in data["data"]:
                    payload = data["data"]["claimDropRewards"]
                    if payload and payload.get("status") in ("ELIGIBLE_FOR_ALL", "DROP_INSTANCE_ALREADY_CLAIMED"):
                        return True
                    elif payload is None and not data.get("errors"):
                        return True
        except Exception as exc:
            logger.debug(f"Android client claim fallback for {self.id}: {exc}")

        try:
            response = await self._twitch.gql_request(
                GQL_QUERIES["ClaimDrop"].with_variables(
                    {"input": {"dropInstanceID": self.claim_id}}
                )
            )
        except GQLException as err:
            logger.warning("GraphQL error claiming drop %s: %s", self.id, err)
            return False
        data = response.get("data") or {}
        if "errors" in data and data["errors"]:
            return False
        elif "claimDropRewards" in data:
            claim_rewards = data.get("claimDropRewards")
            if not claim_rewards:
                # Twitch returned empty response (already claimed or unlinked)
                return True
            elif (
                isinstance(claim_rewards, dict) and
                claim_rewards.get("status") in ("ELIGIBLE_FOR_ALL", "DROP_INSTANCE_ALREADY_CLAIMED")
            ):
                return True
        return False


class TimedDrop(BaseDrop):
    def __init__(
        self, campaign: DropsCampaign, data: JsonType, claimed_benefits: dict[str, datetime]
    ):
        super().__init__(campaign, data, claimed_benefits)
        self_edge = data.get("self")
        self.real_current_minutes: int = (
            self_edge.get("currentMinutesWatched", 0) if isinstance(self_edge, dict) else 0
        )
        self.required_minutes: int = data.get("requiredMinutesWatched", 0)
        self.extra_current_minutes: int = 0
        if self.is_claimed:
            # claimed drops may report inconsistent current minutes, so we need to overwrite them
            self.real_current_minutes = self.required_minutes

    def __repr__(self) -> str:
        if self.is_claimed:
            additional = ", claimed=True"
        elif self.can_earn():
            additional = ", can_earn=True"
        else:
            additional = ''
        if 0 < self.current_minutes < self.required_minutes:
            minutes = f", {self.current_minutes}/{self.required_minutes}"
        else:
            minutes = ''
        return f"Drop({self.rewards_text()}{minutes}{additional})"

    @property
    def current_minutes(self) -> int:
        return self.real_current_minutes + self.extra_current_minutes

    @property
    def remaining_minutes(self) -> int:
        return self.required_minutes - self.current_minutes

    @property
    def total_required_minutes(self) -> int:
        return self.required_minutes + max(
            (
                self.campaign.timed_drops[pid].total_required_minutes
                for pid in self.precondition_drops
            ),
            default=0,
        )

    @property
    def total_remaining_minutes(self) -> int:
        return self.remaining_minutes + max(
            (
                self.campaign.timed_drops[pid].total_remaining_minutes
                for pid in self.precondition_drops
            ),
            default=0,
        )

    @property
    def progress(self) -> float:
        if self.current_minutes <= 0 or self.required_minutes <= 0:
            return 0.0
        elif self.current_minutes >= self.required_minutes:
            return 1.0
        return self.current_minutes / self.required_minutes

    @property
    def availability(self) -> float:
        now = datetime.now(timezone.utc)
        if self.required_minutes > 0 and self.total_remaining_minutes > 0 and now < self.ends_at:
            return ((self.ends_at - now).total_seconds() / 60) / self.total_remaining_minutes
        return math.inf

    def _base_earn_conditions(self) -> bool:
        return (
            super()._base_earn_conditions()
            and self.required_minutes > 0
            and self.current_minutes < self.required_minutes
            # NOTE: This may be a bad idea, as it invalidates the can_earn status
            # and provides no way to recover from this state until the next reload.
            and self.extra_current_minutes < MAX_EXTRA_MINUTES
        )

    def _on_state_changed(self) -> None:
        self._twitch.gui.inv.update_drop(self)

    def _update_real_minutes(self, delta: int) -> None:
        if delta == 0 or self.real_current_minutes + delta < 0:
            return
        if self.real_current_minutes + delta < self.required_minutes:
            self.real_current_minutes += delta
        else:
            self.real_current_minutes = self.required_minutes
        self.extra_current_minutes = 0
        self._on_state_changed()

    def _bump_minutes(self, channel: Channel | None) -> bool:
        if self.can_earn(channel):
            self.extra_current_minutes += 1
            self._on_state_changed()
            if self.extra_current_minutes >= MAX_EXTRA_MINUTES:
                return True
        return False

    async def claim(self) -> bool:
        result = await super().claim()
        if result:
            self.real_current_minutes = self.required_minutes
            self.extra_current_minutes = 0
        self._on_state_changed()
        return result

    def display(self, *, countdown: bool = True, subone: bool = False):
        self._twitch.gui.display_drop(self, countdown=countdown, subone=subone)

    def update_minutes(self, new_minutes: int):
        delta: int = new_minutes - self.real_current_minutes
        if delta == 0:
            return
        elif self.real_current_minutes + delta < 0:
            delta = -self.real_current_minutes
        elif self.real_current_minutes + delta > self.required_minutes:
            delta = self.required_minutes - self.real_current_minutes
        self.campaign._update_real_minutes(delta)


class DropsCampaign:
    def __init__(self, twitch: Twitch, data: JsonType, claimed_benefits: dict[str, datetime]):
        self._twitch: Twitch = twitch
        self.id: str = data.get("id", "")
        self.name: str = data.get("name", "")
        game_data = data.get("game") or {}
        self.game: Game = Game(game_data) if isinstance(game_data, dict) else Game({"id": "", "displayName": self.name})
        self_edge = data.get("self") or {}
        self.linked: bool = bool(self_edge.get("isAccountConnected", False)) if isinstance(self_edge, dict) else False
        self.link_url: str = data.get("accountLinkURL", "")
        # campaign's image actually comes from the game object
        box_art = game_data.get("boxArtURL", "") if isinstance(game_data, dict) else ""
        self.image_url: URLType = remove_dimensions(box_art) if box_art else URLType("")
        self.starts_at: datetime = timestamp(data.get("startAt") or "1970-01-01T00:00:00Z")
        self.ends_at: datetime = timestamp(data.get("endAt") or "2099-01-01T00:00:00Z")
        self._valid: bool = data.get("status") != "EXPIRED"
        allowed: JsonType = data.get("allow") or {}
        channels_list = allowed.get("channels") or []
        self.allowed_channels: list[Channel] = (
            [Channel.from_acl(twitch, channel_data) for channel_data in channels_list if isinstance(channel_data, dict)]
            if channels_list and allowed.get("isEnabled", True) else []
        )
        time_drops = data.get("timeBasedDrops") or []
        self.timed_drops: dict[str, TimedDrop] = {
            drop_data["id"]: TimedDrop(self, drop_data, claimed_benefits)
            for drop_data in time_drops if isinstance(drop_data, dict) and drop_data.get("id")
        }

    def __repr__(self) -> str:
        return f"Campaign({self.game!s}, {self.name}, {self.claimed_drops}/{self.total_drops})"

    @property
    def drops(self) -> abc.Iterable[TimedDrop]:
        return self.timed_drops.values()

    @property
    def time_triggers(self) -> set[datetime]:
        return set(
            chain(
                (self.starts_at, self.ends_at),
                *((d.starts_at, d.ends_at) for d in self.timed_drops.values()),
            )
        )

    @property
    def active(self) -> bool:
        return self._valid and self.starts_at <= datetime.now(timezone.utc) < self.ends_at

    @property
    def upcoming(self) -> bool:
        return self._valid and datetime.now(timezone.utc) < self.starts_at

    @property
    def expired(self) -> bool:
        return not self._valid or self.ends_at <= datetime.now(timezone.utc)

    @property
    def total_drops(self) -> int:
        return len(self.timed_drops)

    @property
    def eligible(self) -> bool:
        if self.has_badge_or_emote and not getattr(self._twitch.settings, "enable_badges_emotes", True):
            return False
        # Do not block drops on Twitch if third-party game account is not pre-linked yet.
        # Drops progress still accumulates in Twitch inventory and can be claimed on Twitch.
        if getattr(self._twitch.settings, "require_account_link", False):
            return self.linked
        return True

    @cached_property
    def has_badge_or_emote(self) -> bool:
        return any(
            benefit.type.is_badge_or_emote() for drop in self.drops for benefit in drop.benefits
        )

    @property
    def finished(self) -> bool:
        return all(d.is_claimed or d.required_minutes <= 0 for d in self.drops)

    @property
    def claimed_drops(self) -> int:
        return sum(d.is_claimed for d in self.drops)

    @property
    def remaining_drops(self) -> int:
        return sum(not d.is_claimed for d in self.drops)

    @property
    def required_minutes(self) -> int:
        return max(d.total_required_minutes for d in self.drops)

    @property
    def remaining_minutes(self) -> int:
        return max(d.total_remaining_minutes for d in self.drops)

    @property
    def progress(self) -> float:
        return sum(d.progress for d in self.drops) / self.total_drops

    @property
    def availability(self) -> float:
        return min(d.availability for d in self.drops)

    @property
    def first_drop(self) -> TimedDrop | None:
        drops: list[TimedDrop] = sorted(
            (drop for drop in self.drops if drop.can_earn()),
            key=lambda d: d.remaining_minutes,
        )
        return drops[0] if drops else None

    def _update_real_minutes(self, delta: int) -> None:
        for drop in self.drops:
            drop._update_real_minutes(delta)
        if (first_drop := self.first_drop) is not None:
            first_drop.display()

    def _base_can_earn(
        self, channel: Channel | None = None, ignore_channel_status: bool = False
    ) -> bool:
        return (
            self.eligible  # account is eligible
            and self.active  # campaign is active (and valid)
            and (
                channel is None or (  # channel isn't specified,
                    # or there's no ACL, or channel in ACL, or confirmed in AvailableDrops,
                    # or channel has drops enabled and ACL is a showcase ("в том числе", <= 10 channels)
                    (
                        not self.allowed_channels
                        or channel in self.allowed_channels
                        or self.id in getattr(channel, "available_campaign_ids", set())
                        or (getattr(channel, "drops_enabled", False) and len(self.allowed_channels) <= 10)
                    )
                    # and the channel is live and playing the campaign's game,
                    # or this campaign can be earned anywhere (special game)
                    and (
                        ignore_channel_status
                        or channel.game is not None and channel.game == self.game
                        or self.game.is_special()
                    )
                )
            )
        )

    def get_drop(self, drop_id: str) -> TimedDrop | None:
        return self.timed_drops.get(drop_id)

    def preconditions_chain(self) -> set[str]:
        return set(
            chain.from_iterable(
                drop.precondition_drops for drop in self.drops if not drop.is_claimed
            )
        )

    def can_earn(
        self, channel: Channel | None = None, ignore_channel_status: bool = False
    ) -> bool:
        # True if any of the containing drops can be earned
        return (
            self._base_can_earn(channel, ignore_channel_status)
            and any(drop._base_can_earn() for drop in self.drops)
        )

    def can_earn_within(self, stamp: datetime) -> bool:
        # Same as can_earn, but doesn't check the channel
        # and uses a future timestamp to see if we can earn this campaign later
        return (
            self.eligible
            and self._valid
            and self.ends_at > datetime.now(timezone.utc)
            and self.starts_at < stamp
            and any(drop._can_earn_within(stamp) for drop in self.drops)
        )

    def bump_minutes(self, channel: Channel) -> None:
        # NOTE: Use a temporary list to ensure all drops are bumped before checking
        if any([drop._bump_minutes(channel) for drop in self.drops]):
            # Executes if any drop's extra_current_minutes reach MAX_ESTIMATED_MINUTES
            # TODO: Figure out a better way to handle this case
            logger.warning(
                f"At least one of the drops in campaign \"{self.name}({self.game.name})\" "
                "has reached the maximum extra minutes limit!"
            )
            self._twitch.change_state(State.CHANNEL_SWITCH)
        if (first_drop := self.first_drop) is not None:
            first_drop.display()
