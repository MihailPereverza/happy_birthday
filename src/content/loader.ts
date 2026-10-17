import JSZip from 'jszip';
import { createStore, del, get, keys, set } from 'idb-keyval';
import type { ActivePackRef } from '../core/store';
import type { Quest } from '../core/types';
import { validateQuest, type PackError } from './validate';

export interface LoadedPack {
  ref: ActivePackRef;
  quest: Quest;
  /** Turns a pack-relative path (`assets/masks/hat.png`) into a URL usable in <img> or fetch. */
  asset: (path: string | undefined) => string | undefined;
}

export type PackLoadResult = { ok: true; pack: LoadedPack } | { ok: false; errors: PackError[] };

interface StoredZipPack {
  quest: unknown;
  assets: Record<string, Blob>;
}

export interface RepoPackInfo {
  id: string;
  title: string;
}

export const DEMO_PACK: ActivePackRef = { source: 'repo', id: 'demo' };

const zipStore = createStore('hq-packs', 'zip');
const BASE = import.meta.env.BASE_URL;
const objectUrls: string[] = [];

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4',
};

const failure = (message: string, path = 'пакет'): PackLoadResult => ({ ok: false, errors: [{ path, message }] });

export async function listRepoPacks(): Promise<RepoPackInfo[]> {
  const res = await fetch(`${BASE}content/index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`content/index.json: HTTP ${res.status}`);
  return ((await res.json()) as { packs: RepoPackInfo[] }).packs;
}

export async function listZipPacks(): Promise<string[]> {
  return (await keys(zipStore)).map(String);
}

export const deleteZipPack = (id: string): Promise<void> => del(id, zipStore);

async function loadRepoPack(id: string, stepTypes: readonly string[]): Promise<PackLoadResult> {
  const root = `${BASE}content/${id}/`;
  let data: unknown;
  try {
    const res = await fetch(`${root}quest.json`);
    if (!res.ok) return failure(`quest.json не загрузился: HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    return failure(`quest.json не читается: ${String(e)}`);
  }
  const result = validateQuest(data, stepTypes);
  if (!result.ok) return result;
  const asset = (path: string | undefined) => (path ? new URL(path, new URL(root, location.href)).href : undefined);
  return { ok: true, pack: { ref: { source: 'repo', id }, quest: result.quest, asset } };
}

function zipPackFromStored(id: string, stored: StoredZipPack, stepTypes: readonly string[]): PackLoadResult {
  const result = validateQuest(stored.quest, stepTypes);
  if (!result.ok) return result;
  objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  const urls = new Map<string, string>();
  for (const [path, blob] of Object.entries(stored.assets)) {
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    urls.set(path, url);
  }
  const asset = (path: string | undefined) => (path ? urls.get(path.replace(/^\.\//, '')) ?? path : undefined);
  return { ok: true, pack: { ref: { source: 'zip', id }, quest: result.quest, asset } };
}

export async function loadPack(ref: ActivePackRef, stepTypes: readonly string[]): Promise<PackLoadResult> {
  if (ref.source === 'repo') return loadRepoPack(ref.id, stepTypes);
  const stored = await get<StoredZipPack>(ref.id, zipStore);
  return stored ? zipPackFromStored(ref.id, stored, stepTypes) : failure(`ZIP-пакет «${ref.id}» не найден на телефоне`);
}

function referencedAssets(quest: Quest): string[] {
  const fromSteps = quest.points.flatMap((p) => p.steps.flatMap((s) => [s.image, s.audio]));
  return [...quest.masks.map((m) => m.src), ...fromSteps, quest.final.image].filter(
    (p): p is string => typeof p === 'string' && !/^(https?:|data:)/.test(p),
  );
}

/** Reads quest.json + assets/ from a ZIP picked on the phone, validates it and stores it for offline use. */
export async function importZipPack(file: Blob, stepTypes: readonly string[]): Promise<PackLoadResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    return failure(`не удалось открыть ZIP: ${String(e)}`);
  }
  const questEntry = Object.values(zip.files)
    .filter((f) => !f.dir && /(^|\/)quest\.json$/.test(f.name))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (!questEntry) return failure('в архиве нет quest.json');
  const root = questEntry.name.slice(0, -'quest.json'.length);
  let quest: unknown;
  try {
    quest = JSON.parse(await questEntry.async('string'));
  } catch (e) {
    return failure(`quest.json: неверный JSON — ${String(e)}`);
  }
  const validation = validateQuest(quest, stepTypes);
  if (!validation.ok) return validation;

  const assets: Record<string, Blob> = {};
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith(root) || entry === questEntry) continue;
    const type = MIME_BY_EXT[entry.name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
    assets[entry.name.slice(root.length)] = new Blob([await entry.async('arraybuffer')], { type });
  }
  const missing = referencedAssets(validation.quest).filter((p) => !assets[p.replace(/^\.\//, '')]);
  if (missing.length) return { ok: false, errors: missing.map((p) => ({ path: p, message: 'файла нет в архиве' })) };

  const id = validation.quest.id;
  await set(id, { quest, assets } satisfies StoredZipPack, zipStore);
  return zipPackFromStored(id, { quest, assets }, stepTypes);
}
