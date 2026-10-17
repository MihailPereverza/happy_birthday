import { useEffect, useState } from 'preact/hooks';
import { newProgress, QuestEngine } from '../core/engine';
import { initLog, logEvent } from '../core/log';
import {
  clearProgress,
  loadActivePack,
  loadPrefs,
  loadProgress,
  requestPersistentStorage,
  saveActivePack,
  saveProgress,
  savePrefs,
  type ActivePackRef,
  type Prefs,
} from '../core/store';
import { DEMO_PACK, loadPack, type LoadedPack } from '../content/loader';
import type { PackError } from '../content/validate';
import { listPhotos, onPhotosChanged, type PhotoRecord } from '../photos/repository';
import { knownStepTypes } from '../steps/registry';

export interface AppState {
  pack: LoadedPack;
  engine: QuestEngine;
  photos: PhotoRecord[];
  prefs: Prefs;
  /** Errors of the pack that failed at startup (the app then fell back to the demo pack). */
  bootErrors: PackError[] | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let state: AppState | null = null;
let unsubscribeEngine: (() => void) | null = null;

const notify = () => listeners.forEach((l) => l());

function setState(next: AppState): void {
  state = next;
  notify();
}

export const getApp = (): AppState => {
  if (!state) throw new Error('App is not booted');
  return state;
};

async function refreshPhotos(): Promise<void> {
  if (!state) return;
  setState({ ...state, photos: await listPhotos(state.pack.quest.id) });
}

async function activate(pack: LoadedPack, bootErrors: PackError[] | null, resetProgress: boolean): Promise<void> {
  const stored = resetProgress ? undefined : await loadProgress();
  const progress = stored?.packId === pack.quest.id ? stored : newProgress(pack.quest.id);
  const engine = new QuestEngine(pack.quest, progress, saveProgress);
  await saveProgress(engine.state);
  unsubscribeEngine?.();
  unsubscribeEngine = engine.subscribe(notify);
  const photos = await listPhotos(pack.quest.id);
  setState({ pack, engine, photos, prefs: state?.prefs ?? (await loadPrefs()), bootErrors });
}

export async function boot(): Promise<PackError[] | null> {
  await initLog();
  requestPersistentStorage().catch(() => undefined);
  onPhotosChanged(() => void refreshPhotos());
  const ref = (await loadActivePack()) ?? DEMO_PACK;
  const result = await loadPack(ref, knownStepTypes());
  if (result.ok) {
    await activate(result.pack, null, false);
    return null;
  }
  const demo = ref.id === DEMO_PACK.id && ref.source === DEMO_PACK.source ? result : await loadPack(DEMO_PACK, knownStepTypes());
  if (!demo.ok) return [...result.errors, ...demo.errors];
  await activate(demo.pack, result.errors, false);
  return null;
}

/** Switches the active pack; progress resets when the quest id differs (callers confirm with the host first). */
export async function switchPack(pack: LoadedPack): Promise<void> {
  const resetProgress = pack.quest.id !== state?.pack.quest.id;
  await saveActivePack(pack.ref);
  logEvent({ type: 'pack_loaded', detail: { ...pack.ref, questId: pack.quest.id } });
  await activate(pack, null, resetProgress);
}

export async function resetProgress(): Promise<void> {
  if (!state) return;
  await clearProgress();
  logEvent({ type: 'progress_reset' });
  await activate(state.pack, state.bootErrors, true);
}

export async function updatePrefs(patch: Prefs): Promise<void> {
  if (!state) return;
  const prefs = { ...state.prefs, ...patch };
  await savePrefs(prefs);
  setState({ ...state, prefs });
}

export const autoDownloadEnabled = (app: AppState): boolean =>
  app.prefs.autoDownload ?? app.pack.quest.settings.autoDownload ?? true;

export const activePackRef = (): ActivePackRef | undefined => state?.pack.ref;

export function useApp(): AppState {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return getApp();
}
