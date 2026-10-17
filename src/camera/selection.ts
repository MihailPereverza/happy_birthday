import type { Mask } from '../core/types';
import type { Target } from './capture';
import { EFFECTS } from './effects/catalog';
import type { EffectId } from './effects/ids';
import { isEffectMask, isFrameMask } from './maskRenderer';

/** One chosen mask and who it is for. */
export interface Pick {
  maskId: string;
  target: Target;
}

/** Frames cover the whole shot and face swap needs both people, so they are always "for everyone". */
const alwaysForAll = (mask: Mask): boolean =>
  isFrameMask(mask) || (isEffectMask(mask) && (EFFECTS[mask.effect as EffectId]?.minFaces ?? 1) > 1);

/** Tap on a mask chip: adds it for `target`, or removes it if it is already on for that target. */
export function togglePick(picks: Pick[], mask: Mask, target: Target, masks: Mask[]): Pick[] {
  const effective: Target = alwaysForAll(mask) ? 'all' : target;
  const isOn = picks.some((p) => p.maskId === mask.id && p.target === effective);
  if (isOn) return picks.filter((p) => !(p.maskId === mask.id && p.target === effective));
  const frameIds = new Set(masks.filter(isFrameMask).map((m) => m.id));
  const kept = picks.filter((p) => {
    if (isFrameMask(mask) && frameIds.has(p.maskId)) return false;
    if (p.maskId !== mask.id) return true;
    // "For everyone" replaces per-person copies of the same mask and vice versa.
    return effective !== 'all' && p.target !== 'all';
  });
  return [...kept, { maskId: mask.id, target: effective }];
}

const TARGET_SUFFIX: Record<Exclude<Target, 'all'>, string> = { left: 'left', right: 'right' };

/** Stored in photo metadata: `hat+rainbow@left+frame-1`. */
export const picksToId = (picks: Pick[]): string | undefined =>
  picks.length ? picks.map((p) => (p.target === 'all' ? p.maskId : `${p.maskId}@${TARGET_SUFFIX[p.target]}`)).join('+') : undefined;

export function picksFromId(id: string | undefined, masks: Mask[]): Pick[] {
  if (!id) return [];
  return id
    .split('+')
    .map((part) => {
      const [maskId, target] = part.split('@');
      return { maskId, target: target === 'left' || target === 'right' ? target : 'all' } as Pick;
    })
    .filter((p) => masks.some((m) => m.id === p.maskId));
}
