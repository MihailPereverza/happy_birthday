import { matchesAnyHash } from '../core/hash';
import type { QuestSettings } from '../core/types';

export type MasterMatch = 'step' | 'point' | null;

/** `<master>` completes the current step, `<master>!` skips the whole point. Checked before the real answer. */
export async function checkMasterCode(raw: string, settings: QuestSettings): Promise<MasterMatch> {
  const trimmed = raw.trim();
  if (trimmed.endsWith('!') && (await matchesAnyHash(trimmed.slice(0, -1), [settings.masterCodeHash]))) return 'point';
  if (!trimmed.endsWith('!') && (await matchesAnyHash(trimmed, [settings.masterCodeHash]))) return 'step';
  return null;
}

/** Host PIN; the master code is accepted too so a forgotten PIN never locks the host out. */
export async function checkAdminPin(raw: string, settings: QuestSettings): Promise<boolean> {
  return matchesAnyHash(raw, [settings.adminPinHash, settings.masterCodeHash]);
}
