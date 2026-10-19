import { describe, expect, it } from 'vitest';
import { heartSlots, MAX_PHOTOS, spreadPick } from '../src/progress/heartLayout';

const overlaps = (slots: ReturnType<typeof heartSlots>) =>
  slots.some((a, i) => slots.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.5));

describe('heartSlots', () => {
  it.each([1, 3, 8, 12, 16, 20, 28, 40])('places %i photos without overlaps inside the box', (count) => {
    const slots = heartSlots(count, 400);
    expect(slots).toHaveLength(Math.min(count, MAX_PHOTOS));
    expect(overlaps(slots)).toBe(false);
    for (const s of slots) {
      expect(s.x - s.r).toBeGreaterThanOrEqual(0);
      expect(s.x + s.r).toBeLessThanOrEqual(400);
      expect(s.y - s.r).toBeGreaterThanOrEqual(0);
      expect(s.y + s.r).toBeLessThanOrEqual(400);
    }
  });

  it('starts at the dip between the lobes and keeps the tip at the bottom', () => {
    const slots = heartSlots(8, 400);
    expect(Math.abs(slots[0].x - 200)).toBeLessThan(1);
    const bottom = slots.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.abs(bottom.x - 200)).toBeLessThan(1);
  });
});

it('spreads a long photo list evenly and keeps the first and last', () => {
  const picked = spreadPick(Array.from({ length: 50 }, (_, i) => i));
  expect(picked).toHaveLength(MAX_PHOTOS);
  expect(picked[0]).toBe(0);
  expect(picked[picked.length - 1]).toBe(49);
  expect(spreadPick([1, 2, 3])).toEqual([1, 2, 3]);
});
