import { collectedRewards, questRewards } from '../../core/rewards';
import type { Progress, Quest } from '../../core/types';
import { t } from '../strings.ru';

/** «🔑🔑🔑 Ключи 2/3» with the missing ones dimmed; renders nothing for a quest without rewards. */
export function RewardStrip(props: { quest: Quest; progress: Progress; variant: 'header' | 'card' }) {
  const slots = questRewards(props.quest);
  if (!slots.length) return null;
  const got = new Set(collectedRewards(props.quest, props.progress).map((r) => `${r.pointId}/${r.stepId}`));
  const label = `${props.variant === 'card' ? `${t.rewards.label} ` : ''}${t.rewards.count(got.size, slots.length)}`;
  return (
    <div class={`rewards rewards-${props.variant}`} aria-label={`${t.rewards.label} ${got.size}/${slots.length}`}>
      <span class="reward-icons" aria-hidden>
        {slots.map((s) => (
          <span key={`${s.pointId}/${s.stepId}`} class={got.has(`${s.pointId}/${s.stepId}`) ? 'reward got' : 'reward'} title={s.title}>
            {s.icon ?? t.rewards.defaultIcon}
          </span>
        ))}
      </span>
      <span class="reward-count">{label}</span>
    </div>
  );
}
