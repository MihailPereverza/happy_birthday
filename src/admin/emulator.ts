import { getEmulatedPosition, setEmulatedPosition } from '../geo/watcher';
import type { Point } from '../core/types';

/** Host test mode: pretend the phone stands exactly at a quest point. */
export const emulateAtPoint = (point: Point | null): void =>
  setEmulatedPosition(point ? { lat: point.lat, lon: point.lon } : null);

export function emulatedPointId(points: Point[]): string | null {
  const pos = getEmulatedPosition();
  return points.find((p) => pos && p.lat === pos.lat && p.lon === pos.lon)?.id ?? null;
}
