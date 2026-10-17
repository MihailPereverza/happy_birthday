import { describe, expect, it } from 'vitest';
import { facesFor } from '../src/camera/capture';
import { picksFromId, picksToId, togglePick, type Pick } from '../src/camera/selection';
import type { Mask } from '../src/core/types';

const masks: Mask[] = [
  { id: 'hat', src: 'hat.png', anchor: 'forehead', widthEyes: 2 },
  { id: 'rainbow', type: 'effect', effect: 'rainbow' },
  { id: 'swap', type: 'effect', effect: 'faceSwap' },
  { id: 'frame-a', type: 'frame', src: 'a.png' },
  { id: 'frame-b', type: 'frame', src: 'b.png' },
];
const m = (id: string) => masks.find((x) => x.id === id)!;
const tap = (picks: Pick[], id: string, target: Pick['target'] = 'all') => togglePick(picks, m(id), target, masks);

describe('togglePick', () => {
  it('stacks several masks and removes one on a second tap', () => {
    let picks = tap(tap(tap([], 'hat'), 'rainbow'), 'frame-a');
    expect(picks.map((p) => p.maskId)).toEqual(['hat', 'rainbow', 'frame-a']);
    picks = tap(picks, 'rainbow');
    expect(picks.map((p) => p.maskId)).toEqual(['hat', 'frame-a']);
  });

  it('gives different masks to different people', () => {
    const picks = tap(tap([], 'hat', 'left'), 'rainbow', 'right');
    expect(picks).toEqual([
      { maskId: 'hat', target: 'left' },
      { maskId: 'rainbow', target: 'right' },
    ]);
  });

  it('lets the same mask be on both people separately, and "all" replaces the per-person copies', () => {
    let picks = tap(tap([], 'hat', 'left'), 'hat', 'right');
    expect(picks).toHaveLength(2);
    picks = tap(picks, 'hat', 'all');
    expect(picks).toEqual([{ maskId: 'hat', target: 'all' }]);
    picks = tap(picks, 'hat', 'left');
    expect(picks).toEqual([{ maskId: 'hat', target: 'left' }]);
  });

  it('keeps one frame at a time and forces frames and face swap to everyone', () => {
    let picks = tap(tap([], 'frame-a', 'left'), 'frame-b', 'right');
    expect(picks).toEqual([{ maskId: 'frame-b', target: 'all' }]);
    picks = tap(picks, 'swap', 'left');
    expect(picks).toContainEqual({ maskId: 'swap', target: 'all' });
  });
});

it('round-trips the stored mask id', () => {
  const picks: Pick[] = [
    { maskId: 'hat', target: 'left' },
    { maskId: 'rainbow', target: 'all' },
  ];
  expect(picksToId(picks)).toBe('hat@left+rainbow');
  expect(picksFromId('hat@left+rainbow+gone', masks)).toEqual(picks);
  expect(picksToId([])).toBeUndefined();
});

it('maps targets to on-screen faces', () => {
  expect(facesFor(['L', 'R'], 'left')).toEqual(['L']);
  expect(facesFor(['L', 'R'], 'right')).toEqual(['R']);
  expect(facesFor(['only'], 'right')).toEqual([]);
  expect(facesFor(['L', 'R'], 'all')).toEqual(['L', 'R']);
});

it('crops a portrait camera frame to what a tall phone screen shows', async () => {
  const { coverCrop } = await import('../src/camera/capture');
  expect(coverCrop(1080, 1920, 412 / 915)).toEqual({ x: (1080 - 1920 * (412 / 915)) / 2, y: 0, w: 1920 * (412 / 915), h: 1920 });
  const wide = coverCrop(1920, 1080, 1);
  expect(wide).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
  expect(coverCrop(1080, 1920, 1080 / 1920)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
});

it('offers system-camera zoom stops within the track range', async () => {
  const { zoomStops, formatZoom } = await import('../src/camera/camera');
  expect(zoomStops({ min: 0.5, max: 8 })).toEqual([0.5, 1, 2, 5]);
  expect(zoomStops({ min: 1, max: 3 })).toEqual([1, 2]);
  expect(formatZoom(0.5)).toBe('0.5×');
  expect(formatZoom(2)).toBe('2×');
});
