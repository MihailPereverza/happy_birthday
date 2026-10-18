import JSZip from 'jszip';
import { audioExtension, type AudioRecord } from '../audio/repository';
import { sortedPoints } from '../core/engine';
import { collectedRewards, questRewards, type CollectedReward } from '../core/rewards';
import { stepKey, type Progress, type Quest } from '../core/types';
import type { PhotoRecord } from './repository';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface PointExport {
  id: string;
  name: string;
  lat: number;
  lon: number;
  visitOrder: number;
  outlineOrder: number;
  mainPhoto: string | null;
  photos: string[];
  audio: { file: string; stepId: string; durationSec: number }[];
  rewards: RewardExport[];
  results: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  durationMin: number | null;
}

export interface RewardExport {
  id: string;
  title: string;
  icon?: string;
  stepId: string;
  collectedAt: string;
}

const iso = (t: number | undefined): string | null => (t === undefined ? null : new Date(t).toISOString());

const rewardExport = (r: CollectedReward): RewardExport => ({
  id: r.id,
  title: r.title,
  ...(r.icon && { icon: r.icon }),
  stepId: r.stepId,
  collectedAt: iso(r.collectedAt)!,
});

/**
 * Builds the collage kit: photos/NN_<pointId>_<n>.jpg, audio/NN_<pointId>_<n>.<ext>
 * and points.json with geometry, order, step results and collected rewards.
 */
export function buildExport(quest: Quest, progress: Progress, photos: PhotoRecord[], audio: AudioRecord[] = []) {
  const files: { name: string; blob: Blob }[] = [];
  const rewards = collectedRewards(quest, progress);
  const points: PointExport[] = sortedPoints(quest).map((point) => {
    const own = photos.filter((p) => p.pointId === point.id);
    const names = own.map((photo, i) => {
      const name = `photos/${pad2(point.visitOrder)}_${point.id}_${i + 1}.jpg`;
      files.push({ name, blob: photo.blob });
      return name;
    });
    const audioFiles = audio
      .filter((a) => a.pointId === point.id)
      .map((a, i) => {
        const file = `audio/${pad2(point.visitOrder)}_${point.id}_${i + 1}.${audioExtension(a.mimeType)}`;
        files.push({ name: file, blob: a.blob });
        return { file, stepId: a.stepId, durationSec: Math.round(a.durationSec * 10) / 10 };
      });
    const mainIndex = own.findIndex((p) => p.isMain);
    const results = Object.fromEntries(
      point.steps
        .map((s) => [s.id, progress.results[stepKey(point.id, s.id)]] as const)
        .filter(([, r]) => r?.value !== undefined)
        .map(([id, r]) => [id, r!.value]),
    );
    const startedAt = progress.pointStartedAt[point.id];
    const finishedAt = progress.pointFinishedAt[point.id];
    return {
      id: point.id,
      name: point.name,
      lat: point.lat,
      lon: point.lon,
      visitOrder: point.visitOrder,
      outlineOrder: point.outlineOrder,
      mainPhoto: names[mainIndex >= 0 ? mainIndex : 0] ?? null,
      photos: names,
      audio: audioFiles,
      rewards: rewards.filter((r) => r.pointId === point.id).map(rewardExport),
      results,
      startedAt: iso(startedAt),
      finishedAt: iso(finishedAt),
      durationMin: startedAt !== undefined && finishedAt !== undefined ? Math.round((finishedAt - startedAt) / 60_000) : null,
    };
  });
  const manifest = {
    questId: quest.id,
    title: quest.title,
    exportedAt: new Date().toISOString(),
    rewards: { collected: rewards.length, total: questRewards(quest).length, items: rewards.map(rewardExport) },
    points,
  };
  return { files, manifest };
}

export async function exportZip(quest: Quest, progress: Progress, photos: PhotoRecord[], audio: AudioRecord[] = []): Promise<Blob> {
  const { files, manifest } = buildExport(quest, progress, photos, audio);
  const zip = new JSZip();
  // JPEGs and recorded audio are already compressed; STORE keeps the export fast on a phone.
  files.forEach((f) => zip.file(f.name, f.blob, { compression: 'STORE' }));
  zip.file('points.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
