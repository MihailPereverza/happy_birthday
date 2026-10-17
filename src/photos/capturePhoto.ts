import { logEvent } from '../core/log';
import type { Point } from '../core/types';
import { currentPosition } from '../geo/watcher';
import { downloadBlob, photoFileName } from './download';
import { deletePhoto, savePhoto, setMainPhoto, type PhotoRecord } from './repository';

export interface StorePhotoInput {
  packId: string;
  point: Point;
  stepId: string;
  maskId?: string;
  blob: Blob;
  autoDownload: boolean;
  /** Retake from the gallery: the new photo replaces this one (and inherits "main"). */
  replaces?: PhotoRecord;
}

/** Saves to IndexedDB (source of truth) and drops a copy into Downloads so it shows up in the phone Gallery. */
export async function storePhoto(input: StorePhotoInput): Promise<PhotoRecord> {
  const takenAt = Date.now();
  // Download right away while the "Save" tap still counts as a user gesture for Chrome's download throttling.
  if (input.autoDownload) downloadBlob(input.blob, photoFileName(input.point.visitOrder, input.point.id, takenAt));
  const fix = await currentPosition(2000);
  const record = await savePhoto(
    {
      packId: input.packId,
      pointId: input.point.id,
      stepId: input.stepId,
      maskId: input.maskId,
      takenAt,
      lat: fix?.lat,
      lon: fix?.lon,
    },
    input.blob,
  );
  logEvent({ type: 'photo_saved', pointId: input.point.id, stepId: input.stepId, detail: { id: record.id } });
  if (input.replaces) {
    const wasMain = input.replaces.isMain;
    await deletePhoto(input.replaces.id);
    if (wasMain) await setMainPhoto(record.id);
  }
  return record;
}
