import { expect, it } from 'vitest';
import { offsetFrom, resolveQuest } from '../src/core/origin';
import { distanceM } from '../src/geo/haversine';
import type { Quest } from '../src/core/types';

it('places a relative point at the right distance and direction', () => {
  const origin = { lat: 34.68, lon: 33.04 };
  const p = offsetFrom(origin, 100, 0);
  expect(distanceM(origin.lat, origin.lon, p.lat, p.lon)).toBeCloseTo(100, 0);
  const q = offsetFrom(origin, 0, -150);
  expect(q.lon).toBeLessThan(origin.lon);
  expect(distanceM(origin.lat, origin.lon, q.lat, q.lon)).toBeCloseTo(150, 0);
});

it('resolves only relative points and keeps absolute ones', () => {
  const quest = {
    points: [
      { id: 'a', relative: { northM: 0, eastM: 0 }, lat: 0, lon: 0 },
      { id: 'b', lat: 10, lon: 20 },
    ],
  } as unknown as Quest;
  const resolved = resolveQuest(quest, { lat: 34.68, lon: 33.04 });
  expect(resolved.points[0]).toMatchObject({ lat: 34.68, lon: 33.04 });
  expect(resolved.points[1]).toMatchObject({ lat: 10, lon: 20 });
});
