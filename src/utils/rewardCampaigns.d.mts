import type { RewardCampaign } from '../types';

export const REWARDS_PAGE_URL: string;
export const REWARDS_OPEN_KEY: string;
export function rewardLink(campaign: Pick<RewardCampaign, 'url'> | null | undefined): string;
export function rewardGoalText(campaign: Pick<RewardCampaign, 'minutesGoal' | 'subsGoal'> | null | undefined): string;
export function rewardUntilText(endsAt: unknown, locale: string): string;
export function rewardInitials(name: unknown): string;
export function usableRewardCampaigns(list: unknown): RewardCampaign[];

export const REWARD_QUEUE_PREFIX: string;
export const REWARD_GONE_TEXT: string;
export function rewardQueueKey(id: string): string;
export function isRewardQueueEntry(entry: unknown): boolean;
export function gameQueueEntries(list: unknown): string[];
export interface QueueItem {
  entry: string; // the priority_games entry
  index: number; // its position in priority_games (what the order arrows use)
  kind: 'game' | 'reward';
  name: string; // game name, campaign name, or the "ended" text
  campaign: RewardCampaign | null;
  gone: boolean; // a reward entry whose campaign no longer exists
}
export function queueItems(priorityList: unknown, campaigns: unknown, hiddenIds: Set<string> | null | undefined): QueueItem[];
export function toggleQueueEntry(list: unknown, entry: string): { list: string[]; queued: boolean };
export function rewardFarmAction(campaign: RewardCampaign | null | undefined, forcedGame: string | null | undefined): { mode: 'start' | 'stop' | 'blocked'; reason: string };
export interface RewardGroupLine {
  kind: 'watch' | 'subs' | 'other';
  text: string;
  muted: boolean;
  rewards: string[];
}
export function rewardGroupLines(campaign: RewardCampaign | null | undefined): RewardGroupLine[];
export function rewardTodayText(campaign: RewardCampaign | null | undefined): string;
export function rewardCategoryLine(campaign: RewardCampaign | null | undefined): string;
export function rewardTargetLine(campaign: RewardCampaign | null | undefined): string;
export function rewardProgressPercent(campaign: RewardCampaign | null | undefined): number;
export function sanitizeCategory(text: unknown): string;
export function withCategory(map: unknown, id: string, name: unknown): Record<string, string>;
export function withHiddenId(list: unknown, id: string, hidden: boolean): string[];
export function hiddenRewardIds(settingList: unknown, campaigns: unknown): Set<string>;
export function visibleRewardCampaigns(campaigns: unknown, hiddenIds: Set<string>): RewardCampaign[];
export function rewardMatchesQuery(campaign: RewardCampaign | null | undefined, query: string): boolean;
export function rewardQueueStatus(campaign: RewardCampaign | null | undefined): { kind: 'running' | 'done' | 'none'; label: string };
