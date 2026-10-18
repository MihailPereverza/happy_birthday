import { createStore, del, values, set } from 'idb-keyval';

export interface AudioRecord {
  id: string;
  packId: string;
  pointId: string;
  stepId: string;
  recordedAt: number;
  durationSec: number;
  mimeType: string;
  blob: Blob;
}

// Own database next to hq-photos: idb-keyval can only create one object store per database.
const audioStore = createStore('hq-audio', 'audio');
type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export function onAudioChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function listAudio(packId: string): Promise<AudioRecord[]> {
  const all = await values<AudioRecord>(audioStore);
  return all.filter((a) => a.packId === packId).sort((a, b) => a.recordedAt - b.recordedAt);
}

export async function saveAudio(meta: Omit<AudioRecord, 'id'>): Promise<AudioRecord> {
  const record: AudioRecord = { ...meta, id: crypto.randomUUID() };
  await set(record.id, record, audioStore);
  notify();
  return record;
}

export async function deleteAudio(id: string): Promise<void> {
  await del(id, audioStore);
  notify();
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/3gpp': '3gp',
  'audio/amr': 'amr',
};

/** `audio/webm;codecs=opus` → `webm`; unknown types keep the MediaRecorder default container. */
export const audioExtension = (mimeType: string): string => EXT_BY_MIME[mimeType.split(';')[0].trim().toLowerCase()] ?? 'webm';

export const DEFAULT_MIN_AUDIO_SECONDS = 2;

export const isLongEnough = (durationSec: number | null, minSeconds = DEFAULT_MIN_AUDIO_SECONDS): boolean =>
  durationSec !== null && Number.isFinite(durationSec) && durationSec >= minSeconds;
