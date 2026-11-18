import type { RewardCampaign } from '../types';

export const REWARDS_PAGE_URL: string;
export const REWARDS_OPEN_KEY: string;
export function rewardLink(campaign: Pick<RewardCampaign, 'url'> | null | undefined): string;
export function rewardGoalText(campaign: Pick<RewardCampaign, 'minutesGoal' | 'subsGoal'> | null | undefined): string;
export function rewardUntilText(endsAt: unknown, locale: string): string;
export function rewardInitials(name: unknown): string;
export function usableRewardCampaigns(list: unknown): RewardCampaign[];
