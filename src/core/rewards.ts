import { sortedPoints } from './engine';
import { stepKey, type Progress, type Quest, type Reward, type SkippedBy } from './types';

export interface RewardSlot extends Reward {
  pointId: string;
  stepId: string;
}

export interface CollectedReward extends RewardSlot {
  collectedAt: number;
  skippedBy?: SkippedBy;
}

/** Every reward of the quest in play order; their count is the "N" in «Ключи 2/N». */
export function questRewards(quest: Quest): RewardSlot[] {
  return sortedPoints(quest).flatMap((point) =>
    point.steps.filter((s) => s.reward).map((s) => ({ ...s.reward!, pointId: point.id, stepId: s.id })),
  );
}

/** Derived from step results, so host skips count and nothing extra has to be stored. */
export function collectedRewards(quest: Quest, progress: Progress): CollectedReward[] {
  return questRewards(quest).flatMap((slot) => {
    const result = progress.results[stepKey(slot.pointId, slot.stepId)];
    if (!result) return [];
    return [{ ...slot, collectedAt: result.completedAt, ...(result.skippedBy && { skippedBy: result.skippedBy }) }];
  });
}
