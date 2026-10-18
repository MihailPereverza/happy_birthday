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

it('exports audio files and collected rewards into points.json', async () => {
  const withKey: Quest = structuredClone(quest);
  withKey.points[0].steps[0].reward = { id: 'key1', title: 'Ключ 1', icon: '🔑' };
  withKey.points[1].steps[0].reward = { id: 'key2', title: 'Ключ 2' };
  const progress = { ...newProgress('demo'), results: { 'start/hello': { completedAt: 1_700_000_000_000, skippedBy: 'gesture' as const } } };
  const audio = [
    { id: 'x', packId: 'demo', pointId: 'left', stepId: 'rec', recordedAt: 1, durationSec: 3.24, mimeType: 'audio/webm;codecs=opus', blob: new Blob(['a']) },
  ];
  const zip = await JSZip.loadAsync(await (await exportZip(withKey, progress, [], audio)).arrayBuffer());

  expect(zip.file('audio/02_left_1.webm')).not.toBeNull();
  const manifest = JSON.parse(await zip.file('points.json')!.async('string'));
  expect(manifest.rewards).toMatchObject({ collected: 1, total: 2 });
  const [start, left] = manifest.points;
  expect(start.rewards).toEqual([{ id: 'key1', title: 'Ключ 1', icon: '🔑', stepId: 'hello', collectedAt: new Date(1_700_000_000_000).toISOString() }]);
  expect(left.rewards).toEqual([]);
  expect(left.audio).toEqual([{ file: 'audio/02_left_1.webm', stepId: 'rec', durationSec: 3.2 }]);
});
