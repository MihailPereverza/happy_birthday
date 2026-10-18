import { stepKey, type GeoStep, type Point, type Progress } from '../core/types';

export interface GeoVisibility {
  showTarget: boolean;
  showRoute: boolean;
  /** Whole minutes until the route buttons appear; null when they never will or already are visible. */
  routeInMin: number | null;
}

/**
 * When the player reached this step: the previous step's completion, or the point start for the first step.
 * Derived from progress so a reload does not restart the `revealRouteAfterMin` countdown.
 */
export function stepStartedAt(progress: Progress, point: Point, stepIndex: number): number | undefined {
  const previous = point.steps[stepIndex - 1];
  const prevDone = previous && progress.results[stepKey(point.id, previous.id)]?.completedAt;
  return prevDone ?? progress.pointStartedAt[point.id];
}

export function geoVisibility(step: GeoStep, startedAt: number | undefined, now: number): GeoVisibility {
  if (!step.hideTarget) return { showTarget: true, showRoute: true, routeInMin: null };
  const after = step.revealRouteAfterMin;
  if (after === undefined) return { showTarget: false, showRoute: false, routeInMin: null };
  const leftMs = after * 60_000 - (now - (startedAt ?? now));
  return leftMs <= 0
    ? { showTarget: false, showRoute: true, routeInMin: null }
    : { showTarget: false, showRoute: false, routeInMin: Math.ceil(leftMs / 60_000) };
}

/** A point behind a location riddle keeps its name out of the map and gallery until the player has arrived. */
export function isPointSecret(point: Point, progress: Progress): boolean {
  const riddle = point.steps.find((s) => s.type === 'geo' && (s as GeoStep).hideTarget);
  return Boolean(riddle && !progress.results[stepKey(point.id, riddle.id)]);
}

export const pointLabel = (point: Point, progress: Progress, secretLabel: string): string =>
  isPointSecret(point, progress) ? secretLabel : point.name;
