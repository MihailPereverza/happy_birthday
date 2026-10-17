import JSZip from 'jszip';
import { sortedPoints } from '../core/engine';
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
  results: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  durationMin: number | null;
}

const iso = (t: number | undefined): string | null => (t === undefined ? null : new Date(t).toISOString());

/** Builds the collage kit: photos/NN_<pointId>_<n>.jpg + points.json with geometry, order and step results. */
export function buildExport(quest: Quest, progress: Progress, photos: PhotoRecord[]) {
  const files: { name: string; blob: Blob }[] = [];
  const points: PointExport[] = sortedPoints(quest).map((point) => {
    const own = photos.filter((p) => p.pointId === point.id);
    const names = own.map((photo, i) => {
      const name = `photos/${pad2(point.visitOrder)}_${point.id}_${i + 1}.jpg`;
      files.push({ name, blob: photo.blob });
      return name;
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
      results,
      startedAt: iso(startedAt),
      finishedAt: iso(finishedAt),
      durationMin: startedAt !== undefined && finishedAt !== undefined ? Math.round((finishedAt - startedAt) / 60_000) : null,
    };
  });
  const manifest = { questId: quest.id, title: quest.title, exportedAt: new Date().toISOString(), points };
  return { files, manifest };
}

export async function exportZip(quest: Quest, progress: Progress, photos: PhotoRecord[]): Promise<Blob> {
  const { files, manifest } = buildExport(quest, progress, photos);
  const zip = new JSZip();
  // JPEGs are already compressed; STORE keeps the export fast on a phone.
  files.forEach((f) => zip.file(f.name, f.blob, { compression: 'STORE' }));
  zip.file('points.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
