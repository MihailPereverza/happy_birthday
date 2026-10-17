import { expect, it } from 'vitest';
import { project } from '../src/progress/projection';

it('fits points into the box and keeps north up', () => {
  const pts = project(
    [
      { id: 'a', lat: 59.94, lon: 30.30 },
      { id: 'b', lat: 59.93, lon: 30.32 },
    ],
    300,
    300,
    20,
  );
  for (const p of pts) {
    expect(p.x).toBeGreaterThanOrEqual(20);
    expect(p.x).toBeLessThanOrEqual(280);
    expect(p.y).toBeGreaterThanOrEqual(20);
    expect(p.y).toBeLessThanOrEqual(280);
  }
  expect(pts[0].y).toBeLessThan(pts[1].y);
  expect(pts[0].x).toBeLessThan(pts[1].x);
});

it('handles a single point', () => {
  const [p] = project([{ lat: 1, lon: 2 }], 100, 100, 10);
  expect(p.x).toBe(50);
  expect(p.y).toBe(50);
});
