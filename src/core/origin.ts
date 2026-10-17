import type { GeoOrigin, Point, Quest } from './types';

const METERS_PER_DEG_LAT = 111_320;

export const usesRelativePoints = (quest: Quest): boolean => quest.points.some((p) => p.relative);

export function offsetFrom(origin: GeoOrigin, northM: number, eastM: number): { lat: number; lon: number } {
  const lat = origin.lat + northM / METERS_PER_DEG_LAT;
  const lon = origin.lon + eastM / (METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lon };
}

/** Returns a copy of the quest with `relative` points placed around `origin`; absolute points are untouched. */
export function resolveQuest(quest: Quest, origin: GeoOrigin | undefined): Quest {
  if (!usesRelativePoints(quest)) return quest;
  const base = origin ?? { lat: 0, lon: 0 };
  const points: Point[] = quest.points.map((p) =>
    p.relative ? { ...p, ...offsetFrom(base, p.relative.northM, p.relative.eastM) } : p,
  );
  return { ...quest, points };
}
