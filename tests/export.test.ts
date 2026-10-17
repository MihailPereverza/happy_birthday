import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { newProgress } from '../src/core/engine';
import type { Quest } from '../src/core/types';
import { exportZip } from '../src/photos/exportZip';
import type { PhotoRecord } from '../src/photos/repository';

const quest: Quest = JSON.parse(readFileSync('content/demo/quest.json', 'utf8'));

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
    results: { 'isaac/steps': { completedAt: 1, value: 17 } },
    pointStartedAt: { palace: 0 },
    pointFinishedAt: { palace: 30 * 60_000 },
  };
  const photos = [photo('a', 'palace'), photo('b', 'palace', true), photo('c', 'isaac')];
  const zip = await JSZip.loadAsync(await (await exportZip(quest, progress, photos)).arrayBuffer());

  expect(Object.keys(zip.files).filter((f) => f.startsWith('photos/')).sort()).toEqual([
    'photos/',
    'photos/01_palace_1.jpg',
    'photos/01_palace_2.jpg',
    'photos/02_isaac_1.jpg',
  ]);
  const manifest = JSON.parse(await zip.file('points.json')!.async('string'));
  const [palace, isaac, kazan] = manifest.points;
  expect(palace).toMatchObject({ id: 'palace', lat: 59.939, lon: 30.3158, visitOrder: 1, outlineOrder: 1 });
  expect(palace.mainPhoto).toBe('photos/01_palace_2.jpg');
  expect(palace.durationMin).toBe(30);
  expect(isaac.results).toEqual({ steps: 17 });
  expect(kazan.mainPhoto).toBeNull();
});
