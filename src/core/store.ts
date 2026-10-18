import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { Progress } from './types';
import type { LogEvent } from './log';

// One database per store: idb-keyval can only create a single object store per database.
const stateStore: UseStore = createStore('hq-state', 'kv');

const KEYS = { progress: 'progress', activePack: 'activePack', log: 'log' } as const;

export interface ActivePackRef {
  /** `repo` packs live in content/<id>/ on the site, `zip` packs were uploaded from the phone and stored in IndexedDB. */
  source: 'repo' | 'zip';
  id: string;
}

export const loadProgress = (): Promise<Progress | undefined> => get(KEYS.progress, stateStore);
export const saveProgress = (progress: Progress): Promise<void> => set(KEYS.progress, progress, stateStore);
export const clearProgress = (): Promise<void> => del(KEYS.progress, stateStore);

export const loadActivePack = (): Promise<ActivePackRef | undefined> => get(KEYS.activePack, stateStore);
export const saveActivePack = (ref: ActivePackRef): Promise<void> => set(KEYS.activePack, ref, stateStore);

export const loadLog = async (): Promise<LogEvent[]> => (await get(KEYS.log, stateStore)) ?? [];
export const saveLog = (events: LogEvent[]): Promise<void> => set(KEYS.log, events, stateStore);

/** Asks the browser not to evict our data under storage pressure; photos only live on the phone. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  const estimate = (await navigator.storage?.estimate?.()) ?? {};
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted };
}

export interface Prefs {
  autoDownload?: boolean;
  /** Rehearsal mode: geo steps get an «I'm there» button, so the whole route can be played without walking. */
  testMode?: boolean;
}

export const loadPrefs = async (): Promise<Prefs> => (await get<Prefs>('prefs', stateStore)) ?? {};
export const savePrefs = (prefs: Prefs): Promise<void> => set('prefs', prefs, stateStore);
