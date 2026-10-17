import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { newProgress } from '../src/core/engine';
import type { Quest } from '../src/core/types';
import { resolveQuest } from '../src/core/origin';
import { exportZip } from '../src/photos/exportZip';
import type { PhotoRecord } from '../src/photos/repository';

const quest: Quest = resolveQuest(JSON.parse(readFileSync('content/demo/quest.json', 'utf8')), { lat: 59.939, lon: 30.3158 });

const photo = (id: string, pointId: string, isMain = false): PhotoRecord => ({
  id,
  packId: 'demo',
  pointId,
  stepId: 'photo',
  takenAt: 1_700_000_000_000,
  isMain,
  blob: new Blob([id], { type: 'image/jpeg' }),
});

it('exports all photos and points.json with geometry, order and results', async () => {
  const progress = {
    ...newProgress('demo'),
    results: { 'dip/balloons': { completedAt: 1, value: 17 } },
    pointStartedAt: { start: 0 },
    pointFinishedAt: { start: 30 * 60_000 },
  };
  const photos = [photo('a', 'start'), photo('b', 'start', true), photo('c', 'left')];
  const zip = await JSZip.loadAsync(await (await exportZip(quest, progress, photos)).arrayBuffer());

  expect(Object.keys(zip.files).filter((f) => f.startsWith('photos/')).sort()).toEqual([
    'photos/',
    'photos/01_start_1.jpg',
    'photos/01_start_2.jpg',
    'photos/02_left_1.jpg',
  ]);
  const manifest = JSON.parse(await zip.file('points.json')!.async('string'));
  const byId = (id: string) => manifest.points.find((p: { id: string }) => p.id === id);
  const [start, dip, right] = [byId('start'), byId('dip'), byId('right')];
  expect(start).toMatchObject({ id: 'start', lat: 59.939, lon: 30.3158, visitOrder: 1, outlineOrder: 1 });
  expect(start.mainPhoto).toBe('photos/01_start_2.jpg');
  expect(start.durationMin).toBe(30);
  expect(dip.results).toEqual({ balloons: 17 });
  expect(dip.lat).toBeGreaterThan(59.939);
  expect(right.mainPhoto).toBeNull();
});
