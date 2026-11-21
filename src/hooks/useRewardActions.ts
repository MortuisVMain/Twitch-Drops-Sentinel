import { useMemo } from 'react';
import type { RewardCardActions } from '../components/RewardCampaignCard';
import type { RewardCampaign, SentinelSettings } from '../types';
import { rewardQueueKey, toggleQueueEntry, withCategory, withHiddenId } from '../utils/rewardCampaigns.mjs';

interface RewardActionsInput {
  priorityList: string[];
  hiddenList: string[];
  categories: Record<string, string>;
  forcedGame?: string | null;
  onUpdateSettings: (changes: Partial<SentinelSettings>) => Promise<void> | void;
  onForceFarm?: (target: string) => void;
  onCancelForceFarm?: () => void;
  onReorderPriority?: (entry: string, direction: 'up' | 'down') => void;
  onShowToast?: (message: string) => void;
}

export type RewardActions = RewardCardActions & {
  restore: (campaign: RewardCampaign) => void;
  removeEntry: (entry: string) => void;
};

/** What the reward buttons do: every change goes through the settings the page already saves, farming through the force endpoint. */
export function useRewardActions(input: RewardActionsInput): RewardActions {
  const { priorityList, hiddenList, categories, forcedGame, onUpdateSettings, onForceFarm, onCancelForceFarm, onReorderPriority, onShowToast } = input;
  return useMemo(() => {
    const toast = (message: string) => onShowToast?.(message);
    return {
      toggleQueue: (c) => {
        const { list, queued } = toggleQueueEntry(priorityList, rewardQueueKey(c.id));
        void onUpdateSettings({ priority_games: list });
        toast(queued ? `"${c.name}" добавлена в очередь фарма` : `"${c.name}" удалена из приоритета`);
      },
      farm: (c) => onForceFarm?.(rewardQueueKey(c.id)),
      stop: () => onCancelForceFarm?.(),
      hide: (c) => {
        const key = rewardQueueKey(c.id);
        const changes: Partial<SentinelSettings> = { hidden_reward_campaigns: withHiddenId(hiddenList, c.id, true) };
        if (priorityList.includes(key)) changes.priority_games = priorityList.filter((entry) => entry !== key);
        if (forcedGame === key) onCancelForceFarm?.();
        void onUpdateSettings(changes);
        toast(`"${c.name}" скрыта с полки`);
      },
      restore: (c) => {
        void onUpdateSettings({ hidden_reward_campaigns: withHiddenId(hiddenList, c.id, false) });
        toast(`"${c.name}" восстановлена на полку`);
      },
      saveCategory: (c, name) => {
        void onUpdateSettings({ reward_campaign_categories: withCategory(categories, c.id, name) });
        toast(name ? `Категория для "${c.name}": ${name}` : `Категория для "${c.name}" сброшена`);
      },
      blocked: toast,
      reorder: (c, direction) => onReorderPriority?.(rewardQueueKey(c.id), direction),
      removeEntry: (entry) => {
        void onUpdateSettings({ priority_games: priorityList.filter((e) => e !== entry) });
        toast('Запись удалена из очереди');
      },
    };
  }, [priorityList, hiddenList, categories, forcedGame, onUpdateSettings, onForceFarm, onCancelForceFarm, onReorderPriority, onShowToast]);
}
