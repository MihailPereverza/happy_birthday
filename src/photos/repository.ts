import { createStore, del, get, set, values } from 'idb-keyval';

export interface PhotoMeta {
  id: string;
  packId: string;
  pointId: string;
  stepId: string;
  maskId?: string;
  takenAt: number;
  lat?: number;
  lon?: number;
  isMain?: boolean;
}

export interface PhotoRecord extends PhotoMeta {
  blob: Blob;
}

const photoStore = createStore('hq-photos', 'photos');
type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export function onPhotosChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function listPhotos(packId: string): Promise<PhotoRecord[]> {
  const all = await values<PhotoRecord>(photoStore);
  return all.filter((p) => p.packId === packId).sort((a, b) => a.takenAt - b.takenAt);
}

export async function savePhoto(meta: Omit<PhotoMeta, 'id' | 'isMain'>, blob: Blob): Promise<PhotoRecord> {
  const existing = await listPhotos(meta.packId);
  const hasMain = existing.some((p) => p.pointId === meta.pointId && p.isMain);
  const record: PhotoRecord = { ...meta, id: crypto.randomUUID(), isMain: !hasMain, blob };
  await set(record.id, record, photoStore);
  notify();
  return record;
}

export async function deletePhoto(id: string): Promise<void> {
  const photo = await get<PhotoRecord>(id, photoStore);
  await del(id, photoStore);
  if (photo?.isMain) {
    const next = (await listPhotos(photo.packId)).find((p) => p.pointId === photo.pointId);
    if (next) await set(next.id, { ...next, isMain: true }, photoStore);
  }
  notify();
}

export async function setMainPhoto(id: string): Promise<void> {
  const photo = await get<PhotoRecord>(id, photoStore);
  if (!photo) return;
  for (const p of await listPhotos(photo.packId)) {
    if (p.pointId === photo.pointId && p.isMain !== (p.id === id)) {
      await set(p.id, { ...p, isMain: p.id === id }, photoStore);
    }
  }
  notify();
}

export function mainPhotoByPoint(photos: PhotoRecord[]): Map<string, PhotoRecord> {
  const result = new Map<string, PhotoRecord>();
  for (const p of photos) {
    if (p.isMain || !result.has(p.pointId)) result.set(p.pointId, p);
  }
  return result;
}

export async function deleteAllPhotos(packId: string): Promise<void> {
  for (const p of await listPhotos(packId)) await del(p.id, photoStore);
  notify();
}
